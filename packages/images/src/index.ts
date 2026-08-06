import type { SemanticImageAsset } from "@apexmed/core"
import { unzlibSync, zlibSync } from "fflate"

export type PreparedImage = Readonly<{
  hash: string
  width: number
  height: number
  colorSpace: "DeviceGray" | "DeviceRGB"
  bitsPerComponent: 8
  filter: "FlateDecode" | "DCTDecode"
  bytes: readonly number[]
  alphaBytes?: readonly number[]
}>

export type ImagePreparationProvider = Readonly<{
  get(assetId: string): PreparedImage | undefined
}>

export type ImagePreparationRegistry = ImagePreparationProvider &
  Readonly<{
    assets: readonly Readonly<{ assetId: string; image: PreparedImage }>[]
  }>

export type ImagePreparationLimits = Readonly<{
  maxBytes: number
  maxDimensionPixels: number
  maxPixels: number
  maxChunks: number
  maxDecodedBytes: number
}>

export const DEFAULT_IMAGE_PREPARATION_LIMITS: ImagePreparationLimits =
  Object.freeze({
    maxBytes: 20_000_000,
    maxDimensionPixels: 100_000,
    maxPixels: 100_000_000,
    maxChunks: 10_000,
    maxDecodedBytes: 400_000_000,
  })

export class ImagePreparationError extends Error {
  readonly code: string
  readonly assetId: string

  constructor(code: string, assetId: string, message: string) {
    super(`${assetId}: ${message}`)
    this.name = "ImagePreparationError"
    this.code = code
    this.assetId = assetId
  }
}

export function prepareImageAssets(
  assets: readonly SemanticImageAsset[],
  options: Readonly<{
    limits?: Partial<ImagePreparationLimits>
    signal?: AbortSignal
  }> = {}
): ImagePreparationRegistry {
  const limits = Object.freeze({
    ...DEFAULT_IMAGE_PREPARATION_LIMITS,
    ...options.limits,
  })
  const byAsset = new Map<string, PreparedImage>()
  const byHash = new Map<string, PreparedImage[]>()
  const entries: Array<Readonly<{ assetId: string; image: PreparedImage }>> = []
  for (const asset of assets) {
    options.signal?.throwIfAborted()
    if (byAsset.has(asset.id))
      fail("images/duplicate-id", asset.id, "duplicate asset ID")
    validateAssetEnvelope(asset, limits)
    const source = Uint8Array.from(asset.bytes)
    const hash = sha256(source, options.signal)
    let image = byHash
      .get(hash)
      ?.find((candidate) => equalBytes(candidateSourceBytes(candidate), source))
    if (image) {
      validateDeduplicatedAsset(
        asset,
        source,
        hash,
        image,
        limits,
        options.signal
      )
    } else {
      image =
        asset.mimeType === "image/png"
          ? preparePng(asset, source, hash, limits, options.signal)
          : prepareJpeg(asset, source, hash, limits, options.signal)
      const bucket = byHash.get(hash) ?? []
      bucket.push(image)
      byHash.set(hash, bucket)
    }
    byAsset.set(asset.id, image)
    entries.push(Object.freeze({ assetId: asset.id, image }))
  }
  const frozenEntries = Object.freeze(entries)
  return Object.freeze({
    assets: frozenEntries,
    get(assetId: string) {
      return byAsset.get(assetId)
    },
  })
}

// DCT bytes are source bytes. PNG planes carry a hidden immutable source copy
// solely for collision-safe exact-byte deduplication inside this module.
const sourceByPrepared = new WeakMap<PreparedImage, Uint8Array>()

function candidateSourceBytes(image: PreparedImage): Uint8Array {
  const source = sourceByPrepared.get(image)
  if (!source)
    throw new TypeError("Prepared image source identity is unavailable")
  return source
}

function validateAssetEnvelope(
  asset: SemanticImageAsset,
  limits: ImagePreparationLimits
): void {
  if (!asset.id) fail("images/id", asset.id, "asset ID must not be empty")
  if (asset.mimeType !== "image/png" && asset.mimeType !== "image/jpeg")
    fail("images/mime", asset.id, "image MIME type is unsupported")
  if (!Array.isArray(asset.bytes) || asset.bytes.length === 0)
    fail("images/bytes", asset.id, "image bytes must be a non-empty array")
  if (asset.bytes.length > limits.maxBytes)
    fail("images/limit", asset.id, "image byte limit exceeded")
  if (
    asset.bytes.some(
      (value) => !Number.isInteger(value) || value < 0 || value > 255
    )
  )
    fail("images/bytes", asset.id, "image bytes must contain octets")
  validateDimensions(asset.id, asset.pixelWidth, asset.pixelHeight, limits)
}

