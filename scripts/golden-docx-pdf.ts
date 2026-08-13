import { mkdir } from "node:fs/promises"
import { basename, extname, resolve } from "node:path"

import {
  hasErrors,
  type Diagnostic,
  type FontConfiguration,
  type SemanticDocument,
  type UnsupportedFeatureMode,
} from "../packages/core/src"
import { normaliseDocxBytesWithUsage } from "../packages/docx/src"
import {
  createDocxPdfEngine,
  EngineOperationError,
} from "../packages/engine/src"
import { createFontRegistry } from "../packages/fonts/src"
import { prepareImageAssetsAsync } from "../packages/images/src"
import { layoutDocument } from "../packages/layout/src"
import { serializePdf } from "../packages/pdf/src"
import { loadOfflineFontConfiguration } from "./offline-font-configuration"

const DEFAULT_DPI = 144
const DEFAULT_LOCALE = "en-ZA"
const DEFAULT_TIME_ZONE = "Africa/Johannesburg"

type CliOptions = Readonly<{
  docxPath: string
  referencePdfPath: string
  outputDirectory: string
  dpi: number
  threshold: number
  locale: string
  timeZone: string
  unsupportedFeatures: UnsupportedFeatureMode
  png: boolean
}>

export type PdfPageGeometry = Readonly<{
  pageNumber: number
  widthPoints: number
  heightPoints: number
  rotation: number
  mediaBox?: readonly [number, number, number, number]
}>

export type PdfGeometry = Readonly<{
  pageCount: number
  pages: readonly PdfPageGeometry[]
}>

export type PpmImage = Readonly<{
  width: number
  height: number
  pixels: Uint8Array
}>

export type RasterMetrics = Readonly<{
  canvasWidth: number
  canvasHeight: number
  comparedPixels: number
  exactChangedPixels: number
  exactChangedRatio: number
  thresholdChangedPixels: number
  thresholdChangedRatio: number
  meanAbsoluteError: number
  normalizedMeanAbsoluteError: number
  rootMeanSquareError: number
  normalizedRootMeanSquareError: number
  maxChannelDelta: number
  exactMatch: boolean
}>

type CommandResult = Readonly<{
  stdout: string
  stderr: string
}>

type ImportedDocxRender = Readonly<{
  pdf: Uint8Array
  pageCount: number
  documentHash: string
  templateHash: string
  diagnostics: readonly Diagnostic[]
  importDiagnostics: readonly Diagnostic[]
  timings: Readonly<{
    importMs: number
    layoutMs: number
    pdfMs: number
    totalMs: number
  }>
  resourceUsage: Readonly<{
    templateBytes: number
    archiveEntries: number
    decompressedBytes: number
  }>
  layoutTrace: ReturnType<typeof layoutDocument>["trace"]
}>

class StageError extends Error {
  constructor(
    readonly stage: string,
    message: string,
    readonly causeValue?: unknown
  ) {
    super(message)
    this.name = "StageError"
  }
}

