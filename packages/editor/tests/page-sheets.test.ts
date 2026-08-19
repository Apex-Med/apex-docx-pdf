import { describe, expect, test } from "bun:test"
import {
  createBlankDocument,
  nodeId,
  twips,
  type SemanticDocument,
  type SemanticParagraph,
  type TextStyle,
} from "@apexmed/core"
import { layoutDocument } from "@apexmed/layout"

import {
  pageBreaksFromTrace,
  pageGeometryFromDisplayList,
  spacerSpecsFromPlacements,
  PAGE_GAP_TWIPS,
  sectionPageCountsFromLayout,
  sectionStackHeightTwips,
  mergeManualPageBreakPlacements,
} from "../src/pagination/breaks"
import { fromSemanticDocument } from "../src/model/bridge"
import {
  applyCommandToSemantic,
  createEditorStateFromDocument,
  insertPageBreak,
} from "../src/index"

const style: TextStyle = {
  fontFamily: "Helvetica",
  fontSize: twips(220),
  fontWeight: 400,
  fontStyle: "normal",
  underline: false,
  color: "#000000",
}

function multiPageDoc(): SemanticDocument {
  const blank = createBlankDocument({
    pageHeight: 3_000,
    margins: { top: 200, right: 200, bottom: 200, left: 200 },
  })
  const longText =
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(80)
  const paragraph: SemanticParagraph = {
    type: "paragraph",
    id: nodeId("sheet:p1"),
    source: blank.source,
    properties: {
      alignment: "left",
      spacingBefore: twips(0),
      spacingAfter: twips(0),
      lineSpacing: null,
      indentStart: twips(0),
      indentEnd: twips(0),
      firstLineIndent: twips(0),
      keepWithNext: false,
      keepLinesTogether: false,
      widowControl: true,
      pageBreakBefore: false,
      numbering: null,
      tabStops: [],
    },
    children: [
      {
        type: "text",
        id: nodeId("sheet:t1"),
        source: blank.source,
        text: longText,
        style,
      },
    ],
  }
  return {
    ...blank,
    sections: [
      {
        ...blank.sections[0]!,
        properties: {
          ...blank.sections[0]!.properties,
          pageHeight: twips(3_000),
          margins: {
            top: twips(200),
            right: twips(200),
            bottom: twips(200),
            left: twips(200),
          },
        },
        blocks: [paragraph],
      },
    ],
  }
}

function manyParagraphDoc(): SemanticDocument {
  const blank = createBlankDocument()
  const base = blank.sections[0]?.blocks[0]
  if (!base || base.type !== "paragraph") return blank
  const blocks: SemanticParagraph[] = Array.from({ length: 140 }, (_, index) => ({
    ...base,
    id: nodeId(`many:p:${index + 1}`),
    source: {
      ...base.source,
      xmlPath: `/many/p[${index + 1}]`,
    },
    children: [
      {
        ...base.children[0]!,
        id: nodeId(`many:t:${index + 1}`),
        source: {
          ...base.children[0]!.source,
          xmlPath: `/many/p[${index + 1}]/r[1]/t[1]`,
        },
        text: `Paragraph ${index + 1}: The quick brown fox jumps over the lazy dog. This line exercises deterministic multi-page pagination and caret flow.`,
      },
    ],
  }))
  return {
    ...blank,
    sections: [{ ...blank.sections[0]!, blocks }],
  }
}

function multipleManualBreakDoc(): SemanticDocument {
  const blank = createBlankDocument()
  const section = blank.sections[0]
  const paragraph = section?.blocks[0]
  if (!section || paragraph?.type !== "paragraph") return blank
  const baseText = paragraph.children[0]
  if (!baseText || baseText.type !== "text") return blank
  return {
    ...blank,
    sections: [
      {
        ...section,
        blocks: [
          {
            ...paragraph,
            children: [
              { ...baseText, text: "First page" },
              {
                type: "break",
                id: nodeId("manual:break:1"),
                source: blank.source,
                kind: "page",
              },
              {
                ...baseText,
                id: nodeId("manual:text:2"),
                text: "Second page",
              },
              {
                type: "break",
                id: nodeId("manual:break:2"),
                source: blank.source,
                kind: "page",
              },
              {
                ...baseText,
                id: nodeId("manual:text:3"),
                text: "Third page",
              },
            ],
          },
        ],
      },
    ],
  }
}

