import { describe, expect, test } from "bun:test"
import { createBlankDocument, twips } from "@apexmed/core"
import { TextSelection } from "prosemirror-state"

import {
  applyCommandToSemantic,
  createEditorStateFromDocument,
  insertTable,
  selectedTableSizing,
  selectedTableCellPositions,
  selectEnclosingTable,
  selectCurrentTableColumn,
  setSelectedColumnSizing,
  setTableWidthMode,
  tableCommands,
} from "../src"
import {
  defaultTableSizing,
  importedFixedTableSizing,
  normalizeTableSizing,
  tableSizingConstraintMessage,
  withTableWidthMode,
} from "../src/schema/table-sizing"

function placeCaretInFirstCell(
  state: ReturnType<typeof createEditorStateFromDocument>
) {
  let position: number | null = null
  state.doc.descendants((node, pos) => {
    if (position !== null) return false
    if (node.type.name === "table_cell") {
      position = pos + 2
      return false
    }
    return true
  })
  if (position === null) throw new Error("Expected a table cell")
  return state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, position))
  )
}

describe("responsive table sizing", () => {
  test("new tables default to Fill for every column, with multiline enabled", () => {
    const sizing = defaultTableSizing([twips(1800), twips(2400)])
    expect(sizing.mode).toBe("fill")
    expect(sizing.columns.map((column) => column.mode)).toEqual([
      "fill",
      "fill",
    ])
    expect(sizing.columns.every((column) => column.allowMultiline)).toBe(true)
  })

  test("one-column defaults retain the required Fill column", () => {
    expect(defaultTableSizing([twips(2400)]).columns[0]?.mode).toBe("fill")
  })

  test("imported fixed sizing preserves every authored width", () => {
    const sizing = importedFixedTableSizing([twips(1234), twips(5678)])
    expect(sizing.mode).toBe("fixed")
    expect(sizing.columns.map((column) => column.mode)).toEqual([
      "fixed",
      "fixed",
    ])
    expect(sizing.columns.map((column) => column.width)).toEqual([
      twips(1234),
      twips(5678),
    ])
    expect(normalizeTableSizing(null, [twips(1234), twips(5678)])).toBeNull()
  })

  test("semantic tables without Apex sizing are exposed as imported fixed grids", () => {
    const initial = applyCommandToSemantic(
      createEditorStateFromDocument(createBlankDocument()),
      insertTable(1, 2, 2000)
    ).document
    const legacy = {
      ...initial,
      sections: initial.sections.map((section) => ({
        ...section,
        blocks: section.blocks.map((block) =>
          block.type === "table"
            ? {
                ...block,
                sizing: undefined,
                columnWidths: [twips(1234), twips(5678)],
                width: twips(6912),
                rows: block.rows.map((row) => ({
                  ...row,
                  cells: row.cells.map((cell, index) => ({
                    ...cell,
                    width: [twips(1234), twips(5678)][index] ?? twips(1),
                  })),
                })),
              }
            : block
        ),
      })),
    }
    const state = placeCaretInFirstCell(createEditorStateFromDocument(legacy))
    const selected = selectedTableSizing(state)
    expect(selected?.importedFixed).toBe(true)
    expect(selected?.sizing.columns.map((column) => column.width)).toEqual([
      twips(1234),
      twips(5678),
    ])
  })

  test("Hug table transitions remove Fill columns atomically", () => {
    const initial = defaultTableSizing([twips(1800), twips(2400)])
    const hug = withTableWidthMode(initial, "hug")
    expect(hug.mode).toBe("hug")
    expect(hug.columns.map((column) => column.mode)).toEqual(["hug", "hug"])
    expect(tableSizingConstraintMessage(hug)).toBeNull()
  })

  test("fixed and fill tables reject removal of their last Fill column", () => {
    const initial = defaultTableSizing([twips(1800), twips(2400)])
    const invalid = {
      ...initial,
      columns: initial.columns.map((column) => ({
        ...column,
        mode: "hug" as const,
      })),
    }
    expect(tableSizingConstraintMessage(invalid)).toContain("at least one Fill")
  })

  test("column constraints require multiline and order min before max", () => {
    const initial = defaultTableSizing([twips(1800), twips(2400)])
    const first = initial.columns[0]
    const second = initial.columns[1]
    expect(first).toBeDefined()
    expect(second).toBeDefined()
    if (!first || !second) return
    const invalid = {
      ...initial,
      columns: [
        first,
        {
          ...second,
          minWidth: twips(2000),
          maxWidth: twips(1000),
        },
      ],
    }
    expect(tableSizingConstraintMessage(invalid)).toContain("minimum width")
  })

  test("commands materialize responsive policy into table and cell attributes", () => {
    let state = createEditorStateFromDocument(createBlankDocument())
    state = applyCommandToSemantic(state, insertTable(2, 2, 3000)).state
    state = placeCaretInFirstCell(state)

    const selected = selectedTableSizing(state)
    expect(selected?.importedFixed).toBe(false)
    expect(selected?.selectedColumns).toEqual([0])

    const fixed = applyCommandToSemantic(
      state,
      setSelectedColumnSizing({ mode: "fixed", width: twips(1600) })
    )
    expect(fixed.applied).toBe(true)
    const table = fixed.document.sections[0]?.blocks.find(
      (block) => block.type === "table"
    )
    expect(table?.type).toBe("table")
    if (table?.type !== "table") return
    expect(table.sizing?.columns[0]).toMatchObject({
      mode: "fixed",
      width: twips(1600),
    })

    const hugged = applyCommandToSemantic(fixed.state, setTableWidthMode("hug"))
    expect(hugged.applied).toBe(true)
    const huggedTable = hugged.document.sections[0]?.blocks.find(
      (block) => block.type === "table"
    )
    expect(huggedTable?.type).toBe("table")
    if (huggedTable?.type !== "table") return
    expect(huggedTable.sizing?.mode).toBe("hug")
    expect(
      huggedTable.sizing?.columns.some((column) => column.mode === "fill")
    ).toBe(false)
  })

  test("adding and deleting columns keeps sizing policy aligned to the grid", () => {
    let state = createEditorStateFromDocument(createBlankDocument())
    state = applyCommandToSemantic(state, insertTable(1, 2, 2400)).state
    state = placeCaretInFirstCell(state)
    const added = applyCommandToSemantic(state, tableCommands.addColumnAfter)
    expect(added.applied).toBe(true)
    const addedTable = added.document.sections[0]?.blocks.find(
      (block) => block.type === "table"
    )
    expect(addedTable?.type).toBe("table")
    if (addedTable?.type !== "table") return
    expect(addedTable.columnWidths).toHaveLength(3)
    expect(addedTable.sizing?.columns).toHaveLength(3)
    expect(addedTable.sizing?.columns.map((column) => column.mode)).toEqual([
      "fill",
      "fill",
      "fill",
    ])

    const deleted = applyCommandToSemantic(
      added.state,
      tableCommands.deleteColumn
    )
    expect(deleted.applied).toBe(true)
    const deletedTable = deleted.document.sections[0]?.blocks.find(
      (block) => block.type === "table"
    )
    expect(deletedTable?.type).toBe("table")
    if (deletedTable?.type !== "table") return
    expect(deletedTable.columnWidths).toHaveLength(2)
    expect(deletedTable.sizing?.columns).toHaveLength(2)
    expect(
      deletedTable.sizing?.columns.some((column) => column.mode === "fill")
    ).toBe(true)
  })

  test("whole-table selection covers every cell", () => {
    let state = createEditorStateFromDocument(createBlankDocument())
    state = applyCommandToSemantic(state, insertTable(2, 2)).state
    state = placeCaretInFirstCell(state)
    const column = applyCommandToSemantic(state, selectCurrentTableColumn())
    expect(column.applied).toBe(true)
    expect(selectedTableCellPositions(column.state)).toHaveLength(2)
    const selected = applyCommandToSemantic(
      column.state,
      selectEnclosingTable()
    )
    expect(selected.applied).toBe(true)
    expect(selectedTableCellPositions(selected.state)).toHaveLength(4)
    expect(selectedTableSizing(selected.state)?.selectionKind).toBe("table")
  })
})
