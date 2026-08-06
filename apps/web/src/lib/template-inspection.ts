import type {
  BrowserCompileResult,
  WorkerProgress,
} from "@apex-docx-pdf/browser"
import type { TemplateFieldKind } from "@apex-docx-pdf/core"

import { REFERENCE_FONT_POLICY } from "./font-policy"

const FIELD_KIND_ORDER = [
  "string",
  "number",
  "boolean",
  "date",
  "image",
  "object",
  "array",
  "unknown",
] as const satisfies readonly TemplateFieldKind[]

export const BROWSER_PROFILE_LABEL = "Phase 8 browser profile"

export const BUNDLED_FONT_PROFILE = Object.freeze({
  families: REFERENCE_FONT_POLICY.families,
  fallbackFamily: REFERENCE_FONT_POLICY.fallbackFamily,
  catalogVersion: REFERENCE_FONT_POLICY.catalogVersion,
  uploadedEmbeddedFonts: REFERENCE_FONT_POLICY.allowUploadedEmbeddedFonts,
  aliases: Object.freeze(
    REFERENCE_FONT_POLICY.systemAliases.map((alias) => {
      const weight = "weight" in alias ? alias.weight : undefined
      return `${alias.from} → ${alias.to}${weight === undefined ? "" : ` (${weight})`}`
    })
  ),
})

export const PROFILE_CAPABILITIES = Object.freeze([
  {
    label: "Static images",
    support: "Supported with limits",
    detail: "Relationship-owned PNG and JPEG images with explicit extents.",
  },
  {
    label: "Sections",
    support: "Supported with limits",
    detail: "Next-page portrait and landscape sections.",
  },
  {
    label: "Headers and footers",
    support: "Supported with limits",
    detail: "Referenced default headers and footers with bounded templates.",
  },
  {
    label: "Page fields",
    support: "Supported with limits",
    detail: "PAGE and NUMPAGES fields in supported document containers.",
  },
] as const)

export type TemplateInspection = Readonly<{
  fieldCount: number
  previewPageCount: number
  fieldCountsByKind: readonly Readonly<{
    kind: TemplateFieldKind
    count: number
  }>[]
  requiredFields: readonly string[]
  arrayRoots: readonly string[]
  conditionalFields: readonly string[]
  diagnosticCounts: Readonly<{
    error: number
    warning: number
    info: number
  }>
  documentModelAvailable: boolean
  requiredFonts: BrowserCompileResult["inspection"]["requiredFonts"]
  features: BrowserCompileResult["inspection"]["features"]
}>

export function inspectTemplate(
  compiled: BrowserCompileResult
): TemplateInspection {
  const fields = compiled.manifest.fields
  const counts = new Map<TemplateFieldKind, number>()
  for (const field of fields) {
    counts.set(field.kind, (counts.get(field.kind) ?? 0) + 1)
  }

  return {
    fieldCount: fields.length,
    previewPageCount: compiled.templatePreview.displayList.pages.length,
    fieldCountsByKind: FIELD_KIND_ORDER.flatMap((kind) => {
      const count = counts.get(kind) ?? 0
      return count === 0 ? [] : [{ kind, count }]
    }),
    requiredFields: fields
      .filter((field) => field.required)
      .map((field) => field.path)
      .sort(compareText),
    arrayRoots: fields
      .filter((field) => field.kind === "array")
      .map((field) => field.path)
      .sort(compareText),
    conditionalFields: fields
      .filter((field) =>
        field.inferredFrom.some((source) => source.startsWith("{{#if "))
      )
      .map((field) => field.path)
      .sort(compareText),
    diagnosticCounts: {
      error: compiled.diagnostics.filter(({ severity }) => severity === "error")
        .length,
      warning: compiled.diagnostics.filter(
        ({ severity }) => severity === "warning"
      ).length,
      info: compiled.diagnostics.filter(({ severity }) => severity === "info")
        .length,
    },
    documentModelAvailable: compiled.inspection.documentModelAvailable,
    requiredFonts: compiled.inspection.requiredFonts,
    features: compiled.inspection.features,
  }
}

const STAGE_LABELS: Readonly<Record<WorkerProgress["stage"], string>> = {
  validating: "Validate package",
  parsing: "Parse document",
  compiling: "Build manifest",
  resolving: "Resolve data",
  layout: "Lay out pages",
  pdf: "Write PDF",
  complete: "Finish",
}

export function describeWorkerProgress(progress: WorkerProgress): string {
  const step =
    progress.total > 0
      ? `Step ${Math.min(progress.completed, progress.total)} of ${progress.total}`
      : "In progress"
  return `${progress.message || STAGE_LABELS[progress.stage]} · ${step}`
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, "en")
}
