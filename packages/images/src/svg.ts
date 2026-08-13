import { encode as encodePng } from "fast-png"

export type SvgSanitizeResult = Readonly<{
  svgText: string
  stripped: readonly string[]
}>

export type RasterizeSvgOptions = Readonly<{
  /** Display width in CSS pixels (used when SVG lacks absolute size). */
  widthPx?: number
  /** Display height in CSS pixels. */
  heightPx?: number
  /** Device scale for raster (default 2). */
  scale?: number
  /** Cap on the long edge in pixels (default 4096). */
  maxEdgePx?: number
}>

export type RasterizeSvgResult = Readonly<{
  pngBytes: Uint8Array
  width: number
  height: number
  /** True when a real canvas rasterization ran; false for the minimal fallback. */
  rasterized: boolean
  diagnostic?: string
}>

const BLOCKED_ELEMENTS = new Set([
  "script",
  "foreignobject",
  "foreignObject",
  "handler",
  "animate",
  "animatetransform",
  "animatemotion",
  "set",
  "audio",
  "video",
  "iframe",
  "object",
  "embed",
])

const EVENT_ATTR = /^on[a-z]/iu

/**
 * Allowlist-style SVG sanitizer: strips scripts, foreignObject, SMIL animation,
 * event-handler attributes, and external href/xlink:href references.
 */
