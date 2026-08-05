import { describe, expect, test } from "bun:test"
import {
  fontFaceId,
  glyphId,
  twips,
  type EmbeddedFontSubset,
  type FontEmbeddingProvider,
  type PageDisplayList,
} from "@apex-docx-pdf/core"

import { serializePdf } from "../src"

const displayList: PageDisplayList = {
  pages: [
    {
      pageNumber: 1,
      width: twips(11_906),
      height: twips(16_838),
      contentBounds: {
        x: twips(1_440),
        y: twips(1_440),
        width: twips(9_026),
        height: twips(13_958),
      },
      items: [
        {
          type: "glyph-run",
          fontSource: "standard",
          sourceNodeId: "text" as never,
          text: "Hello (PDF)\\",
          fontFamily: "Helvetica",
          fontSize: twips(240),
          color: "#000000",
          x: twips(1_440),
          baselineY: twips(1_680),
          width: twips(1_000),
        },
      ],
    },
  ],
}

const standardPage = displayList.pages[0]
if (!standardPage) throw new Error("fixture must contain a standard page")

const embeddedFaceId = fontFaceId("fixture-face")
const embeddedDisplayList: PageDisplayList = {
  pages: [
    {
      ...standardPage,
      items: [
        {
          type: "glyph-run",
          fontSource: "embedded",
          sourceNodeId: "embedded-text" as never,
          text: "office",
          faceId: embeddedFaceId,
          glyphs: [
            {
              glyphId: glyphId(10),
              unicode: "o",
              xAdvance: twips(120),
              yAdvance: twips(0),
              xOffset: twips(0),
              yOffset: twips(0),
            },
            {
              glyphId: glyphId(20),
              unicode: "ffi",
              xAdvance: twips(180),
              yAdvance: twips(0),
              xOffset: twips(5),
              yOffset: twips(-2),
            },
            {
              glyphId: glyphId(30),
              unicode: "ce",
              xAdvance: twips(140),
              yAdvance: twips(0),
              xOffset: twips(0),
              yOffset: twips(0),
            },
          ],
          fontSize: twips(240),
          color: "#112233",
          x: twips(1_440),
          baselineY: twips(1_680),
          width: twips(440),
        },
      ],
    },
  ],
}

function fakeSubset(
  overrides: Partial<EmbeddedFontSubset> = {}
): EmbeddedFontSubset {
  return {
    faceId: embeddedFaceId,
    kind: "truetype",
    subsetted: true,
    bytes: Uint8Array.of(0, 1, 0, 0, 70, 65, 75, 69),
    postscriptName: "ABCDEF+FixtureSans",
    metrics: {
      unitsPerEm: 1_000,
      ascent: 800,
      descent: -200,
      lineGap: 200,
      underlinePosition: -100,
      underlineThickness: 50,
      bbox: { xMin: -20, yMin: -250, xMax: 1_100, yMax: 900 },
    },
    glyphMap: [
      { sourceGlyphId: glyphId(0), subsetGlyphId: 0 },
      { sourceGlyphId: glyphId(10), subsetGlyphId: 3 },
      { sourceGlyphId: glyphId(20), subsetGlyphId: 1 },
      { sourceGlyphId: glyphId(30), subsetGlyphId: 2 },
    ],
    ...overrides,
  }
}