describe("Google Docs-style page sheets", () => {
  test("emits exactly one spacer for each page transition across many paragraphs", () => {
    const document = manyParagraphDoc()
    const layout = layoutDocument(document, { includeTrace: true })
    const placements = pageBreaksFromTrace(layout.trace!, layout.displayList)

    expect(layout.displayList.pages.length).toBeGreaterThan(2)
    expect(placements).toHaveLength(layout.displayList.pages.length - 1)
    expect(new Set(placements.map((placement) => placement.pageNumber)).size).toBe(
      placements.length
    )
  })

  test("maps consecutive manual breaks to their exact destination pages", () => {
    const document = multipleManualBreakDoc()
    const layout = layoutDocument(document, { includeTrace: true })
    const pm = fromSemanticDocument(document)
    const automatic = pageBreaksFromTrace(layout.trace!, layout.displayList)
    const placements = mergeManualPageBreakPlacements(
      pm,
      automatic,
      layout.displayList,
      layout.trace
    )

    expect(layout.displayList.pages).toHaveLength(3)
    expect(placements.map((placement) => placement.pageNumber)).toEqual([2, 3])
    expect(placements.every((placement) => placement.explicitPosition)).toBe(
      true
    )
    expect(placements[0]?.explicitPosition).toBeLessThan(
      placements[1]?.explicitPosition ?? 0
    )
  })

  test("pageBreaksFromTrace measures rest on the ending page, not the new page", () => {
    const document = multiPageDoc()
    const layout = layoutDocument(document, { includeTrace: true })
    expect(layout.trace).toBeDefined()
    expect(layout.displayList.pages.length).toBeGreaterThan(1)

    const placements = pageBreaksFromTrace(layout.trace!, layout.displayList)
    expect(placements.length).toBeGreaterThan(0)

    for (const p of placements) {
      // Rest must be less than full content height for mid-page splits
      // (if it equals content height it's a block-start break — still valid)
      expect(p.restTwips).toBeGreaterThan(0)
      expect(p.pageWidthTwips).toBeGreaterThan(0)
      expect(p.marginTopTwips).toBeGreaterThanOrEqual(0)
      expect(p.marginBottomTwips).toBeGreaterThanOrEqual(0)
      expect(p.pageNumber).toBeGreaterThan(1)
    }

    // Mid-paragraph breaks should not all claim rest == full content height
    const mid = placements.filter((p) => p.charOffset > 0)
    expect(mid.length).toBeGreaterThan(0)
    const geo = pageGeometryFromDisplayList(layout.displayList, 1)
    // At least one mid break should have rest strictly less than content height
    // (filling only the remainder of the sheet)
    expect(mid.some((p) => p.restTwips < geo.contentHeightTwips)).toBe(true)
  })

  test("spacer specs encode full page-stack height including margins and gap", () => {
    const document = multiPageDoc()
    const layout = layoutDocument(document, { includeTrace: true })
    const placements = pageBreaksFromTrace(layout.trace!, layout.displayList)
    const pm = fromSemanticDocument(document)
    const specs = spacerSpecsFromPlacements(pm, placements)
    expect(specs.length).toBeGreaterThan(0)
    for (const spec of specs) {
      // rest + margins + gap >> a dashed line (~0 height)
      expect(spec.heightTwips).toBeGreaterThan(500)
      expect(spec.technique).toBe("float-block")
      expect(spec.pageNumber).toBeGreaterThan(1)
    }
  })

  test("stack height is n sheets plus n-1 desk gaps", () => {
    expect(PAGE_GAP_TWIPS).toBe(32 * 15)
    expect(sectionStackHeightTwips(1, 15_840)).toBe(15_840)
    expect(sectionStackHeightTwips(2, 15_840)).toBe(2 * 15_840 + PAGE_GAP_TWIPS)
    expect(sectionStackHeightTwips(3, 16_838)).toBe(3 * 16_838 + 2 * PAGE_GAP_TWIPS)
  })

  test("blank manual page break still fills a two-page section stack", () => {
    const state = createEditorStateFromDocument(createBlankDocument())
    const result = applyCommandToSemantic(state, insertPageBreak())
    const layout = layoutDocument(result.document, { includeTrace: true })
    expect(layout.displayList.pages.length).toBe(2)
    expect(layout.trace).toBeTruthy()

    const merged = mergeManualPageBreakPlacements(
      result.state.doc,
      pageBreaksFromTrace(layout.trace!, layout.displayList),
      layout.displayList,
      layout.trace
    )
    expect(merged.length).toBeGreaterThan(0)
    expect(merged[0]?.explicitPosition).toBeGreaterThan(0)
    expect(merged[0]?.restTwips).toBeGreaterThan(100)

    const counts = sectionPageCountsFromLayout(
      result.state.doc,
      layout.displayList,
      layout.trace!
    )
    expect(counts).toHaveLength(1)
    expect(counts[0]?.pageCount).toBe(2)
    expect(sectionStackHeightTwips(counts[0]!.pageCount, counts[0]!.pageHeightTwips)).toBe(
      2 * counts[0]!.pageHeightTwips + PAGE_GAP_TWIPS
    )
  })
})
