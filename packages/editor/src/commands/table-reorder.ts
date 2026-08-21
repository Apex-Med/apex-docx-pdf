import { twips, type TableSizing } from "@apexmed/core"
import type { Node as PMNode } from "prosemirror-model"
import type { Command, EditorState } from "prosemirror-state"
import { CellSelection, TableMap } from "prosemirror-tables"

import {
  importedFixedTableSizing,
  normalizeTableSizing,
} from "../schema/table-sizing"

export type TableReorderAxis = "row" | "column"

export type EnclosingTable = Readonly<{
  node: PMNode
  pos: number
}>

function findNodeDepth(
  $from: { depth: number; node: (d: number) => { type: { name: string } } },
  name: string
): number {
  let depth = $from.depth
  while (depth > 0 && $from.node(depth).type.name !== name) depth -= 1
  return depth
}

function isTableCell(node: PMNode | null | undefined): node is PMNode {
  return (
    !!node &&
    (node.type.name === "table_cell" || node.type.name === "table_header")
  )
}

/** Table containing the caret or cell selection. */
export function findEnclosingTable(state: EditorState): EnclosingTable | null {
  const selection = state.selection as CellSelection
  if (typeof selection.$anchorCell?.node === "function") {
    try {
      const table = selection.$anchorCell.node(-1)
      if (table?.type.name === "table") {
        return { node: table, pos: selection.$anchorCell.start(-1) - 1 }
      }
    } catch {
      /* Selection may not be a cell selection. */
    }
  }
  const { $from } = state.selection
  const depth = findNodeDepth($from, "table")
  const node = $from.node(depth)
  if (node.type.name === "table") {
    return { node, pos: $from.before(depth) }
  }
  return null
}

export function tableHasMergedSpans(
  table: PMNode,
  axis: TableReorderAxis
): boolean {
  const attr = axis === "row" ? "rowspan" : "colspan"
  let found = false
  table.descendants((node) => {
    if (found || !isTableCell(node)) return !found
    if (Number(node.attrs[attr] ?? 1) > 1) found = true
    return !found
  })
  return found
}

export function permuteIndex<T>(
  items: readonly T[],
  fromIndex: number,
  toIndex: number
): T[] {
  const next = [...items]
  const [item] = next.splice(fromIndex, 1)
  if (item === undefined) return next
  next.splice(toIndex, 0, item)
  return next
}

function tableRows(table: PMNode): PMNode[] {
  const rows: PMNode[] = []
  table.forEach((row) => {
    if (row.type.name === "table_row") rows.push(row)
  })
  return rows
}

function rowCells(row: PMNode): PMNode[] {
  const cells: PMNode[] = []
  row.forEach((cell) => {
    if (isTableCell(cell)) cells.push(cell)
  })
  return cells
}

function authoredColumnWidths(table: PMNode, columnCount: number): number[] {
  const raw = Array.isArray(table.attrs.columnWidths)
    ? (table.attrs.columnWidths as unknown[])
        .map(Number)
        .filter((width) => Number.isSafeInteger(width) && width > 0)
    : []
  if (raw.length === columnCount) return raw
  const fallback = Math.max(
    1,
    Math.round(Number(table.attrs.width ?? columnCount * 1440) / columnCount)
  )
  return Array.from({ length: columnCount }, () => fallback)
}

function cellSelectionAt(
  doc: PMNode,
  tablePos: number,
  row: number,
  column: number
): CellSelection | null {
  const table = doc.nodeAt(tablePos)
  if (table?.type.name !== "table") return null
  const map = TableMap.get(table)
  if (row < 0 || column < 0 || row >= map.height || column >= map.width) {
    return null
  }
  const relative = map.map[row * map.width + column]
  if (relative === undefined) return null
  return CellSelection.create(doc, tablePos + 1 + relative)
}

