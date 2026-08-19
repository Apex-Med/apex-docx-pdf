import type { Mark } from "prosemirror-model"
import { Plugin, PluginKey, type EditorState } from "prosemirror-state"
import type { CellSelection } from "prosemirror-tables"
import { redoDepth, undoDepth } from "prosemirror-history"

export type SelectionTextStyle = Readonly<{
  fontFamily: string
  fontSize: number
  fontWeight: number
  fontStyle: "normal" | "italic"
  underline: boolean
  strikethrough: boolean
  color: string
  highlightColor: string | null
  verticalAlignment: "baseline" | "superscript" | "subscript"
  styleId: string | null
  href: string | null
}>

export type SelectionParagraphState = Readonly<{
  alignment: "left" | "center" | "right" | "justify"
  spacingBefore: number
  spacingAfter: number
  lineSpacing: unknown
  indentStart: number
  indentEnd: number
  firstLineIndent: number
  styleId: string | null
  numbering: { definitionId: string; level: number } | null
  tabStops: readonly { position: number; alignment: "left" }[]
}>

export type SelectionSectionState = Readonly<{
  pageWidth: number
  pageHeight: number
  orientation: "portrait" | "landscape"
  marginTop: number
  marginRight: number
  marginBottom: number
  marginLeft: number
  differentFirstPage: boolean
  columnCount: number
  columnEqualWidth: boolean
  columnSpace: number
  columnSeparator: boolean
  columnWidths: readonly number[] | null
}>

export type SelectionTableState = Readonly<{
  inTable: boolean
  rows: number
  cols: number
  cellFill: string | null
}>

export type EditorSelectionSnapshot = Readonly<{
  bold: boolean
  italic: boolean
  underline: boolean
  strikethrough: boolean
  textStyle: SelectionTextStyle
  paragraph: SelectionParagraphState | null
  section: SelectionSectionState | null
  table: SelectionTableState
  canUndo: boolean
  canRedo: boolean
  empty: boolean
  revision: number
}>

export const selectionStatePluginKey = new PluginKey<EditorSelectionSnapshot>(
  "apexSelectionState"
)

const DEFAULT_TEXT: SelectionTextStyle = Object.freeze({
  fontFamily: "Inter",
  fontSize: 220,
  fontWeight: 400,
  fontStyle: "normal",
  underline: false,
  strikethrough: false,
  color: "#000000",
  highlightColor: null,
  verticalAlignment: "baseline",
  styleId: null,
  href: null,
})

function textStyleFromMarks(
  marks: readonly Mark[],
  markType: EditorState["schema"]["marks"][string] | undefined,
  linkType: EditorState["schema"]["marks"][string] | undefined
): SelectionTextStyle {
  const existing = markType ? markType.isInSet(marks) : null
  const link = linkType ? linkType.isInSet(marks) : null
  const href = link ? String(link.attrs.href ?? "") : null
  if (!existing) {
    return { ...DEFAULT_TEXT, href }
  }
  return {
    fontFamily: String(existing.attrs.fontFamily ?? "Inter"),
    fontSize: Number(existing.attrs.fontSize ?? 220),
    fontWeight: Number(existing.attrs.fontWeight ?? 400),
    fontStyle: existing.attrs.fontStyle === "italic" ? "italic" : "normal",
    underline: existing.attrs.underline === true,
    strikethrough: existing.attrs.strikethrough === true,
    color: String(existing.attrs.color ?? "#000000"),
    highlightColor: existing.attrs.highlightColor
      ? String(existing.attrs.highlightColor)
      : null,
    verticalAlignment:
      (existing.attrs
        .verticalAlignment as SelectionTextStyle["verticalAlignment"]) ??
      "baseline",
    styleId: existing.attrs.styleId ? String(existing.attrs.styleId) : null,
    href,
  }
}

function enclosingParagraphRange(
  state: EditorState
): { from: number; to: number } | null {
  const $from = state.selection.$from
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.name === "paragraph") {
      return { from: $from.start(depth), to: $from.end(depth) }
    }
  }
  return null
}

function firstTextMarksInRange(
  state: EditorState,
  from: number,
  to: number
): readonly Mark[] | null {
  const markType = state.schema.marks.textStyle
  let fallback: readonly Mark[] | null = null
  let styled: readonly Mark[] | null = null
  state.doc.nodesBetween(from, to, (node) => {
    if (styled || !node.isText) return true
    if (node.marks.length === 0) return true
    if (!fallback) fallback = node.marks
    if (!markType || markType.isInSet(node.marks)) {
      styled = node.marks
      return false
    }
    return true
  })
  return styled ?? fallback
}

