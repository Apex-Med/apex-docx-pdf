import { Schema, type MarkSpec, type NodeSpec } from "prosemirror-model"
import { tableNodes } from "prosemirror-tables"

import {
  authoredColumnWidthsTwips,
  authoredTableStyle,
} from "./table-geometry"

/**
 * ProseMirror schema isomorphic to SemanticDocument for Phase-1 authoring.
 * NodeId is carried as a node attr; table cells are isolating.
 */

const textStyleMark: MarkSpec = {
  attrs: {
    fontFamily: { default: "Calibri" },
    fontSize: { default: 220 },
    fontWeight: { default: 400 },
    fontStyle: { default: "normal" },
    underline: { default: false },
    strikethrough: { default: false },
    color: { default: "#000000" },
    highlightColor: { default: null },
    verticalAlignment: { default: "baseline" },
    styleId: { default: null },
  },
  inclusive: true,
  parseDOM: [
    {
      tag: "span[data-text-style]",
      getAttrs: (dom) => {
        const el = dom as HTMLElement
        return {
          fontFamily: el.getAttribute("data-font-family") ?? "Calibri",
          fontSize: Number(el.getAttribute("data-font-size") ?? 220),
          fontWeight: Number(el.getAttribute("data-font-weight") ?? 400),
          fontStyle: el.getAttribute("data-font-style") ?? "normal",
          underline: el.getAttribute("data-underline") === "true",
          strikethrough: el.getAttribute("data-strikethrough") === "true",
          color: el.getAttribute("data-color") ?? "#000000",
          highlightColor: el.getAttribute("data-highlight") || null,
          verticalAlignment:
            el.getAttribute("data-vertical-align") ?? "baseline",
          styleId: el.getAttribute("data-style-id") || null,
        }
      },
    },
  ],
  toDOM: (mark) => {
    const textDecorations = [
      mark.attrs.underline ? "underline" : "",
      mark.attrs.strikethrough ? "line-through" : "",
    ]
      .filter(Boolean)
      .join(" ")
    return [
      "span",
      {
        "data-text-style": "true",
        "data-font-family": String(mark.attrs.fontFamily),
        "data-font-size": String(mark.attrs.fontSize),
        "data-font-weight": String(mark.attrs.fontWeight),
        "data-font-style": String(mark.attrs.fontStyle),
        "data-underline": String(mark.attrs.underline),
        "data-strikethrough": String(mark.attrs.strikethrough),
        "data-color": String(mark.attrs.color),
        "data-highlight": mark.attrs.highlightColor
          ? String(mark.attrs.highlightColor)
          : "",
        "data-vertical-align": String(mark.attrs.verticalAlignment),
        "data-style-id": mark.attrs.styleId ? String(mark.attrs.styleId) : "",
        style: [
          `font-family:${mark.attrs.fontFamily}`,
          `font-size:${Number(mark.attrs.fontSize) / 20}pt`,
          `font-weight:${mark.attrs.fontWeight}`,
          `font-style:${mark.attrs.fontStyle}`,
          textDecorations ? `text-decoration:${textDecorations}` : "",
          `color:${mark.attrs.color}`,
          mark.attrs.highlightColor
            ? `background-color:${mark.attrs.highlightColor}`
            : "",
          mark.attrs.verticalAlignment === "superscript"
            ? "vertical-align:super"
            : mark.attrs.verticalAlignment === "subscript"
              ? "vertical-align:sub"
              : "",
        ]
          .filter(Boolean)
          .join(";"),
      },
      0,
    ]
  },
}

const linkMark: MarkSpec = {
  attrs: {
    href: {},
    title: { default: null },
  },
  inclusive: false,
  parseDOM: [
    {
      tag: "a[href]",
      getAttrs: (dom) => {
        const el = dom as HTMLAnchorElement
        return {
          href: el.getAttribute("href") ?? "",
          title: el.getAttribute("title"),
        }
      },
    },
  ],
  toDOM: (mark) => [
    "a",
    {
      href: String(mark.attrs.href),
      title: mark.attrs.title ? String(mark.attrs.title) : undefined,
      target: "_blank",
      rel: "noopener noreferrer",
      class: "apex-link",
    },
    0,
  ],
}

