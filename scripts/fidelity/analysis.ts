import type { PpmImage, RasterMetrics } from "../golden-docx-pdf"
import { compareRasterImages } from "../golden-docx-pdf"

export type InkAnalysis = Readonly<{
  threshold: number
  inkPixels: number
  inkRatio: number
  darkness: number
  centroid: Readonly<{ x: number; y: number }> | null
  bounds: Readonly<{
    x: number
    y: number
    width: number
    height: number
  }> | null
}>

export type TranslationAnalysis = Readonly<{
  radius: number
  sampleStep: number
  offsetX: number
  offsetY: number
  sampledMeanAbsoluteError: number
}>

export type EdgeMetrics = Readonly<{
  threshold: number
  referenceEdges: number
  candidateEdges: number
  matchingEdges: number
  precision: number
  recall: number
  f1: number
}>

export type ProjectionMetrics = Readonly<{
  horizontalL1: number
  verticalL1: number
}>

export type RasterHotspot = Readonly<{
  rank: number
  x: number
  y: number
  width: number
  height: number
  changedPixels: number
  changedRatio: number
  meanAbsoluteError: number
}>

export type EnhancedRasterComparison = Readonly<{
  metrics: RasterMetrics
  alignedMetrics: RasterMetrics
  referenceInk: InkAnalysis
  candidateInk: InkAnalysis
  translation: TranslationAnalysis
  edges: EdgeMetrics
  projections: ProjectionMetrics
  hotspots: readonly RasterHotspot[]
  overlay: PpmImage
  alignedOverlay: PpmImage
  heatmap: PpmImage
  hotspotGrid: PpmImage
}>

export type TextComparison = Readonly<{
  exact: boolean
  normalizedExact: boolean
  referenceCharacters: number
  candidateCharacters: number
  referenceLines: number
  candidateLines: number
  matchingPrefixCharacters: number
  matchingSuffixCharacters: number
  firstDifference: Readonly<{
    offset: number
    referenceExcerpt: string
    candidateExcerpt: string
  }> | null
}>

export function compareRasterLayers(
  candidate: PpmImage,
  reference: PpmImage,
  options: Readonly<{
    threshold?: number
    alignmentRadius?: number
    inkThreshold?: number
    edgeThreshold?: number
    hotspotColumns?: number
    hotspotRows?: number
    hotspotLimit?: number
  }> = {}
): EnhancedRasterComparison {
  const threshold = options.threshold ?? 0
  const translation = findBestTranslation(
    candidate,
    reference,
    options.alignmentRadius ?? 8
  )
  const alignedCandidate = translateRaster(
    candidate,
    translation.offsetX,
    translation.offsetY,
    reference.width,
    reference.height
  )
  const raw = compareRasterImages(candidate, reference, threshold)
  const aligned = compareRasterImages(alignedCandidate, reference, threshold)
  const hotspots = computeRasterHotspots(candidate, reference, {
    columns: options.hotspotColumns ?? 8,
    rows: options.hotspotRows ?? 8,
    limit: options.hotspotLimit ?? 12,
  })
  const overlay = createCyanRedOverlay(candidate, reference)
  return Object.freeze({
    metrics: raw.metrics,
    alignedMetrics: aligned.metrics,
    referenceInk: analyzeInk(reference, options.inkThreshold ?? 250),
    candidateInk: analyzeInk(candidate, options.inkThreshold ?? 250),
    translation,
    edges: compareEdges(
      alignedCandidate,
      reference,
      options.edgeThreshold ?? 32
    ),
    projections: compareInkProjections(alignedCandidate, reference),
    hotspots,
    overlay,
    alignedOverlay: createCyanRedOverlay(alignedCandidate, reference),
    heatmap: raw.diff,
    hotspotGrid: drawHotspotGrid(overlay, hotspots),
  })
}

export function analyzeInk(image: PpmImage, threshold = 250): InkAnalysis {
  validateByteThreshold(threshold, "ink threshold")
  let inkPixels = 0
  let darkness = 0
  let weightedX = 0
  let weightedY = 0
  let minX = image.width
  let minY = image.height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const luminance = pixelLuminance(image, x, y)
      if (luminance >= threshold) continue
      const weight = 255 - luminance
      inkPixels += 1
      darkness += weight
      weightedX += x * weight
      weightedY += y * weight
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  return Object.freeze({
    threshold,
    inkPixels,
    inkRatio:
      image.width * image.height === 0
        ? 0
        : inkPixels / (image.width * image.height),
    darkness,
    centroid:
      darkness === 0
        ? null
        : Object.freeze({
            x: weightedX / darkness,
            y: weightedY / darkness,
          }),
    bounds:
      maxX < minX || maxY < minY
        ? null
        : Object.freeze({
            x: minX,
            y: minY,
            width: maxX - minX + 1,
            height: maxY - minY + 1,
          }),
  })
}

