import type { SemanticImageMimeType } from "@apexmed/core"

export type ImageDimensions = Readonly<{
  width: number
  height: number
  mimeType: SemanticImageMimeType
}>

/**
 * Sniff image dimensions from common container headers without decoding pixels.
 * Returns undefined when the format or size cannot be determined from bytes alone.
 */
export function sniffImageDimensions(
  bytes: Uint8Array,
  declaredMime?: SemanticImageMimeType
): ImageDimensions | undefined {
  if (isPng(bytes)) {
    if (bytes.length < 24) return undefined
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const width = view.getUint32(16)
    const height = view.getUint32(20)
    if (width < 1 || height < 1) return undefined
    return { width, height, mimeType: "image/png" }
  }
  if (isJpeg(bytes)) {
    const size = jpegSize(bytes)
    return size ? { ...size, mimeType: "image/jpeg" } : undefined
  }
  if (isGif(bytes)) {
    const width = bytes[6]! | (bytes[7]! << 8)
    const height = bytes[8]! | (bytes[9]! << 8)
    if (width < 1 || height < 1) return undefined
    return { width, height, mimeType: "image/gif" }
  }
  if (isWebp(bytes)) {
    const size = webpSize(bytes)
    return size ? { ...size, mimeType: "image/webp" } : undefined
  }
  if (isAvif(bytes)) {
    const size = avifSize(bytes)
    return size ? { ...size, mimeType: "image/avif" } : undefined
  }
  if (declaredMime === "image/svg+xml" || looksLikeSvg(bytes)) {
    // SVG size is resolved from markup elsewhere; report a placeholder aspect.
    return { width: 1, height: 1, mimeType: "image/svg+xml" }
  }
  return undefined
}

export function sniffMimeType(
  bytes: Uint8Array
): SemanticImageMimeType | undefined {
  if (isPng(bytes)) return "image/png"
  if (isJpeg(bytes)) return "image/jpeg"
  if (isGif(bytes)) return "image/gif"
  if (isWebp(bytes)) return "image/webp"
  if (isAvif(bytes)) return "image/avif"
  if (looksLikeSvg(bytes)) return "image/svg+xml"
  return undefined
}

export function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
}

export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8
}

export function isGif(bytes: Uint8Array): boolean {
  if (bytes.length < 10) return false
  const header = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!, bytes[4]!, bytes[5]!)
  return header === "GIF87a" || header === "GIF89a"
}

export function isWebp(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 16 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
}

export function isAvif(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false
  if (
    bytes[4] !== 0x66 ||
    bytes[5] !== 0x74 ||
    bytes[6] !== 0x79 ||
    bytes[7] !== 0x70
  )
    return false
  const brands = new TextDecoder()
    .decode(bytes.subarray(8, Math.min(bytes.length, 64)))
    .toLowerCase()
  return brands.includes("avif") || brands.includes("avis")
}

export function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = new TextDecoder()
    .decode(bytes.subarray(0, Math.min(bytes.length, 256)))
    .trimStart()
  return (
    head.startsWith("<svg") ||
    head.startsWith("<?xml") ||
    /<svg[\s>]/iu.test(head)
  )
}

function jpegSize(
  bytes: Uint8Array
): Readonly<{ width: number; height: number }> | undefined {
  let offset = 2
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = bytes[offset + 1]
    if (marker === undefined) return undefined
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2
      continue
    }
    const length = ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0)
    if (length < 2 || offset + 2 + length > bytes.length) return undefined
    if (
      [
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
        0xcf,
      ].includes(marker)
    ) {
      return {
        height: ((bytes[offset + 5] ?? 0) << 8) | (bytes[offset + 6] ?? 0),
        width: ((bytes[offset + 7] ?? 0) << 8) | (bytes[offset + 8] ?? 0),
      }
    }
    offset += 2 + length
  }
  return undefined
}

function webpSize(
  bytes: Uint8Array
): Readonly<{ width: number; height: number }> | undefined {
  const fourCC = String.fromCharCode(
    bytes[12]!,
    bytes[13]!,
    bytes[14]!,
    bytes[15]!
  )
  if (fourCC === "VP8X" && bytes.length >= 30) {
    const width =
      1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16))
    const height =
      1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16))
    return width > 0 && height > 0 ? { width, height } : undefined
  }
  if (fourCC === "VP8 " && bytes.length >= 30) {
    // Lossy bitstream: frame tag then 3-byte start code 0x9d 0x01 0x2a
    let offset = 20
    while (offset + 10 < bytes.length && offset < 40) {
      if (
        bytes[offset] === 0x9d &&
        bytes[offset + 1] === 0x01 &&
        bytes[offset + 2] === 0x2a
      ) {
        const width = bytes[offset + 3]! | ((bytes[offset + 4]! & 0x3f) << 8)
        const height = bytes[offset + 5]! | ((bytes[offset + 6]! & 0x3f) << 8)
        return width > 0 && height > 0 ? { width, height } : undefined
      }
      offset += 1
    }
  }
  if (fourCC === "VP8L" && bytes.length >= 25) {
    const bits =
      bytes[21]! |
      (bytes[22]! << 8) |
      (bytes[23]! << 16) |
      (bytes[24]! << 24)
    const width = (bits & 0x3fff) + 1
    const height = ((bits >> 14) & 0x3fff) + 1
    return { width, height }
  }
  return undefined
}

function avifSize(
  bytes: Uint8Array
): Readonly<{ width: number; height: number }> | undefined {
  // Walk ISO BMFF boxes looking for 'ispe' (ImageSpatialExtentsProperty).
  let offset = 0
  while (offset + 8 <= bytes.length) {
    const size =
      ((bytes[offset]! << 24) |
        (bytes[offset + 1]! << 16) |
        (bytes[offset + 2]! << 8) |
        bytes[offset + 3]!) >>>
      0
    const type = String.fromCharCode(
      bytes[offset + 4]!,
      bytes[offset + 5]!,
      bytes[offset + 6]!,
      bytes[offset + 7]!
    )
    let header = 8
    let boxEnd = size === 0 ? bytes.length : offset + size
    if (size === 1 && offset + 16 <= bytes.length) {
      // 64-bit largesize — skip for safety on huge boxes.
      break
    }
    if (boxEnd > bytes.length || boxEnd <= offset) break
    if (type === "ispe" && offset + header + 12 <= boxEnd) {
      const width =
        ((bytes[offset + header + 4]! << 24) |
          (bytes[offset + header + 5]! << 16) |
          (bytes[offset + header + 6]! << 8) |
          bytes[offset + header + 7]!) >>>
        0
      const height =
        ((bytes[offset + header + 8]! << 24) |
          (bytes[offset + header + 9]! << 16) |
          (bytes[offset + header + 10]! << 8) |
          bytes[offset + header + 11]!) >>>
        0
      if (width > 0 && height > 0) return { width, height }
    }
    // Descend into containers that may nest ispe.
    if (
      ["meta", "iprp", "ipco", "moov", "trak", "mdia", "minf", "stbl"].includes(
        type
      )
    ) {
      const nested = avifSize(bytes.subarray(offset + header, boxEnd))
      if (nested) return nested
    }
    offset = boxEnd
  }
  return undefined
}
