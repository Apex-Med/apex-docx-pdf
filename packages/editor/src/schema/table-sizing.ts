import type {
  TableColumnSizing,
  TableSizing,
  TableWidthMode,
} from "@apexmed/core"
import { twips } from "@apexmed/core"

export const MIN_TABLE_COLUMN_WIDTH = 240

function positiveInteger(value: unknown, fallback: number): number {
  const numeric = Number(value)
  return Number.isSafeInteger(numeric) && numeric > 0
    ? numeric
    : Math.max(1, Math.round(fallback))
}

function optionalPositiveInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const numeric = Number(value)
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null
}

export function importedFixedTableSizing(
  columnWidths: readonly number[]
): TableSizing {
  const widths = columnWidths.map((width) =>
    positiveInteger(width, MIN_TABLE_COLUMN_WIDTH)
  )
  return {
    mode: "fixed",
    width: twips(widths.reduce((sum, width) => sum + width, 0)),
    columns: widths.map((width) => ({
      mode: "fixed",
      width: twips(width),
      minWidth: null,
      maxWidth: null,
      allowMultiline: true,
    })),
  }
}

/** Defaults for tables created in the editor: table Fill, every column Fill. */
export function defaultTableSizing(
  columnWidths: readonly number[]
): TableSizing {
  const fixed = importedFixedTableSizing(columnWidths)
  return {
    ...fixed,
    mode: "fill",
    columns: fixed.columns.map((column) => ({
      ...column,
      mode: "fill" as const,
    })),
  }
}

export function normalizeTableSizing(
  value: unknown,
  columnWidths: readonly number[]
): TableSizing | null {
  if (!value || typeof value !== "object") return null
  const candidate = value as Partial<TableSizing>
  const fallback = importedFixedTableSizing(columnWidths)
  const mode: TableWidthMode =
    candidate.mode === "fill" || candidate.mode === "hug"
      ? candidate.mode
      : "fixed"
  const rawColumns = Array.isArray(candidate.columns) ? candidate.columns : []
  if (rawColumns.length !== columnWidths.length) return null
  const columns = rawColumns.map((raw, index): TableColumnSizing => {
    const entry =
      raw && typeof raw === "object" ? (raw as Partial<TableColumnSizing>) : {}
    const columnMode =
      entry.mode === "fill" || entry.mode === "hug" ? entry.mode : "fixed"
    const width = positiveInteger(
      entry.width,
      columnWidths[index] ?? MIN_TABLE_COLUMN_WIDTH
    )
    const allowMultiline = entry.allowMultiline !== false
    let minWidth = allowMultiline
      ? optionalPositiveInteger(entry.minWidth)
      : null
    let maxWidth = allowMultiline
      ? optionalPositiveInteger(entry.maxWidth)
      : null
    if (minWidth !== null && maxWidth !== null && minWidth > maxWidth) {
      ;[minWidth, maxWidth] = [maxWidth, minWidth]
    }
    return {
      mode: columnMode,
      width: twips(width),
      minWidth: minWidth === null ? null : twips(minWidth),
      maxWidth: maxWidth === null ? null : twips(maxWidth),
      allowMultiline,
    }
  })
  const fillCount = columns.filter((column) => column.mode === "fill").length
  if (mode === "hug" && fillCount > 0) return null
  if (mode !== "hug" && fillCount === 0) return null
  return {
    mode,
    width: twips(positiveInteger(candidate.width, fallback.width)),
    columns,
  }
}

export function tableSizingConstraintMessage(
  sizing: TableSizing
): string | null {
  const fillCount = sizing.columns.filter(
    (column) => column.mode === "fill"
  ).length
  if (sizing.mode === "hug" && fillCount > 0) {
    return "Hug tables cannot contain Fill columns."
  }
  if (sizing.mode !== "hug" && fillCount === 0) {
    return "Fixed and Fill tables need at least one Fill column."
  }
  for (const [index, column] of sizing.columns.entries()) {
    if (
      column.allowMultiline &&
      column.minWidth != null &&
      column.maxWidth != null &&
      column.minWidth > column.maxWidth
    ) {
      return `Column ${index + 1} minimum width cannot exceed its maximum width.`
    }
  }
  return null
}

/**
 * Changing the table to Hug is atomic: Fill columns become Hug so the user is
 * never trapped between mutually exclusive constraints.
 */
export function withTableWidthMode(
  sizing: TableSizing,
  mode: TableWidthMode
): TableSizing {
  if (mode === "hug") {
    return {
      ...sizing,
      mode,
      columns: sizing.columns.map((column) =>
        column.mode === "fill" ? { ...column, mode: "hug" as const } : column
      ),
    }
  }
  if (sizing.columns.some((column) => column.mode === "fill")) {
    return { ...sizing, mode }
  }
  return {
    ...sizing,
    mode,
    columns: sizing.columns.map((column, index) =>
      index === sizing.columns.length - 1
        ? { ...column, mode: "fill" as const }
        : column
    ),
  }
}
