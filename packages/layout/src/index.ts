import {
  throwIfAborted,
  twips,
  type Diagnostic,
  type GlyphRun,
  type LayoutDocument,
  type LayoutTrace,
  type LayoutTraceEvent,
  type NodeId,
  type PageDisplayList,
  type PageDisplayListPage,
  type ParagraphProperties,
  type Rect,
  type ResolvedDocument,
  type ResolvedParagraph,
  type TextStyle,
  type Twip,
} from "@apex-docx-pdf/core"

/** The A4 dimensions used by Word, represented as integer twips. */
export const A4_PAGE_WIDTH = twips(11_906)
export const A4_PAGE_HEIGHT = twips(16_838)

export type Phase1FontMetrics = Readonly<{
  measureText: (text: string, style: TextStyle) => Twip
  lineHeight: (style: TextStyle) => Twip
}>

export type LayoutOptions = Readonly<{
  /** Maximum number of pages the operation is allowed to allocate. */
  maxPages?: number
  signal?: AbortSignal
  includeTrace?: boolean
  metrics?: Phase1FontMetrics
}>

export class LayoutLimitError extends Error {
  readonly code = "layout/max-pages"

  constructor(readonly maxPages: number) {
    super(`Layout exceeded the configured maximum of ${maxPages} pages`)
    this.name = "LayoutLimitError"
  }
}

type Token = Readonly<{
  text: string
  style: TextStyle
  sourceNodeId: NodeId
  whitespace: boolean
  hardBreak: boolean
}>

type PositionedRun = Readonly<{
  text: string
  style: TextStyle
  sourceNodeId: NodeId
  width: Twip
}>

type MeasuredLine = Readonly<{
  runs: readonly PositionedRun[]
  width: Twip
  height: Twip
}>

/**
 * A small, explicit Helvetica-compatible metrics adapter. It deliberately does
 * not inspect installed fonts; unsupported family names use these same metrics.
 */
export function createPhase1StandardFontMetrics(): Phase1FontMetrics {
  return Object.freeze({
    measureText(text: string, style: TextStyle): Twip {
      let units = 0
      for (const character of text) {
        units += helveticaWidth(character)
      }
      return twips(Math.round((units * style.fontSize) / 1_000))
    },
    lineHeight(style: TextStyle): Twip {
      return twips(Math.max(style.fontSize, Math.round((style.fontSize * 6) / 5)))
    },
  })
}

const DEFAULT_METRICS = createPhase1StandardFontMetrics()

/**
 * Fragments resolved paragraphs into source-linked positioned glyph runs. All
 * coordinates and measurements remain integer twips; PDF conversion is owned
 * by the PDF package.
 */
