import { describe, expect, test } from "bun:test"
import { createBlankDocument } from "@apexmed/core"
import { TextSelection } from "prosemirror-state"
import { buildMinimalDocx } from "../../testkit/src/docx"

// Fresh consumer import of the shipped package entry (not deep package-internal paths).
import {
  applyCommandToSemantic,
  createEditorStateFromDocument,
  createEditorStateFromDocx,
  insertPageBreak,
  toggleBold,
  toSemanticDocument,
} from "../src/index"

describe("editor package consumer entry", () => {
  test("blank document and DOCX load return usable editor state (run 1)", () => {
    const blankState = createEditorStateFromDocument(createBlankDocument())
    expect(blankState.doc.childCount).toBeGreaterThan(0)
    const blankSemantic = toSemanticDocument(blankState.doc)
    expect(blankSemantic.sections.length).toBeGreaterThan(0)
    expect(blankSemantic.sections[0]?.blocks.length).toBeGreaterThan(0)

    const bytes = buildMinimalDocx({
      paragraphs: ["Consumer hello", "Second line"],
    })
    const docxState = createEditorStateFromDocx(bytes)
    expect(docxState.doc.textContent).toContain("Consumer hello")
    const docxSemantic = toSemanticDocument(docxState.doc)
    const texts = docxSemantic.sections.flatMap((s) =>
      s.blocks
        .filter((b) => b.type === "paragraph")
        .flatMap((b) =>
          b.type === "paragraph"
            ? b.children
                .filter((c) => c.type === "text")
                .map((c) => (c.type === "text" ? c.text : ""))
            : []
        )
    )
    expect(texts.join(" ")).toContain("Consumer hello")
  })

  test("blank document and DOCX load return usable editor state (run 2)", () => {
    const blankState = createEditorStateFromDocument()
    expect(blankState.doc.childCount).toBeGreaterThan(0)
    const bytes = buildMinimalDocx({ paragraphs: ["Run two"] })
    const docxState = createEditorStateFromDocx(bytes)
    expect(docxState.doc.textContent).toContain("Run two")
  })

  test("bold command changes the bridged semantic model", () => {
    const bytes = buildMinimalDocx({ paragraphs: ["Make me bold"] })
    const state = createEditorStateFromDocx(bytes)
    // Select the text node range inside the first paragraph.
    let from = 0
    let to = 0
    state.doc.descendants((node, pos) => {
      if (node.isText && node.text?.includes("Make me bold")) {
        from = pos
        to = pos + node.nodeSize
        return false
      }
      return true
    })
    expect(to).toBeGreaterThan(from)
    const selection = TextSelection.create(state.doc, from, to)
    const selected = state.apply(state.tr.setSelection(selection))
    const result = applyCommandToSemantic(selected, toggleBold())
    expect(result.applied).toBe(true)
    const texts = result.document.sections.flatMap((s) =>
      s.blocks.flatMap((b) =>
        b.type === "paragraph"
          ? b.children.filter((c) => c.type === "text")
          : []
      )
    )
    const bold = texts.find(
      (t) => t.type === "text" && t.text.includes("Make me bold")
    )
    expect(bold?.type).toBe("text")
    if (bold?.type !== "text") return
    expect(bold.style.fontWeight).toBe(700)
  })

  test("page break command inserts a break into the semantic model", () => {
    const state = createEditorStateFromDocument(createBlankDocument())
    const result = applyCommandToSemantic(state, insertPageBreak())
    expect(result.applied).toBe(true)
    const hasBreak = result.document.sections.some((s) =>
      s.blocks.some(
        (b) =>
          b.type === "paragraph" &&
          b.children.some((c) => c.type === "break" && c.kind === "page")
      )
    )
    expect(hasBreak).toBe(true)
  })
})