function selectedGridOrigin(state: EditorState): {
  row: number
  column: number
} {
  const tableInfo = findEnclosingTable(state)
  if (!tableInfo) return { row: 0, column: 0 }
  const map = TableMap.get(tableInfo.node)
  const $from = state.selection.$from
  for (let row = 0; row < map.height; row += 1) {
    for (let column = 0; column < map.width; column += 1) {
      const relative = map.map[row * map.width + column]
      if (relative === undefined) continue
      const pos = tableInfo.pos + 1 + relative
      const cell = state.doc.nodeAt(pos)
      if (!isTableCell(cell)) continue
      if ($from.pos >= pos && $from.pos <= pos + cell.nodeSize) {
        return { row, column }
      }
    }
  }
  const selection = state.selection as CellSelection
  if (typeof selection.$anchorCell?.pos === "number") {
    try {
      const rect = map.findCell(selection.$anchorCell.pos - tableInfo.pos - 1)
      return { row: rect.top, column: rect.left }
    } catch {
      /* fall through */
    }
  }
  return { row: 0, column: 0 }
}

function applyCellColumnAttrs(
  cell: PMNode,
  columnIndex: number,
  widths: readonly number[],
  columns: TableSizing["columns"] | null
): PMNode {
  const span = Number(cell.attrs.colspan ?? 1)
  const cellWidths = widths.slice(columnIndex, columnIndex + span)
  const policies = columns?.slice(columnIndex, columnIndex + span) ?? []
  const primary = policies[0]
  return cell.type.create(
    {
      ...cell.attrs,
      columnIndex,
      width:
        cellWidths.length > 0
          ? cellWidths.reduce((sum, width) => sum + width, 0)
          : cell.attrs.width,
      colwidth: cellWidths.length > 0 ? cellWidths : cell.attrs.colwidth,
      ...(primary
        ? {
            widthMode: policies.every((policy) => policy.mode === primary.mode)
              ? primary.mode
              : "fixed",
            minWidth: primary.minWidth ?? null,
            maxWidth: primary.maxWidth ?? null,
            allowMultiline: policies.every(
              (policy) => policy.allowMultiline !== false
            ),
          }
        : {}),
    },
    cell.content,
    cell.marks
  )
}

/** Select every cell in the given table row. */
export function selectTableRow(rowIndex: number): Command {
  return (state, dispatch) => {
    const tableInfo = findEnclosingTable(state)
    if (!tableInfo) return false
    const map = TableMap.get(tableInfo.node)
    if (rowIndex < 0 || rowIndex >= map.height) return false
    const first = map.map[rowIndex * map.width]
    const last = map.map[rowIndex * map.width + map.width - 1]
    if (first === undefined || last === undefined) return false
    if (dispatch) {
      dispatch(
        state.tr.setSelection(
          CellSelection.create(
            state.doc,
            tableInfo.pos + 1 + first,
            tableInfo.pos + 1 + last
          )
        )
      )
    }
    return true
  }
}

/** Select every cell in the given table column. */
export function selectTableColumn(columnIndex: number): Command {
  return (state, dispatch) => {
    const tableInfo = findEnclosingTable(state)
    if (!tableInfo) return false
    const map = TableMap.get(tableInfo.node)
    if (columnIndex < 0 || columnIndex >= map.width) return false
    const first = map.map[columnIndex]
    const last = map.map[(map.height - 1) * map.width + columnIndex]
    if (first === undefined || last === undefined) return false
    if (dispatch) {
      dispatch(
        state.tr.setSelection(
          CellSelection.create(
            state.doc,
            tableInfo.pos + 1 + first,
            tableInfo.pos + 1 + last
          )
        )
      )
    }
    return true
  }
}

/** Select the row that contains the caret or cell selection. */
export function selectCurrentTableRow(): Command {
  return (state, dispatch) =>
    selectTableRow(selectedGridOrigin(state).row)(state, dispatch)
}

/**
 * Move a table row using arrayMove semantics (`fromIndex` lands at `toIndex`).
 * Refuses when any cell has rowspan &gt; 1.
 */
