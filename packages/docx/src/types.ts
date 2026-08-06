import type {
  Diagnostic,
  FontStyle,
  FontWeight,
  NumberingFormat,
  PageFieldKind,
  SemanticImageMimeType,
  SourceLocation,
} from "@apexmed/core"

/**
 * The OOXML-shaped representation owned by this package.  It deliberately
 * exposes only the supported WordprocessingML vocabulary; consumers should
 * use `normaliseDocx` before crossing into the semantic pipeline.
 */
export type ParsedDocxText = Readonly<{
  type: "docx-text"
  text: string
  preserveSpace: boolean
  source: SourceLocation
}>

export type ParsedDocxImage = Readonly<{
  type: "docx-image"
  source: SourceLocation
  assetId: string
  widthTwips: number
  heightTwips: number
  pixelWidth: number
  pixelHeight: number
  intrinsicRatio: number
  preserveAspect: boolean
}>

export type ParsedDocxPageField = Readonly<{
  type: "docx-page-field"
  source: SourceLocation
  field: PageFieldKind
  displayText: string
}>

export type ParsedDocxBreak = Readonly<{
  type: "docx-break"
  source: SourceLocation
  kind: "line" | "page"
}>

export type ParsedDocxTab = Readonly<{
  type: "docx-tab"
  source: SourceLocation
}>

export type ParsedDocxInline =
  | ParsedDocxText
  | ParsedDocxImage
  | ParsedDocxPageField
  | ParsedDocxBreak
  | ParsedDocxTab

export type ParsedDocxRunProperties = Readonly<{
  fontFamily: string
  fontSizeHalfPoints: number
  fontWeight: FontWeight
  fontStyle: FontStyle
  underline: boolean
  color: string
  highlightColor: string | null
  verticalAlignment: "baseline" | "superscript" | "subscript"
}>

export type ParsedDocxLineSpacing =
  | Readonly<{ rule: "auto"; value240ths: number }>
  | Readonly<{ rule: "exact" | "atLeast"; valueTwips: number }>
  | null

export type ParsedDocxRun = Readonly<{
  type: "docx-run"
  source: SourceLocation
  properties: ParsedDocxRunProperties
  inlines: readonly ParsedDocxInline[]
  texts: readonly ParsedDocxText[]
}>

export type ParsedDocxParagraphProperties = Readonly<{
  alignment: "left" | "center" | "right" | "justify"
  spacingBefore: number
  spacingAfter: number
  lineSpacing: ParsedDocxLineSpacing
  indentStart: number
  indentEnd: number
  firstLineIndent: number
  keepWithNext: boolean
  keepLinesTogether: boolean
  widowControl: boolean
  pageBreakBefore: boolean
  numbering: ParsedDocxParagraphNumbering | null
  tabStops: readonly Readonly<{ position: number; alignment: "left" }>[]
}>

export type ParsedDocxParagraphNumbering = Readonly<{
  definitionId: string
  level: number
}>

export type ParsedDocxNumberingLevelDefinition = Readonly<{
  level: number
  startAt: number
  format: NumberingFormat
  levelText: string
  suffix: "tab" | "space" | "nothing"
  alignment: "left" | "center" | "right"
  indentStart: number
  firstLineIndent: number
  restartAfterLevel: number | null
  legal: boolean
}>

export type ParsedDocxNumberingDefinition = Readonly<{
  id: string
  levels: readonly ParsedDocxNumberingLevelDefinition[]
}>

export type ParsedDocxParagraph = Readonly<{
  type: "docx-paragraph"
  source: SourceLocation
  properties: ParsedDocxParagraphProperties
  runs: readonly ParsedDocxRun[]
}>

export type ParsedDocxTableBorder = Readonly<{
  style: "none" | "single" | "double" | "dotted" | "dashed"
  color: string
  /** OOXML eighth-points. */
  size: number
  /** OOXML whole points. */
  space: number
}>

export type ParsedDocxTableBorders = Readonly<{
  top: ParsedDocxTableBorder | null
  right: ParsedDocxTableBorder | null
  bottom: ParsedDocxTableBorder | null
  left: ParsedDocxTableBorder | null
  insideHorizontal: ParsedDocxTableBorder | null
  insideVertical: ParsedDocxTableBorder | null
}>

export type ParsedDocxTableCellBorders = Readonly<{
  top: ParsedDocxTableBorder | null
  right: ParsedDocxTableBorder | null
  bottom: ParsedDocxTableBorder | null
  left: ParsedDocxTableBorder | null
}>