function validateDeduplicatedAsset(
  asset: SemanticImageAsset,
  source: Uint8Array,
  hash: string,
  prepared: PreparedImage,
  limits: ImagePreparationLimits,
  signal?: AbortSignal
): void {
  // Parse every caller-owned asset against its own declarations before reuse;
  // exact bytes only avoid retaining a duplicate prepared output.
  if (asset.mimeType === "image/png") {
    validatePng(source, asset, limits, signal)
    if (prepared.filter !== "FlateDecode")
      fail(
        "images/mime",
        asset.id,
        "declared PNG MIME type conflicts with exact image bytes"
      )
  } else {
    prepareJpeg(asset, source, hash, limits, signal)
    if (prepared.filter !== "DCTDecode")
      fail(
        "images/mime",
        asset.id,
        "declared JPEG MIME type conflicts with exact image bytes"
      )
  }
  if (
    asset.pixelWidth !== prepared.width ||
    asset.pixelHeight !== prepared.height
  )
    fail(
      "images/dimensions",
      asset.id,
      "declared dimensions conflict with exact image bytes"
    )
}

function validateDimensions(
  assetId: string,
  width: number,
  height: number,
  limits: ImagePreparationLimits
): void {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0
  )
    fail(
      "images/dimensions",
      assetId,
      "dimensions must be positive safe integers"
    )
  if (
    width > limits.maxDimensionPixels ||
    height > limits.maxDimensionPixels ||
    width * height > limits.maxPixels
  )
    fail("images/limit", assetId, "image dimension or pixel limit exceeded")
}

function preparePng(
  asset: SemanticImageAsset,
  source: Uint8Array,
  hash: string,
  limits: ImagePreparationLimits,
  signal?: AbortSignal
): PreparedImage {
  const profile = validatePng(source, asset, limits, signal)
  const rowBytes = Math.ceil(
    (profile.width * profile.channels * profile.depth) / 8
  )
  const inflatedSize = profile.height * (rowBytes + 1)
  const sampleBytes =
    profile.width *
    profile.height *
    profile.channels *
    Uint16Array.BYTES_PER_ELEMENT
  const planeBytes =
    profile.width *
    profile.height *
    (profile.colorType === 0
      ? profile.transparency
        ? 2
        : 1
      : profile.colorType === 2 || profile.colorType === 3
        ? profile.transparency
          ? 4
          : 3
        : profile.colorType === 4
          ? 2
          : 4)
  const workingBytes =
    inflatedSize + 1 + rowBytes * profile.height + sampleBytes + planeBytes
  if (
    !Number.isSafeInteger(inflatedSize) ||
    inflatedSize > limits.maxDecodedBytes ||
    !Number.isSafeInteger(sampleBytes) ||
    sampleBytes > limits.maxDecodedBytes ||
    !Number.isSafeInteger(planeBytes) ||
    planeBytes > limits.maxDecodedBytes ||
    !Number.isSafeInteger(workingBytes) ||
    workingBytes > limits.maxDecodedBytes
  )
    fail("images/limit", asset.id, "decoded PNG byte limit exceeded")
  signal?.throwIfAborted()
  const compressed = concatMany(profile.idat)
  let filtered: Uint8Array
  try {
    // fflate writes into this caller-owned bounded buffer. The extra byte makes
    // expansion beyond the exact IHDR-derived ceiling observable as a mismatch.
    filtered = unzlibSync(compressed, {
      out: new Uint8Array(inflatedSize + 1),
    })
  } catch (error) {
    fail("images/png-decode", asset.id, `PNG inflate failed: ${message(error)}`)
  }
  signal?.throwIfAborted()
  if (filtered.length !== inflatedSize)
    fail(
      "images/png-decode",
      asset.id,
      "inflated PNG data does not match the exact IHDR scanline size"
    )
  const raw = unfilterPng(
    filtered,
    rowBytes,
    profile.height,
    Math.max(1, Math.ceil((profile.channels * profile.depth) / 8)),
    asset.id,
    signal
  )
  const samples = unpackPngSamples(raw, profile, rowBytes, signal)
  const pixels = profile.width * profile.height
  const colorChannels =
    profile.colorType === 0 || profile.colorType === 4 ? 1 : 3
  const colors = new Uint8Array(pixels * colorChannels)
  const hasAlpha =
    profile.colorType === 4 ||
    profile.colorType === 6 ||
    profile.transparency !== undefined
  const alpha = hasAlpha ? new Uint8Array(pixels) : undefined
  const transparency = transparencySamples(profile)
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    signal?.throwIfAborted()
    const output = pixel * colorChannels
    const input = pixel * profile.channels
    if (profile.colorType === 3) {
      const index = samples[input] ?? 0
      const paletteOffset = index * 3
      colors[output] = profile.palette?.[paletteOffset] ?? 0
      colors[output + 1] = profile.palette?.[paletteOffset + 1] ?? 0
      colors[output + 2] = profile.palette?.[paletteOffset + 2] ?? 0
      if (alpha) alpha[pixel] = profile.transparency?.[index] ?? 255
      continue
    }
    for (let channel = 0; channel < colorChannels; channel += 1)
      colors[output + channel] = sample8(
        samples[input + channel] ?? 0,
        profile.depth
      )
    if (!alpha) continue
    if (profile.colorType === 4 || profile.colorType === 6)
      alpha[pixel] = sample8(
        samples[input + profile.channels - 1] ?? maxSample(profile.depth),
        profile.depth
      )
    else
      alpha[pixel] = sampleMatches(samples, input, colorChannels, transparency)
        ? 0
        : 255
  }
  const image = Object.freeze({
    hash,
    width: profile.width,
    height: profile.height,
    colorSpace:
      colorChannels === 1 ? ("DeviceGray" as const) : ("DeviceRGB" as const),
    bitsPerComponent: 8 as const,
    filter: "FlateDecode" as const,
    bytes: Object.freeze(Array.from(zlibSync(colors, { level: 9 }))),
    ...(alpha
      ? { alphaBytes: Object.freeze(Array.from(zlibSync(alpha, { level: 9 }))) }
      : {}),
  })
  sourceByPrepared.set(image, source.slice())
  return image
}

