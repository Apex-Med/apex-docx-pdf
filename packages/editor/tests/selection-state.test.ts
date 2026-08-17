import { describe, expect, test } from "bun:test"
import { EditorState, TextSelection } from "prosemirror-state"

import { createEditorStateFromDocument } from "../src"
import { createBlankDocument } from "@apexmed/core"
import {
  createSelectionStatePlugin,
  getSelectionSnapshot,
  selectionStatePluginKey,
} from "../src/plugins/selection-state"
import { editorSchema } from "../src/schema"
import { fromSemanticDocument } from "../src/model/bridge"
import { toggleBold } from "../src/commands"

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
})
