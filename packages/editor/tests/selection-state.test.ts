import { describe, expect, test } from "bun:test"
import { EditorState, TextSelection } from "prosemirror-state"
import { createBlankDocument, twips, type StyleDefinition } from "@apexmed/core"

import {
  applyCommandToSemantic,
  applyDefinedParagraphStyle,
  createEditorStateFromDocument,
  createEditorStateFromDocx,
} from "../src"
import {
  createSelectionStatePlugin,
  getSelectionSnapshot,
  selectionStatePluginKey,
} from "../src/plugins/selection-state"
import { editorSchema } from "../src/schema"
import { fromSemanticDocument } from "../src/model/bridge"
import { toggleBold } from "../src/commands"
import { buildMinimalDocx } from "../../testkit/src/docx"

describe("selection-state plugin", () => {
  test("exposes default formatting snapshot", () => {
    const state = createEditorStateFromDocument(createBlankDocument())
    const snap = getSelectionSnapshot(state)
    expect(snap).not.toBeNull()
    expect(snap?.bold).toBe(false)
    expect(snap?.textStyle.fontFamily).toBe("Inter")
    expect(snap?.paragraph?.alignment).toBe("left")
    expect(snap?.section?.pageWidth).toBeGreaterThan(0)
    expect(snap?.table.inTable).toBe(false)
  })

  test("updates revision when formatting changes", () => {
    let state = EditorState.create({
      schema: editorSchema,
      doc: fromSemanticDocument(createBlankDocument()),
      plugins: [createSelectionStatePlugin()],
    })
    const before = selectionStatePluginKey.getState(state)!
    toggleBold()(state, (tr) => {
      state = state.apply(tr)
    })
    const after = selectionStatePluginKey.getState(state)!
    expect(after.revision).toBeGreaterThan(before.revision)
    expect(after.bold).toBe(true)
  })

  test("tracks selection empty flag", () => {
    let state = EditorState.create({
      schema: editorSchema,
      doc: fromSemanticDocument(createBlankDocument()),
      plugins: [createSelectionStatePlugin()],
    })
    expect(getSelectionSnapshot(state)?.empty).toBe(true)
    const end = state.doc.content.size - 2
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, 1, Math.max(1, end)))
    )
    // blank doc may still be empty selection range; just ensure plugin runs
    expect(getSelectionSnapshot(state)).not.toBeNull()
  })

  test("samples selected typography even when the range starts before marks", () => {
    const state = createEditorStateFromDocx(
      buildMinimalDocx({ paragraphs: ["Heading sample"] })
    )
    const definition: StyleDefinition = {
      id: "Heading1",
      name: "Heading 1",
      type: "paragraph",
      basedOn: "Normal",
      next: "Normal",
      paragraph: {
        spacingBefore: twips(320),
        spacingAfter: twips(120),
        lineSpacing: { rule: "auto", value240ths: 276 },
      },
      text: {
        fontFamily: "Inter",
        fontSize: twips(400),
        fontWeight: 700,
        color: "#111827",
        highlightColor: "#fef08a",
      },
    }
    const styled = applyCommandToSemantic(
      state,
      applyDefinedParagraphStyle(definition)
    )
    let paraStart = 0
    let textEnd = 0
    styled.state.doc.descendants((node, pos) => {
      if (node.type.name === "paragraph") paraStart = pos + 1
      if (node.isText) textEnd = pos + node.nodeSize
    })
    const selected = styled.state.apply(
      styled.state.tr.setSelection(
        TextSelection.create(styled.state.doc, paraStart, textEnd)
      )
    )
    const snap = getSelectionSnapshot(selected)
    expect(snap?.empty).toBe(false)
    expect(snap?.paragraph?.styleId).toBe("Heading1")
    expect(snap?.paragraph?.spacingBefore).toBe(320)
    expect(snap?.paragraph?.spacingAfter).toBe(120)
    expect(snap?.textStyle.fontFamily).toBe("Inter")
    expect(snap?.textStyle.fontSize).toBe(400)
    expect(snap?.textStyle.fontWeight).toBe(700)
    expect(snap?.textStyle.color).toBe("#111827")
    expect(snap?.textStyle.highlightColor).toBe("#fef08a")
    expect(snap?.bold).toBe(true)
  })

  test("empty caret at a paragraph start still reports the run typography", () => {
    const state = createEditorStateFromDocx(
      buildMinimalDocx({ paragraphs: ["Heading sample"] })
    )
    const definition: StyleDefinition = {
      id: "Heading1",
      name: "Heading 1",
      type: "paragraph",
      basedOn: "Normal",
      next: "Normal",
      paragraph: { spacingBefore: twips(320), spacingAfter: twips(120) },
      text: { fontSize: twips(400), fontWeight: 700 },
    }
    const styled = applyCommandToSemantic(
      state,
      applyDefinedParagraphStyle(definition)
    )
    let paraStart = 0
    styled.state.doc.descendants((node, pos) => {
      if (node.type.name !== "paragraph") return true
      paraStart = pos + 1
      return false
    })
    const atStart = styled.state.apply(
      styled.state.tr.setSelection(
        TextSelection.create(styled.state.doc, paraStart)
      )
    )
    const snap = getSelectionSnapshot(atStart)
    expect(snap?.empty).toBe(true)
    expect(snap?.paragraph?.styleId).toBe("Heading1")
    expect(snap?.textStyle.fontSize).toBe(400)
    expect(snap?.textStyle.fontWeight).toBe(700)
    expect(snap?.bold).toBe(true)
  })
})