export type ParsedDocxTableCell = Readonly<{
  type: "docx-table-cell"
  source: SourceLocation
  columnIndex: number
  width: number
  preferredWidth: number | null
  columnSpan: number
  verticalMerge: "none" | "restart" | "continue"
  verticalAlignment: "top" | "center" | "bottom"
  fillColor: string | null
  borders: ParsedDocxTableCellBorders
  paragraphs: readonly ParsedDocxParagraph[]
}>

export type ParsedDocxTableRow = Readonly<{
  type: "docx-table-row"
  source: SourceLocation
  repeatAsHeader: boolean
  allowBreakAcrossPages: boolean
  height: Readonly<{ rule: "exact" | "atLeast"; value: number }> | null
  cells: readonly ParsedDocxTableCell[]
}>

export type ParsedDocxTable = Readonly<{
  type: "docx-table"
  source: SourceLocation
  width: number
  preferredWidth: number | null
  layout: "fixed" | "autofit"
  columnWidths: readonly number[]
  borders: ParsedDocxTableBorders
  cellPadding: Readonly<{
    top: number
    right: number
    bottom: number
    left: number
  }>
  repeatHeaderRowCount: number
  rows: readonly ParsedDocxTableRow[]
}>

export type ParsedDocxHorizontalRule = Readonly<{
  type: "docx-horizontal-rule"
  source: SourceLocation
  properties: ParsedDocxParagraphProperties
  heightTwips: number
  color: string
}>

export type ParsedDocxBlock =
  ParsedDocxParagraph | ParsedDocxTable | ParsedDocxHorizontalRule

export type ParsedDocxSectionProperties = Readonly<{
  pageWidth: number
  pageHeight: number
  marginTop: number
  marginRight: number
  marginBottom: number
  marginLeft: number
  orientation: "portrait" | "landscape"
  headerDistance: number
  footerDistance: number
}>

export type ParsedDocxImageAsset = Readonly<{
  type: "docx-image-asset"
  id: string
  source: SourceLocation
  packagePath: string
  mimeType: SemanticImageMimeType
  bytes: readonly number[]
  pixelWidth: number
  pixelHeight: number
}>

export type ParsedDocxHeaderFooter = Readonly<{
  type: "docx-header" | "docx-footer"
  id: string
  source: SourceLocation
  part: string
  paragraphs: readonly ParsedDocxParagraph[]
}>

export type ParsedDocxSection = Readonly<{
  type: "docx-section"
  source: SourceLocation
  properties: ParsedDocxSectionProperties
  defaultHeaderId: string | null
  defaultFooterId: string | null
  blocks: readonly ParsedDocxBlock[]
}>

export type ParsedDocxDocument = Readonly<{
  type: "docx-document"
  source: SourceLocation
  documentPart: string
  assets: readonly ParsedDocxImageAsset[]
  headers: readonly ParsedDocxHeaderFooter[]
  footers: readonly ParsedDocxHeaderFooter[]
  numberingDefinitions: readonly ParsedDocxNumberingDefinition[]
  sections: readonly ParsedDocxSection[]
  blocks: readonly ParsedDocxBlock[]
  /** Convenience projection retained for paragraph-only consumers. */
  paragraphs: readonly ParsedDocxParagraph[]
  sectionProperties: ParsedDocxSectionProperties
}>

export type DocxParseOptions = Readonly<{
  /** Overrides only the package limits relevant while reading a DOCX. */
  limits?: Readonly<{
    maxTemplateBytes?: number
    maxArchiveEntries?: number
    maxDecompressedBytes?: number
    /** Maximum decoded text bytes accepted for any individual XML part. */
    maxXmlTextBytes?: number
    /** Maximum element count accepted for any individual XML part. */
    maxXmlNodes?: number
    maxXmlDepth?: number
    maxImageCount?: number
    maxImageBytes?: number
    maxImageDimensionPixels?: number
    maxImagePixels?: number
  }>
  /**
   * Controls only documented safe fallbacks. Invalid, unsafe, or otherwise
   * lossy OOXML remains an error in every mode. Defaults to `strict`.
   */
  unsupportedFeatures?: "strict" | "compatible" | "lenient"
  signal?: AbortSignal
}>

export type DocxInspection = Readonly<{
  documentPart: string
  archiveEntries: number
  decompressedBytes: number
  diagnostics: readonly Diagnostic[]
}>

export type ParsedDocxResult = Readonly<{
  document: ParsedDocxDocument
  diagnostics: readonly Diagnostic[]
}>