type PngProfile = Readonly<{
  width: number
  height: number
  depth: number
  colorType: 0 | 2 | 3 | 4 | 6
  channels: 1 | 2 | 3 | 4
  palette?: Uint8Array
  transparency?: Uint8Array
  idat: readonly Uint8Array[]
}>

function validatePng(
  bytes: Uint8Array,
  asset: SemanticImageAsset,
  limits: ImagePreparationLimits,
  signal?: AbortSignal
): PngProfile {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (
    bytes.length < 33 ||
    !signature.every((value, index) => bytes[index] === value)
  )
    fail("images/png-signature", asset.id, "invalid PNG signature")
  let offset = 8
  let chunks = 0
  let profile: Omit<PngProfile, "idat"> | undefined
  let sawData = false
  let dataEnded = false
  let sawEnd = false
  let palette: Uint8Array | undefined
  let transparency: Uint8Array | undefined
  const idat: Uint8Array[] = []
  while (offset < bytes.length) {
    signal?.throwIfAborted()
    if (++chunks > limits.maxChunks)
      fail("images/limit", asset.id, "PNG chunk count limit exceeded")
    if (offset + 12 > bytes.length)
      fail("images/png-chunk", asset.id, "truncated PNG chunk")
    const length = readU32(bytes, offset)
    if (length > limits.maxBytes || offset + 12 + length > bytes.length)
      fail("images/png-chunk", asset.id, "invalid PNG chunk length")
    const typeBytes = bytes.subarray(offset + 4, offset + 8)
    const type = String.fromCharCode(...typeBytes)
    if (!/^[A-Za-z]{4}$/u.test(type))
      fail("images/png-chunk", asset.id, "invalid PNG chunk type")
    const data = bytes.subarray(offset + 8, offset + 8 + length)
    const expected = readU32(bytes, offset + 8 + length)
    if (crc32(concatBytes(typeBytes, data)) !== expected)
      fail("images/png-crc", asset.id, `CRC mismatch in ${type} chunk`)
    if (!profile && type !== "IHDR")
      fail("images/png-order", asset.id, "IHDR must be the first PNG chunk")
    if (type === "IHDR") {
      if (profile || length !== 13)
        fail("images/png-header", asset.id, "invalid IHDR chunk")
      const width = readU32(data, 0)
      const height = readU32(data, 4)
      const depth = data[8]
      const color = data[9]
      const legal =
        (color === 0 && [1, 2, 4, 8, 16].includes(depth ?? -1)) ||
        (color === 2 && [8, 16].includes(depth ?? -1)) ||
        (color === 3 && [1, 2, 4, 8].includes(depth ?? -1)) ||
        (color === 4 && [8, 16].includes(depth ?? -1)) ||
        (color === 6 && [8, 16].includes(depth ?? -1))
      if (!legal || data[10] !== 0 || data[11] !== 0)
        fail("images/png-profile", asset.id, "unsupported PNG IHDR profile")
      if (data[12] !== 0)
        fail(
          "images/png-profile",
          asset.id,
          "interlaced PNG is unsupported by the bounded decoder"
        )
      if (width !== asset.pixelWidth || height !== asset.pixelHeight)
        fail(
          "images/dimensions",
          asset.id,
          "PNG dimensions do not match the asset"
        )
      const colorType = color as PngProfile["colorType"]
      profile = {
        width,
        height,
        depth: depth ?? 0,
        colorType,
        channels: pngChannels(colorType),
      }
    } else if (["acTL", "fcTL", "fdAT"].includes(type)) {
      fail("images/png-apng", asset.id, "animated PNG is unsupported")
    } else if (["iCCP", "zTXt", "iTXt"].includes(type)) {
      fail(
        "images/png-metadata",
        asset.id,
        "compressed PNG metadata is unsupported"
      )
    } else if (type === "PLTE") {
      if (!profile || sawData || palette || transparency)
        fail(
          "images/png-order",
          asset.id,
          "PLTE must be single and before tRNS and IDAT"
        )
      if (profile.colorType === 0 || profile.colorType === 4)
        fail(
          "images/png-profile",
          asset.id,
          "PLTE is forbidden for grayscale PNG"
        )
      if (length === 0 || length % 3 !== 0 || length > 768)
        fail("images/png-profile", asset.id, "invalid PNG palette length")
      if (profile.colorType === 3 && length / 3 > 2 ** profile.depth)
        fail(
          "images/png-profile",
          asset.id,
          "PNG palette exceeds indexed bit depth"
        )
      palette = data.slice()
    } else if (type === "tRNS") {
      if (!profile || sawData || transparency)
        fail(
          "images/png-order",
          asset.id,
          "tRNS must be single and before IDAT"
        )
      if (profile.colorType === 4 || profile.colorType === 6)
        fail("images/png-profile", asset.id, "tRNS is forbidden for alpha PNG")
      if (profile.colorType === 3) {
        if (!palette)
          fail(
            "images/png-order",
            asset.id,
            "indexed tRNS requires preceding PLTE"
          )
        if (length === 0 || length > palette.length / 3)
          fail("images/png-profile", asset.id, "indexed tRNS exceeds palette")
      } else if (
        (profile.colorType === 0 && length !== 2) ||
        (profile.colorType === 2 && length !== 6)
      )
        fail("images/png-profile", asset.id, "invalid PNG tRNS length")
      transparency = data.slice()
    } else if (type === "IDAT") {
      if (!profile || dataEnded)
        fail(
          "images/png-order",
          asset.id,
          "PNG IDAT chunks must be consecutive"
        )
      if (profile.colorType === 3 && !palette)
        fail(
          "images/png-order",
          asset.id,
          "indexed PNG requires PLTE before IDAT"
        )
      sawData = true
      idat.push(data.slice())
    } else if (type === "IEND") {
      if (length !== 0 || !sawData)
        fail("images/png-order", asset.id, "invalid IEND or missing IDAT")
      sawEnd = true
      offset += 12
      break
    } else if (
      (typeBytes[0] ?? 0) >= 65 &&
      (typeBytes[0] ?? 0) <= 90 &&
      !["PLTE"].includes(type)
    ) {
      fail(
        "images/png-critical",
        asset.id,
        `unknown critical PNG chunk ${type}`
      )
    }
    if (sawData && type !== "IDAT" && type !== "IEND") dataEnded = true
    offset += 12 + length
  }
  if (!sawEnd || offset !== bytes.length)
    fail("images/png-end", asset.id, "PNG must end exactly at IEND")
  if (!profile) fail("images/png-header", asset.id, "PNG is missing IHDR")
  return {
    ...profile,
    ...(palette ? { palette } : {}),
    ...(transparency ? { transparency } : {}),
    idat: Object.freeze(idat),
  }
}

