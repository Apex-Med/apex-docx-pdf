import { createHash } from "node:crypto"

import type {
  FontConfiguration,
  FontFaceRegistration,
} from "@apex-docx-pdf/core"

import { createDocxPdfEngine } from "../packages/engine/src"
import { validatePdfStructure } from "../packages/testkit/src"
import { unzipSync } from "../packages/docx/node_modules/fflate"
import { loadOfflineFontConfiguration } from "./offline-font-configuration"

type FontSpec = Readonly<{
  path: string
  family: string
  weight: 400 | 700
  style: "normal" | "italic"
}>

const FONT_SPECS: readonly FontSpec[] = [
  {
    path: "word/fonts/InterSemiBold-regular.ttf",
    family: "Inter SemiBold",
    weight: 400,
    style: "normal",
  },
  {
    path: "word/fonts/InterSemiBold-bold.ttf",
    family: "Inter SemiBold",
    weight: 700,
    style: "normal",
  },
  {
    path: "word/fonts/InterSemiBold-italic.ttf",
    family: "Inter SemiBold",
    weight: 400,
    style: "italic",
  },
  {
    path: "word/fonts/InterSemiBold-boldItalic.ttf",
    family: "Inter SemiBold",
    weight: 700,
    style: "italic",
  },
  {
    path: "word/fonts/InterMedium-regular.ttf",
    family: "Inter Medium",
    weight: 400,
    style: "normal",
  },
  {
    path: "word/fonts/InterMedium-bold.ttf",
    family: "Inter Medium",
    weight: 700,
    style: "normal",
  },
  {
    path: "word/fonts/InterMedium-italic.ttf",
    family: "Inter Medium",
    weight: 400,
    style: "italic",
  },
  {
    path: "word/fonts/InterMedium-boldItalic.ttf",
    family: "Inter Medium",
    weight: 700,
    style: "italic",
  },
  {
    path: "word/fonts/Inter-regular.ttf",
    family: "Inter",
    weight: 400,
    style: "normal",
  },
  {
    path: "word/fonts/Inter-bold.ttf",
    family: "Inter",
    weight: 700,
    style: "normal",
  },
  {
    path: "word/fonts/Inter-italic.ttf",
    family: "Inter",
    weight: 400,
    style: "italic",
  },
  {
    path: "word/fonts/Inter-boldItalic.ttf",
    family: "Inter",
    weight: 700,
    style: "italic",
  },
  {
    path: "word/fonts/BricolageGrotesque-regular.ttf",
    family: "Bricolage Grotesque",
    weight: 400,
    style: "normal",
  },
  {
    path: "word/fonts/BricolageGrotesque-bold.ttf",
    family: "Bricolage Grotesque",
    weight: 700,
    style: "normal",
  },
  {
    path: "word/fonts/BricolageGrotesqueSemiBold-regular.ttf",
    family: "Bricolage Grotesque SemiBold",
    weight: 400,
    style: "normal",
  },
  {
    path: "word/fonts/BricolageGrotesqueSemiBold-bold.ttf",
    family: "Bricolage Grotesque SemiBold",
    weight: 700,
    style: "normal",
  },
]

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function fontConfiguration(
  parts: Readonly<Record<string, Uint8Array>>
): FontConfiguration {
  const faces: FontFaceRegistration[] = FONT_SPECS.map((spec) => {
    const bytes = parts[spec.path]
    if (!bytes) throw new Error(`Embedded font is missing: ${spec.path}`)
    return { ...spec, bytes }
  })
  return {
    faces,
    aliases: [
      { from: "Arial", to: "Inter" },
      { from: "Calibri", to: "Inter" },
      { from: "Helvetica", to: "Inter" },
      { from: "Times New Roman", to: "Inter" },
    ],
    fallbackFamily: "Inter",
  }
}

const [, , templatePath, samplePath, pdfPath, reportPath, fontModeArgument] =
  Bun.argv
if (!templatePath || !samplePath || !pdfPath || !reportPath) {
  throw new Error(
    "Usage: bun scripts/test-k3-template.ts <template.docx> <sample.json> <output.pdf> <report.json> [embedded-local|playground]"
  )
}
const fontMode = fontModeArgument ?? "embedded-local"
if (fontMode !== "embedded-local" && fontMode !== "playground") {
  throw new Error(`Unknown font mode: ${fontMode}`)
}

const templateBytes = new Uint8Array(await Bun.file(templatePath).arrayBuffer())
const parts = unzipSync(templateBytes)
const sampleData = (await Bun.file(samplePath).json()) as Readonly<
  Record<string, unknown>
>
const fonts =
  fontMode === "embedded-local"
    ? fontConfiguration(parts)
    : await loadOfflineFontConfiguration()
const engine = await createDocxPdfEngine({ fonts })
const inspection = await engine.inspect(templateBytes)
const compiled = await engine.compile(templateBytes)
const renderOptions = {
  locale: "en-ZA",
  timeZone: "Africa/Johannesburg",
  includeLayoutTrace: true,
  metadata: {
    title: "Synthetic K3 discharge summary",
    author: "Apex DOCX PDF compatibility test",
    subject: "Synthetic template verification",
  },
} as const
const first = await engine.render(compiled, sampleData, renderOptions)
const second = await engine.render(compiled, sampleData, renderOptions)
const validation = validatePdfStructure(first.pdf)

if (!validation.valid) {
  throw new Error(`PDF validation failed: ${validation.errors.join("; ")}`)
}
if (sha256(first.pdf) !== sha256(second.pdf)) {
  throw new Error("Repeated rendering was not byte-identical")
}
if (!validation.text.includes("Baby Example")) {
  throw new Error("Rendered PDF is missing the synthetic patient name")
}
if (!validation.text.includes("Synthetic Academic Hospital")) {
  throw new Error("Rendered PDF is missing the synthetic facility name")
}
if (validation.text.includes("{{") || validation.text.includes("}}")) {
  throw new Error("Rendered PDF still contains unresolved placeholders")
}

await Bun.write(pdfPath, first.pdf)
const report = {
  schemaVersion: 1,
  source: {
    templatePath,
    templateBytes: templateBytes.length,
    templateSha256: sha256(templateBytes),
    samplePath,
    sampleSha256: sha256(await Bun.file(samplePath).text()),
  },
  engine: {
    version: engine.version,
    fontMode,
    fontRegistryHash: engine.fontRegistryHash,
    embeddedFontFaces: fonts.faces.length,
    inspectDiagnostics: inspection.diagnostics.length,
    requiredFontEntries: inspection.requiredFonts.length,
    featureEntries: inspection.features.length,
    compileDiagnostics: compiled.diagnostics.length,
  },
  manifest: {
    fieldCount: compiled.manifest.fields.length,
    requiredPaths: compiled.manifest.fields
      .filter((field) => field.required)
      .map((field) => field.path),
  },
  render: {
    pageCount: first.pageCount,
    pdfBytes: first.pdf.length,
    pdfSha256: sha256(first.pdf),
    repeatedPdfSha256: sha256(second.pdf),
    byteIdenticalRepeat: sha256(first.pdf) === sha256(second.pdf),
    layoutTraceSha256: first.layoutTrace
      ? sha256(JSON.stringify(first.layoutTrace))
      : null,
    diagnostics: first.diagnostics,
    timings: first.timings,
  },
  pdfValidation: validation,
} as const
await Bun.write(reportPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
