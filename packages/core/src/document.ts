import type { NodeId } from "./ids"
import type { SourceLocation } from "./diagnostics"
import type { Insets, Twip } from "./units"
import type { FontStyle, FontWeight } from "./fonts"

export type TextStyle = Readonly<{
  fontFamily: string
  fontSize: Twip
  fontWeight: FontWeight
  fontStyle: FontStyle
  underline: boolean
  color: string
  /** Solid RGB highlight behind the run, or null for no highlight. */
  highlightColor?: string | null
  /** Word run baseline positioning; layout applies the deterministic script presentation rule. */
  verticalAlignment?: "baseline" | "superscript" | "subscript"
}>

export type ParagraphTabStop = Readonly<{
  /** Position from the writable area's leading margin. */
  position: Twip
  alignment: "left"
}>

export type LineSpacing =
  | Readonly<{ rule: "auto"; value240ths: number }>
  | Readonly<{ rule: "exact" | "atLeast"; value: Twip }>
  | null

export type NumberingFormat =
  | "bullet"
  | "decimal"
  | "lowerLetter"
  | "upperLetter"
  | "lowerRoman"
  | "upperRoman"

export type NumberingLevelDefinition = Readonly<{
  level: number
  startAt: number
  format: NumberingFormat
  /** OOXML level text with one-based `%1` through `%9` counter tokens. */
  levelText: string
  suffix: "tab" | "space" | "nothing"
  alignment: "left" | "center" | "right"
  indentStart: Twip
  firstLineIndent: Twip
  /** Null means the level never restarts because of a higher-level counter. */
  restartAfterLevel: number | null
  /** Formats referenced ancestor counters as decimal for legal numbering. */
  legal: boolean
}>

export type NumberingDefinition = Readonly<{
  id: string
  levels: readonly NumberingLevelDefinition[]
}>

export type ParagraphNumbering = Readonly<{
  definitionId: string
  level: number
}>

export type ParagraphProperties = Readonly<{
  alignment: "left" | "center" | "right" | "justify"
  spacingBefore: Twip
  spacingAfter: Twip
  lineSpacing: LineSpacing
  indentStart: Twip
  indentEnd: Twip
  /** A negative value represents hanging indentation. */
  firstLineIndent: Twip
  keepWithNext: boolean
  keepLinesTogether: boolean
  widowControl: boolean
  pageBreakBefore: boolean
  numbering: ParagraphNumbering | null
  /** Ordered explicit left tab stops; tabs without a following stop are invalid. */
  tabStops?: readonly ParagraphTabStop[]
}>

export type SemanticText = Readonly<{
  type: "text"
  id: NodeId
  source: SourceLocation
  text: string
  /** Retains significant leading and trailing whitespace from `xml:space="preserve"`. */
  preserveSpace?: boolean
  style: TextStyle
}>

export type SemanticImageMimeType = "image/png" | "image/jpeg"

/** Package-owned bytes. Arrays, rather than typed arrays, make deep immutability enforceable. */
export type SemanticImageAsset = Readonly<{
  type: "imageAsset"
  id: string
  source: SourceLocation
  packagePath: string
  mimeType: SemanticImageMimeType
  bytes: readonly number[]
  pixelWidth: number
  pixelHeight: number
}>

export type SemanticImage = Readonly<{
  type: "image"
  id: NodeId
  source: SourceLocation
  assetId: string
  width: Twip
  height: Twip
  aspect: Readonly<{
    pixelWidth: number
    pixelHeight: number
    intrinsicRatio: number
    /** True only when DrawingML explicitly locks aspect ratio and the extent agrees. */
    preserve: boolean
  }>
  /** Author-provided alternative text for dynamic images, when available. */
  altText?: string
}>

export type PageFieldKind = "PAGE" | "NUMPAGES"

export type SemanticPageField = Readonly<{
  type: "pageField"
  id: NodeId
  source: SourceLocation
  field: PageFieldKind
  /** Cached Word display text; layout replaces this with the current value. */
  displayText: string
  format: "decimal"
  style: TextStyle
}>

export type SemanticBreak = Readonly<{
  type: "break"
  id: NodeId
  source: SourceLocation
  kind: "line" | "page"
}>

export type SemanticTab = Readonly<{
  type: "tab"
  id: NodeId
  source: SourceLocation
}>

export type SemanticInline =
  SemanticText | SemanticImage | SemanticPageField | SemanticBreak | SemanticTab

export type SemanticParagraph = Readonly<{
  type: "paragraph"
  id: NodeId
  source: SourceLocation
  properties: ParagraphProperties
  children: readonly SemanticInline[]
}>

export type TableLayout = "fixed" | "autofit"

export type TableBorderStyle =
  "none" | "single" | "double" | "dotted" | "dashed"

export type TableBorder = Readonly<{
  style: TableBorderStyle
  color: string
  /** Border thickness, rounded from OOXML eighth-points to integer twips. */
  width: Twip
  /** Distance between the border and cell content. */
  space: Twip
}>

