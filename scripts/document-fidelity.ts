import { mkdir } from "node:fs/promises"
import { basename, dirname, extname, relative, resolve } from "node:path"

import { normaliseDocxBytes } from "../packages/docx/src"
import type {
  SemanticBlock,
  SemanticDocument,
  SemanticInline,
} from "../packages/core/src"
import { chromium, type Browser, type Page } from "playwright"

import {
  decodePpm,
  encodePpm,
  type PdfGeometry,
  type PpmImage,
} from "./golden-docx-pdf"
import {
  compareRasterLayers,
  compareText,
  normalizeExtractedText,
  type EnhancedRasterComparison,
} from "./fidelity/analysis"

const DEFAULT_DPI = 96
const DEFAULT_PORT = 4182
const GOOGLE_FONTS_METADATA_URL = "https://fonts.google.com/metadata/fonts"
const OFFLINE_GOOGLE_FONTS_METADATA = JSON.stringify({
  familyMetadataList: [
    {
      family: "Inter",
      category: "Sans Serif",
      axes: [],
    },
  ],
})

export type FidelityCase = Readonly<{
  id: string
  docxPath: string
  referencePdfPath: string
  notes?: string
  tags?: readonly string[]
}>

export type FidelityManifest = Readonly<{
  schemaVersion: 1
  cases: readonly FidelityCase[]
}>

export type FidelityCliOptions = Readonly<{
  cases: readonly FidelityCase[]
  outputDirectory: string
  dpi: number
  threshold: number
  alignmentRadius: number
  editorUrl: string | null
  skipEditor: boolean
  serverPort: number
  pdftotextPath: string | null
}>

type ProcessResult = Readonly<{
  exitCode: number
  stdout: string
  stderr: string
}>

type ManagedServer = Readonly<{
  url: string
  process: Bun.Subprocess
  output: Promise<string>
}>

type EditorPageCapture = Readonly<{
  pageNumber: number
  pngPath: string
  ppmPath: string
  widthPixels: number
  heightPixels: number
  sectionIndex: number
}>

type EditorCapture = Readonly<{
  status: string | null
  timingMs: number
  runtimeErrors: readonly string[]
  runtimeWarnings: readonly string[]
  dom: Readonly<Record<string, unknown>>
  pages: readonly EditorPageCapture[]
  text: string
}>

type ComparisonArtifactSummary = Readonly<{
  exactMatch: boolean
  rawMetrics: EnhancedRasterComparison["metrics"]
  alignedMetrics: EnhancedRasterComparison["alignedMetrics"]
  referenceInk: EnhancedRasterComparison["referenceInk"]
  candidateInk: EnhancedRasterComparison["candidateInk"]
  translation: EnhancedRasterComparison["translation"]
  edges: EnhancedRasterComparison["edges"]
  projections: EnhancedRasterComparison["projections"]
  hotspots: EnhancedRasterComparison["hotspots"]
  artifacts: Readonly<Record<string, string>>
}>

class FidelityStageError extends Error {
  constructor(
    readonly stage: string,
    message: string,
    readonly details?: unknown
  ) {
    super(message)
    this.name = "FidelityStageError"
  }
}

export async function parseFidelityCliArgs(
  args: readonly string[]
): Promise<FidelityCliOptions> {
  const values = new Map<string, string>()
  let skipEditor = false
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (!argument) continue
    if (argument === "--skip-editor") {
      skipEditor = true
      continue
    }
    if (!argument.startsWith("--")) {
      throw new Error(
        `Unexpected positional argument '${argument}'\n${usage()}`
      )
    }
    const [rawKey, inlineValue] = argument.split("=", 2)
    const key = rawKey?.slice(2)
    if (!key) throw new Error(`Invalid option '${argument}'`)
    const value = inlineValue ?? args[index + 1]
    if (!value || value.startsWith("--")) {
      throw new Error(`Option --${key} requires a value`)
    }
    if (inlineValue === undefined) index += 1
    values.set(key, value)
  }

  const manifestPath = values.get("manifest")
  const docxPath = values.get("docx")
  const referencePdfPath = values.get("reference")
  if (manifestPath && (docxPath || referencePdfPath)) {
    throw new Error("Use either --manifest or --docx/--reference, not both")
  }
  let cases: readonly FidelityCase[]
  if (manifestPath) {
    cases = await loadFidelityManifest(resolve(manifestPath))
  } else {
    if (!docxPath || !referencePdfPath) throw new Error(usage())
    const absoluteDocx = resolve(docxPath)
    cases = Object.freeze([
      Object.freeze({
        id: sanitizeId(
          values.get("id") ?? basename(absoluteDocx, extname(absoluteDocx))
        ),
        docxPath: absoluteDocx,
        referencePdfPath: resolve(referencePdfPath),
      }),
    ])
  }

  const caseFilter = values.get("case")
  if (caseFilter) {
    const selected = new Set(
      caseFilter
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    )
    cases = cases.filter((entry) => selected.has(entry.id))
    if (cases.length === 0) {
      throw new Error(`No manifest cases matched --case ${caseFilter}`)
    }
  }

  return Object.freeze({
    cases,
    outputDirectory: resolve(
      values.get("out") ?? `/tmp/apex-docx-fidelity-${Date.now()}`
    ),
    dpi: positiveInteger(values.get("dpi") ?? String(DEFAULT_DPI), "dpi"),
    threshold: byteInteger(values.get("threshold") ?? "0", "threshold"),
    alignmentRadius: boundedInteger(
      values.get("alignment-radius") ?? "8",
      "alignment radius",
      0,
      64
    ),
    editorUrl: values.get("editor-url") ?? null,
    skipEditor,
    serverPort: positiveInteger(
      values.get("port") ?? String(DEFAULT_PORT),
      "port"
    ),
    pdftotextPath: values.get("pdftotext")
      ? resolve(values.get("pdftotext") as string)
      : null,
  })
}