export function findBestTranslation(
  candidate: PpmImage,
  reference: PpmImage,
  radius = 8
): TranslationAnalysis {
  if (!Number.isSafeInteger(radius) || radius < 0 || radius > 64) {
    throw new RangeError("alignment radius must be an integer from 0 to 64")
  }
  const maximumDimension = Math.max(
    candidate.width,
    candidate.height,
    reference.width,
    reference.height
  )
  const sampleStep = Math.max(1, Math.floor(maximumDimension / 500))
  let bestX = 0
  let bestY = 0
  let bestError = Number.POSITIVE_INFINITY

  for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
    for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
      let absoluteError = 0
      let samples = 0
      for (let y = 0; y < reference.height; y += sampleStep) {
        for (let x = 0; x < reference.width; x += sampleStep) {
          absoluteError += Math.abs(
            translatedLuminance(candidate, x, y, offsetX, offsetY) -
              pixelLuminance(reference, x, y)
          )
          samples += 1
        }
      }
      const meanError = samples === 0 ? 0 : absoluteError / samples
      const bestDistance = Math.abs(bestX) + Math.abs(bestY)
      const candidateDistance = Math.abs(offsetX) + Math.abs(offsetY)
      if (
        meanError < bestError ||
        (meanError === bestError && candidateDistance < bestDistance)
      ) {
        bestError = meanError
        bestX = offsetX
        bestY = offsetY
      }
    }
  }

  return Object.freeze({
    radius,
    sampleStep,
    offsetX: bestX,
    offsetY: bestY,
    sampledMeanAbsoluteError: bestError,
  })
}

export function translateRaster(
  image: PpmImage,
  offsetX: number,
  offsetY: number,
  width = image.width,
  height = image.height
): PpmImage {
  const pixels = new Uint8Array(width * height * 3)
  pixels.fill(255)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceX = x - offsetX
      const sourceY = y - offsetY
      if (
        sourceX < 0 ||
        sourceY < 0 ||
        sourceX >= image.width ||
        sourceY >= image.height
      ) {
        continue
      }
      const sourceOffset = (sourceY * image.width + sourceX) * 3
      const targetOffset = (y * width + x) * 3
      pixels[targetOffset] = image.pixels[sourceOffset] ?? 255
      pixels[targetOffset + 1] = image.pixels[sourceOffset + 1] ?? 255
      pixels[targetOffset + 2] = image.pixels[sourceOffset + 2] ?? 255
    }
  }
  return Object.freeze({ width, height, pixels })
}

export function compareEdges(
  candidate: PpmImage,
  reference: PpmImage,
  threshold = 32
): EdgeMetrics {
  validateByteThreshold(threshold, "edge threshold")
  const width = Math.max(candidate.width, reference.width)
  const height = Math.max(candidate.height, reference.height)
  let referenceEdges = 0
  let candidateEdges = 0
  let matchingEdges = 0

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const referenceEdge = isEdge(reference, x, y, threshold)
      const candidateEdge = isEdge(candidate, x, y, threshold)
      if (referenceEdge) referenceEdges += 1
      if (candidateEdge) candidateEdges += 1
      if (referenceEdge && candidateEdge) matchingEdges += 1
    }
  }
  const precision = candidateEdges === 0 ? 1 : matchingEdges / candidateEdges
  const recall = referenceEdges === 0 ? 1 : matchingEdges / referenceEdges
  return Object.freeze({
    threshold,
    referenceEdges,
    candidateEdges,
    matchingEdges,
    precision,
    recall,
    f1:
      precision + recall === 0
        ? 0
        : (2 * precision * recall) / (precision + recall),
  })
}

export function compareInkProjections(
  candidate: PpmImage,
  reference: PpmImage
): ProjectionMetrics {
  const width = Math.max(candidate.width, reference.width)
  const height = Math.max(candidate.height, reference.height)
  const candidateHorizontal = darknessProjection(candidate, "horizontal", width)
  const referenceHorizontal = darknessProjection(reference, "horizontal", width)
  const candidateVertical = darknessProjection(candidate, "vertical", height)
  const referenceVertical = darknessProjection(reference, "vertical", height)
  return Object.freeze({
    horizontalL1: normalizedProjectionDistance(
      candidateHorizontal,
      referenceHorizontal
    ),
    verticalL1: normalizedProjectionDistance(
      candidateVertical,
      referenceVertical
    ),
  })
}

