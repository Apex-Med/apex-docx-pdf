import {
  createBlankDocument,
  createEmptyDocumentStyles,
  nodeId,
  resolveStyles,
  twips,
  type DocumentStyles,
  type ParagraphProperties,
  type SemanticBlock,
  type SemanticDocument,
  type SemanticHeaderFooter,
  type SemanticFontAsset,
  type SemanticImageAsset,
  type SemanticInline,
  type SemanticParagraph,
  type SemanticSection,
  type SemanticTable,
  type SemanticTableCell,
  type SemanticTableRow,
  type SectionColumns,
  type TextStyle,
} from "@apexmed/core"
import {
  Fragment,
  type Mark,
  type Node as PMNode,
  type Schema,
} from "prosemirror-model"
import { TableMap } from "prosemirror-tables"

import {
  numberingLabelForParagraph,
  type NumberingLabelState,
} from "./list-label"
import { editorSchema } from "../schema"
import { normalizeTableSizing } from "../schema/table-sizing"
import {
  definitionFromNodeAttrs,
  definitionFromPlaceholder,
  encodeTemplatePlaceholder,
  findValuePlaceholders,
  readTemplateTagMetadata,
  TEMPLATE_TAG_CARET_ZWSP,
  type TemplateTagDefinition,
} from "../tags"

type BridgeContext = Readonly<{
  assets: readonly SemanticImageAsset[]
  fontAssets: readonly SemanticFontAsset[]
  styles: DocumentStyles
  headers: readonly SemanticHeaderFooter[]
  footers: readonly SemanticHeaderFooter[]
  numberingDefinitions: SemanticDocument["numberingDefinitions"]
  editorMetadata?: Readonly<Record<string, unknown>>
  sourcePart: string
}>

function source(part: string, path: string) {
  return { part, xmlPath: path }
}

function nextId(prefix: string, counter: { n: number }): string {
  counter.n += 1
  return `${prefix}:${counter.n}`
}

function nodeIdentity(value: unknown, prefix: string, counter: { n: number }) {
  const existing = typeof value === "string" ? value.trim() : ""
  return nodeId(existing || nextId(prefix, counter))
}

function sectionColumnsFromAttrs(
  attrs: Record<string, unknown>
): SectionColumns | null {
  const count = Number(attrs.columnCount ?? 1)
  if (!Number.isSafeInteger(count) || count <= 1) {
    if (
      attrs.columnSeparator === true ||
      (Array.isArray(attrs.columnWidths) && attrs.columnWidths.length > 0)
    ) {
      // Preserve explicit one-column metadata when present.
    } else {
      return null
    }
  }
  const widths = Array.isArray(attrs.columnWidths)
    ? attrs.columnWidths.map((width) => twips(Number(width)))
    : null
  return {
    count: Math.max(1, count),
    equalWidth: attrs.columnEqualWidth !== false,
    space: twips(Number(attrs.columnSpace ?? 720)),
    separator: attrs.columnSeparator === true,
    widths,
  }
}

function sectionAttrsFromColumns(
  columns: SectionColumns | null | undefined
): Record<string, unknown> {
  if (columns === null || columns === undefined) {
    return {
      columnCount: 1,
      columnEqualWidth: true,
      columnSpace: 720,
      columnSeparator: false,
      columnWidths: null,
    }
  }
  return {
    columnCount: columns.count,
    columnEqualWidth: columns.equalWidth,
    columnSpace: columns.space,
    columnSeparator: columns.separator,
    columnWidths: columns.widths ?? null,
  }
}

function textStyleFromMarks(
  marks: readonly Mark[],
  fallback: TextStyle
): {
  style: TextStyle
  styleId: string | null
  directStyle: Partial<TextStyle> | null
} {
  const mark = marks.find((entry) => entry.type.name === "textStyle")
  if (!mark) return { style: fallback, styleId: null, directStyle: null }
  const style: TextStyle = {
    fontFamily: String(mark.attrs.fontFamily ?? fallback.fontFamily),
    fontSize: twips(Number(mark.attrs.fontSize ?? fallback.fontSize)),
    fontWeight: Number(
      mark.attrs.fontWeight ?? fallback.fontWeight
    ) as TextStyle["fontWeight"],
    fontStyle: (mark.attrs.fontStyle ??
      fallback.fontStyle) as TextStyle["fontStyle"],
    underline: Boolean(mark.attrs.underline),
    strikethrough: Boolean(mark.attrs.strikethrough),
    color: String(mark.attrs.color ?? fallback.color),
    highlightColor: (mark.attrs.highlightColor as string | null) ?? null,
    verticalAlignment:
      (mark.attrs.verticalAlignment as TextStyle["verticalAlignment"]) ??
      "baseline",
  }
  // Capture the full resolved style as direct overrides so resolveStyles()
  // preserves authoring changes when no named styleId is present.
  const directStyle: Partial<TextStyle> = { ...style }
  return {
    style,
    styleId: (mark.attrs.styleId as string | null) ?? null,
    directStyle,
  }
}

function marksFromTextStyle(
  schema: Schema,
  style: TextStyle,
  styleId?: string | null,
  href?: string | null,
  anchor?: string | null
): Mark[] {
  const type = schema.marks.textStyle
  const marks: Mark[] = []
  if (type) {
    marks.push(
      type.create({
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        fontStyle: style.fontStyle,
        underline: style.underline,
        strikethrough: style.strikethrough ?? false,
        color: style.color,
        highlightColor: style.highlightColor ?? null,
        verticalAlignment: style.verticalAlignment ?? "baseline",
        styleId: styleId ?? null,
      })
    )
  }
  const linkType = schema.marks.link
  if (linkType && href) {
    marks.push(linkType.create({ href, title: null }))
  }
  if (linkType && anchor && !href) {
    marks.push(linkType.create({ href: `#${anchor}`, title: null }))
  }
  return marks
}

