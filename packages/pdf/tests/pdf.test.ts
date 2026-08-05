import { describe, expect, test } from "bun:test"
import {
  fontFaceId,
  glyphId,
  twips,
  type EmbeddedFontSubset,
  type FontEmbeddingProvider,
  type PageDisplayList,
} from "@apex-docx-pdf/core"
import { validatePdfStructure } from "../../testkit/src"
import type {
  ImagePreparationProvider,
  PreparedImage,
} from "@apex-docx-pdf/images"

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

  test("keeps vertically aligned K3 glyph runs upright and searchable", () => {
    const scripted: PageDisplayList = {
      pages: [
        {
          ...standardPage,
          items: [
            {
              type: "glyph-run",
              fontSource: "standard",
              sourceNodeId: "base" as never,
              text: "H",
              fontFamily: "Helvetica",
              fontSize: twips(180),
              color: "#000000",
              x: twips(1_440),
              baselineY: twips(1_680),
              width: twips(120),
            },
            {
              type: "glyph-run",
              fontSource: "standard",
              sourceNodeId: "subscript" as never,
              text: "2",
              fontFamily: "Helvetica",
              fontSize: twips(120),
              color: "#000000",
              x: twips(1_560),
              baselineY: twips(1_710),
              width: twips(80),
            },
            {
              type: "glyph-run",
              fontSource: "standard",
              sourceNodeId: "superscript" as never,
              text: "+",
              fontFamily: "Helvetica",
              fontSize: twips(120),
              color: "#000000",
              x: twips(1_640),
              baselineY: twips(1_620),
              width: twips(80),
            },
          ],
        },
      ],
    }
    const result = serializePdf(scripted)
    const validation = validatePdfStructure(result.bytes)
    expect(validation.valid).toBe(true)
    expect(validation.text).toContain("H2+")
    const syntax = new TextDecoder().decode(result.bytes)
    expect(syntax.match(/1 0 0 1 [\d.]+ [\d.]+ Tm/gu)).toHaveLength(3)
    expect(syntax).not.toMatch(/0 1 -1 0|0 -1 1 0/gu)
  })

  test("paints retained highlight geometry before upright searchable script text", () => {
    const highlighted: PageDisplayList = {
      pages: [
        {
          ...standardPage,
          items: [
            {
              type: "rectangle",
              sourceNodeId: "highlighted" as never,
              bounds: {
                x: twips(1_440),
                y: twips(1_500),
                width: twips(300),
                height: twips(160),
              },
              fillColor: "#FFFF00",
            },
            {
              type: "glyph-run",
              fontSource: "standard",
              sourceNodeId: "highlighted" as never,
              text: "Search",
              fontFamily: "Helvetica",
              fontSize: twips(160),
              color: "#000000",
              highlightColor: "#FFFF00",
              verticalAlignment: "superscript",
              x: twips(1_440),
              baselineY: twips(1_620),
              width: twips(300),
            },
          ],
        },
      ],
    }
    const first = serializePdf(highlighted)
    const second = serializePdf(highlighted)
    const validation = validatePdfStructure(first.bytes)
    const syntax = new TextDecoder("latin1").decode(first.bytes)
    expect(first.bytes).toEqual(second.bytes)
    expect(validation).toMatchObject({ valid: true, text: "Search" })
    expect(syntax.indexOf(" re f")).toBeLessThan(syntax.indexOf("(Search) Tj"))
    expect(syntax).toContain("1 0 0 1 72 760.9 Tm")
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
          height: twips(20),
          items: [
            {
              ...glyph,
              fontSize: twips(-20),
              x: twips(-1),
              baselineY: twips(1),
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

  test("omits invalid page geometry before MediaBox object planning", () => {
    const result = serializePdf({
      pages: [
        { ...standardPage, width: Number.NaN as never },
        { ...standardPage, pageNumber: 2, height: twips(-1) },
        { ...standardPage, pageNumber: 3 },
      ],
    })
    const text = new TextDecoder("latin1").decode(result.bytes)
    const validation = validatePdfStructure(result.bytes)

    expect(result.diagnostics).toEqual([
      {
        code: "pdf/page-geometry-invalid",
        severity: "error",
        message:
          "Page 1 width and height must be positive safe-integer twips; page was omitted",
        details: { pageIndex: 1 },
      },
      {
        code: "pdf/page-geometry-invalid",
        severity: "error",
        message:
          "Page 2 width and height must be positive safe-integer twips; page was omitted",
        details: { pageIndex: 2 },
      },
    ])
    expect(text).not.toContain("NaN")
    expect(text).toContain("/Count 1")
    expect(text.match(/\/MediaBox\b/gu) ?? []).toHaveLength(1)
    expect(validation.valid).toBe(true)
    expect(validation.pageCount).toBe(1)
  })
})

describe("styled line PDF serializer", () => {
  const linePage = standardPage

  function lines(
    items: PageDisplayList["pages"][number]["items"]
  ): PageDisplayList {
    return { pages: [{ ...linePage, items }] }
  }

  test("emits solid/reset, dashed, and dotted round-cap stroke state", () => {
    const styled = lines([
      {
        type: "line",
        sourceNodeId: "solid" as never,
        x1: twips(20),
        y1: twips(40),
        x2: twips(120),
        y2: twips(40),
        width: twips(20),
        color: "#000000",
      },
      {
        type: "line",
        sourceNodeId: "dashed" as never,
        x1: twips(20),
        y1: twips(60),
        x2: twips(120),
        y2: twips(60),
        width: twips(10),
        color: "#112233",
        dashArray: [twips(60), twips(20)],
        dashPhase: twips(10),
        lineCap: "square",
      },
      {
        type: "line",
        sourceNodeId: "dotted" as never,
        x1: twips(20),
        y1: twips(80),
        x2: twips(120),
        y2: twips(80),
        width: twips(20),
        color: "#445566",
        dashArray: [twips(20), twips(40)],
        lineCap: "round",
      },
    ])
    const first = serializePdf(styled)
    const second = serializePdf(styled)
    const text = new TextDecoder("latin1").decode(first.bytes)

    expect(first.diagnostics).toEqual([])
    expect(first.bytes).toEqual(second.bytes)
    expect(text).toContain("[] 0 d\n0 J")
    expect(text).toContain("[3 1] 0.5 d\n2 J")
    expect(text).toContain("[1 2] 0 d\n1 J")
  })

  test("retains y-down stroke coordinates without mirroring searchable text", () => {
    const glyph = linePage.items[0]
    if (!glyph) throw new Error("fixture must contain a glyph run")
    const mixed = lines([
      glyph,
      {
        type: "line",
        sourceNodeId: "coordinate-line" as never,
        x1: twips(100),
        y1: twips(200),
        x2: twips(300),
        y2: twips(400),
        width: twips(20),
        color: "#000000",
      },
    ])
    const result = serializePdf(mixed)
    const text = new TextDecoder("latin1").decode(result.bytes)
    const validation = validatePdfStructure(result.bytes)

    expect(text).toContain("1 0 0 -1 0 841.9 cm\n5 10 m 15 20 l S")
    expect(text).toContain("1 0 0 1 72 757.9 Tm")
    expect(validation.valid).toBe(true)
    expect(validation.errors).toEqual([])
    expect(validation.text).toBe("Hello (PDF)\\")
  })

  test("diagnoses invalid line numbers and dash styles without unsafe PDF tokens", () => {
    const invalid = lines([
      {
        type: "line",
        sourceNodeId: "unsafe-coordinate" as never,
        x1: Number.NaN as never,
        y1: twips(0),
        x2: twips(20),
        y2: twips(20),
        width: twips(20),
        color: "#000000",
      },
      {
        type: "line",
        sourceNodeId: "zero-dash" as never,
        x1: twips(0),
        y1: twips(0),
        x2: twips(20),
        y2: twips(20),
        width: twips(20),
        color: "#000000",
        dashArray: [twips(20), twips(0)],
      },
      {
        type: "line",
        sourceNodeId: "negative-phase" as never,
        x1: twips(0),
        y1: twips(0),
        x2: twips(20),
        y2: twips(20),
        width: twips(20),
        color: "#000000",
        dashPhase: twips(-1),
      },
    ])
    const result = serializePdf(invalid)
    const text = new TextDecoder("latin1").decode(result.bytes)

    expect(result.diagnostics.map(({ code }) => code)).toEqual([
      "pdf/line-invalid",
      "pdf/line-invalid",
      "pdf/line-invalid",
    ])
    expect(text).not.toContain("NaN")
    expect(text).not.toContain(" m ")
    expect(validatePdfStructure(result.bytes).valid).toBe(true)
  })

  test("validates rectangle geometry, stroke width, and paint configuration", () => {
    const result = serializePdf(
      lines([
        {
          type: "rectangle",
          sourceNodeId: "valid-rectangle" as never,
          bounds: {
            x: twips(20),
            y: twips(40),
            width: twips(100),
            height: twips(60),
          },
          fillColor: "#ABCDEF",
        },
        {
          type: "rectangle",
          sourceNodeId: "unsafe-rectangle" as never,
          bounds: {
            x: Number.NaN as never,
            y: twips(0),
            width: twips(20),
            height: twips(20),
          },
          fillColor: "#000000",
        },
        {
          type: "rectangle",
          sourceNodeId: "negative-dimension" as never,
          bounds: {
            x: twips(0),
            y: twips(0),
            width: twips(20),
            height: twips(-1),
          },
          fillColor: "#000000",
        },
        {
          type: "rectangle",
          sourceNodeId: "negative-stroke" as never,
          bounds: {
            x: twips(0),
            y: twips(0),
            width: twips(20),
            height: twips(20),
          },
          strokeColor: "#000000",
          strokeWidth: twips(-1),
        },
        {
          type: "rectangle",
          sourceNodeId: "unpainted" as never,
          bounds: {
            x: twips(0),
            y: twips(0),
            width: twips(20),
            height: twips(20),
          },
        },
      ])
    )
    const text = new TextDecoder("latin1").decode(result.bytes)

    expect(result.diagnostics.map(({ code }) => code)).toEqual([
      "pdf/rectangle-invalid",
      "pdf/rectangle-invalid",
      "pdf/rectangle-invalid",
      "pdf/rectangle-invalid",
    ])
    expect(text).toContain("1 0 0 -1 0 841.9 cm\n1 2 5 3 re f")
    expect(text).not.toContain("NaN")
    expect(text.match(/ re /gu) ?? []).toHaveLength(1)
    expect(validatePdfStructure(result.bytes).valid).toBe(true)
  })
})

describe("static image PDF serializer", () => {
  const binary = Array.from(
    new TextEncoder().encode(
      "\u00ff\u00d8binary\nendobj\nstream\n%%EOF\u00ff\u00d9"
    )
  )
  const jpeg: PreparedImage = Object.freeze({
    hash: "a".repeat(64),
    width: 2,
    height: 1,
    colorSpace: "DeviceRGB",
    bitsPerComponent: 8,
    filter: "DCTDecode",
    bytes: Object.freeze(binary),
  })
  const alpha: PreparedImage = Object.freeze({
    hash: "b".repeat(64),
    width: 1,
    height: 1,
    colorSpace: "DeviceRGB",
    bitsPerComponent: 8,
    filter: "FlateDecode",
    bytes: Object.freeze([120, 218, 1]),
    alphaBytes: Object.freeze([120, 218, 2]),
  })
  const provider: ImagePreparationProvider = {
    get(assetId) {
      if (assetId === "jpeg-a" || assetId === "jpeg-b") return jpeg
      if (assetId === "alpha") return alpha
      return undefined
    },
  }

  function images(
    items: PageDisplayList["pages"][number]["items"]
  ): PageDisplayList {
    const page = displayList.pages[0]
    if (!page) throw new Error("fixture must contain a standard page")
    return { pages: [{ ...page, items }] }
  }

  test("plans deduplicated image XObjects, soft masks, resources, and positive matrices", () => {
    const result = serializePdf(
      images([
        {
          type: "image",
          sourceNodeId: "jpeg-a-node" as never,
          assetId: "jpeg-a",
          bounds: {
            x: twips(100),
            y: twips(200),
            width: twips(400),
            height: twips(200),
          },
        },
        {
          type: "image",
          sourceNodeId: "jpeg-b-node" as never,
          assetId: "jpeg-b",
          bounds: {
            x: twips(600),
            y: twips(500),
            width: twips(200),
            height: twips(100),
          },
        },
        {
          type: "image",
          sourceNodeId: "alpha-node" as never,
          assetId: "alpha",
          bounds: {
            x: twips(900),
            y: twips(700),
            width: twips(100),
            height: twips(100),
          },
        },
      ]),
      { images: provider }
    )
    const text = new TextDecoder("latin1").decode(result.bytes)
    const validation = validatePdfStructure(result.bytes)

    expect(result.diagnostics).toEqual([])
    expect(text.match(/\/Subtype \/Image\b/gu) ?? []).toHaveLength(3)
    expect(text.match(/\/Filter \/DCTDecode\b/gu) ?? []).toHaveLength(1)
    expect(text).toContain("/SMask")
    expect(text).toContain("20 0 0 10 5 821.9 cm\n/Im2 Do")
    expect(text).toContain("10 0 0 5 30 811.9 cm\n/Im2 Do")
    expect(validation.valid).toBe(true)
    expect(validation.errors).toEqual([])
    expect(serializePdf(images([]), { images: provider }).bytes).toEqual(
      serializePdf(images([]), { images: provider }).bytes
    )
  })

  test("diagnoses missing, invalid provider output, and invalid placement bounds at source nodes", () => {
    const badProvider: ImagePreparationProvider = {
      get(assetId) {
        if (assetId === "bad") return { ...jpeg, width: 0 }
        return undefined
      },
    }
    const result = serializePdf(
      images([
        {
          type: "image",
          sourceNodeId: "missing-node" as never,
          assetId: "missing",
          bounds: {
            x: twips(0),
            y: twips(0),
            width: twips(20),
            height: twips(20),
          },
        },
        {
          type: "image",
          sourceNodeId: "bad-node" as never,
          assetId: "bad",
          bounds: {
            x: twips(0),
            y: twips(0),
            width: twips(20),
            height: twips(20),
          },
        },
        {
          type: "image",
          sourceNodeId: "bounds-node" as never,
          assetId: "bad",
          bounds: {
            x: twips(0),
            y: twips(0),
            width: twips(-1),
            height: twips(20),
          },
        },
      ]),
      { images: badProvider }
    )

    expect(
      result.diagnostics.map(({ code, nodeId }) => [code, nodeId])
    ).toEqual([
      ["pdf/image-invalid", "bad-node"],
      ["pdf/image-invalid", "bounds-node"],
      ["pdf/image-unavailable", "missing-node"],
      ["pdf/image-placement-invalid", "bounds-node"],
    ])
    expect(validatePdfStructure(result.bytes).valid).toBe(true)
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
