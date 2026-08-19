import {
  throwIfAborted,
  twips,
  type Diagnostic,
  type DisplayListItem,
  type FontFaceId,
  type FontRegistry,
  type GlyphRun,
  type LayoutDocument,
  type LayoutTrace,
  type LayoutTraceEvent,
  type LinkBox,
  type NodeId,
  type NumberingDefinition,
  type NumberingFormat,
  type NumberingLevelDefinition,
  type PageDisplayList,
  type PageDisplayListPage,
  type ParagraphProperties,
  type PositionedGlyph,
  type Rect,
  type ResolvedDocument,
  type ResolvedHorizontalRule,
  type ResolvedInline,
  type ResolvedParagraph,
  type ResolvedTable,
  type ResolvedTableCell,
  type ResolvedTableRow,
  type ShapeTextInput,
  type ShapedGlyph,
  type TableBorder,
  type TextShaper,
  type TextStyle,
  type Twip,
} from "@apexmed/core"

/** The A4 dimensions used by Word, represented as integer twips. */
export const A4_PAGE_WIDTH = twips(11_906)
export const A4_PAGE_HEIGHT = twips(16_838)

/** Explicit compatibility metrics for the Phase 1 built-in-font path. */
export type Phase1FontMetrics = Readonly<{
  measureText: (text: string, style: TextStyle) => Twip
  lineHeight: (style: TextStyle) => Twip
}>

/**
 * Optional prepared-block memoization keyed by frozen node identity and width.
 * Semantic nodes are frozen, so `node === cached` is a valid identity check.
 * Re-layout after an identity-preserving edit becomes re-pagination only.
 */
export type PreparedBlockCache = {
  get(
    node: object,
    width: Twip
  ):
    | Readonly<{ kind: "paragraph"; value: unknown }>
    | Readonly<{ kind: "table"; value: unknown }>
    | undefined
  set(
    node: object,
    width: Twip,
    value:
      | Readonly<{ kind: "paragraph"; value: unknown }>
      | Readonly<{ kind: "table"; value: unknown }>
  ): void
}

/** In-memory prepared-block cache using WeakMap identity + width. */
export function createPreparedBlockCache(): PreparedBlockCache {
  const store = new WeakMap<
    object,
    Map<number, { kind: string; value: unknown }>
  >()
  return {
    get(node, width) {
      const byWidth = store.get(node)
      const entry = byWidth?.get(width)
      if (!entry) return undefined
      return entry as
        | Readonly<{ kind: "paragraph"; value: unknown }>
        | Readonly<{ kind: "table"; value: unknown }>
    },
    set(node, width, value) {
      let byWidth = store.get(node)
      if (!byWidth) {
        byWidth = new Map()
        store.set(node, byWidth)
      }
      byWidth.set(width, value)
    },
  }
}

type CommonLayoutOptions = Readonly<{
  maxPages?: number
  signal?: AbortSignal
  includeTrace?: boolean
  /** Optional prepared-block cache for identity-preserving re-layouts. */
  cache?: PreparedBlockCache
}>

const FONT_FALLBACK_TRACE_CODES = new Set([
  "layout/font-fallback",
  "layout/font-match-fallback",
  "layout/numbering-label-style-fallback",
])

const UNSUPPORTED_APPROXIMATION_TRACE_CODES = new Set([
  "layout/standard-font-style-unsupported",
])

function traceDiagnosticCodesByNode(
  diagnostics: readonly Diagnostic[]
): ReadonlyMap<NodeId, readonly string[]> {
  const result = new Map<NodeId, string[]>()
  for (const diagnostic of diagnostics) {
    if (diagnostic.nodeId === undefined) continue
    const codes = result.get(diagnostic.nodeId) ?? []
    if (!codes.includes(diagnostic.code)) codes.push(diagnostic.code)
    result.set(diagnostic.nodeId, codes)
  }
  return result
}

/** `fonts` and `shaper` are an inseparable deterministic typography input. */
export type LayoutOptions = CommonLayoutOptions &
  (
    | Readonly<{ fonts: FontRegistry; shaper: TextShaper; metrics?: never }>
    | Readonly<{ fonts?: never; shaper?: never; metrics?: Phase1FontMetrics }>
  )

export class LayoutLimitError extends Error {
  readonly code = "layout/max-pages"

  constructor(readonly maxPages: number) {
    super(`Layout exceeded the configured maximum of ${maxPages} pages`)
    this.name = "LayoutLimitError"
  }
}

type PreparedGlyph = Readonly<{
  glyph: ShapedGlyph
  extraAdvance: Twip
}>

type Cluster = Readonly<{
  text: string
  style: TextStyle
  sourceNodeId: NodeId
  width: Twip
  ascent: Twip
  descent: Twip
  lineGap: Twip
  /** Relative to the paragraph baseline; positive display-list y moves down. */
  baselineShift: Twip
  whitespace: boolean
  preserveSpace: boolean
  /** Character offset within the paragraph at which this cluster begins. */
  charOffset?: number
  faceId?: FontFaceId
  glyphs?: readonly PreparedGlyph[]
  underlineOffset: Twip
  underlineThickness: Twip
  /** External URL when this cluster comes from a hyperlink run. */
  href?: string | null
  atom?:
    | Readonly<{
        type: "image"
        assetId: string
        height: Twip
        offsetX: Twip
        offsetY: Twip
      }>
    | Readonly<{ type: "tab" }>
    | Readonly<{
        type: "pageField"
        field: "PAGE" | "NUMPAGES"
        embedded?: Readonly<{
          faceId: FontFaceId
          digits: ReadonlyMap<string, readonly ShapedGlyph[]>
        }>
        digitAdvances: ReadonlyMap<string, Twip>
        reservedDigits: number
      }>
}>

type Token = Readonly<{
  clusters: readonly Cluster[]
  whitespace: boolean
  hardBreak: boolean
  preserveSpace: boolean
  pageBreak?: boolean
  columnBreak?: boolean
  tabSourceNodeId?: NodeId
}>

type MeasuredLine = Readonly<{
  clusters: readonly Cluster[]
  width: Twip
  ascent: Twip
  descent: Twip
  lineGap: Twip
  wrapped: boolean
  /** Character offset within the paragraph text at which this line begins. */
  charOffset: number
  pageBreakAfter?: boolean
  columnBreakAfter?: boolean
}>

type SectionColumnGeometry = Readonly<{
  count: number
  space: Twip
  separator: boolean
  columns: readonly Rect[]
}>

type LineBox = Readonly<{ x: Twip; width: Twip }>

type ResolvedListLabel = Readonly<{
  text: string
  level: NumberingLevelDefinition
  clusters: readonly Cluster[]
  width: Twip
  ascent: Twip
  descent: Twip
  lineGap: Twip
  indentStart: Twip
  firstLineIndent: Twip
}>

type PreparedParagraph = Readonly<{
  paragraph: ResolvedParagraph
  lines: readonly MeasuredLine[]
  lineHeights: readonly Twip[]
  label?: ResolvedListLabel
  properties: ParagraphProperties
  height: Twip
}>

type PreparedCellParagraph = PreparedParagraph &
  Readonly<{ top: Twip; lineTops: readonly Twip[] }>

type PreparedTableCell = Readonly<{
  cell: ResolvedTableCell
  x: Twip
  width: Twip
  contentX: Twip
  contentWidth: Twip
  topInset: Twip
  bottomInset: Twip
  borders: Readonly<{
    top: TableBorder | null
    right: TableBorder | null
    bottom: TableBorder | null
    left: TableBorder | null
  }>
  contentHeight: Twip
  paragraphs: readonly PreparedCellParagraph[]
  mergeOwnerRow: number | null
}>

type PreparedTableRow = Readonly<{
  row: ResolvedTableRow
  index: number
  cells: readonly PreparedTableCell[]
  top: Twip
  height: Twip
}>

type PreparedMergeChain = Readonly<{
  ownerRow: number
  finalRow: number
  columnIndex: number
  columnSpan: number
}>

type PreparedTable = Readonly<{
  table: ResolvedTable
  indentStart: Twip
  rows: readonly PreparedTableRow[]
  mergeChains: readonly PreparedMergeChain[]
  headerHeight: Twip
}>

type PreparedHorizontalRule = Readonly<{
  rule: ResolvedHorizontalRule
  height: Twip
}>

type PreparedBlock =
  | Readonly<{ type: "paragraph"; value: PreparedParagraph }>
  | Readonly<{ type: "table"; value: PreparedTable }>
  | Readonly<{ type: "horizontalRule"; value: PreparedHorizontalRule }>

type PendingPageField = Readonly<{
  type: "pending-page-field"
  sourceNodeId: NodeId
  field: "PAGE" | "NUMPAGES"
  style: TextStyle
  x: Twip
  baselineY: Twip
  width: Twip
  embedded?: Readonly<{
    faceId: FontFaceId
    digits: ReadonlyMap<string, readonly ShapedGlyph[]>
  }>
  digitAdvances: ReadonlyMap<string, Twip>
  reservedDigits: number
}>

/**
 * Deterministic Word script presentation rule. The semantic font size remains
 * unchanged (including K3's 18-half-point runs); superscript/subscript glyphs
 * render at 2/3 size. Superscript shifts up by 1/3 of the original size and
 * subscript shifts down by 1/6. All arithmetic rounds once to integer twips.
 */
function scriptPresentation(style: TextStyle): Readonly<{
  style: TextStyle
  baselineShift: Twip
}> {
  const alignment = style.verticalAlignment ?? "baseline"
  if (alignment === "baseline") return { style, baselineShift: twips(0) }
  const fontSize = twips(Math.max(1, Math.round((style.fontSize * 2) / 3)))
  const baselineShift =
    alignment === "superscript"
      ? twips(-Math.round(style.fontSize / 3))
      : twips(Math.round(style.fontSize / 6))
  return {
    style: { ...style, fontSize },
    baselineShift,
  }
}

function shiftedVerticalMetrics(
  ascent: Twip,
  descent: Twip,
  baselineShift: Twip
): Readonly<{ ascent: Twip; descent: Twip }> {
  return {
    ascent: twips(Math.max(0, ascent - baselineShift)),
    descent: twips(Math.max(0, descent + baselineShift)),
  }
}

type InternalDisplayItem = DisplayListItem | PendingPageField

type PreparedHeaderFooter = Readonly<{
  id: string
  blocks: readonly PreparedBlock[]
  height: Twip
}>

type InternalPage = Readonly<{
  pageNumber: number
  width: Twip
  height: Twip
  contentBounds: Rect
  items: InternalDisplayItem[]
  header?: PreparedHeaderFooter
  footer?: PreparedHeaderFooter
  headerY: Twip
  footerY: Twip
}>

/**
 * A small, explicit Helvetica-compatible metrics adapter. It deliberately does
 * not inspect installed fonts; unsupported family names use these same metrics.
 */
export function createPhase1StandardFontMetrics(): Phase1FontMetrics {
  return Object.freeze({
    measureText(text: string, style: TextStyle): Twip {
      let units = 0
      for (const character of text) units += helveticaWidth(character)
      return twips(Math.round((units * style.fontSize) / 1_000))
    },
    lineHeight(style: TextStyle): Twip {
      return twips(
        Math.max(style.fontSize, Math.round((style.fontSize * 6) / 5))
      )
    },
  })
}

const DEFAULT_METRICS = createPhase1StandardFontMetrics()
const DEFAULT_COLUMN_SPACE = twips(720)
const COLUMN_SEPARATOR_WIDTH = twips(15)

function resolveSectionColumnGeometry(
  section: ResolvedDocument["sections"][number],
  contentBounds: Rect
): SectionColumnGeometry {
  const columns = section.properties.columns
  const count =
    columns !== null &&
    columns !== undefined &&
    Number.isSafeInteger(columns.count) &&
    columns.count > 1
      ? Math.min(columns.count, 12)
      : 1
  if (count <= 1) {
    return {
      count: 1,
      space: twips(0),
      separator: false,
      columns: Object.freeze([contentBounds]),
    }
  }
  if (columns === null || columns === undefined)
    throw new RangeError("Multi-column geometry requires section columns")
  const space =
    columns.space !== undefined && Number.isSafeInteger(columns.space)
      ? twips(Math.max(0, columns.space))
      : DEFAULT_COLUMN_SPACE
  const separator = columns.separator === true
  const totalSpace = space * (count - 1)
  const available = contentBounds.width - totalSpace
  if (available <= 0)
    throw new RangeError(
      "Section column spacing leaves no writable column width"
    )

  const equalWidth = columns.equalWidth !== false
  const explicit =
    !equalWidth &&
    columns.widths !== null &&
    columns.widths !== undefined &&
    columns.widths.length === count
      ? columns.widths.map((width) => twips(Math.max(1, width)))
      : null

  let widths: Twip[]
  if (explicit) {
    const sum = explicit.reduce((total, width) => total + width, 0)
    if (sum <= 0) throw new RangeError("Section column widths must be positive")
    // Scale explicit widths into the writable area so nested geometry stays valid.
    widths = explicit.map((width) =>
      twips(Math.max(1, Math.floor((width * available) / sum)))
    )
    let allocated = widths.reduce((total, width) => total + width, 0)
    let index = 0
    while (allocated < available && index < widths.length) {
      widths[index] = twips((widths[index] as number) + 1)
      allocated += 1
      index += 1
    }
  } else {
    const base = Math.floor(available / count)
    const remainder = available - base * count
    widths = Array.from({ length: count }, (_, index) =>
      twips(base + (index < remainder ? 1 : 0))
    )
  }

  const rects: Rect[] = []
  let x = contentBounds.x
  for (let index = 0; index < count; index += 1) {
    const width = widths[index] as Twip
    rects.push({
      x: twips(x),
      y: contentBounds.y,
      width,
      height: contentBounds.height,
    })
    x = twips(x + width + (index < count - 1 ? space : 0))
  }
  return {
    count,
    space,
    separator,
    columns: Object.freeze(rects),
  }
}

function emitColumnSeparators(
  page: InternalPage,
  geometry: SectionColumnGeometry,
  sourceNodeId: NodeId
): void {
  if (!geometry.separator || geometry.count <= 1) return
  for (let index = 0; index < geometry.count - 1; index += 1) {
    const left = geometry.columns[index] as Rect
    const x = twips(left.x + left.width + Math.floor(geometry.space / 2))
    page.items.push({
      type: "line",
      sourceNodeId,
      x1: x,
      y1: page.contentBounds.y,
      x2: x,
      y2: twips(page.contentBounds.y + page.contentBounds.height),
      width: COLUMN_SEPARATOR_WIDTH,
      color: "#000000",
    })
  }
}

/**
 * Lays out resolved paragraphs. With an injected registry and shaper it emits
 * embedded glyph runs; otherwise it retains the explicit Phase 1 standard-font
 * fallback used by the existing engine.
 */