function paragraphPropertiesFromNode(node: PMNode): ParagraphProperties {
  return {
    alignment:
      (node.attrs.alignment as ParagraphProperties["alignment"]) ?? "left",
    spacingBefore: twips(Number(node.attrs.spacingBefore ?? 0)),
    spacingAfter: twips(Number(node.attrs.spacingAfter ?? 0)),
    lineSpacing:
      (node.attrs.lineSpacing as ParagraphProperties["lineSpacing"]) ?? null,
    indentStart: twips(Number(node.attrs.indentStart ?? 0)),
    indentEnd: twips(Number(node.attrs.indentEnd ?? 0)),
    firstLineIndent: twips(Number(node.attrs.firstLineIndent ?? 0)),
    keepWithNext: Boolean(node.attrs.keepWithNext),
    keepLinesTogether: Boolean(node.attrs.keepLinesTogether),
    widowControl: node.attrs.widowControl !== false,
    pageBreakBefore: Boolean(node.attrs.pageBreakBefore),
    numbering:
      (node.attrs.numbering as ParagraphProperties["numbering"]) ?? null,
    tabStops: (node.attrs.tabStops as ParagraphProperties["tabStops"]) ?? [],
  }
}

function inlineFromPm(
  node: PMNode,
  schema: Schema,
  ctx: BridgeContext,
  ids: { n: number },
  path: string
): SemanticInline[] {
  if (node.isText) {
    const { style, styleId, directStyle } = textStyleFromMarks(
      node.marks,
      ctx.styles.defaults.text
    )
    const linkMark = node.marks.find((entry) => entry.type.name === "link")
    const href = linkMark ? String(linkMark.attrs.href ?? "") : null
    const text = (node.text ?? "").replaceAll(TEMPLATE_TAG_CARET_ZWSP, "")
    if (text.length === 0) return []
    return [
      {
        type: "text",
        id: nodeId(nextId("editor:text", ids)),
        source: source(ctx.sourcePart, path),
        text,
        preserveSpace: /^\s|\s$/u.test(text),
        style,
        styleId,
        directStyle,
        ...(href ? { href } : {}),
      },
    ]
  }
  if (node.type.name === "template_tag") {
    const tag = definitionFromNodeAttrs(node.attrs)
    const { style, styleId, directStyle } = textStyleFromMarks(
      marksFromTextStyle(
        schema,
        {
          fontFamily: String(node.attrs.fontFamily ?? "Inter"),
          fontSize: twips(Number(node.attrs.fontSize ?? 220)),
          fontWeight: Number(node.attrs.fontWeight ?? 400) as TextStyle["fontWeight"],
          fontStyle:
            (node.attrs.fontStyle as TextStyle["fontStyle"]) ?? "normal",
          underline: Boolean(node.attrs.underline),
          strikethrough: Boolean(node.attrs.strikethrough),
          color: String(node.attrs.color ?? "#000000"),
          highlightColor: (node.attrs.highlightColor as string | null) ?? null,
          verticalAlignment:
            (node.attrs.verticalAlignment as TextStyle["verticalAlignment"]) ??
            "baseline",
        },
        (node.attrs.styleId as string | null) ?? null
      ),
      ctx.styles.defaults.text
    )
    return [
      {
        type: "text",
        id: nodeIdentity(node.attrs.nodeId, "editor:tag", ids),
        source: source(ctx.sourcePart, path),
        text: encodeTemplatePlaceholder(tag),
        style,
        styleId,
        directStyle,
      },
    ]
  }
  if (node.type.name === "page_break") {
    return [
      {
        type: "break",
        id: nodeIdentity(node.attrs.nodeId, "editor:break", ids),
        source: source(ctx.sourcePart, path),
        kind: "page",
      },
    ]
  }
  if (node.type.name === "column_break") {
    return [
      {
        type: "break",
        id: nodeIdentity(node.attrs.nodeId, "editor:break", ids),
        source: source(ctx.sourcePart, path),
        kind: "column",
      },
    ]
  }
  if (node.type.name === "line_break" || node.type.name === "hard_break") {
    return [
      {
        type: "break",
        id: nodeIdentity(node.attrs.nodeId, "editor:break", ids),
        source: source(ctx.sourcePart, path),
        kind: "line",
      },
    ]
  }
  if (node.type.name === "tab") {
    return [
      {
        type: "tab",
        id: nodeIdentity(node.attrs.nodeId, "editor:tab", ids),
        source: source(ctx.sourcePart, path),
      },
    ]
  }
  if (node.type.name === "page_field") {
    return [
      {
        type: "pageField",
        id: nodeIdentity(node.attrs.nodeId, "editor:field", ids),
        source: source(ctx.sourcePart, path),
        field: (node.attrs.field as "PAGE" | "NUMPAGES") ?? "PAGE",
        displayText: String(node.attrs.displayText ?? "1"),
        format: "decimal",
        style: {
          fontFamily: String(node.attrs.fontFamily ?? "Inter"),
          fontSize: twips(Number(node.attrs.fontSize ?? 220)),
          fontWeight: Number(
            node.attrs.fontWeight ?? 400
          ) as TextStyle["fontWeight"],
          fontStyle:
            (node.attrs.fontStyle as TextStyle["fontStyle"]) ?? "normal",
          underline: Boolean(node.attrs.underline),
          color: String(node.attrs.color ?? "#000000"),
        },
        styleId: (node.attrs.styleId as string | null) ?? null,
        directStyle: null,
      },
    ]
  }
  if (node.type.name === "image") {
    return [
      {
        type: "image",
        id: nodeIdentity(node.attrs.nodeId, "editor:image", ids),
        source: source(ctx.sourcePart, path),
        assetId: String(node.attrs.assetId ?? ""),
        width: twips(Number(node.attrs.width ?? 1440)),
        height: twips(Number(node.attrs.height ?? 1440)),
        aspect: {
          pixelWidth: Number(node.attrs.pixelWidth ?? 1),
          pixelHeight: Number(node.attrs.pixelHeight ?? 1),
          intrinsicRatio: Number(node.attrs.intrinsicRatio ?? 1),
          preserve: Boolean(node.attrs.preserve),
        },
        placement:
          node.attrs.placementType === "anchor"
            ? {
                type: "anchor",
                offsetX: twips(Number(node.attrs.offsetX ?? 0)),
                offsetY: twips(Number(node.attrs.offsetY ?? 0)),
                horizontalRelative: "column",
                verticalRelative: "paragraph",
                wrap: "square",
              }
            : { type: "inline" },
        altText: String(node.attrs.altText ?? "") || undefined,
      },
    ]
  }
  // Nested content (shouldn't happen for inlines)
  const result: SemanticInline[] = []
  node.forEach((child, _offset, index) => {
    result.push(...inlineFromPm(child, schema, ctx, ids, `${path}/${index}`))
  })
  return result
}