function readTextStyle(state: EditorState): SelectionTextStyle {
  const markType = state.schema.marks.textStyle
  const linkType = state.schema.marks.link
  if (state.storedMarks) {
    return textStyleFromMarks(state.storedMarks, markType, linkType)
  }

  const fromMarks = state.selection.$from.marks()
  if (markType?.isInSet(fromMarks)) {
    return textStyleFromMarks(fromMarks, markType, linkType)
  }

  const { from, to, empty } = state.selection
  const range = empty ? enclosingParagraphRange(state) : { from, to }
  if (range && range.to > range.from) {
    const scanned = firstTextMarksInRange(state, range.from, range.to)
    if (scanned) return textStyleFromMarks(scanned, markType, linkType)
  }

  return textStyleFromMarks(fromMarks, markType, linkType)
}

function readParagraph(state: EditorState): SelectionParagraphState | null {
  const $from = state.selection.$from
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d)
    if (node.type.name === "paragraph") {
      return {
        alignment:
          (node.attrs.alignment as SelectionParagraphState["alignment"]) ??
          "left",
        spacingBefore: Number(node.attrs.spacingBefore ?? 0),
        spacingAfter: Number(node.attrs.spacingAfter ?? 0),
        lineSpacing: node.attrs.lineSpacing ?? null,
        indentStart: Number(node.attrs.indentStart ?? 0),
        indentEnd: Number(node.attrs.indentEnd ?? 0),
        firstLineIndent: Number(node.attrs.firstLineIndent ?? 0),
        styleId: node.attrs.styleId ? String(node.attrs.styleId) : null,
        numbering:
          (node.attrs.numbering as SelectionParagraphState["numbering"]) ??
          null,
        tabStops:
          (node.attrs.tabStops as SelectionParagraphState["tabStops"]) ?? [],
      }
    }
  }
  return null
}

function readSection(state: EditorState): SelectionSectionState | null {
  const $from = state.selection.$from
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d)
    if (node.type.name === "section") {
      return {
        pageWidth: Number(node.attrs.pageWidth ?? 11906),
        pageHeight: Number(node.attrs.pageHeight ?? 16838),
        orientation:
          node.attrs.orientation === "landscape" ? "landscape" : "portrait",
        marginTop: Number(node.attrs.marginTop ?? 1440),
        marginRight: Number(node.attrs.marginRight ?? 1440),
        marginBottom: Number(node.attrs.marginBottom ?? 1440),
        marginLeft: Number(node.attrs.marginLeft ?? 1440),
        differentFirstPage: node.attrs.differentFirstPage === true,
        columnCount: Number(node.attrs.columnCount ?? 1),
        columnEqualWidth: node.attrs.columnEqualWidth !== false,
        columnSpace: Number(node.attrs.columnSpace ?? 720),
        columnSeparator: node.attrs.columnSeparator === true,
        columnWidths: Array.isArray(node.attrs.columnWidths)
          ? (node.attrs.columnWidths as number[])
          : null,
      }
    }
  }
  return null
}

function readTable(state: EditorState): SelectionTableState {
  const sel = state.selection
  if (typeof (sel as CellSelection).forEachCell === "function") {
    const cellSel = sel as CellSelection
    const table = cellSel.$anchorCell.node(-1)
    return {
      inTable: true,
      rows: table.childCount,
      cols: table.firstChild?.childCount ?? 0,
      cellFill: cellSel.$anchorCell.nodeAfter?.attrs.background
        ? String(cellSel.$anchorCell.nodeAfter.attrs.background)
        : null,
    }
  }
  const $from = state.selection.$from
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d)
    if (node.type.name === "table") {
      return {
        inTable: true,
        rows: node.childCount,
        cols: node.firstChild?.childCount ?? 0,
        cellFill: null,
      }
    }
  }
  return { inTable: false, rows: 0, cols: 0, cellFill: null }
}

function snapshotFromState(
  state: EditorState,
  revision: number
): EditorSelectionSnapshot {
  const textStyle = readTextStyle(state)
  return {
    bold: textStyle.fontWeight >= 700,
    italic: textStyle.fontStyle === "italic",
    underline: textStyle.underline,
    strikethrough: textStyle.strikethrough,
    textStyle,
    paragraph: readParagraph(state),
    section: readSection(state),
    table: readTable(state),
    canUndo: undoDepth(state) > 0,
    canRedo: redoDepth(state) > 0,
    empty: state.selection.empty,
    revision,
  }
}

/**
 * Tracks a memoized selection/formatting snapshot so React chrome can
 * subscribe without scanning the document on every keystroke.
 */
export function createSelectionStatePlugin(): Plugin<EditorSelectionSnapshot> {
  return new Plugin<EditorSelectionSnapshot>({
    key: selectionStatePluginKey,
    state: {
      init: (_config, state) => snapshotFromState(state, 0),
      apply: (tr, prev, _oldState, newState) => {
        if (!tr.docChanged && !tr.selectionSet && !tr.storedMarksSet) {
          return prev
        }
        return snapshotFromState(newState, prev.revision + 1)
      },
    },
  })
}

export function getSelectionSnapshot(
  state: EditorState
): EditorSelectionSnapshot | null {
  return selectionStatePluginKey.getState(state) ?? null
}