function prepareJpeg(
  asset: SemanticImageAsset,
  source: Uint8Array,
  hash: string,
  limits: ImagePreparationLimits,
  signal?: AbortSignal
): PreparedImage {
  if (source[0] !== 0xff || source[1] !== 0xd8)
    fail("images/jpeg-signature", asset.id, "missing JPEG SOI")
  let offset = 2
  let width = 0
  let height = 0
  let components = 0
  let sawFrame = false
  let sawScan = false
  let frameMarker: 0xc0 | 0xc2 | undefined
  const frameComponents = new Set<number>()
  const baselineScanned = new Set<number>()
  const progressiveState = new Map<number, Int8Array>()
  let jfif = false
  let adobeTransform: number | undefined
  let markers = 0
  while (offset < source.length) {
    signal?.throwIfAborted()
    if (++markers > limits.maxChunks)
      fail("images/limit", asset.id, "JPEG marker count limit exceeded")
    if (source[offset] !== 0xff)
      fail("images/jpeg-marker", asset.id, "expected JPEG marker")
    while (source[offset] === 0xff) offset += 1
    const marker = source[offset++]
    if (marker === undefined)
      fail("images/jpeg-marker", asset.id, "truncated JPEG marker")
    if (marker === 0xd9) {
      if (!sawScan || offset !== source.length)
        fail("images/jpeg-end", asset.id, "invalid JPEG EOI")
      break
    }
    if (marker === 0xda) {
      if (!sawFrame || frameMarker === undefined)
        fail(
          "images/jpeg-scan",
          asset.id,
          "JPEG SOS must follow a supported SOF"
        )
      if (offset + 2 > source.length)
        fail("images/jpeg-scan", asset.id, "truncated SOS")
      const length = readU16(source, offset)
      if (length < 2 || offset + length > source.length)
        fail("images/jpeg-scan", asset.id, "invalid SOS length")
      validateJpegScan(
        source.subarray(offset + 2, offset + length),
        frameMarker,
        frameComponents,
        baselineScanned,
        progressiveState,
        asset.id
      )
      sawScan = true
      offset += length
      while (offset + 1 < source.length) {
        if (source[offset] !== 0xff) {
          offset += 1
          continue
        }
        const next = source[offset + 1]
        if (
          next === 0x00 ||
          (next !== undefined && next >= 0xd0 && next <= 0xd7)
        ) {
          offset += 2
          continue
        }
        break
      }
      continue
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue
    if (offset + 2 > source.length)
      fail("images/jpeg-marker", asset.id, "truncated JPEG segment")
    const length = readU16(source, offset)
    if (
      length < 2 ||
      length > limits.maxBytes ||
      offset + length > source.length
    )
      fail("images/jpeg-marker", asset.id, "invalid JPEG segment length")
    const data = source.subarray(offset + 2, offset + length)
    if (marker === 0xdc)
      fail(
        "images/jpeg-frame",
        asset.id,
        "JPEG DNL height changes are unsupported"
      )
    if (marker === 0xe0 && starts(data, [0x4a, 0x46, 0x49, 0x46, 0]))
      jfif = true
    if (marker === 0xe1 && starts(data, [0x45, 0x78, 0x69, 0x66, 0, 0]))
      validateExif(data.subarray(6), asset.id)
    if (
      marker === 0xe2 &&
      starts(
        data,
        [0x49, 0x43, 0x43, 0x5f, 0x50, 0x52, 0x4f, 0x46, 0x49, 0x4c, 0x45, 0]
      )
    )
      fail("images/jpeg-icc", asset.id, "JPEG ICC profiles are unsupported")
    if (marker === 0xee && starts(data, [0x41, 0x64, 0x6f, 0x62, 0x65]))
      adobeTransform = data[11]
    if (marker === 0xc0 || marker === 0xc2) {
      if (sawFrame || data.length < 6)
        fail("images/jpeg-frame", asset.id, "invalid or duplicate JPEG frame")
      sawFrame = true
      frameMarker = marker
      if (data[0] !== 8)
        fail("images/jpeg-depth", asset.id, "only 8-bit JPEG is supported")
      height = readU16(data, 1)
      width = readU16(data, 3)
      components = data[5] ?? 0
      if (data.length !== 6 + components * 3)
        fail("images/jpeg-frame", asset.id, "invalid JPEG component table")
      if (components !== 1 && components !== 3)
        fail(
          "images/jpeg-components",
          asset.id,
          "only grayscale and three-component JPEG are supported"
        )
      for (let index = 0; index < components; index += 1) {
        const component = data[6 + index * 3]
        const sampling = data[7 + index * 3] ?? 0
        const quantizationTable = data[8 + index * 3] ?? 0
        if (
          component === undefined ||
          frameComponents.has(component) ||
          sampling >>> 4 === 0 ||
          sampling >>> 4 > 4 ||
          (sampling & 0x0f) === 0 ||
          (sampling & 0x0f) > 4 ||
          quantizationTable > 3
        )
          fail("images/jpeg-frame", asset.id, "invalid JPEG frame component")
        frameComponents.add(component)
        progressiveState.set(component, new Int8Array(64).fill(-1))
      }
    } else if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker)
    ) {
      fail("images/jpeg-frame", asset.id, "unsupported JPEG frame type")
    }
    offset += length
  }
  if (
    !sawFrame ||
    !sawScan ||
    source[source.length - 2] !== 0xff ||
    source[source.length - 1] !== 0xd9
  )
    fail(
      "images/jpeg-end",
      asset.id,
      "JPEG is missing a supported frame, scan, or EOI"
    )
  if (
    frameMarker === 0xc0 &&
    [...frameComponents].some((component) => !baselineScanned.has(component))
  )
    fail("images/jpeg-scan", asset.id, "baseline JPEG omits a frame component")
  if (
    frameMarker === 0xc2 &&
    [...frameComponents].some(
      (component) => (progressiveState.get(component)?.[0] ?? -1) < 0
    )
  )
    fail("images/jpeg-scan", asset.id, "progressive JPEG omits a DC first scan")
  if (width !== asset.pixelWidth || height !== asset.pixelHeight)
    fail(
      "images/dimensions",
      asset.id,
      "JPEG dimensions do not match the asset"
    )
  if (components !== 1 && components !== 3)
    fail(
      "images/jpeg-components",
      asset.id,
      "only grayscale and three-component JPEG are supported"
    )
  if (components === 3 && !jfif && adobeTransform === undefined)
    fail(
      "images/jpeg-color",
      asset.id,
      "three-component JPEG color transform is ambiguous"
    )
  if (components === 3 && jfif && adobeTransform === 0)
    fail(
      "images/jpeg-color",
      asset.id,
      "JFIF and Adobe RGB color transforms conflict"
    )
  if (
    adobeTransform !== undefined &&
    adobeTransform !== 0 &&
    adobeTransform !== 1
  )
    fail(
      "images/jpeg-color",
      asset.id,
      "Adobe YCCK or unknown color transform is unsupported"
    )
  const image = Object.freeze({
    hash,
    width,
    height,
    colorSpace:
      components === 1 ? ("DeviceGray" as const) : ("DeviceRGB" as const),
    bitsPerComponent: 8 as const,
    filter: "DCTDecode" as const,
    bytes: Object.freeze(Array.from(source)),
  })
  sourceByPrepared.set(image, source.slice())
  return image
}

