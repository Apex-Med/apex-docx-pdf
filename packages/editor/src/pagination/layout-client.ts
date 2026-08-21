import type { SemanticDocument } from "@apexmed/core"
import {
  createPreparedBlockCache,
  layoutDocument,
  type PreparedBlockCache,
} from "@apexmed/layout"

import {
  handleLayoutRequest,
  type LayoutWorkerRequest,
  type LayoutWorkerSuccess,
  type LayoutWorkerOutbound,
} from "./protocol"
import type { PaginationLayoutFn } from "./plugin"
import { layoutDocumentWithEmbeddedFonts } from "./layout-document"

export type LayoutClient = {
  layout: PaginationLayoutFn
  dispose: () => void
  /** True when layout runs in a Web Worker (off main thread). */
  readonly offMainThread: boolean
  /** Cancel the in-flight async request (if any) and drop its result. */
  cancel: () => void
}

type Pending = {
  resolve: (value: LayoutWorkerSuccess | null) => void
  requestId: string
  document: SemanticDocument
  options: { includeTrace: true; maxPages?: number }
  timeoutId?: ReturnType<typeof setTimeout>
}

const DEFAULT_WORKER_TIMEOUT_MS = 1_000

/**
 * Create a layout client that prefers a Web Worker for off-main-thread
 * layoutDocument(..., { includeTrace }). Falls back to in-process for tests
 * and environments without Worker support.
 *
 * Superseded requests are cancelled: prior pending promises resolve to `null`
 * and late worker responses for stale requestIds are ignored.
 */