export function layoutDocument(document: ResolvedDocument, options: LayoutOptions = {}): LayoutDocument {
  const metrics = options.metrics ?? DEFAULT_METRICS
  const maxPages = options.maxPages ?? 500
  if (!Number.isSafeInteger(maxPages) || maxPages < 1) {
    throw new TypeError("maxPages must be a positive safe integer")
  }

  const diagnostics: Diagnostic[] = []
  const pages: PageDisplayListPage[] = []
  const tracePages: Array<{ pageNumber: number; pageBounds: Rect; contentBounds: Rect }> = []
  const events: LayoutTraceEvent[] = []
  let current: PageState | undefined

  const createPage = (section: ResolvedDocument["sections"][number], reason?: string, sourceNodeId?: NodeId): PageState => {
    throwIfAborted(options.signal)
    if (pages.length >= maxPages) {
      throw new LayoutLimitError(maxPages)
    }
    const { pageWidth, pageHeight, margins } = section.properties
    const contentWidth = pageWidth - margins.left - margins.right
    const contentHeight = pageHeight - margins.top - margins.bottom
    if (contentWidth <= 0 || contentHeight <= 0) {
      throw new RangeError("Section margins leave no writable page area")
    }
    const contentBounds: Rect = {
      x: margins.left,
      y: margins.top,
      width: contentWidth as Twip,
      height: contentHeight as Twip,
    }
    const page: PageDisplayListPage = {
      pageNumber: pages.length + 1,
      width: pageWidth,
      height: pageHeight,
      contentBounds,
      items: [],
    }
    pages.push(page)
    tracePages.push({
      pageNumber: page.pageNumber,
      pageBounds: { x: twips(0), y: twips(0), width: pageWidth, height: pageHeight },
      contentBounds,
    })
    if (reason && sourceNodeId) {
      events.push({ pageNumber: page.pageNumber, sourceNodeId, kind: "page-break", reason })
    }
    return { page, y: contentBounds.y, items: page.items as GlyphRun[] }
  }

  for (const [sectionIndex, section] of document.sections.entries()) {
    throwIfAborted(options.signal)
    if (!current || sectionIndex > 0) {
      current = createPage(section, sectionIndex > 0 ? "section-boundary" : undefined, sectionIndex > 0 ? section.id : undefined)
    }

    for (const paragraph of section.blocks) {
      throwIfAborted(options.signal)
      for (const child of paragraph.children) {
        if (child.style.fontFamily !== "Helvetica") {
          diagnostics.push({
            code: "layout/font-fallback",
            severity: "warning",
            message: `Phase 1 uses Helvetica metrics; '${child.style.fontFamily}' is measured with the Helvetica-compatible adapter`,
            source: child.source,
            nodeId: child.id,
          })
        }
        if (child.style.bold || child.style.italic || child.style.underline) {
          diagnostics.push({
            code: "layout/text-style-unsupported",
            severity: "warning",
            message: "Phase 1 layout retains text but does not preserve bold, italic, or underline styling",
            source: child.source,
            nodeId: child.id,
          })
        }
      }
      if (paragraph.properties.keepWithNext) {
        diagnostics.push({
          code: "layout/keep-with-next-unsupported",
          severity: "warning",
          message: "Phase 1 does not yet preserve keep-with-next pagination",
          source: paragraph.source,
          nodeId: paragraph.id,
        })
      }
      const lines = measureParagraph(paragraph, current.page.contentBounds.width, metrics, options.signal)
      const lineHeight = resolveLineHeight(paragraph.properties, lines)
      const paragraphHeight = paragraph.properties.spacingBefore + paragraph.properties.spacingAfter + lines.length * lineHeight
      const contentBottom = current.page.contentBounds.y + current.page.contentBounds.height

      if (paragraph.properties.pageBreakBefore && current.y !== current.page.contentBounds.y) {
        current = createPage(section, "page-break-before", paragraph.id)
      }

      if (
        paragraph.properties.keepLinesTogether &&
        paragraphHeight <= current.page.contentBounds.height &&
        current.y + paragraphHeight > contentBottom
      ) {
        current = createPage(section, "keep-lines-together", paragraph.id)
      }

      current.y = twips(current.y + paragraph.properties.spacingBefore)
      let firstLineOnPage = true
      let blockStartY = current.y
      for (const line of lines) {
        throwIfAborted(options.signal)
        if (current.y + lineHeight > contentBottom && current.y !== current.page.contentBounds.y) {
          current = createPage(section, "line-overflow", paragraph.id)
          firstLineOnPage = true
          blockStartY = current.y
        }
        if (current.y + lineHeight > contentBottom) {
          events.push({
            pageNumber: current.page.pageNumber,
            sourceNodeId: paragraph.id,
            kind: "overflow",
            bounds: { x: current.page.contentBounds.x, y: current.y, width: current.page.contentBounds.width, height: lineHeight },
            reason: "line-taller-than-content-area",
          })
        }

        const baselineY = twips(current.y + Math.round((lineHeight * 4) / 5))
        const startX = alignedX(paragraph.properties, current.page.contentBounds, line.width)
        let x = startX
        for (const run of line.runs) {
          if (run.text.length > 0) {
            current.items.push({
              type: "glyph-run",
              sourceNodeId: run.sourceNodeId,
              text: run.text,
              fontFamily: run.style.fontFamily,
              fontSize: run.style.fontSize,
              color: run.style.color,
              x,
              baselineY,
              width: run.width,
            })
          }
          x = twips(x + run.width)
        }
        events.push({
          pageNumber: current.page.pageNumber,
          sourceNodeId: paragraph.id,
          kind: "line",
          bounds: { x: startX, y: current.y, width: line.width, height: lineHeight },
        })
        if (firstLineOnPage) {
          events.push({
            pageNumber: current.page.pageNumber,
            sourceNodeId: paragraph.id,
            kind: "block",
            bounds: { x: current.page.contentBounds.x, y: blockStartY, width: current.page.contentBounds.width, height: lineHeight },
          })
          firstLineOnPage = false
        }
        current.y = twips(current.y + lineHeight)
      }
      current.y = twips(current.y + paragraph.properties.spacingAfter)
    }
  }

  const displayList: PageDisplayList = Object.freeze({
    pages: pages.map((page) => Object.freeze({ ...page, items: Object.freeze([...page.items]) })),
  })
  const trace: LayoutTrace | undefined = options.includeTrace
    ? Object.freeze({ pages: Object.freeze(tracePages), events: Object.freeze(events) })
    : undefined
  return Object.freeze({ displayList, diagnostics: Object.freeze(diagnostics), ...(trace ? { trace } : {}) })
}

