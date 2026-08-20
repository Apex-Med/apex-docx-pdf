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
import { EditorState, type Transaction } from "prosemirror-state"

import { fromSemanticDocument, toSemanticDocument } from "../src/model/bridge"
import {
  detectOversizedNonSplittable,
  pageBreaksFromTrace,
  paginationSignature,
  positionForParagraphOffset,
  spacerSpecsFromPlacements,
} from "../src/pagination/breaks"
import {
  handleLayoutRequest,
  type LayoutWorkerRequest,
} from "../src/pagination/protocol"
import {
  decorationsFromPlacements,
  mapPaginationThroughTransaction,
} from "../src/pagination/plugin"

const style: TextStyle = {
  fontFamily: "Helvetica",
  fontSize: twips(220),
  fontWeight: 400,
  fontStyle: "normal",
  underline: false,
  color: "#000000",
}

function multiPageDocument(): SemanticDocument {
  const blank = createBlankDocument({
    pageHeight: 3_000,
    margins: { top: 200, right: 200, bottom: 200, left: 200 },
  })
  const longText =
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(80)
  const paragraph: SemanticParagraph = {
    type: "paragraph",
    id: nodeId("multi:p1"),
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
        id: nodeId("multi:t1"),
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

describe("pagination from layout path", () => {
  test("derives break char offsets from layout trace line events", async () => {
    const document = multiPageDocument()
    const request: LayoutWorkerRequest = {
      type: "layout",
      requestId: "test-1",
      document,
      includeTrace: true,
    }
    const response = await handleLayoutRequest(request, (doc, options) =>
      layoutDocument(doc, {
        includeTrace: options.includeTrace,
        maxPages: options.maxPages,
      })
    )
    expect(response.type).toBe("success")
    if (response.type !== "success") return

    expect(response.displayList.pages.length).toBeGreaterThan(1)
    expect(response.trace).toBeDefined()

    const placements = pageBreaksFromTrace(response.trace, response.displayList)
    expect(placements.length).toBeGreaterThan(0)
    for (const placement of placements) {
      expect(placement.charOffset).toBeGreaterThanOrEqual(0)
      expect(String(placement.sourceNodeId)).toBe("multi:p1")
      expect(placement.pageNumber).toBeGreaterThan(1)
    }

    const pm = fromSemanticDocument(document)
    const specs = spacerSpecsFromPlacements(pm, placements)
    expect(specs.length).toBeGreaterThan(0)
    expect(specs[0]?.technique).toBe("float-block")
    expect(specs[0]?.charOffset).toBe(placements[0]!.charOffset)

    // Position is inside the paragraph content
    const pos = positionForParagraphOffset(
      pm,
      "multi:p1",
      placements[0]!.charOffset
    )
    expect(pos).not.toBeNull()
    expect(pos!).toBeGreaterThan(0)
  })

  test("decoration mapping survives a follow-up document transform", () => {
    const document = multiPageDocument()
    const layout = layoutDocument(document, { includeTrace: true })
    expect(layout.trace).toBeDefined()
    const placements = pageBreaksFromTrace(layout.trace!, layout.displayList)
    const pm = fromSemanticDocument(document)
    expect(placements.length).toBeGreaterThan(0)

    // Real widget decorations from shipped helper (not an empty set).
    const decorations = decorationsFromPlacements(pm, placements, true)
    const before = decorations.find().map((deco) => deco.from)
    expect(before.length).toBeGreaterThan(0)

    const state = EditorState.create({ doc: pm })
    // Insert a character at the start of the paragraph content — shifts offsets by +1.
    const insertPos = 2
    const tr: Transaction = state.tr.insertText("X", insertPos)
    const mapped = mapPaginationThroughTransaction(
      {
        decorations,
        signature: paginationSignature(
          placements,
          layout.displayList.pages.length
        ),
        placements,
        pageCount: layout.displayList.pages.length,
        sectionPages: [],
        diagnostics: [],
        iteration: 0,
        valuesEpoch: 0,
        scrollAfterPagination: false,
      },
      tr,
      tr.doc
    )

    const after = mapped.decorations.find().map((deco) => deco.from)
    expect(after.length).toBe(before.length)
    // Every decoration at or after the insert point must advance by the insert size.
    for (let i = 0; i < before.length; i += 1) {
      const expected = before[i]! >= insertPos ? before[i]! + 1 : before[i]!
      expect(after[i]).toBe(expected)
    }

    const nextSemantic = toSemanticDocument(tr.doc)
    expect(
      (nextSemantic.sections[0]!.blocks[0] as SemanticParagraph).children.some(
        (c) => c.type === "text" && c.text.startsWith("X")
      )
    ).toBe(true)
  })

  test("oversized non-splittable block path terminates with diagnostic", () => {
    const document = multiPageDocument()
    // Force a tiny page and a paragraph that will overflow
    const tiny = {
      ...document,
      sections: [
        {
          ...document.sections[0]!,
          properties: {
            ...document.sections[0]!.properties,
            pageHeight: twips(800),
            margins: {
              top: twips(100),
              right: twips(100),
              bottom: twips(100),
              left: twips(100),
            },
          },
        },
      ],
    }
    const layout = layoutDocument(tiny, { includeTrace: true, maxPages: 50 })
    expect(layout.trace).toBeDefined()
    // Synthesize an oversized block event for the guard
    const fakeTrace = {
      ...layout.trace!,
      events: [
        ...layout.trace!.events,
        {
          pageNumber: 1,
          sourceNodeId: nodeId("oversized"),
          kind: "block" as const,
          bounds: {
            x: twips(0),
            y: twips(0),
            width: twips(1000),
            height: twips(50_000),
          },
        },
      ],
    }
    const result = detectOversizedNonSplittable(fakeTrace, layout.displayList, {
      maxIterations: 3,
      iteration: 3,
    })
    expect(result.diagnostics.length).toBeGreaterThan(0)
    expect(result.shouldAbort).toBe(true)
    expect(result.diagnostics[0]?.code).toBe(
      "editor/oversized-non-splittable-block"
    )
  })
})

describe("mid-paragraph spacer technique", () => {
  test("constructs float-based spacer at paragraphStart + charOffset from real trace", () => {
    const document = multiPageDocument()
    const layout = layoutDocument(document, { includeTrace: true })
    const placements = pageBreaksFromTrace(layout.trace!, layout.displayList)
    expect(placements.length).toBeGreaterThan(0)
    const mid = placements.find((p) => p.charOffset > 0)
    expect(mid).toBeDefined()
    const pm = fromSemanticDocument(document)
    const specs = spacerSpecsFromPlacements(pm, mid ? [mid] : placements)
    expect(specs[0]?.technique).toBe("float-block")
    expect(specs[0]?.side).toBe(-1)
    expect(specs[0]?.heightTwips).toBeGreaterThan(0)
    // Structural proof: position equals mapped paragraphStart + charOffset
    const expected = positionForParagraphOffset(
      pm,
      String(specs[0]!.sourceNodeId),
      specs[0]!.charOffset
    )
    expect(specs[0]?.position ?? null).toBe(expected)
  })
})
