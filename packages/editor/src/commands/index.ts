import type {
  NumberingDefinition,
  SemanticImageAsset,
  StyleDefinition,
} from "@apexmed/core"
import { twips } from "@apexmed/core"

import { initialNumberingLabel } from "../model/list-label"
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
import type { Command, EditorState, Transaction } from "prosemirror-state"
import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  deleteColumn,
  deleteRow,
  deleteTable,
  goToNextCell,
  mergeCells,
  splitCell,
} from "prosemirror-tables"

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
    binary += String.fromCharCode(options.bytes[i]!)
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
    previewBinary += String.fromCharCode(previewBytes[i]!)
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

/** Insert a simple N×M table at the selection. */
export function insertTable(
  rows = 2,
  cols = 2,
  columnWidthTwips = 2880
): Command {
  return (state, dispatch) => {
    const schema = state.schema
    if (
      !schema.nodes.table ||
      !schema.nodes.table_row ||
      !schema.nodes.table_cell
    )
      return false
    const emptyParagraph = () => schema.nodes.paragraph!.create(null, undefined)
    const cell = (columnIndex: number) =>
      schema.nodes.table_cell!.create(
        {
          columnIndex,
          width: columnWidthTwips,
          colspan: 1,
          rowspan: 1,
        },
        emptyParagraph()
      )
    const rowNodes = Array.from({ length: rows }, (_, rowIndex) =>
      schema.nodes.table_row!.create(
        { nodeId: `table-row-${rowIndex}` },
        Array.from({ length: cols }, (_, col) => cell(col))
      )
    )
    const table = schema.nodes.table!.create(
      {
        width: columnWidthTwips * cols,
        preferredWidth: columnWidthTwips * cols,
        layout: "fixed",
        columnWidths: Array.from({ length: cols }, () => columnWidthTwips),
        repeatHeaderRowCount: 0,
      },
      rowNodes
    )
    if (dispatch) {
      dispatch(state.tr.replaceSelectionWith(table).scrollIntoView())
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

export function setCellShading(fillColor: string | null): Command {
  return (state, dispatch) => {
    const { $from } = state.selection
    let depth = $from.depth
    while (
      depth > 0 &&
      $from.node(depth).type.name !== "table_cell" &&
      $from.node(depth).type.name !== "table_header"
    ) {
      depth -= 1
    }
    const node = $from.node(depth)
    if (node.type.name !== "table_cell" && node.type.name !== "table_header") {
      return false
    }
    const pos = $from.before(depth)
    if (dispatch) {
      dispatch(
        state.tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          fillColor,
          background: fillColor,
        })
      )
    }
    return true
  }
}

export function setCellVerticalAlignment(
  verticalAlignment: "top" | "center" | "bottom"
): Command {
  return (state, dispatch) => {
    const { $from } = state.selection
    const depth = findCellDepth($from)
    const node = $from.node(depth)
    if (node.type.name !== "table_cell" && node.type.name !== "table_header") {
      return false
    }
    if (dispatch) {
      dispatch(
        state.tr.setNodeMarkup($from.before(depth), undefined, {
          ...node.attrs,
          verticalAlignment,
        })
      )
    }
    return true
  }
}

export type CellBorderSpec = Readonly<{
  style: "none" | "single" | "double" | "dotted" | "dashed"
  color: string
  /** Border thickness in twips (default ~15 ≈ 0.75pt). */
  width: number
}>

export type CellBorderSide = "top" | "right" | "bottom" | "left" | "all"

function findCellDepth($from: {
  depth: number
  node: (d: number) => {
    type: { name: string }
    attrs: Record<string, unknown>
  }
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

export function setCellBorder(
  side: CellBorderSide,
  border: CellBorderSpec | null
): Command {
  return (state, dispatch) => {
    const { $from } = state.selection
    const depth = findCellDepth($from)
    const node = $from.node(depth)
    if (node.type.name !== "table_cell" && node.type.name !== "table_header") {
      return false
    }
    const pos = $from.before(depth)
    const patch: Record<string, unknown> = {}
    if (side === "all") {
      patch.borderTop = border
      patch.borderRight = border
      patch.borderBottom = border
      patch.borderLeft = border
    } else {
      const attrKey = `border${side[0]!.toUpperCase()}${side.slice(1)}`
      patch[attrKey] = border
    }
    if (dispatch) {
      dispatch(
        state.tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          ...patch,
        })
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
  widthTwips = 15
): Command {
  if (style === "none") return setCellBorder(side, null)
  return setCellBorder(side, { style, color, width: widthTwips })
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

export const tableCommands = {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  deleteColumn,
  deleteRow,
  deleteTable,
  mergeCells,
  splitCell,
  goToNextCell,
}