export function parseFidelityManifest(
  text: string,
  manifestDirectory: string
): FidelityManifest {
  const value = JSON.parse(text) as {
    schemaVersion?: unknown
    cases?: unknown
  }
  if (value.schemaVersion !== 1 || !Array.isArray(value.cases)) {
    throw new Error(
      "Fidelity manifest must have schemaVersion 1 and a cases array"
    )
  }
  const seen = new Set<string>()
  const cases = value.cases.map((raw, index): FidelityCase => {
    if (!raw || typeof raw !== "object") {
      throw new Error(`Manifest case ${index + 1} must be an object`)
    }
    const candidate = raw as Record<string, unknown>
    const id = sanitizeId(String(candidate.id ?? ""))
    const docx = String(candidate.docx ?? "")
    const referencePdf = String(candidate.referencePdf ?? "")
    if (!id || !docx || !referencePdf) {
      throw new Error(
        `Manifest case ${index + 1} requires id, docx, and referencePdf`
      )
    }
    if (seen.has(id)) throw new Error(`Duplicate fidelity case id '${id}'`)
    seen.add(id)
    return Object.freeze({
      id,
      docxPath: resolve(manifestDirectory, docx),
      referencePdfPath: resolve(manifestDirectory, referencePdf),
      ...(typeof candidate.notes === "string"
        ? { notes: candidate.notes }
        : {}),
      ...(Array.isArray(candidate.tags)
        ? { tags: Object.freeze(candidate.tags.map(String)) }
        : {}),
    })
  })
  if (cases.length === 0) throw new Error("Fidelity manifest has no cases")
  return Object.freeze({ schemaVersion: 1, cases: Object.freeze(cases) })
}

export function usage(): string {
  return [
    "Usage:",
    "  bun scripts/document-fidelity.ts --manifest <cases.json> [options]",
    "  bun scripts/document-fidelity.ts --docx <source.docx> --reference <google.pdf> [options]",
    "",
    "Options:",
    "  --out <directory>          Artifact root (default: timestamped /tmp)",
    `  --dpi <integer>            PDF/editor comparison DPI (default: ${DEFAULT_DPI})`,
    "  --threshold <0-255>        Pixel tolerance for diagnostics (exact remains zero)",
    "  --alignment-radius <0-64>  Translation search radius (default: 8)",
    "  --editor-url <url>         Use an existing editor server",
    "  --skip-editor              Compare only engine PDF and reference PDF",
    `  --port <integer>           Isolated editor server port (default: ${DEFAULT_PORT})`,
    "  --pdftotext <path>         Optional Poppler pdftotext executable",
    "  --case <id,id>             Run selected manifest cases",
  ].join("\n")
}

async function main(): Promise<void> {
  let options: FidelityCliOptions
  try {
    options = await parseFidelityCliArgs(Bun.argv.slice(2))
  } catch (error) {
    console.error(errorMessage(error))
    process.exitCode = 64
    return
  }

  await mkdir(options.outputDirectory, { recursive: true })
  const reportPath = resolve(options.outputDirectory, "fidelity-report.json")
  const report: Record<string, unknown> = {
    schemaVersion: 1,
    status: "running",
    createdAt: new Date().toISOString(),
    options: {
      ...options,
      cases: options.cases.map((entry) => entry.id),
    },
    cases: [],
  }

  let server: ManagedServer | null = null
  let browser: Browser | null = null
  try {
    const magick = requireTool("magick")
    const pdftotext = await discoverPdfToText(options.pdftotextPath)
    let editorUrl: string | null = null
    if (!options.skipEditor) {
      if (options.editorUrl) editorUrl = options.editorUrl
      else {
        server = await startEditorServer(options.serverPort)
        editorUrl = server.url
      }
    }
    if (editorUrl) browser = await chromium.launch({ headless: true })
    report.tools = {
      bun: Bun.version,
      magick,
      pdftotext,
      editorUrl,
      chromium: browser !== null,
    }

    const caseReports: Record<string, unknown>[] = []
    for (const fidelityCase of options.cases) {
      caseReports.push(
        await runFidelityCase({
          fidelityCase,
          options,
          magick,
          pdftotext,
          editorUrl,
          browser,
        })
      )
    }
    report.cases = caseReports
    const exactMatch = caseReports.every((entry) => entry.exactMatch === true)
    report.exactMatch = exactMatch
    report.status = exactMatch ? "exact-match" : "different"
    report.completedAt = new Date().toISOString()
    await writeJson(reportPath, report)
    await writeHtmlReport(options.outputDirectory, report)
    await Bun.write(
      resolve(options.outputDirectory, "agent-review.md"),
      buildAgentReview(options.outputDirectory, caseReports)
    )
    console.log(
      JSON.stringify(
        {
          status: report.status,
          exactMatch,
          reportPath,
          htmlReport: resolve(options.outputDirectory, "fidelity-report.html"),
          cases: caseReports.map((entry) => ({
            id: entry.id,
            exactMatch: entry.exactMatch,
          })),
        },
        null,
        2
      )
    )
    if (!exactMatch) process.exitCode = 1
  } catch (error) {
    report.status = "blocked"
    report.blocker = serializeError(error)
    await writeJson(reportPath, report)
    console.error(JSON.stringify(report, null, 2))
    process.exitCode = 2
  } finally {
    await browser?.close()
    if (server) {
      server.process.kill()
      await server.process.exited
    }
  }
}