function validateJpegScan(
  data: Uint8Array,
  frameMarker: 0xc0 | 0xc2,
  frameComponents: ReadonlySet<number>,
  baselineScanned: Set<number>,
  progressiveState: Map<number, Int8Array>,
  assetId: string
): void {
  const count = data[0] ?? 0
  if (
    count < 1 ||
    count > frameComponents.size ||
    data.length !== 1 + count * 2 + 3
  )
    fail(
      "images/jpeg-scan",
      assetId,
      "invalid JPEG SOS component count or length"
    )
  const scanComponents: number[] = []
  for (let index = 0; index < count; index += 1) {
    const component = data[1 + index * 2]
    const tables = data[2 + index * 2] ?? 0
    if (
      component === undefined ||
      !frameComponents.has(component) ||
      scanComponents.includes(component) ||
      tables >>> 4 > 3 ||
      (tables & 0x0f) > 3
    )
      fail("images/jpeg-scan", assetId, "invalid JPEG SOS component selector")
    scanComponents.push(component)
  }
  const spectralStart = data[1 + count * 2] ?? 0
  const spectralEnd = data[2 + count * 2] ?? 0
  const approximation = data[3 + count * 2] ?? 0
  const high = approximation >>> 4
  const low = approximation & 0x0f
  if (frameMarker === 0xc0) {
    if (spectralStart !== 0 || spectralEnd !== 63 || approximation !== 0)
      fail("images/jpeg-scan", assetId, "invalid baseline JPEG spectral fields")
    if (scanComponents.some((component) => baselineScanned.has(component)))
      fail("images/jpeg-scan", assetId, "baseline JPEG scans a component twice")
    for (const component of scanComponents) baselineScanned.add(component)
    return
  }
  if (
    spectralStart > spectralEnd ||
    spectralEnd > 63 ||
    high > 13 ||
    low > 13 ||
    (spectralStart === 0 && spectralEnd !== 0) ||
    (spectralStart > 0 && count !== 1) ||
    (high !== 0 && high !== low + 1)
  )
    fail(
      "images/jpeg-scan",
      assetId,
      "invalid progressive JPEG spectral fields"
    )
  for (const component of scanComponents) {
    const state = progressiveState.get(component)
    if (!state)
      fail("images/jpeg-scan", assetId, "unknown progressive JPEG component")
    if (spectralStart > 0 && (state[0] ?? -1) < 0)
      fail(
        "images/jpeg-scan",
        assetId,
        "progressive JPEG AC scan precedes its DC first scan"
      )
    for (
      let coefficient = spectralStart;
      coefficient <= spectralEnd;
      coefficient += 1
    ) {
      const previous = state[coefficient] ?? -1
      if ((high === 0 && previous !== -1) || (high > 0 && previous !== high))
        fail(
          "images/jpeg-scan",
          assetId,
          "illegal progressive JPEG scan refinement or overlap"
        )
      state[coefficient] = low
    }
  }
}