export function layoutDocument(
  document: ResolvedDocument,
  options: LayoutOptions = {}
): LayoutDocument {
  const hasFonts = options.fonts !== undefined
  const hasShaper = options.shaper !== undefined
  if (hasFonts !== hasShaper)
    throw new TypeError("fonts and shaper must be provided together")

  const typography: Typography = hasFonts
    ? {
        kind: "embedded",
        fonts: options.fonts as FontRegistry,
        shaper: options.shaper as TextShaper,
      }
    : { kind: "standard", metrics: options.metrics ?? DEFAULT_METRICS }
  const maxPages = options.maxPages ?? 500
  if (!Number.isSafeInteger(maxPages) || maxPages < 1)
    throw new TypeError("maxPages must be a positive safe integer")

  const diagnostics: Diagnostic[] = []
  const pages: InternalPage[] = []
  const tracePages: Array<{
    pageNumber: number
    pageBounds: Rect
    contentBounds: Rect
  }> = []
  const events: LayoutTraceEvent[] = []
  const numbering = createNumberingResolver(document, diagnostics)
  const pageFieldDigits = String(maxPages).length
  const assets = validateAssets(document)
  const headers = indexHeaderFooters(document.headers, "header")
  const footers = indexHeaderFooters(document.footers, "footer")
  const headerFooterCache = new Map<string, PreparedHeaderFooter>()
  const sectionPageCounts = new Map<string, number>()
  let current: PageState | undefined

  const prepareHeaderFooter = (
    id: string | null,
    kind: "header" | "footer",
    width: Twip,
    maximumHeight: Twip
  ): PreparedHeaderFooter | undefined => {
    if (id === null) return undefined
    const definitions = kind === "header" ? headers : footers
    const definition = definitions.get(id)
    if (!definition)
      throw new RangeError(`Section references missing ${kind} '${id}'`)
    const cacheKey = `${kind}:${id}:${width}:${maximumHeight}:${pageFieldDigits}`
    const cached = headerFooterCache.get(cacheKey)
    if (cached) return cached
    const blocks: readonly PreparedBlock[] = definition.blocks.map((block) => {
      if (block.type === "table") {
        return {
          type: "table",
          value: prepareTable(
            withHeaderFooterTableLineSpacing(block),
            width,
            typography,
            diagnostics,
            numbering,
            pageFieldDigits,
            assets,
            maximumHeight,
            options.signal
          ),
        }
      }
      if (block.type === "horizontalRule") {
        if (!Number.isSafeInteger(block.height) || block.height <= 0)
          throw new RangeError(
            "Header/footer horizontal-rule height must be a positive safe-integer twip value"
          )
        return {
          type: "horizontalRule",
          value: {
            rule: block,
            height: safeTwipSum(
              [
                block.properties.spacingBefore,
                block.height,
                block.properties.spacingAfter,
              ],
              "Header/footer horizontal-rule height exceeds the safe integer range"
            ),
          },
        }
      }
      if (block.properties.numbering !== null)
        throw new RangeError(
          `${kind === "header" ? "Header" : "Footer"} paragraphs cannot use automatic numbering`
        )
      return {
        type: "paragraph",
        value: prepareParagraph(
          block,
          width,
          typography,
          diagnostics,
          numbering,
          pageFieldDigits,
          assets,
          options.signal
        ),
      }
    })
    const blockHeight = (block: PreparedBlock): Twip => {
      if (block.type !== "table") return block.value.height
      return safeTwipSum(
        block.value.rows.map((row) => row.height),
        `${kind === "header" ? "Header" : "Footer"} table height exceeds the safe integer range`
      )
    }
    const prepared: PreparedHeaderFooter = Object.freeze({
      id,
      blocks: Object.freeze(blocks),
      height: safeTwipSum(
        blocks.map(blockHeight),
        `${kind === "header" ? "Header" : "Footer"} height exceeds the safe integer range`
      ),
    })
    headerFooterCache.set(cacheKey, prepared)
    return prepared
  }

  const createPage = (
    section: ResolvedDocument["sections"][number],
    reason?: string,
    sourceNodeId?: NodeId
  ): PageState => {
    throwIfAborted(options.signal)
    if (pages.length >= maxPages) throw new LayoutLimitError(maxPages)
    const { pageWidth, pageHeight, margins, headerDistance, footerDistance } =
      section.properties
    if (!Number.isSafeInteger(headerDistance) || headerDistance < 0)
      throw new RangeError(
        "Section header distance must be a non-negative safe integer"
      )
    if (!Number.isSafeInteger(footerDistance) || footerDistance < 0)
      throw new RangeError(
        "Section footer distance must be a non-negative safe integer"
      )
    const contentWidth = pageWidth - margins.left - margins.right
    const contentHeight = pageHeight - margins.top - margins.bottom
    if (contentWidth <= 0 || contentHeight <= 0)
      throw new RangeError("Section margins leave no writable page area")
    const contentBounds: Rect = {
      x: margins.left,
      y: margins.top,
      width: twips(contentWidth),
      height: twips(contentHeight),
    }
    const columnGeometry = resolveSectionColumnGeometry(section, contentBounds)
    const flowBounds = columnGeometry.columns[0] as Rect
    const sectionPageIndex = sectionPageCounts.get(String(section.id)) ?? 0
    sectionPageCounts.set(String(section.id), sectionPageIndex + 1)
    const useFirstPageVariant =
      sectionPageIndex === 0 && section.properties.differentFirstPage === true
    const header = prepareHeaderFooter(
      useFirstPageVariant
        ? (section.firstPageHeaderId ?? null)
        : section.defaultHeaderId,
      "header",
      contentBounds.width,
      pageHeight
    )
    const footer = prepareHeaderFooter(
      useFirstPageVariant
        ? (section.firstPageFooterId ?? null)
        : section.defaultFooterId,
      "footer",
      contentBounds.width,
      pageHeight
    )
    const headerBottom = header
      ? safeTwipSum(
          [headerDistance, header.height],
          "Header position exceeds the safe integer range"
        )
      : headerDistance
    if (header && headerBottom > margins.top)
      throw new RangeError(
        "Header content collides with the body because its distance and height exceed the top margin"
      )
    const footerExtent = footer
      ? safeTwipSum(
          [footerDistance, footer.height],
          "Footer position exceeds the safe integer range"
        )
      : footerDistance
    if (footer && footerExtent > margins.bottom)
      throw new RangeError(
        "Footer content collides with the body because its distance and height exceed the bottom margin"
      )
    const page: InternalPage = {
      pageNumber: pages.length + 1,
      width: pageWidth,
      height: pageHeight,
      contentBounds,
      items: [],
      ...(header ? { header } : {}),
      ...(footer ? { footer } : {}),
      // OOXML header distance anchors the header top from the page top. Footer
      // distance anchors the footer bottom from the page bottom.
      headerY: headerDistance,
      footerY: twips(pageHeight - footerExtent),
    }
    pages.push(page)
    emitColumnSeparators(page, columnGeometry, section.id)
    tracePages.push({
      pageNumber: page.pageNumber,
      pageBounds: {
        x: twips(0),
        y: twips(0),
        width: pageWidth,
        height: pageHeight,
      },
      contentBounds,
    })
    if (reason && sourceNodeId)
      events.push({
        pageNumber: page.pageNumber,
        sourceNodeId,
        kind: "page-break",
        reason,
      })
    return {
      page,
      y: flowBounds.y,
      items: page.items,
      flowBounds,
      columnIndex: 0,
      columnGeometry,
    }
  }

  const advanceFlow = (
    section: ResolvedDocument["sections"][number],
    state: PageState,
    mode: "column" | "page" | "overflow",
    reason: string,
    sourceNodeId: NodeId
  ): PageState => {
    if (mode === "page" || state.columnGeometry.count <= 1) {
      return createPage(section, reason, sourceNodeId)
    }
    if (
      mode === "column" ||
      state.columnIndex < state.columnGeometry.count - 1
    ) {
      if (state.columnIndex >= state.columnGeometry.count - 1) {
        return createPage(section, reason, sourceNodeId)
      }
      const nextIndex = state.columnIndex + 1
      const flowBounds = state.columnGeometry.columns[nextIndex] as Rect
      events.push({
        pageNumber: state.page.pageNumber,
        sourceNodeId,
        kind: "page-break",
        reason: mode === "column" ? "manual-column-break" : reason,
      })
      return {
        ...state,
        y: flowBounds.y,
        flowBounds,
        columnIndex: nextIndex,
      }
    }
    return createPage(section, reason, sourceNodeId)
  }

  for (const [sectionIndex, section] of document.sections.entries()) {
    throwIfAborted(options.signal)
    if (!current || sectionIndex > 0) {
      current = createPage(
        section,
        sectionIndex > 0 ? "section-boundary" : undefined,
        sectionIndex > 0 ? section.id : undefined
      )
    }

    const sectionContentWidth = current.flowBounds.width
    const sectionContentHeight = current.flowBounds.height
    const prepared: readonly PreparedBlock[] = section.blocks.map((block) => {
      throwIfAborted(options.signal)
      if (block.type === "table") {
        const cachedTable = options.cache?.get(block, sectionContentWidth)
        const tableValue =
          cachedTable?.kind === "table"
            ? (cachedTable.value as ReturnType<typeof prepareTable>)
            : prepareTable(
                block,
                sectionContentWidth,
                typography,
                diagnostics,
                numbering,
                pageFieldDigits,
                assets,
                sectionContentHeight,
                options.signal
              )
        if (cachedTable?.kind !== "table") {
          options.cache?.set(block, sectionContentWidth, {
            kind: "table",
            value: tableValue,
          })
        }
        return {
          type: "table",
          value: tableValue,
        }
      }
      if (block.type === "horizontalRule") {
        if (!Number.isSafeInteger(block.height) || block.height <= 0)
          throw new RangeError(
            "Horizontal-rule height must be a positive safe-integer twip value"
          )
        return {
          type: "horizontalRule",
          value: {
            rule: block,
            height: safeTwipSum(
              [
                block.properties.spacingBefore,
                block.height,
                block.properties.spacingAfter,
              ],
              "Horizontal-rule block height exceeds the safe integer range"
            ),
          },
        }
      }
      const cachedParagraph = options.cache?.get(block, sectionContentWidth)
      const paragraph =
        cachedParagraph?.kind === "paragraph"
          ? (cachedParagraph.value as PreparedParagraph)
          : prepareParagraph(
              block,
              sectionContentWidth,
              typography,
              diagnostics,
              numbering,
              pageFieldDigits,
              assets,
              options.signal
            )
      if (cachedParagraph?.kind !== "paragraph") {
        options.cache?.set(block, sectionContentWidth, {
          kind: "paragraph",
          value: paragraph,
        })
      }
      if (
        paragraph.lineHeights.some(
          (lineHeight) => lineHeight > sectionContentHeight
        )
      )
        throw new RangeError(
          "Paragraph contains an atomic line box taller than a writable fresh page"
        )
      return {
        type: "paragraph",
        value: paragraph,
      }
    })

    for (
      let paragraphIndex = 0;
      paragraphIndex < prepared.length;
      paragraphIndex += 1
    ) {
      throwIfAborted(options.signal)
      const block = prepared[paragraphIndex] as PreparedBlock
      if (block.type === "table") {
        current = paginateTable(
          block.value,
          section,
          current,
          createPage,
          diagnostics,
          events,
          options.signal
        )
        continue
      }
      if (block.type === "horizontalRule") {
        const { rule, height } = block.value
        let contentBottom = twips(
          current.flowBounds.y + current.flowBounds.height
        )
        if (height > current.flowBounds.height)
          throw new RangeError(
            "Horizontal-rule block is taller than a writable fresh page"
          )
        if (
          rule.properties.pageBreakBefore &&
          current.y !== current.flowBounds.y
        ) {
          current = advanceFlow(
            section,
            current,
            "page",
            "page-break-before",
            rule.id
          )
          contentBottom = twips(
            current.flowBounds.y + current.flowBounds.height
          )
        }
        const next = prepared[paragraphIndex + 1]
        const keepHeight =
          rule.properties.keepWithNext && next?.type === "paragraph"
            ? safeTwipSum(
                [height, next.value.height],
                "Keep-with-next rule chain exceeds the safe integer range"
              )
            : height
        if (
          current.y !== current.flowBounds.y &&
          current.y + keepHeight > contentBottom &&
          keepHeight <= current.flowBounds.height
        ) {
          current = advanceFlow(
            section,
            current,
            "overflow",
            rule.properties.keepWithNext
              ? "keep-with-next"
              : "horizontal-rule-overflow",
            rule.id
          )
          if (rule.properties.keepWithNext)
            events.push({
              pageNumber: current.page.pageNumber,
              sourceNodeId: rule.id,
              kind: "keep-decision",
              decision: "moved",
              reason: "keep-with-next",
            })
        }
        current.y = twips(current.y + rule.properties.spacingBefore)
        const centerY = twips(current.y + Math.floor(rule.height / 2))
        current.items.push({
          type: "line",
          sourceNodeId: rule.id,
          x1: current.flowBounds.x,
          y1: centerY,
          x2: twips(current.flowBounds.x + current.flowBounds.width),
          y2: centerY,
          width: rule.height,
          color: rule.color,
        })
        events.push({
          pageNumber: current.page.pageNumber,
          sourceNodeId: rule.id,
          kind: "block",
          bounds: {
            x: current.flowBounds.x,
            y: current.y,
            width: current.flowBounds.width,
            height: rule.height,
          },
          reason: "word-vml-horizontal-rule",
        })
        current.y = twips(
          current.y + rule.height + rule.properties.spacingAfter
        )
        continue
      }
      const item = block.value
      const { paragraph, lines, lineHeights, label, properties } = item
      let contentBottom = twips(
        current.flowBounds.y + current.flowBounds.height
      )

      if (
        paragraph.properties.pageBreakBefore &&
        current.y !== current.flowBounds.y
      ) {
        current = advanceFlow(
          section,
          current,
          "page",
          "page-break-before",
          paragraph.id
        )
        contentBottom = twips(current.flowBounds.y + current.flowBounds.height)
      }

      const previous = prepared[paragraphIndex - 1]
      const isChainStart =
        paragraphIndex === 0 ||
        previous?.type !== "paragraph" ||
        !previous.value.paragraph.properties.keepWithNext ||
        paragraph.properties.pageBreakBefore
      let chainEnd = paragraphIndex
      while (isChainStart && chainEnd < prepared.length - 1) {
        const chainCurrent = prepared[chainEnd]
        const chainNext = prepared[chainEnd + 1]
        if (
          chainCurrent?.type !== "paragraph" ||
          !chainCurrent.value.paragraph.properties.keepWithNext ||
          chainNext?.type !== "paragraph" ||
          chainNext.value.paragraph.properties.pageBreakBefore
        )
          break
        chainEnd += 1
      }
      const chainHeight = twips(
        prepared
          .slice(paragraphIndex, chainEnd + 1)
          .reduce(
            (total, entry) =>
              total + (entry.type === "paragraph" ? entry.value.height : 0),
            0
          )
      )
      if (chainEnd > paragraphIndex) {
        if (chainHeight <= current.flowBounds.height) {
          if (
            current.y !== current.flowBounds.y &&
            current.y + chainHeight > contentBottom
          ) {
            current = advanceFlow(
              section,
              current,
              "overflow",
              "keep-with-next",
              paragraph.id
            )
            events.push({
              pageNumber: current.page.pageNumber,
              sourceNodeId: paragraph.id,
              kind: "keep-decision",
              decision: "moved",
              reason: "keep-with-next",
            })
            contentBottom = twips(
              current.flowBounds.y + current.flowBounds.height
            )
          }
        } else {
          diagnostics.push({
            code: "layout/keep-with-next-chain-too-tall",
            severity: "warning",
            message:
              "Keep-with-next chain is taller than a fresh page and was fragmented deterministically",
            source: paragraph.source,
            nodeId: paragraph.id,
            details: {
              paragraphCount: chainEnd - paragraphIndex + 1,
              chainHeight,
            },
          })
          events.push({
            pageNumber: current.page.pageNumber,
            sourceNodeId: paragraph.id,
            kind: "overflow",
            reason: "keep-with-next-chain-too-tall",
          })
          events.push({
            pageNumber: current.page.pageNumber,
            sourceNodeId: paragraph.id,
            kind: "keep-decision",
            decision: "degraded",
            reason: "keep-with-next-chain-too-tall",
          })
        }
      }

      if (
        paragraph.properties.keepLinesTogether &&
        item.height <= current.flowBounds.height &&
        current.y + item.height > contentBottom
      ) {
        current = advanceFlow(
          section,
          current,
          "overflow",
          "keep-lines-together",
          paragraph.id
        )
        events.push({
          pageNumber: current.page.pageNumber,
          sourceNodeId: paragraph.id,
          kind: "keep-decision",
          decision: "moved",
          reason: "keep-lines-together",
        })
        contentBottom = twips(current.flowBounds.y + current.flowBounds.height)
      } else if (
        paragraph.properties.keepLinesTogether &&
        item.height > current.flowBounds.height
      ) {
        diagnostics.push({
          code: "layout/keep-lines-together-too-tall",
          severity: "warning",
          message:
            "Paragraph marked keep-lines-together is taller than a fresh page and was fragmented",
          source: paragraph.source,
          nodeId: paragraph.id,
          details: { paragraphHeight: item.height },
        })
        events.push({
          pageNumber: current.page.pageNumber,
          sourceNodeId: paragraph.id,
          kind: "keep-decision",
          decision: "degraded",
          reason: "keep-lines-together-too-tall",
        })
      }

      current.y = twips(current.y + paragraph.properties.spacingBefore)
      let lineIndex = 0
      let diagnosedWidowImpossible = false
      const isTerminalImplicitEmptyParagraph =
        sectionIndex === document.sections.length - 1 &&
        paragraphIndex === prepared.length - 1 &&
        paragraph.properties.pageBreakBefore === false &&
        paragraph.properties.numbering === null &&
        paragraph.children.every(
          (child) => child.type === "text" && child.text.length === 0
        )
      while (lineIndex < lines.length) {
        throwIfAborted(options.signal)
        let capacity = fittingLineCount(
          lineHeights,
          lineIndex,
          current.y,
          contentBottom
        )
        if (capacity === 0 && current.y !== current.flowBounds.y) {
          // Word requires a paragraph after a terminal table. Google Docs does
          // not materialize a new blank page when that structural paragraph is
          // the only thing that would overflow; explicit page/section breaks
          // remain represented by their own semantic controls above.
          if (isTerminalImplicitEmptyParagraph) {
            lineIndex = lines.length
            break
          }
          current = advanceFlow(
            section,
            current,
            "overflow",
            "line-overflow",
            paragraph.id
          )
          contentBottom = twips(
            current.flowBounds.y + current.flowBounds.height
          )
          continue
        }
        if (capacity === 0) capacity = 1

        const manualBreakOffset = lines
          .slice(lineIndex)
          .findIndex(
            (line) =>
              line.pageBreakAfter === true || line.columnBreakAfter === true
          )
        if (manualBreakOffset >= 0)
          capacity = Math.min(capacity, manualBreakOffset + 1)

        const remaining = lines.length - lineIndex
        let breakReason = "line-overflow"
        if (
          paragraph.properties.widowControl &&
          lines.length >= 4 &&
          manualBreakOffset < 0
        ) {
          if (
            lineIndex === 0 &&
            capacity === 1 &&
            capacity < remaining &&
            current.y !== current.flowBounds.y
          ) {
            current = advanceFlow(
              section,
              current,
              "overflow",
              "widow-orphan",
              paragraph.id
            )
            events.push({
              pageNumber: current.page.pageNumber,
              sourceNodeId: paragraph.id,
              kind: "keep-decision",
              decision: "moved",
              reason: "widow-orphan",
            })
            contentBottom = twips(
              current.flowBounds.y + current.flowBounds.height
            )
            continue
          }
          if (
            capacity < remaining &&
            remaining - capacity === 1 &&
            capacity >= 2
          ) {
            capacity -= 1
            breakReason = "widow-orphan"
            events.push({
              pageNumber: current.page.pageNumber,
              sourceNodeId: paragraph.id,
              kind: "keep-decision",
              decision: "adjusted",
              reason: "widow-orphan",
            })
          }
          if (
            capacity === 1 &&
            capacity < remaining &&
            current.y === current.flowBounds.y &&
            !diagnosedWidowImpossible
          ) {
            diagnosedWidowImpossible = true
            diagnostics.push({
              code: "layout/widow-orphan-impossible",
              severity: "warning",
              message:
                "Page geometry permits only a one-line paragraph fragment; widow control was degraded",
              source: paragraph.source,
              nodeId: paragraph.id,
            })
            events.push({
              pageNumber: current.page.pageNumber,
              sourceNodeId: paragraph.id,
              kind: "keep-decision",
              decision: "degraded",
              reason: "widow-orphan-impossible",
            })
          }
        }

        capacity = Math.min(capacity, remaining)
        const fragmentStartY = current.y
        const firstRenderedLine = lineIndex
        for (let offset = 0; offset < capacity; offset += 1) {
          throwIfAborted(options.signal)
          const line = lines[lineIndex] as MeasuredLine
          const lineHeight = lineHeights[lineIndex] as Twip
          if (current.y + lineHeight > contentBottom) {
            events.push({
              pageNumber: current.page.pageNumber,
              sourceNodeId: paragraph.id,
              kind: "overflow",
              bounds: {
                x: current.flowBounds.x,
                y: current.y,
                width: current.flowBounds.width,
                height: lineHeight,
              },
              reason: "line-taller-than-content-area",
            })
          }

          const box = paragraphLineBox(
            properties,
            current.flowBounds,
            lineIndex === 0
          )
          const justify =
            paragraph.properties.alignment === "justify" && line.wrapped
          const additions = justify
            ? justificationAdditions(line, box.width)
            : new Map<number, Twip>()
          const renderedWidth = justify ? box.width : line.width
          const startX = alignedX(
            paragraph.properties.alignment,
            box,
            renderedWidth
          )
          const naturalHeight = line.ascent + line.descent + line.lineGap
          const leading = Math.max(0, lineHeight - naturalHeight)
          const baselineY = twips(
            current.y + line.ascent + Math.floor(leading / 2)
          )
          if (label && lineIndex === 0)
            emitListLabel(current.items, label, current.flowBounds, baselineY)
          emitLine(current.items, line, additions, startX, baselineY)

          events.push({
            pageNumber: current.page.pageNumber,
            sourceNodeId: paragraph.id,
            kind: "line",
            bounds: {
              x: startX,
              y: current.y,
              width: renderedWidth,
              height: lineHeight,
            },
            charOffset: line.charOffset,
            lineIndex,
          })
          current.y = twips(current.y + lineHeight)
          lineIndex += 1
        }
        const blockBox = paragraphLineBox(
          properties,
          current.flowBounds,
          firstRenderedLine === 0
        )
        events.push({
          pageNumber: current.page.pageNumber,
          sourceNodeId: paragraph.id,
          kind: "block",
          bounds: {
            x: blockBox.x,
            y: fragmentStartY,
            width: blockBox.width,
            height: twips(current.y - fragmentStartY),
          },
        })
        const manualPageBreak = lines[lineIndex - 1]?.pageBreakAfter === true
        const manualColumnBreak =
          lines[lineIndex - 1]?.columnBreakAfter === true
        if (lineIndex < lines.length || manualPageBreak || manualColumnBreak) {
          current = advanceFlow(
            section,
            current,
            manualPageBreak
              ? "page"
              : manualColumnBreak
                ? "column"
                : "overflow",
            manualPageBreak
              ? "manual-page-break"
              : manualColumnBreak
                ? "manual-column-break"
                : breakReason,
            paragraph.id
          )
          contentBottom = twips(
            current.flowBounds.y + current.flowBounds.height
          )
        }
      }
      current.y = twips(current.y + paragraph.properties.spacingAfter)
    }
  }

  const totalPages = pages.length
  const diagnosticCodesByNode = traceDiagnosticCodesByNode(diagnostics)
  const displayList: PageDisplayList = Object.freeze({
    pages: pages.map((page) => {
      throwIfAborted(options.signal)
      const decorated: InternalDisplayItem[] = []
      if (page.header)
        emitHeaderFooter(
          decorated,
          page.header,
          page,
          page.contentBounds,
          page.headerY,
          page.pageNumber,
          totalPages
        )
      decorated.push(...page.items)
      if (page.footer)
        emitHeaderFooter(
          decorated,
          page.footer,
          page,
          page.contentBounds,
          page.footerY,
          page.pageNumber,
          totalPages
        )
      const materialized = decorated.flatMap((item) =>
        materializeItem(item, page.pageNumber, totalPages)
      )
      if (options.includeTrace) {
        for (const item of materialized) {
          if (item.type === "image") {
            events.push({
              pageNumber: page.pageNumber,
              sourceNodeId: item.sourceNodeId,
              kind: "block",
              bounds: item.bounds,
              reason: "inline-image",
            })
          } else if (item.type === "glyph-run") {
            const bounds: Rect = {
              x: item.x,
              y: twips(item.baselineY - item.fontSize),
              width: item.width,
              height: item.fontSize,
            }
            events.push({
              pageNumber: page.pageNumber,
              sourceNodeId: item.sourceNodeId,
              kind: "glyph-run",
              bounds,
              baselineY: item.baselineY,
            })
            for (const code of diagnosticCodesByNode.get(item.sourceNodeId) ??
              [])
              if (FONT_FALLBACK_TRACE_CODES.has(code))
                events.push({
                  pageNumber: page.pageNumber,
                  sourceNodeId: item.sourceNodeId,
                  kind: "font-fallback",
                  bounds,
                  reason: code,
                })
              else if (UNSUPPORTED_APPROXIMATION_TRACE_CODES.has(code))
                events.push({
                  pageNumber: page.pageNumber,
                  sourceNodeId: item.sourceNodeId,
                  kind: "unsupported-approximation",
                  bounds,
                  reason: code,
                })
          }
        }
      }
      return Object.freeze({
        pageNumber: page.pageNumber,
        width: page.width,
        height: page.height,
        contentBounds: page.contentBounds,
        items: Object.freeze(materialized),
      }) as PageDisplayListPage
    }),
  })
  if (options.includeTrace) {
    for (const event of events.slice()) {
      if (event.kind !== "table-row-fragment") continue
      const codes = diagnosticCodesByNode.get(event.sourceNodeId) ?? []
      if (codes.includes("layout/table-vertical-merge-expanded-exact-row"))
        events.push({
          pageNumber: event.pageNumber,
          sourceNodeId: event.sourceNodeId,
          kind: "clipping",
          bounds: event.bounds,
          reason: "avoided-by-vertical-merge-row-expansion",
        })
    }
  }
  const trace: LayoutTrace | undefined = options.includeTrace
    ? Object.freeze({
        pages: Object.freeze(tracePages),
        events: Object.freeze(events),
      })
    : undefined
  const links = collectLinkBoxes(displayList)
  return Object.freeze({
    displayList,
    diagnostics: Object.freeze(diagnostics),
    ...(links.length > 0 ? { links } : {}),
    ...(trace ? { trace } : {}),
  })
}

