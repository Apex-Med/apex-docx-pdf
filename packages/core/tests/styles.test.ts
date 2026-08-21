import { describe, expect, test } from "bun:test"
import {
  createBlankDocument,
  createEmptyDocumentStyles,
  DEFAULT_PARAGRAPH_PROPERTIES,
  DEFAULT_TEXT_STYLE,
  resolveParagraphProperties,
  resolveStyles,
  resolveTextStyle,
  twips,
  type DocumentStyles,
  type SemanticDocument,
  type StyleDefinition,
} from "../src"

function withStyles(
  document: SemanticDocument,
  styles: DocumentStyles
): SemanticDocument {
  return { ...document, styles }
}

describe("createBlankDocument", () => {
  test("creates a document without a DOCX package", () => {
    const document = createBlankDocument()
    expect(document.type).toBe("document")
    expect(document.sections).toHaveLength(1)
    expect(document.sections[0]?.blocks).toHaveLength(1)
    const paragraph = document.sections[0]?.blocks[0]
    expect(paragraph?.type).toBe("paragraph")
    if (paragraph?.type !== "paragraph") return
    expect(paragraph.properties).toEqual(DEFAULT_PARAGRAPH_PROPERTIES)
    expect(paragraph.children[0]?.type).toBe("text")
    if (paragraph.children[0]?.type !== "text") return
    expect(paragraph.children[0].text).toBe("")
    expect(paragraph.children[0].style).toEqual(DEFAULT_TEXT_STYLE)
    expect(document.styles).toBeDefined()
  })

  test("accepts custom page geometry", () => {
    const document = createBlankDocument({
      pageWidth: 12_240,
      pageHeight: 15_840,
      margins: { top: 720, right: 720, bottom: 720, left: 720 },
    })
    const section = document.sections[0]
    expect(section?.properties.pageWidth).toBe(twips(12_240))
    expect(section?.properties.pageHeight).toBe(twips(15_840))
    expect(section?.properties.margins.top).toBe(twips(720))
  })
})

describe("resolveStyles", () => {
  test("enforces resolved text and paragraph styles from styleId + direct overrides", () => {
    const heading: StyleDefinition = {
      id: "Heading1",
      name: "Heading 1",
      type: "paragraph",
      basedOn: null,
      next: "Normal",
      paragraph: {
        spacingAfter: twips(200),
        keepWithNext: true,
      },
      text: {
        fontWeight: 700,
        fontSize: twips(320),
      },
    }
    const strong: StyleDefinition = {
      id: "Strong",
      name: "Strong",
      type: "character",
      basedOn: null,
      next: null,
      paragraph: null,
      text: { fontWeight: 700 },
    }
    const styles: DocumentStyles = {
      ...createEmptyDocumentStyles(),
      definitions: [heading, strong],
      defaultParagraphStyleId: null,
      defaultCharacterStyleId: null,
    }

    const blank = createBlankDocument()
    const paragraph = blank.sections[0]?.blocks[0]
    if (paragraph?.type !== "paragraph") throw new Error("expected paragraph")
    const text = paragraph.children[0]
    if (text?.type !== "text") throw new Error("expected text")

    const unresolved: SemanticDocument = withStyles(
      {
        ...blank,
        sections: [
          {
            ...blank.sections[0]!,
            blocks: [
              {
                ...paragraph,
                // Intentionally wrong resolved values — resolveStyles must fix them.
                properties: {
                  ...DEFAULT_PARAGRAPH_PROPERTIES,
                  spacingAfter: twips(0),
                },
                styleId: "Heading1",
                directProperties: { alignment: "center" },
                children: [
                  {
                    ...text,
                    style: DEFAULT_TEXT_STYLE,
                    styleId: "Strong",
                    directStyle: { underline: true },
                  },
                ],
              },
            ],
          },
        ],
      },
      styles
    )

    const resolved = resolveStyles(unresolved)
    const out = resolved.sections[0]?.blocks[0]
    expect(out?.type).toBe("paragraph")
    if (out?.type !== "paragraph") return
    expect(out.properties.spacingAfter).toBe(twips(200))
    expect(out.properties.keepWithNext).toBe(true)
    expect(out.properties.alignment).toBe("center")
    const outText = out.children[0]
    expect(outText?.type).toBe("text")
    if (outText?.type !== "text") return
    expect(outText.style.fontWeight).toBe(700)
    expect(outText.style.underline).toBe(true)
  })

  test("resolve helpers match the document-level invariant", () => {
    const styles = createEmptyDocumentStyles()
    const paragraph = resolveParagraphProperties(styles, null, {
      alignment: "right",
    })
    expect(paragraph.alignment).toBe("right")
    expect(paragraph.spacingBefore).toBe(
      DEFAULT_PARAGRAPH_PROPERTIES.spacingBefore
    )

    const text = resolveTextStyle(styles, null, { color: "#FF0000" })
    expect(text.color).toBe("#FF0000")
    expect(text.fontFamily).toBe(DEFAULT_TEXT_STYLE.fontFamily)
  })
})
