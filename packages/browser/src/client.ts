import type { RenderOptions } from "@apex-docx-pdf/core"

import type {
  BrowserCompileResult,
  BrowserRenderResult,
  RendererWorkerResponse,
  WorkerFailureResponse,
  WorkerProgress,
} from "./protocol"

export class BrowserRenderError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly diagnostics: WorkerFailureResponse["diagnostics"] = []
  ) {
    super(message)
    this.name = "BrowserRenderError"
  }
}

type PendingRequest = Readonly<{
  operation: "compile" | "render"
  resolve: (result: BrowserCompileResult | BrowserRenderResult) => void
  reject: (error: Error) => void
  onProgress?: (progress: WorkerProgress) => void
  removeAbortListener?: () => void
}>

export type BrowserRendererRequestOptions = Readonly<{
  signal?: AbortSignal
  onProgress?: (progress: WorkerProgress) => void
}>

export class BrowserRendererClient {
  private readonly pending = new Map<string, PendingRequest>()
  private requestSequence = 0
  private disposed = false

  constructor(private readonly worker: Worker) {
    worker.addEventListener("message", this.handleMessage)
    worker.addEventListener("error", this.handleWorkerError)
  }

  compile(
    templateBytes: Uint8Array,
    options: BrowserRendererRequestOptions = {}
  ): Promise<BrowserCompileResult> {
    const bytes = templateBytes.slice()
    return this.request<BrowserCompileResult>(
      "compile",
      (requestId) => ({
        type: "compile",
        requestId,
        templateBytes: bytes.buffer,
      }),
      [bytes.buffer],
      options
    )
  }

  render(
    templateHash: string,
    data: Readonly<Record<string, unknown>>,
    renderOptions: Omit<RenderOptions, "signal">,
    options: BrowserRendererRequestOptions = {}
  ): Promise<BrowserRenderResult> {
    return this.request<BrowserRenderResult>(
      "render",
      (requestId) => ({
        type: "render",
        requestId,
        templateHash,
        data,
        options: renderOptions,
      }),
      [],
      options
    )
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.worker.removeEventListener("message", this.handleMessage)
    this.worker.removeEventListener("error", this.handleWorkerError)
    this.worker.terminate()
    const error = new BrowserRenderError("browser/disposed", "Browser renderer was disposed")
    for (const pending of this.pending.values()) {
      pending.removeAbortListener?.()
      pending.reject(error)
    }
    this.pending.clear()
  }

  private request<T extends BrowserCompileResult | BrowserRenderResult>(
    operation: PendingRequest["operation"],
    message: (requestId: string) => object,
    transfer: Transferable[],
    options: BrowserRendererRequestOptions
  ): Promise<T> {
    if (this.disposed) {
      return Promise.reject(
        new BrowserRenderError("browser/disposed", "Browser renderer was disposed")
      )
    }
    options.signal?.throwIfAborted()
    const requestId = `request-${this.requestSequence}`
    this.requestSequence += 1

    return new Promise<T>((resolve, reject) => {
      const abort = (): void => {
        this.worker.postMessage({ type: "cancel", requestId })
        this.pending.delete(requestId)
        reject(options.signal?.reason ?? new DOMException("The operation was aborted", "AbortError"))
      }
      if (options.signal) options.signal.addEventListener("abort", abort, { once: true })
      this.pending.set(requestId, {
        operation,
        resolve: resolve as PendingRequest["resolve"],
        reject,
        onProgress: options.onProgress,
        removeAbortListener: options.signal
          ? () => options.signal?.removeEventListener("abort", abort)
          : undefined,
      })
      this.worker.postMessage(message(requestId), transfer)
    })
  }

  private readonly handleMessage = (event: MessageEvent<RendererWorkerResponse>): void => {
    const message = event.data
    if (message.type === "progress") {
      this.pending.get(message.progress.requestId)?.onProgress?.(message.progress)
      return
    }
    const pending = this.pending.get(message.requestId)
    if (!pending) return
    this.pending.delete(message.requestId)
    pending.removeAbortListener?.()

    if (message.type === "failure") {
      pending.reject(new BrowserRenderError(message.code, message.message, message.diagnostics))
      return
    }
    if (message.operation !== pending.operation) {
      pending.reject(
        new BrowserRenderError(
          "browser/protocol",
          `Expected ${pending.operation} response but received ${message.operation}`
        )
      )
      return
    }
    const result = message.result
    if (message.operation === "render" && "pdf" in result && result.pdf instanceof ArrayBuffer) {
      pending.resolve({ ...result, pdf: new Uint8Array(result.pdf) } as BrowserRenderResult)
      return
    }
    pending.resolve(result as BrowserCompileResult)
  }

  private readonly handleWorkerError = (): void => {
    const error = new BrowserRenderError("browser/worker", "The render worker stopped unexpectedly")
    for (const pending of this.pending.values()) {
      pending.removeAbortListener?.()
      pending.reject(error)
    }
    this.pending.clear()
  }
}

export class ObjectUrlLease {
  private current?: string

  replace(bytes: BlobPart, type: string): string {
    this.revoke()
    this.current = URL.createObjectURL(new Blob([bytes], { type }))
    return this.current
  }

  revoke(): void {
    if (!this.current) return
    URL.revokeObjectURL(this.current)
    this.current = undefined
  }
}