function paragraphFromPm(
  node: PMNode,
  schema: Schema,
  ctx: BridgeContext,
  ids: { n: number },
  path: string
): SemanticParagraph {
  const children: SemanticInline[] = []
  node.forEach((child, _offset, index) => {
    children.push(
      ...inlineFromPm(child, schema, ctx, ids, `${path}/inline[${index + 1}]`)
    )
  })
  if (children.length === 0) {
    children.push({
      type: "text",
      id: nodeId(nextId("editor:text", ids)),
      source: source(ctx.sourcePart, path),
      text: "",
      style: ctx.styles.defaults.text,
      styleId: null,
      directStyle: null,
    })
  }
  const properties = paragraphPropertiesFromNode(node)
  // Preserve paragraph formatting through resolveStyles when no named style.
  const directProperties: Partial<ParagraphProperties> = { ...properties }
  return {
    type: "paragraph",
    id: nodeIdentity(node.attrs.nodeId, "editor:paragraph", ids),
    source: source(ctx.sourcePart, path),
    properties,
    styleId: (node.attrs.styleId as string | null) ?? null,
    directProperties,
    paragraphMarkStyle:
      (node.attrs.paragraphMarkStyle as TextStyle | null) ??
      ctx.styles.defaults.text,
    children,
  }
}

/**
 * Expand PM rowspan into vMerge restart/continue chains for a single column span.
 */
function expandRowspans(
  rows: readonly SemanticTableRow[]
): readonly SemanticTableRow[] {
  // Cells already carry verticalMerge from attrs; ensure continue chains are consistent.
  const result = rows.map((row) => ({
    ...row,
    cells: row.cells.map((cell) => ({ ...cell })),
  }))
  for (let rowIndex = 0; rowIndex < result.length; rowIndex += 1) {
    const row = result[rowIndex]!
    for (let cellIndex = 0; cellIndex < row.cells.length; cellIndex += 1) {
      const cell = row.cells[cellIndex]!
      const rowspan = Number(
        (cell as SemanticTableCell & { _rowspan?: number })._rowspan ?? 1
      )
      if (rowspan > 1) {
        row.cells[cellIndex] = { ...cell, verticalMerge: "restart" }
        for (let r = 1; r < rowspan; r += 1) {
          const target = result[rowIndex + r]
          if (!target) break
          const existing = target.cells.find(
            (entry) =>
              entry.columnIndex === cell.columnIndex &&
              entry.columnSpan === cell.columnSpan
          )
          if (existing) {
            const idx = target.cells.indexOf(existing)
            target.cells[idx] = {
              ...existing,
              verticalMerge: "continue",
              blocks: existing.blocks.length
                ? existing.blocks
                : [
                    {
                      type: "paragraph",
                      id: nodeId(`${existing.id}:continue-p`),
                      source: existing.source,
                      properties: {
                        alignment: "left",
                        spacingBefore: twips(0),
                        spacingAfter: twips(0),
                        lineSpacing: null,
                        indentStart: twips(0),
                        indentEnd: twips(0),
                        firstLineIndent: twips(0),
                        keepWithNext: false,
                        keepLinesTogether: false,
                        widowControl: true,
                        pageBreakBefore: false,
                        numbering: null,
                        tabStops: [],
                      },
                      children: [
                        {
                          type: "text",
                          id: nodeId(`${existing.id}:continue-t`),
                          source: existing.source,
                          text: "",
                          style: {
                            fontFamily: "Inter",
                            fontSize: twips(220),
                            fontWeight: 400,
                            fontStyle: "normal",
                            underline: false,
                            color: "#000000",
                          },
                        },
                      ],
                    },
                  ],
            }
          } else {
            const continuationId = `${String(cell.id)}:continue:${r}`
            const continuationBase = { ...cell } as SemanticTableCell & {
              _rowspan?: number
            }
            delete continuationBase._rowspan
            target.cells.push({
              ...continuationBase,
              id: nodeId(continuationId),
              source: target.source,
              verticalMerge: "continue",
              blocks: [
                {
                  type: "paragraph",
                  id: nodeId(`${continuationId}:p`),
                  source: target.source,
                  properties: {
                    alignment: "left",
                    spacingBefore: twips(0),
                    spacingAfter: twips(0),
                    lineSpacing: null,
                    indentStart: twips(0),
                    indentEnd: twips(0),
                    firstLineIndent: twips(0),
                    keepWithNext: false,
                    keepLinesTogether: false,
                    widowControl: true,
                    pageBreakBefore: false,
                    numbering: null,
                    tabStops: [],
                  },
                  children: [
                    {
                      type: "text",
                      id: nodeId(`${continuationId}:t`),
                      source: target.source,
                      text: "",
                      style: {
                        fontFamily: "Inter",
                        fontSize: twips(220),
                        fontWeight: 400,
                        fontStyle: "normal",
                        underline: false,
                        color: "#000000",
                      },
                    },
                  ],
                },
              ],
            })
            target.cells.sort(
              (left, right) => left.columnIndex - right.columnIndex
            )
          }
        }
      }
    }
  }
  return result
}