export type TableBorders = Readonly<{
  top: TableBorder | null
  right: TableBorder | null
  bottom: TableBorder | null
  left: TableBorder | null
  insideHorizontal: TableBorder | null
  insideVertical: TableBorder | null
}>

/** Direct cell borders. Null means the side is not directly specified. */
export type TableCellBorders = Readonly<{
  top: TableBorder | null
  right: TableBorder | null
  bottom: TableBorder | null
  left: TableBorder | null
}>

export type SemanticTableCell = Readonly<{
  type: "tableCell"
  id: NodeId
  source: SourceLocation
  /** Zero-based index into the table grid. */
  columnIndex: number
  /** Deterministic width computed from the spanned grid columns. */
  width: Twip
  /** Declared `tcW`, or null when absent/auto. */
  preferredWidth: Twip | null
  columnSpan: number
  verticalMerge: "none" | "restart" | "continue"
  verticalAlignment: "top" | "center" | "bottom"
  /** Solid RGB fill, or null for no cell shading. */
  fillColor: string | null
  /** Direct borders override the corresponding table or shared-grid edge. */
  borders: TableCellBorders
  blocks: readonly SemanticParagraph[]
}>

export type SemanticTableRow = Readonly<{
  type: "tableRow"
  id: NodeId
  source: SourceLocation
  /** Header rows repeat when a table crosses a page boundary. */
  repeatAsHeader: boolean
  /** False corresponds to WordprocessingML `cantSplit`. */
  allowBreakAcrossPages: boolean
  height: Readonly<{ rule: "exact" | "atLeast"; value: Twip }> | null
  cells: readonly SemanticTableCell[]
}>

export type SemanticTable = Readonly<{
  type: "table"
  id: NodeId
  source: SourceLocation
  /** Effective integer width. Auto widths resolve to the grid-column sum. */
  width: Twip
  /** Declared `tblW`, or null when absent/auto. */
  preferredWidth: Twip | null
  layout: TableLayout
  columnWidths: readonly Twip[]
  borders: TableBorders
  cellPadding: Insets
  /** Number of contiguous leading rows marked to repeat on every page. */
  repeatHeaderRowCount: number
  rows: readonly SemanticTableRow[]
}>

export type SemanticHorizontalRule = Readonly<{
  type: "horizontalRule"
  id: NodeId
  /** Links the emitted line directly to the accepted w:pict/v:rect source. */
  source: SourceLocation
  properties: ParagraphProperties
  /** The exact K3 VML profile is a 1.5-point-high rule block. */
  height: Twip
  color: string
}>

export type SemanticBlock =
  SemanticParagraph | SemanticTable | SemanticHorizontalRule

export type SectionProperties = Readonly<{
  pageWidth: Twip
  pageHeight: Twip
  orientation: "portrait" | "landscape"
  margins: Insets
  /** Distance from the page edge to the header reference line. */
  headerDistance: Twip
  /** Distance from the page edge to the footer reference line. */
  footerDistance: Twip
}>

export type HeaderFooterId = string

export type SemanticHeaderFooter = Readonly<{
  type: "header" | "footer"
  id: HeaderFooterId
  source: SourceLocation
  blocks: readonly SemanticParagraph[]
}>

export type SemanticSection = Readonly<{
  type: "section"
  id: NodeId
  source: SourceLocation
  properties: SectionProperties
  defaultHeaderId: HeaderFooterId | null
  defaultFooterId: HeaderFooterId | null
  blocks: readonly SemanticBlock[]
}>

export type SemanticDocument = Readonly<{
  type: "document"
  id: NodeId
  source: SourceLocation
  assets: readonly SemanticImageAsset[]
  headers: readonly SemanticHeaderFooter[]
  footers: readonly SemanticHeaderFooter[]
  numberingDefinitions: readonly NumberingDefinition[]
  sections: readonly SemanticSection[]
}>

export type ResolvedText = SemanticText
export type ResolvedInline = SemanticInline
export type ResolvedParagraph = Omit<SemanticParagraph, "children"> & {
  readonly children: readonly ResolvedInline[]
}
export type ResolvedTableCell = Omit<SemanticTableCell, "blocks"> & {
  readonly blocks: readonly ResolvedParagraph[]
}
export type ResolvedTableRow = Omit<SemanticTableRow, "cells"> & {
  readonly cells: readonly ResolvedTableCell[]
}
export type ResolvedTable = Omit<SemanticTable, "rows"> & {
  readonly rows: readonly ResolvedTableRow[]
}
export type ResolvedHorizontalRule = SemanticHorizontalRule
export type ResolvedBlock =
  ResolvedParagraph | ResolvedTable | ResolvedHorizontalRule
export type ResolvedSection = Omit<SemanticSection, "blocks"> & {
  readonly blocks: readonly ResolvedBlock[]
}
export type ResolvedDocument = Omit<SemanticDocument, "sections"> & {
  readonly sections: readonly ResolvedSection[]
}
