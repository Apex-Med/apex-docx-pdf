import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createBlankDocument, twips } from "@apexmed/core"
import { serializeDocx, normaliseDocxBytes } from "@apexmed/docx"
import { TextSelection } from "prosemirror-state"
import { buildMinimalDocx } from "../../testkit/src/docx"

import {
  applyCommandToSemantic,
  createEditorStateFromDocument,
  createEditorStateFromDocx,
  insertImageFromBytes,
  insertTable,
  matchStyleToSelection,
  setParagraphSpacing,
  setSectionPageSetup,
  setSectionColumns,
  insertColumnBreak,
  toggleBold,
  applyParagraphStyle,
} from "../src/index"

// Minimal valid 1x1 PNG
const PNG_1X1 = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
  ),
  (c) => c.charCodeAt(0)
)

describe("Phase-1 commands end-to-end", () => {
  test("insertImageFromBytes registers asset so serializeDocx writes media", () => {
    const state = createEditorStateFromDocument(createBlankDocument())
    const { command, asset } = insertImageFromBytes({
      bytes: PNG_1X1,
      mimeType: "image/png",
      pixelWidth: 1,
      pixelHeight: 1,
    })
    expect(asset.bytes.length).toBeGreaterThan(0)
    expect(asset.mimeType).toBe("image/png")

    const result = applyCommandToSemantic(state, command, {
      assets: [asset],
    })
    expect(result.applied).toBe(true)
    const hasImage = result.document.sections.some((s) =>
      s.blocks.some(
        (b) =>
          b.type === "paragraph" &&
          b.children.some((c) => c.type === "image" && c.assetId === asset.id)
      )
    )
    expect(hasImage).toBe(true)

    // Assets must be available for serialize — bridge context carries them.
    const withAssets = {
      ...result.document,
      assets: [asset],
    }
    const bytes = serializeDocx(withAssets)
    const roundTrip = normaliseDocxBytes(bytes)
    expect(roundTrip.ok).toBe(true)
    if (!roundTrip.ok) return
    expect(roundTrip.value.assets.some((a) => a.mimeType === "image/png")).toBe(
      true
    )
  })

  test("insertTable adds a table block to the semantic model", () => {
    const state = createEditorStateFromDocument(createBlankDocument())
    const result = applyCommandToSemantic(state, insertTable(2, 3))
    expect(result.applied).toBe(true)
    const table = result.document.sections[0]?.blocks.find(
      (b) => b.type === "table"
    )
    expect(table?.type).toBe("table")
    if (table?.type !== "table") return
    expect(table.rows).toHaveLength(2)
    expect(table.rows[0]?.cells).toHaveLength(3)
  })

  test("matchStyleToSelection applies sampled run formatting across the paragraph", () => {
    const bytes = buildMinimalDocx({
      paragraphs: ["Hello world text"],
    })
    let state = createEditorStateFromDocx(bytes)
    // Locate the text node and bold only the first word.
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
    expect(text.length).toBeGreaterThan(5)
    const wordEnd = text.indexOf(" ")
    const from = textPos
    const to = textPos + (wordEnd > 0 ? wordEnd : 5)
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, from, to))
    )
    const bolded = applyCommandToSemantic(state, toggleBold())
    expect(bolded.applied).toBe(true)
    state = bolded.state

    // Sample the bold portion and match across the whole paragraph.
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, from, to))
    )
    const matched = applyCommandToSemantic(state, matchStyleToSelection())
    expect(matched.applied).toBe(true)
    const paragraph = matched.document.sections[0]?.blocks[0]
    expect(paragraph?.type).toBe("paragraph")
    if (paragraph?.type !== "paragraph") return
    const weights = paragraph.children
      .filter((c) => c.type === "text")
      .map((c) => (c.type === "text" ? c.style.fontWeight : 0))
    expect(weights.length).toBeGreaterThan(0)
    expect(weights.every((w) => w >= 700)).toBe(true)
  })

  test("paragraph spacing and page setup commands mutate semantic model", () => {
    const state = createEditorStateFromDocument(createBlankDocument())
    const spaced = applyCommandToSemantic(
      state,
      setParagraphSpacing({ spacingBefore: 200, spacingAfter: 400 })
    )
    expect(spaced.applied).toBe(true)
    const p = spaced.document.sections[0]?.blocks[0]
    expect(p?.type).toBe("paragraph")
    if (p?.type !== "paragraph") return
    expect(p.properties.spacingBefore).toBe(twips(200))
    expect(p.properties.spacingAfter).toBe(twips(400))

    const setup = applyCommandToSemantic(
      spaced.state,
      setSectionPageSetup({
        pageWidth: 12240,
        pageHeight: 15840,
        marginTop: 720,
      })
    )
    expect(setup.applied).toBe(true)
    const section = setup.document.sections[0]
    expect(section?.properties.pageWidth).toBe(twips(12240))
    expect(section?.properties.pageHeight).toBe(twips(15840))
    expect(section?.properties.margins.top).toBe(twips(720))
  })

  test("setSectionColumns and insertColumnBreak round-trip through the bridge", () => {
    const state = createEditorStateFromDocument(createBlankDocument())
    const columns = applyCommandToSemantic(state, setSectionColumns(2, {
      separator: true,
      space: twips(720),
    }))
    expect(columns.applied).toBe(true)
    expect(columns.document.sections[0]?.properties.columns).toEqual({
      count: 2,
      equalWidth: true,
      space: twips(720),
      separator: true,
      widths: null,
    })

    const withBreak = applyCommandToSemantic(
      createEditorStateFromDocument(columns.document),
      insertColumnBreak()
    )
    expect(withBreak.applied).toBe(true)
    const paragraph = withBreak.document.sections[0]?.blocks[0]
    expect(paragraph?.type).toBe("paragraph")
    if (paragraph?.type !== "paragraph") return
    expect(
      paragraph.children.some(
        (child) => child.type === "break" && child.kind === "column"
      )
    ).toBe(true)
  })

  test("applyParagraphStyle sets styleId on the paragraph", () => {
    const state = createEditorStateFromDocument(createBlankDocument())
    const result = applyCommandToSemantic(
      state,
      applyParagraphStyle("Heading1")
    )
    expect(result.applied).toBe(true)
    const p = result.document.sections[0]?.blocks[0]
    expect(p?.type).toBe("paragraph")
    if (p?.type !== "paragraph") return
    expect(p.styleId).toBe("Heading1")
  })

  test("Ribbon and Editor use @workspace/ui primitives", () => {
    const ribbon = readFileSync(
      join(import.meta.dir, "../src/ui/Ribbon.tsx"),
      "utf8"
    )
    expect(ribbon).toContain("@workspace/ui/components/button")
    expect(ribbon).toContain("@workspace/ui/components/select")
    expect(ribbon).toContain("@workspace/ui/components/popover")
    expect(ribbon).toContain("onInsertTable")
    expect(ribbon).toContain("onInsertImage")
    expect(ribbon).toContain("onPageSetup")
    expect(ribbon).toContain("onMatchStyle")
    expect(ribbon).toContain("onParagraphSpacing")
    expect(ribbon).toContain("Style")
  })
})
