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

function buildPdf(
  objects: readonly string[],
  options: Readonly<{
    size?: number
    root?: number
    extraXref?: string
  }> = {}
): Uint8Array {
  const bodies = [...objects]
  let source = "%PDF-1.7\n"
  const offsets = [0]
  for (const [index, object] of bodies.entries()) {
    offsets.push(source.length)
    source += `${index + 1} 0 obj\n${object}\nendobj\n`
  }
  const xref = source.length
  source += `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets.slice(1))
    source += `${String(offset).padStart(10, "0")} 00000 n \n`
  source += options.extraXref ?? ""
  source += `trailer\n<< /Size ${options.size ?? bodies.length + 1} /Root ${options.root ?? 1} 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(source)
}

function syntheticPdf(content: string, mediaBox = "0 0 100 150"): Uint8Array {
  return buildPdf([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [${mediaBox}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ])
}

function syntheticImagePdf(content: string, declared = true): Uint8Array {
  return buildPdf([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 150] /Resources <<${declared ? " /XObject << /Im1 4 0 R >>" : ""} >> /Contents 5 0 R >>`,
    "<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length 1 >>\nstream\nx\nendstream",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ])
}

describe("PDF structural validation", () => {
  test("accepts upright standard text and extracts it", () => {
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

  test("rejects text rendered through the old y-flipped transform", () => {
    const result = validatePdfStructure(
      syntheticPdf(
        "q\nBT\n/F1 12 Tf\n1 0 0 -1 0 150 cm\n1 0 0 1 10 120 Tm\n(old) Tj\nET\nQ"
      )
    )

    expect(result.valid).toBe(false)
    expect(result.errors).toContain(
      "Page 1 text rendering transform is mirrored"
    )
    expect(result.pageTexts).toEqual(["old"])
  })

  test("allows y-flipped graphics transforms outside text objects", () => {
    expect(
      validatePdfStructure(
        syntheticPdf("q\n1 0 0 -1 0 150 cm\n10 10 m\n90 10 l\nS\nQ")
      )
    ).toEqual({
      valid: true,
      errors: [],
      version: "1.7",
      pageCount: 1,
      pageTexts: [""],
      text: "",
    })
  })

  test("rejects singular text matrices", () => {
    const result = validatePdfStructure(
      syntheticPdf("BT\n/F1 12 Tf\n1 0 0 0 10 120 Tm\n(flat) Tj\nET")
    )

    expect(result.valid).toBe(false)
    expect(result.errors).toContain("Page 1 text matrix is singular")
    expect(result.errors).toContain(
      "Page 1 text rendering transform is singular"
    )
  })

  test("rejects non-finite, negative, zero, and malformed MediaBoxes", () => {
    for (const [mediaBox, expected] of [
      ["0 0 NaN 150", "Page 1 MediaBox is malformed"],
      [
        "0 0 -100 150",
        "Page 1 MediaBox must have finite non-negative coordinates and positive dimensions",
      ],
      [
        "0 0 0 150",
        "Page 1 MediaBox must have finite non-negative coordinates and positive dimensions",
      ],
      ["0 0 100", "Page 1 MediaBox is malformed"],
    ] as const) {
      const result = validatePdfStructure(syntheticPdf("", mediaBox))
      expect(result.valid).toBe(false)
      expect(result.errors).toContain(expected)
    }
  })

  test("tracks nested graphics state and validates every split image Do", () => {
    const valid = validatePdfStructure(
      syntheticImagePdf(
        "q\n-1 0 0 1 0 0 cm\nq\n-2 0 0 3 0 0 cm\n% split from matrix\n/Im1\nDo\nQ\nQ"
      )
    )
    expect(valid.valid).toBe(true)

    const mirrored = validatePdfStructure(
      syntheticImagePdf("q\n-1 0 0 1 0 0 cm\n/Im1\nDo\nQ")
    )
    expect(mirrored.errors).toContain(
      "Page 1 image matrix is non-finite, singular, or mirrored"
    )

    const undeclared = validatePdfStructure(syntheticImagePdf("/Im1 Do", false))
    expect(undeclared.errors).toContain(
      "Page 1 image resource Im1 is not declared"
    )
  })

  test("validates trailer coverage, root catalog, duplicate xref entries, and page-tree references", () => {
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
      "<< /Type /Page /Parent 2 0 R /Resources << >> /Contents 4 0 R >>",
      "<< /Length 0 >>\nstream\n\nendstream",
    ]
    expect(
      validatePdfStructure(buildPdf(objects, { size: 6 })).errors
    ).toContain("Classic xref /Size coverage omits object 5")
    expect(
      validatePdfStructure(buildPdf(objects, { root: 2 })).errors
    ).toContain("Classic xref /Root object 2 is not a catalog")
    expect(
      validatePdfStructure(
        buildPdf(objects, { extraXref: "3 1\n0000000000 00000 f \n" })
      ).errors
    ).toContain("Duplicate classic xref entry for object 3")
    const brokenTree = [...objects]
    brokenTree[1] = "<< /Type /Pages /Count 1 /Kids [99 0 R] >>"
    expect(validatePdfStructure(buildPdf(brokenTree)).errors).toContain(
      "Page tree references missing xref object 99"
    )
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
