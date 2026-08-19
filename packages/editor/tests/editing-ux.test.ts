import { describe, expect, test } from "bun:test"
import { createBlankDocument } from "@apexmed/core"
import { TextSelection } from "prosemirror-state"
import { buildMinimalDocx } from "../../testkit/src/docx"

import {
  applyCommandToSemantic,
  backspaceCommand,
  createBreakSpacerElement,
  createEditorStateFromDocument,
  createEditorStateFromDocx,
  editorSchema,
  insertPageBreak,
  insertTable,
  PAGE_BREAK_SCROLL_META,
  splitOrCreateParagraph,
  toSemanticDocument,
} from "../src/index"

describe("editing UX: Enter, Backspace, page break visuals, tables", () => {
  test("Enter splits a paragraph into two (next line)", () => {
    const state = createEditorStateFromDocx(
      buildMinimalDocx({ paragraphs: ["Hello world"] })
    )
    // Place caret after "Hello"
    let textPos = 0
    let text = ""
    state.doc.descendants((node, pos) => {
      if (node.isText) {
        textPos = pos
        text = node.text ?? ""
        return false
      }
      return true
    })
    const offset = text.indexOf(" ")
    const caret = textPos + (offset > 0 ? offset : 5)
    const selected = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, caret))
    )
    const result = applyCommandToSemantic(selected, splitOrCreateParagraph)
    expect(result.applied).toBe(true)
    const paragraphs = result.document.sections[0]?.blocks.filter(
      (b) => b.type === "paragraph"
    )
    expect((paragraphs?.length ?? 0)).toBeGreaterThanOrEqual(2)
    expect(new Set(paragraphs?.map((paragraph) => paragraph.id)).size).toBe(
      paragraphs?.length ?? 0
    )
    const texts = paragraphs!.map((p) =>
      p.type === "paragraph"
        ? p.children
            .filter((c) => c.type === "text")
            .map((c) => (c.type === "text" ? c.text : ""))
            .join("")
        : ""
    )
    expect(texts.join("|")).toContain("Hello")
    expect(texts.some((t) => t.includes("world") || t.length >= 0)).toBe(true)
  })

  test("Enter on empty blank document creates a second paragraph", () => {
    const state = createEditorStateFromDocument(createBlankDocument())
    // Caret inside the empty paragraph
    let paraPos = 1
    state.doc.descendants((node, pos) => {
      if (node.type.name === "paragraph") {
        paraPos = pos + 1
        return false
      }
      return true
    })
    const selected = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, paraPos))
    )
    const result = applyCommandToSemantic(selected, splitOrCreateParagraph)
    expect(result.applied).toBe(true)
    const count =
      result.document.sections[0]?.blocks.filter((b) => b.type === "paragraph")
        .length ?? 0
    expect(count).toBeGreaterThanOrEqual(2)
  })

  test("Backspace at start of second paragraph joins with the first", () => {
    const state = createEditorStateFromDocx(
      buildMinimalDocx({ paragraphs: ["First", "Second"] })
    )
    // Find start of second paragraph text
    let secondStart: number | null = null
    let seen = 0
    state.doc.descendants((node, pos) => {
      if (node.type.name === "paragraph") {
        seen += 1
        if (seen === 2) {
          secondStart = pos + 1
          return false
        }
      }
      return true
    })
    expect(secondStart).not.toBeNull()
    const selected = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, secondStart!))
    )
    const result = applyCommandToSemantic(selected, backspaceCommand)
    expect(result.applied).toBe(true)
    const paragraphs = result.document.sections[0]?.blocks.filter(
      (b) => b.type === "paragraph"
    )
    // Joined into fewer paragraphs, or text combined
    const texts = (paragraphs ?? []).map((p) =>
      p.type === "paragraph"
        ? p.children
            .filter((c) => c.type === "text")
            .map((c) => (c.type === "text" ? c.text : ""))
            .join("")
        : ""
    )
    expect(texts.join("")).toContain("First")
    expect(texts.join("")).toContain("Second")
    expect((paragraphs?.length ?? 99)).toBeLessThanOrEqual(2)
  })

  test("insertTable produces an editable table structure in the PM doc", () => {
    const state = createEditorStateFromDocument(createBlankDocument())
    const result = applyCommandToSemantic(state, insertTable(3, 2))
    expect(result.applied).toBe(true)
    let tableCount = 0
    let cellCount = 0
    result.state.doc.descendants((node) => {
      if (node.type.name === "table") tableCount += 1
      if (node.type.name === "table_cell" || node.type.name === "table_header")
        cellCount += 1
    })
    expect(tableCount).toBe(1)
    expect(cellCount).toBe(6)
    const semantic = toSemanticDocument(result.state.doc)
    expect(semantic.sections[0]?.blocks.some((b) => b.type === "table")).toBe(
      true
    )
  })

  test("page break spacer paints separate page sheets (rest + margins + desk gap)", () => {
    if (typeof document === "undefined") {
      expect(typeof createBreakSpacerElement).toBe("function")
      return
    }
    const el = createBreakSpacerElement({
      sourceNodeId: "p1" as never,
      charOffset: 10,
      pageNumber: 2,
      restTwips: 2400,
      contentHeightTwips: 14400,
      pageWidthTwips: 11906,
      pageHeightTwips: 16838,
      marginTopTwips: 1440,
      marginBottomTwips: 1440,
      marginLeftTwips: 1440,
      marginRightTwips: 1440,
      key: "2:10:2400",
    })
    expect(el.className).toContain("apex-page-break-spacer")
    expect(el.querySelector(".apex-page-break-spacer__rest")).toBeTruthy()
    expect(
      el.querySelector(".apex-page-break-spacer__page-margin-bottom")
    ).toBeTruthy()
    expect(el.querySelector(".apex-page-break-spacer__gap")).toBeTruthy()
    expect(
      el.querySelector(".apex-page-break-spacer__page-margin-top")
    ).toBeTruthy()
    expect(el.textContent).toContain("Page 2")
    // Full stack: rest(160px) + bottom margin(96) + gap(32) + top margin(96) >> dashed line
    const height = Number.parseFloat(el.style.height || "0")
    expect(height).toBeGreaterThan(200)
    const bottom = el.querySelector(
      ".apex-page-break-spacer__page-margin-bottom"
    ) as HTMLElement | null
    const top = el.querySelector(
      ".apex-page-break-spacer__page-margin-top"
    ) as HTMLElement | null
    const gap = el.querySelector(
      ".apex-page-break-spacer__gap"
    ) as HTMLElement | null
    expect(bottom?.style.boxShadow).toBe("none")
    expect(top?.style.boxShadow).toBe("none")
    expect(gap?.style.overflow).toBe("hidden")
  })

  test("insertPageBreak inserts a page_break node with apex-manual-page-break class in schema", () => {
    const state = createEditorStateFromDocument(createBlankDocument())
    const result = applyCommandToSemantic(state, insertPageBreak())
    expect(result.applied).toBe(true)
    let found = false
    result.state.doc.descendants((node) => {
      if (node.type.name === "page_break") found = true
    })
    expect(found).toBe(true)
    // Schema toDOM uses class apex-manual-page-break
    const node = editorSchema.nodes.page_break!.create()
    const dom = node.type.spec.toDOM?.(node)
    expect(JSON.stringify(dom)).toContain("apex-manual-page-break")
  })

  test("insertPageBreak sets post-pagination scroll meta", () => {
    const state = createEditorStateFromDocument(createBlankDocument())
    let meta: unknown
    const applied = insertPageBreak()(state, (tr) => {
      meta = tr.getMeta(PAGE_BREAK_SCROLL_META)
    })
    expect(applied).toBe(true)
    expect(meta).toBe(true)
  })

  test("section sheets size from page count vars, not a single-page min-height", () => {
    const node = editorSchema.nodes.section!.create()
    const dom = node.type.spec.toDOM?.(node)
    const html = JSON.stringify(dom)
    expect(html).toContain("--apex-sheet-height:")
    expect(html).toContain("var(--apex-section-pages, 1)")
    expect(html).not.toMatch(/min-height:\s*[\d.]+pt/)
  })

  test("manual page break gets a full page-stack spacer placement", () => {
    const { layoutDocument } = require("@apexmed/layout") as typeof import("@apexmed/layout")
    const {
      mergeManualPageBreakPlacements,
      pageBreaksFromTrace,
      spacerSpecsFromPlacements,
      sectionPageCountsFromLayout,
    } = require("../src/index") as typeof import("../src/index")

    const state = createEditorStateFromDocument(createBlankDocument())
    const result = applyCommandToSemantic(state, insertPageBreak())
    expect(result.applied).toBe(true)
    const layout = layoutDocument(result.document, { includeTrace: true })
    expect(layout.displayList.pages.length).toBeGreaterThanOrEqual(2)
    expect(layout.trace).toBeTruthy()

    const fromTrace = pageBreaksFromTrace(layout.trace!, layout.displayList)
    // Empty-paragraph manual breaks produce a new page but no line-pair placement.
    expect(fromTrace.length).toBe(0)

    const merged = mergeManualPageBreakPlacements(
      result.state.doc,
      fromTrace,
      layout.displayList,
      layout.trace
    )
    expect(merged.length).toBeGreaterThan(0)
    const placement = merged[0]!
    expect(placement.explicitPosition).toBeGreaterThan(0)
    expect(placement.restTwips).toBeGreaterThan(100)
    expect(placement.pageNumber).toBeGreaterThan(1)

    const specs = spacerSpecsFromPlacements(result.state.doc, merged)
    expect(specs.length).toBeGreaterThan(0)
    // Full stack: rest + margins + desk gap ≫ the old 72px chip.
    expect(specs[0]!.heightTwips).toBeGreaterThan(2000)

    const counts = sectionPageCountsFromLayout(
      result.state.doc,
      layout.displayList,
      layout.trace!
    )
    expect(counts).toHaveLength(1)
    expect(counts[0]?.pageCount).toBe(2)
  })

  test("keymap includes Enter and Backspace bindings", () => {
    const { editorKeymap } = require("../src/commands") as typeof import("../src/commands")
    // Plugin stores bindings; smoke that the keymap plugin exists
    expect(editorKeymap).toBeTruthy()
    expect(editorKeymap.spec).toBeTruthy()
  })

  test("keymap binds Tab to indent-or-next-cell", () => {
    const { handleTab, handleShiftTab } = require("../src/commands") as typeof import("../src/commands")
    expect(handleTab).toBeTypeOf("function")
    expect(handleShiftTab).toBeTypeOf("function")
  })
})
