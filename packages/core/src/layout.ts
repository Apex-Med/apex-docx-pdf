import type { Diagnostic } from "./diagnostics"
import type { FontFaceId, FontWeight, GlyphId } from "./fonts"
import type { NodeId } from "./ids"
import type { Rect, Twip } from "./units"

export type PositionedGlyph = Readonly<{
  glyphId: GlyphId
  unicode: string
  /** Display-list coordinates: positive x is right and positive y is down. */
  xAdvance: Twip
  yAdvance: Twip
  xOffset: Twip
  yOffset: Twip
}>

export type StandardGlyphRun = Readonly<{
  type: "glyph-run"
  fontSource: "standard"
  sourceNodeId: NodeId
  text: string
  fontFamily: string
  fontWeight?: FontWeight
  fontStyle?: "normal" | "italic"
  fontSize: Twip
  color: string
  highlightColor?: string | null
  verticalAlignment?: "baseline" | "superscript" | "subscript"
  x: Twip
  baselineY: Twip
  width: Twip
}>

export type EmbeddedGlyphRun = Readonly<{
  type: "glyph-run"
  fontSource: "embedded"
  sourceNodeId: NodeId
  text: string
  faceId: FontFaceId
  fontFamily?: string
  fontWeight?: FontWeight
  fontStyle?: "normal" | "italic"
  glyphs: readonly PositionedGlyph[]
  fontSize: Twip
  color: string
  highlightColor?: string | null
  verticalAlignment?: "baseline" | "superscript" | "subscript"
  x: Twip
  baselineY: Twip
  width: Twip
}>

export type GlyphRun = StandardGlyphRun | EmbeddedGlyphRun

export type LineCap = "butt" | "round" | "square"

export type Line = Readonly<{
  type: "line"
  sourceNodeId: NodeId
  x1: Twip
  y1: Twip
  x2: Twip
  y2: Twip
  width: Twip
  color: string
  dashArray?: readonly Twip[]
  dashPhase?: Twip
  lineCap?: LineCap
}>

export type Rectangle = Readonly<{
  type: "rectangle"
  sourceNodeId: NodeId
  bounds: Rect
  strokeColor?: string
  fillColor?: string
  strokeWidth?: Twip
}>

export type ImagePlacement = Readonly<{
  type: "image"
  sourceNodeId: NodeId
  assetId: string
  bounds: Rect
}>

export type DisplayListItem = GlyphRun | Line | Rectangle | ImagePlacement

export type PageDisplayListPage = Readonly<{
  pageNumber: number
  width: Twip
  height: Twip
  contentBounds: Rect
  items: readonly DisplayListItem[]
}>

export type PageDisplayList = Readonly<{
  pages: readonly PageDisplayListPage[]
}>

type LayoutTraceEventBase = Readonly<{
  pageNumber: number
  sourceNodeId: NodeId
  bounds?: Rect
  reason?: string
}>

export type LayoutTraceEvent =
  | (LayoutTraceEventBase &
      Readonly<{ kind: "block" | "line" | "table"; bounds: Rect }>)
  | (LayoutTraceEventBase &
      Readonly<{ kind: "glyph-run"; bounds: Rect; baselineY: Twip }>)
  | (LayoutTraceEventBase &
      Readonly<{
        kind: "table-row-fragment"
        bounds: Rect
        fragmentOffset: Twip
        rowHeight: Twip
        repeatedHeader: boolean
      }>)
  | (LayoutTraceEventBase &
      Readonly<{
        kind: "keep-decision"
        decision: "moved" | "adjusted" | "degraded"
        reason: string
      }>)
  | (LayoutTraceEventBase & Readonly<{ kind: "page-break"; reason: string }>)
  | (LayoutTraceEventBase & Readonly<{ kind: "overflow"; reason: string }>)
  | (LayoutTraceEventBase &
      Readonly<{ kind: "clipping"; bounds: Rect; reason: string }>)
  | (LayoutTraceEventBase &
      Readonly<{ kind: "font-fallback"; bounds: Rect; reason: string }>)
  | (LayoutTraceEventBase &
      Readonly<{ kind: "unsupported-approximation"; reason: string }>)

export type LayoutTrace = Readonly<{
  pages: readonly Readonly<{
    pageNumber: number
    pageBounds: Rect
    contentBounds: Rect
  }>[]
  events: readonly LayoutTraceEvent[]
}>

export type LayoutDocument = Readonly<{
  displayList: PageDisplayList
  diagnostics: readonly Diagnostic[]
  trace?: LayoutTrace
}>
