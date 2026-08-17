import type { TableColumnSizing } from "@apexmed/core"

import { normalizeTableSizing } from "./table-sizing"

/** Authored column widths in twips, dropping invalid entries. */
export function authoredColumnWidthsTwips(
  attrs: Readonly<Record<string, unknown>>
): number[] {
  if (!Array.isArray(attrs.columnWidths)) return []
  return attrs.columnWidths
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0)
}

export function fillColumnCount(
  columns: readonly { mode?: string }[] | undefined
): number {
  return columns?.filter((column) => column.mode === "fill").length ?? 0
}

/**
 * CSS width for one column.
 *
 * Fill columns must stay unspecified (`auto`) so `table-layout: fixed` can
 * split leftover space equally. A percentage still loses to min-content under
 * `table-layout: auto`, which is why two Fill columns with different text
 * used to come out different widths.
 */
export function authoredColumnWidthCss(
  policy: TableColumnSizing | undefined,
  fallbackWidth: number,
  hugWidthPx?: number
): string {
  if (policy?.mode === "fill") return "auto"
  if (policy?.mode === "hug") {
    return hugWidthPx != null ? `${hugWidthPx}px` : "1%"
  }
  return `${(policy?.width ?? fallbackWidth) / 20}pt`
}

function horizontalChromePx(element: HTMLElement): number {
  const style = getComputedStyle(element)
  return (
    parseFloat(style.paddingLeft) +
    parseFloat(style.paddingRight) +
    parseFloat(style.borderLeftWidth) +
    parseFloat(style.borderRightWidth)
  )
}

function contentWidthPx(element: HTMLElement): number {
  const range = document.createRange()
  range.selectNodeContents(element)
  let width = 0
  for (const rect of range.getClientRects()) {
    width = Math.max(width, rect.width)
  }
  return width
}

function editorZoom(element: HTMLElement): number {
  let current: HTMLElement | null = element
  while (current) {
    const zoom = Number.parseFloat(getComputedStyle(current).zoom)
    if (Number.isFinite(zoom) && zoom > 0 && zoom !== 1) return zoom
    current = current.parentElement
  }
  return 1
}

/** Intrinsic pixel width of a Hug column, including cell chrome. */
export function measureHugColumnWidthPx(
  table: HTMLTableElement,
  columnIndex: number
): number {
  const zoom = editorZoom(table)
  let width = 0
  for (const row of Array.from(table.rows)) {
    let index = 0
    for (const cell of Array.from(row.cells)) {
      const span = cell.colSpan || 1
      if (index === columnIndex && span === 1) {
        const chrome = horizontalChromePx(cell)
        let inner = 0
        for (const child of Array.from(cell.children)) {
          inner = Math.max(inner, contentWidthPx(child as HTMLElement))
        }
        width = Math.max(width, Math.ceil(inner / zoom + chrome))
      }
      index += span
    }
  }
  return Math.max(1, width)
}

function clampHugWidthPx(
  measured: number,
  policy: TableColumnSizing | undefined
): number {
  if (!policy?.allowMultiline) return Math.max(1, measured)
  // 15 twips = 1 CSS px at 96dpi; min/max CSS is also applied in pt.
  const min = policy.minWidth ? policy.minWidth / 15 : 1
  const max = policy.maxWidth ? policy.maxWidth / 15 : Number.POSITIVE_INFINITY
  return Math.max(min, Math.min(measured, max))
}

/** Inline table CSS that preserves Word/Google Docs grid geometry. */
export function authoredTableStyle(
  attrs: Readonly<Record<string, unknown>>
): string {
  const alignment = String(attrs.alignment ?? "left")
  const width = Number(attrs.preferredWidth ?? attrs.width ?? 0)
  const columnWidths = authoredColumnWidthsTwips(attrs)
  const sizing = normalizeTableSizing(attrs.tableSizing, columnWidths)
  const indentStart = Number(attrs.indentStart ?? 0)
  const padding = (attrs.cellPadding ?? {}) as Record<string, number>
  const hasFillColumns = fillColumnCount(sizing?.columns) > 0
  return [
    sizing?.mode === "fill"
      ? "width:100%"
      : sizing?.mode === "hug"
        ? "width:max-content;max-width:100%"
        : sizing?.mode === "fixed"
          ? `width:${sizing.width / 20}pt`
          : width > 0
            ? `width:${width / 20}pt`
            : "",
    `table-layout:${
      hasFillColumns
        ? "fixed"
        : sizing
          ? "auto"
          : attrs.layout === "autofit"
            ? "auto"
            : "fixed"
    }`,
    alignment === "center"
      ? "margin-left:auto;margin-right:auto"
      : alignment === "right"
        ? "margin-left:auto;margin-right:0"
        : `margin-left:${indentStart / 20}pt;margin-right:auto`,
    `--apex-cell-pad-top:${Number(padding.top ?? 0) / 20}pt`,
    `--apex-cell-pad-right:${Number(padding.right ?? 108) / 20}pt`,
    `--apex-cell-pad-bottom:${Number(padding.bottom ?? 0) / 20}pt`,
    `--apex-cell-pad-left:${Number(padding.left ?? 108) / 20}pt`,
  ].join(";")
}

/**
 * Paint authored width, justification, cell padding, and column grid onto a
 * live table. ProseMirror's default TableView otherwise sizes columns in CSS
 * pixels from the first row and drops padding variables.
 */
export function applyAuthoredTableGeometry(
  table: HTMLTableElement,
  colgroup: HTMLElement,
  attrs: Readonly<Record<string, unknown>>
): void {
  table.setAttribute("data-node-id", String(attrs.nodeId ?? ""))
  const authoredWidths = authoredColumnWidthsTwips(attrs)
  const authoredSizing = normalizeTableSizing(attrs.tableSizing, authoredWidths)
  if (authoredSizing) table.dataset.tableWidthMode = authoredSizing.mode
  else delete table.dataset.tableWidthMode
  table.style.cssText = authoredTableStyle(attrs)
  table.style.minWidth = ""
  const widths = authoredWidths
  const cols = [...colgroup.children] as HTMLElement[]
  if (widths.length === 0 || widths.length !== cols.length) return
  const sizing = normalizeTableSizing(attrs.tableSizing, widths)
  const canMeasure =
    typeof getComputedStyle === "function" && table.rows.length > 0
  for (let index = 0; index < cols.length; index += 1) {
    const column = cols[index]
    const width = widths[index]
    if (!column || width === undefined) continue
    const policy = sizing?.columns[index]
    column.dataset.widthMode = policy?.mode ?? "fixed"
    const hugWidthPx =
      policy?.mode === "hug" && canMeasure
        ? clampHugWidthPx(measureHugColumnWidthPx(table, index), policy)
        : undefined
    column.style.width = authoredColumnWidthCss(policy, width, hugWidthPx)
    column.style.minWidth =
      policy?.allowMultiline && policy.minWidth
        ? `${policy.minWidth / 20}pt`
        : ""
    column.style.maxWidth =
      policy?.allowMultiline && policy.maxWidth
        ? `${policy.maxWidth / 20}pt`
        : ""
  }
}