export function parseCliArgs(args: readonly string[]): CliOptions {
  const values = new Map<string, string>()
  const positionals: string[] = []
  let png = true

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === undefined) continue
    if (argument === "--no-png") {
      png = false
      continue
    }
    if (!argument.startsWith("--")) {
      positionals.push(argument)
      continue
    }
    const [rawKey, inlineValue] = argument.split("=", 2)
    const key = rawKey?.slice(2)
    if (!key) throw new Error(`Invalid option '${argument}'`)
    const value = inlineValue ?? args[index + 1]
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Option --${key} requires a value`)
    }
    if (inlineValue === undefined) index += 1
    values.set(key, value)
  }

  const docxPath = values.get("docx") ?? positionals[0]
  const referencePdfPath = values.get("reference") ?? positionals[1]
  if (!docxPath || !referencePdfPath) throw new Error(usage())

  const dpi = positiveInteger(values.get("dpi") ?? String(DEFAULT_DPI), "dpi")
  const threshold = nonNegativeInteger(
    values.get("threshold") ?? "0",
    "threshold"
  )
  if (threshold > 255) throw new Error("threshold must be between 0 and 255")
  const unsupportedFeatures = values.get("unsupported") ?? "compatible"
  if (!isUnsupportedFeatureMode(unsupportedFeatures)) {
    throw new Error("unsupported must be strict, compatible, or lenient")
  }

  const absoluteDocxPath = resolve(docxPath)
  const outputDirectory = resolve(
    values.get("out") ??
      `/tmp/apex-docx-pdf-golden/${safeStem(absoluteDocxPath)}-${Date.now()}`
  )
  return Object.freeze({
    docxPath: absoluteDocxPath,
    referencePdfPath: resolve(referencePdfPath),
    outputDirectory,
    dpi,
    threshold,
    locale: values.get("locale") ?? DEFAULT_LOCALE,
    timeZone: values.get("time-zone") ?? DEFAULT_TIME_ZONE,
    unsupportedFeatures,
    png,
  })
}

export function usage(): string {
  return [
    "Usage: bun scripts/golden-docx-pdf.ts --docx <input.docx> --reference <reference.pdf> [options]",
    "",
    "Options:",
    "  --out <directory>       Artifact directory (default: timestamped /tmp directory)",
    `  --dpi <integer>         Raster resolution (default: ${DEFAULT_DPI})`,
    "  --threshold <0-255>     Per-pixel max channel tolerance (default: 0)",
    "  --unsupported <mode>    strict, compatible, or lenient (default: compatible)",
    `  --locale <locale>       Render locale (default: ${DEFAULT_LOCALE})`,
    `  --time-zone <zone>      Render time zone (default: ${DEFAULT_TIME_ZONE})`,
    "  --no-png                Keep deterministic PPM rasters only",
  ].join("\n")
}

export function parsePdfInfo(text: string): PdfGeometry {
  const pageCountText = /^Pages:\s+(\d+)\s*$/mu.exec(text)?.[1]
  if (!pageCountText)
    throw new Error("pdfinfo output did not contain a page count")
  const pageCount = Number(pageCountText)
  const pages: PdfPageGeometry[] = []
  const pagePattern =
    /^Page\s+(\d+)\s+size:\s+([\d.]+)\s+x\s+([\d.]+)\s+pts(?:\s+\([^\r\n]+\))?\s*$/gmu
  for (const match of text.matchAll(pagePattern)) {
    const pageNumber = Number(match[1])
    const widthPoints = Number(match[2])
    const heightPoints = Number(match[3])
    const rotationPattern = new RegExp(
      `^Page\\s+${pageNumber}\\s+rot:\\s+(-?\\d+)\\s*$`,
      "mu"
    )
    const mediaBoxPattern = new RegExp(
      `^Page\\s+${pageNumber}\\s+MediaBox:\\s+(-?[\\d.]+)\\s+(-?[\\d.]+)\\s+(-?[\\d.]+)\\s+(-?[\\d.]+)\\s*$`,
      "mu"
    )
    const mediaBoxMatch = mediaBoxPattern.exec(text)
    pages.push(
      Object.freeze({
        pageNumber,
        widthPoints,
        heightPoints,
        rotation: Number(rotationPattern.exec(text)?.[1] ?? 0),
        ...(mediaBoxMatch
          ? {
              mediaBox: Object.freeze([
                Number(mediaBoxMatch[1]),
                Number(mediaBoxMatch[2]),
                Number(mediaBoxMatch[3]),
                Number(mediaBoxMatch[4]),
              ]) as readonly [number, number, number, number],
            }
          : {}),
      })
    )
  }

  if (pages.length !== pageCount) {
    const singleSize =
      /^Page size:\s+([\d.]+)\s+x\s+([\d.]+)\s+pts(?:\s+\([^\r\n]+\))?\s*$/mu.exec(
        text
      )
    if (singleSize && pageCount === 1) {
      pages.push(
        Object.freeze({
          pageNumber: 1,
          widthPoints: Number(singleSize[1]),
          heightPoints: Number(singleSize[2]),
          rotation: Number(/^Page rot:\s+(-?\d+)\s*$/mu.exec(text)?.[1] ?? 0),
        })
      )
    }
  }
  if (pages.length !== pageCount) {
    throw new Error(
      `pdfinfo reported ${pageCount} pages but exposed geometry for ${pages.length}`
    )
  }
  return Object.freeze({ pageCount, pages: Object.freeze(pages) })
}

export function decodePpm(bytes: Uint8Array): PpmImage {
  let cursor = 0
  const token = (): string => {
    while (cursor < bytes.length) {
      const value = bytes[cursor]
      if (value === 0x23) {
        while (cursor < bytes.length && bytes[cursor] !== 0x0a) cursor += 1
      } else if (value !== undefined && isAsciiWhitespace(value)) {
        cursor += 1
      } else break
    }
    const start = cursor
    while (cursor < bytes.length) {
      const value = bytes[cursor]
      if (value === undefined || isAsciiWhitespace(value) || value === 0x23)
        break
      cursor += 1
    }
    if (start === cursor) throw new Error("Malformed PPM header")
    return new TextDecoder("ascii").decode(bytes.subarray(start, cursor))
  }

  if (token() !== "P6")
    throw new Error("Only binary P6 PPM rasters are supported")
  const width = positiveInteger(token(), "PPM width")
  const height = positiveInteger(token(), "PPM height")
  if (positiveInteger(token(), "PPM max value") !== 255) {
    throw new Error("Only 8-bit PPM rasters are supported")
  }
  if (cursor >= bytes.length || !isAsciiWhitespace(bytes[cursor] ?? 0)) {
    throw new Error("Malformed PPM pixel boundary")
  }
  cursor += 1
  const expectedLength = width * height * 3
  const pixels = bytes.subarray(cursor)
  if (pixels.byteLength !== expectedLength) {
    throw new Error(
      `PPM pixel payload is ${pixels.byteLength} bytes; expected ${expectedLength}`
    )
  }
  return Object.freeze({ width, height, pixels: new Uint8Array(pixels) })
}

export function compareRasterImages(
  generated: PpmImage,
  reference: PpmImage,
  threshold = 0
): Readonly<{ metrics: RasterMetrics; diff: PpmImage }> {
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 255) {
    throw new RangeError("threshold must be an integer between 0 and 255")
  }
  const canvasWidth = Math.max(generated.width, reference.width)
  const canvasHeight = Math.max(generated.height, reference.height)
  const diffPixels = new Uint8Array(canvasWidth * canvasHeight * 3)
  let exactChangedPixels = 0
  let thresholdChangedPixels = 0
  let absoluteDelta = 0
  let squaredDelta = 0
  let maxChannelDelta = 0

  for (let y = 0; y < canvasHeight; y += 1) {
    for (let x = 0; x < canvasWidth; x += 1) {
      const outputOffset = (y * canvasWidth + x) * 3
      let pixelMaxDelta = 0
      for (let channel = 0; channel < 3; channel += 1) {
        const generatedValue = rasterChannel(generated, x, y, channel)
        const referenceValue = rasterChannel(reference, x, y, channel)
        const delta = Math.abs(generatedValue - referenceValue)
        pixelMaxDelta = Math.max(pixelMaxDelta, delta)
        maxChannelDelta = Math.max(maxChannelDelta, delta)
        absoluteDelta += delta
        squaredDelta += delta * delta
      }
      if (pixelMaxDelta > 0) exactChangedPixels += 1
      if (pixelMaxDelta > threshold) thresholdChangedPixels += 1
      const heat = Math.min(255, pixelMaxDelta * 4)
      diffPixels[outputOffset] = 255
      diffPixels[outputOffset + 1] = 255 - heat
      diffPixels[outputOffset + 2] = 255 - heat
    }
  }

  const comparedPixels = canvasWidth * canvasHeight
  const comparedChannels = comparedPixels * 3
  const meanAbsoluteError = absoluteDelta / comparedChannels
  const rootMeanSquareError = Math.sqrt(squaredDelta / comparedChannels)
  return Object.freeze({
    metrics: Object.freeze({
      canvasWidth,
      canvasHeight,
      comparedPixels,
      exactChangedPixels,
      exactChangedRatio: exactChangedPixels / comparedPixels,
      thresholdChangedPixels,
      thresholdChangedRatio: thresholdChangedPixels / comparedPixels,
      meanAbsoluteError,
      normalizedMeanAbsoluteError: meanAbsoluteError / 255,
      rootMeanSquareError,
      normalizedRootMeanSquareError: rootMeanSquareError / 255,
      maxChannelDelta,
      exactMatch:
        generated.width === reference.width &&
        generated.height === reference.height &&
        exactChangedPixels === 0,
    }),
    diff: Object.freeze({
      width: canvasWidth,
      height: canvasHeight,
      pixels: diffPixels,
    }),
  })
}

export function encodePpm(image: PpmImage): Uint8Array {
  const header = new TextEncoder().encode(
    `P6\n${image.width} ${image.height}\n255\n`
  )
  const result = new Uint8Array(header.byteLength + image.pixels.byteLength)
  result.set(header)
  result.set(image.pixels, header.byteLength)
  return result
}

/**
 * Render the authored DOCX itself, preserving template-looking text literally.
 * Fidelity comparison must exercise import -> layout -> PDF even when a source
 * document contains placeholders that are intentionally invalid for runtime
 * template compilation (for example, human-readable labels with spaces).
 */
export async function renderImportedDocx(
  docxBytes: Uint8Array,
  baseFonts: FontConfiguration,
  unsupportedFeatures: UnsupportedFeatureMode
): Promise<ImportedDocxRender> {
  const startedAt = performance.now()
  const normalised = normaliseDocxBytesWithUsage(docxBytes, {
    unsupportedFeatures,
  })
  if (!normalised.ok) {
    throw new EngineOperationError(
      "engine/docx",
      "The DOCX could not be imported without content loss",
      normalised.diagnostics
    )
  }
  const importedAt = performance.now()
  const document = normalised.value.document
  const fontConfiguration = fontConfigurationForDocument(document, baseFonts)
  const fonts = await createFontRegistry(fontConfiguration)
  const images = await prepareImageAssetsAsync(document.assets)
  const layout = layoutDocument(document, {
    includeTrace: true,
    fonts,
    shaper: fonts,
  })
  const layoutAt = performance.now()
  const preSerializationDiagnostics = Object.freeze([
    ...normalised.diagnostics,
    ...layout.diagnostics,
  ])
  if (hasErrors(preSerializationDiagnostics)) {
    throw new EngineOperationError(
      "engine/layout",
      "The imported DOCX could not be laid out without content loss",
      preSerializationDiagnostics
    )
  }
  const pdf = serializePdf(layout.displayList, { fonts, images })
  const completedAt = performance.now()
  const diagnostics = Object.freeze([
    ...preSerializationDiagnostics,
    ...pdf.diagnostics,
  ])
  if (hasErrors(diagnostics)) {
    throw new EngineOperationError(
      "engine/pdf",
      "The imported DOCX could not be serialized without content loss",
      diagnostics
    )
  }
  return Object.freeze({
    pdf: pdf.bytes,
    pageCount: layout.displayList.pages.length,
    documentHash: await sha256Hex(pdf.bytes),
    templateHash: await sha256Hex(docxBytes),
    diagnostics,
    importDiagnostics: normalised.diagnostics,
    timings: Object.freeze({
      importMs: importedAt - startedAt,
      layoutMs: layoutAt - importedAt,
      pdfMs: completedAt - layoutAt,
      totalMs: completedAt - startedAt,
    }),
    resourceUsage: Object.freeze({
      templateBytes: docxBytes.byteLength,
      archiveEntries: normalised.value.archiveEntries,
      decompressedBytes: normalised.value.decompressedBytes,
    }),
    layoutTrace: layout.trace,
  })
}

async function main(): Promise<void> {
  let options: CliOptions
  try {
    options = parseCliArgs(Bun.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 64
    return
  }

  await mkdir(options.outputDirectory, { recursive: true })
  const reportPath = resolve(options.outputDirectory, "golden-report.json")
  const report: Record<string, unknown> = {
    schemaVersion: 1,
    status: "running",
    createdAt: new Date().toISOString(),
    options,
  }

  try {
    const pdfinfo = requireTool("pdfinfo")
    const pdftoppm = requireTool("pdftoppm")
    const magick = options.png ? Bun.which("magick") : null
    const docxBytes = await readInput(options.docxPath, ".docx")
    const referencePdfBytes = await readInput(options.referencePdfPath, ".pdf")
    report.inputs = {
      docx: await inputEvidence(options.docxPath, docxBytes),
      referencePdf: await inputEvidence(
        options.referencePdfPath,
        referencePdfBytes
      ),
    }
    report.tools = { pdfinfo, pdftoppm, magick, bun: Bun.version }

    const referenceGeometry = await inspectPdf(
      pdfinfo,
      options.referencePdfPath
    )
    report.reference = { geometry: referenceGeometry }

    const fonts = await loadOfflineFontConfiguration()
    const engine = await createDocxPdfEngine({ fonts })
    report.engine = {
      version: engine.version,
      fontRegistryHash: engine.fontRegistryHash,
    }
    const inspection = await engine.inspect(docxBytes)
    report.inspection = inspection

    let rendered: ImportedDocxRender
    try {
      rendered = await renderImportedDocx(
        docxBytes,
        fonts,
        options.unsupportedFeatures
      )
      report.importDiagnostics = rendered.importDiagnostics
    } catch (error) {
      throw new StageError("engine-render", errorMessage(error), error)
    }

    const generatedPdfPath = resolve(options.outputDirectory, "generated.pdf")
    await Bun.write(generatedPdfPath, rendered.pdf)
    const layoutTracePath = resolve(
      options.outputDirectory,
      "layout-trace.json"
    )
    if (rendered.layoutTrace !== undefined) {
      await Bun.write(
        layoutTracePath,
        `${JSON.stringify(rendered.layoutTrace, null, 2)}\n`
      )
    }
    const generatedGeometry = await inspectPdf(pdfinfo, generatedPdfPath)
    report.render = {
      pdfPath: generatedPdfPath,
      pageCount: rendered.pageCount,
      documentHash: rendered.documentHash,
      templateHash: rendered.templateHash,
      diagnostics: rendered.diagnostics,
      timings: rendered.timings,
      resourceUsage: rendered.resourceUsage,
      geometry: generatedGeometry,
      layoutTracePath:
        rendered.layoutTrace === undefined ? null : layoutTracePath,
      layoutGeometry: rendered.layoutTrace?.pages.map((page) => ({
        pageNumber: page.pageNumber,
        widthTwips: page.pageBounds.width,
        heightTwips: page.pageBounds.height,
        widthPoints: page.pageBounds.width / 20,
        heightPoints: page.pageBounds.height / 20,
        contentBoundsTwips: page.contentBounds,
      })),
    }

    const comparison = await comparePdfs({
      generatedPdfPath,
      referencePdfPath: options.referencePdfPath,
      generatedGeometry,
      referenceGeometry,
      outputDirectory: options.outputDirectory,
      pdftoppm,
      magick,
      dpi: options.dpi,
      threshold: options.threshold,
    })
    report.comparison = comparison
    report.status = comparison.exactMatch ? "exact-match" : "different"
    await writeJson(reportPath, report)
    console.log(JSON.stringify(report, null, 2))
    console.log(`Golden artifacts: ${options.outputDirectory}`)
    if (!comparison.exactMatch) process.exitCode = 1
  } catch (error) {
    report.status = "blocked"
    report.blocker = serialiseBlocker(error)
    await writeJson(reportPath, report)
    console.error(JSON.stringify(report, null, 2))
    console.error(`Golden comparison blocked; report: ${reportPath}`)
    process.exitCode = 2
  }
}

async function comparePdfs(
  options: Readonly<{
    generatedPdfPath: string
    referencePdfPath: string
    generatedGeometry: PdfGeometry
    referenceGeometry: PdfGeometry
    outputDirectory: string
    pdftoppm: string
    magick: string | null
    dpi: number
    threshold: number
  }>
): Promise<Readonly<Record<string, unknown>>> {
  const generatedDirectory = resolve(options.outputDirectory, "generated")
  const referenceDirectory = resolve(options.outputDirectory, "reference")
  const diffDirectory = resolve(options.outputDirectory, "diff")
  await Promise.all([
    mkdir(generatedDirectory, { recursive: true }),
    mkdir(referenceDirectory, { recursive: true }),
    mkdir(diffDirectory, { recursive: true }),
  ])
  const pageCount = Math.max(
    options.generatedGeometry.pageCount,
    options.referenceGeometry.pageCount
  )
  const pages: Record<string, unknown>[] = []
  let exactChangedPixels = 0
  let thresholdChangedPixels = 0
  let comparedPixels = 0
  let absoluteErrorWeighted = 0
  let squaredErrorWeighted = 0

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const generatedPage = options.generatedGeometry.pages[pageNumber - 1]
    const referencePage = options.referenceGeometry.pages[pageNumber - 1]
    if (!generatedPage || !referencePage) {
      pages.push({
        pageNumber,
        status: generatedPage
          ? "missing-reference-page"
          : "missing-generated-page",
        generatedGeometry: generatedPage,
        referenceGeometry: referencePage,
      })
      continue
    }
    const stem = `page-${String(pageNumber).padStart(3, "0")}`
    const generatedPpmPath = resolve(generatedDirectory, `${stem}.ppm`)
    const referencePpmPath = resolve(referenceDirectory, `${stem}.ppm`)
    await Promise.all([
      rasterizePage(
        options.pdftoppm,
        options.generatedPdfPath,
        generatedPpmPath,
        pageNumber,
        options.dpi
      ),
      rasterizePage(
        options.pdftoppm,
        options.referencePdfPath,
        referencePpmPath,
        pageNumber,
        options.dpi
      ),
    ])
    const [generatedRaster, referenceRaster] = await Promise.all([
      readPpm(generatedPpmPath),
      readPpm(referencePpmPath),
    ])
    const { metrics, diff } = compareRasterImages(
      generatedRaster,
      referenceRaster,
      options.threshold
    )
    const geometryMatch =
      generatedPage.widthPoints === referencePage.widthPoints &&
      generatedPage.heightPoints === referencePage.heightPoints &&
      generatedPage.rotation === referencePage.rotation
    const pageExactMatch = metrics.exactMatch && geometryMatch
    const diffPpmPath = resolve(diffDirectory, `${stem}.ppm`)
    await Bun.write(diffPpmPath, encodePpm(diff))
    if (options.magick) {
      await Promise.all([
        convertPpmToPng(options.magick, generatedPpmPath),
        convertPpmToPng(options.magick, referencePpmPath),
        convertPpmToPng(options.magick, diffPpmPath),
      ])
    }
    comparedPixels += metrics.comparedPixels
    exactChangedPixels += metrics.exactChangedPixels
    thresholdChangedPixels += metrics.thresholdChangedPixels
    absoluteErrorWeighted += metrics.meanAbsoluteError * metrics.comparedPixels
    squaredErrorWeighted +=
      metrics.rootMeanSquareError ** 2 * metrics.comparedPixels
    pages.push({
      pageNumber,
      status: pageExactMatch ? "exact-match" : "different",
      generatedGeometry: generatedPage,
      referenceGeometry: referencePage,
      geometryMatch,
      generatedRaster: generatedPpmPath,
      referenceRaster: referencePpmPath,
      diffRaster: diffPpmPath,
      metrics,
    })
  }

  const matchingPageCount =
    options.generatedGeometry.pageCount === options.referenceGeometry.pageCount
  const exactMatch =
    matchingPageCount && pages.every((page) => page.status === "exact-match")
  return Object.freeze({
    exactMatch,
    matchingPageCount,
    generatedPageCount: options.generatedGeometry.pageCount,
    referencePageCount: options.referenceGeometry.pageCount,
    dpi: options.dpi,
    threshold: options.threshold,
    totals: {
      comparedPixels,
      exactChangedPixels,
      exactChangedRatio:
        comparedPixels === 0 ? null : exactChangedPixels / comparedPixels,
      thresholdChangedPixels,
      thresholdChangedRatio:
        comparedPixels === 0 ? null : thresholdChangedPixels / comparedPixels,
      meanAbsoluteError:
        comparedPixels === 0 ? null : absoluteErrorWeighted / comparedPixels,
      normalizedMeanAbsoluteError:
        comparedPixels === 0
          ? null
          : absoluteErrorWeighted / comparedPixels / 255,
      rootMeanSquareError:
        comparedPixels === 0
          ? null
          : Math.sqrt(squaredErrorWeighted / comparedPixels),
      normalizedRootMeanSquareError:
        comparedPixels === 0
          ? null
          : Math.sqrt(squaredErrorWeighted / comparedPixels) / 255,
    },
    pages,
  })
}

async function inspectPdf(tool: string, pdfPath: string): Promise<PdfGeometry> {
  const summary = await runCommand(tool, ["-box", pdfPath])
  const pageCountText = /^Pages:\s+(\d+)\s*$/mu.exec(summary.stdout)?.[1]
  if (!pageCountText)
    throw new StageError("pdf-geometry", "pdfinfo omitted Pages")
  const pageCount = Number(pageCountText)
  const pageOutputs = await Promise.all(
    Array.from({ length: pageCount }, async (_, index) => {
      const pageNumber = index + 1
      return (
        await runCommand(tool, [
          "-f",
          String(pageNumber),
          "-l",
          String(pageNumber),
          "-box",
          pdfPath,
        ])
      ).stdout
    })
  )
  return parsePdfInfo(pageOutputs.join("\n"))
}

async function rasterizePage(
  tool: string,
  pdfPath: string,
  outputPath: string,
  pageNumber: number,
  dpi: number
): Promise<void> {
  const outputPrefix = outputPath.slice(0, -extname(outputPath).length)
  await runCommand(tool, [
    "-f",
    String(pageNumber),
    "-l",
    String(pageNumber),
    "-r",
    String(dpi),
    "-singlefile",
    pdfPath,
    outputPrefix,
  ])
}

async function convertPpmToPng(tool: string, ppmPath: string): Promise<void> {
  const pngPath = `${ppmPath.slice(0, -extname(ppmPath).length)}.png`
  await runCommand(tool, [ppmPath, `PNG24:${pngPath}`])
}

async function readPpm(path: string): Promise<PpmImage> {
  return decodePpm(new Uint8Array(await Bun.file(path).arrayBuffer()))
}

async function runCommand(
  executable: string,
  args: readonly string[]
): Promise<CommandResult> {
  const process = Bun.spawn([executable, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ])
  if (exitCode !== 0) {
    throw new StageError(
      "external-tool",
      `${basename(executable)} exited ${exitCode}: ${stderr.trim() || stdout.trim()}`
    )
  }
  return Object.freeze({ stdout, stderr })
}

async function readInput(path: string, extension: string): Promise<Uint8Array> {
  if (extname(path).toLowerCase() !== extension) {
    throw new StageError("input", `${path} must have a ${extension} extension`)
  }
  const file = Bun.file(path)
  if (!(await file.exists()))
    throw new StageError("input", `${path} does not exist`)
  return new Uint8Array(await file.arrayBuffer())
}

async function inputEvidence(path: string, bytes: Uint8Array): Promise<object> {
  return Object.freeze({
    path,
    bytes: bytes.byteLength,
    sha256: await sha256Hex(bytes),
  })
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes))
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")
}

export function fontConfigurationForDocument(
  document: SemanticDocument,
  base: FontConfiguration
): FontConfiguration {
  const embedded = document.fontAssets ?? []
  if (embedded.length === 0) return base
  const key = (family: string, weight: number, style: string) =>
    `${family.trim().toLowerCase()}\u0000${weight}\u0000${style}`
  const embeddedKeys = new Set(
    embedded.map((asset) => key(asset.family, asset.weight, asset.style))
  )
  const faces = [
    ...embedded.map((asset) => ({
      family: asset.family,
      weight: asset.weight,
      style: asset.style,
      bytes: Uint8Array.from(asset.bytes),
    })),
    ...base.faces.filter(
      (face) => !embeddedKeys.has(key(face.family, face.weight, face.style))
    ),
  ]
  const fallbackFamily = faces.some(
    (face) =>
      face.family.trim().toLowerCase() ===
        base.fallbackFamily.trim().toLowerCase() &&
      face.weight === 400 &&
      face.style === "normal"
  )
    ? base.fallbackFamily
    : (embedded.find(
        (asset) => asset.weight === 400 && asset.style === "normal"
      )?.family ?? embedded[0]?.family)
  if (!fallbackFamily) return base
  const registeredFamilies = new Set(
    faces.map((face) => face.family.trim().toLowerCase())
  )
  const aliases = base.aliases?.filter(
    (alias) => !registeredFamilies.has(alias.from.trim().toLowerCase())
  )
  return Object.freeze({
    faces: Object.freeze(faces),
    fallbackFamily,
    ...(aliases ? { aliases: Object.freeze(aliases) } : {}),
  })
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await Bun.write(path, `${JSON.stringify(value, null, 2)}\n`)
}

function serialiseBlocker(error: unknown): object {
  const stage = error instanceof StageError ? error.stage : "unknown"
  const cause = error instanceof StageError ? error.causeValue : error
  return Object.freeze({
    stage,
    name: cause instanceof Error ? cause.name : typeof cause,
    message: errorMessage(cause),
    ...(cause instanceof EngineOperationError
      ? { code: cause.code, diagnostics: cause.diagnostics }
      : diagnosticsFrom(cause).length > 0
        ? { diagnostics: diagnosticsFrom(cause) }
        : {}),
    stack: cause instanceof Error ? cause.stack : undefined,
  })
}

function diagnosticsFrom(error: unknown): readonly Diagnostic[] {
  if (!error || typeof error !== "object" || !("diagnostics" in error))
    return []
  const diagnostics = (error as { diagnostics?: unknown }).diagnostics
  return Array.isArray(diagnostics)
    ? (diagnostics as readonly Diagnostic[])
    : []
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function rasterChannel(
  image: PpmImage,
  x: number,
  y: number,
  channel: number
): number {
  if (x >= image.width || y >= image.height) return 255
  return image.pixels[(y * image.width + x) * 3 + channel] ?? 255
}

function requireTool(name: string): string {
  const path = Bun.which(name)
  if (!path)
    throw new StageError(
      "tool-discovery",
      `Required tool '${name}' was not found`
    )
  return path
}

function safeStem(path: string): string {
  const stem = basename(path, extname(path))
  return (
    stem
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/gu, "-")
      .replace(/^-|-$/gu, "") || "document"
  )
}

function positiveInteger(value: string, label: string): number {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`)
  }
  return parsed
}

function nonNegativeInteger(value: string, label: string): number {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative integer`)
  }
  return parsed
}

function isUnsupportedFeatureMode(
  value: string
): value is UnsupportedFeatureMode {
  return value === "strict" || value === "compatible" || value === "lenient"
}

function isAsciiWhitespace(value: number): boolean {
  return value === 0x20 || value === 0x09 || value === 0x0a || value === 0x0d
}

if (import.meta.main) await main()