async function runFidelityCase(
  input: Readonly<{
    fidelityCase: FidelityCase
    options: FidelityCliOptions
    magick: string
    pdftotext: string | null
    editorUrl: string | null
    browser: Browser | null
  }>
): Promise<Record<string, unknown>> {
  const { fidelityCase } = input
  await validateCaseInputs(fidelityCase)
  const caseDirectory = resolve(
    input.options.outputDirectory,
    "cases",
    fidelityCase.id
  )
  const engineDirectory = resolve(caseDirectory, "engine")
  const analysisDirectory = resolve(caseDirectory, "analysis")
  await Promise.all([
    mkdir(engineDirectory, { recursive: true }),
    mkdir(analysisDirectory, { recursive: true }),
  ])
  const docxBytes = new Uint8Array(
    await Bun.file(fidelityCase.docxPath).arrayBuffer()
  )
  const semantic = inspectSemanticDocument(docxBytes)
  const engineReport = await runEngineGolden({
    fidelityCase,
    outputDirectory: engineDirectory,
    dpi: input.options.dpi,
    threshold: input.options.threshold,
  })
  const referenceGeometry = readReferenceGeometry(engineReport)
  const enginePages = await analyzeEnginePages({
    engineDirectory,
    analysisDirectory: resolve(analysisDirectory, "engine"),
    pageCount: referenceGeometry.pageCount,
    threshold: input.options.threshold,
    alignmentRadius: input.options.alignmentRadius,
    magick: input.magick,
  })

  let editor: EditorCapture | null = null
  let editorPages: readonly ComparisonArtifactSummary[] = []
  if (input.editorUrl && input.browser) {
    editor = await captureEditor({
      browser: input.browser,
      editorUrl: input.editorUrl,
      fidelityCase,
      outputDirectory: resolve(caseDirectory, "editor"),
      magick: input.magick,
    })
    editorPages = await analyzeEditorPages({
      captures: editor.pages,
      engineDirectory,
      analysisDirectory: resolve(analysisDirectory, "editor"),
      referencePageCount: referenceGeometry.pageCount,
      threshold: input.options.threshold,
      alignmentRadius: input.options.alignmentRadius,
      magick: input.magick,
    })
  }

  const generatedPdfPath = resolve(engineDirectory, "generated.pdf")
  const referenceText = input.pdftotext
    ? await extractPdfText(input.pdftotext, fidelityCase.referencePdfPath)
    : null
  const generatedText = input.pdftotext
    ? await extractPdfText(input.pdftotext, generatedPdfPath)
    : null
  const textEvidence = {
    semantic: compareText(referenceText ?? semantic.text, semantic.text),
    engine:
      referenceText !== null && generatedText !== null
        ? compareText(referenceText, generatedText)
        : null,
    editor:
      referenceText !== null && editor
        ? compareText(referenceText, editor.text)
        : editor
          ? compareText(semantic.text, editor.text)
          : null,
    paths: await writeTextEvidence(caseDirectory, {
      semantic: semantic.text,
      reference: referenceText,
      engine: generatedText,
      editor: editor?.text ?? null,
    }),
  }
  const engineExact = enginePages.every((page) => page.exactMatch)
  const editorExact =
    editor === null ||
    (editor.pages.length === referenceGeometry.pageCount &&
      editorPages.every((page) => page.exactMatch) &&
      editor.runtimeErrors.length === 0 &&
      editor.runtimeWarnings.length === 0)
  const exactMatch = engineExact && editorExact
  const contactSheet = await createContactSheet({
    caseDirectory,
    engineDirectory,
    editor,
    magick: input.magick,
  })

  return {
    id: fidelityCase.id,
    input: fidelityCase,
    exactMatch,
    semantic: {
      ...semantic,
      text: undefined,
    },
    engine: {
      status: engineReport.status,
      exactMatch: engineExact,
      reportPath: resolve(engineDirectory, "golden-report.json"),
      generatedPdfPath,
      pages: enginePages,
    },
    editor: editor
      ? {
          ...editor,
          text: undefined,
          exactMatch: editorExact,
          comparisons: editorPages,
        }
      : null,
    text: textEvidence,
    contactSheet,
  }
}

async function analyzeEnginePages(
  input: Readonly<{
    engineDirectory: string
    analysisDirectory: string
    pageCount: number
    threshold: number
    alignmentRadius: number
    magick: string
  }>
): Promise<readonly ComparisonArtifactSummary[]> {
  await mkdir(input.analysisDirectory, { recursive: true })
  const pages: ComparisonArtifactSummary[] = []
  for (let pageNumber = 1; pageNumber <= input.pageCount; pageNumber += 1) {
    const stem = pageStem(pageNumber)
    const candidate = await readPpm(
      resolve(input.engineDirectory, "generated", `${stem}.ppm`)
    )
    const reference = await readPpm(
      resolve(input.engineDirectory, "reference", `${stem}.ppm`)
    )
    pages.push(
      await writeComparisonArtifacts({
        comparison: compareRasterLayers(candidate, reference, {
          threshold: input.threshold,
          alignmentRadius: input.alignmentRadius,
        }),
        outputDirectory: input.analysisDirectory,
        stem,
        magick: input.magick,
      })
    )
  }
  return Object.freeze(pages)
}

