import type {
  NumberingDefinition,
  SemanticImageAsset,
  StyleDefinition,
} from "@apexmed/core"
import { twips } from "@apexmed/core"
import type {
  TableColumnSizing,
  TableSizing,
  TableWidthMode,
} from "@apexmed/core"

import { initialNumberingLabel } from "../model/list-label"
import {
  defaultTableSizing,
  importedFixedTableSizing,
  normalizeTableSizing,
  tableSizingConstraintMessage,
  withTableWidthMode,
} from "../schema/table-sizing"
import {
  baseKeymap,
  chainCommands,
  createParagraphNear,
  deleteSelection,
  exitCode,
  joinBackward,
  joinForward,
  liftEmptyBlock,
  newlineInCode,
  selectAll,
  selectNodeBackward,
  selectNodeForward,
  splitBlock,
} from "prosemirror-commands"
import { redo, undo } from "prosemirror-history"
import { keymap } from "prosemirror-keymap"
import type { Node as PMNode, NodeType } from "prosemirror-model"
import {
  TextSelection,
  type Command,
  type EditorState,
  type Transaction,
} from "prosemirror-state"
import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  CellSelection,
  deleteColumn,
  deleteRow,
  deleteTable,
  goToNextCell,
  mergeCells,
  splitCell,
  TableMap,
} from "prosemirror-tables"

import { moveTableColumn, moveTableRow } from "./table-reorder"

export {
  findEnclosingTable,
  moveCurrentTableColumn,
  moveCurrentTableRow,
  moveTableColumn,
  moveTableRow,
  permuteIndex,
  selectCurrentTableRow,
  selectTableColumn,
  selectTableRow,
  tableHasMergedSpans,
  type EnclosingTable,
  type TableReorderAxis,
} from "./table-reorder"

/** Transaction meta key for newly registered image assets (Editor merges into document.assets). */
export const IMAGE_ASSET_META = "apexImageAsset"

/** Transaction meta key for numbering definitions created by list commands. */
export const NUMBERING_DEFINITION_META = "apexNumberingDefinition"

export const BULLET_NUMBERING_ID = "editor-bullet"
export const DECIMAL_NUMBERING_ID = "editor-decimal"

function findNodeDepth(
  $from: { depth: number; node: (d: number) => { type: { name: string } } },
  name: string
): number {
  let depth = $from.depth
  while (depth > 0 && $from.node(depth).type.name !== name) depth -= 1
  return depth
}

export type CellBorderSpec = Readonly<{
  style: "none" | "single" | "double" | "dotted" | "dashed"
  color: string
  /** Border thickness in twips (default ~15 ≈ 0.75pt). */
  width: number
}>

export type CellBorderSide = "top" | "right" | "bottom" | "left" | "all"
export type SelectedCellBorderTarget =
  CellBorderSide | "insideHorizontal" | "insideVertical"

export type SelectedTableCellGrid = Readonly<{
  rows: 1 | 2
  columns: 1 | 2
  cellCount: number
}>
export type SelectedTableCellBorders = Partial<
  Record<Exclude<SelectedCellBorderTarget, "all">, CellBorderSpec | null>
>

/** Word/Google-style grid used when the user inserts a table. */
export const DEFAULT_INSERTED_TABLE_BORDER: CellBorderSpec = Object.freeze({
  style: "single",
  color: "#000000",
  width: 15,
})

type TableBorderAttrs = Readonly<{
  top: ReturnType<typeof toTableBorder>
  right: ReturnType<typeof toTableBorder>
  bottom: ReturnType<typeof toTableBorder>
  left: ReturnType<typeof toTableBorder>
  insideHorizontal: ReturnType<typeof toTableBorder>
  insideVertical: ReturnType<typeof toTableBorder>
}>

function toTableBorder(spec: CellBorderSpec | null) {
  if (!spec || spec.style === "none") return null
  const width = Number.isSafeInteger(spec.width)
    ? spec.width
    : Math.round(Number(spec.width) || 15)
  return {
    style: spec.style,
    color: spec.color,
    width: twips(Math.max(0, width)),
    space: twips(0),
  }
}

function gridTableBorders(spec: CellBorderSpec | null): TableBorderAttrs {
  const border = toTableBorder(spec)
  return {
    top: border,
    right: border,
    bottom: border,
    left: border,
    insideHorizontal: border,
    insideVertical: border,
  }
}

function borderSpecFromAttr(value: unknown): CellBorderSpec | null {
  if (!value || typeof value !== "object") return null
  const border = value as {
    style?: string
    color?: string
    width?: number
  }
  if (
    border.style !== "single" &&
    border.style !== "double" &&
    border.style !== "dotted" &&
    border.style !== "dashed"
  ) {
    return null
  }
  const width = Number(border.width ?? 15)
  return {
    style: border.style,
    color: String(border.color ?? "#000000"),
    width: Number.isSafeInteger(width) ? width : Math.round(width) || 15,
  }
}

function cellHasDirectBorders(attrs: Record<string, unknown>): boolean {
  return (
    attrs.borderTop != null ||
    attrs.borderRight != null ||
    attrs.borderBottom != null ||
    attrs.borderLeft != null
  )
}

function paintEmptyCellsFromTableBorders(
  tr: Transaction,
  tablePos: number
): Transaction {
  const table = tr.doc.nodeAt(tablePos)
  if (table?.type.name !== "table") return tr
  const borders = table.attrs.borders as TableBorderAttrs | null
  if (!borders) return tr
  const map = TableMap.get(table)
  table.forEach((rowNode, rowOffset) => {
    if (rowNode.type.name !== "table_row") return
    rowNode.forEach((cellNode, cellOffset) => {
      if (
        cellNode.type.name !== "table_cell" &&
        cellNode.type.name !== "table_header"
      ) {
        return
      }
      if (cellHasDirectBorders(cellNode.attrs)) return
      const cellPosition = rowOffset + 1 + cellOffset
      let rect: { left: number; right: number; top: number; bottom: number }
      try {
        rect = map.findCell(cellPosition)
      } catch {
        return
      }
      tr.setNodeMarkup(tablePos + 1 + cellPosition, undefined, {
        ...cellNode.attrs,
        borderTop: borderSpecFromAttr(
          rect.top === 0 ? borders.top : borders.insideHorizontal
        ),
        borderRight: borderSpecFromAttr(
          rect.right === map.width ? borders.right : borders.insideVertical
        ),
        borderBottom: borderSpecFromAttr(
          rect.bottom === map.height ? borders.bottom : borders.insideHorizontal
        ),
        borderLeft: borderSpecFromAttr(
          rect.left === 0 ? borders.left : borders.insideVertical
        ),
      })
    })
  })
  return tr
}

function withInheritedTableCellBorders(command: Command): Command {
  return (state, dispatch) => {
    if (!dispatch) return command(state)
    const depth = findNodeDepth(state.selection.$from, "table")
    if (state.selection.$from.node(depth).type.name !== "table") {
      return command(state, dispatch)
    }
    const tablePos = state.selection.$from.before(depth)
    return command(state, (tr) => {
      paintEmptyCellsFromTableBorders(tr, tr.mapping.map(tablePos))
      dispatch(tr)
    })
  }
}

function updateTextStyle(attrs: Record<string, unknown>): Command {
  return (state, dispatch) => {
    const markType = state.schema.marks.textStyle
    if (!markType) return false
    const { from, to, empty } = state.selection
    if (empty) {
      const marks = state.storedMarks ?? state.selection.$from.marks()
      const existing = markType.isInSet(marks)
      const next = markType.create({
        ...(existing?.attrs ?? {}),
        ...attrs,
      })
      if (dispatch) {
        dispatch(state.tr.addStoredMark(next))
      }
      return true
    }
    let tr = state.tr
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isText) return
      const existing = markType.isInSet(node.marks)
      const next = markType.create({
        ...(existing?.attrs ?? {}),
        ...attrs,
      })
      const start = Math.max(pos, from)
      const end = Math.min(pos + node.nodeSize, to)
      tr = tr.addMark(start, end, next)
    })
    if (dispatch) dispatch(tr.scrollIntoView())
    return true
  }
}

export function toggleBold(): Command {
  return (state, dispatch) => {
    const markType = state.schema.marks.textStyle
    if (!markType) return false
    const existing = markType.isInSet(
      state.storedMarks ?? state.selection.$from.marks()
    )
    const weight = Number(existing?.attrs.fontWeight ?? 400)
    return updateTextStyle({ fontWeight: weight >= 700 ? 400 : 700 })(
      state,
      dispatch
    )
  }
}