function validateExif(bytes: Uint8Array, assetId: string): void {
  if (bytes.length < 8)
    fail("images/jpeg-exif", assetId, "truncated EXIF metadata")
  const little = starts(bytes, [0x49, 0x49, 0x2a, 0])
  const big = starts(bytes, [0x4d, 0x4d, 0, 0x2a])
  if (!little && !big)
    fail("images/jpeg-exif", assetId, "invalid EXIF byte order")
  const u16 = (at: number) =>
    little
      ? (bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8)
      : ((bytes[at] ?? 0) << 8) | (bytes[at + 1] ?? 0)
  const u32 = (at: number) =>
    little
      ? ((bytes[at] ?? 0) |
          ((bytes[at + 1] ?? 0) << 8) |
          ((bytes[at + 2] ?? 0) << 16) |
          ((bytes[at + 3] ?? 0) << 24)) >>>
        0
      : (((bytes[at] ?? 0) << 24) |
          ((bytes[at + 1] ?? 0) << 16) |
          ((bytes[at + 2] ?? 0) << 8) |
          (bytes[at + 3] ?? 0)) >>>
        0
  const ifd = u32(4)
  if (ifd + 2 > bytes.length)
    fail("images/jpeg-exif", assetId, "invalid EXIF IFD offset")
  const count = u16(ifd)
  if (ifd + 2 + count * 12 > bytes.length)
    fail("images/jpeg-exif", assetId, "truncated EXIF IFD")
  for (let index = 0; index < count; index += 1) {
    const entry = ifd + 2 + index * 12
    if (u16(entry) !== 0x0112) continue
    if (u16(entry + 2) !== 3 || u32(entry + 4) !== 1)
      fail("images/jpeg-orientation", assetId, "invalid EXIF orientation")
    const orientation = u16(entry + 8)
    if (orientation !== 1)
      fail(
        "images/jpeg-orientation",
        assetId,
        `EXIF orientation ${orientation} is unsupported`
      )
  }
}