export function sanitizeSvg(svgText: string): SvgSanitizeResult {
  const stripped: string[] = []
  let text = svgText.replace(/^\uFEFF/u, "")

  // Drop XML external entity declarations (billion-laughs / XXE surface).
  text = text.replace(/<!DOCTYPE[\s\S]*?>/giu, () => {
    stripped.push("doctype")
    return ""
  })
  text = text.replace(/<!ENTITY[\s\S]*?>/giu, () => {
    stripped.push("entity")
    return ""
  })

  // Remove blocked elements including nested content.
  for (const name of BLOCKED_ELEMENTS) {
    const pattern = new RegExp(
      `<${name}\\b[^>]*(?:/>|>[\\s\\S]*?</${name}\\s*>)`,
      "giu"
    )
    text = text.replace(pattern, () => {
      stripped.push(name.toLowerCase())
      return ""
    })
  }

  // Strip event-handler attributes and javascript: URLs.
  text = text.replace(
    /\s(on[a-zA-Z]+)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gu,
    (match, name: string) => {
      if (EVENT_ATTR.test(name)) {
        stripped.push(name.toLowerCase())
        return ""
      }
      return match
    }
  )

  text = text.replace(
    /\s(?:xlink:)?href\s*=\s*(["'])(.*?)\1/giu,
    (match, quote: string, value: string) => {
      const trimmed = value.trim()
      if (
        /^javascript:/iu.test(trimmed) ||
        /^data:text\/html/iu.test(trimmed) ||
        /^(https?:|\/\/|file:)/iu.test(trimmed)
      ) {
        stripped.push("external-href")
        return ` href=${quote}${quote}`
      }
      return match
    }
  )

  return { svgText: text, stripped: Object.freeze([...new Set(stripped)]) }
}

/** Best-effort intrinsic size from SVG markup (viewBox / width / height). */
export function svgIntrinsicSize(
  svgText: string,
  defaults: Readonly<{ width: number; height: number }> = {
    width: 300,
    height: 150,
  }
): Readonly<{ width: number; height: number }> {
  const root = svgText.match(/<svg\b[^>]*>/iu)?.[0] ?? ""
  const widthAttr = attrValue(root, "width")
  const heightAttr = attrValue(root, "height")
  const viewBox = attrValue(root, "viewBox") ?? attrValue(root, "viewbox")
  const wAbs = absolutePx(widthAttr)
  const hAbs = absolutePx(heightAttr)
  let vb: Readonly<{ w: number; h: number }> | undefined
  if (viewBox) {
    const parts = viewBox
      .trim()
      .split(/[\s,]+/u)
      .map(Number)
    if (
      parts.length >= 4 &&
      Number.isFinite(parts[2]) &&
      Number.isFinite(parts[3]) &&
      (parts[2] ?? 0) > 0 &&
      (parts[3] ?? 0) > 0
    ) {
      vb = { w: parts[2]!, h: parts[3]! }
    }
  }
  if (wAbs !== undefined && hAbs !== undefined)
    return { width: wAbs, height: hAbs }
  if (wAbs !== undefined && vb)
    return {
      width: wAbs,
      height: Math.max(1, Math.round(wAbs * (vb.h / vb.w))),
    }
  if (hAbs !== undefined && vb)
    return {
      height: hAbs,
      width: Math.max(1, Math.round(hAbs * (vb.w / vb.h))),
    }
  if (vb) return { width: Math.round(vb.w), height: Math.round(vb.h) }
  return defaults
}

/**
 * Rasterize sanitized SVG bytes to PNG.
 * Uses OffscreenCanvas / canvas when available; otherwise returns a minimal PNG
 * with a diagnostic so callers can still embed a DOCX/PDF fallback.
 */
export async function rasterizeSvg(
  svgBytes: Uint8Array | string,
  options: RasterizeSvgOptions = {}
): Promise<RasterizeSvgResult> {
  const rawText =
    typeof svgBytes === "string" ? svgBytes : new TextDecoder().decode(svgBytes)
  const { svgText } = sanitizeSvg(rawText)
  const intrinsic = svgIntrinsicSize(svgText)
  const widthPx = Math.max(1, Math.round(options.widthPx ?? intrinsic.width))
  const heightPx = Math.max(1, Math.round(options.heightPx ?? intrinsic.height))
  const scale = Math.max(1, options.scale ?? 2)
  const maxEdge = options.maxEdgePx ?? 4096
  let outW = Math.max(1, Math.round(widthPx * scale))
  let outH = Math.max(1, Math.round(heightPx * scale))
  const longEdge = Math.max(outW, outH)
  if (longEdge > maxEdge) {
    const factor = maxEdge / longEdge
    outW = Math.max(1, Math.round(outW * factor))
    outH = Math.max(1, Math.round(outH * factor))
  }

  const sizedSvg = ensureSvgSize(svgText, widthPx, heightPx)
  const canvasApi = resolveCanvas(outW, outH)
  if (!canvasApi) {
    const pngBytes = minimalPng(Math.min(outW, 8), Math.min(outH, 8))
    return {
      pngBytes,
      width: Math.min(outW, 8),
      height: Math.min(outH, 8),
      rasterized: false,
      diagnostic:
        "SVG rasterization skipped: canvas/OffscreenCanvas unavailable in this environment",
    }
  }

  try {
    const dataUrl = svgDataUrl(sizedSvg)
    const bitmap = await decodeSvgBitmap(dataUrl, outW, outH)
    canvasApi.ctx.clearRect(0, 0, outW, outH)
    canvasApi.ctx.drawImage(bitmap as CanvasImageSource, 0, 0, outW, outH)
    if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close()
    const pngBytes = await canvasToPng(canvasApi.canvas)
    return { pngBytes, width: outW, height: outH, rasterized: true }
  } catch (error) {
    const pngBytes = minimalPng(1, 1)
    return {
      pngBytes,
      width: 1,
      height: 1,
      rasterized: false,
      diagnostic: `SVG rasterization failed: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/** Synchronous minimal PNG for environments without canvas. */
export function minimalPng(width = 1, height = 1): Uint8Array {
  const w = Math.max(1, Math.min(width, 64))
  const h = Math.max(1, Math.min(height, 64))
  const data = new Uint8Array(w * h * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 0xe5
    data[i + 1] = 0xe7
    data[i + 2] = 0xeb
    data[i + 3] = 0xff
  }
  return encodePng({ width: w, height: h, data, channels: 4, depth: 8 })
}

/** Encode an explicit RGBA pixel buffer as a deterministic PNG. */
export function encodeRgbaPng(
  width: number,
  height: number,
  data: Uint8Array
): Uint8Array {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    data.length !== width * height * 4
  ) {
    throw new RangeError(
      "RGBA PNG dimensions and pixel buffer are inconsistent"
    )
  }
  return encodePng({ width, height, data, channels: 4, depth: 8 })
}

function attrValue(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "iu"))
  return match?.[2]
}

function absolutePx(value: string | undefined): number | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed || trimmed.endsWith("%") || trimmed === "auto") return undefined
  const match = trimmed.match(
    /^([+-]?(?:\d+\.?\d*|\.\d+))\s*(px|pt|mm|cm|in|pc)?$/iu
  )
  if (!match) return undefined
  const number = Number(match[1])
  if (!Number.isFinite(number) || number <= 0) return undefined
  const unit = (match[2] ?? "px").toLowerCase()
  const px =
    unit === "px"
      ? number
      : unit === "pt"
        ? (number * 96) / 72
        : unit === "in"
          ? number * 96
          : unit === "cm"
            ? (number * 96) / 2.54
            : unit === "mm"
              ? (number * 96) / 25.4
              : unit === "pc"
                ? (number * 96) / 6
                : number
  return Math.max(1, Math.round(px))
}

function ensureSvgSize(
  svgText: string,
  widthPx: number,
  heightPx: number
): string {
  if (!/<svg\b/iu.test(svgText)) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}">${svgText}</svg>`
  }
  return svgText.replace(/<svg\b([^>]*)>/iu, (_match, attrs: string) => {
    let next = attrs
    if (!/\bwidth\s*=/iu.test(next)) next += ` width="${widthPx}"`
    else
      next = next.replace(/\bwidth\s*=\s*(["']).*?\1/iu, `width="${widthPx}"`)
    if (!/\bheight\s*=/iu.test(next)) next += ` height="${heightPx}"`
    else
      next = next.replace(
        /\bheight\s*=\s*(["']).*?\1/iu,
        `height="${heightPx}"`
      )
    if (!/\bxmlns\s*=/iu.test(next))
      next += ` xmlns="http://www.w3.org/2000/svg"`
    return `<svg${next}>`
  })
}

function svgDataUrl(svgText: string): string {
  const bytes = new TextEncoder().encode(svgText)
  let binary = ""
  for (let i = 0; i < bytes.length; i += 1)
    binary += String.fromCharCode(bytes[i]!)
  return `data:image/svg+xml;base64,${btoa(binary)}`
}

type CanvasHandle = Readonly<{
  canvas: OffscreenCanvas | HTMLCanvasElement
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D
}>

function resolveCanvas(
  width: number,
  height: number
): CanvasHandle | undefined {
  if (typeof OffscreenCanvas === "function") {
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext("2d")
    if (ctx) return { canvas, ctx }
  }
  if (typeof document !== "undefined" && document.createElement) {
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (ctx) return { canvas, ctx }
  }
  return undefined
}

async function decodeSvgBitmap(
  dataUrl: string,
  width: number,
  height: number
): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      const response = await fetch(dataUrl)
      const blob = await response.blob()
      return await createImageBitmap(blob, {
        resizeWidth: width,
        resizeHeight: height,
      })
    } catch {
      // Fall through to Image().
    }
  }
  if (typeof Image === "function") {
    const img = new Image()
    img.decoding = "sync"
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error("SVG image decode failed"))
      img.src = dataUrl
    })
    return img
  }
  throw new Error("No SVG image decoder available")
}

async function canvasToPng(
  canvas: OffscreenCanvas | HTMLCanvasElement
): Promise<Uint8Array> {
  if ("convertToBlob" in canvas && typeof canvas.convertToBlob === "function") {
    const blob = await canvas.convertToBlob({ type: "image/png" })
    return new Uint8Array(await blob.arrayBuffer())
  }
  if ("toBlob" in canvas && typeof canvas.toBlob === "function") {
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(new Error("canvas.toBlob failed")),
        "image/png"
      )
    })
    return new Uint8Array(await blob.arrayBuffer())
  }
  if ("toDataURL" in canvas && typeof canvas.toDataURL === "function") {
    const dataUrl = canvas.toDataURL("image/png")
    const base64 = dataUrl.split(",", 2)[1]
    if (!base64) throw new Error("canvas.toDataURL produced no payload")
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
    return bytes
  }
  throw new Error("Canvas PNG export is unavailable")
}