export function toggleItalic(): Command {
  return (state, dispatch) => {
    const markType = state.schema.marks.textStyle
    if (!markType) return false
    const existing = markType.isInSet(
      state.storedMarks ?? state.selection.$from.marks()
    )
    const style = String(existing?.attrs.fontStyle ?? "normal")
    return updateTextStyle({
      fontStyle: style === "italic" ? "normal" : "italic",
    })(state, dispatch)
  }
}

export function toggleUnderline(): Command {
  return (state, dispatch) => {
    const markType = state.schema.marks.textStyle
    if (!markType) return false
    const existing = markType.isInSet(
      state.storedMarks ?? state.selection.$from.marks()
    )
    const underline = Boolean(existing?.attrs.underline)
    return updateTextStyle({ underline: !underline })(state, dispatch)
  }
}

export function setTextColor(color: string): Command {
  return updateTextStyle({ color })
}

export function setHighlightColor(color: string | null): Command {
  return updateTextStyle({ highlightColor: color })
}

export function setLink(href: string | null): Command {
  return (state, dispatch) => {
    const linkType = state.schema.marks.link
    if (!linkType) return false
    const { from, to, empty } = state.selection
    if (href === null || href.length === 0) {
      if (empty) {
        const tr = state.tr.removeStoredMark(linkType)
        if (dispatch) dispatch(tr)
        return true
      }
      const tr = state.tr.removeMark(from, to, linkType)
      if (dispatch) dispatch(tr.scrollIntoView())
      return true
    }
    const mark = linkType.create({ href, title: null })
    if (empty) {
      if (dispatch) dispatch(state.tr.addStoredMark(mark))
      return true
    }
    if (dispatch) dispatch(state.tr.addMark(from, to, mark).scrollIntoView())
    return true
  }
}

export function removeLink(): Command {
  return setLink(null)
}

export function toggleLink(href: string): Command {
  return (state, dispatch) => {
    const linkType = state.schema.marks.link
    if (!linkType) return false
    const existing = linkType.isInSet(
      state.storedMarks ?? state.selection.$from.marks()
    )
    if (existing && String(existing.attrs.href) === href) {
      return setLink(null)(state, dispatch)
    }
    return setLink(href)(state, dispatch)
  }
}

export function setFontFamily(fontFamily: string): Command {
  return updateTextStyle({ fontFamily })
}

export function setFontWeight(fontWeight: number): Command {
  return updateTextStyle({ fontWeight })
}

export function setFontSize(fontSizeTwips: number): Command {
  return updateTextStyle({ fontSize: fontSizeTwips })
}

export function setParagraphAlignment(
  alignment: "left" | "center" | "right" | "justify"
): Command {
  return (state, dispatch) => {
    const { $from } = state.selection
    let depth = $from.depth
    while (depth > 0 && $from.node(depth).type.name !== "paragraph") depth -= 1
    if ($from.node(depth).type.name !== "paragraph") return false
    const pos = $from.before(depth)
    if (dispatch) {
      dispatch(
        state.tr.setNodeMarkup(pos, undefined, {
          ...$from.node(depth).attrs,
          alignment,
        })
      )
    }
    return true
  }
}

export function setParagraphSpacing(options: {
  spacingBefore?: number
  spacingAfter?: number
  lineSpacing?: unknown
}): Command {
  return setParagraphAttrs(options)
}

/** Merge partial paragraph attributes onto the enclosing paragraph. */
export function setParagraphAttrs(attrs: Record<string, unknown>): Command {
  return (state, dispatch) => {
    const { $from } = state.selection
    const depth = findNodeDepth($from, "paragraph")
    if ($from.node(depth).type.name !== "paragraph") return false
    const pos = $from.before(depth)
    if (dispatch) {
      dispatch(
        state.tr.setNodeMarkup(pos, undefined, {
          ...$from.node(depth).attrs,
          ...attrs,
        })
      )
    }
    return true
  }
}

export function toggleStrikethrough(): Command {
  return (state, dispatch) => {
    const markType = state.schema.marks.textStyle
    if (!markType) return false
    const existing = markType.isInSet(
      state.storedMarks ?? state.selection.$from.marks()
    )
    const strikethrough = Boolean(existing?.attrs.strikethrough)
    return updateTextStyle({ strikethrough: !strikethrough })(state, dispatch)
  }
}

export function setVerticalAlignment(
  verticalAlignment: "baseline" | "superscript" | "subscript"
): Command {
  return updateTextStyle({ verticalAlignment })
}

/**
 * Clear character marks and reset paragraph formatting to document defaults
 * within the current selection / enclosing paragraph.
 */
export function clearFormatting(): Command {
  return (state, dispatch) => {
    const { $from, from, to, empty } = state.selection
    const depth = findNodeDepth($from, "paragraph")
    if ($from.node(depth).type.name !== "paragraph") return false
    const paraPos = $from.before(depth)
    const para = $from.node(depth)
    const markFrom = empty ? $from.start(depth) : from
    const markTo = empty ? $from.end(depth) : to
    if (dispatch) {
      let tr = state.tr
      const textStyle = state.schema.marks.textStyle
      const link = state.schema.marks.link
      if (textStyle) tr = tr.removeMark(markFrom, markTo, textStyle)
      if (link) tr = tr.removeMark(markFrom, markTo, link)
      tr = tr.setNodeMarkup(paraPos, undefined, {
        ...para.attrs,
        alignment: "left",
        spacingBefore: 0,
        spacingAfter: 0,
        lineSpacing: null,
        indentStart: 0,
        indentEnd: 0,
        firstLineIndent: 0,
        numbering: null,
        numberingLabel: null,
        styleId: null,
      })
      if (textStyle) {
        tr = tr.removeStoredMark(textStyle)
      }
      if (link) {
        tr = tr.removeStoredMark(link)
      }
      dispatch(tr.scrollIntoView())
    }
    return true
  }
}

export function createBulletNumberingDefinition(
  id: string = BULLET_NUMBERING_ID
): NumberingDefinition {
  return {
    id,
    levels: [
      {
        level: 0,
        startAt: 1,
        format: "bullet",
        levelText: "•",
        suffix: "tab",
        alignment: "left",
        indentStart: twips(720),
        firstLineIndent: twips(-360),
        restartAfterLevel: null,
        legal: false,
      },
    ],
  }
}

export function createDecimalNumberingDefinition(
  id: string = DECIMAL_NUMBERING_ID
): NumberingDefinition {
  return {
    id,
    levels: [
      {
        level: 0,
        startAt: 1,
        format: "decimal",
        levelText: "%1.",
        suffix: "tab",
        alignment: "left",
        indentStart: twips(720),
        firstLineIndent: twips(-360),
        restartAfterLevel: null,
        legal: false,
      },
    ],
  }
}

function applyListNumbering(
  definition: NumberingDefinition,
  indentStart = 720,
  firstLineIndent = -360
): Command {
  return (state, dispatch) => {
    const { $from } = state.selection
    const depth = findNodeDepth($from, "paragraph")
    if ($from.node(depth).type.name !== "paragraph") return false
    const pos = $from.before(depth)
    if (dispatch) {
      const tr = state.tr
        .setNodeMarkup(pos, undefined, {
          ...$from.node(depth).attrs,
          numbering: { definitionId: definition.id, level: 0 },
          numberingLabel: initialNumberingLabel(definition, 0),
          indentStart,
          firstLineIndent,
        })
        .setMeta(NUMBERING_DEFINITION_META, definition)
      dispatch(tr.scrollIntoView())
    }
    return true
  }
}

/** Apply a simple bullet list to the enclosing paragraph. */
export function applyBulletList(
  definition: NumberingDefinition = createBulletNumberingDefinition()
): Command {
  return applyListNumbering(definition)
}

/** Apply a simple decimal numbered list to the enclosing paragraph. */
export function applyNumberedList(
  definition: NumberingDefinition = createDecimalNumberingDefinition()
): Command {
  return applyListNumbering(definition)
}

export function applyParagraphStyle(styleId: string | null): Command {
  return (state, dispatch) => {
    const { $from } = state.selection
    let depth = $from.depth
    while (depth > 0 && $from.node(depth).type.name !== "paragraph") depth -= 1
    if ($from.node(depth).type.name !== "paragraph") return false
    const pos = $from.before(depth)
    if (dispatch) {
      dispatch(
        state.tr.setNodeMarkup(pos, undefined, {
          ...$from.node(depth).attrs,
          styleId,
        })
      )
    }
    return true
  }
}