async function analyzeEditorPages(
  input: Readonly<{
    captures: readonly EditorPageCapture[]
    engineDirectory: string
    analysisDirectory: string
    referencePageCount: number
    threshold: number
    alignmentRadius: number
    magick: string
  }>
): Promise<readonly ComparisonArtifactSummary[]> {
  await mkdir(input.analysisDirectory, { recursive: true })
  const pages: ComparisonArtifactSummary[] = []
  const count = Math.min(input.captures.length, input.referencePageCount)
  for (let index = 0; index < count; index += 1) {
    const capture = input.captures[index]
    if (!capture) continue
    const stem = pageStem(index + 1)
    const candidate = await readPpm(capture.ppmPath)
    const reference = await readPpm(
      resolve(input.engineDirectory, "reference", `${stem}.ppm`)
    )
    pages.push(
      await writeComparisonArtifacts({
        comparison: compareRasterLayers(candidate, reference, {
          threshold: input.threshold,
          alignmentRadius: input.alignmentRadius,
        }),
        outputDirectory: input.analysisDirectory,
        stem,
        magick: input.magick,
      })
    )
  }
  return Object.freeze(pages)
}

async function writeComparisonArtifacts(
  input: Readonly<{
    comparison: EnhancedRasterComparison
    outputDirectory: string
    stem: string
    magick: string
  }>
): Promise<ComparisonArtifactSummary> {
  const artifactImages = {
    heatmap: input.comparison.heatmap,
    overlay: input.comparison.overlay,
    alignedOverlay: input.comparison.alignedOverlay,
    hotspotGrid: input.comparison.hotspotGrid,
  }
  const artifacts: Record<string, string> = {}
  for (const [name, image] of Object.entries(artifactImages)) {
    const ppmPath = resolve(input.outputDirectory, `${input.stem}-${name}.ppm`)
    await Bun.write(ppmPath, encodePpm(image))
    const pngPath = await convertToPng(input.magick, ppmPath)
    artifacts[name] = pngPath
  }
  return Object.freeze({
    exactMatch: input.comparison.metrics.exactMatch,
    rawMetrics: input.comparison.metrics,
    alignedMetrics: input.comparison.alignedMetrics,
    referenceInk: input.comparison.referenceInk,
    candidateInk: input.comparison.candidateInk,
    translation: input.comparison.translation,
    edges: input.comparison.edges,
    projections: input.comparison.projections,
    hotspots: input.comparison.hotspots,
    artifacts: Object.freeze(artifacts),
  })
}

async function captureEditor(
  input: Readonly<{
    browser: Browser
    editorUrl: string
    fidelityCase: FidelityCase
    outputDirectory: string
    magick: string
  }>
): Promise<EditorCapture> {
  await mkdir(input.outputDirectory, { recursive: true })
  const context = await input.browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "reduce",
  })
  const page = await context.newPage()
  const runtimeErrors: string[] = []
  const runtimeWarnings: string[] = []
  await page.route(GOOGLE_FONTS_METADATA_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: OFFLINE_GOOGLE_FONTS_METADATA,
    })
  })
  page.on("pageerror", (error) => runtimeErrors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text())
    if (message.type() === "warning") {
      runtimeWarnings.push(message.text())
    }
  })
  page.on("requestfailed", (request) => {
    runtimeErrors.push(
      `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "failed"}`
    )
  })

  try {
    const response = await page.goto(input.editorUrl, { waitUntil: "load" })
    if (!response?.ok()) {
      throw new FidelityStageError(
        "editor-navigation",
        `Editor returned HTTP ${response?.status() ?? "unknown"}`
      )
    }
    await page.locator(".ProseMirror").waitFor({
      state: "visible",
      timeout: 30_000,
    })
    await page.getByRole("button", { name: "Undo" }).waitFor({
      state: "visible",
      timeout: 30_000,
    })
    const startedAt = performance.now()
    await page.getByRole("menuitem", { name: "File", exact: true }).click()
    const openItem = page.getByRole("menuitem", {
      name: /^Open(?: document|…)?$/u,
    })
    await openItem.waitFor({ state: "visible", timeout: 5_000 })
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      openItem.click(),
    ])
    await chooser.setFiles(input.fidelityCase.docxPath)
    await page
      .getByRole("status")
      .filter({ hasText: `Opened ${basename(input.fidelityCase.docxPath)}` })
      .waitFor({ state: "visible", timeout: 30_000 })
    await page.evaluate(async () => {
      await document.fonts.ready
      await Promise.all(
        [...document.images].map(async (image) => {
          if (image.complete) return
          try {
            await image.decode()
          } catch {
            // Runtime diagnostics capture an actual load failure separately.
          }
        })
      )
      ;(document.activeElement as HTMLElement | null)?.blur()
    })
    await page.waitForFunction(() => {
      const editor = document.querySelector<HTMLElement>(".ProseMirror")
      return (
        editor?.dataset.apexPaginationStatus === "ready" &&
        Number(editor.dataset.apexPageCount ?? 0) > 0
      )
    })
    await page.waitForTimeout(250)
    const timingMs = performance.now() - startedAt
    await page.addStyleTag({
      content: `
        html, body, main, .apex-editor-root, .apex-editor-chrome,
        .apex-editor-pages, .apex-editor-surface {
          height: auto !important;
          max-height: none !important;
          overflow: visible !important;
        }
        .apex-editor-pages { --apex-zoom: 1 !important; }
        .apex-editor-surface { transform: none !important; padding-bottom: 0 !important; }
        .ProseMirror { caret-color: transparent !important; }
        *, *::before, *::after {
          animation: none !important;
          transition: none !important;
          scroll-behavior: auto !important;
        }
      `,
    })
    await page.waitForTimeout(100)
    const dom = await collectEditorDom(page)
    const clips = await collectEditorPageClips(page)
    const captureCanvasHeight = requiredCaptureCanvasHeight(clips)
    await page.evaluate((height) => {
      const value = `${height}px`
      document.documentElement.style.minHeight = value
      document.body.style.minHeight = value
    }, captureCanvasHeight)
    const fullPagePath = resolve(input.outputDirectory, "full-page.png")
    await page.screenshot({ path: fullPagePath, fullPage: true })
    const captures: EditorPageCapture[] = []
    for (const clip of clips) {
      const stem = pageStem(clip.pageNumber)
      const pngPath = resolve(input.outputDirectory, `${stem}.png`)
      const ppmPath = resolve(input.outputDirectory, `${stem}.ppm`)
      await cropPng(input.magick, fullPagePath, pngPath, clip)
      await convertPngToPpm(input.magick, pngPath, ppmPath)
      const ppm = await readPpm(ppmPath)
      captures.push(
        Object.freeze({
          pageNumber: clip.pageNumber,
          pngPath,
          ppmPath,
          widthPixels: ppm.width,
          heightPixels: ppm.height,
          sectionIndex: clip.sectionIndex,
        })
      )
    }
    const status = await page.getByRole("status").textContent()
    const text = normalizeExtractedText(
      (await page.locator(".ProseMirror").textContent()) ?? ""
    )
    return Object.freeze({
      status: status?.trim() ?? null,
      timingMs,
      runtimeErrors: Object.freeze(runtimeErrors),
      runtimeWarnings: Object.freeze(runtimeWarnings.filter(isRelevantWarning)),
      dom,
      pages: Object.freeze(captures),
      text,
    })
  } finally {
    await context.close()
  }
}