export function moveTableRow(fromIndex: number, toIndex: number): Command {
  return (state, dispatch) => {
    const tableInfo = findEnclosingTable(state)
    if (!tableInfo) return false
    const rows = tableRows(tableInfo.node)
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= rows.length ||
      toIndex >= rows.length
    ) {
      return false
    }
    if (tableHasMergedSpans(tableInfo.node, "row")) return false
    if (!dispatch) return true

    const nextRows = permuteIndex(rows, fromIndex, toIndex)
    const nextTable = tableInfo.node.type.create(
      tableInfo.node.attrs,
      nextRows,
      tableInfo.node.marks
    )
    const origin = selectedGridOrigin(state)
    let tr = state.tr.replaceWith(
      tableInfo.pos,
      tableInfo.pos + tableInfo.node.nodeSize,
      nextTable
    )
    const selection = cellSelectionAt(
      tr.doc,
      tableInfo.pos,
      toIndex,
      origin.column
    )
    if (selection) tr = tr.setSelection(selection)
    dispatch(tr.scrollIntoView())
    return true
  }
}

/**
 * Move a table column using arrayMove semantics. Permutes `columnWidths` and
 * `tableSizing.columns`, and rewrites each cell's `columnIndex`. Refuses when
 * any cell has colspan &gt; 1.
 */
export function moveTableColumn(fromIndex: number, toIndex: number): Command {
  return (state, dispatch) => {
    const tableInfo = findEnclosingTable(state)
    if (!tableInfo) return false
    const map = TableMap.get(tableInfo.node)
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= map.width ||
      toIndex >= map.width
    ) {
      return false
    }
    if (tableHasMergedSpans(tableInfo.node, "column")) return false
    if (!dispatch) return true

    const widths = permuteIndex(
      authoredColumnWidths(tableInfo.node, map.width),
      fromIndex,
      toIndex
    )
    const explicit = normalizeTableSizing(
      tableInfo.node.attrs.tableSizing,
      authoredColumnWidths(tableInfo.node, map.width)
    )
    const sizing: TableSizing | null = explicit
      ? {
          ...explicit,
          columns: permuteIndex(explicit.columns, fromIndex, toIndex),
          width: twips(widths.reduce((sum, width) => sum + width, 0)),
        }
      : null
    const fallbackColumns = sizing
      ? sizing.columns
      : importedFixedTableSizing(widths).columns
    const nextRows = tableRows(tableInfo.node).map((row) => {
      const nextCells = permuteIndex(rowCells(row), fromIndex, toIndex).map(
        (cell, columnIndex) =>
          applyCellColumnAttrs(cell, columnIndex, widths, fallbackColumns)
      )
      return row.type.create(row.attrs, nextCells, row.marks)
    })
    const width = widths.reduce((sum, value) => sum + value, 0)
    const nextTable = tableInfo.node.type.create(
      {
        ...tableInfo.node.attrs,
        columnWidths: widths,
        width,
        preferredWidth: width,
        ...(sizing ? { tableSizing: sizing } : {}),
      },
      nextRows,
      tableInfo.node.marks
    )
    const origin = selectedGridOrigin(state)
    let tr = state.tr.replaceWith(
      tableInfo.pos,
      tableInfo.pos + tableInfo.node.nodeSize,
      nextTable
    )
    const selection = cellSelectionAt(
      tr.doc,
      tableInfo.pos,
      origin.row,
      toIndex
    )
    if (selection) tr = tr.setSelection(selection)
    dispatch(tr.scrollIntoView())
    return true
  }
}

/** Move the row containing the selection by `delta` (−1 up, +1 down). */
export function moveCurrentTableRow(delta: -1 | 1): Command {
  return (state, dispatch) => {
    const from = selectedGridOrigin(state).row
    return moveTableRow(from, from + delta)(state, dispatch)
  }
}

/** Move the column containing the selection by `delta` (−1 left, +1 right). */
export function moveCurrentTableColumn(delta: -1 | 1): Command {
  return (state, dispatch) => {
    const from = selectedGridOrigin(state).column
    return moveTableColumn(from, from + delta)(state, dispatch)
  }
}