/**
 * Apply a concrete paragraph style definition to the active paragraph.
 *
 * ProseMirror stores resolved formatting so the editor remains WYSIWYG even
 * when a DOCX style chain is incomplete. The semantic bridge still preserves
 * the style id, allowing the writer to emit a reusable named DOCX style.
 */
export function applyDefinedParagraphStyle(
  definition: StyleDefinition
): Command {
  return (state, dispatch) => {
    if (definition.type !== "paragraph") return false
    const { $from } = state.selection
    const depth = findNodeDepth($from, "paragraph")
    if ($from.node(depth).type.name !== "paragraph") return false
    const paragraph = $from.node(depth)
    const paragraphPos = $from.before(depth)
    const paragraphStart = $from.start(depth)
    const paragraphEnd = $from.end(depth)
    const markType = state.schema.marks.textStyle

    if (dispatch) {
      let tr = state.tr.setNodeMarkup(paragraphPos, undefined, {
        ...paragraph.attrs,
        ...(definition.paragraph ?? {}),
        styleId: definition.id,
      })
      if (markType && definition.text) {
        state.doc.nodesBetween(paragraphStart, paragraphEnd, (node, pos) => {
          if (!node.isText) return
          const existing = markType.isInSet(node.marks)
          const start = Math.max(pos, paragraphStart)
          const end = Math.min(pos + node.nodeSize, paragraphEnd)
          tr = tr.addMark(
            start,
            end,
            markType.create({
              ...(existing?.attrs ?? {}),
              ...definition.text,
              styleId: definition.id,
            })
          )
        })
        if (state.selection.empty) {
          const existing = markType.isInSet(
            state.storedMarks ?? state.selection.$from.marks()
          )
          tr = tr.addStoredMark(
            markType.create({
              ...(existing?.attrs ?? {}),
              ...definition.text,
              styleId: definition.id,
            })
          )
        }
      }
      dispatch(tr.scrollIntoView())
    }
    return true
  }
}

/**
 * Match style to selection (Phase-1): sample the character formatting at the
 * selection and apply it across the enclosing paragraph so surrounding text
 * matches the selected run. If a named character styleId is present on the
 * sample, it is preserved.
 */
export function matchStyleToSelection(): Command {
  return (state, dispatch) => {
    const markType = state.schema.marks.textStyle
    if (!markType) return false
    const fromMarks = state.storedMarks ?? state.selection.$from.marks()
    let sample = markType.isInSet(fromMarks) ?? undefined
    if (!sample) {
      // Fall back to the first textStyle mark inside a non-empty selection.
      const { from, to } = state.selection
      state.doc.nodesBetween(from, to, (node) => {
        if (sample || !node.isText) return
        sample = markType.isInSet(node.marks) ?? undefined
      })
    }
    if (!sample) return false

    const { $from } = state.selection
    let depth = $from.depth
    while (depth > 0 && $from.node(depth).type.name !== "paragraph") depth -= 1
    if ($from.node(depth).type.name !== "paragraph") return false
    const paraStart = $from.start(depth)
    const paraEnd = $from.end(depth)

    if (dispatch) {
      let tr = state.tr
      tr = tr.removeMark(paraStart, paraEnd, markType)
      tr = tr.addMark(paraStart, paraEnd, markType.create({ ...sample.attrs }))
      dispatch(tr.scrollIntoView())
    }
    return true
  }
}

export function insertPageBreak(): Command {
  return (state, dispatch) => {
    const type = state.schema.nodes.page_break
    if (!type) return false
    if (dispatch) {
      dispatch(state.tr.replaceSelectionWith(type.create()).scrollIntoView())
    }
    return true
  }
}

export function insertColumnBreak(): Command {
  return (state, dispatch) => {
    const type = state.schema.nodes.column_break
    if (!type) return false
    if (dispatch) {
      dispatch(state.tr.replaceSelectionWith(type.create()).scrollIntoView())
    }
    return true
  }
}

/**
 * Insert an image and register its package asset so serializeDocx can write
 * media bytes. Asset is attached as transaction meta under IMAGE_ASSET_META;
 * the Editor merges it into SemanticDocument.assets.
 */
export function insertImage(attrs: {
  assetId: string
  src: string
  width: number
  height: number
  pixelWidth: number
  pixelHeight: number
  intrinsicRatio: number
  altText?: string
  /** Required for end-to-end DOCX media round-trip. */
  asset?: SemanticImageAsset
}): Command {
  return (state, dispatch) => {
    const type = state.schema.nodes.image
    if (!type) return false
    if (dispatch) {
      let tr = state.tr.replaceSelectionWith(
        type.create({
          assetId: attrs.assetId,
          src: attrs.src,
          width: attrs.width,
          height: attrs.height,
          pixelWidth: attrs.pixelWidth,
          pixelHeight: attrs.pixelHeight,
          intrinsicRatio: attrs.intrinsicRatio,
          altText: attrs.altText ?? "",
          preserve: true,
        })
      )
      if (attrs.asset) {
        tr = tr.setMeta(IMAGE_ASSET_META, attrs.asset)
      }
      dispatch(tr.scrollIntoView())
    }
    return true
  }
}

/** Build a SemanticImageAsset + insert command from raw image bytes. */
export function insertImageFromBytes(options: {
  bytes: Uint8Array
  mimeType:
    | "image/png"
    | "image/jpeg"
    | "image/gif"
    | "image/webp"
    | "image/avif"
    | "image/svg+xml"
  pixelWidth: number
  pixelHeight: number
  /** Display width in twips (default ~2 inches). */
  widthTwips?: number
  altText?: string
  assetId?: string
  /** PNG companion for SVG (or transcoded GIF/WebP/AVIF). */
  rasterFallback?: SemanticImageAsset["rasterFallback"]
}): { asset: SemanticImageAsset; command: Command } {
  const assetId = options.assetId ?? `img-${Date.now().toString(36)}`
  const widthTwips = options.widthTwips ?? 2880
  const ratio =
    options.pixelHeight > 0 ? options.pixelWidth / options.pixelHeight : 1
  const heightTwips = Math.max(1, Math.round(widthTwips / (ratio || 1)))
  const bytes = Array.from(options.bytes)
  const extension =
    options.mimeType === "image/png"
      ? "png"
      : options.mimeType === "image/jpeg"
        ? "jpeg"
        : options.mimeType === "image/gif"
          ? "gif"
          : options.mimeType === "image/webp"
            ? "webp"
            : options.mimeType === "image/avif"
              ? "avif"
              : "svg"
  const asset: SemanticImageAsset = {
    type: "imageAsset",
    id: assetId,
    source: { part: "editor", xmlPath: `/media/${assetId}` },
    packagePath: `word/media/${assetId}.${extension}`,
    mimeType: options.mimeType,
    bytes,
    pixelWidth: options.pixelWidth,
    pixelHeight: options.pixelHeight,
    ...(options.rasterFallback
      ? { rasterFallback: options.rasterFallback }
      : {}),
  }
  let binary = ""
  for (let i = 0; i < options.bytes.length; i += 1) {
    binary += String.fromCharCode(options.bytes[i] ?? 0)
  }
  const previewMime =
    options.mimeType === "image/svg+xml" && options.rasterFallback
      ? "image/png"
      : options.mimeType
  const previewBytes =
    options.mimeType === "image/svg+xml" && options.rasterFallback
      ? Uint8Array.from(options.rasterFallback.bytes)
      : options.bytes
  let previewBinary = ""
  for (let i = 0; i < previewBytes.length; i += 1) {
    previewBinary += String.fromCharCode(previewBytes[i] ?? 0)
  }
  const src =
    options.mimeType === "image/svg+xml" && !options.rasterFallback
      ? `data:image/svg+xml;base64,${btoa(binary)}`
      : `data:${previewMime};base64,${btoa(previewBinary || binary)}`
  return {
    asset,
    command: insertImage({
      assetId,
      src,
      width: widthTwips,
      height: heightTwips,
      pixelWidth: options.pixelWidth,
      pixelHeight: options.pixelHeight,
      intrinsicRatio: ratio,
      altText: options.altText,
      asset,
    }),
  }
}

