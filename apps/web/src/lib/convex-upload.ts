export type ConvexUploadBody = Blob | ArrayBuffer | Uint8Array<ArrayBuffer>

export type ConvexUploadResult = Readonly<{
  storageId: string
}>

export type ConvexUploadProgress = Readonly<{
  loadedBytes: number
  totalBytes: number
}>

export type ConvexUploadRequest = Readonly<{
  uploadUrl: string
  body: ConvexUploadBody
  contentType: string
  signal?: AbortSignal
  onProgress?: (loadedBytes: number) => void
}>

export type ConvexUploadResponse = Readonly<{
  ok: boolean
  status: number
  json: () => Promise<unknown>
}>

export type ConvexUploadTransport = (
  request: ConvexUploadRequest
) => Promise<ConvexUploadResponse>

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export type ConvexUploadOptions = Readonly<{
  signal?: AbortSignal
  onProgress?: (progress: ConvexUploadProgress) => void
  transport?: ConvexUploadTransport
  fetcher?: Fetch
}>

/** Uploads artifact bytes directly to a generated Convex storage upload URL. */
export async function uploadToConvexStorage(
  uploadUrl: string,
  body: ConvexUploadBody,
  contentType: string,
  options: ConvexUploadOptions = {}
): Promise<ConvexUploadResult> {
  const totalBytes = bodyByteLength(body)
  let loadedBytes = 0
  let hasReportedProgress = false
  const reportProgress = (nextLoadedBytes: number) => {
    const boundedLoadedBytes = Math.max(
      loadedBytes,
      Math.min(totalBytes, Math.max(0, nextLoadedBytes))
    )
    if (hasReportedProgress && boundedLoadedBytes === loadedBytes) return
    loadedBytes = boundedLoadedBytes
    hasReportedProgress = true
    options.onProgress?.({ loadedBytes, totalBytes })
  }

  options.signal?.throwIfAborted()
  reportProgress(0)
  const transport =
    options.transport ??
    (options.fetcher
      ? createFetchUploadTransport(options.fetcher)
      : typeof XMLHttpRequest === "function"
        ? xhrUploadTransport
        : createFetchUploadTransport(fetch))
  const response = await transport({
    uploadUrl,
    body,
    contentType,
    signal: options.signal,
    onProgress: reportProgress,
  })

  if (!response.ok) {
    throw new Error(
      `Convex storage upload failed with status ${response.status}`
    )
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error("Convex storage upload returned an invalid response")
  }
  if (!isStrictUploadResult(payload)) {
    throw new Error("Convex storage upload returned an invalid response")
  }
  if (loadedBytes < totalBytes) reportProgress(totalBytes)
  return payload
}

/** Browser transport with upload progress and native AbortSignal support. */
export const xhrUploadTransport: ConvexUploadTransport = (request) =>
  new Promise((resolve, reject) => {
    request.signal?.throwIfAborted()
    const xhr = new XMLHttpRequest()
    const cleanup = () => {
      request.signal?.removeEventListener("abort", handleSignalAbort)
      xhr.upload.onprogress = null
      xhr.onload = null
      xhr.onerror = null
      xhr.onabort = null
    }
    const handleSignalAbort = () => {
      cleanup()
      xhr.abort()
      reject(request.signal?.reason ?? createAbortError())
    }

    xhr.open("POST", request.uploadUrl)
    xhr.setRequestHeader("Content-Type", request.contentType)
    xhr.responseType = "text"
    xhr.upload.onprogress = (event) => request.onProgress?.(event.loaded)
    xhr.onload = () => {
      cleanup()
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        json: async () => JSON.parse(xhr.responseText) as unknown,
      })
    }
    xhr.onerror = () => {
      cleanup()
      reject(
        new Error("Convex storage upload failed because of a network error")
      )
    }
    xhr.onabort = () => {
      cleanup()
      reject(createAbortError())
    }
    request.signal?.addEventListener("abort", handleSignalAbort, { once: true })
    if (request.signal?.aborted) {
      handleSignalAbort()
      return
    }
    try {
      xhr.send(request.body)
    } catch (error) {
      cleanup()
      reject(error)
    }
  })

export function createFetchUploadTransport(
  fetcher: Fetch
): ConvexUploadTransport {
  return async ({ uploadUrl, body, contentType, signal }) =>
    await fetcher(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body,
      signal,
    })
}

function bodyByteLength(body: ConvexUploadBody) {
  return body instanceof Blob ? body.size : body.byteLength
}

function createAbortError() {
  return new DOMException("The upload was aborted", "AbortError")
}

function isStrictUploadResult(value: unknown): value is ConvexUploadResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false
  }
  const keys = Object.keys(value)
  if (keys.length !== 1 || keys[0] !== "storageId") return false
  return (
    "storageId" in value &&
    typeof value.storageId === "string" &&
    value.storageId.length > 0
  )
}