function cellFromPm(
  node: PMNode,
  schema: Schema,
  ctx: BridgeContext,
  ids: { n: number },
  path: string,
  columnIndex: number
): SemanticTableCell & { _rowspan?: number } {
  const blocks: SemanticParagraph[] = []
  node.forEach((child, _offset, index) => {
    if (child.type.name === "paragraph") {
      blocks.push(
        paragraphFromPm(child, schema, ctx, ids, `${path}/p[${index + 1}]`)
      )
    }
  })
  if (blocks.length === 0) {
    blocks.push(
      paragraphFromPm(
        schema.nodes.paragraph?.createAndFill()!,
        schema,
        ctx,
        ids,
        `${path}/p[1]`
      )
    )
  }
  const colspan = Number(node.attrs.colspan ?? 1)
  const rowspan = Number(node.attrs.rowspan ?? 1)
  const verticalMerge =
    rowspan > 1
      ? "restart"
      : ((node.attrs.verticalMerge as SemanticTableCell["verticalMerge"]) ??
        "none")
  return {
    type: "tableCell",
    id: nodeIdentity(node.attrs.nodeId, "editor:cell", ids),
    source: source(ctx.sourcePart, path),
    columnIndex,
    width: twips(Number(node.attrs.width ?? 1440)),
    preferredWidth:
      node.attrs.preferredWidth === null ||
      node.attrs.preferredWidth === undefined
        ? null
        : twips(Number(node.attrs.preferredWidth)),
    columnSpan: colspan,
    verticalMerge,
    verticalAlignment:
      (node.attrs
        .verticalAlignment as SemanticTableCell["verticalAlignment"]) ?? "top",
    fillColor: (node.attrs.fillColor as string | null) ?? null,
    borders: {
      top: normalizeCellBorder(node.attrs.borderTop),
      right: normalizeCellBorder(node.attrs.borderRight),
      bottom: normalizeCellBorder(node.attrs.borderBottom),
      left: normalizeCellBorder(node.attrs.borderLeft),
    },
    cellPadding:
      node.attrs.cellPadding === null || node.attrs.cellPadding === undefined
        ? null
        : (node.attrs.cellPadding as SemanticTableCell["cellPadding"]),
    blocks,
    _rowspan: rowspan,
  }
}

function normalizeCellBorder(
  value: unknown
): SemanticTableCell["borders"]["top"] {
  if (value === null || value === undefined) return null
  if (typeof value !== "object") return null
  const border = value as {
    style?: string
    color?: string
    width?: number
    space?: number
  }
  if (border.style === "none") return null
  const style = (["single", "double", "dotted", "dashed"] as const).includes(
    border.style as "single"
  )
    ? (border.style as "single" | "double" | "dotted" | "dashed")
    : "single"
  return {
    style,
    color: String(border.color ?? "#000000"),
    width: twips(Number(border.width ?? 15)),
    space: twips(Number(border.space ?? 0)),
  }
}

function normalizeTableBorders(value: unknown): SemanticTable["borders"] {
  const empty: SemanticTable["borders"] = {
    top: null,
    right: null,
    bottom: null,
    left: null,
    insideHorizontal: null,
    insideVertical: null,
  }
  if (!value || typeof value !== "object") return empty
  const borders = value as Record<string, unknown>
  return {
    top: normalizeCellBorder(borders.top),
    right: normalizeCellBorder(borders.right),
    bottom: normalizeCellBorder(borders.bottom),
    left: normalizeCellBorder(borders.left),
    insideHorizontal: normalizeCellBorder(borders.insideHorizontal),
    insideVertical: normalizeCellBorder(borders.insideVertical),
  }
}

