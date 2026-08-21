import type { DocumentHash } from "./ids"
import type { Twip } from "./units"

declare const fontFaceIdBrand: unique symbol
declare const glyphIdBrand: unique symbol

export type FontFaceId = string & { readonly [fontFaceIdBrand]: true }
export type GlyphId = number & { readonly [glyphIdBrand]: true }
/** CSS/OpenType static font weights supported by the renderer contract. */
export type FontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900
export type FontStyle = "normal" | "italic"
export type FontProgramKind = "truetype" | "opentype-cff"

export function fontFaceId(value: string): FontFaceId {
  if (value.length === 0) throw new TypeError("A font face ID cannot be empty")
  return value as FontFaceId
}

export function glyphId(value: number): GlyphId {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("A glyph ID must be a non-negative safe integer")
  }
  return value as GlyphId
}

export type FontFaceRegistration = Readonly<{
  family: string
  weight: FontWeight
  style: FontStyle
  bytes: Uint8Array
  postscriptName?: string
}>

export type FontAlias = Readonly<{
  from: string
  to: string
  /** Optional face selection for family names that encode a weight. */
  weight?: FontWeight
  /** Optional face selection for family names that encode a style. */
  style?: FontStyle
}>

export type FontConfiguration = Readonly<{
  faces: readonly FontFaceRegistration[]
  aliases?: readonly FontAlias[]
  fallbackFamily: string
}>

export type FontFaceRequest = Readonly<{
  family: string
  weight: FontWeight
  style: FontStyle
}>

export type FontFaceMetrics = Readonly<{
  unitsPerEm: number
  ascent: number
  descent: number
  lineGap: number
  underlinePosition: number
  underlineThickness: number
  bbox: Readonly<{
    xMin: number
    yMin: number
    xMax: number
    yMax: number
  }>
}>

export type FontFaceResource = Readonly<{
  faceId: FontFaceId
  family: string
  weight: FontWeight
  style: FontStyle
  postscriptName: string
  kind: FontProgramKind
  bytes: Uint8Array
  metrics: FontFaceMetrics
}>

export type FontMatch = Readonly<{
  faceId: FontFaceId
  requestedFamily: string
  resolvedFamily: string
  kind: "exact" | "alias" | "face-fallback" | "family-fallback"
  metrics: FontFaceMetrics
}>

export interface FontRegistry {
  readonly registryHash: DocumentHash
  matchFace(request: FontFaceRequest): FontMatch
  face(faceId: FontFaceId): FontFaceResource
}

export type ShapeTextInput = Readonly<{
  face: FontFaceResource
  text: string
  fontSize: Twip
  direction: "ltr"
  language?: string
  /**
   * Optional OpenType variation axes (e.g. `wght`) so variable fonts can
   * produce metrics that match non-static CSS weights such as 500/600.
   */
  variation?: Readonly<{
    wght?: number
    ital?: number
  }>
}>

export type ShapedGlyph = Readonly<{
  glyphId: GlyphId
  unicode: string
  clusterStart: number
  clusterEnd: number
  advanceX: Twip
  advanceY: Twip
  offsetX: Twip
  offsetY: Twip
}>

export type ShapedText = Readonly<{
  glyphs: readonly ShapedGlyph[]
  advanceX: Twip
  ascent: Twip
  descent: Twip
  lineGap: Twip
}>

export interface TextShaper {
  shape(input: ShapeTextInput): ShapedText
}

export type EmbeddedFontSubset = Readonly<{
  faceId: FontFaceId
  kind: FontProgramKind
  /** False when the provider safely returns the complete registered font program. */
  subsetted: boolean
  bytes: Uint8Array
  postscriptName: string
  metrics: FontFaceMetrics
  glyphMap: readonly Readonly<{
    sourceGlyphId: GlyphId
    subsetGlyphId: number
  }>[]
}>

export interface FontEmbeddingProvider {
  subset(
    faceId: FontFaceId,
    glyphIds: readonly GlyphId[],
    signal?: AbortSignal
  ): EmbeddedFontSubset
}