export function computeRasterHotspots(
  candidate: PpmImage,
  reference: PpmImage,
  options: Readonly<{ columns?: number; rows?: number; limit?: number }> = {}
): readonly RasterHotspot[] {
  const columns = boundedGridSize(options.columns ?? 8, "hotspot columns")
  const rows = boundedGridSize(options.rows ?? 8, "hotspot rows")
  const limit = boundedGridSize(options.limit ?? 12, "hotspot limit", 256)
  const width = Math.max(candidate.width, reference.width)
  const height = Math.max(candidate.height, reference.height)
  const hotspots: Array<Omit<RasterHotspot, "rank">> = []

  for (let row = 0; row < rows; row += 1) {
    const y = Math.floor((row * height) / rows)
    const bottom = Math.floor(((row + 1) * height) / rows)
    for (let column = 0; column < columns; column += 1) {
      const x = Math.floor((column * width) / columns)
      const right = Math.floor(((column + 1) * width) / columns)
      let changedPixels = 0
      let absoluteError = 0
      for (let pixelY = y; pixelY < bottom; pixelY += 1) {
        for (let pixelX = x; pixelX < right; pixelX += 1) {
          let pixelChanged = false
          for (let channel = 0; channel < 3; channel += 1) {
            const delta = Math.abs(
              rasterChannel(candidate, pixelX, pixelY, channel) -
                rasterChannel(reference, pixelX, pixelY, channel)
            )
            absoluteError += delta
            if (delta > 0) pixelChanged = true
          }
          if (pixelChanged) changedPixels += 1
        }
      }
      const tileWidth = right - x
      const tileHeight = bottom - y
      const pixels = tileWidth * tileHeight
      hotspots.push({
        x,
        y,
        width: tileWidth,
        height: tileHeight,
        changedPixels,
        changedRatio: pixels === 0 ? 0 : changedPixels / pixels,
        meanAbsoluteError: pixels === 0 ? 0 : absoluteError / (pixels * 3),
      })
    }
  }

  return Object.freeze(
    hotspots
      .sort(
        (left, right) =>
          right.meanAbsoluteError - left.meanAbsoluteError ||
          right.changedRatio - left.changedRatio ||
          left.y - right.y ||
          left.x - right.x
      )
      .slice(0, limit)
      .map((hotspot, index) => Object.freeze({ ...hotspot, rank: index + 1 }))
  )
}

export function createCyanRedOverlay(
  candidate: PpmImage,
  reference: PpmImage
): PpmImage {
  const width = Math.max(candidate.width, reference.width)
  const height = Math.max(candidate.height, reference.height)
  const pixels = new Uint8Array(width * height * 3)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const referenceInk = 255 - pixelLuminance(reference, x, y)
      const candidateInk = 255 - pixelLuminance(candidate, x, y)
      const offset = (y * width + x) * 3
      pixels[offset] = 255 - referenceInk
      pixels[offset + 1] = 255 - candidateInk
      pixels[offset + 2] = 255 - candidateInk
    }
  }
  return Object.freeze({ width, height, pixels })
}

export function drawHotspotGrid(
  image: PpmImage,
  hotspots: readonly RasterHotspot[]
): PpmImage {
  const pixels = new Uint8Array(image.pixels)
  for (const hotspot of hotspots) {
    const color: readonly [number, number, number] =
      hotspot.rank === 1 ? [255, 128, 0] : [255, 196, 0]
    const left = hotspot.x
    const right = hotspot.x + hotspot.width - 1
    const top = hotspot.y
    const bottom = hotspot.y + hotspot.height - 1
    for (let x = left; x <= right; x += 1) {
      setPixel(pixels, image.width, image.height, x, top, color)
      setPixel(pixels, image.width, image.height, x, bottom, color)
    }
    for (let y = top; y <= bottom; y += 1) {
      setPixel(pixels, image.width, image.height, left, y, color)
      setPixel(pixels, image.width, image.height, right, y, color)
    }
  }
  return Object.freeze({ ...image, pixels })
}

