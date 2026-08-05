import type { CompiledTemplate } from "./template"
import type { Diagnostic, UnsupportedFeatureMode } from "./diagnostics"
import type { DocumentHash } from "./ids"
import type { LayoutTrace } from "./layout"
import type { FontConfiguration, TextShaper } from "./fonts"
import type { ResourceLimits, ResourceUsage } from "./resources"

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

export type CompileOptions = Readonly<{
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
  inspect(
    templateBytes: Uint8Array,
    options?: InspectOptions
  ): Promise<readonly Diagnostic[]>
  compile(
    templateBytes: Uint8Array,
    options?: CompileOptions
  ): Promise<CompiledTemplate>
  render(
    compiled: CompiledTemplate,
    data: Readonly<Record<string, unknown>>,
    options: RenderOptions
  ): Promise<RenderResult>
}
