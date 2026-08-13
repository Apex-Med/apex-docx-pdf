import type { NodeId } from "./ids"
import type { SourceLocation } from "./diagnostics"
import type { Insets, Twip } from "./units"
import type { FontStyle, FontWeight } from "./fonts"

export type StyleId = string

export type TextStyle = Readonly<{
  fontFamily: string
  fontSize: Twip
  fontWeight: FontWeight
  fontStyle: FontStyle
  underline: boolean
  strikethrough?: boolean
  color: string
  /** Solid RGB highlight behind the run, or null for no highlight. */
  highlightColor?: string | null
  /** Word run baseline positioning; layout applies the deterministic script presentation rule. */
  verticalAlignment?: "baseline" | "superscript" | "subscript"
}>

export type StyleDefinition = Readonly<{
  id: StyleId
  name: string
  type: "paragraph" | "character"
  basedOn: StyleId | null
  next: StyleId | null
  paragraph: Partial<ParagraphProperties> | null
  text: Partial<TextStyle> | null
}>

export type DocumentStyles = Readonly<{
  defaults: Readonly<{ text: TextStyle; paragraph: ParagraphProperties }>
  definitions: readonly StyleDefinition[]
  defaultParagraphStyleId: StyleId | null
  defaultCharacterStyleId: StyleId | null
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
  /** Fully resolved text style (defaults + style chain + direct overrides). */
  style: TextStyle
  /** Named character style reference for round-trip; null/undefined means default. */
  styleId?: StyleId | null
  /** Direct run overrides applied on top of the named style chain. */
  directStyle?: Partial<TextStyle> | null
  /** External URL when this run is a hyperlink. */
  href?: string | null
  /** Internal bookmark target name when this run links in-document. */
  anchor?: string | null
}>

export type SemanticBookmark = Readonly<{
  id: string
  name: string
}>

export type SemanticImageMimeType =
  | "image/png"
  | "image/jpeg"
  | "image/gif"
  | "image/webp"
  | "image/avif"
  | "image/svg+xml"

/** Optional PNG companion stored with SVG assets for DOCX blip fallback and PDF embed. */
export type SemanticImageRasterFallback = Readonly<{
  bytes: readonly number[]
  pixelWidth: number
  pixelHeight: number
  packagePath?: string
}>

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
  /** Present for SVG (and optionally other formats) when a raster companion is known. */
  rasterFallback?: SemanticImageRasterFallback
}>

/** Font program carried by a DOCX package and available to layout/PDF export. */
export type SemanticFontAsset = Readonly<{
  type: "fontAsset"
  id: string
  source: SourceLocation
  packagePath: string
  family: string
  weight: FontWeight
  style: FontStyle
  /** De-obfuscated OpenType/TrueType bytes owned by the semantic document. */
  bytes: readonly number[]
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
  /** Floating placement retained from DrawingML; absent means inline. */
  placement?:
    | Readonly<{ type: "inline" }>
    | Readonly<{
        type: "anchor"
        offsetX: Twip
        offsetY: Twip
        horizontalRelative: "column"
        verticalRelative: "paragraph"
        wrap: "square"
      }>
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
  styleId?: StyleId | null
  directStyle?: Partial<TextStyle> | null
}>

export type SemanticBreak = Readonly<{
  type: "break"
  id: NodeId
  source: SourceLocation
  kind: "line" | "page" | "column"
}>

/** Section column layout. Null/undefined means a single full-width column. */
export type SectionColumns = Readonly<{
  count: number
  equalWidth: boolean
  space: Twip
  separator: boolean
  widths?: readonly Twip[] | null
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
  /** Fully resolved paragraph properties (defaults + style chain + direct overrides). */
  properties: ParagraphProperties
  /** Named paragraph style reference for round-trip; null/undefined means default. */
  styleId?: StyleId | null
  /** Direct paragraph overrides applied on top of the named style chain. */
  directProperties?: Partial<ParagraphProperties> | null
  /**
   * Effective formatting of the OOXML paragraph mark. Word uses this style to
   * size an otherwise empty paragraph, so it remains layout-significant even
   * when the paragraph has no text children.
   */
  paragraphMarkStyle?: TextStyle | null
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
  /** Direct cell padding override, or null to inherit `SemanticTable.cellPadding`. */
  cellPadding?: Insets | null
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
  /** Distance from the leading writable edge. Defaults to zero for older callers. */
  indentStart?: Twip
  /** Table justification. Absent values default to left for older callers. */
  alignment?: "left" | "center" | "right"
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
  /**
   * Multi-column body layout. Null/undefined means one column spanning the
   * writable page width.
   */
  columns?: SectionColumns | null
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
  /** Embedded DOCX font faces. Absent on legacy/in-memory documents. */
  fontAssets?: readonly SemanticFontAsset[]
  headers: readonly SemanticHeaderFooter[]
  footers: readonly SemanticHeaderFooter[]
  numberingDefinitions: readonly NumberingDefinition[]
  sections: readonly SemanticSection[]
  /** Named style sheet. Absent on legacy documents that only carry resolved styles. */
  styles?: DocumentStyles
  /**
   * Editor-owned custom palettes and metadata. Stored in a custom DOCX part
   * (`word/apexEditor.json`) that Word ignores harmlessly.
   */
  editorMetadata?: Readonly<Record<string, unknown>>
  /** Optional bookmark table for internal hyperlink targets. */
  bookmarks?: readonly SemanticBookmark[]
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
