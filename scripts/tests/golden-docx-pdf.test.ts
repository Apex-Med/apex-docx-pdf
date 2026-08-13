import { describe, expect, test } from "bun:test"
import { buildMinimalDocx } from "../../packages/testkit/src"
import { loadOfflineFontConfiguration } from "../offline-font-configuration"

import {
  compareRasterImages,
  decodePpm,
  encodePpm,
  fontConfigurationForDocument,
  parseCliArgs,
  parsePdfInfo,
  renderImportedDocx,
  type PpmImage,
} from "../golden-docx-pdf"

describe("golden DOCX/PDF comparison harness", () => {
  test("parses CLI paths and deterministic rendering controls", () => {
    const options = parseCliArgs([
      "source.docx",
      "reference.pdf",
      "--out",
      "/tmp/golden-test",
      "--dpi=96",
      "--threshold",
      "3",
      "--unsupported",
      "lenient",
      "--no-png",
    ])

    expect(options).toMatchObject({
      outputDirectory: "/tmp/golden-test",
      dpi: 96,
      threshold: 3,
      unsupportedFeatures: "lenient",
      png: false,
    })
    expect(options.docxPath.endsWith("/source.docx")).toBe(true)
    expect(options.referencePdfPath.endsWith("/reference.pdf")).toBe(true)
  })

  test("parses per-page PDF geometry", () => {
    const geometry = parsePdfInfo(`Pages:           2
Page    1 size:  419 x 596 pts
Page    1 rot:   0
Page    1 MediaBox:      0.00 0.00 419.00 596.00
Page    2 size:  612 x 792 pts
Page    2 rot:   90
Page    2 MediaBox:      0.00 0.00 612.00 792.00
`)

    expect(geometry.pageCount).toBe(2)
    expect(geometry.pages[0]).toEqual({
      pageNumber: 1,
      widthPoints: 419,
      heightPoints: 596,
      rotation: 0,
      mediaBox: [0, 0, 419, 596],
    })
    expect(geometry.pages[1]?.rotation).toBe(90)
  })

  test("parses Poppler page geometry with a named paper size", () => {
    const geometry = parsePdfInfo(`Pages:           2
Page    1 size:  596 x 842 pts (A4)
Page    1 rot:   0
Page    1 MediaBox:      0.00     0.00   596.00   842.00
Page    2 size:  596 x 842 pts (A4)
Page    2 rot:   0
Page    2 MediaBox:      0.00     0.00   596.00   842.00
`)

    expect(geometry).toEqual({
      pageCount: 2,
      pages: [
        {
          pageNumber: 1,
          widthPoints: 596,
          heightPoints: 842,
          rotation: 0,
          mediaBox: [0, 0, 596, 842],
        },
        {
          pageNumber: 2,
          widthPoints: 596,
          heightPoints: 842,
          rotation: 0,
          mediaBox: [0, 0, 596, 842],
        },
      ],
    })
  })

  test("round-trips binary PPM pixels", () => {
    const image = raster(2, 1, [0, 1, 2, 253, 254, 255])
    expect(decodePpm(encodePpm(image))).toEqual(image)
  })

  test("reports exact, thresholded, and padded-canvas pixel metrics", () => {
    const generated = raster(2, 1, [0, 0, 0, 255, 255, 250])
    const reference = raster(1, 1, [0, 0, 0])
    const { metrics, diff } = compareRasterImages(generated, reference, 5)

    expect(metrics.canvasWidth).toBe(2)
    expect(metrics.comparedPixels).toBe(2)
    expect(metrics.exactChangedPixels).toBe(1)
    expect(metrics.thresholdChangedPixels).toBe(0)
    expect(metrics.maxChannelDelta).toBe(5)
    expect(metrics.exactMatch).toBe(false)
    expect(diff.pixels).toEqual(new Uint8Array([255, 255, 255, 255, 235, 235]))
  })

  test("identical rasters are exact matches", () => {
    const image = raster(1, 2, [1, 2, 3, 4, 5, 6])
    const { metrics } = compareRasterImages(image, image)
    expect(metrics.exactMatch).toBe(true)
    expect(metrics.exactChangedRatio).toBe(0)
    expect(metrics.normalizedRootMeanSquareError).toBe(0)
  })

  test("renders authored placeholder labels without template compilation", async () => {
    const rendered = await renderImportedDocx(
      buildMinimalDocx({ paragraphs: ["{{Patient full name}}"] }),
      await loadOfflineFontConfiguration(),
      "compatible"
    )

    expect(rendered.pageCount).toBe(1)
    expect(new TextDecoder("ascii").decode(rendered.pdf.subarray(0, 8))).toBe(
      "%PDF-1.7"
    )
    expect(
      rendered.diagnostics.some((entry) => entry.severity === "error")
    ).toBe(false)
  })

  test("lets an embedded font family override a same-named offline alias", async () => {
    const base = await loadOfflineFontConfiguration()
    const embeddedFace = base.faces.find(
      (face) =>
        face.family === "Inter" &&
        face.weight === 400 &&
        face.style === "normal"
    )
    expect(embeddedFace).toBeDefined()
    const merged = fontConfigurationForDocument(
      {
        fontAssets: [
          {
            type: "fontAsset",
            id: "embedded-inter-medium",
            source: { part: "word/fontTable.xml", xmlPath: "/w:fonts[1]" },
            packagePath: "word/fonts/inter-medium.ttf",
            family: "Inter Medium",
            weight: 400,
            style: "normal",
            bytes: Array.from(embeddedFace?.bytes ?? []),
          },
        ],
      } as unknown as Parameters<typeof fontConfigurationForDocument>[0],
      base
    )

    expect(merged.aliases?.some((alias) => alias.from === "Inter Medium")).toBe(
      false
    )
    expect(merged.faces.some((face) => face.family === "Inter Medium")).toBe(
      true
    )
  })
})

function raster(
  width: number,
  height: number,
  pixels: readonly number[]
): PpmImage {
  return Object.freeze({ width, height, pixels: new Uint8Array(pixels) })
}