function tableFromPm(
  node: PMNode,
  schema: Schema,
  ctx: BridgeContext,
  ids: { n: number },
  path: string
): SemanticTable {
  const tableMap = TableMap.get(node)
  const rows: SemanticTableRow[] = []
  node.forEach((rowNode, rowOffset, rowIndex) => {
    if (rowNode.type.name !== "table_row") return
    const cells: SemanticTableCell[] = []
    rowNode.forEach((cellNode, cellOffset, cellIndex) => {
      if (
        cellNode.type.name !== "table_cell" &&
        cellNode.type.name !== "table_header"
      )
        return
      const cellPosition = rowOffset + 1 + cellOffset
      const columnIndex = tableMap.colCount(cellPosition)
      const cell = cellFromPm(
        cellNode,
        schema,
        ctx,
        ids,
        `${path}/row[${rowIndex + 1}]/cell[${cellIndex + 1}]`,
        columnIndex
      )
      cells.push(cell)
    })
    rows.push({
      type: "tableRow",
      id: nodeIdentity(rowNode.attrs.nodeId, "editor:row", ids),
      source: source(ctx.sourcePart, `${path}/row[${rowIndex + 1}]`),
      repeatAsHeader: Boolean(rowNode.attrs.repeatAsHeader),
      allowBreakAcrossPages: rowNode.attrs.allowBreakAcrossPages !== false,
      height: (rowNode.attrs.height as SemanticTableRow["height"]) ?? null,
      cells,
    })
  })
  const authoredColumnWidths = (
    (node.attrs.columnWidths as number[] | undefined) ?? []
  )
    .filter((width) => Number.isSafeInteger(width) && Number(width) > 0)
    .map(twips)
  const columnWidths =
    authoredColumnWidths.length === tableMap.width
      ? authoredColumnWidths
      : (() => {
          const declaredWidth = Number(node.attrs.width ?? 0)
          const fallbackWidth = Math.max(
            1,
            Math.round(
              (Number.isSafeInteger(declaredWidth) && declaredWidth > 0
                ? declaredWidth
                : 2880 * tableMap.width) / tableMap.width
            )
          )
          return Array.from({ length: tableMap.width }, () =>
            twips(fallbackWidth)
          )
        })()
  const resolvedRows = rows.map((row) => ({
    ...row,
    cells: row.cells.map((cell) => ({
      ...cell,
      width: twips(
        columnWidths
          .slice(cell.columnIndex, cell.columnIndex + cell.columnSpan)
          .reduce((sum, columnWidth) => sum + columnWidth, 0)
      ),
    })),
  }))
  const expanded = expandRowspans(resolvedRows)
  const width = twips(columnWidths.reduce((sum, value) => sum + value, 0))
  const sizing = normalizeTableSizing(node.attrs.tableSizing, columnWidths)
  return {
    type: "table",
    id: nodeIdentity(node.attrs.nodeId, "editor:table", ids),
    source: source(ctx.sourcePart, path),
    width,
    preferredWidth:
      node.attrs.preferredWidth === null ||
      node.attrs.preferredWidth === undefined
        ? null
        : twips(Number(node.attrs.preferredWidth)),
    indentStart: twips(Number(node.attrs.indentStart ?? 0)),
    alignment:
      node.attrs.alignment === "center" || node.attrs.alignment === "right"
        ? node.attrs.alignment
        : "left",
    layout: (node.attrs.layout as "fixed" | "autofit") ?? "fixed",
    columnWidths,
    ...(sizing ? { sizing } : {}),
    borders: normalizeTableBorders(node.attrs.borders),
    cellPadding: (node.attrs.cellPadding as SemanticTable["cellPadding"]) ?? {
      top: twips(0),
      right: twips(108),
      bottom: twips(0),
      left: twips(108),
    },
    repeatHeaderRowCount: Number(node.attrs.repeatHeaderRowCount ?? 0),
    rows: expanded,
  }
}

function blockFromPm(
  node: PMNode,
  schema: Schema,
  ctx: BridgeContext,
  ids: { n: number },
  path: string
): SemanticBlock {
  if (node.type.name === "paragraph")
    return paragraphFromPm(node, schema, ctx, ids, path)
  if (node.type.name === "table")
    return tableFromPm(node, schema, ctx, ids, path)
  if (node.type.name === "horizontal_rule") {
    return {
      type: "horizontalRule",
      id: nodeIdentity(node.attrs.nodeId, "editor:hr", ids),
      source: source(ctx.sourcePart, path),
      properties: {
        alignment:
          (node.attrs.alignment as ParagraphProperties["alignment"]) ?? "left",
        spacingBefore: twips(Number(node.attrs.spacingBefore ?? 0)),
        spacingAfter: twips(Number(node.attrs.spacingAfter ?? 0)),
        lineSpacing: null,
        indentStart: twips(Number(node.attrs.indentStart ?? 0)),
        indentEnd: twips(Number(node.attrs.indentEnd ?? 0)),
        firstLineIndent: twips(Number(node.attrs.firstLineIndent ?? 0)),
        keepWithNext: Boolean(node.attrs.keepWithNext),
        keepLinesTogether: Boolean(node.attrs.keepLinesTogether),
        widowControl: node.attrs.widowControl !== false,
        pageBreakBefore: Boolean(node.attrs.pageBreakBefore),
        numbering: null,
      },
      height: twips(Number(node.attrs.height ?? 30)),
      color: String(node.attrs.color ?? "#A0A0A0"),
    }
  }
  // Fallback
  return paragraphFromPm(
    schema.nodes.paragraph?.createAndFill()!,
    schema,
    ctx,
    ids,
    path
  )
}

function sectionFromPm(
  node: PMNode,
  schema: Schema,
  ctx: BridgeContext,
  ids: { n: number },
  path: string
): SemanticSection {
  const blocks: SemanticBlock[] = []
  node.forEach((child, _offset, index) => {
    blocks.push(
      blockFromPm(child, schema, ctx, ids, `${path}/block[${index + 1}]`)
    )
  })
  return {
    type: "section",
    id: nodeIdentity(node.attrs.nodeId, "editor:section", ids),
    source: source(ctx.sourcePart, path),
    properties: {
      pageWidth: twips(Number(node.attrs.pageWidth ?? 11906)),
      pageHeight: twips(Number(node.attrs.pageHeight ?? 16838)),
      orientation:
        (node.attrs.orientation as "portrait" | "landscape") ?? "portrait",
      margins: {
        top: twips(Number(node.attrs.marginTop ?? 1440)),
        right: twips(Number(node.attrs.marginRight ?? 1440)),
        bottom: twips(Number(node.attrs.marginBottom ?? 1440)),
        left: twips(Number(node.attrs.marginLeft ?? 1440)),
      },
      headerDistance: twips(Number(node.attrs.headerDistance ?? 720)),
      footerDistance: twips(Number(node.attrs.footerDistance ?? 720)),
      columns: sectionColumnsFromAttrs(node.attrs),
    },
    defaultHeaderId: (node.attrs.defaultHeaderId as string | null) ?? null,
    defaultFooterId: (node.attrs.defaultFooterId as string | null) ?? null,
    blocks,
  }
}

