import type { Diagnostic, RenderOptions } from "../packages/core/src"
import {
  serializeLayoutTrace,
  sha256Hex,
  validatePdfStructure,
} from "../packages/testkit/src"

import { buildPhase5TemplateTableDocx } from "../packages/engine/tests/fixtures/phase5-table-docx"
import { buildPhase6DocumentDocx } from "../packages/engine/tests/fixtures/phase6-document-docx"
import { buildPhase9GoldenDocx } from "../packages/engine/tests/fixtures/phase9-golden-docx"

export type RuntimeCoreRenderCase = Readonly<{
  id: string
  templateBytes: Uint8Array
  data: Readonly<Record<string, unknown>>
  options: Omit<RenderOptions, "signal">
}>

export type RuntimeCoreRejectionCase = Readonly<{
  id: string
  templateBytes: Uint8Array
  data: Readonly<Record<string, unknown>>
  options: Omit<RenderOptions, "signal">
}>

export type RuntimeCoreRenderEvidence = Readonly<{
  status: "rendered"
  fontRegistryHash: string
  pageCount: number
  searchableText: string
  pdfValid: true
  pdfSha256: string
  traceSha256: string
}>

export type RuntimeCoreRejectionEvidence = Readonly<{
  status: "rejected"
  operation: "render"
  code: string
  diagnosticCodes: readonly string[]
}>

export type RuntimeCoreCaseEvidence =
  RuntimeCoreRenderEvidence | RuntimeCoreRejectionEvidence

export type RuntimeCoreSuiteEvidence = Readonly<
  Record<string, RuntimeCoreCaseEvidence>
>

const deterministicRenderOptions = {
  locale: "en-ZA",
  timeZone: "Africa/Johannesburg",
  includeLayoutTrace: true,
} as const

export function createRuntimeCoreRenderCases(): readonly RuntimeCoreRenderCase[] {
  const invoiceItems = Array.from({ length: 18 }, (_, index) => ({
    name: `Item ${String(index + 1).padStart(2, "0")}`,
    quantity: index + 1,
  }))

  return Object.freeze([
    Object.freeze({
      id: "plain-template-formatting",
      templateBytes: buildPhase9GoldenDocx(),
      data: Object.freeze({ subject: "Cross-runtime proof" }),
      options: deterministicRenderOptions,
    }),
    Object.freeze({
      id: "table-row-expansion",
      templateBytes: buildPhase5TemplateTableDocx(),
      data: Object.freeze({
        invoice: Object.freeze({ items: Object.freeze(invoiceItems) }),
      }),
      options: deterministicRenderOptions,
    }),
    Object.freeze({
      id: "static-images-sections",
      templateBytes: buildPhase6DocumentDocx(),
      data: Object.freeze({
        patient: Object.freeze({ name: "Amara Mokoena" }),
      }),
      options: deterministicRenderOptions,
    }),
  ])
}

export function createRuntimeCoreRejectionCases(): readonly RuntimeCoreRejectionCase[] {
  return Object.freeze([
    Object.freeze({
      id: "missing-required-template-data",
      templateBytes: buildPhase9GoldenDocx(),
      data: Object.freeze({}),
      options: deterministicRenderOptions,
    }),
  ])
}

export async function createRenderEvidence(
  fontRegistryHash: string,
  rendered: Readonly<{
    pdf: Uint8Array
    pageCount: number
    layoutTrace?: Parameters<typeof serializeLayoutTrace>[0]
  }>
): Promise<RuntimeCoreRenderEvidence> {
  const validation = validatePdfStructure(rendered.pdf)
  if (!validation.valid) {
    throw new Error(
      `Core suite produced an invalid PDF: ${validation.errors.join("; ")}`
    )
  }
  if (rendered.layoutTrace === undefined) {
    throw new Error("Core suite render did not produce a layout trace")
  }
  const trace = serializeLayoutTrace(rendered.layoutTrace)
  return Object.freeze({
    status: "rendered",
    fontRegistryHash,
    pageCount: rendered.pageCount,
    searchableText: validation.text,
    pdfValid: true,
    pdfSha256: await sha256Hex(rendered.pdf),
    traceSha256: await sha256Hex(new TextEncoder().encode(trace)),
  })
}

export function createRejectionEvidence(
  error: unknown
): RuntimeCoreRejectionEvidence {
  if (!hasStableErrorShape(error)) throw error
  return Object.freeze({
    status: "rejected",
    operation: "render",
    code: error.code,
    diagnosticCodes: Object.freeze(
      error.diagnostics.map(({ code }) => code).sort()
    ),
  })
}

function hasStableErrorShape(
  error: unknown
): error is Readonly<{ code: string; diagnostics: readonly Diagnostic[] }> {
  if (typeof error !== "object" || error === null) return false
  const candidate = error as { code?: unknown; diagnostics?: unknown }
  return (
    typeof candidate.code === "string" && Array.isArray(candidate.diagnostics)
  )
}
