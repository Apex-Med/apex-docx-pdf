import { describe, expect, test } from "bun:test"
import { createBlankDocument } from "@apexmed/core"
import { TextSelection } from "prosemirror-state"
import { CellSelection } from "prosemirror-tables"

import {
  applyCommandToSemantic,
  createEditorStateFromDocument,
  findEnclosingTable,
  insertTable,
  moveCurrentTableColumn,
  moveCurrentTableRow,
  moveTableColumn,
  moveTableRow,
  selectCurrentTableRow,
  tableCommands,
  tableHasMergedSpans,
} from "../src"
import { tableContextMenuItems } from "../src/plugins/table-context-menu"

function placeCaretInCell(
  state: ReturnType<typeof createEditorStateFromDocument>,
  targetRow = 0,
  targetCol = 0
) {
  let row = 0
  let position: number | null = null
  state.doc.descendants((node, pos) => {
    if (position !== null) return false
    if (node.type.name !== "table_row") return true
    if (row !== targetRow) {
      row += 1
      return false
    }
    let col = 0
    node.forEach((cell, offset) => {
      if (position !== null) return
      if (
        cell.type.name !== "table_cell" &&
        cell.type.name !== "table_header"
      ) {
        return
      }
      if (col === targetCol) position = pos + 1 + offset + 2
      col += 1
    })
    return false
  })
  if (position === null) throw new Error("Expected a table cell")
  return state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, position))
  )
}

function fillTableCells(
  state: ReturnType<typeof createEditorStateFromDocument>
) {
  const schema = state.schema
  const replacements: { from: number; to: number; text: string }[] = []
  let row = 0
  state.doc.descendants((node, pos) => {
    if (node.type.name !== "table_row") return true
    let col = 0
    node.forEach((cell, offset) => {
      if (
        cell.type.name !== "table_cell" &&
        cell.type.name !== "table_header"
      ) {
        return
      }
      const paragraph = cell.firstChild
      if (!paragraph) return
      replacements.push({
        from: pos + 1 + offset + 1,
        to: pos + 1 + offset + 1 + paragraph.nodeSize,
        text: `${row}${col}`,
      })
      col += 1
    })
    row += 1
    return false
  })
  const paragraphType = schema.nodes.paragraph
  if (!paragraphType) throw new Error("Expected a paragraph node type")
  let tr = state.tr
  for (const entry of replacements.sort((a, b) => b.from - a.from)) {
    tr = tr.replaceWith(
      entry.from,
      entry.to,
      paragraphType.create(null, schema.text(entry.text))
    )
  }
  return state.apply(tr)
}

function tableCellTexts(
  state: ReturnType<typeof createEditorStateFromDocument>
): string[][] {
  const rows: string[][] = []
  state.doc.descendants((node) => {
    if (node.type.name !== "table_row") return true
    const cells: string[] = []
    node.forEach((cell) => {
      if (
        cell.type.name === "table_cell" ||
        cell.type.name === "table_header"
      ) {
        cells.push(cell.textContent)
      }
    })
    rows.push(cells)
    return false
  })
  return rows
}

function semanticTable(
  document: ReturnType<typeof applyCommandToSemantic>["document"]
) {
  const table = document.sections[0]?.blocks.find(
    (block) => block.type === "table"
  )
  if (table?.type !== "table") throw new Error("Expected a table")
  return table
}

