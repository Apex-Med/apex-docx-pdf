import type {
  FontFaceMetrics,
  FontProgramKind,
  GlyphId,
} from "@apex-docx-pdf/core"

export type ParsedGlyph = Readonly<{
  glyphId: GlyphId
  unicode: string
  clusterStart: number
  clusterEnd: number
  advanceX: number
  advanceY: number
  offsetX: number
  offsetY: number
}>

export type ParsedGlyphRun = Readonly<{
  glyphs: readonly ParsedGlyph[]
}>

/**
 * The deliberately small parser boundary used by the registry and shaper.
 * Distances returned by `layout` are in font units.
 */
export interface ParsedFontFace {
  readonly postscriptName: string
  readonly kind: FontProgramKind
  readonly metrics: FontFaceMetrics
  hasGlyphForCodePoint(codePoint: number): boolean
  layout(
    text: string,
    options: Readonly<{
      direction: "ltr"
      script: "latn"
      language?: string
    }>
  ): ParsedGlyphRun
}

export interface FontParserAdapter {
  parse(
    bytes: Uint8Array,
    postscriptName?: string
  ): ParsedFontFace | Promise<ParsedFontFace>
}

export type FontSubsetResult = Readonly<{
  bytes: Uint8Array
  postscriptName: string
  glyphMap: readonly Readonly<{
    sourceGlyphId: GlyphId
    subsetGlyphId: number
  }>[]
}>

/** Injectable seam for a future subsetter with a documented source-to-subset map. */
export interface FontSubsetAdapter {
  subset(
    face: ParsedFontFace,
    glyphIds: readonly GlyphId[],
    signal?: AbortSignal
  ): FontSubsetResult
}