export function requiredCaptureCanvasHeight(
  clips: ReadonlyArray<Readonly<{ y: number; height: number }>>
): number {
  return Math.max(1, ...clips.map((clip) => Math.ceil(clip.y + clip.height)))
}

export function integerPixelCrop(
  clip: Readonly<{ x: number; y: number; width: number; height: number }>
): Readonly<{ x: number; y: number; width: number; height: number }> {
  const x = Math.floor(clip.x)
  const y = Math.floor(clip.y)
  return Object.freeze({
    x,
    y,
    width: Math.max(1, Math.ceil(clip.x + clip.width) - x),
    height: Math.max(1, Math.ceil(clip.y + clip.height) - y),
  })
}

async function collectEditorDom(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const sections = [
      ...document.querySelectorAll<HTMLElement>(
        ".ProseMirror > section[data-section]"
      ),
    ]
    const editor = document.querySelector<HTMLElement>(".ProseMirror")
    return {
      paginationStatus: editor?.dataset.apexPaginationStatus ?? null,
      layoutPageCount: Number(editor?.dataset.apexPageCount ?? 0),
      layoutBreakCount: Number(editor?.dataset.apexPageBreakCount ?? 0),
      spacerPageNumbers: [
        ...document.querySelectorAll<HTMLElement>(".apex-page-break-spacer"),
      ].map((spacer) => Number(spacer.dataset.pageNumber ?? 0)),
      sections: sections.map((section, index) => {
        const rect = section.getBoundingClientRect()
        return {
          index,
          widthPixels: rect.width,
          heightPixels: rect.height,
          minimumHeightPixels: Number.parseFloat(
            getComputedStyle(section).minHeight
          ),
          pageBreaks: section.querySelectorAll(".apex-page-break-spacer__gap")
            .length,
        }
      }),
      tables: document.querySelectorAll(".ProseMirror table").length,
      rows: document.querySelectorAll(".ProseMirror tr").length,
      cells: document.querySelectorAll(".ProseMirror td, .ProseMirror th")
        .length,
      images: document.querySelectorAll(".ProseMirror img").length,
      paragraphs: document.querySelectorAll(".ProseMirror p").length,
      pageBreakSpacers: document.querySelectorAll(".apex-page-break-spacer")
        .length,
    }
  })
}

async function collectEditorPageClips(page: Page): Promise<
  readonly Readonly<{
    pageNumber: number
    sectionIndex: number
    x: number
    y: number
    width: number
    height: number
  }>[]
