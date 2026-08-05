import { describe, expect, test } from "bun:test"

import { uploadToConvexStorage } from "../src/lib/convex-upload"

describe("Convex direct storage upload", () => {
  test("posts bytes with the explicit content type and returns the storage ID", async () => {
    const bytes = new Uint8Array([1, 2, 3])
    let request: RequestInit | undefined
    const result = await uploadToConvexStorage(
      "https://upload.invalid/generated",
      bytes,
      "application/pdf",
      async (_input, init) => {
        request = init
        return Response.json({ storageId: "kg2abc123" })
      }
    )

    expect(result).toEqual({ storageId: "kg2abc123" })
    expect(request?.method).toBe("POST")
    expect(request?.headers).toEqual({ "Content-Type": "application/pdf" })
    expect(request?.body).toBe(bytes)
  })

  test("rejects non-successful responses without inspecting their contents", async () => {
    let jsonRead = false
    const response = new Response("private provider response", { status: 503 })
    const originalJson = response.json.bind(response)
    response.json = async () => {
      jsonRead = true
      return originalJson()
    }

    await expect(
      uploadToConvexStorage(
        "https://upload.invalid/generated",
        new Blob(["artifact"]),
        "application/pdf",
        async () => response
      )
    ).rejects.toThrow("status 503")
    expect(jsonRead).toBe(false)
  })

  test("strictly rejects malformed success payloads", async () => {
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
          async () => Response.json(payload)
        )
      ).rejects.toThrow("invalid response")
    }
  })
})
