import { describe, expect, test } from "bun:test"
import {
  createBlankDocument,
  nodeId,
  twips,
  type SemanticDocument,
  type SemanticParagraph,
  type TextStyle,
} from "@apexmed/core"
import {
  createPreparedBlockCache,
  layoutDocument,
} from "../src/index"

const style: TextStyle = {
  fontFamily: "Helvetica",
  fontSize: twips(220),
  fontWeight: 400,
  fontStyle: "normal",
  underline: false,
  color: "#000000",
}

describe("prepared-block cache", () => {
  test("re-layout after identity-preserving edit reuses prepared blocks", () => {
    const blank = createBlankDocument()
    const p1: SemanticParagraph = {
      type: "paragraph",
      id: nodeId("cache:p1"),
      source: blank.source,
      properties: {
        alignment: "left",
        spacingBefore: twips(0),
        spacingAfter: twips(200),
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
          id: nodeId("cache:t1"),
          source: blank.source,
          text: "Unchanged paragraph that should hit the cache.",
          style,
        },
      ],
    }
    const p2: SemanticParagraph = {
      type: "paragraph",
      id: nodeId("cache:p2"),
      source: blank.source,
      properties: p1.properties,
      children: [
        {
          type: "text",
          id: nodeId("cache:t2"),
          source: blank.source,
          text: "Also stable.",
          style,
        },
      ],
    }

    const doc1: SemanticDocument = {
      ...blank,
      sections: [
        {
          ...blank.sections[0]!,
          blocks: [p1, p2],
        },
      ],
    }

    const cache = createPreparedBlockCache()
    const width = twips(
      doc1.sections[0]!.properties.pageWidth -
        doc1.sections[0]!.properties.margins.left -
        doc1.sections[0]!.properties.margins.right
    )

    layoutDocument(doc1, { cache, includeTrace: true })
    expect(cache.get(p1, width)?.kind).toBe("paragraph")
    expect(cache.get(p2, width)?.kind).toBe("paragraph")

    const prepared1 = cache.get(p1, width)?.value

    // Identity-preserving edit: replace only p2 with a new object; p1 same reference.
    const p2Edited: SemanticParagraph = {
      ...p2,
      children: [
        {
          type: "text",
          id: nodeId("cache:t2b"),
          source: blank.source,
          text: "Edited paragraph.",
          style,
        },
      ],
    }
    const doc2: SemanticDocument = {
      ...doc1,
      sections: [
        {
          ...doc1.sections[0]!,
          blocks: [p1, p2Edited],
        },
      ],
    }

    layoutDocument(doc2, { cache, includeTrace: true })
    const prepared1After = cache.get(p1, width)?.value
    // Same object identity means the prepared block was reused from cache.
    expect(prepared1After).toBe(prepared1)
    // Edited paragraph should have its own prepared entry.
    expect(cache.get(p2Edited, width)?.kind).toBe("paragraph")
  })
})