function fail(code: string, assetId: string, messageText: string): never {
  throw new ImagePreparationError(code, assetId, messageText)
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
function readU16(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0)
}
function readU32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) * 0x1000000 +
      ((bytes[offset + 1] ?? 0) << 16) +
      ((bytes[offset + 2] ?? 0) << 8) +
      (bytes[offset + 3] ?? 0)) >>>
    0
  )
}
function starts(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((value, index) => bytes[index] === value)
}
function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => right[index] === value)
  )
}
function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const result = new Uint8Array(left.length + right.length)
  result.set(left)
  result.set(right, left.length)
  return result
}
function pngChannels(
  colorType: PngProfile["colorType"]
): PngProfile["channels"] {
  if (colorType === 2) return 3
  if (colorType === 4) return 2
  if (colorType === 6) return 4
  return 1
}

function concatMany(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.length, 0)
  const result = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

function unfilterPng(
  filtered: Uint8Array,
  rowBytes: number,
  height: number,
  bytesPerPixel: number,
  assetId: string,
  signal?: AbortSignal
): Uint8Array {
  const result = new Uint8Array(rowBytes * height)
  for (let row = 0; row < height; row += 1) {
    signal?.throwIfAborted()
    const input = row * (rowBytes + 1)
    const output = row * rowBytes
    const filter = filtered[input]
    if (filter === undefined || filter > 4)
      fail("images/png-filter", assetId, "unsupported PNG scanline filter")
    for (let column = 0; column < rowBytes; column += 1) {
      const encoded = filtered[input + 1 + column] ?? 0
      const left =
        column >= bytesPerPixel
          ? (result[output + column - bytesPerPixel] ?? 0)
          : 0
      const above = row > 0 ? (result[output - rowBytes + column] ?? 0) : 0
      const upperLeft =
        row > 0 && column >= bytesPerPixel
          ? (result[output - rowBytes + column - bytesPerPixel] ?? 0)
          : 0
      let predictor = 0
      if (filter === 1) predictor = left
      else if (filter === 2) predictor = above
      else if (filter === 3) predictor = Math.floor((left + above) / 2)
      else if (filter === 4) predictor = paeth(left, above, upperLeft)
      result[output + column] = (encoded + predictor) & 0xff
    }
  }
  return result
}