const table = tableNodes({
  tableGroup: "block",
  cellContent: "block+",
  cellAttributes: {
    background: {
      default: null,
      getFromDOM: (dom) => (dom as HTMLElement).style.backgroundColor || null,
      setDOMAttr: (value, attrs) => {
        if (value)
          attrs.style = `${attrs.style ?? ""}background-color:${value};`
      },
    },
  },
})

/** Cell border attr: TableBorder-like or null for default/inherit. */
export type CellBorderAttr = Readonly<{
  style: "none" | "single" | "double" | "dotted" | "dashed"
  color: string
  width: number
}> | null

function borderCss(border: unknown, fallback: string): string {
  if (border === null || border === undefined) return fallback
  if (typeof border !== "object") return fallback
  const b = border as {
    style?: string
    color?: string
    width?: number
  }
  if (b.style === "none") return "none"
  const widthPt = Math.max(0.5, (Number(b.width) || 10) / 20)
  const style =
    b.style === "double"
      ? "double"
      : b.style === "dotted"
        ? "dotted"
        : b.style === "dashed"
          ? "dashed"
          : "solid"
  const color = String(b.color ?? "#000000")
  return `${widthPt}pt ${style} ${color}`
}

function cssCellVerticalAlign(value: unknown): string {
  if (value === "center") return "middle"
  if (value === "bottom" || value === "top" || value === "middle") {
    return String(value)
  }
  return ""
}

function cellDomAttrs(node: {
  attrs: Record<string, unknown>
}): Record<string, string> {
  const fill = node.attrs.fillColor ?? node.attrs.background
  const top = borderCss(node.attrs.borderTop, "none")
  const right = borderCss(node.attrs.borderRight, "none")
  const bottom = borderCss(node.attrs.borderBottom, "none")
  const left = borderCss(node.attrs.borderLeft, "none")
  const padding = node.attrs.cellPadding as
    | Readonly<{ top: number; right: number; bottom: number; left: number }>
    | null
    | undefined
  const widthTwips = Number(node.attrs.width ?? 0)
  const verticalAlign = cssCellVerticalAlign(node.attrs.verticalAlignment)
  const style = [
    fill ? `background-color:${String(fill)}` : "",
    `border-top:${top}`,
    `border-right:${right}`,
    `border-bottom:${bottom}`,
    `border-left:${left}`,
    verticalAlign ? `vertical-align:${verticalAlign}` : "",
    padding
      ? `padding:${Number(padding.top) / 20}pt ${Number(padding.right) / 20}pt ${Number(padding.bottom) / 20}pt ${Number(padding.left) / 20}pt`
      : "",
    widthTwips > 0 ? `width:${widthTwips / 20}pt` : "",
  ]
    .filter(Boolean)
    .join(";")
  const colspan = Number(node.attrs.colspan ?? 1)
  const rowspan = Number(node.attrs.rowspan ?? 1)
  const colwidth = Array.isArray(node.attrs.colwidth)
    ? node.attrs.colwidth
        .map(Number)
        .filter((width) => Number.isFinite(width) && width > 0)
    : []
  return {
    "data-node-id": node.attrs.nodeId ? String(node.attrs.nodeId) : "",
    ...(fill ? { "data-fill-color": String(fill) } : {}),
    ...(colspan > 1 ? { colspan: String(colspan) } : {}),
    ...(rowspan > 1 ? { rowspan: String(rowspan) } : {}),
    ...(colwidth.length > 0 ? { "data-colwidth": colwidth.join(",") } : {}),
    style,
  }
}

function paragraphLineHeight(value: unknown): string | null {
  if (!value || typeof value !== "object") return null
  const spacing = value as {
    rule?: string
    value240ths?: number
    value?: number
  }
  if (spacing.rule === "auto" && Number.isFinite(spacing.value240ths)) {
    const ratio = Math.max(1, Number(spacing.value240ths)) / 240
    // Word/Google single spacing (240/240) uses the face's line metrics,
    // not CSS `line-height: 1` (1em), which sits glyphs too high in the cell.
    return ratio === 1 ? "normal" : String(ratio)
  }
  if (
    (spacing.rule === "exact" || spacing.rule === "atLeast") &&
    Number.isFinite(spacing.value)
  ) {
    return `${Math.max(1, Number(spacing.value)) / 20}pt`
  }
  return null
}

