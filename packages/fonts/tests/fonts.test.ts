import {
  glyphId,
  twips,
  type FontConfiguration,
  type FontFaceMetrics,
  type FontWeight,
} from "@apex-docx-pdf/core"
import { describe, expect, test } from "bun:test"
import {
  createFontRegistry,
  FontConfigurationError,
  FontShapingError,
  normalizeFontFamily,
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

function fakeParser(
  parseCounts = new Map<number, number>(),
  options: Readonly<{ missing?: string; zeroGlyph?: string }> = {}
): FontParserAdapter {
  return {
    parse(bytes, requestedPostscriptName): ParsedFontFace {
      const marker = bytes[0] ?? 0
      parseCounts.set(marker, (parseCounts.get(marker) ?? 0) + 1)
      const parsed: ParsedFontFace = Object.freeze({
        postscriptName: requestedPostscriptName ?? `Fake-${marker}`,
        kind: marker % 2 === 0 ? "opentype-cff" : "truetype",
        metrics,
        hasGlyphForCodePoint(codePoint: number) {
          return String.fromCodePoint(codePoint) !== options.missing
        },
        layout(
          text: string,
          layoutOptions: Readonly<{
            direction: "ltr"
            script: "latn"
            language?: string
          }>
        ) {
          expect(layoutOptions.direction).toBe("ltr")
          expect(layoutOptions.script).toBe("latn")
          let cluster = 0
          return Object.freeze({
            glyphs: Object.freeze(
              [...text].map((character) => {
                const start = cluster
                cluster += character.length
                return Object.freeze({
                  glyphId: glyphId(
                    character === options.zeroGlyph ? 0 : marker + 1
                  ),
                  unicode: character,
                  clusterStart: start,
                  clusterEnd: cluster,
                  advanceX: 333,
                  advanceY: 0,
                  offsetX: 25,
                  offsetY: -25,
                })
              })
            ),
          })
        },
      })
      return parsed
    },
  }
}

function configuration(): FontConfiguration {
  return {
    faces: [
      {
        family: "Primary",
        weight: 400,
        style: "normal",
        bytes: Uint8Array.of(1),
      },
      {
        family: "Primary",
        weight: 700,
        style: "italic",
        bytes: Uint8Array.of(2),
      },
      {
        family: "Fallback",
        weight: 400,
        style: "normal",
        bytes: Uint8Array.of(3),
      },
      {
        family: "Fallback",
        weight: 700,
        style: "normal",
        bytes: Uint8Array.of(4),
      },
    ],
    aliases: [
      { from: "Body", to: "Primary" },
      { from: "Copy", to: "Body" },
    ],
    fallbackFamily: "Fallback",
  }
}

describe("font registry", () => {
  test("normalizes family names without locale-sensitive whitespace handling", () => {
    expect(normalizeFontFamily("  CAFÉ\t  Sans\n")).toBe("café sans")
    expect(normalizeFontFamily("Cafe\u0301")).toBe("café")
    expect(normalizeFontFamily("\u00a0Family\u00a0")).toBe("\u00a0family\u00a0")
  })

  test("creates deterministic IDs and a configuration-order-independent hash", async () => {
    const firstConfiguration = configuration()
    const secondConfiguration: FontConfiguration = {
      ...firstConfiguration,
      faces: [...firstConfiguration.faces].reverse(),
      aliases: [...(firstConfiguration.aliases ?? [])].reverse(),
    }
    const first = await createFontRegistry(firstConfiguration, {
      parser: fakeParser(),
    })
    const second = await createFontRegistry(secondConfiguration, {
      parser: fakeParser(),
    })

    expect(first.registryHash).toBe(second.registryHash)
    expect(
      first.matchFace({ family: "Primary", weight: 400, style: "normal" })
        .faceId
    ).toBe(
      second.matchFace({ family: "Primary", weight: 400, style: "normal" })
        .faceId
    )

    const changed = configuration()
    const changedFaces = [...changed.faces]
    const firstChangedFace = changedFaces[0]
    if (!firstChangedFace) throw new Error("Expected the test face fixture")
    changedFaces[0] = { ...firstChangedFace, bytes: Uint8Array.of(9) }
    const third = await createFontRegistry(
      { ...changed, faces: changedFaces },
      { parser: fakeParser() }
    )
    expect(third.registryHash).not.toBe(first.registryHash)
  })

  test("snapshots input and output bytes", async () => {
    const bytes = Uint8Array.of(1, 2, 3)
    const config: FontConfiguration = {
      faces: [{ family: "Fallback", weight: 400, style: "normal", bytes }],
      fallbackFamily: "Fallback",
    }
    const registry = await createFontRegistry(config, { parser: fakeParser() })
    const match = registry.matchFace({
      family: "Fallback",
      weight: 400,
      style: "normal",
    })
    bytes[0] = 99
    const exposed = registry.face(match.faceId)
    expect(exposed.bytes[0]).toBe(1)
    exposed.bytes[0] = 88
    expect(registry.face(match.faceId).bytes[0]).toBe(1)
  })

  test("matches an exact four-face tuple before face and fallback-family matches", async () => {
    const registry = await createFontRegistry(configuration(), {
      parser: fakeParser(),
    })
    expect(
      registry.matchFace({ family: "Primary", weight: 700, style: "italic" })
        .kind
    ).toBe("exact")
    expect(
      registry.matchFace({ family: "Copy", weight: 700, style: "italic" }).kind
    ).toBe("alias")
    expect(
      registry.matchFace({ family: "Primary", weight: 700, style: "normal" })
        .kind
    ).toBe("face-fallback")
    const fallbackExact = registry.matchFace({
      family: "Missing",
      weight: 700,
      style: "normal",
    })
    expect(fallbackExact.kind).toBe("family-fallback")
    expect(fallbackExact.resolvedFamily).toBe("Fallback")
    const fallbackSameWeight = registry.matchFace({
      family: "Missing",
      weight: 700,
      style: "italic",
    })
    expect(fallbackSameWeight.kind).toBe("family-fallback")
    expect(registry.face(fallbackSameWeight.faceId).weight).toBe(700)

    const styleFirstRegistry = await createFontRegistry(
      {
        faces: [
          {
            family: "Primary",
            weight: 400,
            style: "normal",
            bytes: Uint8Array.of(1),
          },
          {
            family: "Primary",
            weight: 400,
            style: "italic",
            bytes: Uint8Array.of(2),
          },
          {
            family: "Primary",
            weight: 700,
            style: "normal",
            bytes: Uint8Array.of(3),
          },
        ],
        fallbackFamily: "Primary",
      },
      { parser: fakeParser() }
    )
    const styleFirst = styleFirstRegistry.matchFace({
      family: "Primary",
      weight: 700,
      style: "italic",
    })
    expect(styleFirstRegistry.face(styleFirst.faceId)).toMatchObject({
      weight: 400,
      style: "italic",
    })
  })

  test("matches static CSS weights deterministically and lets named aliases select a face", async () => {
    const registry = await createFontRegistry(
      {
        faces: ([400, 500, 600, 700] as const).map((weight) => ({
          family: "Static Sans",
          weight,
          style: "normal" as const,
          bytes: Uint8Array.of(weight / 100),
        })),
        aliases: [
          { from: "Static Sans Medium", to: "Static Sans", weight: 500 },
          { from: "Static Sans SemiBold", to: "Static Sans", weight: 600 },
        ],
        fallbackFamily: "Static Sans",
      },
      { parser: fakeParser() }
    )

    const matchedWeight = (family: string, weight: FontWeight) => {
      const match = registry.matchFace({ family, weight, style: "normal" })
      return {
        kind: match.kind,
        weight: registry.face(match.faceId).weight,
      }
    }

    expect(matchedWeight("Static Sans", 500)).toEqual({
      kind: "exact",
      weight: 500,
    })
    expect(matchedWeight("Static Sans", 600)).toEqual({
      kind: "exact",
      weight: 600,
    })
    expect(matchedWeight("Static Sans", 300).weight).toBe(400)
    expect(matchedWeight("Static Sans", 800).weight).toBe(700)
    expect(matchedWeight("Static Sans Medium", 400)).toEqual({
      kind: "alias",
      weight: 500,
    })
    expect(matchedWeight("Static Sans SemiBold", 700)).toEqual({
      kind: "alias",
      weight: 600,
    })
    expect(() =>
      registry.matchFace({
        family: "Static Sans",
        weight: 450 as FontWeight,
        style: "normal",
      })
    ).toThrow(FontConfigurationError)
  })

  test("rejects duplicate tuples, invalid aliases, and a missing regular fallback", async () => {
    await expect(
      createFontRegistry(
        {
          faces: [
            {
              family: "Same",
              weight: 400,
              style: "normal",
              bytes: Uint8Array.of(1),
            },
            {
              family: " SAME ",
              weight: 400,
              style: "normal",
              bytes: Uint8Array.of(2),
            },
          ],
          fallbackFamily: "Same",
        },
        { parser: fakeParser() }
      )
    ).rejects.toBeInstanceOf(FontConfigurationError)
    await expect(
      createFontRegistry(
        {
          faces: [
            {
              family: "Fallback",
              weight: 400,
              style: "normal",
              bytes: Uint8Array.of(1),
            },
          ],
          aliases: [
            { from: "One", to: "Two" },
            { from: "Two", to: "One" },
          ],
          fallbackFamily: "Fallback",
        },
        { parser: fakeParser() }
      )
    ).rejects.toThrow("cycle")
    await expect(
      createFontRegistry(
        {
          faces: [
            {
              family: "Fallback",
              weight: 400,
              style: "normal",
              bytes: Uint8Array.of(1),
            },
          ],
          aliases: [{ from: "Gone", to: "Absent" }],
          fallbackFamily: "Fallback",
        },
        { parser: fakeParser() }
      )
    ).rejects.toThrow("missing family")
    await expect(
      createFontRegistry(
        {
          faces: [
            {
              family: "Fallback",
              weight: 700,
              style: "normal",
              bytes: Uint8Array.of(1),
            },
          ],
          fallbackFamily: "Fallback",
        },
        { parser: fakeParser() }
      )
    ).rejects.toThrow("400 normal")
  })
})

describe("font shaping", () => {
  test("parses and shapes an openly licensed Noto Sans fixture with fontkit", async () => {
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
    const face = registry.face(
      registry.matchFace({
        family: "Noto Sans",
        weight: 400,
        style: "normal",
      }).faceId
    )
    const shaped = registry.shape({
      face,
      text: "office café €",
      fontSize: twips(240),
      direction: "ltr",
      language: "en",
    })

    expect(face).toMatchObject({
      postscriptName: "NotoSans-Regular",
      kind: "truetype",
      metrics: { unitsPerEm: 1_000 },
    })
    expect(shaped.glyphs.map((glyph) => glyph.unicode).join("")).toBe(
      "office café €"
    )
    expect(shaped.glyphs.some((glyph) => glyph.unicode === "ffi")).toBe(true)
    expect(shaped.advanceX).toBeGreaterThan(0)
  })

  test("caches parsed faces and cumulatively rounds advances to integer twips", async () => {
    const counts = new Map<number, number>()
    const registry = await createFontRegistry(
      {
        faces: [
          {
            family: "Fallback",
            weight: 400,
            style: "normal",
            bytes: Uint8Array.of(1),
          },
        ],
        fallbackFamily: "Fallback",
      },
      { parser: fakeParser(counts) }
    )
    const face = registry.face(
      registry.matchFace({ family: "Fallback", weight: 400, style: "normal" })
        .faceId
    )
    const input = {
      face,
      text: "abc",
      fontSize: twips(20),
      direction: "ltr" as const,
      language: "en",
    }
    const first = registry.shape(input)
    registry.shape(input)

    expect(counts.get(1)).toBe(1)
    expect(first.glyphs.map((glyph) => glyph.advanceX)).toEqual([
      twips(7),
      twips(6),
      twips(7),
    ])
    expect(first.advanceX).toBe(twips(20))
    expect(
      first.glyphs.every((glyph) => Number.isSafeInteger(glyph.offsetX))
    ).toBe(true)
    expect(first.glyphs[0]?.offsetY).toBe(twips(1))
    expect(first.ascent).toBe(twips(16))
    expect(first.descent).toBe(twips(-4))
  })

  test("rejects missing glyphs, glyph zero, and text outside the LTR Latin boundary", async () => {
    const missingRegistry = await createFontRegistry(
      {
        faces: [
          {
            family: "Fallback",
            weight: 400,
            style: "normal",
            bytes: Uint8Array.of(1),
          },
        ],
        fallbackFamily: "Fallback",
      },
      { parser: fakeParser(new Map(), { missing: "z" }) }
    )
    const face = missingRegistry.face(
      missingRegistry.matchFace({
        family: "Fallback",
        weight: 400,
        style: "normal",
      }).faceId
    )
    expect(() =>
      missingRegistry.shape({
        face,
        text: "z",
        fontSize: twips(20),
        direction: "ltr",
      })
    ).toThrow(FontShapingError)
    expect(() =>
      missingRegistry.shape({
        face,
        text: "漢",
        fontSize: twips(20),
        direction: "ltr",
      })
    ).toThrow("Latin-script")

    const zeroRegistry = await createFontRegistry(
      {
        faces: [
          {
            family: "Fallback",
            weight: 400,
            style: "normal",
            bytes: Uint8Array.of(2),
          },
        ],
        fallbackFamily: "Fallback",
      },
      { parser: fakeParser(new Map(), { zeroGlyph: "x" }) }
    )
    const zeroFace = zeroRegistry.face(
      zeroRegistry.matchFace({
        family: "Fallback",
        weight: 400,
        style: "normal",
      }).faceId
    )
    expect(() =>
      zeroRegistry.shape({
        face: zeroFace,
        text: "x",
        fontSize: twips(20),
        direction: "ltr",
      })
    ).toThrow("missing glyph")
  })
})

describe("font embedding", () => {
  test("returns the complete immutable program by default and supports an injectable subset mapping seam", async () => {
    const base = configuration()
    const unsupported = await createFontRegistry(base, { parser: fakeParser() })
    const faceIdValue = unsupported.matchFace({
      family: "Primary",
      weight: 400,
      style: "normal",
    }).faceId
    const complete = unsupported.subset(faceIdValue, [glyphId(7)])
    expect(complete.subsetted).toBe(false)
    expect(complete.bytes).toEqual(Uint8Array.of(1))
    expect(complete.glyphMap).toEqual([
      { sourceGlyphId: glyphId(7), subsetGlyphId: glyphId(7) },
    ])

    const supported = await createFontRegistry(base, {
      parser: fakeParser(),
      subsetter: {
        subset(_face, ids) {
          return {
            bytes: Uint8Array.of(8, 9),
            postscriptName: "Subset",
            glyphMap: ids.map((sourceGlyphId, subsetGlyphId) => ({
              sourceGlyphId,
              subsetGlyphId,
            })),
          }
        },
      },
    })
    const supportedId = supported.matchFace({
      family: "Primary",
      weight: 400,
      style: "normal",
    }).faceId
    const subset = supported.subset(supportedId, [glyphId(7), glyphId(9)])
    expect(subset.subsetted).toBe(true)
    expect(subset.bytes).toEqual(Uint8Array.of(8, 9))
    expect(subset.glyphMap).toEqual([
      { sourceGlyphId: glyphId(7), subsetGlyphId: 0 },
      { sourceGlyphId: glyphId(9), subsetGlyphId: 1 },
    ])
  })
})
