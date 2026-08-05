import type { CompiledTemplate } from "./template"
import type { Diagnostic, UnsupportedFeatureMode } from "./diagnostics"
import type { DocumentHash } from "./ids"
import type { LayoutTrace, PageDisplayList } from "./layout"
import type { FontConfiguration, TextShaper } from "./fonts"
import type { ResourceLimits, ResourceUsage } from "./resources"
import type { FontStyle, FontWeight } from "./fonts"
import type { SourceLocation } from "./diagnostics"

export type RenderTimings = Readonly<{
  resolveMs: number
  layoutMs: number
  pdfMs: number
  totalMs: number
}>

export type RenderResult = Readonly<{
  pdf: Uint8Array
  pageCount: number
  documentHash: DocumentHash
  templateHash: DocumentHash
  diagnostics: readonly Diagnostic[]
  timings: RenderTimings
  resourceUsage?: ResourceUsage
  layoutTrace?: LayoutTrace
}>

export type InspectOptions = Readonly<{
  signal?: AbortSignal
}>

export type RequiredFontInspection = Readonly<{
  family: string
  weight: FontWeight
  style: FontStyle
  instanceCount: number
  sources: readonly SourceLocation[]
  sourcesTruncated: boolean
}>

export type DocumentFeatureInspection = Readonly<{
  /** Stable semantic kind, or `unsupported:<parser feature/code>`. */
  kind: string
  support: "implemented" | "unsupported"
  instanceCount: number
  sources: readonly SourceLocation[]
  sourcesTruncated: boolean
}>

export type TemplateInspectionResult = Readonly<{
  /** False when validation/parsing could not produce a semantic document. */
  documentModelAvailable: boolean
  requiredFonts: readonly RequiredFontInspection[]
  requiredFontEntryCount: number
  requiredFontsTruncated: boolean
  features: readonly DocumentFeatureInspection[]
  featureEntryCount: number
  featuresTruncated: boolean
  diagnostics: readonly Diagnostic[]
  /** Maximum source samples retained for each font request or feature kind. */
  sourceLimitPerEntry: number
  /** Maximum font and feature entries retained in their respective arrays. */
  entryLimit: number
}>

export type TemplatePreviewResult = Readonly<{
  /** Canonical engine-owned geometry for the unresolved template source. */
  displayList: PageDisplayList
  placeholderNodes: Readonly<Record<string, string>>
  diagnostics: readonly Diagnostic[]
}>

export type CompileOptions = Readonly<{
  /**
   * `strict` rejects every unsupported feature. `compatible` permits only
   * deterministic compatibility fallbacks, while `lenient` additionally
   * permits documented empty replacements. Both continuing modes retain
   * structured warnings. Security, invalid-input, and unsafe content-loss
   * diagnostics are never downgraded. Defaults to `strict`.
   */
  unsupportedFeatures?: UnsupportedFeatureMode
  signal?: AbortSignal
}>

export type RenderMetadata = Readonly<{
  title?: string
  author?: string
  subject?: string
  keywords?: readonly string[]
}>

export type RenderOptions = Readonly<{
  locale: string
  timeZone: string
  metadata?: RenderMetadata
  signal?: AbortSignal
  includeLayoutTrace?: boolean
}>

export type EngineOptions = Readonly<{
  limits?: Partial<ResourceLimits>
  /** Required for embedded-font rendering; omitted only by the Phase 1 standard-font profile. */
  fonts?: FontConfiguration
  textShaper?: TextShaper
}>

export interface DocxPdfEngine {
  readonly version: string
  readonly fontRegistryHash?: DocumentHash
  inspect(
    templateBytes: Uint8Array,
    options?: InspectOptions
  ): Promise<TemplateInspectionResult>
  compile(
    templateBytes: Uint8Array,
    options?: CompileOptions
  ): Promise<CompiledTemplate>
  preview(
    compiled: CompiledTemplate,
    options?: InspectOptions
  ): Promise<TemplatePreviewResult>
  render(
    compiled: CompiledTemplate,
    data: Readonly<Record<string, unknown>>,
    options: RenderOptions
  ): Promise<RenderResult>
}
