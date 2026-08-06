import { EngineOperationError, createDocxPdfEngine } from "@apexmed/engine"
import type { CompiledTemplate, Diagnostic, EngineOptions } from "@apexmed/core"

import type {
  BrowserCompileResult,
  RendererWorkerRequest,
  RendererWorkerResponse,
  WorkerProgressStage,
} from "./protocol"
import {
  clonePreviewAssetsForResponse,
  previewAssetTransferList,
} from "./preview-assets"

type RendererWorkerScope = Readonly<{
  addEventListener: (
    type: "message",
    listener: (event: MessageEvent<RendererWorkerRequest>) => void
  ) => void
  removeEventListener: (
    type: "message",
    listener: (event: MessageEvent<RendererWorkerRequest>) => void
  ) => void
  postMessage: (
    message: RendererWorkerResponse,
    transfer?: Transferable[]
  ) => void
}>

export function installRendererWorker(
  scope: RendererWorkerScope = globalThis as unknown as RendererWorkerScope,
  engineOptions: EngineOptions | PromiseLike<EngineOptions> = {}
): () => void {
  const compiledTemplates = new Map<string, CompiledTemplate>()
  const controllers = new Map<string, AbortController>()
  const enginePromise = Promise.resolve(engineOptions).then((options) =>
    createDocxPdfEngine(options)
  )

  const onMessage = (event: MessageEvent<RendererWorkerRequest>): void => {
    const request = event.data
    if (request.type === "cancel") {
      controllers.get(request.requestId)?.abort()
      return
    }
    const controller = new AbortController()
    controllers.set(request.requestId, controller)
    void (async () => {
      try {
        const engine = await enginePromise
        if (request.type === "compile") {
          progress(
            scope,
            request.requestId,
            "validating",
            1,
            4,
            "Inspect and validate DOCX"
          )
          const templateBytes = new Uint8Array(request.templateBytes)
          const inspection = await engine.inspect(templateBytes, {
            signal: controller.signal,
          })
          progress(
            scope,
            request.requestId,
            "compiling",
            2,
            4,
            "Compile template contract"
          )
          const compiled = await engine.compile(templateBytes, {
            unsupportedFeatures: "strict",
            signal: controller.signal,
          })
          progress(
            scope,
            request.requestId,
            "layout",
            3,
            4,
            "Lay out engine template preview"
          )
          const preview = await engine.preview(compiled, {
            signal: controller.signal,
          })
          compiledTemplates.clear()
          compiledTemplates.set(compiled.templateHash, compiled)
          if (!engine.fontRegistryHash) {
            throw new EngineOperationError(
              "browser/font-registry-missing",
              "The browser renderer requires an explicit font registry",
              []
            )
          }
          const previewAssets = clonePreviewAssetsForResponse(
            compiled.source.assets
          )
          const result: BrowserCompileResult = {
            engineVersion: engine.version,
            fontRegistryHash: engine.fontRegistryHash,
            templateHash: compiled.templateHash,
            manifest: compiled.manifest,
            jsonSchema: compiled.jsonSchema,
            starterData: compiled.starterData,
            templatePreview: {
              displayList: preview.displayList,
              placeholderNodes: preview.placeholderNodes,
              assets: previewAssets,
              layoutTrace: preview.layoutTrace,
            },
            inspection,
            diagnostics: Object.freeze([
              ...compiled.diagnostics,
              ...preview.diagnostics,
            ]),
          }
          progress(scope, request.requestId, "complete", 4, 4, "Template ready")
          respond(
            scope,
            {
              type: "success",
              requestId: request.requestId,
              operation: "compile",
              result,
            },
            previewAssetTransferList(previewAssets)
          )
          return
        }

        const compiled = compiledTemplates.get(request.templateHash)
        if (!compiled) {
          throw new EngineOperationError(
            "browser/template-missing",
            "The compiled template is no longer available; compile it again",
            []
          )
        }
        progress(
          scope,
          request.requestId,
          "resolving",
          1,
          2,
          "Resolve, lay out, and render PDF"
        )
        const rendered = await engine.render(compiled, request.data, {
          ...request.options,
          signal: controller.signal,
        })
        const pdf = rendered.pdf.slice().buffer
        progress(scope, request.requestId, "complete", 2, 2, "PDF ready")
        respond(
          scope,
          {
            type: "success",
            requestId: request.requestId,
            operation: "render",
            result: {
              pdf,
              pageCount: rendered.pageCount,
              diagnostics: rendered.diagnostics,
              timings: rendered.timings,
              resourceUsage: rendered.resourceUsage,
              ...(rendered.layoutTrace
                ? { layoutTrace: rendered.layoutTrace }
                : {}),
            },
          },
          [pdf]
        )
      } catch (error) {
        const failure = failureFrom(error)
        respond(scope, {
          type: "failure",
          requestId: request.requestId,
          ...failure,
        })
      } finally {
        controllers.delete(request.requestId)
      }
    })()
  }

  scope.addEventListener("message", onMessage)
  return () => {
    scope.removeEventListener("message", onMessage)
    for (const controller of controllers.values()) controller.abort()
    controllers.clear()
    compiledTemplates.clear()
  }
}

function progress(
  scope: RendererWorkerScope,
  requestId: string,
  stage: WorkerProgressStage,
  completed: number,
  total: number,
  message: string
): void {
  respond(scope, {
    type: "progress",
    progress: { requestId, stage, completed, total, message },
  })
}

function respond(
  scope: RendererWorkerScope,
  response: RendererWorkerResponse,
  transfer: Transferable[] = []
): void {
  scope.postMessage(response, transfer)
}

function failureFrom(error: unknown): Readonly<{
  code: string
  message: string
  diagnostics: readonly Diagnostic[]
}> {
  if (error instanceof EngineOperationError) {
    return {
      code: error.code,
      message: error.message,
      diagnostics: error.diagnostics,
    }
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return {
      code: "browser/aborted",
      message: "The operation was cancelled",
      diagnostics: [],
    }
  }
  return {
    code: "browser/internal",
    message:
      error instanceof Error ? error.message : "The render worker failed",
    diagnostics: [],
  }
}