/**
 * Convert a ProseMirror document to SemanticDocument (lossless for Phase-1 surface).
 */
export function toSemanticDocument(
  doc: PMNode,
  options: Readonly<{
    schema?: Schema
    assets?: readonly SemanticImageAsset[]
    fontAssets?: readonly SemanticFontAsset[]
    styles?: DocumentStyles
    headers?: readonly SemanticHeaderFooter[]
    footers?: readonly SemanticHeaderFooter[]
    numberingDefinitions?: SemanticDocument["numberingDefinitions"]
    editorMetadata?: Readonly<Record<string, unknown>>
    documentId?: string
  }> = {}
): SemanticDocument {
  const schema = options.schema ?? editorSchema
  const ctx: BridgeContext = {
    assets: options.assets ?? [],
    fontAssets: options.fontAssets ?? [],
    styles: options.styles ?? createEmptyDocumentStyles(),
    headers: options.headers ?? [],
    footers: options.footers ?? [],
    numberingDefinitions: options.numberingDefinitions ?? [],
    editorMetadata: options.editorMetadata,
    sourcePart: "editor",
  }
  const ids = { n: 0 }
  const sections: SemanticSection[] = []
  doc.forEach((child, _offset, index) => {
    if (child.type.name === "section") {
      sections.push(
        sectionFromPm(child, schema, ctx, ids, `/section[${index + 1}]`)
      )
    }
  })
  if (sections.length === 0) {
    // Treat whole doc content as a single section.
    const blocks: SemanticBlock[] = []
    doc.forEach((child, _offset, index) => {
      blocks.push(blockFromPm(child, schema, ctx, ids, `/block[${index + 1}]`))
    })
    sections.push({
      type: "section",
      id: nodeId("editor:section:1"),
      source: source("editor", "/section[1]"),
      properties: {
        pageWidth: twips(11906),
        pageHeight: twips(16838),
        orientation: "portrait",
        margins: {
          top: twips(1440),
          right: twips(1440),
          bottom: twips(1440),
          left: twips(1440),
        },
        headerDistance: twips(720),
        footerDistance: twips(720),
      },
      defaultHeaderId: null,
      defaultFooterId: null,
      blocks,
    })
  }
  const document: SemanticDocument = {
    type: "document",
    id: nodeId(options.documentId ?? "editor:document:1"),
    source: source("editor", "/"),
    assets: ctx.assets,
    fontAssets: ctx.fontAssets,
    headers: ctx.headers,
    footers: ctx.footers,
    numberingDefinitions: ctx.numberingDefinitions,
    styles: ctx.styles,
    editorMetadata: ctx.editorMetadata,
    sections,
  }
  return resolveStyles(document)
}

function pmInlinesFromSemantic(
  schema: Schema,
  children: readonly SemanticInline[],
  assets: readonly SemanticImageAsset[],
  tags: readonly TemplateTagDefinition[]
): PMNode[] {
  const result: PMNode[] = []
  const bySlug = new Map(tags.map((tag) => [tag.slug, tag]))
  for (const child of children) {
    if (child.type === "text") {
      if ((child.text ?? "").length === 0 && children.length === 1) {
        // Empty paragraph: leave empty so PM can place cursor.
        continue
      }
      if (child.text.length === 0) continue
      result.push(
        ...pmNodesFromTemplateText(schema, child, bySlug)
      )
      continue
    }
    if (child.type === "break") {
      if (child.kind === "page") {
        result.push(
          schema.nodes.page_break?.create({ nodeId: String(child.id) })
        )
      } else if (child.kind === "column") {
        result.push(
          schema.nodes.column_break?.create({ nodeId: String(child.id) })
        )
      } else {
        result.push(
          schema.nodes.line_break?.create({ nodeId: String(child.id) })
        )
      }
      continue
    }
    if (child.type === "tab") {
      result.push(schema.nodes.tab?.create({ nodeId: String(child.id) }))
      continue
    }
    if (child.type === "pageField") {
      result.push(
        schema.nodes.page_field?.create({
          nodeId: String(child.id),
          field: child.field,
          displayText: child.displayText,
          fontFamily: child.style.fontFamily,
          fontSize: child.style.fontSize,
          fontWeight: child.style.fontWeight,
          fontStyle: child.style.fontStyle,
          underline: child.style.underline,
          color: child.style.color,
          styleId: child.styleId ?? null,
        })
      )
      continue
    }
    if (child.type === "image") {
      const asset = assets.find((entry) => entry.id === child.assetId)
      let src: string | null = null
      if (asset) {
        const bytes = new Uint8Array(asset.bytes)
        let binary = ""
        for (let i = 0; i < bytes.length; i += 1)
          binary += String.fromCharCode(bytes[i]!)
        src = `data:${asset.mimeType};base64,${btoa(binary)}`
      }
      result.push(
        schema.nodes.image?.create({
          nodeId: String(child.id),
          assetId: child.assetId,
          src,
          width: child.width,
          height: child.height,
          pixelWidth: child.aspect.pixelWidth,
          pixelHeight: child.aspect.pixelHeight,
          intrinsicRatio: child.aspect.intrinsicRatio,
          preserve: child.aspect.preserve,
          placementType: child.placement?.type ?? "inline",
          offsetX:
            child.placement?.type === "anchor" ? child.placement.offsetX : 0,
          offsetY:
            child.placement?.type === "anchor" ? child.placement.offsetY : 0,
          altText: child.altText ?? "",
        })
      )
    }
  }
  return result
}

