/**
 * Layout worker: runs layoutDocument(..., { includeTrace }) off the main thread.
 * Protocol shared with pagination plugin via protocol.ts.
 *
 * Holds a PreparedBlockCache across requests. Cancel messages mark the active
 * requestId stale so superseded results are not posted back.
 */
import type { SemanticDocument } from "@apexmed/core"
import { createPreparedBlockCache } from "@apexmed/layout"

import { layoutDocumentWithEmbeddedFonts } from "../pagination/layout-document"
import {
  handleLayoutRequest,
  type LayoutWorkerInbound,
  type LayoutWorkerOutbound,
} from "../pagination/protocol"

const preparedCache = createPreparedBlockCache()
let activeRequestId: string | null = null

async function layoutInWorker(
  document: SemanticDocument,
  options: { includeTrace: true; maxPages?: number }
) {
  return layoutDocumentWithEmbeddedFonts(document, {
    includeTrace: options.includeTrace,
    maxPages: options.maxPages,
    cache: preparedCache,
  })
}

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<LayoutWorkerInbound>) => void) | null
  postMessage: (message: LayoutWorkerOutbound) => void
}

workerScope.onmessage = (event: MessageEvent<LayoutWorkerInbound>) => {
  const message = event.data
  if (message.type === "cancel") {
    if (activeRequestId === message.requestId) {
      activeRequestId = null
    }
    return
  }
  const requestId = message.requestId
  activeRequestId = requestId
  void handleLayoutRequest(message, layoutInWorker).then((response) => {
    // Drop superseded results — a newer layout or cancel won the race.
    if (activeRequestId !== requestId) return
    workerScope.postMessage(response)
  })
}