/** Builds clickable link boxes from glyph runs that carry an href. */
function collectLinkBoxes(displayList: PageDisplayList): readonly LinkBox[] {
  const links: LinkBox[] = []
  for (const [pageIndex, page] of displayList.pages.entries()) {
    for (const item of page.items) {
      if (item.type !== "glyph-run") continue
      const href = item.href
      if (typeof href !== "string" || href.length === 0) continue
      const ascent = twips(Math.round((item.fontSize * 4) / 5))
      const height = twips(Math.max(1, item.fontSize))
      links.push(
        Object.freeze({
          href,
          x: item.x,
          y: twips(item.baselineY - ascent),
          width: item.width,
          height,
          pageIndex,
        })
      )
    }
  }
  return Object.freeze(links)
}

/** Matches `.apex-editor-surface .ProseMirror` CSS `line-height: 1.35`. */
const EDITOR_DEFAULT_LINE_SPACING_240THS = 324

function withEditorDefaultLineSpacing(
  paragraph: ResolvedParagraph
): ResolvedParagraph {
  if (paragraph.properties.lineSpacing !== null) return paragraph
  return {
    ...paragraph,
    properties: {
      ...paragraph.properties,
      lineSpacing: {
        rule: "auto",
        value240ths: EDITOR_DEFAULT_LINE_SPACING_240THS,
      },
    },
  }
}

function withHeaderFooterTableLineSpacing(table: ResolvedTable): ResolvedTable {
  return {
    ...table,
    rows: table.rows.map((row) => ({
      ...row,
      cells: row.cells.map((cell) => ({
        ...cell,
        blocks: cell.blocks.map(withEditorDefaultLineSpacing),
      })),
    })),
  }
}

function prepareParagraph(
  paragraph: ResolvedParagraph,
  width: Twip,
  typography: Typography,
  diagnostics: Diagnostic[],
  numbering: NumberingResolver,
  pageFieldDigits: number,
  assets: ReadonlySet<string>,
  signal?: AbortSignal,
  allowWrap = true
): PreparedParagraph {
  throwIfAborted(signal)
  addCompatibilityDiagnostics(paragraph, typography, diagnostics)
  const label = numbering.resolve(paragraph, typography, signal)
  const properties = listParagraphProperties(paragraph.properties, label)
  let lines = measureParagraph(
    paragraph,
    width,
    typography,
    diagnostics,
    properties,
    pageFieldDigits,
    assets,
    signal,
    allowWrap
  )
  if (label && lines[0]) {
    const first = lines[0]
    lines = Object.freeze([
      {
        ...first,
        ascent: twips(Math.max(first.ascent, label.ascent)),
        descent: twips(Math.max(first.descent, label.descent)),
        lineGap: twips(Math.max(first.lineGap, label.lineGap)),
      },
      ...lines.slice(1),
    ])
  }
  const lineHeights = lines.map((line) => resolveLineHeight(properties, line))
  const height = safeTwipSum(
    [
      paragraph.properties.spacingBefore,
      ...lineHeights,
      paragraph.properties.spacingAfter,
    ],
    "Paragraph height exceeds the safe integer range"
  )
  return { paragraph, lines, lineHeights, label, properties, height }
}

function responsiveTableIntrinsicWidths(
  table: ResolvedTable,
  availableWidth: Twip,
  typography: Typography,
  diagnostics: Diagnostic[],
  pageFieldDigits: number,
  assets: ReadonlySet<string>,
  signal?: AbortSignal
): number[] {
  const widths = table.columnWidths.map(() => 1)
  const measurementWidth = twips(Math.max(availableWidth, 1_000_000))
  for (const row of table.rows) {
    for (const cell of row.cells) {
      if (cell.verticalMerge === "continue") continue
      const padding = cell.cellPadding ?? table.cellPadding
      let contentWidth = 1
      for (const paragraph of cell.blocks) {
        const lines = measureParagraph(
          paragraph,
          measurementWidth,
          typography,
          diagnostics,
          paragraph.properties,
          pageFieldDigits,
          assets,
          signal,
          false
        )
        contentWidth = Math.max(
          contentWidth,
          ...lines.map(
            (line) =>
              line.width +
              paragraph.properties.indentStart +
              paragraph.properties.indentEnd
          )
        )
      }
      const required = Math.max(1, contentWidth + padding.left + padding.right)
      const first = cell.columnIndex
      const last = first + cell.columnSpan
      const current = widths
        .slice(first, last)
        .reduce((sum, width) => sum + width, 0)
      if (required <= current) continue
      const extra = required - current
      const targets = Array.from(
        { length: cell.columnSpan },
        (_, index) => first + index
      )
      const share = Math.floor(extra / targets.length)
      let remainder = extra - share * targets.length
      for (const index of targets) {
        widths[index] = (widths[index] ?? 1) + share + (remainder > 0 ? 1 : 0)
        remainder -= 1
      }
    }
  }
  return widths
}

function resolveResponsiveTable(
  table: ResolvedTable,
  availableWidth: Twip,
  typography: Typography,
  diagnostics: Diagnostic[],
  pageFieldDigits: number,
  assets: ReadonlySet<string>,
  signal?: AbortSignal
): ResolvedTable {
  const sizing = table.sizing
  if (!sizing) return table
  if (sizing.columns.length !== table.columnWidths.length) {
    diagnostics.push({
      code: "layout/table-sizing-invalid",
      severity: "warning",
      message:
        "Responsive table sizing did not match the table grid; authored fixed widths were used",
      source: table.source,
      nodeId: table.id,
    })
    return table
  }
  const fillCount = sizing.columns.filter(
    (column) => column.mode === "fill"
  ).length
  if (
    (sizing.mode === "hug" && fillCount > 0) ||
    (sizing.mode !== "hug" && fillCount === 0)
  ) {
    diagnostics.push({
      code: "layout/table-sizing-constraint",
      severity: "warning",
      message:
        "Responsive table sizing constraints were invalid; authored fixed widths were used",
      source: table.source,
      nodeId: table.id,
    })
    return table
  }

  const intrinsic = responsiveTableIntrinsicWidths(
    table,
    availableWidth,
    typography,
    diagnostics,
    pageFieldDigits,
    assets,
    signal
  )
  const clamp = (value: number, index: number): number => {
    const policy = sizing.columns[index]
    if (!policy) return Math.max(1, value)
    if (!policy.allowMultiline) return Math.max(1, value)
    return Math.max(
      policy.minWidth ?? 1,
      Math.min(value, policy.maxWidth ?? Number.MAX_SAFE_INTEGER)
    )
  }
  const widths = sizing.columns.map((column, index) =>
    clamp(
      column.mode === "hug"
        ? (intrinsic[index] ?? column.width)
        : column.mode === "fixed"
          ? column.width
          : (column.minWidth ?? 1),
      index
    )
  )
  const authoredIndent =
    table.alignment === "left" ? (table.indentStart ?? 0) : 0
  const maximumWidth = Math.max(1, availableWidth - authoredIndent)
  const targetWidth =
    sizing.mode === "fill"
      ? maximumWidth
      : sizing.mode === "fixed"
        ? Math.min(maximumWidth, sizing.width)
        : Math.min(
            maximumWidth,
            widths.reduce((sum, width) => sum + width, 0)
          )

  const fillIndexes = sizing.columns
    .map((column, index) => (column.mode === "fill" ? index : -1))
    .filter((index) => index >= 0)
  if (fillIndexes.length > 0) {
    const occupied = widths.reduce(
      (sum, width, index) =>
        sizing.columns[index]?.mode === "fill" ? sum : sum + width,
      0
    )
    let remaining = Math.max(fillIndexes.length, targetWidth - occupied)
    let active = [...fillIndexes]
    while (active.length > 0) {
      const share = Math.max(1, Math.floor(remaining / active.length))
      const constrained = active.filter((index) => {
        const value = clamp(share, index)
        return value !== share
      })
      if (constrained.length === 0) {
        for (const index of active) widths[index] = share
        let remainder = remaining - share * active.length
        for (const index of active) {
          if (remainder <= 0) break
          widths[index] = (widths[index] ?? 1) + 1
          remainder -= 1
        }
        break
      }
      for (const index of constrained) {
        const value = clamp(share, index)
        widths[index] = value
        remaining -= value
      }
      active = active.filter((index) => !constrained.includes(index))
    }
  }

  let total = widths.reduce((sum, width) => sum + width, 0)
  if (total > maximumWidth) {
    const shrinkable = widths
      .map((width, index) => {
        const policy = sizing.columns[index]
        return {
          index,
          room: policy?.allowMultiline ? width - (policy.minWidth ?? 1) : 0,
        }
      })
      .filter((entry) => entry.room > 0)
    let overflow = total - maximumWidth
    while (overflow > 0 && shrinkable.length > 0) {
      const share = Math.max(1, Math.ceil(overflow / shrinkable.length))
      for (const entry of shrinkable) {
        if (overflow <= 0) break
        const reduction = Math.min(entry.room, share, overflow)
        widths[entry.index] = (widths[entry.index] ?? 1) - reduction
        entry.room -= reduction
        overflow -= reduction
      }
      for (let index = shrinkable.length - 1; index >= 0; index -= 1) {
        if ((shrinkable[index]?.room ?? 0) <= 0) shrinkable.splice(index, 1)
      }
    }
    total = widths.reduce((sum, width) => sum + width, 0)
  }

  const columnWidths = Object.freeze(widths.map((width) => twips(width)))
  const rows = table.rows.map((row) => ({
    ...row,
    cells: row.cells.map((cell) => ({
      ...cell,
      width: twips(
        columnWidths
          .slice(cell.columnIndex, cell.columnIndex + cell.columnSpan)
          .reduce((sum, width) => sum + width, 0)
      ),
    })),
  }))
  return {
    ...table,
    width: twips(total),
    preferredWidth: twips(total),
    columnWidths,
    rows,
  }
}