// Make cells isolating and carry NodeId + per-side borders + merge metadata.
const tableCell: NodeSpec = {
  ...table.table_cell,
  isolating: true,
  attrs: {
    ...table.table_cell.attrs,
    nodeId: { default: null },
    columnIndex: { default: 0 },
    width: { default: 1440 },
    preferredWidth: { default: null },
    verticalMerge: { default: "none" },
    verticalAlignment: { default: "top" },
    fillColor: { default: null },
    borderTop: { default: null },
    borderRight: { default: null },
    borderBottom: { default: null },
    borderLeft: { default: null },
    cellPadding: { default: null },
  },
  toDOM: (node) => ["td", cellDomAttrs(node), 0],
}

const tableHeader: NodeSpec = {
  ...table.table_header,
  isolating: true,
  attrs: {
    ...table.table_header.attrs,
    nodeId: { default: null },
    columnIndex: { default: 0 },
    width: { default: 1440 },
    preferredWidth: { default: null },
    verticalMerge: { default: "none" },
    verticalAlignment: { default: "top" },
    fillColor: { default: null },
    borderTop: { default: null },
    borderRight: { default: null },
    borderBottom: { default: null },
    borderLeft: { default: null },
    cellPadding: { default: null },
  },
  toDOM: (node) => ["th", cellDomAttrs(node), 0],
}

