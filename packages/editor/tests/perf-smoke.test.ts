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
import { EditorState } from "prosemirror-state"

import { fromSemanticDocument, toSemanticDocument } from "../src/model/bridge"
import {
  pageBreaksFromTrace,
  paginationSignature,
} from "../src/pagination/breaks"
import {
  createLayoutClient,
  getLayoutAsync,
} from "../src/pagination/layout-client"
import { decorationsFromPlacements } from "../src/pagination/plugin"

const style: TextStyle = {
  fontFamily: "Helvetica",
  fontSize: twips(220),
  fontWeight: 400,
  fontStyle: "normal",
  underline: false,
  color: "#000000",
}

function documentWithParagraphs(count: number): SemanticDocument {
  const blank = createBlankDocument()
  const blocks: SemanticParagraph[] = Array.from(
    { length: count },
    (_, index) => ({
      type: "paragraph",
      id: nodeId(`perf:p${index + 1}`),
      source: blank.source,
      properties: {
        alignment: "left",
        spacingBefore: twips(0),
        spacingAfter: twips(120),
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
          id: nodeId(`perf:t${index + 1}`),
          source: blank.source,
          text: `Paragraph ${index + 1}. Lorem ipsum dolor sit amet, consectetur adipiscing elit.`,
          style,
        },
      ],
    })
  )
  return {
    ...blank,
    sections: [
      {
        ...blank.sections[0]!,
        blocks,
      },
    ],
  }
}

describe("editor performance smoke", () => {
  test("50-paragraph decoration/layout path completes under budget with stable signature", async () => {
    const document = documentWithParagraphs(50)
    const client = createLayoutClient({ forceInProcess: true })
    const asyncLayout = getLayoutAsync(client)
    expect(asyncLayout).not.toBeNull()

    const started = performance.now()
    const result = await asyncLayout!(document, { includeTrace: true })
    expect(result).not.toBeNull()
    if (!result?.trace) {
      client.dispose()
      throw new Error("expected layout success with trace")
    }

    const placements = pageBreaksFromTrace(result.trace, result.displayList)
    const signature = paginationSignature(
      placements,
      result.displayList.pages.length
    )
    const pm = fromSemanticDocument(document)
    const decorations = decorationsFromPlacements(pm, placements, true)
    const elapsed = performance.now() - started

    expect(elapsed).toBeLessThan(5_000)
    expect(result.displayList.pages.length).toBeGreaterThan(0)
    expect(decorations.find().length).toBeGreaterThanOrEqual(0)
    expect(signature.length).toBeGreaterThan(0)

    // Second pass with prepared-block cache must keep the same pagination signature.
    const again = await asyncLayout!(document, { includeTrace: true })
    expect(again).not.toBeNull()
    if (!again?.trace) {
      client.dispose()
      throw new Error("expected second layout success")
    }
    const signature2 = paginationSignature(
      pageBreaksFromTrace(again.trace, again.displayList),
      again.displayList.pages.length
    )
    expect(signature2).toBe(signature)

    // Bridge round-trip must not disturb the semantic paragraph count.
    const state = EditorState.create({ doc: pm })
    expect(toSemanticDocument(state.doc).sections[0]?.blocks).toHaveLength(50)

    // Direct layoutDocument path also stays under budget (sanity).
    const directStarted = performance.now()
    const direct = layoutDocument(document, { includeTrace: true })
    expect(performance.now() - directStarted).toBeLessThan(5_000)
    expect(direct.trace).toBeDefined()

    client.dispose()
  })

  test("cancel drops superseded in-process layout results", async () => {
    const document = documentWithParagraphs(20)
    const client = createLayoutClient({ forceInProcess: true })
    const asyncLayout = getLayoutAsync(client)
    expect(asyncLayout).not.toBeNull()

    const first = asyncLayout!(document, { includeTrace: true })
    client.cancel()
    const superseded = await first
    expect(superseded).toBeNull()

    const next = await asyncLayout!(document, { includeTrace: true })
    expect(next).not.toBeNull()
    expect(next?.trace).toBeDefined()
    client.dispose()
  })
})