function prepareTable(
  table: ResolvedTable,
  availableWidth: Twip,
  typography: Typography,
  diagnostics: Diagnostic[],
  numbering: NumberingResolver,
  pageFieldDigits: number,
  assets: ReadonlySet<string>,
  maximumAtomicHeight: Twip,
  signal?: AbortSignal
): PreparedTable {
  throwIfAborted(signal)
  table = resolveResponsiveTable(
    table,
    availableWidth,
    typography,
    diagnostics,
    pageFieldDigits,
    assets,
    signal
  )
  if (table.columnWidths.length === 0)
    throw new RangeError("Invalid table grid: at least one column is required")
  for (const width of table.columnWidths) {
    if (!Number.isSafeInteger(width) || width <= 0)
      throw new RangeError(
        "Invalid table grid: column widths must be positive safe integers"
      )
  }
  const gridWidth = safeTwipSum(
    table.columnWidths,
    "Invalid table grid: combined width exceeds the safe integer range"
  )
  if (table.width !== gridWidth)
    throw new RangeError(
      "Invalid table grid: resolved table width does not equal the grid width"
    )
  const authoredIndent = table.indentStart ?? twips(0)
  if (!Number.isSafeInteger(authoredIndent) || authoredIndent < 0)
    throw new RangeError("Invalid table indentation")
  const alignment = table.alignment ?? "left"
  if (alignment !== "left" && alignment !== "center" && alignment !== "right")
    throw new RangeError("Invalid table alignment")
  const remaining = availableWidth - gridWidth
  const indentStart =
    alignment === "center"
      ? twips(Math.max(0, Math.floor(remaining / 2)))
      : alignment === "right"
        ? twips(Math.max(0, remaining))
        : authoredIndent
  // Word and Google Docs tolerate sub-point grid rounding where fractional
  // dxa values round the declared columns a few twips wider than the writable
  // box. Preserve that authored geometry; reject only a material overflow.
  // Center and right justification consume leftover writable width, so overflow
  // is measured against the grid itself rather than authored left indent.
  if (
    gridWidth + (alignment === "left" ? authoredIndent : 0) > availableWidth &&
    gridWidth + (alignment === "left" ? authoredIndent : 0) - availableWidth >
      20
  )
    throw new RangeError("Invalid table grid: table exceeds the writable width")
  if (table.rows.length === 0)
    throw new RangeError("Invalid table: at least one row is required")
  if (
    !Number.isSafeInteger(table.repeatHeaderRowCount) ||
    table.repeatHeaderRowCount < 0 ||
    table.repeatHeaderRowCount > table.rows.length
  )
    throw new RangeError("Invalid table header-row count")
  for (const side of Object.values(table.cellPadding)) {
    if (!Number.isSafeInteger(side) || side < 0)
      throw new RangeError("Invalid table cell padding")
  }
  validateBorders(table)

  const columnX: Twip[] = [twips(0)]
  for (const width of table.columnWidths)
    columnX.push(
      safeTwipSum(
        [columnX.at(-1) as Twip, width],
        "Invalid table grid: column position exceeds the safe integer range"
      )
    )

  const mergeOwners = new Map<
    number,
    Readonly<{ row: number; span: number; header: boolean }>
  >()
  const rows: PreparedTableRow[] = []
  for (const [rowIndex, row] of table.rows.entries()) {
    throwIfAborted(signal)
    const isHeader = rowIndex < table.repeatHeaderRowCount
    if (row.repeatAsHeader !== isHeader)
      throw new RangeError(
        "Invalid table headers: repeat rows must be contiguous and match repeatHeaderRowCount"
      )
    if (row.cells.length === 0)
      throw new RangeError("Invalid table row: at least one cell is required")
    let previousColumnIndex = -1
    for (const cell of row.cells) {
      if (cell.columnIndex <= previousColumnIndex)
        throw new RangeError(
          "Invalid table row: cells must use strictly increasing columnIndex order"
        )
      previousColumnIndex = cell.columnIndex
    }
    const occupied = new Array<boolean>(table.columnWidths.length).fill(false)
    const continuedOwners = new Set<number>()
    const preparedCells: PreparedTableCell[] = []
    for (const cell of row.cells) {
      throwIfAborted(signal)
      if (
        !Number.isSafeInteger(cell.columnIndex) ||
        !Number.isSafeInteger(cell.columnSpan) ||
        cell.columnIndex < 0 ||
        cell.columnSpan < 1 ||
        cell.columnIndex + cell.columnSpan > table.columnWidths.length
      )
        throw new RangeError("Invalid table grid span")
      for (
        let column = cell.columnIndex;
        column < cell.columnIndex + cell.columnSpan;
        column += 1
      ) {
        if (occupied[column])
          throw new RangeError("Invalid overlapping table cells")
        occupied[column] = true
      }
      const width = safeTwipSum(
        table.columnWidths.slice(
          cell.columnIndex,
          cell.columnIndex + cell.columnSpan
        ),
        "Invalid table cell width"
      )
      if (cell.width !== width)
        throw new RangeError(
          "Invalid table grid: resolved cell width does not equal its spanned columns"
        )
      if (cell.cellPadding !== null && cell.cellPadding !== undefined) {
        for (const side of Object.values(cell.cellPadding)) {
          if (!Number.isSafeInteger(side) || side < 0)
            throw new RangeError("Invalid direct table cell padding")
        }
      }

      const active = mergeOwners.get(cell.columnIndex)
      let mergeOwnerRow: number | null = null
      if (cell.verticalMerge === "continue") {
        if (!active || active.span !== cell.columnSpan)
          throw new RangeError("Invalid vertical merge continuation chain")
        if (active.header !== isHeader)
          throw new RangeError(
            "Invalid vertical merge: a merge cannot cross the header/body boundary"
          )
        mergeOwnerRow = active.row
        continuedOwners.add(cell.columnIndex)
        if (cell.blocks.some((block) => paragraphHasVisibleContent(block)))
          throw new RangeError(
            "Invalid vertical merge continuation: continuation cells cannot own visible content"
          )
      } else if (cell.verticalMerge === "restart") {
        mergeOwners.set(cell.columnIndex, {
          row: rowIndex,
          span: cell.columnSpan,
          header: isHeader,
        })
        continuedOwners.add(cell.columnIndex)
        mergeOwnerRow = rowIndex
      } else if (cell.verticalMerge !== "none") {
        throw new RangeError("Invalid vertical merge value")
      }

      const cellBorders = resolveCellBorders(table, rowIndex, cell)
      const cellPadding = cell.cellPadding ?? table.cellPadding
      const { left: leftBorder, right: rightBorder } = cellBorders
      const { top: topBorder, bottom: bottomBorder } = cellBorders
      const leftInset = safeTwipSum(
        [cellPadding.left, borderSpace(leftBorder)],
        "Invalid table cell inset"
      )
      const rightInset = safeTwipSum(
        [cellPadding.right, borderSpace(rightBorder)],
        "Invalid table cell inset"
      )
      const topInset = safeTwipSum(
        [cellPadding.top, borderSpace(topBorder)],
        "Invalid table cell inset"
      )
      const bottomInset = safeTwipSum(
        [cellPadding.bottom, borderSpace(bottomBorder)],
        "Invalid table cell inset"
      )
      const contentWidth = width - leftInset - rightInset
      if (!Number.isSafeInteger(contentWidth) || contentWidth <= 0)
        throw new RangeError(
          "Invalid table cell: non-positive content box width"
        )
      const paragraphs: PreparedCellParagraph[] = []
      let paragraphTop = twips(0)
      if (cell.verticalMerge !== "continue") {
        for (const paragraph of cell.blocks) {
          const prepared = prepareParagraph(
            paragraph,
            twips(contentWidth),
            typography,
            diagnostics,
            numbering,
            pageFieldDigits,
            assets,
            signal,
            table.sizing?.columns
              .slice(cell.columnIndex, cell.columnIndex + cell.columnSpan)
              .every((column) => column.allowMultiline !== false) ?? true
          )
          if (
            prepared.lineHeights.some(
              (lineHeight) => lineHeight > maximumAtomicHeight
            )
          )
            throw new RangeError(
              "Table row contains an atomic line box taller than a writable fresh page"
            )
          const lineTops: Twip[] = []
          let lineTop = safeTwipSum(
            [paragraphTop, paragraph.properties.spacingBefore],
            "Table cell content height exceeds the safe integer range"
          )
          for (const lineHeight of prepared.lineHeights) {
            lineTops.push(lineTop)
            lineTop = safeTwipSum(
              [lineTop, lineHeight],
              "Table cell content height exceeds the safe integer range"
            )
          }
          paragraphs.push({ ...prepared, top: paragraphTop, lineTops })
          paragraphTop = safeTwipSum(
            [paragraphTop, prepared.height],
            "Table cell content height exceeds the safe integer range"
          )
        }
      }
      preparedCells.push({
        cell,
        x: columnX[cell.columnIndex] as Twip,
        width,
        contentX: safeTwipSum(
          [columnX[cell.columnIndex] as Twip, leftInset],
          "Table cell position exceeds the safe integer range"
        ),
        contentWidth: twips(contentWidth),
        topInset,
        bottomInset,
        borders: cellBorders,
        contentHeight: paragraphTop,
        paragraphs: Object.freeze(paragraphs),
        mergeOwnerRow,
      })
      // A non-continuation at this column terminates a previous chain.
      if (cell.verticalMerge === "none") mergeOwners.delete(cell.columnIndex)
    }
    if (occupied.some((value) => !value))
      throw new RangeError("Invalid table grid: row contains uncovered columns")
    for (const column of [...mergeOwners.keys()]) {
      if (!continuedOwners.has(column)) mergeOwners.delete(column)
    }

    const naturalHeight = preparedCells.reduce<Twip>(
      (maximum, cell) =>
        cell.cell.verticalMerge === "none"
          ? twips(
              Math.max(
                maximum,
                safeTwipSum(
                  [cell.topInset, cell.contentHeight, cell.bottomInset],
                  "Table row height exceeds the safe integer range"
                )
              )
            )
          : maximum,
      twips(0)
    )
    let height = twips(Math.max(1, naturalHeight))
    if (row.height) {
      if (!Number.isSafeInteger(row.height.value) || row.height.value <= 0)
        throw new RangeError("Invalid table row height")
      height =
        row.height.rule === "exact"
          ? naturalHeight > row.height.value
            ? (() => {
                throw new RangeError(
                  "Exact-height table row cannot contain its content without clipping"
                )
              })()
            : row.height.value
          : row.height.rule === "atLeast"
            ? twips(Math.max(naturalHeight, row.height.value))
            : (() => {
                throw new RangeError("Invalid table row height rule")
              })()
    }
    if (height <= 0)
      throw new RangeError("Invalid table row: non-positive content box height")
    for (const cell of preparedCells.filter(
      (candidate) => candidate.cell.verticalMerge === "none"
    )) {
      if (height - cell.topInset - cell.bottomInset <= 0)
        throw new RangeError(
          "Invalid table cell: non-positive content box height"
        )
    }
    rows.push({
      row,
      index: rowIndex,
      cells: preparedCells,
      top: twips(0),
      height,
    })
  }

  const mergeChains: PreparedMergeChain[] = []
  for (const ownerRow of rows) {
    for (const owner of ownerRow.cells) {
      if (owner.cell.verticalMerge !== "restart") continue
      let finalRow = ownerRow.index
      for (
        let rowIndex = ownerRow.index + 1;
        rowIndex < rows.length;
        rowIndex += 1
      ) {
        const continuation = rows[rowIndex]?.cells.find(
          (cell) =>
            cell.cell.columnIndex === owner.cell.columnIndex &&
            cell.cell.columnSpan === owner.cell.columnSpan
        )
        if (continuation?.cell.verticalMerge !== "continue") break
        finalRow = rowIndex
      }
      mergeChains.push({
        ownerRow: ownerRow.index,
        finalRow,
        columnIndex: owner.cell.columnIndex,
        columnSpan: owner.cell.columnSpan,
      })
    }
  }

  const sizedRows = rows.map((row) => ({ ...row }))
  for (const chain of mergeChains) {
    const owner = findPreparedCell(
      sizedRows[chain.ownerRow] as PreparedTableRow,
      chain.columnIndex,
      chain.columnSpan
    )
    const finalCell = findPreparedCell(
      sizedRows[chain.finalRow] as PreparedTableRow,
      chain.columnIndex,
      chain.columnSpan
    )
    const required = safeTwipSum(
      [owner.topInset, owner.contentHeight, finalCell.bottomInset],
      "Vertically merged table cell height exceeds the safe integer range"
    )
    const allocated = safeTwipSum(
      sizedRows
        .slice(chain.ownerRow, chain.finalRow + 1)
        .map((row) => row.height),
      "Vertically merged table rows exceed the safe integer range"
    )
    if (required > allocated) {
      const final = sizedRows[chain.finalRow] as PreparedTableRow
      if (final.row.height?.rule === "exact") {
        diagnostics.push({
          code: "layout/table-vertical-merge-expanded-exact-row",
          severity: "warning",
          message:
            "A vertically merged cell required expansion of its final exact-height row to avoid clipping",
          source: final.row.source,
          nodeId: final.row.id,
          details: { deficit: required - allocated },
        })
      }
      sizedRows[chain.finalRow] = {
        ...final,
        height: safeTwipSum(
          [final.height, required - allocated],
          "Vertically merged table row height exceeds the safe integer range"
        ),
      }
    }
  }
  let rowTop = twips(0)
  for (const [index, row] of sizedRows.entries()) {
    sizedRows[index] = { ...row, top: rowTop }
    rowTop = safeTwipSum(
      [rowTop, row.height],
      "Table height exceeds the safe integer range"
    )
  }
  const headerHeight = safeTwipSum(
    sizedRows.slice(0, table.repeatHeaderRowCount).map((row) => row.height),
    "Table header height exceeds the safe integer range"
  )
  return {
    table,
    indentStart,
    rows: Object.freeze(sizedRows),
    mergeChains: Object.freeze(mergeChains),
    headerHeight,
  }
}

function paginateTable(
  prepared: PreparedTable,
  section: ResolvedDocument["sections"][number],
  initial: PageState,
  createPage: (
    section: ResolvedDocument["sections"][number],
    reason?: string,
    sourceNodeId?: NodeId
  ) => PageState,
  diagnostics: Diagnostic[],
  events: LayoutTraceEvent[],
  signal?: AbortSignal
): PageState {
  const firstTableEvent = events.length
  let current = initial
  const { table, rows } = prepared
  const bodyStart = table.repeatHeaderRowCount
  let originalHeadersComplete = bodyStart === 0
  let currentHasRepeatedHeaders = false
  let diagnosedHeaderDegradation = false
  let diagnosedHeaderTooTall = false

  const bottom = (): Twip =>
    safeTwipSum(
      [current.flowBounds.y, current.flowBounds.height],
      "Page content bounds exceed the safe integer range"
    )
  const freshPage = (sourceNodeId: NodeId, repeatHeaders = true): void => {
    current = createPage(section, "table-continuation", sourceNodeId)
    currentHasRepeatedHeaders = false
    if (repeatHeaders && originalHeadersComplete && prepared.headerHeight > 0) {
      if (prepared.headerHeight >= current.flowBounds.height) {
        if (!diagnosedHeaderTooTall) {
          diagnosedHeaderTooTall = true
          diagnostics.push({
            code: "layout/table-header-too-tall",
            severity: "warning",
            message:
              "Repeating table headers leave no room for body rows and were omitted on continuation pages",
            source: table.source,
            nodeId: table.id,
            details: { headerHeight: prepared.headerHeight },
          })
          events.push({
            pageNumber: current.page.pageNumber,
            sourceNodeId: table.id,
            kind: "unsupported-approximation",
            reason: "table-header-too-tall",
          })
        }
      } else {
        for (const header of rows.slice(0, bodyStart)) {
          emitTableRowFragment(
            prepared,
            header,
            twips(0),
            header.height,
            current,
            events,
            true
          )
          current.y = safeTwipSum(
            [current.y, header.height],
            "Table position exceeds the safe integer range"
          )
        }
        currentHasRepeatedHeaders = true
      }
    }
  }

  if (
    bodyStart > 0 &&
    prepared.headerHeight <= current.flowBounds.height &&
    prepared.headerHeight > bottom() - current.y &&
    current.y !== current.flowBounds.y
  ) {
    current = createPage(section, "table-header-group", table.id)
  }

  for (const row of rows) {
    throwIfAborted(signal)
    let offset = twips(0)
    let diagnosedCantSplit = false
    while (offset < row.height) {
      throwIfAborted(signal)
      const remaining = row.height - offset
      let capacity = bottom() - current.y
      if (
        offset === 0 &&
        !row.row.allowBreakAcrossPages &&
        remaining <=
          current.flowBounds.height -
            (row.index >= bodyStart ? prepared.headerHeight : 0) &&
        remaining > capacity &&
        current.y !== current.flowBounds.y
      ) {
        freshPage(row.row.id)
        events.push({
          pageNumber: current.page.pageNumber,
          sourceNodeId: row.row.id,
          kind: "keep-decision",
          decision: "moved",
          reason: "table-cant-split",
        })
        continue
      }
      if (
        offset === 0 &&
        !row.row.allowBreakAcrossPages &&
        remaining >
          current.flowBounds.height -
            (row.index >= bodyStart ? prepared.headerHeight : 0) &&
        !diagnosedCantSplit
      ) {
        diagnosedCantSplit = true
        diagnostics.push({
          code: "layout/table-cant-split-too-tall",
          severity: "warning",
          message:
            "A cantSplit table row is taller than a fresh page and was fragmented deterministically",
          source: row.row.source,
          nodeId: row.row.id,
          details: { rowHeight: row.height },
        })
        events.push({
          pageNumber: current.page.pageNumber,
          sourceNodeId: row.row.id,
          kind: "keep-decision",
          decision: "degraded",
          reason: "table-cant-split-too-tall",
        })
        events.push({
          pageNumber: current.page.pageNumber,
          sourceNodeId: row.row.id,
          kind: "unsupported-approximation",
          reason: "table-cant-split-too-tall",
        })
      }
      capacity = bottom() - current.y
      if (capacity <= 0) {
        freshPage(row.row.id)
        continue
      }
      const fragmentHeight = safeTableFragmentHeight(
        prepared,
        row,
        offset,
        twips(capacity)
      )
      if (fragmentHeight <= 0) {
        if (current.y !== current.flowBounds.y) {
          if (currentHasRepeatedHeaders) {
            const headerCapacity = twips(
              current.flowBounds.height - prepared.headerHeight
            )
            const fitsWithHeaders =
              headerCapacity > 0 &&
              safeTableFragmentHeight(prepared, row, offset, headerCapacity) > 0
            if (!fitsWithHeaders) {
              if (!diagnosedHeaderDegradation) {
                diagnosedHeaderDegradation = true
                diagnostics.push({
                  code: "layout/table-header-repeat-degraded-for-atomic-line",
                  severity: "warning",
                  message:
                    "Repeating headers were omitted from one or more continuation pages so an atomic table line could fit",
                  source: row.row.source,
                  nodeId: row.row.id,
                })
                events.push({
                  pageNumber: current.page.pageNumber,
                  sourceNodeId: row.row.id,
                  kind: "unsupported-approximation",
                  reason: "table-header-repeat-degraded-for-atomic-line",
                })
              }
              freshPage(row.row.id, false)
              continue
            }
          }
          freshPage(row.row.id)
          continue
        }
        throw new RangeError(
          "Table row contains an atomic line box taller than a writable fresh page"
        )
      }
      emitTableRowFragment(
        prepared,
        row,
        offset,
        fragmentHeight,
        current,
        events
      )
      current.y = safeTwipSum(
        [current.y, fragmentHeight],
        "Table position exceeds the safe integer range"
      )
      offset = safeTwipSum(
        [offset, fragmentHeight],
        "Table fragment offset exceeds the safe integer range"
      )
      if (offset < row.height) freshPage(row.row.id)
    }
    if (row.index === bodyStart - 1) originalHeadersComplete = true
  }
  const rowFragments = events
    .slice(firstTableEvent)
    .filter(
      (
        event
      ): event is Extract<LayoutTraceEvent, { kind: "table-row-fragment" }> =>
        event.kind === "table-row-fragment"
    )
  for (const pageNumber of [
    ...new Set(rowFragments.map((event) => event.pageNumber)),
  ].sort((left, right) => left - right)) {
    const fragments = rowFragments.filter(
      (event) => event.pageNumber === pageNumber
    )
    const left = Math.min(...fragments.map((event) => event.bounds.x))
    const top = Math.min(...fragments.map((event) => event.bounds.y))
    const right = Math.max(
      ...fragments.map((event) => event.bounds.x + event.bounds.width)
    )
    const bottom = Math.max(
      ...fragments.map((event) => event.bounds.y + event.bounds.height)
    )
    events.push({
      pageNumber,
      sourceNodeId: table.id,
      kind: "table",
      bounds: {
        x: twips(left),
        y: twips(top),
        width: twips(right - left),
        height: twips(bottom - top),
      },
      reason: "page-fragment",
    })
  }
  return current
}