function paeth(left: number, above: number, upperLeft: number): number {
  const estimate = left + above - upperLeft
  const leftDistance = Math.abs(estimate - left)
  const aboveDistance = Math.abs(estimate - above)
  const upperLeftDistance = Math.abs(estimate - upperLeft)
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance)
    return left
  return aboveDistance <= upperLeftDistance ? above : upperLeft
}

function unpackPngSamples(
  raw: Uint8Array,
  profile: PngProfile,
  rowBytes: number,
  signal?: AbortSignal
): Uint16Array {
  const samplesPerRow = profile.width * profile.channels
  const result = new Uint16Array(samplesPerRow * profile.height)
  for (let row = 0; row < profile.height; row += 1) {
    signal?.throwIfAborted()
    const rowStart = row * rowBytes
    const output = row * samplesPerRow
    for (let sample = 0; sample < samplesPerRow; sample += 1) {
      if (profile.depth === 16)
        result[output + sample] = readU16(raw, rowStart + sample * 2)
      else if (profile.depth === 8)
        result[output + sample] = raw[rowStart + sample] ?? 0
      else {
        const bit = sample * profile.depth
        const byte = raw[rowStart + Math.floor(bit / 8)] ?? 0
        result[output + sample] =
          (byte >>> (8 - profile.depth - (bit % 8))) & maxSample(profile.depth)
      }
    }
  }
  return result
}

function transparencySamples(profile: PngProfile): Uint16Array | undefined {
  if (!profile.transparency || profile.colorType === 3) return undefined
  const count = profile.colorType === 0 ? 1 : 3
  const result = new Uint16Array(count)
  for (let index = 0; index < count; index += 1)
    result[index] = readU16(profile.transparency, index * 2)
  return result
}

function sampleMatches(
  data: Uint16Array,
  offset: number,
  channels: number,
  transparency?: Uint16Array
): boolean {
  if (!transparency || transparency.length !== channels) return false
  for (let channel = 0; channel < channels; channel += 1)
    if (data[offset + channel] !== transparency[channel]) return false
  return true
}

function maxSample(depth: number): number {
  return 2 ** depth - 1
}

function sample8(value: number, depth: number): number {
  return Math.round((value * 255) / maxSample(depth))
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value
  for (let bit = 0; bit < 8; bit += 1)
    crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
  return crc >>> 0
})
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes)
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function sha256(bytes: Uint8Array, signal?: AbortSignal): string {
  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]
  const bitLength = bytes.length * 8
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64
  const padded = new Uint8Array(paddedLength)
  padded.set(bytes)
  padded[bytes.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000))
  view.setUint32(paddedLength - 4, bitLength >>> 0)
  const state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ])
  const words = new Uint32Array(64)
  const rotate = (value: number, count: number) =>
    (value >>> count) | (value << (32 - count))
  for (let offset = 0; offset < padded.length; offset += 64) {
    signal?.throwIfAborted()
    for (let index = 0; index < 16; index += 1)
      words[index] = view.getUint32(offset + index * 4)
    for (let index = 16; index < 64; index += 1) {
      const a = words[index - 15] ?? 0
      const b = words[index - 2] ?? 0
      words[index] =
        ((words[index - 16] ?? 0) +
          (rotate(a, 7) ^ rotate(a, 18) ^ (a >>> 3)) +
          (words[index - 7] ?? 0) +
          (rotate(b, 17) ^ rotate(b, 19) ^ (b >>> 10))) >>>
        0
    }
    let a = state[0] ?? 0
    let b = state[1] ?? 0
    let c = state[2] ?? 0
    let d = state[3] ?? 0
    let e = state[4] ?? 0
    let f = state[5] ?? 0
    let g = state[6] ?? 0
    let h = state[7] ?? 0
    for (let index = 0; index < 64; index += 1) {
      const sigma1 = rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)
      const choice = (e & f) ^ (~e & g)
      const first =
        (h +
          sigma1 +
          choice +
          (constants[index] ?? 0) +
          (words[index] ?? 0)) >>>
        0
      const sigma0 = rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const second = (sigma0 + majority) >>> 0
      h = g
      g = f
      f = e
      e = (d + first) >>> 0
      d = c
      c = b
      b = a
      a = (first + second) >>> 0
    }
    const values = [a, b, c, d, e, f, g, h]
    for (let index = 0; index < 8; index += 1)
      state[index] = ((state[index] ?? 0) + (values[index] ?? 0)) >>> 0
  }
  return [...state].map((value) => value.toString(16).padStart(8, "0")).join("")
}