> {
  return page.evaluate(() => {
    const clips: Array<{
      pageNumber: number
      sectionIndex: number
      x: number
      y: number
      width: number
      height: number
    }> = []
    const sections = [
      ...document.querySelectorAll<HTMLElement>(
        ".ProseMirror > section[data-section]"
      ),
    ]
    for (const [sectionIndex, section] of sections.entries()) {
      const rect = section.getBoundingClientRect()
      const pageHeight = Number.parseFloat(getComputedStyle(section).minHeight)
      const starts = [rect.top + window.scrollY]
      for (const gap of section.querySelectorAll<HTMLElement>(
        ".apex-page-break-spacer__gap"
      )) {
        starts.push(gap.getBoundingClientRect().bottom + window.scrollY)
      }
      for (const start of starts) {
        clips.push({
          pageNumber: 0,
          sectionIndex,
          x: rect.left + window.scrollX,
          y: start,
          width: rect.width,
          height: pageHeight,
        })
      }
    }
    clips.sort((left, right) => left.y - right.y || left.x - right.x)
    return clips.map((clip, index) => ({ ...clip, pageNumber: index + 1 }))
  })
}

function inspectSemanticDocument(bytes: Uint8Array): Record<string, unknown> & {
  text: string
} {
  const result = normaliseDocxBytes(bytes)
  if (!result.ok) {
    throw new FidelityStageError(
      "docx-import",
      result.diagnostics.map((entry) => entry.message).join("; "),
      result.diagnostics
    )
  }
  const document = result.value
  const blocks = document.sections.flatMap((section) => section.blocks)
  const tables = blocks.filter(
    (block): block is Extract<SemanticBlock, { type: "table" }> =>
      block.type === "table"
  )
  return {
    text: normalizeExtractedText(semanticText(document)),
    diagnostics: result.diagnostics,
    sections: document.sections.length,
    blocks: blocks.length,
    paragraphs: blocks.filter((block) => block.type === "paragraph").length,
    tables: tables.length,
    tableRows: tables.reduce((sum, table) => sum + table.rows.length, 0),
    tableCells: tables.reduce(
      (sum, table) =>
        sum + table.rows.reduce((rowSum, row) => rowSum + row.cells.length, 0),
      0
    ),
    assets: document.assets.length,
    fontAssets: document.fontAssets?.length ?? 0,
    pages: document.sections.map((section) => ({
      widthTwips: section.properties.pageWidth,
      heightTwips: section.properties.pageHeight,
      marginsTwips: section.properties.margins,
      columns: section.properties.columns ?? null,
    })),
  }
}

function semanticText(document: SemanticDocument): string {
  const values: string[] = []
  const visitInline = (inline: SemanticInline): void => {
    if (inline.type === "text") values.push(inline.text)
    else if (inline.type === "break" && inline.kind === "line")
      values.push("\n")
    else if (inline.type === "tab") values.push("\t")
  }
  const visitBlock = (block: SemanticBlock): void => {
    if (block.type === "paragraph") {
      block.children.forEach(visitInline)
      values.push("\n")
      return
    }
    if (block.type === "table") {
      for (const row of block.rows) {
        for (const cell of row.cells) cell.blocks.forEach(visitBlock)
        values.push("\n")
      }
    }
  }
  for (const section of document.sections) section.blocks.forEach(visitBlock)
  return values.join("")
}

async function runEngineGolden(
  input: Readonly<{
    fidelityCase: FidelityCase
    outputDirectory: string
    dpi: number
    threshold: number
  }>
): Promise<Record<string, unknown>> {
  const bun = requireTool("bun")
  const script = resolve(import.meta.dir, "golden-docx-pdf.ts")
  const result = await runProcess(bun, [
    script,
    "--docx",
    input.fidelityCase.docxPath,
    "--reference",
    input.fidelityCase.referencePdfPath,
    "--out",
    input.outputDirectory,
    "--dpi",
    String(input.dpi),
    "--threshold",
    String(input.threshold),
  ])
  if (result.exitCode === 2 || result.exitCode > 2) {
    throw new FidelityStageError(
      "engine-golden",
      result.stderr.trim() || result.stdout.trim(),
      result
    )
  }
  return (await Bun.file(
    resolve(input.outputDirectory, "golden-report.json")
  ).json()) as Record<string, unknown>
}

function readReferenceGeometry(report: Record<string, unknown>): PdfGeometry {
  const reference = report.reference as { geometry?: PdfGeometry } | undefined
  if (!reference?.geometry) {
    throw new FidelityStageError(
      "engine-report",
      "Golden report did not include reference PDF geometry"
    )
  }
  return reference.geometry
}

async function loadFidelityManifest(
  path: string
): Promise<readonly FidelityCase[]> {
  const file = Bun.file(path)
  if (!(await file.exists()))
    throw new Error(`Manifest does not exist: ${path}`)
  return parseFidelityManifest(await file.text(), dirname(path)).cases
}

async function validateCaseInputs(fidelityCase: FidelityCase): Promise<void> {
  for (const [label, path, extension] of [
    ["DOCX", fidelityCase.docxPath, ".docx"],
    ["reference PDF", fidelityCase.referencePdfPath, ".pdf"],
  ] as const) {
    if (extname(path).toLowerCase() !== extension) {
      throw new FidelityStageError(
        "input",
        `${label} must use ${extension}: ${path}`
      )
    }
    if (!(await Bun.file(path).exists())) {
      throw new FidelityStageError("input", `${label} does not exist: ${path}`)
    }
  }
}