function emitTableRowFragment(
  prepared: PreparedTable,
  row: PreparedTableRow,
  offset: Twip,
  height: Twip,
  current: PageState,
  events: LayoutTraceEvent[],
  repeatedHeader = false
): void {
  const { table } = prepared
  const rowY = current.y
  const isFirstFragment = offset === 0
  const isLastFragment = offset + height === row.height

  // Paint every background before any text in this fragment.
  const shadings: DisplayListItem[] = []
  for (const cell of row.cells) {
    const x = safeTwipSum(
      [current.flowBounds.x, prepared.indentStart, cell.x],
      "Table cell position exceeds the safe integer range"
    )
    const paintOwner = mergeOwnerCell(prepared, cell)
    if (paintOwner.cell.fillColor) {
      shadings.push({
        type: "rectangle",
        sourceNodeId: paintOwner.cell.id,
        bounds: { x, y: rowY, width: cell.width, height },
        fillColor: paintOwner.cell.fillColor,
      })
    }
  }
  insertTableLayerItems(current.items, shadings, prepared, "shading")

  // Emit only complete line boxes whose logical starts belong to this row
  // fragment. Atomic-boundary pagination guarantees they fit on this page.
  const logicalStart = safeTwipSum(
    [row.top, offset],
    "Table fragment position exceeds the safe integer range"
  )
  const logicalEnd = safeTwipSum(
    [logicalStart, height],
    "Table fragment position exceeds the safe integer range"
  )
  const pageBottom = safeTwipSum(
    [current.flowBounds.y, current.flowBounds.height],
    "Page content bounds exceed the safe integer range"
  )
  const textItems: InternalDisplayItem[] = []
  for (const placement of tableLinePlacements(prepared)) {
    if (
      placement.top < logicalStart ||
      placement.top >= logicalEnd ||
      placement.bottom - logicalStart > pageBottom - rowY
    )
      continue
    emitTableLinePlacement(
      placement,
      current,
      textItems,
      rowY,
      logicalStart,
      prepared.indentStart,
      events
    )
  }
  insertTableLayerItems(current.items, textItems, prepared, "text")

  // Borders are last so they remain crisp above shading and text.
  for (const cell of row.cells) {
    const x = safeTwipSum(
      [current.flowBounds.x, prepared.indentStart, cell.x],
      "Table cell position exceeds the safe integer range"
    )
    const isMergeContinuation = cell.cell.verticalMerge === "continue"
    if (isFirstFragment) {
      if (!isMergeContinuation)
        emitBorder(
          current.items,
          cell.borders.top,
          cell.cell.id,
          x,
          rowY,
          cell.width,
          true
        )
    }
    // Shared inside-horizontal borders are emitted only as the following
    // row's top border. The table bottom is the sole bottom-edge emission.
    if (isLastFragment && row.index === prepared.rows.length - 1) {
      emitBorder(
        current.items,
        cell.borders.bottom,
        cell.cell.id,
        x,
        twips(rowY + height),
        cell.width,
        true
      )
    }
    emitBorder(
      current.items,
      cell.borders.left,
      cell.cell.id,
      x,
      rowY,
      height,
      false
    )
    if (
      cell.cell.columnIndex + cell.cell.columnSpan ===
      table.columnWidths.length
    ) {
      emitBorder(
        current.items,
        cell.borders.right,
        cell.cell.id,
        twips(x + cell.width),
        rowY,
        height,
        false
      )
    }
  }
  events.push({
    pageNumber: current.page.pageNumber,
    sourceNodeId: row.row.id,
    kind: "table-row-fragment",
    bounds: {
      x: safeTwipSum(
        [current.flowBounds.x, prepared.indentStart],
        "Table position exceeds the safe integer range"
      ),
      y: rowY,
      width: table.width,
      height,
    },
    fragmentOffset: offset,
    rowHeight: row.height,
    repeatedHeader,
    ...(offset > 0 || height < row.height ? { reason: "fragmented" } : {}),
  })
}

type TableLinePlacement = Readonly<{
  cell: PreparedTableCell
  paragraph: PreparedCellParagraph
  lineIndex: number
  line: MeasuredLine
  top: Twip
  bottom: Twip
}>

function tableLinePlacements(
  prepared: PreparedTable
): readonly TableLinePlacement[] {
  const placements: TableLinePlacement[] = []
  for (const row of prepared.rows) {
    for (const cell of row.cells) {
      if (cell.cell.verticalMerge === "continue") continue
      const contentTop = tableCellContentTop(prepared, row, cell)
      for (const paragraph of cell.paragraphs) {
        for (const [lineIndex, line] of paragraph.lines.entries()) {
          const top = safeTwipSum(
            [contentTop, paragraph.lineTops[lineIndex] as Twip],
            "Table cell line position exceeds the safe integer range"
          )
          placements.push({
            cell,
            paragraph,
            lineIndex,
            line,
            top,
            bottom: safeTwipSum(
              [top, paragraph.lineHeights[lineIndex] as Twip],
              "Table cell line position exceeds the safe integer range"
            ),
          })
        }
      }
    }
  }
  return placements
}

function safeTableFragmentHeight(
  prepared: PreparedTable,
  row: PreparedTableRow,
  offset: Twip,
  capacity: Twip
): Twip {
  const start = safeTwipSum(
    [row.top, offset],
    "Table fragment position exceeds the safe integer range"
  )
  const rowEnd = safeTwipSum(
    [row.top, row.height],
    "Table fragment position exceeds the safe integer range"
  )
  const pageLimit = safeTwipSum(
    [start, capacity],
    "Table fragment position exceeds the safe integer range"
  )
  let end = twips(Math.min(rowEnd, pageLimit))
  const placements = tableLinePlacements(prepared)
  let changed = true
  while (changed) {
    changed = false
    for (const placement of placements) {
      if (
        placement.top < end &&
        placement.bottom > end &&
        // A line may cross an internal row boundary, but never a page break.
        !(end === rowEnd && placement.bottom <= pageLimit)
      ) {
        end = twips(Math.max(start, placement.top))
        changed = true
      }
    }
  }
  const height = twips(end - start)
  if (height <= 0 || end === rowEnd) return height
  const containsCompleteLine = placements.some(
    (placement) =>
      placement.top >= start &&
      placement.bottom <= end &&
      placement.bottom > start
  )
  if (containsCompleteLine) return height
  // A leftover that cannot hold the next atomic line is not a valid page
  // fragment. Move the remaining row instead of painting padding-only slivers.
  const remainingLineStartsInRow = placements.some(
    (placement) => placement.top >= start && placement.top < rowEnd
  )
  return remainingLineStartsInRow ? twips(0) : height
}

function tableCellContentTop(
  prepared: PreparedTable,
  row: PreparedTableRow,
  cell: PreparedTableCell
): Twip {
  const chain = prepared.mergeChains.find(
    (candidate) =>
      candidate.ownerRow === row.index &&
      candidate.columnIndex === cell.cell.columnIndex &&
      candidate.columnSpan === cell.cell.columnSpan
  )
  const regionTop = row.top
  const regionHeight = chain
    ? safeTwipSum(
        prepared.rows
          .slice(chain.ownerRow, chain.finalRow + 1)
          .map((candidate) => candidate.height),
        "Vertically merged table cell height exceeds the safe integer range"
      )
    : row.height
  const bottomInset = chain
    ? findPreparedCell(
        prepared.rows[chain.finalRow] as PreparedTableRow,
        chain.columnIndex,
        chain.columnSpan
      ).bottomInset
    : cell.bottomInset
  const extra = Math.max(
    0,
    regionHeight - cell.topInset - bottomInset - cell.contentHeight
  )
  const alignmentOffset =
    cell.cell.verticalAlignment === "bottom"
      ? extra
      : cell.cell.verticalAlignment === "center"
        ? Math.floor(extra / 2)
        : 0
  return safeTwipSum(
    [regionTop, cell.topInset, twips(alignmentOffset)],
    "Table cell content position exceeds the safe integer range"
  )
}

function emitTableLinePlacement(
  placement: TableLinePlacement,
  current: PageState,
  items: InternalDisplayItem[],
  rowY: Twip,
  logicalStart: Twip,
  tableIndentStart: Twip,
  events: LayoutTraceEvent[]
): void {
  const { cell, paragraph, lineIndex, line } = placement
  const lineHeight = paragraph.lineHeights[lineIndex] as Twip
  const localY = safeTwipSum(
    [rowY, placement.top - logicalStart],
    "Table cell line position exceeds the safe integer range"
  )
  const bounds: Rect = {
    x: safeTwipSum(
      [current.flowBounds.x, tableIndentStart, cell.contentX],
      "Table cell line position exceeds the safe integer range"
    ),
    y: localY,
    width: cell.contentWidth,
    height: lineHeight,
  }
  const box = paragraphLineBox(paragraph.properties, bounds, lineIndex === 0)
  const justify =
    paragraph.paragraph.properties.alignment === "justify" && line.wrapped
  const additions = justify
    ? justificationAdditions(line, box.width)
    : new Map<number, Twip>()
  const renderedWidth = justify ? box.width : line.width
  const startX = alignedX(
    paragraph.paragraph.properties.alignment,
    box,
    renderedWidth
  )
  const naturalHeight = line.ascent + line.descent + line.lineGap
  const leading = Math.max(0, lineHeight - naturalHeight)
  const baselineY = twips(localY + line.ascent + Math.floor(leading / 2))
  if (paragraph.label && lineIndex === 0)
    emitListLabel(items, paragraph.label, bounds, baselineY)
  emitLine(items, line, additions, startX, baselineY)
  events.push({
    pageNumber: current.page.pageNumber,
    sourceNodeId: paragraph.paragraph.id,
    kind: "line",
    bounds: {
      x: startX,
      y: localY,
      width: renderedWidth,
      height: lineHeight,
    },
    charOffset: line.charOffset,
    lineIndex,
  })
}

function insertTableLayerItems(
  target: InternalDisplayItem[],
  additions: readonly InternalDisplayItem[],
  prepared: PreparedTable,
  layer: "shading" | "text"
): void {
  if (additions.length === 0) return
  const cellIds = new Set(
    prepared.rows.flatMap((row) => row.cells.map((cell) => cell.cell.id))
  )
  const tableIds = new Set<NodeId>(cellIds)
  for (const row of prepared.rows) {
    tableIds.add(row.row.id)
    for (const cell of row.cells) {
      for (const paragraph of cell.paragraphs) {
        tableIds.add(paragraph.paragraph.id)
        for (const child of paragraph.paragraph.children) tableIds.add(child.id)
      }
    }
  }
  const index = target.findIndex((item) => {
    if (!tableIds.has(item.sourceNodeId)) return false
    if (layer === "shading") return item.type !== "rectangle"
    return item.type === "line" && cellIds.has(item.sourceNodeId)
  })
  if (index < 0) target.push(...additions)
  else target.splice(index, 0, ...additions)
}

function mergeOwnerCell(
  prepared: PreparedTable,
  cell: PreparedTableCell
): PreparedTableCell {
  if (cell.mergeOwnerRow === null) return cell
  return findPreparedCell(
    prepared.rows[cell.mergeOwnerRow] as PreparedTableRow,
    cell.cell.columnIndex,
    cell.cell.columnSpan
  )
}

function findPreparedCell(
  row: PreparedTableRow,
  columnIndex: number,
  columnSpan: number
): PreparedTableCell {
  const cell = row.cells.find(
    (candidate) =>
      candidate.cell.columnIndex === columnIndex &&
      candidate.cell.columnSpan === columnSpan
  )
  if (!cell) throw new RangeError("Invalid vertical merge owner geometry")
  return cell
}

function emitBorder(
  items: InternalDisplayItem[],
  border: TableBorder | null,
  sourceNodeId: NodeId,
  x: Twip,
  y: Twip,
  length: Twip,
  horizontal: boolean
): void {
  if (!border || border.style === "none" || border.width <= 0) return
  const push = (offset: Twip): void => {
    const strokeWidth =
      border.style === "dotted"
        ? twips(Math.ceil(border.width / 20) * 20)
        : border.width
    const dashArray =
      border.style === "dotted"
        ? ([twips(1), twips(Math.max(20, border.width * 2 - 1))] as const)
        : border.style === "dashed"
          ? ([
              twips(Math.max(1, border.width * 4)),
              twips(Math.max(1, border.width * 2)),
            ] as const)
          : undefined
    items.push({
      type: "line",
      sourceNodeId,
      x1: horizontal ? x : twips(x + offset),
      y1: horizontal ? twips(y + offset) : y,
      x2: horizontal ? twips(x + length) : twips(x + offset),
      y2: horizontal ? twips(y + offset) : twips(y + length),
      width: strokeWidth,
      color: border.color,
      ...(dashArray ? { dashArray } : {}),
      ...(border.style === "dotted" ? { lineCap: "round" as const } : {}),
    })
  }
  if (border.style === "double") {
    push(twips(-border.width))
    push(border.width)
  } else push(twips(0))
}

function validateBorders(table: ResolvedTable): void {
  for (const border of Object.values(table.borders)) {
    validateBorder(border)
  }
  for (const row of table.rows) {
    for (const cell of row.cells) {
      if (cell.borders === undefined)
        throw new RangeError("Invalid table cell borders")
      for (const border of Object.values(cell.borders)) validateBorder(border)
    }
  }
}

function validateBorder(border: TableBorder | null): void {
  if (!border) return
  if (
    !["none", "single", "double", "dotted", "dashed"].includes(border.style) ||
    !Number.isSafeInteger(border.width) ||
    border.width < 0 ||
    !Number.isSafeInteger(border.space) ||
    border.space < 0 ||
    typeof border.color !== "string"
  )
    throw new RangeError("Invalid table border")
}

function verticalMergeOwnerCell(
  table: ResolvedTable,
  rowIndex: number,
  cell: ResolvedTableCell
): ResolvedTableCell {
  if (cell.verticalMerge !== "continue") return cell
  for (let index = rowIndex - 1; index >= 0; index -= 1) {
    const candidate = table.rows[index]?.cells.find(
      (entry) =>
        entry.columnIndex === cell.columnIndex &&
        entry.columnSpan === cell.columnSpan
    )
    if (candidate?.verticalMerge === "restart") return candidate
    if (candidate?.verticalMerge !== "continue") break
  }
  throw new RangeError("Invalid vertical merge continuation chain")
}

function sharedDirectBorder(
  candidates: readonly (TableBorder | null)[]
): TableBorder | null | undefined {
  const direct = candidates.filter(
    (border): border is TableBorder => border !== null
  )
  if (direct.length === 0) return undefined

  // Word permits the two cells on a shared edge to carry different direct
  // border declarations. Resolve both cells to the same visible winner so the
  // edge is painted once consistently. A visible border always defeats an
  // explicit `nil`/`none`; width and then style break remaining ties.
  const stylePriority: Readonly<Record<TableBorder["style"], number>> = {
    none: 0,
    dotted: 1,
    dashed: 2,
    single: 3,
    double: 4,
  }
  return direct.reduce((winner, candidate) => {
    const winnerVisible = winner.style === "none" ? 0 : 1
    const candidateVisible = candidate.style === "none" ? 0 : 1
    if (candidateVisible !== winnerVisible)
      return candidateVisible > winnerVisible ? candidate : winner
    if (candidate.width !== winner.width)
      return candidate.width > winner.width ? candidate : winner
    if (stylePriority[candidate.style] !== stylePriority[winner.style])
      return stylePriority[candidate.style] > stylePriority[winner.style]
        ? candidate
        : winner
    if (candidate.space !== winner.space)
      return candidate.space > winner.space ? candidate : winner
    return winner
  })
}

