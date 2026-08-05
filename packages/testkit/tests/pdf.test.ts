import { describe, expect, test } from "bun:test"
import {
  fontFaceId,
  glyphId,
  twips,
  type FontEmbeddingProvider,
  type PageDisplayList,
} from "@apex-docx-pdf/core"
import { serializePdf } from "@apex-docx-pdf/pdf"

import { validatePdfStructure } from "../src"

function page(
  pageNumber: number,
  text: string
): PageDisplayList["pages"][number] {
  return {
    pageNumber,
    width: twips(2_000),
    height: twips(3_000),
    contentBounds: {
      x: twips(100),
      y: twips(100),
      width: twips(1_800),
      height: twips(2_800),
    },
    items: [
      {
        type: "glyph-run",
        fontSource: "standard",
        sourceNodeId: `text-${pageNumber}` as never,
        text,
        fontFamily: "Helvetica",
        fontSize: twips(240),
        color: "#000000",
        x: twips(100),
        baselineY: twips(300),
        width: twips(500),
      },
    ],
  }
}

describe("PDF structural validation", () => {
  test("validates and extracts text from engine PDFs", () => {
    const bytes = serializePdf({
      pages: [page(1, "One (page)\\"), page(2, "€ two")],
    }).bytes
    expect(validatePdfStructure(bytes)).toEqual({
      valid: true,
      errors: [],
      version: "1.7",
      pageCount: 2,
      pageTexts: ["One (page)\\", "€ two"],
      text: "One (page)\\\n€ two",
    })
  })

  test("extracts ligature text through an embedded font ToUnicode map", () => {
    const faceId = fontFaceId("noto-fixture")
    const standard = page(1, "unused")
    const displayList: PageDisplayList = {
      pages: [
        {
          ...standard,
          items: [
            {
              type: "glyph-run",
              fontSource: "embedded",
              sourceNodeId: "embedded" as never,
              text: "office",
              faceId,
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
                  xOffset: twips(0),
                  yOffset: twips(0),
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
              color: "#000000",
              x: twips(100),
              baselineY: twips(300),
              width: twips(440),
            },
          ],
        },
      ],
    }
    const fonts: FontEmbeddingProvider = {
      subset(requestedFaceId, glyphIds) {
        return {
          faceId: requestedFaceId,
          kind: "truetype",
          subsetted: false,
          bytes: Uint8Array.of(0, 1, 0, 0),
          postscriptName: "NotoSansFixture",
          metrics: {
            unitsPerEm: 1_000,
            ascent: 800,
            descent: -200,
            lineGap: 100,
            underlinePosition: -75,
            underlineThickness: 50,
            bbox: { xMin: 0, yMin: -200, xMax: 1_000, yMax: 800 },
          },
          glyphMap: glyphIds.map((sourceGlyphId) => ({
            sourceGlyphId,
            subsetGlyphId: sourceGlyphId,
          })),
        }
      },
    }

    expect(
      validatePdfStructure(serializePdf(displayList, { fonts }).bytes)
    ).toEqual({
      valid: true,
      errors: [],
      version: "1.7",
      pageCount: 1,
      pageTexts: ["office"],
      text: "office",
    })
  })

  test("reports truncated, non-finite, and inconsistent PDFs", () => {
    const malformed = new TextEncoder().encode(
      "%PDF-1.7\n1 0 obj\n<< /Type /Pages /Count 2 /Kids [] >>\nendobj\nNaN\n"
    )
    const result = validatePdfStructure(malformed)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("Missing terminal PDF EOF marker")
    expect(result.errors).toContain("PDF contains a non-finite numeric token")
    expect(result.errors).toContain(
      "Page tree declares 2 pages but 0 page objects were found"
    )
  })
})