async function startEditorServer(port: number): Promise<ManagedServer> {
  const webRoot = resolve(import.meta.dir, "../apps/web")
  const process = Bun.spawn({
    cmd: [
      requireTool("bun"),
      "run",
      "dev",
      "--",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    cwd: webRoot,
    env: { ...Bun.env, CONVEX_URL: "", VITE_CONVEX_URL: "" },
    stdout: "pipe",
    stderr: "pipe",
  })
  const output = Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]).then((values) => values.join("\n"))
  const url = `http://127.0.0.1:${port}/editor`
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (process.exitCode !== null) {
      throw new FidelityStageError(
        "editor-server",
        `Editor server exited before startup:\n${await output}`
      )
    }
    try {
      const response = await fetch(url)
      if (response.ok) return Object.freeze({ url, process, output })
    } catch {
      // Server is still starting.
    }
    await Bun.sleep(100)
  }
  process.kill()
  throw new FidelityStageError("editor-server", `Timed out waiting for ${url}`)
}

async function discoverPdfToText(
  explicit: string | null
): Promise<string | null> {
  const candidates = [
    explicit,
    Bun.env.PDFTOTEXT_PATH ?? null,
    Bun.which("pdftotext"),
  ].filter((value): value is string => Boolean(value))
  const pdfinfo = Bun.which("pdfinfo")
  if (pdfinfo) {
    candidates.push(
      resolve(dirname(pdfinfo), "../../native/poppler/poppler/bin/pdftotext")
    )
  }
  for (const candidate of candidates) {
    if (await Bun.file(candidate).exists()) return candidate
  }
  return null
}

async function extractPdfText(tool: string, path: string): Promise<string> {
  const process = Bun.spawn([tool, "-layout", path, "-"], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ])
  if (exitCode !== 0) {
    throw new FidelityStageError(
      "pdf-text",
      `${basename(tool)} exited ${exitCode}: ${stderr.trim()}`
    )
  }
  return normalizeExtractedText(stdout)
}

async function writeTextEvidence(
  caseDirectory: string,
  values: Readonly<Record<string, string | null>>
): Promise<Record<string, string | null>> {
  const directory = resolve(caseDirectory, "text")
  await mkdir(directory, { recursive: true })
  const paths: Record<string, string | null> = {}
  for (const [name, value] of Object.entries(values)) {
    if (value === null) {
      paths[name] = null
      continue
    }
    const path = resolve(directory, `${name}.txt`)
    await Bun.write(path, `${value}\n`)
    paths[name] = path
  }
  return paths
}

async function createContactSheet(
  input: Readonly<{
    caseDirectory: string
    engineDirectory: string
    editor: EditorCapture | null
    magick: string
  }>
): Promise<string | null> {
  const reference = resolve(input.engineDirectory, "reference/page-001.png")
  const engine = resolve(input.engineDirectory, "generated/page-001.png")
  const editor = input.editor?.pages[0]?.pngPath ?? null
  const images = [reference, engine, editor].filter(
    (value): value is string => value !== null
  )
  if (
    (
      await Promise.all(
        images.map(async (path) => {
          const file = Bun.file(path)
          return (await file.exists()) && file.size > 0
        })
      )
    ).some((exists) => !exists)
  ) {
    return null
  }
  const output = resolve(input.caseDirectory, "contact-sheet.png")
  await runProcess(input.magick, [
    "montage",
    ...images,
    "-tile",
    `${images.length}x1`,
    "-geometry",
    "+12+12",
    "-background",
    "#e5e7eb",
    "-label",
    "%f",
    output,
  ])
  const outputFile = Bun.file(output)
  return (await outputFile.exists()) && outputFile.size > 0 ? output : null
}