function resolveCellBorders(
  table: ResolvedTable,
  rowIndex: number,
  cell: ResolvedTableCell
): PreparedTableCell["borders"] {
  const row = table.rows[rowIndex]
  if (row === undefined) throw new RangeError("Invalid table row")
  const owner = verticalMergeOwnerCell(table, rowIndex, cell)
  const previous = row.cells.find(
    (candidate) =>
      candidate.columnIndex + candidate.columnSpan === cell.columnIndex
  )
  const next = row.cells.find(
    (candidate) => cell.columnIndex + cell.columnSpan === candidate.columnIndex
  )
  const previousRow = table.rows[rowIndex - 1]
  const nextRow = table.rows[rowIndex + 1]
  const overlapping = (
    adjacentRow: ResolvedTableRow | undefined
  ): readonly ResolvedTableCell[] =>
    adjacentRow?.cells.filter(
      (candidate) =>
        candidate.columnIndex < cell.columnIndex + cell.columnSpan &&
        cell.columnIndex < candidate.columnIndex + candidate.columnSpan
    ) ?? []
  const above = overlapping(previousRow)
  const below = overlapping(nextRow)
  const sameMergeAbove =
    cell.verticalMerge === "continue" &&
    above.length === 1 &&
    above[0]?.columnIndex === cell.columnIndex &&
    above[0]?.columnSpan === cell.columnSpan
  const sameMergeBelow =
    below.length === 1 &&
    below[0]?.verticalMerge === "continue" &&
    below[0]?.columnIndex === cell.columnIndex &&
    below[0]?.columnSpan === cell.columnSpan
  const directFrom = (
    adjacent: ResolvedTableCell | undefined,
    adjacentRowIndex: number,
    side: "top" | "right" | "bottom" | "left"
  ): TableBorder | null =>
    adjacent === undefined
      ? null
      : verticalMergeOwnerCell(table, adjacentRowIndex, adjacent).borders[side]
  const directTop = sameMergeAbove
    ? null
    : sharedDirectBorder([
        owner.borders.top,
        ...above.map((candidate) =>
          directFrom(candidate, rowIndex - 1, "bottom")
        ),
      ])
  const directBottom = sameMergeBelow
    ? null
    : sharedDirectBorder([
        owner.borders.bottom,
        ...below.map((candidate) => directFrom(candidate, rowIndex + 1, "top")),
      ])
  const directLeftCandidates = [
    owner.borders.left,
    directFrom(previous, rowIndex, "right"),
  ] as const
  const directRightCandidates = [
    owner.borders.right,
    directFrom(next, rowIndex, "left"),
  ] as const
  const directLeft = sharedDirectBorder(directLeftCandidates)
  const directRight = sharedDirectBorder(directRightCandidates)
  const hasBorderOverrides = (candidate: ResolvedTableCell): boolean =>
    Object.values(
      verticalMergeOwnerCell(table, rowIndex, candidate).borders
    ).some((border) => border !== null)
  const ownerHasBorderOverrides = hasBorderOverrides(cell)
  const internalVertical = (
    direct: TableBorder | null | undefined,
    adjacent: ResolvedTableCell | undefined
  ): TableBorder | null => {
    const fallback = table.borders.insideVertical
    const ownerCell = verticalMergeOwnerCell(table, rowIndex, cell)
    const adjacentOwner =
      adjacent === undefined
        ? undefined
        : verticalMergeOwnerCell(table, rowIndex, adjacent)
    const visibleMergedBoundary =
      cell.verticalMerge !== "none" &&
      adjacent?.verticalMerge !== "none" &&
      (ownerCell.columnSpan >= 3 || (adjacentOwner?.columnSpan ?? 0) >= 3) &&
      ownerCell.blocks.some(paragraphHasVisibleContent) &&
      adjacentOwner?.blocks.some(paragraphHasVisibleContent) === true
    // Google Docs retains the inherited inside border between two independent,
    // content-bearing vertical merge regions (for example a prescription body
    // and its side note), even when their owner cells carry nil sides.
    if (
      direct?.style === "none" &&
      visibleMergedBoundary &&
      fallback?.style !== "none"
    )
      return fallback
    if (direct !== undefined) return direct
    return ownerHasBorderOverrides ||
      (adjacent !== undefined && hasBorderOverrides(adjacent))
      ? null
      : fallback
  }
  return {
    top: sameMergeAbove
      ? null
      : (directTop ??
        (rowIndex === 0 ? table.borders.top : table.borders.insideHorizontal)),
    bottom: sameMergeBelow
      ? null
      : (directBottom ??
        (rowIndex === table.rows.length - 1
          ? table.borders.bottom
          : table.borders.insideHorizontal)),
    left:
      cell.columnIndex === 0
        ? (directLeft ?? table.borders.left)
        : internalVertical(directLeft, previous),
    right:
      cell.columnIndex + cell.columnSpan === table.columnWidths.length
        ? (directRight ?? table.borders.right)
        : internalVertical(directRight, next),
  }
}

function borderSpace(border: TableBorder | null): Twip {
  return border?.style === "none" ? twips(0) : (border?.space ?? twips(0))
}

function paragraphHasVisibleContent(paragraph: ResolvedParagraph): boolean {
  return paragraph.children.some(
    (child) => child.type !== "text" || child.text.length > 0
  )
}

function validateAssets(document: ResolvedDocument): ReadonlySet<string> {
  const ids = new Set<string>()
  for (const asset of document.assets ?? []) {
    if (typeof asset.id !== "string" || asset.id.length === 0)
      throw new RangeError("Image asset IDs must be non-empty strings")
    if (ids.has(asset.id))
      throw new RangeError(`Duplicate image asset '${asset.id}'`)
    ids.add(asset.id)
  }
  return ids
}

function indexHeaderFooters(
  definitions: ResolvedDocument["headers"] | ResolvedDocument["footers"],
  kind: "header" | "footer"
): ReadonlyMap<string, ResolvedDocument["headers"][number]> {
  const result = new Map<string, ResolvedDocument["headers"][number]>()
  for (const definition of definitions ?? []) {
    if (definition.type !== kind)
      throw new RangeError(`Invalid ${kind} definition type`)
    if (typeof definition.id !== "string" || definition.id.length === 0)
      throw new RangeError(`${kind} IDs must be non-empty strings`)
    if (result.has(definition.id))
      throw new RangeError(`Duplicate ${kind} '${definition.id}'`)
    result.set(definition.id, definition)
  }
  return result
}

function validateImage(
  image: Extract<ResolvedInline, { type: "image" }>,
  assets: ReadonlySet<string>
): void {
  if (!assets.has(image.assetId))
    throw new RangeError(
      `Inline image references missing asset '${image.assetId}'`
    )
  if (
    !Number.isSafeInteger(image.width) ||
    !Number.isSafeInteger(image.height) ||
    image.width <= 0 ||
    image.height <= 0
  )
    throw new RangeError(
      "Inline image dimensions must be positive safe integers"
    )
}

const IMAGE_STYLE: TextStyle = Object.freeze({
  fontFamily: "Helvetica",
  fontSize: twips(1),
  fontWeight: 400,
  fontStyle: "normal",
  underline: false,
  color: "#000000",
})

function prepareImageCluster(
  image: Extract<ResolvedInline, { type: "image" }>
): Cluster {
  return Object.freeze({
    text: "",
    style: IMAGE_STYLE,
    sourceNodeId: image.id,
    width: image.width,
    ascent: image.height,
    descent: twips(0),
    lineGap: twips(0),
    baselineShift: twips(0),
    whitespace: false,
    preserveSpace: true,
    underlineOffset: twips(0),
    underlineThickness: twips(0),
    atom: Object.freeze({
      type: "image",
      assetId: image.assetId,
      height: image.height,
      offsetX:
        image.placement?.type === "anchor" ? image.placement.offsetX : twips(0),
      offsetY:
        image.placement?.type === "anchor" ? image.placement.offsetY : twips(0),
    }),
  })
}

function preparePageFieldCluster(
  field: Extract<ResolvedInline, { type: "pageField" }>,
  typography: Typography,
  digits: number
): Cluster {
  if (field.format !== "decimal")
    throw new TypeError("Only decimal PAGE and NUMPAGES fields are supported")
  const presentation = scriptPresentation(field.style)
  let resolvedStyle = presentation.style
  let widestDigit = twips(0)
  const digitAdvances = new Map<string, Twip>()
  let embedded:
    | Readonly<{
        faceId: FontFaceId
        digits: ReadonlyMap<string, readonly ShapedGlyph[]>
      }>
    | undefined
  if (typography.kind === "standard") {
    for (const digit of "0123456789") {
      const advance = typography.metrics.measureText(digit, presentation.style)
      if (!Number.isSafeInteger(advance) || advance < 0)
        throw new RangeError(
          "Page-field digit advances must be non-negative safe integers"
        )
      digitAdvances.set(digit, advance)
      widestDigit = twips(Math.max(widestDigit, advance))
    }
  } else {
    const match = typography.fonts.matchFace({
      family: field.style.fontFamily,
      weight: field.style.fontWeight,
      style: field.style.fontStyle,
    })
    const face = typography.fonts.face(match.faceId)
    const resolvedWeight =
      match.kind === "alias" ? face.weight : field.style.fontWeight
    resolvedStyle = {
      ...presentation.style,
      fontFamily: face.family,
      fontWeight: resolvedWeight,
      fontStyle: face.style,
    }
    const variation = shapeVariationForRun(
      { weight: field.style.fontWeight, style: field.style.fontStyle },
      face.weight
    )
    const fontsWithVariation = typography.fonts as FontRegistry & {
      getFontVariation?: (
        family: string,
        options?: Readonly<{ wght?: number; ital?: number }>
      ) => unknown
    }
    if (
      variation &&
      typeof fontsWithVariation.getFontVariation === "function"
    ) {
      fontsWithVariation.getFontVariation(field.style.fontFamily, variation)
    }
    const shaped = typography.shaper.shape({
      face,
      text: "0123456789",
      fontSize: presentation.style.fontSize,
      direction: "ltr",
      ...(variation ? { variation } : {}),
    })
    const digits = new Map<string, readonly ShapedGlyph[]>()
    for (let index = 0; index < 10; index += 1) {
      const glyphs = shaped.glyphs.filter(
        (glyph) => glyph.clusterStart <= index && index < glyph.clusterEnd
      )
      if (glyphs.length === 0)
        throw new RangeError(
          "Font shaper did not return a decimal page-field glyph"
        )
      digits.set(String(index), Object.freeze(glyphs))
      const advance = safeTwipSum(
        glyphs.map((glyph) => glyph.advanceX),
        "Page-field digit advance exceeds the safe integer range"
      )
      if (advance < 0)
        throw new RangeError(
          "Page-field digit advances must be non-negative safe integers"
        )
      digitAdvances.set(String(index), advance)
      widestDigit = twips(Math.max(widestDigit, advance))
    }
    embedded = Object.freeze({ faceId: match.faceId, digits })
  }
  const height = twips(
    Math.max(1, Math.round((presentation.style.fontSize * 6) / 5))
  )
  const rawAscent = twips(Math.round((height * 4) / 5))
  const verticalMetrics = shiftedVerticalMetrics(
    rawAscent,
    twips(height - rawAscent),
    presentation.baselineShift
  )
  return Object.freeze({
    text: "9".repeat(digits),
    style: resolvedStyle,
    sourceNodeId: field.id,
    width: safeTwipSum(
      Array.from({ length: digits }, () => widestDigit),
      "Page-field reservation exceeds the safe integer range"
    ),
    ascent: verticalMetrics.ascent,
    descent: verticalMetrics.descent,
    lineGap: twips(0),
    baselineShift: presentation.baselineShift,
    whitespace: false,
    preserveSpace: true,
    underlineOffset: twips(
      Math.max(1, Math.round(presentation.style.fontSize / 10))
    ),
    underlineThickness: twips(
      Math.max(1, Math.round(presentation.style.fontSize / 20))
    ),
    atom: Object.freeze({
      type: "pageField",
      field: field.field,
      ...(embedded ? { embedded } : {}),
      digitAdvances,
      reservedDigits: digits,
    }),
  })
}

function safeTwipSum(values: readonly number[], message: string): Twip {
  let total = 0
  for (const value of values) {
    if (!Number.isSafeInteger(value) || !Number.isSafeInteger(total + value))
      throw new RangeError(message)
    total += value
  }
  return twips(total)
}

type Typography =
  | Readonly<{ kind: "standard"; metrics: Phase1FontMetrics }>
  | Readonly<{ kind: "embedded"; fonts: FontRegistry; shaper: TextShaper }>

type PageState = {
  page: InternalPage
  y: Twip
  items: InternalDisplayItem[]
  /** Writable area for the current column (full content area when count === 1). */
  flowBounds: Rect
  columnIndex: number
  columnGeometry: SectionColumnGeometry
}

type NumberingResolver = Readonly<{
  resolve: (
    paragraph: ResolvedParagraph,
    typography: Typography,
    signal?: AbortSignal
  ) => ResolvedListLabel | undefined
}>

