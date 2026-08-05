export type RenderCacheInputs = Readonly<{
  engineVersion: string
  templateHash: string
  fontRegistryHash: string
  data: unknown
  renderOptions: unknown
}>

export type RenderCacheIdentity = Readonly<{
  dataHash: string
  renderOptionsHash: string
  cacheKey: string
}>

const cacheKeyDomain = "apex-docx-pdf/render-cache/v1"
const textEncoder = new TextEncoder()

/** Serializes JSON-compatible data with lexicographically sorted object keys. */
export function canonicalJson(value: unknown): string {
  return serializeCanonical(value, new WeakSet<object>())
}

/** Computes a lowercase SHA-256 digest using the browser Web Crypto API. */
export async function sha256Hex(value: string | BufferSource): Promise<string> {
  const bytes = typeof value === "string" ? textEncoder.encode(value) : value
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
}

/**
 * Computes all hashes needed to look up or persist a rendered artifact.
 * The final digest uses length-prefixed UTF-8 fields to prevent ambiguity.
 */
export async function computeRenderCacheIdentity(
  inputs: RenderCacheInputs
): Promise<RenderCacheIdentity> {
  const [dataHash, renderOptionsHash] = await Promise.all([
    sha256Hex(canonicalJson(inputs.data)),
    sha256Hex(canonicalJson(inputs.renderOptions)),
  ])
  const cacheKey = await sha256Hex(
    frameCacheKeyFields([
      cacheKeyDomain,
      inputs.engineVersion,
      inputs.templateHash,
      inputs.fontRegistryHash,
      dataHash,
      renderOptionsHash,
    ])
  )

  return { dataHash, renderOptionsHash, cacheKey }
}

function serializeCanonical(
  value: unknown,
  ancestors: WeakSet<object>
): string {
  if (value === null) return "null"

  switch (typeof value) {
    case "string":
    case "boolean":
      return JSON.stringify(value)
    case "number":
      if (!Number.isFinite(value)) {
        throw new TypeError(
          "Canonical JSON does not support non-finite numbers"
        )
      }
      return JSON.stringify(value)
    case "undefined":
    case "function":
    case "symbol":
    case "bigint":
      throw new TypeError(`Canonical JSON does not support ${typeof value}`)
    case "object":
      return serializeObject(value, ancestors)
  }

  throw new TypeError("Canonical JSON received an unsupported value")
}

function serializeObject(value: object, ancestors: WeakSet<object>): string {
  if (ancestors.has(value)) {
    throw new TypeError("Canonical JSON does not support cyclic values")
  }
  ancestors.add(value)

  try {
    if (Array.isArray(value)) {
      const items = Array.from({ length: value.length }, (_, index) =>
        serializeCanonical(value[index], ancestors)
      )
      return `[${items.join(",")}]`
    }

    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(
        "Canonical JSON only supports plain objects and arrays"
      )
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new TypeError("Canonical JSON does not support symbol keys")
    }

    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${serializeCanonical(record[key], ancestors)}`
      )
      .join(",")}}`
  } finally {
    ancestors.delete(value)
  }
}

function frameCacheKeyFields(
  fields: readonly string[]
): Uint8Array<ArrayBuffer> {
  const encoded = fields.map((field) => textEncoder.encode(field))
  const length = encoded.reduce((total, field) => total + 4 + field.length, 0)
  const framed = new Uint8Array(length)
  const view = new DataView(framed.buffer)
  let offset = 0

  for (const field of encoded) {
    view.setUint32(offset, field.length, false)
    offset += 4
    framed.set(field, offset)
    offset += field.length
  }

  return framed
}