describe("Phase 1 PDF serializer", () => {
  test("emits a searchable, structured PDF with escaped literal text", () => {
    const result = serializePdf(displayList, {
      metadata: { title: "Deterministic" },
    })
    const text = new TextDecoder("latin1").decode(result.bytes)
    expect(text).toStartWith("%PDF-1.7")
    expect(text).toContain("/Type /Catalog")
    expect(text).toContain("/BaseFont /Helvetica")
    expect(text).toContain("(Hello \\(PDF\\)\\\\) Tj")
    expect(text).not.toContain("1 0 0 -1")
    expect(text).toContain("xref\n0 7")
    expect(result.diagnostics).toEqual([])
  })

  test("is byte-identical on repeat", () => {
    expect(serializePdf(displayList).bytes).toEqual(
      serializePdf(displayList).bytes
    )
  })

  test("preserves the sign for negative sub-point twips", () => {
    const page = displayList.pages[0]
    if (page === undefined) throw new Error("fixture must contain a page")
    const glyph = page.items[0]
    if (glyph?.type !== "glyph-run")
      throw new Error("fixture must begin with a glyph run")
    const negativePoints: PageDisplayList = {
      pages: [
        {
          ...page,
          height: twips(0),
          items: [
            {
              ...glyph,
              fontSize: twips(-20),
              x: twips(-1),
              baselineY: twips(-19),
            },
          ],
        },
      ],
    }
    const text = new TextDecoder("latin1").decode(
      serializePdf(negativePoints).bytes
    )
    expect(text).toContain("/F1 -1 Tf")
    expect(text).toContain("1 0 0 1 -0.05 0.95 Tm")
  })

  test("serializes each display-list page", () => {
    const page = displayList.pages[0]
    if (page === undefined) throw new Error("fixture must contain a page")
    const multipage: PageDisplayList = {
      ...displayList,
      pages: [...displayList.pages, { ...page, pageNumber: 2 }],
    }
    const text = new TextDecoder("latin1").decode(serializePdf(multipage).bytes)
    expect(text).toContain("/Count 2")
    expect(text.match(/\/Type \/Page /gu) ?? []).toHaveLength(2)
  })

  test("diagnoses text outside WinAnsi rather than encoding it incorrectly", () => {
    const page = displayList.pages[0]
    if (page === undefined) throw new Error("fixture must contain a page")
    const glyph = page.items[0]
    if (glyph?.type !== "glyph-run")
      throw new Error("fixture must begin with a glyph run")
    const unsupported: PageDisplayList = {
      ...displayList,
      pages: [{ ...page, items: [{ ...glyph, text: "漢" }] }],
    }
    const result = serializePdf(unsupported)
    expect(result.diagnostics[0]?.code).toBe("pdf/text-encoding")
  })

  test("honours an already-aborted signal", () => {
    const controller = new AbortController()
    controller.abort()
    expect(() =>
      serializePdf(displayList, { signal: controller.signal })
    ).toThrow()
  })
})

describe("embedded TrueType PDF serializer", () => {
  test("emits Type0 font objects, mapped glyph IDs, positioned text, and ligature Unicode", () => {
    const calls: Array<{ faceId: string; glyphIds: readonly number[] }> = []
    const fonts: FontEmbeddingProvider = {
      subset(faceId, glyphIds) {
        calls.push({ faceId, glyphIds })
        return fakeSubset()
      },
    }
    const result = serializePdf(embeddedDisplayList, { fonts })
    const text = new TextDecoder("latin1").decode(result.bytes)
    expect(result.diagnostics).toEqual([])
    expect(calls).toEqual([
      { faceId: embeddedFaceId, glyphIds: [0, 10, 20, 30] },
    ])
    expect(text).toContain("/Subtype /Type0")
    expect(text).toContain("/Subtype /CIDFontType2")
    expect(text).toContain("/FontFile2")
    expect(text).toContain("/CIDToGIDMap")
    expect(text).toContain("<0002> <006600660069>")
    expect(text).toContain("1 0 0 1 78.25 758 Tm\n<0002> Tj")
    expect(text).not.toContain("1 0 0 -1")
    expect(result.bytes).toEqual(
      serializePdf(embeddedDisplayList, {
        fonts: { subset: () => fakeSubset() },
      }).bytes
    )
  })

  test("reuses one embedded face across pages and repeated runs", () => {
    let calls = 0
    const fonts: FontEmbeddingProvider = {
      subset: () => {
        calls += 1
        return fakeSubset({ subsetted: false })
      },
    }
    const page = embeddedDisplayList.pages[0]
    if (!page) throw new Error("fixture must contain an embedded page")
    const multipage: PageDisplayList = {
      pages: [
        { ...page, items: [...page.items, ...page.items] },
        { ...page, pageNumber: 2 },
      ],
    }
    const text = new TextDecoder("latin1").decode(
      serializePdf(multipage, { fonts }).bytes
    )
    expect(calls).toBe(1)
    expect(text.match(/\/Subtype \/Type0/gu) ?? []).toHaveLength(1)
    expect(text.match(/\/F2 \d+ 0 R/gu) ?? []).toHaveLength(2)
  })

  test("diagnoses missing providers, CFF programs, and invalid mappings", () => {
    expect(serializePdf(embeddedDisplayList).diagnostics[0]?.code).toBe(
      "pdf/embedded-font-unavailable"
    )
    expect(
      serializePdf(embeddedDisplayList, {
        fonts: { subset: () => fakeSubset({ kind: "opentype-cff" }) },
      }).diagnostics[0]?.code
    ).toBe("pdf/embedded-font-cff-unsupported")
    expect(
      serializePdf(embeddedDisplayList, {
        fonts: {
          subset: () =>
            fakeSubset({
              glyphMap: [{ sourceGlyphId: glyphId(0), subsetGlyphId: 0 }],
            }),
        },
      }).diagnostics[0]?.code
    ).toBe("pdf/embedded-font-invalid")
  })
})