type PageState = {
  page: PageDisplayListPage
  y: Twip
  items: GlyphRun[]
}

function measureParagraph(
  paragraph: ResolvedParagraph,
  availableWidth: Twip,
  metrics: Phase1FontMetrics,
  signal?: AbortSignal,
): readonly MeasuredLine[] {
  const lines: MeasuredLine[] = []
  let runs: PositionedRun[] = []
  let width = twips(0)
  let naturalHeight = twips(0)

  const finishLine = (): void => {
    if (runs.length > 0) {
      lines.push({ runs: Object.freeze(runs), width, height: naturalHeight })
    }
    runs = []
    width = twips(0)
    naturalHeight = twips(0)
  }

  for (const token of paragraphTokens(paragraph)) {
    throwIfAborted(signal)
    if (token.hardBreak) {
      finishLine()
      continue
    }
    if (token.whitespace && runs.length === 0) continue
    const tokenWidth = metrics.measureText(token.text, token.style)
    if (width + tokenWidth <= availableWidth) {
      appendRun(token.text, token.style, token.sourceNodeId, tokenWidth)
      continue
    }
    if (token.whitespace) {
      finishLine()
      continue
    }
    if (runs.length > 0) finishLine()
    appendLongToken(token, availableWidth, metrics, appendRun, finishLine)
  }
  finishLine()
  return lines

  function appendRun(text: string, style: TextStyle, sourceNodeId: NodeId, runWidth: Twip): void {
    const prior = runs.at(-1)
    if (prior && prior.sourceNodeId === sourceNodeId && prior.style === style) {
      runs[runs.length - 1] = { ...prior, text: prior.text + text, width: twips(prior.width + runWidth) }
    } else {
      runs.push({ text, style, sourceNodeId, width: runWidth })
    }
    width = twips(width + runWidth)
    naturalHeight = twips(Math.max(naturalHeight, metrics.lineHeight(style)))
  }
}

function appendLongToken(
  token: Token,
  availableWidth: Twip,
  metrics: Phase1FontMetrics,
  append: (text: string, style: TextStyle, sourceNodeId: NodeId, width: Twip) => void,
  finishLine: () => void,
): void {
  let fragment = ""
  let fragmentWidth = twips(0)
  for (const character of token.text) {
    const characterWidth = metrics.measureText(character, token.style)
    if (fragment.length > 0 && fragmentWidth + characterWidth > availableWidth) {
      append(fragment, token.style, token.sourceNodeId, fragmentWidth)
      finishLine()
      fragment = ""
      fragmentWidth = twips(0)
    }
    // A single exceptionally wide character is retained rather than dropped.
    fragment += character
    fragmentWidth = twips(fragmentWidth + characterWidth)
  }
  if (fragment.length > 0) append(fragment, token.style, token.sourceNodeId, fragmentWidth)
}

function paragraphTokens(paragraph: ResolvedParagraph): readonly Token[] {
  const result: Token[] = []
  for (const child of paragraph.children) {
    const parts = child.text.split(/(\r\n|\r|\n|[\t ]+)/u)
    for (const part of parts) {
      if (part.length === 0) continue
      result.push({
        text: part,
        style: child.style,
        sourceNodeId: child.id,
        whitespace: /^[\t ]+$/u.test(part),
        hardBreak: /^(?:\r\n|\r|\n)$/u.test(part),
      })
    }
  }
  return result
}

function resolveLineHeight(properties: ParagraphProperties, lines: readonly MeasuredLine[]): Twip {
  const natural = lines.reduce((maximum, line) => Math.max(maximum, line.height), 0)
  return properties.lineSpacing ?? twips(Math.max(1, natural))
}

function alignedX(properties: ParagraphProperties, contentBounds: Rect, lineWidth: Twip): Twip {
  if (properties.alignment === "right") return twips(contentBounds.x + contentBounds.width - lineWidth)
  if (properties.alignment === "center") return twips(contentBounds.x + Math.floor((contentBounds.width - lineWidth) / 2))
  return contentBounds.x
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
