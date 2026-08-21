import { describe, expect, test } from "bun:test"
import { createBlankDocument } from "@apexmed/core"
import { TextSelection } from "prosemirror-state"
import type { EditorView } from "prosemirror-view"
import { isInTable } from "prosemirror-tables"

import {
  applyCommandToSemantic,
  createEditorStateFromDocument,
  insertTable,
  selectionIsInTable,
  tableContextMenuItems,
} from "../src/index"
import {
  createTableContextMenuPlugin,
  tableContextMenuPluginKey,
} from "../src/plugins/table-context-menu"
import { createEditorPlugins } from "../src/plugins/create-plugins"
import { readFileSync } from "node:fs"
import { join } from "node:path"

describe("table context menu", () => {
  test("exposes add/delete row and column actions", () => {
    const items = tableContextMenuItems()
    const ids = items.map((item) => item.id)
    expect(ids).toContain("row-before")
    expect(ids).toContain("select-column")
    expect(ids).toContain("select-table")
    expect(ids).toContain("row-after")
    expect(ids).toContain("col-before")
    expect(ids).toContain("col-after")
    expect(ids).toContain("row-up")
    expect(ids).toContain("row-down")
    expect(ids).toContain("col-left")
    expect(ids).toContain("col-right")
    expect(ids).toContain("delete-row")
    expect(ids).toContain("delete-col")
    expect(ids).toContain("delete-table")
  })

  test("is wired into the default editor plugin stack", () => {
    const source = readFileSync(
      join(import.meta.dir, "../src/plugins/create-plugins.ts"),
      "utf8"
    )
    expect(source).toContain("createTableContextMenuPlugin")
    const plugins = createEditorPlugins({ enablePagination: false })
    expect(
      plugins.some((plugin) => plugin.spec.key === tableContextMenuPluginKey)
    ).toBe(true)
  })

  test("selectionIsInTable is true after inserting a table and placing caret in a cell", () => {
    let state = createEditorStateFromDocument(createBlankDocument())
    state = applyCommandToSemantic(state, insertTable(2, 2)).state
    // Place selection inside first cell paragraph
    let cellPos: number | null = null
    state.doc.descendants((node, pos) => {
      if (cellPos !== null) return false
      if (
        node.type.name === "table_cell" ||
        node.type.name === "table_header"
      ) {
        cellPos = pos + 1
        return false
      }
      return true
    })
    expect(cellPos).not.toBeNull()
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, cellPos! + 1))
    )
    expect(isInTable(state)).toBe(true)
    expect(selectionIsInTable(state)).toBe(true)
  })

  test("row/column commands from menu items mutate the table", () => {
    let state = createEditorStateFromDocument(createBlankDocument())
    state = applyCommandToSemantic(state, insertTable(2, 2)).state
    let cellPos: number | null = null
    state.doc.descendants((node, pos) => {
      if (cellPos !== null) return false
      if (node.type.name === "table_cell") {
        cellPos = pos + 1
        return false
      }
      return true
    })
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, cellPos! + 1))
    )

    const items = tableContextMenuItems()
    const addRow = items.find((item) => item.id === "row-after")!
    const beforeRows = countNodes(state.doc, "table_row")
    const afterAdd = applyCommandToSemantic(state, (s, d) => addRow.run(s, d!))
    expect(afterAdd.applied).toBe(true)
    expect(countNodes(afterAdd.state.doc, "table_row")).toBe(beforeRows + 1)

    const addCol = items.find((item) => item.id === "col-after")!
    const beforeCells = countNodes(afterAdd.state.doc, "table_cell")
    // re-place selection in a cell of the updated doc
    let nextCell: number | null = null
    afterAdd.state.doc.descendants((node, pos) => {
      if (nextCell !== null) return false
      if (node.type.name === "table_cell") {
        nextCell = pos + 1
        return false
      }
      return true
    })
    const withSel = afterAdd.state.apply(
      afterAdd.state.tr.setSelection(
        TextSelection.create(afterAdd.state.doc, nextCell! + 1)
      )
    )
    const afterCol = applyCommandToSemantic(withSel, (s, d) =>
      addCol.run(s, d!)
    )
    expect(afterCol.applied).toBe(true)
    expect(countNodes(afterCol.state.doc, "table_cell")).toBeGreaterThan(
      beforeCells
    )
  })

  test("plugin handles contextmenu only inside tables", () => {
    const plugin = createTableContextMenuPlugin()
    const handler = plugin.props?.handleDOMEvents?.contextmenu
    expect(typeof handler).toBe("function")

    // Outside table: should not claim the event
    const blank = createEditorStateFromDocument(createBlankDocument())
    const fakeView = {
      state: blank,
      dom: { contains: () => true },
      focus: () => undefined,
      dispatch: () => undefined,
    } as unknown as EditorView
    const event = {
      preventDefault: () => undefined,
      clientX: 10,
      clientY: 10,
      target: {},
    } as unknown as PointerEvent
    expect(handler!.call(plugin, fakeView, event)).toBe(false)
  })
})

function countNodes(
  doc: {
    descendants: (
      f: (node: { type: { name: string } }, pos: number) => boolean | void
    ) => void
  },
  type: string
): number {
  let count = 0
  doc.descendants((node) => {
    if (node.type.name === type) count += 1
  })
  return count
}
