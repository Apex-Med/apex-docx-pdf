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

export type SemanticInline = SemanticText

export type SemanticParagraph = Readonly<{
  type: "paragraph"
  id: NodeId
  source: SourceLocation
  properties: ParagraphProperties
  children: readonly SemanticInline[]
}>

export type SemanticBlock = SemanticParagraph

export type SectionProperties = Readonly<{
  pageWidth: Twip
  pageHeight: Twip
  margins: Insets
}>

export type SemanticSection = Readonly<{
  type: "section"
  id: NodeId
  source: SourceLocation
  properties: SectionProperties
  blocks: readonly SemanticBlock[]
}>

export type SemanticDocument = Readonly<{
  type: "document"
  id: NodeId
  source: SourceLocation
  numberingDefinitions: readonly NumberingDefinition[]
  sections: readonly SemanticSection[]
}>

export type ResolvedText = SemanticText
export type ResolvedInline = ResolvedText
export type ResolvedParagraph = Omit<SemanticParagraph, "children"> & {
  readonly children: readonly ResolvedInline[]
}
export type ResolvedBlock = ResolvedParagraph
export type ResolvedSection = Omit<SemanticSection, "blocks"> & {
  readonly blocks: readonly ResolvedBlock[]
}
export type ResolvedDocument = Omit<SemanticDocument, "sections"> & {
  readonly sections: readonly ResolvedSection[]
}
