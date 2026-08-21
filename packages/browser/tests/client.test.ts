import { describe, expect, test } from "bun:test"
import { loadOfflineFontConfiguration } from "../../../scripts/offline-font-configuration"
import {
  buildPhase6DocumentDocx,
  generatedJpeg,
  generatedPng,
} from "../../engine/tests/fixtures/phase6-document-docx"

import { BrowserRenderError, BrowserRendererClient } from "../src/client"
import {
  clonePreviewAssetsForResponse,
  previewAssetTransferList,
} from "../src/preview-assets"
import type {
  BrowserCompileResult,
  RendererWorkerResponse,
} from "../src/protocol"
import { installRendererWorker } from "../src/worker"

class FakeWorker extends EventTarget {
  readonly messages: unknown[] = []
  terminated = false
  failNextPost = false

  postMessage(message: unknown): void {
    if (this.failNextPost) {
      this.failNextPost = false
      throw new DOMException("could not clone", "DataCloneError")
    }
    this.messages.push(message)
  }

  terminate(): void {
    this.terminated = true
  }

  reply(data: unknown): void {
    this.dispatchEvent(new MessageEvent("message", { data }))
  }

  fail(): void {
    this.dispatchEvent(new Event("error"))
  }
}

function asWorker(worker: FakeWorker): Worker {
  return worker as unknown as Worker
}

describe("BrowserRendererClient", () => {
  test("forwards the canonical engine template preview from compile", async () => {
    const worker = new FakeWorker()
    const client = new BrowserRendererClient(asWorker(worker))
    const pending = client.compile(new Uint8Array([1, 2, 3]))
    const templatePreview = {
      displayList: { pages: [] },
      placeholderNodes: { "node-1": "patient.name" },
      assets: [],
      layoutTrace: { pages: [], events: [] },
    }

    worker.reply({
      type: "success",
      requestId: "request-0",
      operation: "compile",
      result: {
        engineVersion: "test",
        fontRegistryHash: "font-hash",
        templateHash: "template-hash",
        manifest: { fields: [] },
        jsonSchema: {},
        starterData: {},
        templatePreview,
        inspection: {
          documentModelAvailable: true,
          requiredFonts: [],
          requiredFontEntryCount: 0,
          requiredFontsTruncated: false,
          features: [],
          featureEntryCount: 0,
          featuresTruncated: false,
          diagnostics: [],
          sourceLimitPerEntry: 20,
          entryLimit: 200,
        },
        diagnostics: [],
      },
    })

    await expect(pending).resolves.toMatchObject({ templatePreview })
    client.dispose()
  })

  test("cleans up an aborted request even when posting cancellation fails", async () => {
    const worker = new FakeWorker()
    const client = new BrowserRendererClient(asWorker(worker))
    const controller = new AbortController()
    const pending = client.compile(new Uint8Array([1, 2, 3]), {
      signal: controller.signal,
    })

    worker.failNextPost = true
    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: "AbortError" })
    expect(worker.messages).toHaveLength(1)
    client.dispose()
  })

  test("becomes terminal after the worker emits an error", async () => {
    const worker = new FakeWorker()
    const client = new BrowserRendererClient(asWorker(worker))
    const pending = client.compile(new Uint8Array([1]))

    worker.fail()

    await expect(pending).rejects.toBeInstanceOf(BrowserRenderError)
    await expect(client.compile(new Uint8Array([2]))).rejects.toMatchObject({
      code: "browser/worker",
    })
    expect(worker.messages).toHaveLength(1)
    client.dispose()
  })

  test("removes its listeners and terminates the worker on dispose", () => {
    const worker = new FakeWorker()
    const client = new BrowserRendererClient(asWorker(worker))

    client.dispose()

    expect(worker.terminated).toBe(true)
  })
})