function pmNodesFromTemplateText(
  schema: Schema,
  child: Extract<SemanticInline, { type: "text" }>,
  bySlug: ReadonlyMap<string, TemplateTagDefinition>
): PMNode[] {
  const marks = marksFromTextStyle(
    schema,
    child.style,
    child.styleId,
    child.href ?? null,
    child.anchor ?? null
  )
  const matches = findValuePlaceholders(child.text)
  if (matches.length === 0) {
    return [schema.text(child.text, marks)]
  }
  const nodes: PMNode[] = []
  let cursor = 0
  for (const match of matches) {
    if (match.start > cursor) {
      nodes.push(schema.text(child.text.slice(cursor, match.start), marks))
    }
    const tag = bySlug.get(match.slug) ?? definitionFromPlaceholder(match)
    const type = schema.nodes.template_tag
    if (type && tag) {
      nodes.push(
        type.create({
          nodeId: String(child.id),
          tagId: tag.id,
          slug: tag.slug,
          kind: tag.kind,
          label: tag.label,
          datePattern: tag.date?.pattern ?? null,
          includeTime: tag.date?.includeTime ?? false,
          fontFamily: child.style.fontFamily,
          fontSize: child.style.fontSize,
          fontWeight: child.style.fontWeight,
          fontStyle: child.style.fontStyle,
          underline: child.style.underline,
          strikethrough: child.style.strikethrough ?? false,
          color: child.style.color,
          highlightColor: child.style.highlightColor ?? null,
          verticalAlignment: child.style.verticalAlignment ?? "baseline",
          styleId: child.styleId ?? null,
        })
      )
    } else {
      nodes.push(schema.text(child.text.slice(match.start, match.end), marks))
    }
    cursor = match.end
  }
  if (cursor < child.text.length) {
    nodes.push(schema.text(child.text.slice(cursor), marks))
  }
  return nodes
}

function pmParagraphFromSemantic(
  schema: Schema,
  paragraph: SemanticParagraph,
  assets: readonly SemanticImageAsset[],
  numbering?: Readonly<{
    definitions: SemanticDocument["numberingDefinitions"]
    counters: NumberingLabelState
  }>,
  tags: readonly TemplateTagDefinition[] = []
): PMNode {
  const content = pmInlinesFromSemantic(schema, paragraph.children, assets, tags)
  return schema.nodes.paragraph?.create(
    {
      nodeId: String(paragraph.id),
      alignment: paragraph.properties.alignment,
      spacingBefore: paragraph.properties.spacingBefore,
      spacingAfter: paragraph.properties.spacingAfter,
      lineSpacing: paragraph.properties.lineSpacing,
      indentStart: paragraph.properties.indentStart,
      indentEnd: paragraph.properties.indentEnd,
      firstLineIndent: paragraph.properties.firstLineIndent,
      keepWithNext: paragraph.properties.keepWithNext,
      keepLinesTogether: paragraph.properties.keepLinesTogether,
      widowControl: paragraph.properties.widowControl,
      pageBreakBefore: paragraph.properties.pageBreakBefore,
      numbering: paragraph.properties.numbering,
      numberingLabel: numbering
        ? numberingLabelForParagraph(
            paragraph.properties.numbering,
            numbering.definitions,
            numbering.counters
          )
        : null,
      tabStops: paragraph.properties.tabStops ?? [],
      styleId: paragraph.styleId ?? null,
      paragraphMarkStyle: paragraph.paragraphMarkStyle ?? null,
    },
    content
  )
}

/**
 * Collapse vMerge restart/continue chains into PM rowspan attributes.
 */
function collapseVMergeToRowspan(
  rows: readonly SemanticTableRow[]
): readonly (readonly (SemanticTableCell & { rowspan: number })[])[] {
  const skip = new Set<string>()
  return rows.map((row, rowIndex) => {
    const cells: Array<SemanticTableCell & { rowspan: number }> = []
    for (const cell of row.cells) {
      const key = `${rowIndex}:${cell.columnIndex}`
      if (skip.has(key)) continue
      if (cell.verticalMerge === "continue") continue
      let rowspan = 1
      if (cell.verticalMerge === "restart") {
        for (let r = rowIndex + 1; r < rows.length; r += 1) {
          const cont = rows[r]?.cells.find(
            (entry) =>
              entry.columnIndex === cell.columnIndex &&
              entry.columnSpan === cell.columnSpan &&
              entry.verticalMerge === "continue"
          )
          if (!cont) break
          rowspan += 1
          skip.add(`${r}:${cell.columnIndex}`)
        }
      }
      cells.push({ ...cell, rowspan })
    }
    return cells
  })
}