export function compareText(
  reference: string,
  candidate: string
): TextComparison {
  const normalizedReference = normalizeExtractedText(reference)
  const normalizedCandidate = normalizeExtractedText(candidate)
  const maximumPrefix = Math.min(reference.length, candidate.length)
  let prefix = 0
  while (prefix < maximumPrefix && reference[prefix] === candidate[prefix]) {
    prefix += 1
  }
  let suffix = 0
  while (
    suffix < reference.length - prefix &&
    suffix < candidate.length - prefix &&
    reference[reference.length - 1 - suffix] ===
      candidate[candidate.length - 1 - suffix]
  ) {
    suffix += 1
  }
  return Object.freeze({
    exact: reference === candidate,
    normalizedExact: normalizedReference === normalizedCandidate,
    referenceCharacters: reference.length,
    candidateCharacters: candidate.length,
    referenceLines: countLines(reference),
    candidateLines: countLines(candidate),
    matchingPrefixCharacters: prefix,
    matchingSuffixCharacters: suffix,
    firstDifference:
      reference === candidate
        ? null
        : Object.freeze({
            offset: prefix,
            referenceExcerpt: excerptAround(reference, prefix),
            candidateExcerpt: excerptAround(candidate, prefix),
          }),
  })
}

export function normalizeExtractedText(value: string): string {
  return value
    .normalize("NFC")
    .replaceAll("\u00a0", " ")
    .replaceAll(/\s+/gu, " ")
    .trim()
}

function darknessProjection(
  image: PpmImage,
  axis: "horizontal" | "vertical",
  length: number
): number[] {
  const projection = new Array<number>(length).fill(0)
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const index = axis === "horizontal" ? x : y
      projection[index] =
        (projection[index] ?? 0) + 255 - pixelLuminance(image, x, y)
    }
  }
  return projection
}

function normalizedProjectionDistance(
  candidate: readonly number[],
  reference: readonly number[]
): number {
  const candidateTotal = candidate.reduce((sum, value) => sum + value, 0)
  const referenceTotal = reference.reduce((sum, value) => sum + value, 0)
  if (candidateTotal === 0 && referenceTotal === 0) return 0
  let distance = 0
  const length = Math.max(candidate.length, reference.length)
  for (let index = 0; index < length; index += 1) {
    const candidateValue = (candidate[index] ?? 0) / Math.max(1, candidateTotal)
    const referenceValue = (reference[index] ?? 0) / Math.max(1, referenceTotal)
    distance += Math.abs(candidateValue - referenceValue)
  }
  return distance / 2
}

function isEdge(
  image: PpmImage,
  x: number,
  y: number,
  threshold: number
): boolean {
  const current = pixelLuminance(image, x, y)
  const horizontal = Math.abs(current - pixelLuminance(image, x + 1, y))
  const vertical = Math.abs(current - pixelLuminance(image, x, y + 1))
  return Math.max(horizontal, vertical) >= threshold
}

function translatedLuminance(
  image: PpmImage,
  targetX: number,
  targetY: number,
  offsetX: number,
  offsetY: number
): number {
  return pixelLuminance(image, targetX - offsetX, targetY - offsetY)
}

function pixelLuminance(image: PpmImage, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return 255
  const offset = (y * image.width + x) * 3
  const red = image.pixels[offset] ?? 255
  const green = image.pixels[offset + 1] ?? 255
  const blue = image.pixels[offset + 2] ?? 255
  return Math.round((red * 299 + green * 587 + blue * 114) / 1000)
}

function rasterChannel(
  image: PpmImage,
  x: number,
  y: number,
  channel: number
): number {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return 255
  return image.pixels[(y * image.width + x) * 3 + channel] ?? 255
}

function setPixel(
  pixels: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  color: readonly [number, number, number]
): void {
  if (x < 0 || y < 0 || x >= width || y >= height) return
  const offset = (y * width + x) * 3
  pixels[offset] = color[0]
  pixels[offset + 1] = color[1]
  pixels[offset + 2] = color[2]
}

function excerptAround(value: string, offset: number): string {
  const start = Math.max(0, offset - 40)
  const end = Math.min(value.length, offset + 80)
  return value.slice(start, end)
}

function countLines(value: string): number {
  if (value.length === 0) return 0
  return value.split(/\r?\n/u).length
}

function validateByteThreshold(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > 255) {
    throw new RangeError(`${label} must be an integer from 0 to 255`)
  }
}

function boundedGridSize(value: number, label: string, maximum = 64): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(`${label} must be an integer from 1 to ${maximum}`)
  }
  return value
}
