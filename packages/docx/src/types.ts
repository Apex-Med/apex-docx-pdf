import type {
  Diagnostic,
  FontStyle,
  FontWeight,
  NumberingFormat,
  SourceLocation,
} from "@apex-docx-pdf/core"

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

export type ParsedDocxRunProperties = Readonly<{
  fontFamily: string
  fontSizeHalfPoints: number
  fontWeight: FontWeight
  fontStyle: FontStyle
  underline: boolean
  color: string
}>

export type ParsedDocxLineSpacing =
  | Readonly<{ rule: "auto"; value240ths: number }>
  | Readonly<{ rule: "exact" | "atLeast"; valueTwips: number }>
  | null

export type ParsedDocxRun = Readonly<{
  type: "docx-run"
  source: SourceLocation
  properties: ParsedDocxRunProperties
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

export type ParsedDocxSectionProperties = Readonly<{
  pageWidth: number
  pageHeight: number
  marginTop: number
  marginRight: number
  marginBottom: number
  marginLeft: number
}>

export type ParsedDocxDocument = Readonly<{
  type: "docx-document"
  source: SourceLocation
  documentPart: string
  numberingDefinitions: readonly ParsedDocxNumberingDefinition[]
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
  }>
  /** Unsupported meaningful OOXML is an error by default. */
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
