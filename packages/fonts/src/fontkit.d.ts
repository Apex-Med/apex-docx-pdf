declare module "fontkit" {
  type FontkitBox = Readonly<{
    minX: number
    minY: number
    maxX: number
    maxY: number
  }>

  type FontkitGlyph = Readonly<{
    id: number
    codePoints: readonly number[]
  }>

  type FontkitGlyphPosition = Readonly<{
    xAdvance: number
    yAdvance: number
    xOffset: number
    yOffset: number
  }>

  type FontkitGlyphRun = Readonly<{
    glyphs: readonly FontkitGlyph[]
    positions: readonly FontkitGlyphPosition[]
  }>

  type FontkitSubset = {
    includeGlyph(glyph: number | FontkitGlyph): number
    encode(): Uint8Array
  }

  export type FontkitFont = Readonly<{
    postscriptName: string | null
    unitsPerEm: number
    ascent: number
    descent: number
    lineGap: number
    underlinePosition: number
    underlineThickness: number
    bbox: FontkitBox
    hasGlyphForCodePoint(codePoint: number): boolean
    createSubset(): FontkitSubset
    layout(
      text: string,
      features?: readonly string[] | Readonly<Record<string, boolean>>
    ): FontkitGlyphRun
  }>

  export function create(
    bytes: Uint8Array,
    postscriptName?: string | null
  ): FontkitFont
}