describe("installRendererWorker", () => {
  test("transfers unique preview buffers while retaining cached render assets", async () => {
    let listener:
      | ((event: MessageEvent<{ type: string; requestId: string }>) => void)
      | undefined
    const responses: RendererWorkerResponse[] = []
    const transferLists: Transferable[][] = []
    const scope = {
      addEventListener: (
        _type: "message",
        next: (event: MessageEvent<{ type: string; requestId: string }>) => void
      ) => {
        listener = next
      },
      removeEventListener: () => undefined,
      postMessage: (
        message: RendererWorkerResponse,
        transfer: Transferable[] = []
      ) => {
        transferLists.push(transfer)
        responses.push(structuredClone(message, { transfer }))
      },
    }
    const cleanup = installRendererWorker(scope as never, {
      fonts: await loadOfflineFontConfiguration(),
    })

    const templateBytes = buildPhase6DocumentDocx()
    listener?.(
      new MessageEvent("message", {
        data: {
          type: "compile",
          requestId: "compile-with-assets",
          templateBytes: templateBytes.slice().buffer,
        },
      })
    )
    const compileResponse = await waitForTerminalResponse(
      responses,
      "compile-with-assets"
    )
    expect(compileResponse).toMatchObject({
      type: "success",
      operation: "compile",
    })
    if (
      compileResponse.type !== "success" ||
      compileResponse.operation !== "compile"
    ) {
      throw new Error("Expected compile success")
    }
    const compileResult = compileResponse.result as BrowserCompileResult
    expect(progressFor(responses, "compile-with-assets")).toEqual([
      ["validating", 1, 4, "Inspect and validate DOCX"],
      ["compiling", 2, 4, "Compile template contract"],
      ["layout", 3, 4, "Lay out engine template preview"],
      ["complete", 4, 4, "Template ready"],
    ])
    const previewAssets = compileResult.templatePreview.assets
    expect(previewAssets).toHaveLength(2)
    expect(previewAssets.map(({ bytes }) => [...bytes])).toEqual([
      [...generatedPng()],
      [...generatedJpeg()],
    ])
    const compileTransfers = transferLists.at(-1) ?? []
    expect(compileTransfers).toHaveLength(2)
    expect(new Set(compileTransfers).size).toBe(2)

    listener?.(
      new MessageEvent("message", {
        data: {
          type: "render",
          requestId: "render-from-cache",
          templateHash: compileResult.templateHash,
          data: { patient: { name: "Amara Mokoena" } },
          options: {
            locale: "en-ZA",
            timeZone: "Africa/Johannesburg",
          },
        },
      })
    )
    const renderResponse = await waitForTerminalResponse(
      responses,
      "render-from-cache"
    )
    expect(renderResponse).toMatchObject({
      type: "success",
      operation: "render",
      result: { pageCount: 3 },
    })
    if (
      renderResponse.type !== "success" ||
      renderResponse.operation !== "render"
    ) {
      throw new Error("Expected render success")
    }
    const renderResult = renderResponse.result as {
      pdf: ArrayBuffer
      resourceUsage: {
        templateBytes: number
        archiveEntries: number
        decompressedBytes: number
        expandedNodes: number
        expandedTextBytes: number
        pages: number
      }
    }
    expect(progressFor(responses, "render-from-cache")).toEqual([
      ["resolving", 1, 2, "Resolve, lay out, and render PDF"],
      ["complete", 2, 2, "PDF ready"],
    ])
    expect(new Uint8Array(renderResult.pdf).slice(0, 5)).toEqual(
      new TextEncoder().encode("%PDF-")
    )
    expect(renderResult.resourceUsage).toEqual({
      templateBytes: templateBytes.byteLength,
      archiveEntries: 10,
      decompressedBytes: 5448,
      expandedNodes: 37,
      expandedTextBytes: 222,
      pages: 3,
    })
    cleanup()
  })

  test("deduplicates shared preview buffers without transferring source bytes", () => {
    const sourceBytes = Uint8Array.of(1, 2, 3, 4)
    const responseAssets = clonePreviewAssetsForResponse([
      { id: "first", mimeType: "image/png", bytes: sourceBytes },
      { id: "second", mimeType: "image/webp", bytes: sourceBytes },
    ])
    const sharedBytes = responseAssets[0]?.bytes
    if (!sharedBytes) throw new Error("Expected cloned preview bytes")
    const sharedAssets = responseAssets.map((asset) => ({
      ...asset,
      bytes: sharedBytes,
    }))

    const transfer = previewAssetTransferList(sharedAssets)
    const mainThreadAssets = structuredClone(sharedAssets, { transfer })

    expect(transfer).toHaveLength(1)
    expect(mainThreadAssets.map(({ bytes }) => [...bytes])).toEqual([
      [1, 2, 3, 4],
      [1, 2, 3, 4],
    ])
    expect([...sourceBytes]).toEqual([1, 2, 3, 4])
  })

  test("aborts a queued compile before engine initialization completes", async () => {
    let listener:
      | ((event: MessageEvent<{ type: string; requestId: string }>) => void)
      | undefined
    const responses: unknown[] = []
    let resolveOptions: (() => void) | undefined
    const engineOptions = new Promise<Record<string, never>>((resolve) => {
      resolveOptions = () => resolve({})
    })
    const scope = {
      addEventListener: (
        _type: "message",
        next: (event: MessageEvent<{ type: string; requestId: string }>) => void
      ) => {
        listener = next
      },
      removeEventListener: () => undefined,
      postMessage: (message: unknown) => responses.push(message),
    }

    const cleanup = installRendererWorker(scope as never, engineOptions)
    listener?.(
      new MessageEvent("message", {
        data: {
          type: "compile",
          requestId: "queued-compile",
          templateBytes: new ArrayBuffer(0),
        },
      })
    )
    listener?.(
      new MessageEvent("message", {
        data: { type: "cancel", requestId: "queued-compile" },
      })
    )
    resolveOptions?.()

    for (
      let attempt = 0;
      attempt < 20 && responses.length === 0;
      attempt += 1
    ) {
      await Bun.sleep(0)
    }
    expect(responses).toContainEqual({
      type: "failure",
      requestId: "queued-compile",
      code: "browser/aborted",
      message: "The operation was cancelled",
      diagnostics: [],
    })
    expect(responses).not.toContainEqual(
      expect.objectContaining({ type: "success" })
    )
    cleanup()
  })

  test("uninstalls the message listener during cleanup", () => {
    let installed: ((event: MessageEvent) => void) | undefined
    let removed: ((event: MessageEvent) => void) | undefined
    const scope = {
      addEventListener: (
        _type: "message",
        listener: (event: MessageEvent) => void
      ) => {
        installed = listener
      },
      removeEventListener: (
        _type: "message",
        listener: (event: MessageEvent) => void
      ) => {
        removed = listener
      },
      postMessage: () => undefined,
    }

    const cleanup = installRendererWorker(scope)
    cleanup()

    expect(removed).toBe(installed)
  })
})

function progressFor(
  responses: readonly RendererWorkerResponse[],
  requestId: string
): readonly (readonly [string, number, number, string])[] {
  return responses.flatMap((response) =>
    response.type === "progress" && response.progress.requestId === requestId
      ? [
          [
            response.progress.stage,
            response.progress.completed,
            response.progress.total,
            response.progress.message,
          ] as const,
        ]
      : []
  )
}

async function waitForTerminalResponse(
  responses: readonly RendererWorkerResponse[],
  requestId: string
): Promise<RendererWorkerResponse & { type: "success" | "failure" }> {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const response = responses.find(
      (candidate) =>
        candidate.type !== "progress" && candidate.requestId === requestId
    )
    if (response?.type === "success" || response?.type === "failure") {
      return response
    }
    await Bun.sleep(10)
  }
  throw new Error(`Timed out waiting for ${requestId}`)
}