function createNumberingResolver(
  document: ResolvedDocument,
  diagnostics: Diagnostic[]
): NumberingResolver {
  const definitions = new Map<string, NumberingDefinition>()
  const duplicateIds = new Set<string>()
  const rawDefinitions: unknown = document.numberingDefinitions
  if (Array.isArray(rawDefinitions)) {
    for (const candidate of rawDefinitions) {
      if (
        !isRecord(candidate) ||
        typeof candidate.id !== "string" ||
        candidate.id.length === 0
      )
        continue
      if (definitions.has(candidate.id)) duplicateIds.add(candidate.id)
      else definitions.set(candidate.id, candidate as NumberingDefinition)
    }
  }
  const counters = new Map<string, Map<number, number>>()

  const failure = (
    paragraph: ResolvedParagraph,
    code: string,
    message: string,
    typography: Typography,
    signal?: AbortSignal
  ): ResolvedListLabel => {
    diagnostics.push({
      code,
      severity: "error",
      message,
      source: paragraph.source,
      nodeId: paragraph.id,
    })
    return prepareListLabel(
      "[?]",
      fallbackNumberingLevel(),
      paragraph,
      typography,
      diagnostics,
      signal
    )
  }

  return {
    resolve(paragraph, typography, signal) {
      const reference: unknown = paragraph.properties.numbering
      if (reference === null || reference === undefined) return undefined
      if (
        !isRecord(reference) ||
        typeof reference.definitionId !== "string" ||
        reference.definitionId.length === 0 ||
        !isLevelIndex(reference.level)
      ) {
        return failure(
          paragraph,
          "layout/numbering-reference-invalid",
          "Paragraph numbering reference is malformed",
          typography,
          signal
        )
      }
      const definitionId = reference.definitionId
      if (duplicateIds.has(definitionId)) {
        return failure(
          paragraph,
          "layout/numbering-definition-duplicate",
          `Numbering definition '${definitionId}' is duplicated`,
          typography,
          signal
        )
      }
      const definition = definitions.get(definitionId)
      if (!definition) {
        return failure(
          paragraph,
          "layout/numbering-definition-missing",
          `Numbering definition '${definitionId}' does not exist`,
          typography,
          signal
        )
      }
      if (!Array.isArray(definition.levels)) {
        return failure(
          paragraph,
          "layout/numbering-definition-invalid",
          `Numbering definition '${definitionId}' has malformed levels`,
          typography,
          signal
        )
      }
      const matching = definition.levels.filter(
        (level) => isRecord(level) && level.level === reference.level
      )
      if (matching.length === 0) {
        return failure(
          paragraph,
          "layout/numbering-level-missing",
          `Numbering definition '${definitionId}' has no level ${reference.level}`,
          typography,
          signal
        )
      }
      if (matching.length > 1) {
        return failure(
          paragraph,
          "layout/numbering-level-duplicate",
          `Numbering definition '${definitionId}' duplicates level ${reference.level}`,
          typography,
          signal
        )
      }
      const level = matching[0]
      if (!isValidNumberingLevel(level)) {
        return failure(
          paragraph,
          "layout/numbering-level-invalid",
          `Numbering definition '${definitionId}' level ${reference.level} is malformed`,
          typography,
          signal
        )
      }
      const referencedLevels = [...level.levelText.matchAll(/%([1-9])/gu)].map(
        (match) => Number(match[1]) - 1
      )
      const levelMap = new Map<number, NumberingLevelDefinition>()
      for (const candidate of definition.levels) {
        if (isValidNumberingLevel(candidate) && !levelMap.has(candidate.level))
          levelMap.set(candidate.level, candidate)
      }
      if (referencedLevels.some((referenced) => !levelMap.has(referenced))) {
        return failure(
          paragraph,
          "layout/numbering-level-text-invalid",
          `Numbering definition '${definitionId}' level ${reference.level} references an unavailable counter`,
          typography,
          signal
        )
      }

      const state = counters.get(definitionId) ?? new Map<number, number>()
      counters.set(definitionId, state)
      for (const candidate of levelMap.values()) {
        if (
          candidate.level > level.level &&
          candidate.restartAfterLevel === level.level
        ) {
          state.delete(candidate.level)
        }
      }
      state.set(
        level.level,
        state.has(level.level)
          ? (state.get(level.level) as number) + 1
          : level.startAt
      )
      for (const referenced of referencedLevels) {
        if (!state.has(referenced)) {
          const referencedLevel = levelMap.get(
            referenced
          ) as NumberingLevelDefinition
          state.set(referenced, referencedLevel.startAt)
        }
      }
      const labelText = level.levelText.replace(
        /%([1-9])/gu,
        (_token, digit: string) => {
          const referenced = Number(digit) - 1
          const referencedLevel = levelMap.get(
            referenced
          ) as NumberingLevelDefinition
          const format = level.legal ? "decimal" : referencedLevel.format
          return formatCounter(state.get(referenced) as number, format)
        }
      )
      const text = labelText + (level.suffix === "space" ? " " : "")
      return prepareListLabel(
        text,
        level,
        paragraph,
        typography,
        diagnostics,
        signal
      )
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isLevelIndex(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= 0 &&
    (value as number) <= 8
  )
}

const NUMBERING_FORMATS: readonly NumberingFormat[] = [
  "bullet",
  "decimal",
  "lowerLetter",
  "upperLetter",
  "lowerRoman",
  "upperRoman",
]

function isValidNumberingLevel(
  value: unknown
): value is NumberingLevelDefinition {
  if (!isRecord(value)) return false
  return (
    isLevelIndex(value.level) &&
    Number.isSafeInteger(value.startAt) &&
    (value.startAt as number) >= 0 &&
    NUMBERING_FORMATS.includes(value.format as NumberingFormat) &&
    typeof value.levelText === "string" &&
    value.levelText.length > 0 &&
    !/%(?:0|[1-9][0-9]+)/u.test(value.levelText) &&
    ["tab", "space", "nothing"].includes(value.suffix as string) &&
    ["left", "center", "right"].includes(value.alignment as string) &&
    Number.isSafeInteger(value.indentStart) &&
    Number.isSafeInteger(value.firstLineIndent) &&
    (value.restartAfterLevel === null ||
      (isLevelIndex(value.restartAfterLevel) &&
        value.restartAfterLevel < (value.level as number))) &&
    typeof value.legal === "boolean"
  )
}

function fallbackNumberingLevel(): NumberingLevelDefinition {
  return {
    level: 0,
    startAt: 1,
    format: "decimal",
    levelText: "[?]",
    suffix: "space",
    alignment: "left",
    indentStart: twips(360),
    firstLineIndent: twips(-360),
    restartAfterLevel: null,
    legal: false,
  }
}

function formatCounter(value: number, format: NumberingFormat): string {
  if (format === "bullet") return "•"
  if (format === "decimal") return String(value)
  if (format === "lowerLetter" || format === "upperLetter") {
    let current = value
    let result = ""
    while (current > 0) {
      current -= 1
      result = String.fromCharCode(97 + (current % 26)) + result
      current = Math.floor(current / 26)
    }
    return format === "upperLetter" ? result.toUpperCase() : result
  }
  const roman = toRoman(value)
  return format === "upperRoman" ? roman : roman.toLowerCase()
}

function toRoman(value: number): string {
  const pairs: readonly (readonly [number, string])[] = [
    [1_000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ]
  let remaining = value
  let result = ""
  for (const [amount, token] of pairs) {
    while (remaining >= amount) {
      result += token
      remaining -= amount
    }
  }
  return result
}

function prepareListLabel(
  text: string,
  level: NumberingLevelDefinition,
  paragraph: ResolvedParagraph,
  typography: Typography,
  diagnostics: Diagnostic[],
  signal?: AbortSignal
): ResolvedListLabel {
  throwIfAborted(signal)
  const first = paragraph.children.find(
    (child): child is Extract<ResolvedInline, { type: "text" | "pageField" }> =>
      child.type === "text" || child.type === "pageField"
  )
  const labelStyle: TextStyle = first?.style ?? {
    fontFamily: "Helvetica",
    fontSize: twips(240),
    fontWeight: 400,
    fontStyle: "normal",
    underline: false,
    color: "#000000",
  }
  if (!first) {
    diagnostics.push({
      code: "layout/numbering-label-style-fallback",
      severity: "warning",
      message:
        "Numbered paragraph has no text run; the label uses the standard default style",
      source: paragraph.source,
      nodeId: paragraph.id,
    })
  }
  const synthetic = {
    type: "text" as const,
    id: paragraph.id,
    source: paragraph.source,
    text,
    preserveSpace: true,
    style: labelStyle,
  }
  const indexed =
    typography.kind === "embedded"
      ? prepareEmbeddedRun(synthetic, typography, diagnostics)
      : prepareStandardRun(synthetic, typography.metrics)
  const clusters = indexed.map(({ start: _start, ...cluster }) => cluster)
  const indentStart =
    paragraph.properties.indentStart !== 0
      ? paragraph.properties.indentStart
      : level.indentStart
  const firstLineIndent =
    paragraph.properties.firstLineIndent !== 0
      ? paragraph.properties.firstLineIndent
      : level.firstLineIndent
  return {
    text,
    level,
    clusters: Object.freeze(clusters),
    width: twips(clusters.reduce((sum, cluster) => sum + cluster.width, 0)),
    ascent: twips(
      clusters.reduce((max, cluster) => Math.max(max, cluster.ascent), 0)
    ),
    descent: twips(
      clusters.reduce((max, cluster) => Math.max(max, cluster.descent), 0)
    ),
    lineGap: twips(
      clusters.reduce((max, cluster) => Math.max(max, cluster.lineGap), 0)
    ),
    indentStart,
    firstLineIndent,
  }
}

function listParagraphProperties(
  properties: ParagraphProperties,
  label?: ResolvedListLabel
): ParagraphProperties {
  if (!label) return properties
  return {
    ...properties,
    indentStart: label.indentStart,
    firstLineIndent: twips(0),
  }
}

function addCompatibilityDiagnostics(
  paragraph: ResolvedParagraph,
  typography: Typography,
  diagnostics: Diagnostic[]
): void {
  if (typography.kind === "standard") {
    for (const child of paragraph.children) {
      if (
        child.type === "image" ||
        child.type === "break" ||
        child.type === "tab"
      )
        continue
      if (child.style.fontFamily !== "Helvetica") {
        diagnostics.push({
          code: "layout/font-fallback",
          severity: "warning",
          message: `Standard metrics use Helvetica-compatible measurements for '${child.style.fontFamily}'`,
          source: child.source,
          nodeId: child.id,
        })
      }
      if (
        child.style.fontWeight !== 400 ||
        child.style.fontStyle !== "normal"
      ) {
        diagnostics.push({
          code: "layout/standard-font-style-unsupported",
          severity: "warning",
          message:
            "The standard-font fallback cannot visually preserve font weight or style",
          source: child.source,
          nodeId: child.id,
        })
      }
    }
  }
}

function measureParagraph(
  paragraph: ResolvedParagraph,
  contentWidth: Twip,
  typography: Typography,
  diagnostics: Diagnostic[],
  properties: ParagraphProperties = paragraph.properties,
  pageFieldDigits = 1,
  assets: ReadonlySet<string> = new Set(),
  signal?: AbortSignal,
  allowWrap = true
): readonly MeasuredLine[] {
  const tokens = prepareTokens(
    paragraph,
    typography,
    diagnostics,
    pageFieldDigits,
    assets,
    signal
  )
  const lines: MeasuredLine[] = []
  let clusters: Cluster[] = []
  let width = twips(0)
  let ascent = twips(0)
  let descent = twips(0)
  let lineGap = twips(0)

  const boxWidth = (): Twip =>
    paragraphLineBox(
      properties,
      { x: twips(0), y: twips(0), width: contentWidth, height: twips(0) },
      lines.length === 0
    ).width
  const append = (cluster: Cluster): void => {
    clusters.push(cluster)
    width = twips(width + cluster.width)
    ascent = twips(Math.max(ascent, cluster.ascent))
    descent = twips(Math.max(descent, cluster.descent))
    lineGap = twips(Math.max(lineGap, cluster.lineGap))
  }
  const trimTrailingWhitespace = (): void => {
    while (clusters.at(-1)?.whitespace && !clusters.at(-1)?.preserveSpace)
      clusters.pop()
    recompute()
  }
  const recompute = (): void => {
    width = twips(clusters.reduce((total, cluster) => total + cluster.width, 0))
    ascent = twips(
      clusters.reduce(
        (maximum, cluster) => Math.max(maximum, cluster.ascent),
        0
      )
    )
    descent = twips(
      clusters.reduce(
        (maximum, cluster) => Math.max(maximum, cluster.descent),
        0
      )
    )
    lineGap = twips(
      clusters.reduce(
        (maximum, cluster) => Math.max(maximum, cluster.lineGap),
        0
      )
    )
  }
  const finish = (
    wrapped: boolean,
    force = false,
    pageBreakAfter = false,
    columnBreakAfter = false
  ): void => {
    trimTrailingWhitespace()
    if (clusters.length > 0 || force) {
      const emptyMetrics =
        clusters.length === 0
          ? emptyLineMetrics(paragraph, typography)
          : undefined
      const lineCharOffset =
        clusters.find((cluster) => cluster.charOffset !== undefined)
          ?.charOffset ??
        clusters[0]?.charOffset ??
        0
      lines.push({
        clusters: Object.freeze(clusters),
        width,
        ascent: emptyMetrics?.ascent ?? ascent,
        descent: emptyMetrics?.descent ?? descent,
        lineGap: emptyMetrics?.lineGap ?? lineGap,
        wrapped,
        charOffset: lineCharOffset,
        ...(pageBreakAfter ? { pageBreakAfter: true } : {}),
        ...(columnBreakAfter ? { columnBreakAfter: true } : {}),
      })
    }
    clusters = []
    width = twips(0)
    ascent = twips(0)
    descent = twips(0)
    lineGap = twips(0)
  }

  for (const token of tokens) {
    throwIfAborted(signal)
    if (token.pageBreak) {
      finish(false, true, true, false)
      continue
    }
    if (token.columnBreak) {
      finish(false, true, false, true)
      continue
    }
    if (token.hardBreak) {
      finish(false, true)
      continue
    }
    if (token.tabSourceNodeId !== undefined) {
      const firstLineOffset =
        lines.length === 0 ? properties.firstLineIndent : 0
      const currentPosition = properties.indentStart + firstLineOffset + width
      const stop = properties.tabStops?.find(
        (candidate) => candidate.position > currentPosition
      )
      if (stop === undefined) {
        throw new RangeError(
          "Word tab has no explicit left tab stop after the current line position"
        )
      }
      const advance = twips(stop.position - currentPosition)
      if (allowWrap && width + advance > boxWidth()) {
        throw new RangeError("Word tab stop exceeds the writable line box")
      }
      append({
        text: "",
        style: IMAGE_STYLE,
        sourceNodeId: token.tabSourceNodeId,
        width: advance,
        ascent: twips(0),
        descent: twips(0),
        lineGap: twips(0),
        baselineShift: twips(0),
        whitespace: false,
        preserveSpace: true,
        underlineOffset: twips(0),
        underlineThickness: twips(0),
        atom: { type: "tab" },
      })
      continue
    }
    if (token.whitespace && clusters.length === 0 && !token.preserveSpace)
      continue
    const tokenWidth = token.clusters.reduce(
      (total, cluster) => total + cluster.width,
      0
    )
    if (!allowWrap) {
      for (const cluster of token.clusters) append(cluster)
      continue
    }
    if (width + tokenWidth <= boxWidth()) {
      for (const cluster of token.clusters) append(cluster)
      continue
    }
    if (token.whitespace && !token.preserveSpace) {
      finish(true)
      continue
    }
    if (clusters.length > 0) finish(true)
    for (const cluster of token.clusters) {
      throwIfAborted(signal)
      if (cluster.atom?.type === "image" && cluster.width > boxWidth())
        throw new RangeError("Inline image is wider than the writable line box")
      if (clusters.length > 0 && width + cluster.width > boxWidth())
        finish(true)
      append(cluster)
    }
  }
  if (clusters.length > 0 || lines.length === 0) finish(false, true)
  return Object.freeze(lines)
}

function prepareTokens(
  paragraph: ResolvedParagraph,
  typography: Typography,
  diagnostics: Diagnostic[],
  pageFieldDigits: number,
  assets: ReadonlySet<string>,
  signal?: AbortSignal
): readonly Token[] {
  const result: Token[] = []
  let paragraphCharOffset = 0
  for (const child of paragraph.children) {
    throwIfAborted(signal)
    if (child.type === "break") {
      result.push({
        clusters: Object.freeze([]),
        whitespace: false,
        hardBreak: child.kind === "line",
        preserveSpace: true,
        ...(child.kind === "page" ? { pageBreak: true } : {}),
        ...(child.kind === "column" ? { columnBreak: true } : {}),
      })
      // Manual breaks occupy no character width in the editor char-offset map.
      continue
    }
    if (child.type === "tab") {
      result.push({
        clusters: Object.freeze([]),
        whitespace: false,
        hardBreak: false,
        preserveSpace: true,
        tabSourceNodeId: child.id,
      })
      paragraphCharOffset += 1
      continue
    }
    if (child.type === "image") {
      validateImage(child, assets)
      result.push({
        clusters: Object.freeze([
          { ...prepareImageCluster(child), charOffset: paragraphCharOffset },
        ]),
        whitespace: false,
        hardBreak: false,
        preserveSpace: true,
      })
      paragraphCharOffset += 1
      continue
    }
    if (child.type === "pageField") {
      result.push({
        clusters: Object.freeze([
          {
            ...preparePageFieldCluster(child, typography, pageFieldDigits),
            charOffset: paragraphCharOffset,
          },
        ]),
        whitespace: false,
        hardBreak: false,
        preserveSpace: true,
      })
      paragraphCharOffset += child.displayText.length
      continue
    }
    if (child.text.includes("\t")) {
      diagnostics.push({
        code: "layout/tab-stop-unsupported",
        severity: "error",
        message:
          "Tab characters require explicit tab-stop layout and cannot be rendered as spaces",
        source: child.source,
        nodeId: child.id,
      })
    }
    const prepared =
      typography.kind === "embedded"
        ? prepareEmbeddedRun(child, typography, diagnostics)
        : prepareStandardRun(child, typography.metrics)
    const ranges = textRanges(child.text)
    const runBase = paragraphCharOffset
    for (const range of ranges) {
      result.push({
        clusters: Object.freeze(
          prepared
            .filter(
              (cluster) =>
                range.start <= cluster.start && cluster.start < range.end
            )
            .map(({ start, ...cluster }) => ({
              ...cluster,
              charOffset: runBase + start,
            }))
        ),
        whitespace: range.whitespace,
        hardBreak: range.hardBreak,
        preserveSpace: child.preserveSpace === true,
      })
    }
    paragraphCharOffset += child.text.length
  }
  return Object.freeze(result)
}

type IndexedCluster = Cluster & Readonly<{ start: number }>

function prepareStandardRun(
  child: Extract<ResolvedInline, { type: "text" }>,
  metrics: Phase1FontMetrics
): readonly IndexedCluster[] {
  const presentation = scriptPresentation(child.style)
  const height = metrics.lineHeight(presentation.style)
  const rawAscent = twips(Math.round((height * 4) / 5))
  const rawDescent = twips(height - rawAscent)
  const { ascent, descent } = shiftedVerticalMetrics(
    rawAscent,
    rawDescent,
    presentation.baselineShift
  )
  const result: IndexedCluster[] = []
  let start = 0
  const href =
    typeof child.href === "string" && child.href.length > 0
      ? child.href
      : undefined
  for (const character of child.text) {
    result.push({
      start,
      text: character,
      style: presentation.style,
      sourceNodeId: child.id,
      width: metrics.measureText(character, presentation.style),
      ascent,
      descent,
      lineGap: twips(0),
      baselineShift: presentation.baselineShift,
      whitespace: /^[\t ]$/u.test(character),
      preserveSpace: child.preserveSpace === true,
      underlineOffset: twips(
        Math.max(1, Math.round(presentation.style.fontSize / 10))
      ),
      underlineThickness: twips(
        Math.max(1, Math.round(presentation.style.fontSize / 20))
      ),
      ...(href ? { href } : {}),
    })
    start += character.length
  }
  return result
}

function shapeVariationForRun(
  requested: Readonly<{
    weight: TextStyle["fontWeight"]
    style: TextStyle["fontStyle"]
  }>,
  faceWeight: TextStyle["fontWeight"]
): ShapeTextInput["variation"] | undefined {
  // Exact static-face matches must keep their own outlines. Only apply OpenType
  // variation when the registry had to fall back across weights/styles.
  if (requested.weight === faceWeight) return undefined
  return {
    wght: requested.weight,
    ...(requested.style === "italic" ? { ital: 1 } : {}),
  }
}

function prepareEmbeddedRun(
  child: Extract<ResolvedInline, { type: "text" }>,
  typography: Extract<Typography, { kind: "embedded" }>,
  diagnostics: Diagnostic[]
): readonly IndexedCluster[] {
  const presentation = scriptPresentation(child.style)
  const match = typography.fonts.matchFace({
    family: child.style.fontFamily,
    weight: child.style.fontWeight,
    style: child.style.fontStyle,
  })
  const face = typography.fonts.face(match.faceId)
  // OOXML family aliases such as "Inter Medium" encode their static face in
  // the family name while the run itself remains regular (400). Surface the
  // selected face's weight for aliases. For ordinary face fallbacks, retain
  // the semantic request so a variable Regular face can receive wght.
  const resolvedWeight =
    match.kind === "alias" ? face.weight : child.style.fontWeight
  const resolvedStyle = {
    ...presentation.style,
    fontFamily: face.family,
    fontWeight: resolvedWeight,
    fontStyle: face.style,
  }
  const variation = shapeVariationForRun(
    { weight: child.style.fontWeight, style: child.style.fontStyle },
    face.weight
  )
  // Optional ManagedFontRegistry hook: warm variation instance / metrics.
  const fontsWithVariation = typography.fonts as FontRegistry & {
    getFontVariation?: (
      family: string,
      options?: Readonly<{ wght?: number; ital?: number }>
    ) => Readonly<{ metrics: typeof face.metrics }>
  }
  if (variation && typeof fontsWithVariation.getFontVariation === "function") {
    fontsWithVariation.getFontVariation(child.style.fontFamily, variation)
  }
  // Paragraph controls are layout boundaries, not font glyphs. Replacing each
  // UTF-16 code unit with a space preserves cluster offsets while still making
  // exactly one shaping call for the semantic run.
  const shapingText = child.text.replace(/[\r\n\t]/gu, " ")
  const shaped = typography.shaper.shape({
    face,
    text: shapingText,
    fontSize: presentation.style.fontSize,
    direction: "ltr",
    ...(variation ? { variation } : {}),
  })
  if (match.kind === "face-fallback" || match.kind === "family-fallback") {
    diagnostics.push({
      code: "layout/font-match-fallback",
      severity: "warning",
      message: `Font '${child.style.fontFamily}' resolved to '${match.resolvedFamily}' via ${match.kind}`,
      source: child.source,
      nodeId: child.id,
    })
  }
  const grouped = new Map<string, ShapedGlyph[]>()
  for (const glyph of shaped.glyphs) {
    const key = `${glyph.clusterStart}:${glyph.clusterEnd}`
    const group = grouped.get(key)
    if (group) group.push(glyph)
    else grouped.set(key, [glyph])
  }
  const scale = (units: number): Twip =>
    twips(
      Math.round(
        (units * presentation.style.fontSize) / face.metrics.unitsPerEm
      )
    )
  return [...grouped.values()]
    .sort(
      (left, right) =>
        (left[0]?.clusterStart ?? 0) - (right[0]?.clusterStart ?? 0)
    )
    .map((glyphs) => {
      const first = glyphs[0] as ShapedGlyph
      const end = Math.max(...glyphs.map((glyph) => glyph.clusterEnd))
      const text = child.text.slice(first.clusterStart, end)
      const verticalMetrics = shiftedVerticalMetrics(
        twips(Math.max(0, shaped.ascent)),
        twips(Math.abs(shaped.descent)),
        presentation.baselineShift
      )
      const href =
        typeof child.href === "string" && child.href.length > 0
          ? child.href
          : undefined
      return {
        start: first.clusterStart,
        text,
        style: resolvedStyle,
        sourceNodeId: child.id,
        width: twips(
          glyphs.reduce((total, glyph) => total + glyph.advanceX, 0)
        ),
        ascent: verticalMetrics.ascent,
        // OpenType descenders are conventionally negative; layout stores the
        // positive depth below the baseline.
        descent: verticalMetrics.descent,
        lineGap: twips(Math.max(0, shaped.lineGap)),
        baselineShift: presentation.baselineShift,
        whitespace: /^[\t ]+$/u.test(text),
        preserveSpace: child.preserveSpace === true,
        faceId: match.faceId,
        glyphs: Object.freeze(
          glyphs.map((glyph) => ({ glyph, extraAdvance: twips(0) }))
        ),
        underlineOffset: scale(-face.metrics.underlinePosition),
        underlineThickness: twips(
          Math.max(1, scale(face.metrics.underlineThickness))
        ),
        ...(href ? { href } : {}),
      }
    })
}

function textRanges(text: string): readonly Readonly<{
  start: number
  end: number
  whitespace: boolean
  hardBreak: boolean
}>[] {
  const result: Array<{
    start: number
    end: number
    whitespace: boolean
    hardBreak: boolean
  }> = []
  const pattern = /(\r\n|\r|\n|[\t ]+|[^\r\n\t ]+)/gu
  for (const match of text.matchAll(pattern)) {
    const value = match[0]
    const start = match.index
    result.push({
      start,
      end: start + value.length,
      whitespace: /^[\t ]+$/u.test(value),
      hardBreak: /^(?:\r\n|\r|\n)$/u.test(value),
    })
  }
  return result
}

function emptyLineMetrics(
  paragraph: ResolvedParagraph,
  typography: Typography
): Readonly<{ ascent: Twip; descent: Twip; lineGap: Twip }> {
  const child = paragraph.children.find(
    (candidate) => candidate.type === "text" || candidate.type === "pageField"
  )
  const style = child?.style ?? paragraph.paragraphMarkStyle ?? undefined
  if (style && typography.kind === "standard") {
    const height = typography.metrics.lineHeight(style)
    const ascent = twips(Math.round((height * 4) / 5))
    return { ascent, descent: twips(height - ascent), lineGap: twips(0) }
  }
  if (style && typography.kind === "embedded") {
    const presentation = scriptPresentation(style)
    const match = typography.fonts.matchFace({
      family: style.fontFamily,
      weight: style.fontWeight,
      style: style.fontStyle,
    })
    const face = typography.fonts.face(match.faceId)
    const variation = shapeVariationForRun(
      { weight: style.fontWeight, style: style.fontStyle },
      face.weight
    )
    const shaped = typography.shaper.shape({
      face,
      text: "M",
      fontSize: presentation.style.fontSize,
      direction: "ltr",
      ...(variation ? { variation } : {}),
    })
    const shifted = shiftedVerticalMetrics(
      twips(Math.max(0, shaped.ascent)),
      twips(Math.abs(shaped.descent)),
      presentation.baselineShift
    )
    return {
      ascent: shifted.ascent,
      descent: shifted.descent,
      lineGap: twips(Math.max(0, shaped.lineGap)),
    }
  }
  return { ascent: twips(192), descent: twips(48), lineGap: twips(0) }
}

function paragraphLineBox(
  properties: ParagraphProperties,
  contentBounds: Rect,
  firstLine: boolean
): LineBox {
  const first = firstLine ? properties.firstLineIndent : twips(0)
  const x = twips(contentBounds.x + properties.indentStart + first)
  const width =
    contentBounds.width - properties.indentStart - properties.indentEnd - first
  if (width <= 0)
    throw new RangeError("Paragraph indentation leaves no writable line width")
  return { x, width: twips(width) }
}

function resolveLineHeight(
  properties: ParagraphProperties,
  line: MeasuredLine
): Twip {
  const natural = twips(Math.max(1, line.ascent + line.descent + line.lineGap))
  const spacing = properties.lineSpacing
  if (spacing === null) return natural
  if (spacing.rule === "exact") {
    if (
      spacing.value < natural &&
      line.clusters.some((cluster) => cluster.atom?.type === "image")
    )
      throw new RangeError(
        "Exact line spacing cannot contain an inline image without clipping"
      )
    return twips(Math.max(1, spacing.value))
  }
  if (spacing.rule === "atLeast") return twips(Math.max(natural, spacing.value))
  if (spacing.rule !== "auto")
    throw new TypeError("Unsupported line-spacing rule")
  if (!Number.isSafeInteger(spacing.value240ths) || spacing.value240ths < 1) {
    throw new RangeError(
      "Automatic line spacing must be a positive integer number of 240ths"
    )
  }
  return twips(Math.max(1, Math.round((natural * spacing.value240ths) / 240)))
}

function alignedX(
  alignment: ParagraphProperties["alignment"],
  box: LineBox,
  lineWidth: Twip
): Twip {
  if (alignment === "right") return twips(box.x + box.width - lineWidth)
  if (alignment === "center")
    return twips(box.x + Math.floor((box.width - lineWidth) / 2))
  return box.x
}

function justificationAdditions(
  line: MeasuredLine,
  availableWidth: Twip
): ReadonlyMap<number, Twip> {
  const spaces = line.clusters.flatMap((cluster, index) =>
    cluster.whitespace ? [index] : []
  )
  const remaining = Math.max(0, availableWidth - line.width)
  if (spaces.length === 0 || remaining === 0) return new Map()
  const base = Math.floor(remaining / spaces.length)
  let remainder = remaining % spaces.length
  const additions = new Map<number, Twip>()
  for (const index of spaces) {
    const addition = base + (remainder > 0 ? 1 : 0)
    if (remainder > 0) remainder -= 1
    additions.set(index, twips(addition))
  }
  return additions
}

function fittingLineCount(
  heights: readonly Twip[],
  start: number,
  y: Twip,
  bottom: Twip
): number {
  let used = 0
  let count = 0
  for (let index = start; index < heights.length; index += 1) {
    const height = heights[index] as Twip
    if (y + used + height > bottom) break
    used += height
    count += 1
  }
  return count
}

function emitListLabel(
  items: InternalDisplayItem[],
  label: ResolvedListLabel,
  contentBounds: Rect,
  baselineY: Twip
): void {
  const bodyX = twips(contentBounds.x + label.indentStart)
  const hangingX = twips(bodyX + label.firstLineIndent)
  const box: LineBox =
    label.firstLineIndent === 0
      ? { x: twips(bodyX - label.width), width: label.width }
      : {
          x: twips(Math.min(bodyX, hangingX)),
          width: twips(Math.abs(label.firstLineIndent)),
        }
  const x = alignedX(label.level.alignment, box, label.width)
  emitLine(
    items,
    {
      clusters: label.clusters,
      width: label.width,
      ascent: label.ascent,
      descent: label.descent,
      lineGap: label.lineGap,
      wrapped: false,
      charOffset: 0,
    },
    new Map(),
    x,
    baselineY
  )
}

function emitHeaderFooter(
  items: InternalDisplayItem[],
  prepared: PreparedHeaderFooter,
  page: InternalPage,
  contentBounds: Rect,
  startY: Twip,
  _pageNumber: number,
  _totalPages: number
): void {
  let y = startY
  for (const block of prepared.blocks) {
    if (block.type === "table") {
      const tableHeight = safeTwipSum(
        block.value.rows.map((row) => row.height),
        "Header/footer table height exceeds the safe integer range"
      )
      const flowBounds: Rect = {
        x: contentBounds.x,
        y,
        width: contentBounds.width,
        height: tableHeight,
      }
      const state: PageState = {
        page,
        y,
        items,
        flowBounds,
        columnIndex: 0,
        columnGeometry: {
          count: 1,
          space: twips(0),
          separator: false,
          columns: [flowBounds],
        },
      }
      const tableEvents: LayoutTraceEvent[] = []
      for (const row of block.value.rows) {
        emitTableRowFragment(
          block.value,
          row,
          twips(0),
          row.height,
          state,
          tableEvents
        )
        state.y = safeTwipSum(
          [state.y, row.height],
          "Header/footer table position exceeds the safe integer range"
        )
      }
      y = state.y
      continue
    }
    if (block.type === "horizontalRule") {
      const { rule } = block.value
      y = safeTwipSum(
        [y, rule.properties.spacingBefore],
        "Header/footer position exceeds the safe integer range"
      )
      const centerY = safeTwipSum(
        [y, twips(Math.floor(rule.height / 2))],
        "Header/footer position exceeds the safe integer range"
      )
      items.push({
        type: "line",
        sourceNodeId: rule.id,
        x1: contentBounds.x,
        y1: centerY,
        x2: twips(contentBounds.x + contentBounds.width),
        y2: centerY,
        width: rule.height,
        color: rule.color,
      })
      y = safeTwipSum(
        [y, rule.height, rule.properties.spacingAfter],
        "Header/footer position exceeds the safe integer range"
      )
      continue
    }
    const paragraph = block.value
    y = safeTwipSum(
      [y, paragraph.paragraph.properties.spacingBefore],
      "Header/footer position exceeds the safe integer range"
    )
    for (const [lineIndex, line] of paragraph.lines.entries()) {
      const lineHeight = paragraph.lineHeights[lineIndex] as Twip
      const box = paragraphLineBox(
        paragraph.properties,
        contentBounds,
        lineIndex === 0
      )
      const justify =
        paragraph.paragraph.properties.alignment === "justify" && line.wrapped
      const additions = justify
        ? justificationAdditions(line, box.width)
        : new Map<number, Twip>()
      const renderedWidth = justify ? box.width : line.width
      const startX = alignedX(
        paragraph.paragraph.properties.alignment,
        box,
        renderedWidth
      )
      const naturalHeight = line.ascent + line.descent + line.lineGap
      const leading = Math.max(0, lineHeight - naturalHeight)
      const baselineY = twips(y + line.ascent + Math.floor(leading / 2))
      emitLine(items, line, additions, startX, baselineY)
      y = safeTwipSum(
        [y, lineHeight],
        "Header/footer position exceeds the safe integer range"
      )
    }
    y = safeTwipSum(
      [y, paragraph.paragraph.properties.spacingAfter],
      "Header/footer position exceeds the safe integer range"
    )
  }
}

function materializeItem(
  item: InternalDisplayItem,
  pageNumber: number,
  totalPages: number
): readonly DisplayListItem[] {
  if (item.type !== "pending-page-field") return [item]
  const text = String(item.field === "PAGE" ? pageNumber : totalPages)
  if (text.length > item.reservedDigits)
    throw new RangeError(
      "Materialized page field exceeds its reserved decimal digit count"
    )
  const actualWidth = safeTwipSum(
    [...text].map((digit) => {
      const advance = item.digitAdvances.get(digit)
      if (advance === undefined)
        throw new RangeError(
          "Prepared page-field advances are missing a decimal digit"
        )
      return advance
    }),
    "Materialized page-field width exceeds the safe integer range"
  )
  if (actualWidth > item.width)
    throw new RangeError("Materialized page field exceeds its reserved width")
  const run: GlyphRun = item.embedded
    ? {
        type: "glyph-run",
        fontSource: "embedded",
        sourceNodeId: item.sourceNodeId,
        text,
        faceId: item.embedded.faceId,
        fontFamily: item.style.fontFamily,
        fontWeight: item.style.fontWeight,
        fontStyle: item.style.fontStyle,
        glyphs: Object.freeze(
          [...text].flatMap((digit) => {
            const glyphs = item.embedded?.digits.get(digit)
            if (!glyphs)
              throw new RangeError(
                "Prepared page-field glyph set is missing a decimal digit"
              )
            return glyphs.map((glyph) => ({
              glyphId: glyph.glyphId,
              unicode: digit,
              xAdvance: glyph.advanceX,
              yAdvance: glyph.advanceY,
              xOffset: glyph.offsetX,
              yOffset: glyph.offsetY,
            }))
          })
        ),
        fontSize: item.style.fontSize,
        color: item.style.color,
        highlightColor: item.style.highlightColor,
        verticalAlignment: item.style.verticalAlignment,
        x: item.x,
        baselineY: item.baselineY,
        width: item.width,
      }
    : {
        type: "glyph-run",
        fontSource: "standard",
        sourceNodeId: item.sourceNodeId,
        text,
        fontFamily: item.style.fontFamily,
        fontWeight: item.style.fontWeight,
        fontStyle: item.style.fontStyle,
        fontSize: item.style.fontSize,
        color: item.style.color,
        highlightColor: item.style.highlightColor,
        verticalAlignment: item.style.verticalAlignment,
        x: item.x,
        baselineY: item.baselineY,
        // Retain the conservative maxPages reservation; actual digits never
        // reshape or move neighboring content after the immutable page plan exists.
        width: item.width,
      }
  const highlight: DisplayListItem[] = item.style.highlightColor
    ? [
        {
          type: "rectangle",
          sourceNodeId: item.sourceNodeId,
          bounds: {
            x: item.x,
            y: twips(
              item.baselineY - Math.round((item.style.fontSize * 4) / 5)
            ),
            width: item.width,
            height: item.style.fontSize,
          },
          fillColor: item.style.highlightColor,
        },
      ]
    : []
  if (!item.style.underline) return [...highlight, run]
  const underlineOffset = twips(
    Math.max(1, Math.round(item.style.fontSize / 10))
  )
  return [
    ...highlight,
    run,
    {
      type: "line",
      sourceNodeId: item.sourceNodeId,
      x1: item.x,
      y1: twips(item.baselineY + underlineOffset),
      x2: twips(item.x + item.width),
      y2: twips(item.baselineY + underlineOffset),
      width: twips(Math.max(1, Math.round(item.style.fontSize / 20))),
      color: item.style.color,
    },
  ]
}

function emitLine(
  items: InternalDisplayItem[],
  line: MeasuredLine,
  additions: ReadonlyMap<number, Twip>,
  startX: Twip,
  baselineY: Twip
): void {
  let x = startX
  let segment: Array<{ cluster: Cluster; addition: Twip }> = []
  const flush = (): void => {
    if (segment.length === 0) return
    const first = segment[0]?.cluster as Cluster
    const text = segment.map(({ cluster }) => cluster.text).join("")
    const width = twips(
      segment.reduce(
        (total, entry) => total + entry.cluster.width + entry.addition,
        0
      )
    )
    const shiftedBaselineY = twips(baselineY + first.baselineShift)
    const href =
      typeof first.href === "string" && first.href.length > 0
        ? first.href
        : undefined
    const run: GlyphRun = first.faceId
      ? {
          type: "glyph-run",
          fontSource: "embedded",
          sourceNodeId: first.sourceNodeId,
          text,
          faceId: first.faceId,
          fontFamily: first.style.fontFamily,
          fontWeight: first.style.fontWeight,
          fontStyle: first.style.fontStyle,
          glyphs: Object.freeze(positionedGlyphs(segment)),
          fontSize: first.style.fontSize,
          color: first.style.color,
          highlightColor: first.style.highlightColor,
          verticalAlignment: first.style.verticalAlignment,
          x,
          baselineY: shiftedBaselineY,
          width,
          ...(href ? { href } : {}),
        }
      : {
          type: "glyph-run",
          fontSource: "standard",
          sourceNodeId: first.sourceNodeId,
          text,
          fontFamily: first.style.fontFamily,
          fontWeight: first.style.fontWeight,
          fontStyle: first.style.fontStyle,
          fontSize: first.style.fontSize,
          color: first.style.color,
          highlightColor: first.style.highlightColor,
          verticalAlignment: first.style.verticalAlignment,
          x,
          baselineY: shiftedBaselineY,
          width,
          ...(href ? { href } : {}),
        }
    if (first.style.highlightColor) {
      items.push({
        type: "rectangle",
        sourceNodeId: first.sourceNodeId,
        bounds: {
          x,
          y: twips(
            shiftedBaselineY - Math.round((first.style.fontSize * 4) / 5)
          ),
          width,
          height: first.style.fontSize,
        },
        fillColor: first.style.highlightColor,
      })
    }
    items.push(run)
    if (first.style.underline) {
      items.push({
        type: "line",
        sourceNodeId: first.sourceNodeId,
        x1: x,
        y1: twips(shiftedBaselineY + first.underlineOffset),
        x2: twips(x + width),
        y2: twips(shiftedBaselineY + first.underlineOffset),
        width: first.underlineThickness,
        color: first.style.color,
      })
    }
    x = twips(x + width)
    segment = []
  }

  for (const [index, cluster] of line.clusters.entries()) {
    if (cluster.atom) {
      flush()
      if (cluster.atom.type === "tab") {
        // A tab advances x to its resolved stop without emitting PDF text.
      } else if (cluster.atom.type === "image") {
        items.push({
          type: "image",
          sourceNodeId: cluster.sourceNodeId,
          assetId: cluster.atom.assetId,
          bounds: {
            x: twips(x + cluster.atom.offsetX),
            y: twips(baselineY - cluster.atom.height + cluster.atom.offsetY),
            width: cluster.width,
            height: cluster.atom.height,
          },
        })
      } else {
        items.push({
          type: "pending-page-field",
          sourceNodeId: cluster.sourceNodeId,
          field: cluster.atom.field,
          style: cluster.style,
          x,
          baselineY: twips(baselineY + cluster.baselineShift),
          width: cluster.width,
          ...(cluster.atom.embedded ? { embedded: cluster.atom.embedded } : {}),
          digitAdvances: cluster.atom.digitAdvances,
          reservedDigits: cluster.atom.reservedDigits,
        })
      }
      x = twips(x + cluster.width)
      continue
    }
    const addition = additions.get(index) ?? twips(0)
    const first = segment[0]?.cluster
    const compatible =
      !first ||
      (first.sourceNodeId === cluster.sourceNodeId &&
        first.style === cluster.style &&
        first.faceId === cluster.faceId &&
        first.href === cluster.href)
    if (!compatible) flush()
    segment.push({ cluster, addition })
    // Split after expanded spaces so the next standard run receives the offset.
    if (addition > 0) flush()
  }
  flush()
}

function positionedGlyphs(
  segment: readonly Readonly<{ cluster: Cluster; addition: Twip }>[]
): PositionedGlyph[] {
  const result: PositionedGlyph[] = []
  for (const { cluster, addition } of segment) {
    const glyphs = cluster.glyphs ?? []
    for (const [index, prepared] of glyphs.entries()) {
      const isLast = index === glyphs.length - 1
      result.push({
        glyphId: prepared.glyph.glyphId,
        unicode: prepared.glyph.unicode,
        xAdvance: twips(
          prepared.glyph.advanceX +
            prepared.extraAdvance +
            (isLast ? addition : 0)
        ),
        yAdvance: prepared.glyph.advanceY,
        xOffset: prepared.glyph.offsetX,
        yOffset: prepared.glyph.offsetY,
      })
    }
  }
  return result
}

function helveticaWidth(character: string): number {
  if (character === " ") return 278
  if ("ilI.,'`!|:;".includes(character)) return 222
  if ("mwMW@%&".includes(character)) return 833
  if ("fjrt()[]{}".includes(character)) return 333
  if ("-_=+<>~".includes(character)) return 584
  if (/^[0-9]$/u.test(character)) return 556
  if (/^[A-Z]$/u.test(character)) return 667
  if (/^[a-z]$/u.test(character)) return 500
  return 556
}
