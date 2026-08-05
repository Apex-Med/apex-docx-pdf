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
  type ResolvedParagraph,
  type ShapedGlyph,
  type TextShaper,
  type TextStyle,
  type Twip,
} from "@apex-docx-pdf/core"

/** The A4 dimensions used by Word, represented as integer twips. */
export const A4_PAGE_WIDTH = twips(11_906)
export const A4_PAGE_HEIGHT = twips(16_838)

/** Explicit compatibility metrics for the Phase 1 built-in-font path. */
export type Phase1FontMetrics = Readonly<{
  measureText: (text: string, style: TextStyle) => Twip
  lineHeight: (style: TextStyle) => Twip
}>

type CommonLayoutOptions = Readonly<{
  maxPages?: number
  signal?: AbortSignal
  includeTrace?: boolean
}>

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
  whitespace: boolean
  preserveSpace: boolean
  faceId?: FontFaceId
  glyphs?: readonly PreparedGlyph[]
  underlineOffset: Twip
  underlineThickness: Twip
}>

type Token = Readonly<{
  clusters: readonly Cluster[]
  whitespace: boolean
  hardBreak: boolean
  preserveSpace: boolean
}>

type MeasuredLine = Readonly<{
  clusters: readonly Cluster[]
  width: Twip
  ascent: Twip
  descent: Twip
  lineGap: Twip
  wrapped: boolean
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
  const pages: PageDisplayListPage[] = []
  const tracePages: Array<{
    pageNumber: number
    pageBounds: Rect
    contentBounds: Rect
  }> = []
  const events: LayoutTraceEvent[] = []
  const numbering = createNumberingResolver(document, diagnostics)
  let current: PageState | undefined

  const createPage = (
    section: ResolvedDocument["sections"][number],
    reason?: string,
    sourceNodeId?: NodeId
  ): PageState => {
    throwIfAborted(options.signal)
    if (pages.length >= maxPages) throw new LayoutLimitError(maxPages)
    const { pageWidth, pageHeight, margins } = section.properties
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
    return { page, y: contentBounds.y, items: page.items as DisplayListItem[] }
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

    const sectionContentWidth = current.page.contentBounds.width
    const prepared = section.blocks.map((paragraph) => {
      throwIfAborted(options.signal)
      addCompatibilityDiagnostics(paragraph, typography, diagnostics)
      const label = numbering.resolve(paragraph, typography, options.signal)
      const properties = listParagraphProperties(paragraph.properties, label)
      let lines = measureParagraph(
        paragraph,
        sectionContentWidth,
        typography,
        diagnostics,
        properties,
        options.signal
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
      const lineHeights = lines.map((line) =>
        resolveLineHeight(properties, line)
      )
      const height = twips(
        paragraph.properties.spacingBefore +
          paragraph.properties.spacingAfter +
          lineHeights.reduce((total, height) => total + height, 0)
      )
      return { paragraph, lines, lineHeights, label, properties, height }
    })

    for (
      let paragraphIndex = 0;
      paragraphIndex < prepared.length;
      paragraphIndex += 1
    ) {
      throwIfAborted(options.signal)
      const item = prepared[paragraphIndex] as PreparedParagraph
      const { paragraph, lines, lineHeights, label, properties } = item
      let contentBottom = twips(
        current.page.contentBounds.y + current.page.contentBounds.height
      )

      if (
        paragraph.properties.pageBreakBefore &&
        current.y !== current.page.contentBounds.y
      ) {
        current = createPage(section, "page-break-before", paragraph.id)
        contentBottom = twips(
          current.page.contentBounds.y + current.page.contentBounds.height
        )
      }

      let chainEnd = paragraphIndex
      while (
        chainEnd < prepared.length - 1 &&
        prepared[chainEnd]?.paragraph.properties.keepWithNext &&
        !prepared[chainEnd + 1]?.paragraph.properties.pageBreakBefore
      ) {
        chainEnd += 1
      }
      const chainHeight = twips(
        prepared
          .slice(paragraphIndex, chainEnd + 1)
          .reduce((total, entry) => total + entry.height, 0)
      )
      if (chainEnd > paragraphIndex) {
        if (chainHeight <= current.page.contentBounds.height) {
          if (
            current.y !== current.page.contentBounds.y &&
            current.y + chainHeight > contentBottom
          ) {
            current = createPage(section, "keep-with-next", paragraph.id)
            contentBottom = twips(
              current.page.contentBounds.y + current.page.contentBounds.height
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
        }
      }

      if (
        paragraph.properties.keepLinesTogether &&
        item.height <= current.page.contentBounds.height &&
        current.y + item.height > contentBottom
      ) {
        current = createPage(section, "keep-lines-together", paragraph.id)
        contentBottom = twips(
          current.page.contentBounds.y + current.page.contentBounds.height
        )
      } else if (
        paragraph.properties.keepLinesTogether &&
        item.height > current.page.contentBounds.height
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
      }

      current.y = twips(current.y + paragraph.properties.spacingBefore)
      let lineIndex = 0
      let diagnosedWidowImpossible = false
      while (lineIndex < lines.length) {
        throwIfAborted(options.signal)
        let capacity = fittingLineCount(
          lineHeights,
          lineIndex,
          current.y,
          contentBottom
        )
        if (capacity === 0 && current.y !== current.page.contentBounds.y) {
          current = createPage(section, "line-overflow", paragraph.id)
          contentBottom = twips(
            current.page.contentBounds.y + current.page.contentBounds.height
          )
          continue
        }
        if (capacity === 0) capacity = 1

        const remaining = lines.length - lineIndex
        let breakReason = "line-overflow"
        if (paragraph.properties.widowControl && lines.length >= 4) {
          if (
            lineIndex === 0 &&
            capacity === 1 &&
            capacity < remaining &&
            current.y !== current.page.contentBounds.y
          ) {
            current = createPage(section, "widow-orphan", paragraph.id)
            contentBottom = twips(
              current.page.contentBounds.y + current.page.contentBounds.height
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
          }
          if (
            capacity === 1 &&
            capacity < remaining &&
            current.y === current.page.contentBounds.y &&
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
                x: current.page.contentBounds.x,
                y: current.y,
                width: current.page.contentBounds.width,
                height: lineHeight,
              },
              reason: "line-taller-than-content-area",
            })
          }

          const box = paragraphLineBox(
            properties,
            current.page.contentBounds,
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
            emitListLabel(
              current.items,
              label,
              current.page.contentBounds,
              baselineY
            )
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
          })
          current.y = twips(current.y + lineHeight)
          lineIndex += 1
        }
        const blockBox = paragraphLineBox(
          properties,
          current.page.contentBounds,
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
        if (lineIndex < lines.length) {
          current = createPage(section, breakReason, paragraph.id)
          contentBottom = twips(
            current.page.contentBounds.y + current.page.contentBounds.height
          )
        }
      }
      current.y = twips(current.y + paragraph.properties.spacingAfter)
    }
  }

  const displayList: PageDisplayList = Object.freeze({
    pages: pages.map((page) =>
      Object.freeze({ ...page, items: Object.freeze([...page.items]) })
    ),
  })
  const trace: LayoutTrace | undefined = options.includeTrace
    ? Object.freeze({
        pages: Object.freeze(tracePages),
        events: Object.freeze(events),
      })
    : undefined
  return Object.freeze({
    displayList,
    diagnostics: Object.freeze(diagnostics),
    ...(trace ? { trace } : {}),
  })
}

type Typography =
  | Readonly<{ kind: "standard"; metrics: Phase1FontMetrics }>
  | Readonly<{ kind: "embedded"; fonts: FontRegistry; shaper: TextShaper }>

type PageState = {
  page: PageDisplayListPage
  y: Twip
  items: DisplayListItem[]
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
          const format =
            level.legal && referenced < level.level
              ? "decimal"
              : referencedLevel.format
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
    (value.startAt as number) >= 1 &&
    NUMBERING_FORMATS.includes(value.format as NumberingFormat) &&
    typeof value.levelText === "string" &&
    value.levelText.length > 0 &&
    ["tab", "space", "nothing"].includes(value.suffix as string) &&
    ["left", "center", "right"].includes(value.alignment as string) &&
    Number.isSafeInteger(value.indentStart) &&
    Number.isSafeInteger(value.firstLineIndent) &&
    (value.restartAfterLevel === null ||
      isLevelIndex(value.restartAfterLevel)) &&
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
  const first = paragraph.children[0]
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
  signal?: AbortSignal
): readonly MeasuredLine[] {
  const tokens = prepareTokens(paragraph, typography, diagnostics, signal)
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
  const finish = (wrapped: boolean, force = false): void => {
    trimTrailingWhitespace()
    if (clusters.length > 0 || force) {
      const emptyMetrics = emptyLineMetrics(paragraph, typography)
      lines.push({
        clusters: Object.freeze(clusters),
        width,
        ascent: ascent || emptyMetrics.ascent,
        descent: descent || emptyMetrics.descent,
        lineGap: lineGap || emptyMetrics.lineGap,
        wrapped,
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
    if (token.hardBreak) {
      finish(false, true)
      continue
    }
    if (token.whitespace && clusters.length === 0 && !token.preserveSpace)
      continue
    const tokenWidth = token.clusters.reduce(
      (total, cluster) => total + cluster.width,
      0
    )
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
  signal?: AbortSignal
): readonly Token[] {
  const result: Token[] = []
  for (const child of paragraph.children) {
    throwIfAborted(signal)
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
    for (const range of ranges) {
      result.push({
        clusters: Object.freeze(
          prepared
            .filter(
              (cluster) =>
                range.start <= cluster.start && cluster.start < range.end
            )
            .map(({ start: _start, ...cluster }) => cluster)
        ),
        whitespace: range.whitespace,
        hardBreak: range.hardBreak,
        preserveSpace: child.preserveSpace === true,
      })
    }
  }
  return Object.freeze(result)
}

type IndexedCluster = Cluster & Readonly<{ start: number }>

function prepareStandardRun(
  child: ResolvedParagraph["children"][number],
  metrics: Phase1FontMetrics
): readonly IndexedCluster[] {
  const height = metrics.lineHeight(child.style)
  const ascent = twips(Math.round((height * 4) / 5))
  const descent = twips(height - ascent)
  const result: IndexedCluster[] = []
  let start = 0
  for (const character of child.text) {
    result.push({
      start,
      text: character,
      style: child.style,
      sourceNodeId: child.id,
      width: metrics.measureText(character, child.style),
      ascent,
      descent,
      lineGap: twips(0),
      whitespace: /^[\t ]$/u.test(character),
      preserveSpace: child.preserveSpace === true,
      underlineOffset: twips(
        Math.max(1, Math.round(child.style.fontSize / 10))
      ),
      underlineThickness: twips(
        Math.max(1, Math.round(child.style.fontSize / 20))
      ),
    })
    start += character.length
  }
  return result
}

function prepareEmbeddedRun(
  child: ResolvedParagraph["children"][number],
  typography: Extract<Typography, { kind: "embedded" }>,
  diagnostics: Diagnostic[]
): readonly IndexedCluster[] {
  const match = typography.fonts.matchFace({
    family: child.style.fontFamily,
    weight: child.style.fontWeight,
    style: child.style.fontStyle,
  })
  const face = typography.fonts.face(match.faceId)
  // Paragraph controls are layout boundaries, not font glyphs. Replacing each
  // UTF-16 code unit with a space preserves cluster offsets while still making
  // exactly one shaping call for the semantic run.
  const shapingText = child.text.replace(/[\r\n\t]/gu, " ")
  const shaped = typography.shaper.shape({
    face,
    text: shapingText,
    fontSize: child.style.fontSize,
    direction: "ltr",
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
    twips(Math.round((units * child.style.fontSize) / face.metrics.unitsPerEm))
  return [...grouped.values()]
    .sort(
      (left, right) =>
        (left[0]?.clusterStart ?? 0) - (right[0]?.clusterStart ?? 0)
    )
    .map((glyphs) => {
      const first = glyphs[0] as ShapedGlyph
      const end = Math.max(...glyphs.map((glyph) => glyph.clusterEnd))
      const text = child.text.slice(first.clusterStart, end)
      return {
        start: first.clusterStart,
        text,
        style: child.style,
        sourceNodeId: child.id,
        width: twips(
          glyphs.reduce((total, glyph) => total + glyph.advanceX, 0)
        ),
        ascent: twips(Math.max(0, shaped.ascent)),
        // OpenType descenders are conventionally negative; layout stores the
        // positive depth below the baseline.
        descent: twips(Math.abs(shaped.descent)),
        lineGap: twips(Math.max(0, shaped.lineGap)),
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
  const child = paragraph.children[0]
  if (child && typography.kind === "standard") {
    const height = typography.metrics.lineHeight(child.style)
    const ascent = twips(Math.round((height * 4) / 5))
    return { ascent, descent: twips(height - ascent), lineGap: twips(0) }
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
  if (spacing.rule === "exact") return twips(Math.max(1, spacing.value))
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
  items: DisplayListItem[],
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
    },
    new Map(),
    x,
    baselineY
  )
}

function emitLine(
  items: DisplayListItem[],
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
    const run: GlyphRun = first.faceId
      ? {
          type: "glyph-run",
          fontSource: "embedded",
          sourceNodeId: first.sourceNodeId,
          text,
          faceId: first.faceId,
          glyphs: Object.freeze(positionedGlyphs(segment)),
          fontSize: first.style.fontSize,
          color: first.style.color,
          x,
          baselineY,
          width,
        }
      : {
          type: "glyph-run",
          fontSource: "standard",
          sourceNodeId: first.sourceNodeId,
          text,
          fontFamily: first.style.fontFamily,
          fontSize: first.style.fontSize,
          color: first.style.color,
          x,
          baselineY,
          width,
        }
    items.push(run)
    if (first.style.underline) {
      items.push({
        type: "line",
        sourceNodeId: first.sourceNodeId,
        x1: x,
        y1: twips(baselineY + first.underlineOffset),
        x2: twips(x + width),
        y2: twips(baselineY + first.underlineOffset),
        width: first.underlineThickness,
        color: first.style.color,
      })
    }
    x = twips(x + width)
    segment = []
  }

  for (const [index, cluster] of line.clusters.entries()) {
    const addition = additions.get(index) ?? twips(0)
    const first = segment[0]?.cluster
    const compatible =
      !first ||
      (first.sourceNodeId === cluster.sourceNodeId &&
        first.style === cluster.style &&
        first.faceId === cluster.faceId)
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
