/** Authored column widths in twips, dropping invalid entries. */
export function authoredColumnWidthsTwips(
  attrs: Readonly<Record<string, unknown>>
): number[] {
  if (!Array.isArray(attrs.columnWidths)) return []
  return attrs.columnWidths
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0)
}

/** Inline table CSS that preserves Word/Google Docs grid geometry. */
export function authoredTableStyle(
  attrs: Readonly<Record<string, unknown>>
): string {
  const alignment = String(attrs.alignment ?? "left")
  const width = Number(attrs.preferredWidth ?? attrs.width ?? 0)
  const indentStart = Number(attrs.indentStart ?? 0)
  const padding = (attrs.cellPadding ?? {}) as Record<string, number>
  return [
    width > 0 ? `width:${width / 20}pt` : "",
    `table-layout:${attrs.layout === "autofit" ? "auto" : "fixed"}`,
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
  table.style.cssText = authoredTableStyle(attrs)
  table.style.minWidth = ""
  const widths = authoredColumnWidthsTwips(attrs)
  const cols = [...colgroup.children] as HTMLElement[]
  if (widths.length === 0 || widths.length !== cols.length) return
  for (let index = 0; index < cols.length; index += 1) {
    const column = cols[index]
    const width = widths[index]
    if (!column || width === undefined) continue
    column.style.width = `${width / 20}pt`
    column.style.minWidth = ""
  }
}
