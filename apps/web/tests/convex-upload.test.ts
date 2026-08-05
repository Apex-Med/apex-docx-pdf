import { describe, expect, test } from "bun:test"

import {
  type ConvexUploadTransport,
  uploadToConvexStorage,
} from "../src/lib/convex-upload"

describe("Convex direct storage upload", () => {
  test("posts bytes with the explicit content type through the fetch fallback", async () => {
    const bytes = new Uint8Array([1, 2, 3])
    let request: RequestInit | undefined
    const result = await uploadToConvexStorage(
      "https://upload.invalid/generated",
      bytes,
      "application/pdf",
      {
        fetcher: async (_input, init) => {
          request = init
          return Response.json({ storageId: "kg2abc123" })
        },
      }
    )

    expect(result).toEqual({ storageId: "kg2abc123" })
    expect(request?.method).toBe("POST")
    expect(request?.headers).toEqual({ "Content-Type": "application/pdf" })
    expect(request?.body).toBe(bytes)
  })

  test("reports bounded monotonic byte progress", async () => {
    const progress: number[] = []
    const transport: ConvexUploadTransport = async (request) => {
      request.onProgress?.(4)
      request.onProgress?.(2)
      request.onProgress?.(99)
      return responseWith({ storageId: "progress-id" })
    }

    await uploadToConvexStorage(
      "https://upload.invalid/generated",
      new Uint8Array(8),
      "application/pdf",
      {
        transport,
        onProgress: ({ loadedBytes }) => progress.push(loadedBytes),
      }
    )

    expect(progress).toEqual([0, 4, 8])
  })

  test("passes AbortSignal to the transport and rejects an aborted upload", async () => {
    const controller = new AbortController()
    let receivedSignal: AbortSignal | undefined
    const transport: ConvexUploadTransport = async (request) => {
      receivedSignal = request.signal
      await new Promise<void>((_resolve, reject) => {
        request.signal?.addEventListener(
          "abort",
          () => reject(request.signal?.reason),
          { once: true }
        )
      })
      return responseWith({ storageId: "unreachable" })
    }
    const upload = uploadToConvexStorage(
      "https://upload.invalid/generated",
      new Blob(["artifact"]),
      "application/pdf",
      { signal: controller.signal, transport }
    )

    controller.abort()

    await expect(upload).rejects.toMatchObject({ name: "AbortError" })
    expect(receivedSignal).toBe(controller.signal)
  })

  test("rejects transport errors without replacing their details", async () => {
    const networkError = new Error("connection closed")
    await expect(
      uploadToConvexStorage(
        "https://upload.invalid/generated",
        new ArrayBuffer(0),
        "application/octet-stream",
        { transport: async () => Promise.reject(networkError) }
      )
    ).rejects.toBe(networkError)
  })

  test("rejects non-successful responses without inspecting their contents", async () => {
    let jsonRead = false
    await expect(
      uploadToConvexStorage(
        "https://upload.invalid/generated",
        new Blob(["artifact"]),
        "application/pdf",
        {
          transport: async () => ({
            ok: false,
            status: 503,
            json: async () => {
              jsonRead = true
              return { provider: "private" }
            },
          }),
        }
      )
    ).rejects.toThrow("status 503")
    expect(jsonRead).toBe(false)
  })

  test("strictly rejects malformed success payloads and invalid JSON", async () => {
    for (const payload of [
      null,
      {},
      { storageId: "" },
      { storageId: 123 },
      { storageId: "valid", extra: true },
      ["storageId"],
    ]) {
      await expect(
        uploadToConvexStorage(
          "https://upload.invalid/generated",
          new ArrayBuffer(0),
          "application/octet-stream",
          { transport: async () => responseWith(payload) }
        )
      ).rejects.toThrow("invalid response")
    }

    await expect(
      uploadToConvexStorage(
        "https://upload.invalid/generated",
        new ArrayBuffer(0),
        "application/octet-stream",
        {
          transport: async () => ({
            ok: true,
            status: 200,
            json: async () => Promise.reject(new SyntaxError("invalid JSON")),
          }),
        }
      )
    ).rejects.toThrow("invalid response")
  })
})

function responseWith(payload: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  }
}
