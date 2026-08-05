export type ConvexUploadBody = Blob | ArrayBuffer | Uint8Array<ArrayBuffer>

export type ConvexUploadResult = Readonly<{
  storageId: string
}>

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

/** Uploads artifact bytes directly to a generated Convex storage upload URL. */
export async function uploadToConvexStorage(
  uploadUrl: string,
  body: ConvexUploadBody,
  contentType: string,
  fetcher: Fetch = fetch
): Promise<ConvexUploadResult> {
  const response = await fetcher(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body,
  })

  if (!response.ok) {
    throw new Error(
      `Convex storage upload failed with status ${response.status}`
    )
  }

  const payload: unknown = await response.json()
  if (!isStrictUploadResult(payload)) {
    throw new Error("Convex storage upload returned an invalid response")
  }
  return payload
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