/** Update alt text on the selected image node. */
export function setImageAltText(altText: string): Command {
  return (state, dispatch) => {
    const { $from } = state.selection
    const node = $from.nodeAfter ?? $from.nodeBefore
    const pos =
      $from.nodeAfter?.type.name === "image"
        ? $from.pos
        : $from.nodeBefore?.type.name === "image"
          ? $from.pos - $from.nodeBefore.nodeSize
          : null
    if (pos === null || node?.type.name !== "image") {
      // Also try node selection.
      const sel = state.selection as {
        node?: { type: { name: string } }
        from: number
      }
      if (sel.node?.type.name !== "image") return false
      if (dispatch) {
        dispatch(
          state.tr.setNodeMarkup(sel.from, undefined, {
            ...(state.doc.nodeAt(sel.from)?.attrs ?? {}),
            altText,
          })
        )
      }
      return true
    }
    if (dispatch) {
      dispatch(
        state.tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          altText,
        })
      )
    }
    return true
  }
}

function tablePosNearSelection(
  tr: Transaction,
  tableType: NodeType
): number | null {
  const $from = tr.selection.$from
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type === tableType) return $from.before(depth)
  }
  if (tr.doc.nodeAt(tr.selection.from)?.type === tableType) {
    return tr.selection.from
  }
  const previous = $from.nodeBefore
  if (previous?.type === tableType) {
    return tr.selection.from - previous.nodeSize
  }
  return null
}

/** Insert a simple N×M table at the selection. */
export function insertTable(
  rows = 2,
  cols = 2,
  columnWidthTwips = 2880
): Command {
  return (state, dispatch) => {
    const schema = state.schema
    const tableType = schema.nodes.table
    const rowType = schema.nodes.table_row
    const cellType = schema.nodes.table_cell
    const paragraphType = schema.nodes.paragraph
    if (!tableType || !rowType || !cellType || !paragraphType) return false
    const emptyParagraph = () => paragraphType.create(null, undefined)
    const columnWidths = Array.from({ length: cols }, () => columnWidthTwips)
    const sizing = defaultTableSizing(columnWidths)
    const cell = (columnIndex: number) =>
      cellType.create(
        {
          columnIndex,
          width: columnWidthTwips,
          colspan: 1,
          rowspan: 1,
          borderTop: DEFAULT_INSERTED_TABLE_BORDER,
          borderRight: DEFAULT_INSERTED_TABLE_BORDER,
          borderBottom: DEFAULT_INSERTED_TABLE_BORDER,
          borderLeft: DEFAULT_INSERTED_TABLE_BORDER,
          widthMode: sizing.columns[columnIndex]?.mode ?? "fill",
          minWidth: null,
          maxWidth: null,
          allowMultiline: true,
        },
        emptyParagraph()
      )
    const rowNodes = Array.from({ length: rows }, (_, rowIndex) =>
      rowType.create(
        { nodeId: `table-row-${rowIndex}` },
        Array.from({ length: cols }, (_, col) => cell(col))
      )
    )
    const table = tableType.create(
      {
        width: columnWidthTwips * cols,
        preferredWidth: columnWidthTwips * cols,
        layout: "fixed",
        columnWidths,
        tableSizing: sizing,
        borders: gridTableBorders(DEFAULT_INSERTED_TABLE_BORDER),
        repeatHeaderRowCount: 0,
      },
      rowNodes
    )
    if (dispatch) {
      const tr = state.tr.replaceSelectionWith(table)
      const tablePos = tablePosNearSelection(tr, tableType)
      if (tablePos !== null) {
        const inserted = tr.doc.nodeAt(tablePos)
        if (inserted?.type === tableType) {
          const after = tablePos + inserted.nodeSize
          if (!tr.doc.resolve(after).nodeAfter?.isTextblock) {
            tr.insert(after, emptyParagraph())
          }
          tr.setSelection(TextSelection.near(tr.doc.resolve(tablePos + 1), 1))
        }
      }
      dispatch(tr.scrollIntoView())
    }
    return true
  }
}

/** Read image asset meta from a transaction, if present. */
export function imageAssetFromTransaction(
  tr: Transaction
): SemanticImageAsset | null {
  const value = tr.getMeta(IMAGE_ASSET_META)
  return value ? (value as SemanticImageAsset) : null
}

/** Read numbering definition meta from a transaction, if present. */
export function numberingDefinitionFromTransaction(
  tr: Transaction
): NumberingDefinition | null {
  const value = tr.getMeta(NUMBERING_DEFINITION_META)
  return value ? (value as NumberingDefinition) : null
}

export type { EditorState }

export function setSectionPageSetup(options: {
  pageWidth?: number
  pageHeight?: number
  marginTop?: number
  marginRight?: number
  marginBottom?: number
  marginLeft?: number
  orientation?: "portrait" | "landscape"
}): Command {
  return (state, dispatch) => {
    const { $from } = state.selection
    let depth = $from.depth
    while (depth > 0 && $from.node(depth).type.name !== "section") depth -= 1
    if ($from.node(depth).type.name !== "section") return false
    const pos = $from.before(depth)
    if (dispatch) {
      dispatch(
        state.tr.setNodeMarkup(pos, undefined, {
          ...$from.node(depth).attrs,
          ...options,
        })
      )
    }
    return true
  }
}

/** Set the active section's column count (1 = single column). */
export function setSectionColumns(
  count: number,
  options: {
    equalWidth?: boolean
    space?: number
    separator?: boolean
    widths?: readonly number[] | null
  } = {}
): Command {
  return (state, dispatch) => {
    const { $from } = state.selection
    let depth = $from.depth
    while (depth > 0 && $from.node(depth).type.name !== "section") depth -= 1
    if ($from.node(depth).type.name !== "section") return false
    const safeCount = Number.isSafeInteger(count)
      ? Math.max(1, Math.min(12, count))
      : 1
    const pos = $from.before(depth)
    if (dispatch) {
      dispatch(
        state.tr.setNodeMarkup(pos, undefined, {
          ...$from.node(depth).attrs,
          columnCount: safeCount,
          columnEqualWidth: options.equalWidth ?? true,
          columnSpace: options.space ?? 720,
          columnSeparator: options.separator ?? false,
          columnWidths: options.widths ?? null,
        })
      )
    }
    return true
  }
}

export function setCellShading(
  fillColor: string | null,
  cellPositions?: readonly number[]
): Command {
  return (state, dispatch) => {
    const cells = resolveTableCells(state, cellPositions)
    if (cells.length === 0) return false
    if (dispatch) {
      let tr = state.tr
      for (const cell of cells) {
        const mapped = tr.mapping.map(cell.pos)
        const current = tr.doc.nodeAt(mapped) ?? cell.node
        if (
          current.type.name !== "table_cell" &&
          current.type.name !== "table_header"
        ) {
          continue
        }
        tr = tr.setNodeMarkup(mapped, undefined, {
          ...current.attrs,
          fillColor,
          background: fillColor,
        })
      }
      dispatch(tr)
    }
    return true
  }
}

export function setCellVerticalAlignment(
  verticalAlignment: "top" | "center" | "bottom",
  cellPositions?: readonly number[]
): Command {
  return (state, dispatch) => {
    const cells = resolveTableCells(state, cellPositions)
    if (cells.length === 0) return false
    if (dispatch) {
      let tr = state.tr
      for (const cell of cells) {
        const mapped = tr.mapping.map(cell.pos)
        const current = tr.doc.nodeAt(mapped) ?? cell.node
        if (
          current.type.name !== "table_cell" &&
          current.type.name !== "table_header"
        ) {
          continue
        }
        tr = tr.setNodeMarkup(mapped, undefined, {
          ...current.attrs,
          verticalAlignment,
        })
      }
      dispatch(tr)
    }
    return true
  }
}

/** Align every paragraph contained by the selected table cells. */
export function setCellHorizontalAlignment(
  alignment: "left" | "center" | "right",
  cellPositions?: readonly number[]
): Command {
  return (state, dispatch) => {
    const cells = resolveTableCells(state, cellPositions)
    if (cells.length === 0) return false
    if (dispatch) {
      let tr = state.tr
      const paragraphs: number[] = []
      for (const cell of cells) {
        cell.node.descendants((node, relativePos) => {
          if (node.type.name === "paragraph") {
            paragraphs.push(cell.pos + 1 + relativePos)
          }
          return true
        })
      }
      for (const pos of paragraphs.sort((a, b) => b - a)) {
        const mapped = tr.mapping.map(pos)
        const paragraph = tr.doc.nodeAt(mapped)
        if (paragraph?.type.name !== "paragraph") continue
        tr = tr.setNodeMarkup(mapped, undefined, {
          ...paragraph.attrs,
          alignment,
        })
      }
      dispatch(tr)
    }
    return true
  }
}

