import type { NodeId } from "./ids"
import type { SourceLocation } from "./diagnostics"
import type { Insets, Twip } from "./units"

export type TextStyle = Readonly<{
  fontFamily: string
  fontSize: Twip
  bold: boolean
  italic: boolean
  underline: boolean
  color: string
}>

export type ParagraphProperties = Readonly<{
  alignment: "left" | "center" | "right" | "justify"
  spacingBefore: Twip
  spacingAfter: Twip
  lineSpacing: Twip | null
  keepWithNext: boolean
  keepLinesTogether: boolean
  pageBreakBefore: boolean
}>

export type SemanticText = Readonly<{
  type: "text"
  id: NodeId
  source: SourceLocation
  text: string
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
