import type { Diagnostic, SourceLocation } from "@apex-docx-pdf/core"

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
  bold: boolean
  italic: boolean
  underline: boolean
  color: string
}>

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
  lineSpacing: number | null
  keepWithNext: boolean
  keepLinesTogether: boolean
  pageBreakBefore: boolean
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
  paragraphs: readonly ParsedDocxParagraph[]
  sectionProperties: ParsedDocxSectionProperties
}>

export type DocxParseOptions = Readonly<{
  /** Overrides only the package limits relevant while reading a DOCX. */
  limits?: Readonly<{
    maxTemplateBytes?: number
    maxArchiveEntries?: number
    maxDecompressedBytes?: number
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