function findCellDepth($from: {
  depth: number
  node: (d: number) => PMNode
  before: (d: number) => number
}): number {
  let depth = $from.depth
  while (
    depth > 0 &&
    $from.node(depth).type.name !== "table_cell" &&
    $from.node(depth).type.name !== "table_header"
  ) {
    depth -= 1
  }
  return depth
}

function cellBorderPatch(
  side: CellBorderSide,
  border: CellBorderSpec | null
): Record<string, CellBorderSpec | null> {
  if (side === "all") {
    return {
      borderTop: border,
      borderRight: border,
      borderBottom: border,
      borderLeft: border,
    }
  }
  const attrKey = `border${side[0]?.toUpperCase()}${side.slice(1)}`
  return { [attrKey]: border }
}

function isTableCell(node: PMNode | null | undefined): node is PMNode {
  return (
    !!node &&
    (node.type.name === "table_cell" || node.type.name === "table_header")
  )
}

/** Duck-type CellSelection so a duplicated prosemirror-tables copy still works. */
function isCellSelectionLike(
  selection: EditorState["selection"]
): selection is CellSelection {
  return typeof (selection as CellSelection).forEachCell === "function"
}

function enclosingTable(
  state: EditorState
): { node: PMNode; pos: number } | null {
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

function cellsInTable(
  table: PMNode,
  tablePos: number
): { node: PMNode; pos: number; row: number; col: number }[] {
  const cells: { node: PMNode; pos: number; row: number; col: number }[] = []
  let row = 0
  table.forEach((rowNode, rowOffset) => {
    if (rowNode.type.name !== "table_row") return
    let col = 0
    rowNode.forEach((cellNode, cellOffset) => {
      if (!isTableCell(cellNode)) return
      cells.push({
        node: cellNode,
        pos: tablePos + 1 + rowOffset + 1 + cellOffset,
        row,
        col,
      })
      col += Number(cellNode.attrs.colspan ?? 1)
    })
    row += 1
  })
  return cells
}

function cellsAtPositions(
  doc: PMNode,
  positions: readonly number[]
): { node: PMNode; pos: number }[] {
  const cells: { node: PMNode; pos: number }[] = []
  const seen = new Set<number>()
  for (const pos of positions) {
    if (seen.has(pos)) continue
    const node = doc.nodeAt(pos)
    if (!isTableCell(node)) continue
    seen.add(pos)
    cells.push({ node, pos })
  }
  return cells
}

function addCellAtResolved(
  cells: { node: PMNode; pos: number }[],
  seen: Set<number>,
  $pos: {
    depth: number
    node: (d: number) => PMNode
    before: (d: number) => number
  }
): void {
  const depth = findCellDepth($pos)
  const node = $pos.node(depth)
  if (!isTableCell(node)) return
  const pos = $pos.before(depth)
  if (seen.has(pos)) return
  seen.add(pos)
  cells.push({ node, pos })
}

/**
 * Cells in a CellSelection (including a duplicated-package instance), a
 * multi-range selection, or the cell containing the caret.
 */
function selectedTableCells(
  state: EditorState
): ReadonlyArray<{ node: PMNode; pos: number }> {
  const selection = state.selection
  const cells: { node: PMNode; pos: number }[] = []
  const seen = new Set<number>()

  if (isCellSelectionLike(selection)) {
    selection.forEachCell((node, pos) => {
      if (!isTableCell(node) || seen.has(pos)) return
      seen.add(pos)
      cells.push({ node, pos })
    })
    if (cells.length > 0) return cells
  }

  for (const range of selection.ranges) {
    addCellAtResolved(cells, seen, range.$from)
    if (range.$from.pos === range.$to.pos) continue
    state.doc.nodesBetween(range.$from.pos, range.$to.pos, (node, pos) => {
      if (!isTableCell(node)) return true
      if (!seen.has(pos)) {
        seen.add(pos)
        cells.push({ node, pos })
      }
      return false
    })
  }
  if (cells.length > 0) return cells

  addCellAtResolved(cells, seen, selection.$from)
  return cells
}

export function selectedTableCellPositions(state: EditorState): number[] {
  return selectedTableCells(state).map((cell) => cell.pos)
}

function selectedCellGridInfo(state: EditorState) {
  const tableInfo = enclosingTable(state)
  if (!tableInfo) return null
  const selected = resolveTableCells(state)
  if (selected.length === 0) return null
  const selectedPositions = new Set(selected.map((cell) => cell.pos))
  const map = TableMap.get(tableInfo.node)
  const coordinates = new Map<
    number,
    { top: number; right: number; bottom: number; left: number }
  >()

  for (let row = 0; row < map.height; row += 1) {
    for (let column = 0; column < map.width; column += 1) {
      const relativePos = map.map[row * map.width + column]
      if (relativePos === undefined) continue
      const pos = tableInfo.pos + 1 + relativePos
      if (!selectedPositions.has(pos)) continue
      const current = coordinates.get(pos)
      coordinates.set(pos, {
        top: Math.min(current?.top ?? row, row),
        right: Math.max(current?.right ?? column + 1, column + 1),
        bottom: Math.max(current?.bottom ?? row + 1, row + 1),
        left: Math.min(current?.left ?? column, column),
      })
    }
  }
  if (coordinates.size === 0) return null
  const rects = [...coordinates.entries()].map(([pos, rect]) => ({ pos, rect }))
  return {
    selected,
    rects,
    bounds: {
      top: Math.min(...rects.map(({ rect }) => rect.top)),
      right: Math.max(...rects.map(({ rect }) => rect.right)),
      bottom: Math.max(...rects.map(({ rect }) => rect.bottom)),
      left: Math.min(...rects.map(({ rect }) => rect.left)),
    },
  }
}

export function selectedTableCellGrid(
  state: EditorState
): SelectedTableCellGrid {
  const info = selectedCellGridInfo(state)
  if (!info) return { rows: 1, columns: 1, cellCount: 0 }
  if (info.selected.length === 1) {
    return { rows: 1, columns: 1, cellCount: 1 }
  }
  return {
    rows: info.bounds.bottom - info.bounds.top > 1 ? 2 : 1,
    columns: info.bounds.right - info.bounds.left > 1 ? 2 : 1,
    cellCount: info.selected.length,
  }
}

export type SelectedTableSizing = Readonly<{
  sizing: TableSizing
  importedFixed: boolean
  columnCount: number
  selectedColumns: readonly number[]
  selectionKind: "cell" | "range" | "column" | "table"
}>

/** Responsive sizing state for the table and the columns touched by selection. */
export function selectedTableSizing(
  state: EditorState
): SelectedTableSizing | null {
  const tableInfo = enclosingTable(state)
  const grid = selectedCellGridInfo(state)
  if (!tableInfo || !grid) return null
  const map = TableMap.get(tableInfo.node)
  const widths = Array.isArray(tableInfo.node.attrs.columnWidths)
    ? (tableInfo.node.attrs.columnWidths as unknown[])
        .map(Number)
        .filter((width) => Number.isSafeInteger(width) && width > 0)
    : []
  if (widths.length !== map.width) return null
  const explicit = normalizeTableSizing(
    tableInfo.node.attrs.tableSizing,
    widths
  )
  const selectedColumns = Array.from(
    { length: grid.bounds.right - grid.bounds.left },
    (_, index) => grid.bounds.left + index
  )
  const wholeRows = grid.bounds.top === 0 && grid.bounds.bottom === map.height
  const wholeColumns = grid.bounds.left === 0 && grid.bounds.right === map.width
  const selectionKind =
    wholeRows && wholeColumns
      ? "table"
      : wholeRows && selectedColumns.length === 1
        ? "column"
        : grid.selected.length === 1
          ? "cell"
          : "range"
  return {
    sizing: explicit ?? importedFixedTableSizing(widths),
    importedFixed: explicit === null,
    columnCount: map.width,
    selectedColumns,
    selectionKind,
  }
}

function materializeTableSizingWidths(
  sizing: TableSizing,
  currentWidths: readonly number[]
): number[] {
  const target =
    sizing.mode === "fixed"
      ? sizing.width
      : sizing.mode === "fill"
        ? Math.max(
            sizing.width,
            currentWidths.reduce((sum, width) => sum + width, 0)
          )
        : sizing.columns.reduce((sum, column) => sum + column.width, 0)
  const widths = sizing.columns.map((column, index) =>
    column.mode === "fixed" || column.mode === "hug"
      ? column.width
      : Math.max(1, currentWidths[index] ?? column.width)
  )
  const fill = sizing.columns
    .map((column, index) => (column.mode === "fill" ? index : -1))
    .filter((index) => index >= 0)
  if (fill.length > 0) {
    const occupied = widths.reduce(
      (sum, width, index) =>
        sizing.columns[index]?.mode === "fill" ? sum : sum + width,
      0
    )
    const share = Math.max(1, Math.floor((target - occupied) / fill.length))
    for (const index of fill) {
      const column = sizing.columns[index]
      if (!column) continue
      widths[index] = Math.max(
        column.allowMultiline ? (column.minWidth ?? 1) : 1,
        Math.min(
          share,
          column.allowMultiline ? (column.maxWidth ?? share) : share
        )
      )
    }
  }
  return widths.map((width) => Math.max(1, Math.round(width)))
}

/** Apply a validated responsive sizing policy to the enclosing table. */
export function setTableSizing(sizing: TableSizing): Command {
  return (state, dispatch) => {
    const selection = selectedTableSizing(state)
    const tableInfo = enclosingTable(state)
    if (!selection || !tableInfo || tableSizingConstraintMessage(sizing)) {
      return false
    }
    if (sizing.columns.length !== selection.columnCount) return false
    const currentWidths = tableInfo.node.attrs.columnWidths as number[]
    const columnWidths = materializeTableSizingWidths(sizing, currentWidths)
    const width = columnWidths.reduce((sum, value) => sum + value, 0)
    if (!dispatch) return true
    let tr = state.tr.setNodeMarkup(tableInfo.pos, undefined, {
      ...tableInfo.node.attrs,
      tableSizing: sizing,
      columnWidths,
      width,
      preferredWidth: width,
      layout: "fixed",
    })
    tableInfo.node.descendants((node, relativePos) => {
      if (!isTableCell(node)) return
      const columnIndex = Number(node.attrs.columnIndex ?? 0)
      const span = Number(node.attrs.colspan ?? 1)
      const policies = sizing.columns.slice(columnIndex, columnIndex + span)
      const widths = columnWidths.slice(columnIndex, columnIndex + span)
      const primary = policies[0]
      if (!primary || widths.length === 0) return
      tr = tr.setNodeMarkup(tableInfo.pos + 1 + relativePos, undefined, {
        ...node.attrs,
        width: widths.reduce((sum, value) => sum + value, 0),
        colwidth: widths,
        widthMode: policies.every((policy) => policy.mode === primary.mode)
          ? primary.mode
          : "fixed",
        minWidth: primary.minWidth ?? null,
        maxWidth: primary.maxWidth ?? null,
        allowMultiline: policies.every(
          (policy) => policy.allowMultiline !== false
        ),
      })
    })
    dispatch(tr)
    return true
  }
}

export function setTableWidthMode(
  mode: TableWidthMode,
  width?: number
): Command {
  return (state, dispatch) => {
    const selected = selectedTableSizing(state)
    if (!selected) return false
    const next = withTableWidthMode(selected.sizing, mode)
    return setTableSizing({
      ...next,
      width:
        width !== undefined && Number.isSafeInteger(width) && width > 0
          ? twips(width)
          : next.width,
    })(state, dispatch)
  }
}

export function setSelectedColumnSizing(
  patch: Partial<TableColumnSizing>,
  columns?: readonly number[]
): Command {
  return (state, dispatch) => {
    const selected = selectedTableSizing(state)
    if (!selected) return false
    const targets = columns ?? selected.selectedColumns
    if (targets.length === 0) return false
    let mode = selected.sizing.mode
    const nextColumns = selected.sizing.columns.map((column, index) => {
      if (!targets.includes(index)) return column
      const allowMultiline =
        patch.allowMultiline === undefined
          ? column.allowMultiline
          : patch.allowMultiline
      return {
        ...column,
        ...patch,
        allowMultiline,
        minWidth: allowMultiline
          ? (patch.minWidth ?? column.minWidth ?? null)
          : null,
        maxWidth: allowMultiline
          ? (patch.maxWidth ?? column.maxWidth ?? null)
          : null,
      }
    })
    if (
      mode === "hug" &&
      nextColumns.some((column) => column.mode === "fill")
    ) {
      mode = "fill"
    }
    return setTableSizing({
      ...selected.sizing,
      mode,
      columns: nextColumns,
    })(state, dispatch)
  }
}

export function selectEnclosingTable(): Command {
  return (state, dispatch) => {
    const tableInfo = enclosingTable(state)
    if (!tableInfo) return false
    const map = TableMap.get(tableInfo.node)
    const first = map.map[0]
    const last = map.map[map.map.length - 1]
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

export function selectCurrentTableColumn(): Command {
  return (state, dispatch) => {
    const tableInfo = enclosingTable(state)
    const grid = selectedCellGridInfo(state)
    if (!tableInfo || !grid) return false
    const map = TableMap.get(tableInfo.node)
    const column = grid.bounds.left
    const first = map.map[column]
    const last = map.map[(map.height - 1) * map.width + column]
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

function borderSpecAttr(value: unknown): CellBorderSpec | null {
  if (!value || typeof value !== "object") return null
  const candidate = value as Partial<CellBorderSpec>
  if (
    candidate.style !== "none" &&
    candidate.style !== "single" &&
    candidate.style !== "double" &&
    candidate.style !== "dotted" &&
    candidate.style !== "dashed"
  ) {
    return null
  }
  return {
    style: candidate.style,
    color: String(candidate.color ?? "#000000"),
    width: Number(candidate.width ?? 15),
  }
}

export function selectedTableCellBorders(
  state: EditorState
): SelectedTableCellBorders {
  const info = selectedCellGridInfo(state)
  if (!info) return {}
  const cells = new Map(
    info.selected.map((cell) => [cell.pos, cell.node] as const)
  )
  const values: Record<
    Exclude<SelectedCellBorderTarget, "all">,
    CellBorderSpec[]
  > = {
    top: [],
    right: [],
    bottom: [],
    left: [],
    insideHorizontal: [],
    insideVertical: [],
  }
  const add = (
    target: keyof typeof values,
    node: PMNode | undefined,
    attr: "borderTop" | "borderRight" | "borderBottom" | "borderLeft"
  ) => {
    const spec = borderSpecAttr(node?.attrs[attr])
    if (spec) values[target].push(spec)
  }
  for (const { pos, rect } of info.rects) {
    const node = cells.get(pos)
    if (rect.top === info.bounds.top) add("top", node, "borderTop")
    if (rect.right === info.bounds.right) add("right", node, "borderRight")
    if (rect.bottom === info.bounds.bottom) add("bottom", node, "borderBottom")
    if (rect.left === info.bounds.left) add("left", node, "borderLeft")
    if (rect.top > info.bounds.top) {
      add("insideHorizontal", node, "borderTop")
    }
    if (rect.bottom < info.bounds.bottom) {
      add("insideHorizontal", node, "borderBottom")
    }
    if (rect.left > info.bounds.left) add("insideVertical", node, "borderLeft")
    if (rect.right < info.bounds.right) {
      add("insideVertical", node, "borderRight")
    }
  }
  return Object.fromEntries(
    Object.entries(values).map(([target, specs]) => [target, specs[0] ?? null])
  ) as SelectedTableCellBorders
}

function resolveTableCells(
  state: EditorState,
  cellPositions?: readonly number[]
): ReadonlyArray<{ node: PMNode; pos: number }> {
  if (cellPositions && cellPositions.length > 0) {
    const captured = cellsAtPositions(state.doc, cellPositions)
    if (captured.length > 0) return captured
  }
  return selectedTableCells(state)
}

function applyBorderPatchToCells(
  tr: Transaction,
  cells: ReadonlyArray<{ node: PMNode; pos: number }>,
  patch: Record<string, CellBorderSpec | null>
): Transaction {
  let next = tr
  const ordered = [...cells].sort((a, b) => b.pos - a.pos)
  for (const cell of ordered) {
    const mapped = next.mapping.map(cell.pos)
    const current = next.doc.nodeAt(mapped)
    if (!isTableCell(current)) continue
    next = next.setNodeMarkup(mapped, undefined, {
      ...current.attrs,
      ...patch,
    })
  }
  return next
}

export function setCellBorder(
  side: CellBorderSide,
  border: CellBorderSpec | null,
  cellPositions?: readonly number[]
): Command {
  return (state, dispatch) => {
    const cells = resolveTableCells(state, cellPositions)
    if (cells.length === 0) return false
    if (dispatch) {
      dispatch(
        applyBorderPatchToCells(state.tr, cells, cellBorderPatch(side, border))
      )
    }
    return true
  }
}

/** Convenience: solid black border on one or all sides. */
export function setCellBorderStyle(
  side: CellBorderSide,
  style: CellBorderSpec["style"] = "single",
  color = "#000000",
  widthTwips = 15,
  cellPositions?: readonly number[]
): Command {
  if (style === "none") return setCellBorder(side, null, cellPositions)
  return setCellBorder(side, { style, color, width: widthTwips }, cellPositions)
}

/**
 * Paint one outside or inside edge of the captured cell selection. Unlike
 * table border commands, a caret selection always targets only its cell.
 */
export function setSelectedCellBorderStyle(
  target: SelectedCellBorderTarget,
  style: CellBorderSpec["style"] = "single",
  color = "#000000",
  widthTwips = 15,
  cellPositions?: readonly number[]
): Command {
  const width = Number.isSafeInteger(widthTwips)
    ? widthTwips
    : Math.round(Number(widthTwips) || 15)
  const spec: CellBorderSpec | null =
    style === "none" ? null : { style, color, width: Math.max(0, width) }

  return (state, dispatch) => {
    const selection = cellPositions
      ? cellsAtPositions(state.doc, cellPositions)
      : selectedTableCells(state)
    if (selection.length === 0) return false
    const tableInfo = enclosingTable(state)
    if (!tableInfo) return false

    const selectedPositions = new Set(selection.map((cell) => cell.pos))
    const map = TableMap.get(tableInfo.node)
    const coordinates = new Map<
      number,
      { top: number; right: number; bottom: number; left: number }
    >()
    for (let row = 0; row < map.height; row += 1) {
      for (let column = 0; column < map.width; column += 1) {
        const relativePos = map.map[row * map.width + column]
        if (relativePos === undefined) continue
        const pos = tableInfo.pos + 1 + relativePos
        if (!selectedPositions.has(pos)) continue
        const current = coordinates.get(pos)
        coordinates.set(pos, {
          top: Math.min(current?.top ?? row, row),
          right: Math.max(current?.right ?? column + 1, column + 1),
          bottom: Math.max(current?.bottom ?? row + 1, row + 1),
          left: Math.min(current?.left ?? column, column),
        })
      }
    }
    if (coordinates.size === 0) return false
    if (!dispatch) return true

    const rects = [...coordinates.entries()].map(([pos, rect]) => ({
      pos,
      rect,
    }))
    const bounds = {
      top: Math.min(...rects.map(({ rect }) => rect.top)),
      right: Math.max(...rects.map(({ rect }) => rect.right)),
      bottom: Math.max(...rects.map(({ rect }) => rect.bottom)),
      left: Math.min(...rects.map(({ rect }) => rect.left)),
    }
    let tr = state.tr
    for (const { pos, rect } of rects.sort((a, b) => b.pos - a.pos)) {
      const patch: Record<string, CellBorderSpec | null> = {}
      if (target === "all") {
        Object.assign(patch, cellBorderPatch("all", spec))
      } else if (target === "top" && rect.top === bounds.top) {
        patch.borderTop = spec
      } else if (target === "right" && rect.right === bounds.right) {
        patch.borderRight = spec
      } else if (target === "bottom" && rect.bottom === bounds.bottom) {
        patch.borderBottom = spec
      } else if (target === "left" && rect.left === bounds.left) {
        patch.borderLeft = spec
      } else if (target === "insideHorizontal") {
        if (rect.top > bounds.top) patch.borderTop = spec
        if (rect.bottom < bounds.bottom) patch.borderBottom = spec
      } else if (target === "insideVertical") {
        if (rect.left > bounds.left) patch.borderLeft = spec
        if (rect.right < bounds.right) patch.borderRight = spec
      }
      if (Object.keys(patch).length === 0) continue
      const mapped = tr.mapping.map(pos)
      const current = tr.doc.nodeAt(mapped)
      if (!isTableCell(current)) continue
      tr = tr.setNodeMarkup(mapped, undefined, { ...current.attrs, ...patch })
    }
    dispatch(tr)
    return true
  }
}

function cellBorderPatchForSide(
  side: CellBorderSide,
  spec: CellBorderSpec | null,
  rect: { left: number; right: number; top: number; bottom: number },
  map: { width: number; height: number }
): Record<string, CellBorderSpec | null> | null {
  if (side === "all") {
    return {
      borderTop: spec,
      borderRight: spec,
      borderBottom: spec,
      borderLeft: spec,
    }
  }
  if (side === "top" && rect.top === 0) return { borderTop: spec }
  if (side === "bottom" && rect.bottom === map.height)
    return { borderBottom: spec }
  if (side === "left" && rect.left === 0) return { borderLeft: spec }
  if (side === "right" && rect.right === map.width) return { borderRight: spec }
  return null
}

/**
 * Apply a border style to selected cells, or to every cell in the enclosing
 * table when the caret is in a single cell / no range was captured.
 */
export function setTableBorderStyle(
  side: CellBorderSide,
  style: CellBorderSpec["style"] = "single",
  color = "#000000",
  widthTwips = 15,
  cellPositions?: readonly number[]
): Command {
  const width = Number.isSafeInteger(widthTwips)
    ? widthTwips
    : Math.round(Number(widthTwips) || 15)
  const spec: CellBorderSpec | null =
    style === "none" ? null : { style, color, width: Math.max(0, width) }
  return (state, dispatch) => {
    const tableInfo = enclosingTable(state)
    if (!tableInfo) return false
    const allCells = cellsInTable(tableInfo.node, tableInfo.pos)
    if (allCells.length === 0) return false
    const selected = resolveTableCells(state, cellPositions)
    const targets = selected.length > 1 ? selected : allCells
    const paintTableEdges = targets.length >= allCells.length
    if (!dispatch) return true

    let tr = state.tr
    if (paintTableEdges) {
      const current = (tableInfo.node.attrs
        .borders as TableBorderAttrs | null) ?? {
        top: null,
        right: null,
        bottom: null,
        left: null,
        insideHorizontal: null,
        insideVertical: null,
      }
      const tableBorder = toTableBorder(spec)
      tr = tr.setNodeMarkup(tableInfo.pos, undefined, {
        ...tableInfo.node.attrs,
        borders:
          side === "all"
            ? gridTableBorders(spec)
            : { ...current, [side]: tableBorder },
      })
    }

    if (side === "all" || selected.length > 1) {
      dispatch(
        applyBorderPatchToCells(tr, targets, cellBorderPatch(side, spec))
      )
      return true
    }

    const colCount = Math.max(
      ...allCells.map(
        (cell) => cell.col + Number(cell.node.attrs.colspan ?? 1)
      ),
      1
    )
    const rowCount = tableInfo.node.childCount
    for (const cell of allCells) {
      const rowspan = Number(cell.node.attrs.rowspan ?? 1)
      const colspan = Number(cell.node.attrs.colspan ?? 1)
      const patch = cellBorderPatchForSide(
        side,
        spec,
        {
          left: cell.col,
          right: cell.col + colspan,
          top: cell.row,
          bottom: cell.row + rowspan,
        },
        { width: colCount, height: rowCount }
      )
      if (!patch) continue
      const mapped = tr.mapping.map(cell.pos)
      const current = tr.doc.nodeAt(mapped)
      if (!isTableCell(current)) continue
      tr = tr.setNodeMarkup(mapped, undefined, {
        ...current.attrs,
        ...patch,
      })
    }
    dispatch(tr)
    return true
  }
}

/** Merge partial attributes onto the enclosing table. */
export function setTableAttrs(attrs: Record<string, unknown>): Command {
  return (state, dispatch) => {
    const { $from } = state.selection
    const depth = findNodeDepth($from, "table")
    if ($from.node(depth).type.name !== "table") return false
    const pos = $from.before(depth)
    if (dispatch) {
      let tr = state.tr.setNodeMarkup(pos, undefined, {
        ...$from.node(depth).attrs,
        ...attrs,
      })
      const columnWidths = Array.isArray(attrs.columnWidths)
        ? attrs.columnWidths.filter(
            (value): value is number =>
              typeof value === "number" && Number.isFinite(value) && value > 0
          )
        : []
      if (columnWidths.length > 0) {
        const tableNode = $from.node(depth)
        tableNode.descendants((node, relativePos) => {
          if (
            node.type.name !== "table_cell" &&
            node.type.name !== "table_header"
          ) {
            return
          }
          const columnIndex = Number(node.attrs.columnIndex ?? 0)
          const colspan = Number(node.attrs.colspan ?? 1)
          const widths = columnWidths.slice(columnIndex, columnIndex + colspan)
          if (widths.length === 0) return
          tr = tr.setNodeMarkup(pos + 1 + relativePos, undefined, {
            ...node.attrs,
            width: widths.reduce((sum, value) => sum + value, 0),
            colwidth: widths,
          })
        })
      }
      dispatch(tr)
    }
    return true
  }
}

/** Merge partial attributes onto the enclosing table row. */
export function setRowAttrs(attrs: Record<string, unknown>): Command {
  return (state, dispatch) => {
    const { $from } = state.selection
    const depth = findNodeDepth($from, "table_row")
    if ($from.node(depth).type.name !== "table_row") return false
    const pos = $from.before(depth)
    if (dispatch) {
      dispatch(
        state.tr.setNodeMarkup(pos, undefined, {
          ...$from.node(depth).attrs,
          ...attrs,
        })
      )
    }
    return true
  }
}

/** Shift-Enter inserts a soft line break inside a paragraph. */
export function insertLineBreak(): Command {
  return (state, dispatch) => {
    const type = state.schema.nodes.line_break ?? state.schema.nodes.hard_break
    if (!type) return false
    if (dispatch) {
      dispatch(state.tr.replaceSelectionWith(type.create()).scrollIntoView())
    }
    return true
  }
}

/**
 * Enter splits the block (new paragraph). Falls back to creating a nearby
 * paragraph when the selection is next to an atom (image, table edge).
 */
export const splitOrCreateParagraph: Command = chainCommands(
  newlineInCode,
  createParagraphNear,
  liftEmptyBlock,
  splitBlock
)

/**
 * Backspace: delete selection, join with previous block across paragraphs,
 * or select the previous atomic node (image / page break).
 */
export const backspaceCommand: Command = chainCommands(
  deleteSelection,
  joinBackward,
  selectNodeBackward
)

/**
 * Delete / forward-delete across block boundaries.
 */
export const deleteCommand: Command = chainCommands(
  deleteSelection,
  joinForward,
  selectNodeForward
)

/** Owned keymap: formatting + Word-like Enter/Backspace + tables + page break. */
export const editorKeymap = keymap({
  "Mod-b": toggleBold(),
  "Mod-i": toggleItalic(),
  "Mod-u": toggleUnderline(),
  /** Stub — override by inserting {@link createLinkKeymap} before this plugin. */
  "Mod-k": () => false,
  "Mod-z": undo,
  "Mod-y": redo,
  "Mod-Shift-z": redo,
  "Mod-a": selectAll,
  "Mod-Enter": insertPageBreak(),
  "Mod-Shift-Enter": insertColumnBreak(),
  "Shift-Enter": chainCommands(exitCode, insertLineBreak()),
  Enter: splitOrCreateParagraph,
  Backspace: backspaceCommand,
  "Mod-Backspace": backspaceCommand,
  Delete: deleteCommand,
  "Mod-Delete": deleteCommand,
  Tab: goToNextCell(1),
  "Shift-Tab": goToNextCell(-1),
  // Fall through to ProseMirror's base map for arrows, etc.
  ...Object.fromEntries(
    Object.entries(baseKeymap).filter(
      ([key]) =>
        ![
          "Enter",
          "Backspace",
          "Delete",
          "Mod-a",
          "Mod-Backspace",
          "Mod-Delete",
        ].includes(key)
    )
  ),
})

/**
 * Keymap plugin for insert/edit link (Mod-k). Place before {@link editorKeymap}
 * so the handler runs first.
 */
export function createLinkKeymap(openLink: Command) {
  return keymap({ "Mod-k": openLink })
}

function withResponsiveColumnMutation(
  command: Command,
  placement: "before" | "after" | "delete"
): Command {
  return (state, dispatch) => {
    const tableInfo = enclosingTable(state)
    const grid = selectedCellGridInfo(state)
    const selected = selectedTableSizing(state)
    if (!tableInfo || !grid || !selected) return command(state, dispatch)
    if (!dispatch) return command(state)
    const oldWidths = (tableInfo.node.attrs.columnWidths as number[]).map(
      Number
    )
    const first = grid.bounds.left
    const last = grid.bounds.right
    return command(state, (tr) => {
      const mappedTablePos = tr.mapping.map(tableInfo.pos)
      const nextTable = tr.doc.nodeAt(mappedTablePos)
      if (nextTable?.type.name !== "table") {
        dispatch(tr)
        return
      }
      let widths = [...oldWidths]
      let columns = [...selected.sizing.columns]
      if (placement === "delete") {
        widths.splice(first, Math.max(1, last - first))
        columns.splice(first, Math.max(1, last - first))
      } else {
        const index = placement === "before" ? first : last
        const neighbor = Math.max(0, Math.min(widths.length - 1, first))
        const width = widths[neighbor] ?? 1440
        const mode =
          selected.sizing.mode === "hug" ? ("hug" as const) : ("fill" as const)
        widths.splice(index, 0, width)
        columns.splice(index, 0, {
          mode,
          width: twips(width),
          minWidth: null,
          maxWidth: null,
          allowMultiline: true,
        })
      }
      const map = TableMap.get(nextTable)
      while (widths.length < map.width) widths.push(widths.at(-1) ?? 1440)
      while (columns.length < map.width) {
        columns.push({
          mode: selected.sizing.mode === "hug" ? "hug" : "fill",
          width: twips(widths[columns.length] ?? 1440),
          minWidth: null,
          maxWidth: null,
          allowMultiline: true,
        })
      }
      widths = widths.slice(0, map.width)
      columns = columns.slice(0, map.width)
      if (
        selected.sizing.mode !== "hug" &&
        !columns.some((column) => column.mode === "fill")
      ) {
        const final = columns.length - 1
        const finalColumn = columns[final]
        if (final >= 0 && finalColumn) {
          columns[final] = { ...finalColumn, mode: "fill" }
        }
      }
      const sizing: TableSizing = {
        ...selected.sizing,
        width: twips(widths.reduce((sum, width) => sum + width, 0)),
        columns,
      }
      tr = tr.setNodeMarkup(mappedTablePos, undefined, {
        ...nextTable.attrs,
        columnWidths: widths,
        width: sizing.width,
        preferredWidth: sizing.width,
        tableSizing: sizing,
      })
      const updatedTable = tr.doc.nodeAt(mappedTablePos)
      if (updatedTable?.type.name === "table") {
        const updatedMap = TableMap.get(updatedTable)
        updatedTable.forEach((rowNode, rowOffset) => {
          rowNode.forEach((cellNode, cellOffset) => {
            if (!isTableCell(cellNode)) return
            const relative = rowOffset + 1 + cellOffset
            const columnIndex = updatedMap.colCount(relative)
            const span = Number(cellNode.attrs.colspan ?? 1)
            const cellWidths = widths.slice(columnIndex, columnIndex + span)
            const policies = columns.slice(columnIndex, columnIndex + span)
            const primary = policies[0]
            if (!primary) return
            tr = tr.setNodeMarkup(mappedTablePos + 1 + relative, undefined, {
              ...cellNode.attrs,
              columnIndex,
              width: cellWidths.reduce((sum, width) => sum + width, 0),
              colwidth: cellWidths,
              widthMode: policies.every(
                (policy) => policy.mode === primary.mode
              )
                ? primary.mode
                : "fixed",
              minWidth: primary.minWidth ?? null,
              maxWidth: primary.maxWidth ?? null,
              allowMultiline: policies.every(
                (policy) => policy.allowMultiline !== false
              ),
            })
          })
        })
      }
      dispatch(tr)
    })
  }
}

export const tableCommands = {
  addColumnAfter: withInheritedTableCellBorders(
    withResponsiveColumnMutation(addColumnAfter, "after")
  ),
  addColumnBefore: withInheritedTableCellBorders(
    withResponsiveColumnMutation(addColumnBefore, "before")
  ),
  addRowAfter: withInheritedTableCellBorders(addRowAfter),
  addRowBefore: withInheritedTableCellBorders(addRowBefore),
  deleteColumn: withResponsiveColumnMutation(deleteColumn, "delete"),
  deleteRow,
  deleteTable,
  mergeCells,
  splitCell,
  goToNextCell,
  moveRow: moveTableRow,
  moveColumn: moveTableColumn,
}
