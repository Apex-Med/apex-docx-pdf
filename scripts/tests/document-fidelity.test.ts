import { describe, expect, test } from "bun:test"

import {
  analyzeInk,
  compareRasterLayers,
  compareText,
  computeRasterHotspots,
  normalizeExtractedText,
} from "../fidelity/analysis"
import {
  highestErrorIndex,
  integerPixelCrop,
  parseFidelityManifest,
  requiredCaptureCanvasHeight,
} from "../document-fidelity"
import type { PpmImage } from "../golden-docx-pdf"

describe("document fidelity suite", () => {
  test("resolves manifest cases relative to the manifest", () => {
    const manifest = parseFidelityManifest(
      JSON.stringify({
        schemaVersion: 1,
        cases: [
          {
            id: "Complex Table",
            docx: "fixtures/complex.docx",
            referencePdf: "references/complex.pdf",
            tags: ["tables", "rowspans"],
          },
        ],
      }),
      "/tmp/fidelity"
    )

    expect(manifest.cases[0]).toEqual({
      id: "complex-table",
      docxPath: "/tmp/fidelity/fixtures/complex.docx",
      referencePdfPath: "/tmp/fidelity/references/complex.pdf",
      tags: ["tables", "rowspans"],
    })
  })

  test("rejects duplicate normalized case ids", () => {
    expect(() =>
      parseFidelityManifest(
        JSON.stringify({
          schemaVersion: 1,
          cases: [
            { id: "A B", docx: "a.docx", referencePdf: "a.pdf" },
            { id: "a-b", docx: "b.docx", referencePdf: "b.pdf" },
          ],
        }),
        "/tmp"
      )
    ).toThrow("Duplicate fidelity case id")
  })

  test("recovers a global translation and separates it from raw error", () => {
    const reference = whiteRaster(9, 9)
    setBlack(reference, 5, 3)
    setBlack(reference, 5, 4)
    const candidate = whiteRaster(9, 9)
    setBlack(candidate, 3, 4)
    setBlack(candidate, 3, 5)

    const comparison = compareRasterLayers(candidate, reference, {
      alignmentRadius: 4,
    })

    expect(comparison.translation).toMatchObject({
      offsetX: 2,
      offsetY: -1,
    })
    expect(comparison.metrics.exactMatch).toBe(false)
    expect(comparison.alignedMetrics.exactMatch).toBe(true)
    expect(comparison.edges.f1).toBe(1)
  })

  test("reports ink bounds and ranks the worst grid hotspot", () => {
    const reference = whiteRaster(8, 8)
    const candidate = whiteRaster(8, 8)
    setBlack(reference, 1, 2)
    setBlack(reference, 2, 2)
    setBlack(candidate, 6, 6)

    expect(analyzeInk(reference).bounds).toEqual({
      x: 1,
      y: 2,
      width: 2,
      height: 1,
    })
    const hotspots = computeRasterHotspots(candidate, reference, {
      columns: 2,
      rows: 2,
      limit: 2,
    })
    expect(hotspots).toHaveLength(2)
    expect(hotspots[0]?.changedPixels).toBeGreaterThan(0)
    expect(hotspots[0]?.rank).toBe(1)
  })

  test("normalizes extracted text without weakening exact comparison", () => {
    expect(normalizeExtractedText("  A\u00a0B\n C ")).toBe("A B C")
    expect(compareText("A  B\nC", "A B C")).toMatchObject({
      exact: false,
      normalizedExact: true,
    })
  })

  test("extends the browser screenshot canvas through the final page clip", () => {
    expect(
      requiredCaptureCanvasHeight([
        { y: 200, height: 1123 },
        { y: 1323, height: 1123 },
        { y: 2446, height: 1123 },
        { y: 3569, height: 1123 },
      ])
    ).toBe(4692)
  })

  test("rounds fractional editor clips outward to integer pixels", () => {
    expect(
      integerPixelCrop({ x: 322.4, y: 199.8, width: 793.34, height: 1122.67 })
    ).toEqual({ x: 322, y: 199, width: 794, height: 1124 })
  })

  test("selects the actual highest-error page for native review", () => {
    expect(
      highestErrorIndex([
        { rawMetrics: { exactChangedRatio: 0.1 } },
        { rawMetrics: { exactChangedRatio: 0.4 } },
        { rawMetrics: { exactChangedRatio: 0.2 } },
      ])
    ).toBe(1)
    expect(highestErrorIndex([])).toBe(-1)
  })
})

function whiteRaster(width: number, height: number): PpmImage {
  const pixels = new Uint8Array(width * height * 3)
  pixels.fill(255)
  return { width, height, pixels }
}

function setBlack(image: PpmImage, x: number, y: number): void {
  const offset = (y * image.width + x) * 3
  image.pixels[offset] = 0
  image.pixels[offset + 1] = 0
  image.pixels[offset + 2] = 0
}
