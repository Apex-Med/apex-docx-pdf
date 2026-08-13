import { describe, expect, test } from "bun:test"
import type { SemanticImageAsset } from "@apexmed/core"
import { encode } from "fast-png"

import {
  ImagePreparationError,
  prepareImageAssets,
  sanitizeSvg,
  sniffImageDimensions,
  sniffMimeType,
  svgIntrinsicSize,
  minimalPng,
  encodeRgbaPng,
  rasterizeSvg,
} from "../src"

const source = { part: "word/media/image.svg", xmlPath: "/fixture" }

function svgAsset(
  id: string,
  svg: string,
  pixelWidth: number,
  pixelHeight: number,
  rasterFallback?: SemanticImageAsset["rasterFallback"]
): SemanticImageAsset {
  return {
    type: "imageAsset",
    id,
    source,
    packagePath: `word/media/${id}.svg`,
    mimeType: "image/svg+xml",
    bytes: Array.from(new TextEncoder().encode(svg)),
    pixelWidth,
    pixelHeight,
    ...(rasterFallback ? { rasterFallback } : {}),
  }
}

describe("expanded image formats", () => {
  test("sanitizeSvg strips script, foreignObject, and event handlers", () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" onclick="alert(1)">
      <script>alert(1)</script>
      <foreignObject width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>
      <circle cx="5" cy="5" r="4" onload="evil()"/>
      <a href="javascript:alert(1)"><rect width="1" height="1"/></a>
    </svg>`
    const { svgText, stripped } = sanitizeSvg(dirty)
    expect(svgText).not.toMatch(/<script/iu)
    expect(svgText).not.toMatch(/foreignObject/iu)
    expect(svgText).not.toMatch(/onclick=/iu)
    expect(svgText).not.toMatch(/onload=/iu)
    expect(svgText).not.toMatch(/javascript:/iu)
    expect(stripped).toContain("script")
    expect(stripped).toContain("foreignobject")
  })

  test("svgIntrinsicSize reads viewBox", () => {
    const size = svgIntrinsicSize(
      `<svg viewBox="0 0 24 12" xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>`
    )
    expect(size).toEqual({ width: 24, height: 12 })
  })

  test("rasterizeSvg returns PNG bytes (canvas or minimal fallback)", async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="4"><rect width="8" height="4" fill="#f00"/></svg>`
    const result = await rasterizeSvg(svg, {
      widthPx: 8,
      heightPx: 4,
      scale: 1,
    })
    expect(result.pngBytes[0]).toBe(0x89)
    expect(result.pngBytes[1]).toBe(0x50)
    expect(result.width).toBeGreaterThan(0)
    expect(result.height).toBeGreaterThan(0)
    if (!result.rasterized) {
      expect(result.diagnostic).toMatch(/canvas|unavailable|failed/iu)
    }
  })

  test("prepareImageAssets prepares SVG via rasterFallback PNG", () => {
    const png = encode({
      width: 2,
      height: 1,
      data: Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 255]),
      channels: 4,
      depth: 8,
    })
    const asset = svgAsset("logo", `<svg viewBox="0 0 2 1"/>`, 2, 1, {
      bytes: Array.from(png),
      pixelWidth: 2,
      pixelHeight: 1,
    })
    const registry = prepareImageAssets([asset])
    const prepared = registry.get("logo")
    expect(prepared?.filter).toBe("FlateDecode")
    expect(prepared?.width).toBe(2)
    expect(prepared?.height).toBe(1)
  })

  test("prepareImageAssets uses minimal PNG for SVG without companion", () => {
    const asset = svgAsset(
      "icon",
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8"/></svg>`,
      16,
      16
    )
    const registry = prepareImageAssets([asset])
    const prepared = registry.get("icon")
    expect(prepared?.filter).toBe("FlateDecode")
    expect(prepared?.diagnostic).toMatch(/minimal PNG fallback/iu)
  })

  test("sniff GIF and WebP dimensions", () => {
    const gif = Uint8Array.from([
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x0a, 0x00, 0x14, 0x00, 0x00, 0x00,
      0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x0a, 0x00, 0x14, 0x00, 0x00, 0x02,
      0x02, 0x44, 0x01, 0x00, 0x3b,
    ])
    expect(sniffMimeType(gif)).toBe("image/gif")
    expect(sniffImageDimensions(gif)).toEqual({
      width: 10,
      height: 20,
      mimeType: "image/gif",
    })

    // VP8X webp header fragment
    const webp = Uint8Array.from([
      0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
      0x56, 0x50, 0x38, 0x58, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x0f, 0x00, 0x00, 0x07, 0x00, 0x00,
    ])
    expect(sniffMimeType(webp)).toBe("image/webp")
    expect(sniffImageDimensions(webp)?.mimeType).toBe("image/webp")
    expect(sniffImageDimensions(webp)?.width).toBe(16)
    expect(sniffImageDimensions(webp)?.height).toBe(8)
  })

  test("GIF without rasterFallback requires async prepare", () => {
    const gif = Uint8Array.from([
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00,
      0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02,
      0x02, 0x44, 0x01, 0x00, 0x3b,
    ])
    expect(() =>
      prepareImageAssets([
        {
          type: "imageAsset",
          id: "g",
          source,
          packagePath: "word/media/g.gif",
          mimeType: "image/gif",
          bytes: Array.from(gif),
          pixelWidth: 1,
          pixelHeight: 1,
        },
      ])
    ).toThrow(ImagePreparationError)
  })

  test("minimalPng encodes a valid PNG signature", () => {
    const png = minimalPng(2, 2)
    expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  })

  test("encodeRgbaPng preserves caller-authored RGBA pixels", () => {
    const png = encodeRgbaPng(
      2,
      1,
      new Uint8Array([255, 255, 255, 255, 0, 0, 0, 255])
    )
    const prepared = prepareImageAssets([
      {
        type: "imageAsset",
        id: "rgba.png",
        source,
        packagePath: "word/media/rgba.png",
        mimeType: "image/png",
        bytes: Array.from(png),
        pixelWidth: 2,
        pixelHeight: 1,
      },
    ])
    expect(prepared.get("rgba.png")).toMatchObject({
      width: 2,
      height: 1,
      colorSpace: "DeviceRGB",
    })
  })
})
