import { describe, expect, test } from "bun:test"
import * as fc from "fast-check"
import {
  createBlankDocument,
  type SemanticDocument,
  type SemanticFontAsset,
  type SemanticParagraph,
  type SemanticText,
} from "@apexmed/core"
import { unzipSync } from "fflate"
import { buildMinimalDocx } from "../../testkit/src/docx"

import { normaliseDocxBytes, serializeDocx } from "../src"

function paragraphText(document: SemanticDocument): string[] {
  const result: string[] = []
  for (const section of document.sections) {
    for (const block of section.blocks) {
      if (block.type !== "paragraph") continue
      result.push(
        block.children
          .filter((child): child is SemanticText => child.type === "text")
          .map((child) => child.text)
          .join("")
      )
    }
  }
  return result
}

function firstParagraph(
  document: SemanticDocument
): SemanticParagraph | undefined {
  for (const section of document.sections) {
    for (const block of section.blocks) {
      if (block.type === "paragraph") return block
    }
  }
  return undefined
}

/** Normalize documents for equivalence by stripping volatile ids/sources. */
function equivalenceShape(document: SemanticDocument) {
  const shapeInline = (inline: SemanticParagraph["children"][number]) => {
    if (inline.type === "text") {
      return {
        type: "text" as const,
        text: inline.text,
        preserveSpace: inline.preserveSpace === true,
        style: {
          fontFamily: inline.style.fontFamily,
          fontSize: inline.style.fontSize,
          fontWeight: inline.style.fontWeight,
          fontStyle: inline.style.fontStyle,
          underline: inline.style.underline,
          color: inline.style.color.toUpperCase().replace(/^#/, "#"),
        },
      }
    }
    if (inline.type === "break") {
      return { type: "break" as const, kind: inline.kind }
    }
    if (inline.type === "tab") return { type: "tab" as const }
    if (inline.type === "pageField") {
      return {
        type: "pageField" as const,
        field: inline.field,
        displayText: inline.displayText,
      }
    }
    return {
      type: "image" as const,
      assetId: inline.assetId,
      width: inline.width,
      height: inline.height,
    }
  }
  const shapeParagraph = (paragraph: SemanticParagraph) => ({
    type: "paragraph" as const,
    alignment: paragraph.properties.alignment,
    spacingBefore: paragraph.properties.spacingBefore,
    spacingAfter: paragraph.properties.spacingAfter,
    children: paragraph.children.map(shapeInline),
  })
  return {
    pageWidth: document.sections[0]?.properties.pageWidth,
    pageHeight: document.sections[0]?.properties.pageHeight,
    margins: document.sections[0]?.properties.margins,
    paragraphs: document.sections.flatMap((section) =>
      section.blocks
        .filter(
          (block): block is SemanticParagraph => block.type === "paragraph"
        )
        .map(shapeParagraph)
    ),
  }
}

describe("serializeDocx", () => {
  test("round-trips a blank document through parse(serialize(d))", () => {
    const blank = createBlankDocument()
    const bytes = serializeDocx(blank)
    expect(bytes.byteLength).toBeGreaterThan(100)
    const parsed = normaliseDocxBytes(bytes)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.sections).toHaveLength(1)
    expect(paragraphText(parsed.value)).toEqual([""])
    expect(parsed.value.styles).toBeDefined()
  })

  test("round-trips a minimal multi-paragraph document", () => {
    const sourceBytes = buildMinimalDocx({
      paragraphs: ["Hello DOCX", "Second paragraph", { runs: ["A", "B"] }],
      pageSize: { width: 11_906, height: 16_838 },
      margins: { top: 1_440, right: 1_440, bottom: 1_440, left: 1_440 },
    })
    const original = normaliseDocxBytes(sourceBytes)
    expect(original.ok).toBe(true)
    if (!original.ok) return

    const serialized = serializeDocx(original.value)
    const roundTrip = normaliseDocxBytes(serialized)
    expect(roundTrip.ok).toBe(true)
    if (!roundTrip.ok) return

    expect(paragraphText(roundTrip.value)).toEqual(
      paragraphText(original.value)
    )
    expect(equivalenceShape(roundTrip.value)).toEqual(
      equivalenceShape(original.value)
    )
  })

  test("preserves paragraph alignment and bold run formatting", () => {
    const sourceBytes = buildMinimalDocx({
      paragraphs: ["Styled"],
    })
    const original = normaliseDocxBytes(sourceBytes)
    expect(original.ok).toBe(true)
    if (!original.ok) return
    const paragraph = firstParagraph(original.value)
    expect(paragraph).toBeDefined()
    if (!paragraph) return

    const styled: SemanticDocument = {
      ...original.value,
      sections: [
        {
          ...original.value.sections[0]!,
          blocks: [
            {
              ...paragraph,
              properties: { ...paragraph.properties, alignment: "center" },
              children: paragraph.children.map((child) =>
                child.type === "text"
                  ? {
                      ...child,
                      style: {
                        ...child.style,
                        fontWeight: 700,
                        underline: true,
                        color: "#FF0000",
                      },
                    }
                  : child
              ),
            },
          ],
        },
      ],
    }

    const roundTrip = normaliseDocxBytes(serializeDocx(styled))
    expect(roundTrip.ok).toBe(true)
    if (!roundTrip.ok) return
    const out = firstParagraph(roundTrip.value)
    expect(out?.properties.alignment).toBe("center")
    const text = out?.children.find((child) => child.type === "text")
    expect(text?.type).toBe("text")
    if (text?.type !== "text") return
    expect(text.style.fontWeight).toBe(700)
    expect(text.style.underline).toBe(true)
    expect(text.style.color.toUpperCase()).toBe("#FF0000")
  })

  test("property: parseDocx(serializeDocx(d)) preserves paragraph texts for representative docs", () => {
    const textArb = fc
      .string({ minLength: 0, maxLength: 40 })
      .filter((value) => !value.includes("\0"))
    const paragraphsArb = fc.array(textArb, { minLength: 1, maxLength: 6 })

    fc.assert(
      fc.property(paragraphsArb, (paragraphs) => {
        const sourceBytes = buildMinimalDocx({ paragraphs })
        const original = normaliseDocxBytes(sourceBytes)
        if (!original.ok) return false
        const serialized = serializeDocx(original.value)
        const roundTrip = normaliseDocxBytes(serialized)
        if (!roundTrip.ok) return false
        return (
          JSON.stringify(paragraphText(roundTrip.value)) ===
          JSON.stringify(paragraphText(original.value))
        )
      }),
      { numRuns: 25 }
    )
  })

  test("serializes editorMetadata into a custom part that round-trips", () => {
    const blank = createBlankDocument()
    const withMeta: SemanticDocument = {
      ...blank,
      editorMetadata: {
        customPalettes: [{ id: "brand", colors: ["#112233", "#445566"] }],
      },
    }
    const roundTrip = normaliseDocxBytes(serializeDocx(withMeta))
    expect(roundTrip.ok).toBe(true)
    if (!roundTrip.ok) return
    expect(roundTrip.value.editorMetadata).toEqual(withMeta.editorMetadata)
  })

  test("persists non-standard fontWeight 500 via apexEditor.json runWeights", () => {
    const blank = createBlankDocument()
    const paragraph = firstParagraph(blank)
    expect(paragraph).toBeDefined()
    if (!paragraph) return

    const medium: SemanticDocument = {
      ...blank,
      sections: [
        {
          ...blank.sections[0]!,
          blocks: [
            {
              ...paragraph,
              children: paragraph.children.map((child) =>
                child.type === "text"
                  ? {
                      ...child,
                      style: { ...child.style, fontWeight: 500 },
                      directStyle: { fontWeight: 500 },
                    }
                  : child
              ),
            },
          ],
        },
      ],
    }

    const bytes = serializeDocx(medium)
    const roundTrip = normaliseDocxBytes(bytes)
    expect(roundTrip.ok).toBe(true)
    if (!roundTrip.ok) return
    expect(roundTrip.value.editorMetadata).toMatchObject({
      runWeights: { "0": 500 },
    })
    const text = firstParagraph(roundTrip.value)?.children.find(
      (child) => child.type === "text"
    )
    expect(text?.type).toBe("text")
    if (text?.type !== "text") return
    expect(text.style.fontWeight).toBe(500)
    expect(text.directStyle?.fontWeight).toBe(500)
  })

  test("embeds DOCX font faces with a font table, rels, and recoverable bytes", () => {
    const blank = createBlankDocument()
    const makeFace = (
      id: string,
      weight: 400 | 700,
      style: "normal" | "italic",
      bytes: readonly number[]
    ): SemanticFontAsset => ({
      type: "fontAsset",
      id,
      source: { part: "word/fonts", xmlPath: `/${id}` },
      packagePath: `word/fonts/${id}.odttf`,
      family: "Fixture Sans",
      weight,
      style,
      bytes,
    })
    const fontAssets = [
      makeFace("regular", 400, "normal", [0, 1, 2, 3, 4, 5, 6, 7]),
      makeFace("bold", 700, "normal", [8, 9, 10, 11, 12, 13, 14, 15]),
      makeFace("italic", 400, "italic", [16, 17, 18, 19, 20, 21, 22, 23]),
      makeFace("bold-italic", 700, "italic", [24, 25, 26, 27, 28, 29, 30, 31]),
    ]
    const bytes = serializeDocx({ ...blank, fontAssets })
    const packageParts = unzipSync(bytes)
    const fontTable = new TextDecoder().decode(
      packageParts["word/fontTable.xml"]
    )
    const fontRels = new TextDecoder().decode(
      packageParts["word/_rels/fontTable.xml.rels"]
    )
    expect(fontTable).toContain('w:name="Fixture Sans"')
    expect(fontTable).toContain("w:embedRegular")
    expect(fontTable).toContain("w:embedBold")
    expect(fontTable).toContain("w:embedItalic")
    expect(fontTable).toContain("w:embedBoldItalic")
    expect(fontRels.match(/relationships\/font/g)?.length).toBe(4)
    expect(packageParts["word/fonts/regular.odttf"]).toBeDefined()

    const roundTrip = normaliseDocxBytes(bytes)
    expect(roundTrip.ok).toBe(true)
    if (!roundTrip.ok) return
    expect(
      roundTrip.value.fontAssets?.map((asset) => ({
        packagePath: asset.packagePath,
        family: asset.family,
        weight: asset.weight,
        style: asset.style,
        bytes: asset.bytes,
      }))
    ).toEqual(
      fontAssets.map((asset) => ({
        packagePath: asset.packagePath,
        family: asset.family,
        weight: asset.weight,
        style: asset.style,
        bytes: asset.bytes,
      }))
    )
  })
})