describe("table row and column reorder", () => {
  test("moveTableRow uses arrayMove semantics and keeps column content", () => {
    let state = createEditorStateFromDocument(createBlankDocument())
    state = applyCommandToSemantic(state, insertTable(3, 2)).state
    state = fillTableCells(state)
    state = placeCaretInCell(state, 0, 0)
    expect(tableCellTexts(state)).toEqual([
      ["00", "01"],
      ["10", "11"],
      ["20", "21"],
    ])

    const moved = applyCommandToSemantic(state, moveTableRow(0, 2))
    expect(moved.applied).toBe(true)
    expect(tableCellTexts(moved.state)).toEqual([
      ["10", "11"],
      ["20", "21"],
      ["00", "01"],
    ])
  })

  test("moveTableColumn permutes cells, widths, and sizing policy", () => {
    let state = createEditorStateFromDocument(createBlankDocument())
    state = applyCommandToSemantic(state, insertTable(2, 3, 2000)).state
    state = fillTableCells(state)
    state = placeCaretInCell(state, 0, 0)

    const beforeTable = findEnclosingTable(state)?.node
    expect(beforeTable).toBeDefined()
    const widthsBefore = (beforeTable?.attrs.columnWidths as number[]) ?? []
    expect(widthsBefore).toHaveLength(3)

    const moved = applyCommandToSemantic(state, moveTableColumn(0, 2))
    expect(moved.applied).toBe(true)
    expect(tableCellTexts(moved.state)).toEqual([
      ["01", "02", "00"],
      ["11", "12", "10"],
    ])

    const after = semanticTable(moved.document)
    expect(after.columnWidths.map(Number)).toEqual([
      widthsBefore[1] ?? 0,
      widthsBefore[2] ?? 0,
      widthsBefore[0] ?? 0,
    ])
    expect(after.sizing?.columns.map((column) => column.mode)).toEqual([
      "fill",
      "fill",
      "fill",
    ])
    expect(after.rows[0]?.cells.map((cell) => cell.columnIndex)).toEqual([
      0, 1, 2,
    ])
  })

  test("same-index and out-of-range moves are no-ops", () => {
    let state = createEditorStateFromDocument(createBlankDocument())
    state = applyCommandToSemantic(state, insertTable(2, 2)).state
    state = placeCaretInCell(state)
    expect(moveTableRow(0, 0)(state)).toBe(false)
    expect(moveTableRow(0, 4)(state)).toBe(false)
    expect(moveTableColumn(1, 1)(state)).toBe(false)
    expect(moveTableColumn(-1, 0)(state)).toBe(false)
  })

  test("moveCurrentTableRow and moveCurrentTableColumn follow the caret", () => {
    let state = createEditorStateFromDocument(createBlankDocument())
    state = applyCommandToSemantic(state, insertTable(3, 3)).state
    state = fillTableCells(state)
    state = placeCaretInCell(state, 2, 2)

    const down = applyCommandToSemantic(state, moveCurrentTableRow(-1))
    expect(down.applied).toBe(true)
    expect(tableCellTexts(down.state)[1]?.[2]).toBe("22")

    const left = applyCommandToSemantic(down.state, moveCurrentTableColumn(-1))
    expect(left.applied).toBe(true)
    expect(tableCellTexts(left.state)[1]?.[1]).toBe("22")
  })

  test("merged cells block the axis they span", () => {
    let state = createEditorStateFromDocument(createBlankDocument())
    state = applyCommandToSemantic(state, insertTable(2, 2)).state
    let first = 0
    let second = 0
    state.doc.descendants((node, pos) => {
      if (node.type.name !== "table_cell") return true
      if (!first) first = pos
      else if (!second) second = pos
      return true
    })
    state = state.apply(
      state.tr.setSelection(CellSelection.create(state.doc, first, second))
    )
    const merged = applyCommandToSemantic(state, tableCommands.mergeCells)
    expect(merged.applied).toBe(true)
    const table = findEnclosingTable(merged.state)?.node
    expect(table).toBeDefined()
    if (!table) return
    expect(tableHasMergedSpans(table, "column")).toBe(true)
    expect(moveTableColumn(0, 1)(merged.state)).toBe(false)
    expect(moveTableRow(0, 1)(merged.state)).toBe(true)
  })

  test("selectCurrentTableRow covers every cell in the row", () => {
    let state = createEditorStateFromDocument(createBlankDocument())
    state = applyCommandToSemantic(state, insertTable(2, 3)).state
    state = placeCaretInCell(state, 1, 1)
    const selected = applyCommandToSemantic(state, selectCurrentTableRow())
    expect(selected.applied).toBe(true)
    const selection = selected.state.selection as CellSelection
    const cells: number[] = []
    selection.forEachCell((_node, pos) => {
      cells.push(pos)
    })
    expect(cells).toHaveLength(3)
  })

  test("context menu exposes move actions and tableCommands.bind them", () => {
    const ids = tableContextMenuItems().map((item) => item.id)
    expect(ids).toContain("row-up")
    expect(ids).toContain("row-down")
    expect(ids).toContain("col-left")
    expect(ids).toContain("col-right")
    expect(typeof tableCommands.moveRow).toBe("function")
    expect(typeof tableCommands.moveColumn).toBe("function")
  })
})