export function createLayoutClient(
  options: Readonly<{
    /** Force in-process layout (unit tests). */
    forceInProcess?: boolean
    /** Custom worker factory; defaults to new URL("./../worker/layout.worker.ts"). */
    createWorker?: () => Worker
    /** Optional shared prepared-block cache (identity-preserving re-layouts). */
    cache?: PreparedBlockCache
    /** Time before a non-responsive worker is replaced by in-process layout. */
    workerTimeoutMs?: number
  }> = {}
): LayoutClient {
  const preparedCache = options.cache ?? createPreparedBlockCache()
  const workerTimeoutMs = Math.max(
    1,
    options.workerTimeoutMs ?? DEFAULT_WORKER_TIMEOUT_MS
  )

  if (options.forceInProcess || typeof Worker === "undefined") {
    let latestRequestId = 0
    let disposed = false
    const layoutAsync = async (
      document: SemanticDocument,
      opts: { includeTrace: true; maxPages?: number }
    ): Promise<LayoutWorkerSuccess | null> => {
      if (disposed) return null
      const requestId = ++latestRequestId
      const result = await layoutInProcess(document, {
        ...opts,
        cache: preparedCache,
      })
      // Drop superseded in-process results.
      if (disposed || requestId !== latestRequestId) return null
      return result
    }
    return {
      offMainThread: false,
      dispose: () => {
        disposed = true
        latestRequestId += 1
      },
      cancel: () => {
        latestRequestId += 1
      },
      layout: (document, opts) =>
        layoutDocument(document, {
          includeTrace: opts.includeTrace,
          maxPages: opts.maxPages,
          cache: preparedCache,
        }),
      ...({
        layoutAsync,
      } as object),
    } as LayoutClient & { layoutAsync: typeof layoutAsync }
  }

  let worker: Worker | null = null
  let requestCounter = 0
  let latestRequestId: string | null = null
  let disposed = false
  const pending = new Map<string, Pending>()

  try {
    worker =
      options.createWorker?.() ??
      new Worker(new URL("../worker/layout.worker.ts", import.meta.url), {
        type: "module",
      })
  } catch {
    let latestInProcess = 0
    const layoutAsync = async (
      document: SemanticDocument,
      opts: { includeTrace: true; maxPages?: number }
    ): Promise<LayoutWorkerSuccess | null> => {
      const requestId = ++latestInProcess
      const result = await layoutInProcess(document, {
        ...opts,
        cache: preparedCache,
      })
      if (requestId !== latestInProcess) return null
      return result
    }
    return {
      offMainThread: false,
      dispose: () => {
        latestInProcess += 1
      },
      cancel: () => {
        latestInProcess += 1
      },
      layout: (document, opts) =>
        layoutDocument(document, {
          includeTrace: opts.includeTrace,
          maxPages: opts.maxPages,
          cache: preparedCache,
        }),
      ...({
        layoutAsync,
      } as object),
    } as LayoutClient & { layoutAsync: typeof layoutAsync }
  }

  const cancelPending = (exceptRequestId?: string): void => {
    for (const [id, entry] of pending) {
      if (exceptRequestId !== undefined && id === exceptRequestId) continue
      pending.delete(id)
      if (entry.timeoutId !== undefined) clearTimeout(entry.timeoutId)
      entry.resolve(null)
      worker?.postMessage({ type: "cancel", requestId: id })
    }
  }

  const resolveWithInProcessFallback = (entry: Pending): void => {
    void layoutInProcess(entry.document, {
      ...entry.options,
      cache: preparedCache,
    }).then((result) => {
      if (disposed || latestRequestId !== entry.requestId) {
        entry.resolve(null)
        return
      }
      entry.resolve(result)
    })
  }

  const disableWorkerAndFallback = (message: string): void => {
    console.warn(
      `[apex-editor:pagination] ${message}; using in-process layout fallback`
    )
    worker?.terminate()
    worker = null
    const entries = [...pending.values()]
    pending.clear()
    for (const entry of entries) {
      if (entry.timeoutId !== undefined) clearTimeout(entry.timeoutId)
      resolveWithInProcessFallback(entry)
    }
  }

  worker.onmessage = (event: MessageEvent<LayoutWorkerOutbound>) => {
    const response = event.data
    // Ignore superseded/stale results even if still briefly mapped.
    if (latestRequestId !== null && response.requestId !== latestRequestId) {
      pending.delete(response.requestId)
      return
    }
    const entry = pending.get(response.requestId)
    if (!entry) return
    pending.delete(response.requestId)
    if (entry.timeoutId !== undefined) clearTimeout(entry.timeoutId)
    if (response.type === "success") entry.resolve(response)
    else {
      console.warn(
        `[apex-editor:pagination] layout worker returned ${response.code}: ${response.message}; using in-process layout fallback`
      )
      worker?.terminate()
      worker = null
      resolveWithInProcessFallback(entry)
    }
  }

  worker.onerror = (event) => {
    disableWorkerAndFallback(
      event.message
        ? `layout worker failed: ${event.message}`
        : "layout worker failed"
    )
  }

  const layoutAsync = async (
    document: SemanticDocument,
    opts: { includeTrace: true; maxPages?: number }
  ): Promise<LayoutWorkerSuccess | null> => {
    if (disposed) return null
    // Abort any in-flight work so only the latest request can settle.
    cancelPending()
    const requestId = `layout-${++requestCounter}`
    latestRequestId = requestId
    if (!worker) {
      return layoutInProcess(document, {
        ...opts,
        cache: preparedCache,
      })
    }
    const request: LayoutWorkerRequest = {
      type: "layout",
      requestId,
      document,
      includeTrace: true,
      maxPages: opts.maxPages,
    }
    return new Promise((resolve) => {
      const entry: Pending = {
        resolve,
        requestId,
        document,
        options: opts,
      }
      pending.set(requestId, entry)
      entry.timeoutId = setTimeout(() => {
        if (!pending.has(requestId)) return
        disableWorkerAndFallback(
          `layout worker timed out after ${workerTimeoutMs}ms`
        )
      }, workerTimeoutMs)
      try {
        worker?.postMessage(request)
      } catch (error) {
        pending.delete(requestId)
        if (entry.timeoutId !== undefined) clearTimeout(entry.timeoutId)
        console.warn(
          `[apex-editor:pagination] layout worker postMessage failed: ${error instanceof Error ? error.message : String(error)}; using in-process layout fallback`
        )
        worker?.terminate()
        worker = null
        resolveWithInProcessFallback(entry)
      }
    })
  }

  return {
    get offMainThread() {
      return worker !== null
    },
    dispose: () => {
      disposed = true
      cancelPending()
      latestRequestId = null
      worker?.terminate()
      worker = null
    },
    cancel: () => {
      cancelPending()
      latestRequestId = null
    },
    layout: (document, opts) =>
      layoutDocument(document, {
        includeTrace: opts.includeTrace,
        maxPages: opts.maxPages,
        cache: preparedCache,
      }),
    ...({
      layoutAsync,
    } as object),
  } as LayoutClient & { layoutAsync: typeof layoutAsync }
}

/** Type-safe access to the async worker path when present. */
export function getLayoutAsync(
  client: LayoutClient
):
  | ((
      document: SemanticDocument,
      opts: { includeTrace: true; maxPages?: number }
    ) => Promise<LayoutWorkerSuccess | null>)
  | null {
  const maybe = client as LayoutClient & {
    layoutAsync?: (
      document: SemanticDocument,
      opts: { includeTrace: true; maxPages?: number }
    ) => Promise<LayoutWorkerSuccess | null>
  }
  return maybe.layoutAsync ?? null
}

/** In-process layout used by tests and as Worker body fallback. */
export async function layoutInProcess(
  document: SemanticDocument,
  options: {
    includeTrace: true
    maxPages?: number
    cache?: PreparedBlockCache
  }
): Promise<LayoutWorkerSuccess | null> {
  const request: LayoutWorkerRequest = {
    type: "layout",
    requestId: "in-process",
    document,
    includeTrace: true,
    maxPages: options.maxPages,
  }
  const cache = options.cache
  const response = await handleLayoutRequest(request, (doc, opts) =>
    layoutDocumentWithEmbeddedFonts(doc, {
      includeTrace: opts.includeTrace,
      maxPages: opts.maxPages,
      ...(cache ? { cache } : {}),
    })
  )
  return response.type === "success" ? response : null
}