const nodes: Record<string, NodeSpec> = {
  doc: {
    content: "section+",
  },
  section: {
    content: "block+",
    isolating: true,
    attrs: {
      nodeId: { default: null },
      pageWidth: { default: 11906 },
      pageHeight: { default: 16838 },
      orientation: { default: "portrait" },
      marginTop: { default: 1440 },
      marginRight: { default: 1440 },
      marginBottom: { default: 1440 },
      marginLeft: { default: 1440 },
      headerDistance: { default: 720 },
      footerDistance: { default: 720 },
      defaultHeaderId: { default: null },
      defaultFooterId: { default: null },
      columnCount: { default: 1 },
      columnEqualWidth: { default: true },
      columnSpace: { default: 720 },
      columnSeparator: { default: false },
      columnWidths: { default: null },
    },
    parseDOM: [{ tag: "section[data-section]" }],
    toDOM: (node) => [
      "section",
      {
        "data-section": "true",
        "data-node-id": node.attrs.nodeId ?? "",
        "data-column-count": String(node.attrs.columnCount ?? 1),
        style: [
          `width:${Number(node.attrs.pageWidth) / 20}pt`,
          `min-height:${Number(node.attrs.pageHeight) / 20}pt`,
          `padding:${Number(node.attrs.marginTop) / 20}pt ${Number(node.attrs.marginRight) / 20}pt ${Number(node.attrs.marginBottom) / 20}pt ${Number(node.attrs.marginLeft) / 20}pt`,
          Number(node.attrs.columnCount ?? 1) > 1
            ? `column-count:${Number(node.attrs.columnCount)}`
            : "",
          Number(node.attrs.columnCount ?? 1) > 1
            ? `column-gap:${Number(node.attrs.columnSpace ?? 720) / 20}pt`
            : "",
          node.attrs.columnSeparator ? "column-rule:0.75pt solid #9aa0a6" : "",
          "box-sizing:border-box",
          "background:var(--apex-page-bg,#fff)",
          "box-shadow:var(--apex-page-shadow)",
          "margin:0 auto var(--apex-page-gap,32px)",
          "position:relative",
        ].join(";"),
      },
      0,
    ],
  },
  paragraph: {
    content: "inline*",
    group: "block",
    attrs: {
      nodeId: { default: null },
      alignment: { default: "left" },
      spacingBefore: { default: 0 },
      spacingAfter: { default: 0 },
      lineSpacing: { default: null },
      indentStart: { default: 0 },
      indentEnd: { default: 0 },
      firstLineIndent: { default: 0 },
      keepWithNext: { default: false },
      keepLinesTogether: { default: false },
      widowControl: { default: true },
      pageBreakBefore: { default: false },
      numbering: { default: null },
      numberingLabel: { default: null },
      tabStops: { default: [] },
      styleId: { default: null },
      paragraphMarkStyle: { default: null },
    },
    parseDOM: [{ tag: "p" }],
    toDOM: (node) => {
      const hangingTwips = Math.abs(Number(node.attrs.firstLineIndent ?? 0))
      const marker =
        typeof node.attrs.numberingLabel === "string" &&
        node.attrs.numberingLabel.length > 0
          ? node.attrs.numberingLabel
          : ""
      return [
        "p",
        {
          "data-node-id": node.attrs.nodeId ?? "",
          "data-style-id": node.attrs.styleId ?? "",
          ...(marker.length > 0 ? { "data-list-marker": marker } : {}),
          style: [
            `text-align:${node.attrs.alignment}`,
            `margin-top:${Number(node.attrs.spacingBefore) / 20}pt`,
            `margin-bottom:${Number(node.attrs.spacingAfter) / 20}pt`,
            `padding-left:${Number(node.attrs.indentStart) / 20}pt`,
            `padding-right:${Number(node.attrs.indentEnd) / 20}pt`,
            `text-indent:${Number(node.attrs.firstLineIndent) / 20}pt`,
            hangingTwips > 0
              ? `--apex-list-hanging:${hangingTwips / 20}pt`
              : "",
            paragraphLineHeight(node.attrs.lineSpacing)
              ? `line-height:${paragraphLineHeight(node.attrs.lineSpacing)}`
              : "",
            node.attrs.pageBreakBefore ? "break-before:page" : "",
            node.attrs.paragraphMarkStyle
              ? `font-family:${String(node.attrs.paragraphMarkStyle.fontFamily)};font-size:${Number(node.attrs.paragraphMarkStyle.fontSize) / 20}pt;font-weight:${Number(node.attrs.paragraphMarkStyle.fontWeight)};font-style:${String(node.attrs.paragraphMarkStyle.fontStyle)};color:${String(node.attrs.paragraphMarkStyle.color)}`
              : "",
          ].join(";"),
        },
        0,
      ]
    },
  },
  horizontal_rule: {
    group: "block",
    attrs: {
      nodeId: { default: null },
      height: { default: 30 },
      color: { default: "#A0A0A0" },
      alignment: { default: "left" },
      spacingBefore: { default: 0 },
      spacingAfter: { default: 0 },
      indentStart: { default: 0 },
      indentEnd: { default: 0 },
      firstLineIndent: { default: 0 },
      keepWithNext: { default: false },
      keepLinesTogether: { default: false },
      widowControl: { default: true },
      pageBreakBefore: { default: false },
    },
    parseDOM: [{ tag: "hr" }],
    toDOM: (node) => [
      "hr",
      {
        "data-node-id": node.attrs.nodeId ?? "",
        style: `border:none;border-top:1.5pt solid ${node.attrs.color};margin:6pt 0;`,
      },
    ],
  },
  table: {
    ...table.table,
    attrs: {
      ...table.table.attrs,
      nodeId: { default: null },
      width: { default: 0 },
      preferredWidth: { default: null },
      indentStart: { default: 0 },
      layout: { default: "fixed" },
      alignment: { default: "left" },
      columnWidths: { default: [] },
      borders: { default: null },
      cellPadding: {
        default: { top: 0, right: 108, bottom: 0, left: 108 },
      },
      repeatHeaderRowCount: { default: 0 },
    },
    toDOM: (node) => {
      const columnWidths = authoredColumnWidthsTwips(node.attrs)
      const colgroup =
        columnWidths.length > 0
          ? [
              "colgroup",
              ...columnWidths.map((columnWidth) => [
                "col",
                { style: `width:${columnWidth / 20}pt` },
              ]),
            ]
          : null
      return [
        "table",
        {
          "data-node-id": node.attrs.nodeId ?? "",
          style: authoredTableStyle(node.attrs),
        },
        ...(colgroup ? [colgroup] : []),
        ["tbody", 0],
      ]
    },
  },
  table_row: {
    ...table.table_row,
    attrs: {
      ...table.table_row.attrs,
      nodeId: { default: null },
      repeatAsHeader: { default: false },
      allowBreakAcrossPages: { default: true },
      height: { default: null },
    },
    toDOM: (node) => {
      const height = node.attrs.height as {
        rule?: string
        value?: number
      } | null
      const heightPt =
        height && Number.isFinite(height.value)
          ? `${Number(height.value) / 20}pt`
          : ""
      return [
        "tr",
        {
          "data-node-id": node.attrs.nodeId ?? "",
          style: heightPt
            ? `height:${heightPt};--apex-row-height:${heightPt}`
            : "",
        },
        0,
      ]
    },
  },
  table_cell: tableCell,
  table_header: tableHeader,
  image: {
    inline: true,
    group: "inline",
    draggable: true,
    attrs: {
      nodeId: { default: null },
      assetId: { default: null },
      src: { default: null },
      width: { default: 1440 },
      height: { default: 1440 },
      pixelWidth: { default: 1 },
      pixelHeight: { default: 1 },
      intrinsicRatio: { default: 1 },
      preserve: { default: false },
      placementType: { default: "inline" },
      offsetX: { default: 0 },
      offsetY: { default: 0 },
      altText: { default: "" },
    },
    parseDOM: [
      {
        tag: "img[src]",
        getAttrs: (dom) => {
          const el = dom as HTMLImageElement
          return {
            src: el.getAttribute("src"),
            altText: el.getAttribute("alt") ?? "",
          }
        },
      },
    ],
    toDOM: (node) => [
      "img",
      {
        src: node.attrs.src ?? "",
        alt: node.attrs.altText ?? "",
        "data-node-id": node.attrs.nodeId ?? "",
        "data-asset-id": node.attrs.assetId ?? "",
        style: `width:${Number(node.attrs.width) / 20}pt;height:${Number(node.attrs.height) / 20}pt;`,
      },
    ],
  },
  page_break: {
    inline: true,
    group: "inline",
    atom: true,
    selectable: true,
    attrs: { nodeId: { default: null } },
    parseDOM: [{ tag: "span[data-page-break]" }],
    toDOM: (node) => [
      "span",
      {
        "data-page-break": "true",
        "data-node-id": node.attrs.nodeId ?? "",
        contenteditable: "false",
        // Visual page gap is styled in editor.css (not a dashed hairline).
        class: "apex-manual-page-break",
      },
    ],
  },
  column_break: {
    inline: true,
    group: "inline",
    atom: true,
    selectable: true,
    attrs: { nodeId: { default: null } },
    parseDOM: [{ tag: "span[data-column-break]" }],
    toDOM: (node) => [
      "span",
      {
        "data-column-break": "true",
        "data-node-id": node.attrs.nodeId ?? "",
        contenteditable: "false",
        class: "apex-manual-column-break",
      },
    ],
  },
  line_break: {
    inline: true,
    group: "inline",
    atom: true,
    attrs: { nodeId: { default: null } },
    parseDOM: [{ tag: "br" }],
    toDOM: () => ["br"],
  },
  tab: {
    inline: true,
    group: "inline",
    atom: true,
    attrs: { nodeId: { default: null } },
    parseDOM: [{ tag: "span[data-tab]" }],
    toDOM: () => [
      "span",
      {
        "data-tab": "true",
        style: "display:inline-block;width:2em;",
      },
    ],
  },
  page_field: {
    inline: true,
    group: "inline",
    atom: true,
    attrs: {
      nodeId: { default: null },
      field: { default: "PAGE" },
      displayText: { default: "1" },
      fontFamily: { default: "Calibri" },
      fontSize: { default: 220 },
      fontWeight: { default: 400 },
      fontStyle: { default: "normal" },
      underline: { default: false },
      color: { default: "#000000" },
      styleId: { default: null },
    },
    parseDOM: [{ tag: "span[data-page-field]" }],
    toDOM: (node) => [
      "span",
      {
        "data-page-field": String(node.attrs.field),
        "data-node-id": node.attrs.nodeId ?? "",
        contenteditable: "false",
      },
      String(node.attrs.displayText),
    ],
  },
  text: { group: "inline" },
  hard_break: {
    inline: true,
    group: "inline",
    selectable: false,
    parseDOM: [{ tag: "br" }],
    toDOM: () => ["br"],
  },
}

const marks: Record<string, MarkSpec> = {
  textStyle: textStyleMark,
  link: linkMark,
}

export const editorSchema = new Schema({ nodes, marks })

export type EditorSchema = typeof editorSchema