async function writeHtmlReport(
  outputDirectory: string,
  report: Record<string, unknown>
): Promise<void> {
  const cases = (report.cases as Record<string, unknown>[] | undefined) ?? []
  const sections = cases
    .map((entry) => {
      const id = String(entry.id)
      const engine = entry.engine as Record<string, unknown>
      const editor = entry.editor as Record<string, unknown> | null
      const contactSheet = entry.contactSheet as string | null
      return `<section>
        <h2>${escapeHtml(id)} — ${entry.exactMatch ? "exact" : "different"}</h2>
        ${contactSheet ? `<img src="${escapeHtml(toReportPath(outputDirectory, contactSheet))}" alt="${escapeHtml(id)} contact sheet">` : ""}
        <p><a href="${escapeHtml(toReportPath(outputDirectory, String(engine.reportPath)))}">Engine JSON report</a> · <a href="${escapeHtml(toReportPath(outputDirectory, String(engine.generatedPdfPath)))}">Generated PDF</a>${editor ? ` · Editor status: ${escapeHtml(String(editor.status))}` : ""}</p>
        <details><summary>Machine evidence</summary><pre>${escapeHtml(JSON.stringify(entry, null, 2))}</pre></details>
      </section>`
    })
    .join("\n")
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DOCX fidelity report</title>
<style>body{font:14px/1.45 system-ui,sans-serif;margin:32px;background:#f8fafc;color:#0f172a}section{background:white;border:1px solid #cbd5e1;border-radius:12px;padding:20px;margin:20px 0}img{max-width:100%;height:auto;border:1px solid #94a3b8}pre{white-space:pre-wrap;word-break:break-word;font:12px/1.35 ui-monospace,monospace}a{color:#0369a1}</style></head><body><h1>DOCX fidelity report</h1><p>Status: ${escapeHtml(String(report.status))}</p>${sections}</body></html>`
  await Bun.write(resolve(outputDirectory, "fidelity-report.html"), html)
}

function buildAgentReview(
  outputDirectory: string,
  cases: readonly Record<string, unknown>[]
): string {
  const lines = [
    "# Agent visual review",
    "",
    "Treat the Google Docs PDF as the visual oracle. Inspect each contact sheet, then the highest-error engine and editor overlay/hotspot artifacts. Describe visible differences before modifying code.",
    "",
  ]
  for (const entry of cases) {
    lines.push(`## ${String(entry.id)}`, "")
    const contact = entry.contactSheet
    if (typeof contact === "string") {
      lines.push(`- Contact sheet: ${toReportPath(outputDirectory, contact)}`)
    }
    const engine = entry.engine as { pages?: ComparisonArtifactSummary[] }
    const editor = entry.editor as {
      comparisons?: ComparisonArtifactSummary[]
    } | null
    const enginePages = engine.pages ?? []
    const editorPages = editor?.comparisons ?? []
    addReviewArtifacts(
      lines,
      "Engine",
      enginePages[highestErrorIndex(enginePages)],
      outputDirectory
    )
    addReviewArtifacts(
      lines,
      "Editor",
      editorPages[highestErrorIndex(editorPages)],
      outputDirectory
    )
    lines.push("")
  }
  return `${lines.join("\n")}\n`
}

export function highestErrorIndex(
  comparisons: ReadonlyArray<
    Readonly<{ rawMetrics: Readonly<{ exactChangedRatio: number }> }>
  >
): number {
  let highestIndex = -1
  let highestRatio = Number.NEGATIVE_INFINITY
  for (const [index, comparison] of comparisons.entries()) {
    if (comparison.rawMetrics.exactChangedRatio <= highestRatio) continue
    highestRatio = comparison.rawMetrics.exactChangedRatio
    highestIndex = index
  }
  return highestIndex
}

function addReviewArtifacts(
  lines: string[],
  label: string,
  comparison: ComparisonArtifactSummary | undefined,
  outputDirectory: string
): void {
  if (!comparison) return
  lines.push(
    `- ${label} raw changed ratio: ${comparison.rawMetrics.exactChangedRatio}`,
    `- ${label} aligned changed ratio: ${comparison.alignedMetrics.exactChangedRatio}`,
    `- ${label} translation: (${comparison.translation.offsetX}, ${comparison.translation.offsetY})`,
    `- ${label} overlay: ${toReportPath(outputDirectory, comparison.artifacts.overlay ?? "")}`,
    `- ${label} hotspot grid: ${toReportPath(outputDirectory, comparison.artifacts.hotspotGrid ?? "")}`
  )
}

async function convertPngToPpm(
  magick: string,
  pngPath: string,
  ppmPath: string
): Promise<void> {
  const result = await runProcess(magick, [
    pngPath,
    "-background",
    "white",
    "-alpha",
    "remove",
    "-alpha",
    "off",
    `PPM:${ppmPath}`,
  ])
  if (result.exitCode !== 0) {
    throw new FidelityStageError("image-convert", result.stderr, result)
  }
}

async function cropPng(
  tool: string,
  sourcePath: string,
  outputPath: string,
  clip: Readonly<{ x: number; y: number; width: number; height: number }>
): Promise<void> {
  const crop = integerPixelCrop(clip)
  await runProcess(tool, [
    sourcePath,
    "-crop",
    `${crop.width}x${crop.height}+${crop.x}+${crop.y}`,
    "+repage",
    `PNG24:${outputPath}`,
  ])
}

async function convertToPng(magick: string, ppmPath: string): Promise<string> {
  const pngPath = `${ppmPath.slice(0, -extname(ppmPath).length)}.png`
  const result = await runProcess(magick, [ppmPath, `PNG24:${pngPath}`])
  if (result.exitCode !== 0) {
    throw new FidelityStageError("image-convert", result.stderr, result)
  }
  return pngPath
}

async function readPpm(path: string): Promise<PpmImage> {
  return decodePpm(new Uint8Array(await Bun.file(path).arrayBuffer()))
}

async function runProcess(
  executable: string,
  args: readonly string[]
): Promise<ProcessResult> {
  const process = Bun.spawn([executable, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ])
  return Object.freeze({ exitCode, stdout, stderr })
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await Bun.write(path, `${JSON.stringify(value, null, 2)}\n`)
}

function requireTool(name: string): string {
  const value = Bun.which(name)
  if (!value)
    throw new FidelityStageError("tool-discovery", `${name} was not found`)
  return value
}

function pageStem(pageNumber: number): string {
  return `page-${String(pageNumber).padStart(3, "0")}`
}

function isRelevantWarning(value: string): boolean {
  return !value.includes("Download the React DevTools")
}

function positiveInteger(value: string, label: string): number {
  return boundedInteger(value, label, 1, Number.MAX_SAFE_INTEGER)
}

function byteInteger(value: string, label: string): number {
  return boundedInteger(value, label, 0, 255)
}

function boundedInteger(
  value: string,
  label: string,
  minimum: number,
  maximum: number
): number {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}`)
  }
  return parsed
}

function sanitizeId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
}

function toReportPath(root: string, path: string): string {
  return relative(root, path).split("\\").join("/")
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function serializeError(error: unknown): Record<string, unknown> {
  return {
    stage: error instanceof FidelityStageError ? error.stage : "unknown",
    name: error instanceof Error ? error.name : typeof error,
    message: errorMessage(error),
    ...(error instanceof FidelityStageError ? { details: error.details } : {}),
    stack: error instanceof Error ? error.stack : undefined,
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

if (import.meta.main) await main()