function pmTableFromSemantic(
  schema: Schema,
  table: SemanticTable,
  assets: readonly SemanticImageAsset[],
  numbering?: Readonly<{
    definitions: SemanticDocument["numberingDefinitions"]
    counters: NumberingLabelState
  }>,
  tags: readonly TemplateTagDefinition[] = []
): PMNode {
  const collapsed = collapseVMergeToRowspan(table.rows)
  const rowNodes = collapsed.map((cells, rowIndex) => {
    const row = table.rows[rowIndex]!
    const cellNodes = cells.map((cell) => {
      const lastColumn = cell.columnIndex + cell.columnSpan
      const borders = {
        top:
          cell.borders.top ??
          (rowIndex === 0 ? table.borders.top : table.borders.insideHorizontal),
        right:
          cell.borders.right ??
          (lastColumn >= table.columnWidths.length
            ? table.borders.right
            : table.borders.insideVertical),
        bottom:
          cell.borders.bottom ??
          (rowIndex === table.rows.length - 1
            ? table.borders.bottom
            : table.borders.insideHorizontal),
        left:
          cell.borders.left ??
          (cell.columnIndex === 0
            ? table.borders.left
            : table.borders.insideVertical),
      }
      const type =
        row.repeatAsHeader && schema.nodes.table_header
          ? schema.nodes.table_header
          : schema.nodes.table_cell
      const content = cell.blocks.map((block) =>
        pmParagraphFromSemantic(schema, block, assets, numbering, tags)
      )
      return type?.create(
        {
          nodeId: String(cell.id),
          colspan: cell.columnSpan,
          rowspan: cell.rowspan,
          colwidth: table.columnWidths
            .slice(cell.columnIndex, cell.columnIndex + cell.columnSpan)
            .map((width) => Number(width) / 15),
          columnIndex: cell.columnIndex,
          width: cell.width,
          preferredWidth: cell.preferredWidth,
          verticalMerge: cell.verticalMerge,
          verticalAlignment: cell.verticalAlignment,
          fillColor: cell.fillColor,
          borderTop: borders.top,
          borderRight: borders.right,
          borderBottom: borders.bottom,
          borderLeft: borders.left,
          cellPadding: cell.cellPadding,
          background: cell.fillColor,
          widthMode: table.sizing?.columns[cell.columnIndex]?.mode ?? "fixed",
          minWidth: table.sizing?.columns[cell.columnIndex]?.minWidth ?? null,
          maxWidth: table.sizing?.columns[cell.columnIndex]?.maxWidth ?? null,
          allowMultiline:
            table.sizing?.columns
              .slice(cell.columnIndex, cell.columnIndex + cell.columnSpan)
              .every((column) => column.allowMultiline !== false) ?? true,
        },
        content
      )
    })
    return schema.nodes.table_row?.create(
      {
        nodeId: String(row.id),
        repeatAsHeader: row.repeatAsHeader,
        allowBreakAcrossPages: row.allowBreakAcrossPages,
        height: row.height,
      },
      cellNodes
    )
  })
  return schema.nodes.table?.create(
    {
      nodeId: String(table.id),
      width: table.width,
      preferredWidth: table.preferredWidth,
      indentStart: table.indentStart ?? 0,
      alignment: table.alignment ?? "left",
      layout: table.layout,
      columnWidths: table.columnWidths.map(Number),
      tableSizing: table.sizing ?? null,
      borders: table.borders,
      cellPadding: table.cellPadding,
      repeatHeaderRowCount: table.repeatHeaderRowCount,
    },
    rowNodes
  )
}

function pmBlockFromSemantic(
  schema: Schema,
  block: SemanticBlock,
  assets: readonly SemanticImageAsset[],
  numbering?: Readonly<{
    definitions: SemanticDocument["numberingDefinitions"]
    counters: NumberingLabelState
  }>,
  tags: readonly TemplateTagDefinition[] = []
): PMNode {
  if (block.type === "paragraph")
    return pmParagraphFromSemantic(schema, block, assets, numbering, tags)
  if (block.type === "table")
    return pmTableFromSemantic(schema, block, assets, numbering, tags)
  return schema.nodes.horizontal_rule?.create({
    nodeId: String(block.id),
    height: block.height,
    color: block.color,
    alignment: block.properties.alignment,
    spacingBefore: block.properties.spacingBefore,
    spacingAfter: block.properties.spacingAfter,
    indentStart: block.properties.indentStart,
    indentEnd: block.properties.indentEnd,
    firstLineIndent: block.properties.firstLineIndent,
    keepWithNext: block.properties.keepWithNext,
    keepLinesTogether: block.properties.keepLinesTogether,
    widowControl: block.properties.widowControl,
    pageBreakBefore: block.properties.pageBreakBefore,
  })
}

/**
 * Convert SemanticDocument to a ProseMirror document node.
 */
export function fromSemanticDocument(
  document: SemanticDocument,
  options: Readonly<{ schema?: Schema }> = {}
): PMNode {
  const schema = options.schema ?? editorSchema
  const numbering = {
    definitions: document.numberingDefinitions,
    counters: new Map() as NumberingLabelState,
  }
  const tags = readTemplateTagMetadata(document.editorMetadata).tags
  const sections = document.sections.map((section) => {
    const blocks = section.blocks.map((block) =>
      pmBlockFromSemantic(schema, block, document.assets, numbering, tags)
    )
    const content =
      blocks.length > 0 ? blocks : [schema.nodes.paragraph?.createAndFill()!]
    return schema.nodes.section?.create(
      {
        nodeId: String(section.id),
        pageWidth: section.properties.pageWidth,
        pageHeight: section.properties.pageHeight,
        orientation: section.properties.orientation,
        marginTop: section.properties.margins.top,
        marginRight: section.properties.margins.right,
        marginBottom: section.properties.margins.bottom,
        marginLeft: section.properties.margins.left,
        headerDistance: section.properties.headerDistance,
        footerDistance: section.properties.footerDistance,
        defaultHeaderId: section.defaultHeaderId,
        defaultFooterId: section.defaultFooterId,
        ...sectionAttrsFromColumns(section.properties.columns),
      },
      content
    )
  })
  return schema.nodes.doc?.create(
    null,
    sections.length > 0
      ? Fragment.from(sections)
      : Fragment.from(schema.nodes.section?.createAndFill()!)
  )
}

/** Create a PM Editor document from a blank semantic document. */
export function createEmptyEditorDoc(schema: Schema = editorSchema): PMNode {
  return fromSemanticDocument(createBlankDocument(), { schema })
}
