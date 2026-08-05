import { describe, expect, test } from "bun:test"

import { BrowserRenderError, BrowserRendererClient } from "../src/client"
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
