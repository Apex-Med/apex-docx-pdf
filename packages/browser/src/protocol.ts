import type {
  Diagnostic,
  JsonSchema,
  LayoutTrace,
  PageDisplayList,
  RenderOptions,
  ResourceUsage,
  RenderTimings,
  TemplateManifest,
  TemplateInspectionResult,
} from "@apex-docx-pdf/core"

export type WorkerProgressStage =
  | "validating"
  | "parsing"
  | "compiling"
  | "resolving"
  | "layout"
  | "pdf"
  | "complete"

export type WorkerProgress = Readonly<{
  requestId: string
  stage: WorkerProgressStage
  completed: number
  total: number
  message: string
}>

export type BrowserCompileResult = Readonly<{
  engineVersion: string
  fontRegistryHash: string
  templateHash: string
  manifest: TemplateManifest
  jsonSchema: JsonSchema
  starterData: Readonly<Record<string, unknown>>
  templatePreview: BrowserTemplatePreview
  inspection: TemplateInspectionResult
  diagnostics: readonly Diagnostic[]
}>

export type BrowserTemplatePreview = Readonly<{
  displayList: PageDisplayList
  placeholderNodes: Readonly<Record<string, string>>
  assets: readonly BrowserPreviewAsset[]
  layoutTrace: LayoutTrace
}>

export type BrowserPreviewAsset = Readonly<{
  assetId: string
  mimeType: "image/png" | "image/jpeg"
  bytes: Uint8Array<ArrayBuffer>
}>

export type BrowserRenderResult = Readonly<{
  pdf: Uint8Array<ArrayBuffer>
  pageCount: number
  diagnostics: readonly Diagnostic[]
  timings: RenderTimings
  resourceUsage: ResourceUsage
  layoutTrace?: LayoutTrace
}>

export type CompileWorkerRequest = Readonly<{
  type: "compile"
  requestId: string
  templateBytes: ArrayBuffer
}>

export type RenderWorkerRequest = Readonly<{
  type: "render"
  requestId: string
  templateHash: string
  data: Readonly<Record<string, unknown>>
  options: Omit<RenderOptions, "signal">
}>

export type CancelWorkerRequest = Readonly<{
  type: "cancel"
  requestId: string
}>

export type RendererWorkerRequest =
  CompileWorkerRequest | RenderWorkerRequest | CancelWorkerRequest

export type WorkerSuccessResponse = Readonly<{
  type: "success"
  requestId: string
  operation: "compile" | "render"
  result:
    | BrowserCompileResult
    | (Omit<BrowserRenderResult, "pdf"> & { pdf: ArrayBuffer })
}>

export type WorkerFailureResponse = Readonly<{
  type: "failure"
  requestId: string
  code: string
  message: string
  diagnostics: readonly Diagnostic[]
}>

export type WorkerProgressResponse = Readonly<{
  type: "progress"
  progress: WorkerProgress
}>

export type RendererWorkerResponse =
  WorkerSuccessResponse | WorkerFailureResponse | WorkerProgressResponse
