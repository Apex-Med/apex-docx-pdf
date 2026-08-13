import type {
  LayoutTrace,
  PageDisplayList,
  SemanticDocument,
} from "@apexmed/core"

export type LayoutWorkerRequest = Readonly<{
  type: "layout"
  requestId: string
  document: SemanticDocument
  includeTrace: true
  maxPages?: number
}>

export type LayoutWorkerCancel = Readonly<{
  type: "cancel"
  requestId: string
}>

export type LayoutWorkerInbound = LayoutWorkerRequest | LayoutWorkerCancel

export type LayoutWorkerSuccess = Readonly<{
  type: "success"
  requestId: string
  displayList: PageDisplayList
  trace: LayoutTrace
  diagnostics: readonly { code: string; message: string; severity: string }[]
}>

export type LayoutWorkerFailure = Readonly<{
  type: "failure"
  requestId: string
  code: string
  message: string
}>

export type LayoutWorkerOutbound = LayoutWorkerSuccess | LayoutWorkerFailure

/**
 * In-process layout handler (used by tests and as the worker body).
 * Runs layoutDocument with includeTrace and returns display list + trace.
 */
export async function handleLayoutRequest(
  request: LayoutWorkerRequest,
  layout: (
    document: SemanticDocument,
    options: { includeTrace: true; maxPages?: number }
  ) =>
    | {
        displayList: PageDisplayList
        trace?: LayoutTrace
        diagnostics: readonly {
          code: string
          message: string
          severity: string
        }[]
      }
    | Promise<{
        displayList: PageDisplayList
        trace?: LayoutTrace
        diagnostics: readonly {
          code: string
          message: string
          severity: string
        }[]
      }>
): Promise<LayoutWorkerOutbound> {
  try {
    const result = await layout(request.document, {
      includeTrace: true,
      maxPages: request.maxPages,
    })
    if (!result.trace) {
      return {
        type: "failure",
        requestId: request.requestId,
        code: "editor/missing-trace",
        message: "layoutDocument did not return a layout trace",
      }
    }
    return {
      type: "success",
      requestId: request.requestId,
      displayList: result.displayList,
      trace: result.trace,
      diagnostics: result.diagnostics,
    }
  } catch (error) {
    return {
      type: "failure",
      requestId: request.requestId,
      code: "editor/layout-failed",
      message: error instanceof Error ? error.message : String(error),
    }
  }
}
