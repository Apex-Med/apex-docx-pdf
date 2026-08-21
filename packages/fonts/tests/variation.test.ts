import { glyphId, twips, type FontFaceMetrics } from "@apexmed/core"
import { describe, expect, test } from "bun:test"

import {
  clearFontVariationCacheForTests,
  createFontRegistry,
  getFontVariation,
  type FontParserAdapter,
  type ParsedFontFace,
} from "../src"

const metrics: FontFaceMetrics = Object.freeze({
  unitsPerEm: 1_000,
  ascent: 800,
  descent: -200,
  lineGap: 100,
  underlinePosition: -75,
  underlineThickness: 50,
  bbox: Object.freeze({ xMin: -10, yMin: -200, xMax: 900, yMax: 800 }),
})

const fakeParser: FontParserAdapter = {
  parse(): ParsedFontFace {
    return Object.freeze({
      postscriptName: "Fake-Regular",
      kind: "truetype",
      metrics,
      hasGlyphForCodePoint: () => true,
      layout: (text: string) =>
        Object.freeze({
          glyphs: Object.freeze(
            [...text].map((character, index) =>
              Object.freeze({
                glyphId: glyphId(index + 1),
                unicode: character,
                clusterStart: index,
                clusterEnd: index + 1,
                advanceX: 500,
                advanceY: 0,
                offsetX: 0,
                offsetY: 0,
              })
            )
          ),
        }),
    })
  },
}

describe("font variation API", () => {
  test("getFontVariation returns a ParsedFontFace for registered families", async () => {
    const registry = await createFontRegistry(
      {
        faces: [
          {
            family: "Static",
            weight: 400,
            style: "normal",
            bytes: Uint8Array.of(1, 2, 3),
          },
        ],
        fallbackFamily: "Static",
      },
      { parser: fakeParser }
    )
    const varied = registry.getFontVariation("Static", { wght: 600 })
    expect(varied.postscriptName).toBe("Fake-Regular")
    expect(typeof varied.layout).toBe("function")
  })

  test("standalone getFontVariation accepts options and returns base when no axes", async () => {
    clearFontVariationCacheForTests()
    const fontPath = await Bun.resolve(
      "notosans-fontface/fonts/NotoSans-Regular.ttf",
      import.meta.dir
    )
    const bytes = new Uint8Array(await Bun.file(fontPath).arrayBuffer())
    const registry = await createFontRegistry({
      faces: [
        {
          family: "Noto Sans",
          weight: 400,
          style: "normal",
          bytes,
        },
      ],
      fallbackFamily: "Noto Sans",
    })
    const base = registry.getFontVariation("Noto Sans")
    const varied = getFontVariation(base, { wght: 700 })
    expect(varied.postscriptName).toBeTruthy()
    expect(varied.metrics.unitsPerEm).toBeGreaterThan(0)
  })

  test("matchFace applies variation metrics when falling back across weights", async () => {
    clearFontVariationCacheForTests()
    const fontPath = await Bun.resolve(
      "notosans-fontface/fonts/NotoSans-Regular.ttf",
      import.meta.dir
    )
    const bytes = new Uint8Array(await Bun.file(fontPath).arrayBuffer())
    const registry = await createFontRegistry({
      faces: [
        {
          family: "Noto Sans",
          weight: 400,
          style: "normal",
          bytes,
        },
      ],
      fallbackFamily: "Noto Sans",
    })
    const match = registry.matchFace({
      family: "Noto Sans",
      weight: 600,
      style: "normal",
    })
    expect(match.kind).toBe("face-fallback")
    expect(match.metrics.unitsPerEm).toBeGreaterThan(0)

    const face = registry.face(match.faceId)
    const shaped = registry.shape({
      face,
      text: "Semi",
      fontSize: twips(220),
      direction: "ltr",
      variation: { wght: 600 },
    })
    expect(shaped.glyphs.length).toBeGreaterThan(0)
    expect(shaped.advanceX).toBeGreaterThan(0)
  })
})
