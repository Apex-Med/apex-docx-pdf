import type { LayoutTrace, NodeId, PageDisplayList } from "@apexmed/core"
import type { Node as PMNode } from "prosemirror-model"

import { templateTagLayoutText } from "../node-views/template-tag"

function templateTagLayoutExtent(node: PMNode): number {
  return Math.max(1, templateTagLayoutText(node).length)
}

const TWIPS_PER_PX = 15
export const DEFAULT_PAGE_GAP_PX = 32
export const PAGE_GAP_TWIPS = DEFAULT_PAGE_GAP_PX * TWIPS_PER_PX

/**
 * Transaction meta: after pagination paints spacers, scroll the caret to the
 * next sheet instead of relying on the insert-time `scrollIntoView()`.
 */
export const PAGE_BREAK_SCROLL_META = "apexPageBreakScroll"

/** Border-box height of a section page stack: n sheets + (n-1) desk gaps. */
export function sectionStackHeightTwips(
  pageCount: number,
  pageHeightTwips: number
): number {
  const pages = Math.max(1, Math.round(pageCount))
  return pages * pageHeightTwips + Math.max(0, pages - 1) * PAGE_GAP_TWIPS
}

/**
 * A page-break spacer placement derived from engine layout authority.
 * Geometry is sized so the editor paints distinct Google Docs-style page sheets.
 */
export type PageBreakPlacement = Readonly<{
  sourceNodeId: NodeId
  /** Character offset within the paragraph at which the next page begins. */
  charOffset: number
  /** 1-based page number that starts after this break. */
  pageNumber: number
  /**
   * Remaining content-box height on the page that is ending (after the last
   * line on that page). Used to fill the rest of the sheet.
   */
  restTwips: number
  contentHeightTwips: number
  pageWidthTwips: number
  pageHeightTwips: number
  marginTopTwips: number
  marginBottomTwips: number
  marginLeftTwips: number
  marginRightTwips: number
  key: string
  /**
   * Optional absolute ProseMirror position (e.g. a manual `page_break` atom).
   * When set, decorations skip char-offset mapping and use this directly.
   */
  explicitPosition?: number
}>

export type PageGeometry = Readonly<{
  pageWidthTwips: number
  pageHeightTwips: number
  marginTopTwips: number
  marginBottomTwips: number
  marginLeftTwips: number
  marginRightTwips: number
  contentHeightTwips: number
}>

export function pageGeometryFromDisplayList(
  displayList?: PageDisplayList,
  pageNumber = 1
): PageGeometry {
  const page =
    displayList?.pages.find((entry) => entry.pageNumber === pageNumber) ??
    displayList?.pages[0]
  if (!page) {
    return {
      pageWidthTwips: 11_906,
      pageHeightTwips: 16_838,
      marginTopTwips: 1_440,
      marginBottomTwips: 1_440,
      marginLeftTwips: 1_440,
      marginRightTwips: 1_440,
      contentHeightTwips: 16_838 - 2_880,
    }
  }
  const marginTop = page.contentBounds.y
  const marginLeft = page.contentBounds.x
  const marginRight =
    page.width - page.contentBounds.x - page.contentBounds.width
  const marginBottom =
    page.height - page.contentBounds.y - page.contentBounds.height
  return {
    pageWidthTwips: page.width,
    pageHeightTwips: page.height,
    marginTopTwips: marginTop,
    marginBottomTwips: Math.max(0, marginBottom),
    marginLeftTwips: marginLeft,
    marginRightTwips: Math.max(0, marginRight),
    contentHeightTwips: page.contentBounds.height,
  }
}

export type SectionPageCount = Readonly<{
  sectionId: string
  pageCount: number
  pageHeightTwips: number
}>

/**
 * 1-based start page for each top-level section. A `section-boundary`
 * page-break starts the next section; the first section always starts at 1.
 */
export function sectionBoundaryStartPages(
  trace: LayoutTrace
): readonly number[] {
  const boundaryPages = trace.events
    .filter(
      (event) =>
        event.kind === "page-break" && event.reason === "section-boundary"
    )
    .map((event) => event.pageNumber)
  return [1, ...boundaryPages]
}

/**
 * Per-section sheet counts using the same section-boundary mapping as
 * header/footer overlays. Each ProseMirror `section` is its own stack.
 */
export function sectionPageCountsFromLayout(
  doc: PMNode,
  displayList: PageDisplayList,
  trace: LayoutTrace
): readonly SectionPageCount[] {
  const sectionStarts = sectionBoundaryStartPages(trace)
  const totalPages = displayList.pages.length
  const counts: SectionPageCount[] = []
  doc.forEach((node) => {
    if (node.type.name !== "section") return
    const index = counts.length
    const startPage = sectionStarts[index] ?? 1
    const endPage = (sectionStarts[index + 1] ?? totalPages + 1) - 1
    counts.push({
      sectionId: String(node.attrs.nodeId ?? ""),
      pageCount: Math.max(1, endPage - startPage + 1),
      pageHeightTwips: Number(node.attrs.pageHeight ?? 16_838),
    })
  })
  return counts
}

/**
 * Fallback paint for stack page counts. Prefer PM node decorations so this
 * stays a no-op once `--apex-section-pages` is already present. Writing the
 * var onto a managed section node from `view.update()` loops MutationObserver.
 */
export function applySectionPageCountsToDom(
  root: ParentNode,
  sections: readonly SectionPageCount[]
): void {
  if (typeof document === "undefined") return
  if (sections.length === 0) return
  const nodes = Array.from(
    root.querySelectorAll("section[data-section]")
  ) as HTMLElement[]
  for (let index = 0; index < nodes.length; index += 1) {
    const element = nodes[index]
    if (!element) continue
    const id = element.getAttribute("data-node-id") ?? ""
    const match =
      (id.length > 0
        ? sections.find((section) => section.sectionId === id)
        : undefined) ?? sections[index]
    const pageCount = String(Math.max(1, match?.pageCount ?? 1))
    if (element.style.getPropertyValue("--apex-section-pages") === pageCount) {
      continue
    }
    element.style.setProperty("--apex-section-pages", pageCount)
  }
}

/**
 * Derive page-break placements from layout trace line events.
 * Rest height is measured on the page that is *ending* (after the last line
 * that still fits), so the spacer fills that sheet and opens the next one.
 */
export function pageBreaksFromTrace(
  trace: LayoutTrace,
  displayList?: PageDisplayList
): readonly PageBreakPlacement[] {
  const placements: PageBreakPlacement[] = []
  const lines = trace.events.filter((event) => event.kind === "line")
  const seenDestinationPages = new Set<number>()
  const sectionBoundaryPages = new Set(
    trace.events
      .filter(
        (event) =>
          event.kind === "page-break" && event.reason === "section-boundary"
      )
      .map((event) => event.pageNumber)
  )

  // Trace events are emitted in document-flow order. A page sheet begins only
  // when two consecutive rendered lines cross a page boundary. This global
  // transition is essential: grouping by paragraph incorrectly emits a spacer
  // for every paragraph that merely happens to live on page 2+.
  for (let index = 1; index < lines.length; index += 1) {
    const previous = lines[index - 1]
    const current = lines[index]
    if (!previous || !current) continue
    if (current.pageNumber <= previous.pageNumber) continue
    // A top-level ProseMirror section already renders as its own physical
    // sheet. Adding an inline spacer at the same boundary duplicates the page.
    if (sectionBoundaryPages.has(current.pageNumber)) continue
    if (seenDestinationPages.has(current.pageNumber)) continue

    const computed = restFromEndingLine(
      {
        pageNumber: previous.pageNumber,
        charOffset: previous.charOffset,
        lineIndex: previous.lineIndex,
        boundsY: previous.bounds.y,
        boundsHeight: previous.bounds.height,
      },
      displayList
    )
    const key = `${current.pageNumber}:${String(current.sourceNodeId)}:${current.charOffset}:${computed.restTwips}:${computed.geo.pageWidthTwips}x${computed.geo.pageHeightTwips}:${computed.geo.marginTopTwips},${computed.geo.marginRightTwips},${computed.geo.marginBottomTwips},${computed.geo.marginLeftTwips}`
    seenDestinationPages.add(current.pageNumber)
    placements.push({
      sourceNodeId: current.sourceNodeId,
      charOffset: current.charOffset,
      pageNumber: current.pageNumber,
      restTwips: computed.restTwips,
      contentHeightTwips: computed.geo.contentHeightTwips,
      pageWidthTwips: computed.geo.pageWidthTwips,
      pageHeightTwips: computed.geo.pageHeightTwips,
      marginTopTwips: computed.geo.marginTopTwips,
      marginBottomTwips: computed.geo.marginBottomTwips,
      marginLeftTwips: computed.geo.marginLeftTwips,
      marginRightTwips: computed.geo.marginRightTwips,
      key,
    })
  }

  return placements
}

type TraceLine = Readonly<{
  pageNumber: number
  charOffset: number
  lineIndex: number
  boundsY: number
  boundsHeight: number
}>

function traceLinesByNode(
  trace: LayoutTrace | undefined
): Map<string, TraceLine[]> {
  const linesByNode = new Map<string, TraceLine[]>()
  if (!trace) return linesByNode
  for (const event of trace.events) {
    if (event.kind !== "line") continue
    const list = linesByNode.get(String(event.sourceNodeId)) ?? []
    list.push({
      pageNumber: event.pageNumber,
      charOffset: event.charOffset,
      lineIndex: event.lineIndex,
      boundsY: event.bounds.y,
      boundsHeight: event.bounds.height,
    })
    linesByNode.set(String(event.sourceNodeId), list)
  }
  for (const lines of linesByNode.values()) {
    lines.sort(
      (a, b) => a.lineIndex - b.lineIndex || a.pageNumber - b.pageNumber
    )
  }
  return linesByNode
}

function restFromEndingLine(
  line: TraceLine,
  displayList?: PageDisplayList
): {
  restTwips: number
  geo: PageGeometry
  endingPageNumber: number
} {
  const endingPageNumber = line.pageNumber
  const endingPage = displayList?.pages.find(
    (p) => p.pageNumber === endingPageNumber
  )
  const geo = pageGeometryFromDisplayList(displayList, endingPageNumber)
  const contentBottom =
    (endingPage?.contentBounds.y ?? geo.marginTopTwips) +
    (endingPage?.contentBounds.height ?? geo.contentHeightTwips)
  const lineBottom = line.boundsY + line.boundsHeight
  const rest = Math.max(0, contentBottom - lineBottom)
  return { restTwips: rest, geo, endingPageNumber }
}

/**
 * Manual `page_break` atoms create a new engine page but often leave no
 * mid-paragraph / between-block line pair for `pageBreaksFromTrace` (e.g. a
 * break in an otherwise empty paragraph). Ensure every manual break gets a
 * Google Docs-style full page-stack spacer at the break atom.
 *
 * When the engine also emits a between-block / mid-para placement for the same
 * destination page, drop the engine one so we don't paint two stacks.
 */
export function mergeManualPageBreakPlacements(
  doc: PMNode,
  placements: readonly PageBreakPlacement[],
  displayList?: PageDisplayList,
  trace?: LayoutTrace
): readonly PageBreakPlacement[] {
  const linesByNode = traceLinesByNode(trace)
  const manualEventsByNode = new Map<string, number[]>()
  for (const event of trace?.events ?? []) {
    if (event.kind !== "page-break" || event.reason !== "manual-page-break") {
      continue
    }
    const key = String(event.sourceNodeId)
    const pages = manualEventsByNode.get(key) ?? []
    pages.push(event.pageNumber)
    manualEventsByNode.set(key, pages)
  }
  const manualEventIndexByNode = new Map<string, number>()
  const manuals: PageBreakPlacement[] = []
  const seenKeys = new Set<string>()

  doc.descendants((node, pos) => {
    if (node.type.name !== "paragraph") return true
    const sourceNodeId = String(node.attrs.nodeId ?? "")
    if (!sourceNodeId) return true

    let layoutCharOffset = 0
    node.forEach((child, childOffset) => {
      if (child.type.name === "page_break") {
        const breakPos = pos + 1 + childOffset
        const lines = linesByNode.get(sourceNodeId) ?? []
        const manualPages = manualEventsByNode.get(sourceNodeId) ?? []
        const manualIndex = manualEventIndexByNode.get(sourceNodeId) ?? 0
        const tracedPageNumber = manualPages[manualIndex]
        manualEventIndexByNode.set(sourceNodeId, manualIndex + 1)

        // Never use a line from after the manual break. Character offsets skip
        // break atoms, so an after-break line can otherwise share the break's
        // offset and incorrectly advance the spacer by an extra page.
        const endingLine =
          [...lines]
            .reverse()
            .find(
              (line) =>
                line.charOffset <= layoutCharOffset &&
                (tracedPageNumber === undefined ||
                  line.pageNumber < tracedPageNumber)
            ) ?? null

        let restTwips: number
        let geo: PageGeometry
        let pageNumber: number
        if (endingLine) {
          const computed = restFromEndingLine(endingLine, displayList)
          restTwips = computed.restTwips
          geo = computed.geo
          pageNumber = tracedPageNumber ?? computed.endingPageNumber + 1
        } else {
          pageNumber =
            tracedPageNumber ?? Math.max(2, displayList?.pages.length ?? 2)
          geo = pageGeometryFromDisplayList(displayList, pageNumber - 1)
          restTwips = geo.contentHeightTwips
        }

        const key = `manual:${pageNumber}:${sourceNodeId}:${breakPos}:${restTwips}`
        if (!seenKeys.has(key)) {
          seenKeys.add(key)
          manuals.push({
            sourceNodeId: sourceNodeId as NodeId,
            charOffset: layoutCharOffset,
            pageNumber,
            restTwips,
            contentHeightTwips: geo.contentHeightTwips,
            pageWidthTwips: geo.pageWidthTwips,
            pageHeightTwips: geo.pageHeightTwips,
            marginTopTwips: geo.marginTopTwips,
            marginBottomTwips: geo.marginBottomTwips,
            marginLeftTwips: geo.marginLeftTwips,
            marginRightTwips: geo.marginRightTwips,
            key,
            explicitPosition: breakPos,
          })
        }
        // Layout char-offset map skips page/column breaks (see prepareTokens).
        return
      }

      if (child.type.name === "column_break") {
        return
      }
      if (child.isText) {
        layoutCharOffset += child.text?.length ?? 0
      } else if (child.type.name === "template_tag") {
        layoutCharOffset += templateTagLayoutExtent(child)
      } else {
        layoutCharOffset += 1
      }
    })
    return true
  })

  if (manuals.length === 0) return placements

  const manualPages = new Set(manuals.map((p) => p.pageNumber))
  const keptEngine = placements.filter((p) => !manualPages.has(p.pageNumber))
  const merged = [...keptEngine, ...manuals]
  merged.sort(
    (a, b) => a.pageNumber - b.pageNumber || a.charOffset - b.charOffset
  )
  return merged
}

/**
 * Map a paragraph NodeId + character offset to a ProseMirror document position.
 */
export function positionForParagraphOffset(
  doc: PMNode,
  sourceNodeId: string,
  charOffset: number
): number | null {
  let found: number | null = null
  doc.descendants((node, pos) => {
    if (found !== null) return false
    if (node.type.name !== "paragraph") return true
    if (String(node.attrs.nodeId) !== sourceNodeId) return true
    const contentStart = pos + 1
    let layoutOffset = 0
    let offset = 0
    let resolved = false
    node.forEach((child, childOffset) => {
      if (resolved) return
      if (child.isText) {
        const len = child.text?.length ?? 0
        if (charOffset <= layoutOffset + len) {
          offset = childOffset + Math.max(0, charOffset - layoutOffset)
          resolved = true
          return
        }
        layoutOffset += len
        offset = childOffset + len
        return
      }

      if (
        child.type.name === "page_break" ||
        child.type.name === "column_break" ||
        child.type.name === "line_break" ||
        child.type.name === "hard_break"
      ) {
        // Layout break tokens are zero-width. Advancing only the PM position
        // maps a following line to the far side of the break atom.
        offset = childOffset + child.nodeSize
        return
      }

      const layoutExtent =
        child.type.name === "page_field"
          ? String(child.attrs.displayText ?? "").length
          : child.type.name === "template_tag"
            ? templateTagLayoutExtent(child)
            : 1
      if (charOffset <= layoutOffset) {
        offset = childOffset
        resolved = true
        return
      }
      if (charOffset < layoutOffset + layoutExtent) {
        // Atomic PM nodes cannot host a widget in their visual text. Keep the
        // whole atom on the destination side instead of splitting it.
        offset = childOffset
        resolved = true
        return
      }
      layoutOffset += layoutExtent
      offset = childOffset + child.nodeSize
    })
    found = contentStart + Math.min(offset, node.content.size)
    return false
  })
  return found
}

export function paginationSignature(
  placements: readonly PageBreakPlacement[],
  pageCount: number
): string {
  return `${pageCount}|${placements
    .map(
      (placement) =>
        `${placement.key}:${placement.pageWidthTwips}x${placement.pageHeightTwips}:${placement.marginTopTwips},${placement.marginRightTwips},${placement.marginBottomTwips},${placement.marginLeftTwips}`
    )
    .join(",")}`
}

/**
 * Widget identity that stays stable across rest-height / geometry tweaks.
 * Including restTwips in the ProseMirror widget key recreates the whole page
 * stack on every keystroke and flashes the sheet.
 */
export function decorationKeyForPlacement(
  placement: PageBreakPlacement
): string {
  return placement.explicitPosition !== undefined
    ? `manual-${placement.pageNumber}`
    : `page-${placement.pageNumber}`
}

function twipToPx(twips: number): number {
  return twips / TWIPS_PER_PX
}

function overhangCss(
  marginLeftPx: number,
  marginRightPx: number
): readonly string[] {
  return [
    `margin-left:-${marginLeftPx}px`,
    `margin-right:-${marginRightPx}px`,
    `width:calc(100% + ${marginLeftPx + marginRightPx}px)`,
  ]
}

/** Mutate an existing spacer so pagination can update geometry without remounting. */
export function applyBreakSpacerGeometry(
  root: HTMLElement,
  placement: PageBreakPlacement
): void {
  const restPx = Math.max(0, twipToPx(placement.restTwips))
  const marginBottomPx = Math.max(0, twipToPx(placement.marginBottomTwips))
  const marginTopPx = Math.max(0, twipToPx(placement.marginTopTwips))
  const marginLeftPx = Math.max(0, twipToPx(placement.marginLeftTwips))
  const marginRightPx = Math.max(0, twipToPx(placement.marginRightTwips))
  const gapPx = DEFAULT_PAGE_GAP_PX
  const totalHeight = restPx + marginBottomPx + gapPx + marginTopPx

  root.setAttribute(
    "data-page-break-spacer",
    decorationKeyForPlacement(placement)
  )
  root.setAttribute("data-page-number", String(placement.pageNumber))
  root.style.height = `${totalHeight}px`

  const rest = root.querySelector(
    ".apex-page-break-spacer__rest"
  ) as HTMLElement | null
  if (rest) rest.style.height = `${restPx}px`

  const bottomMargin = root.querySelector(
    ".apex-page-break-spacer__page-margin-bottom"
  ) as HTMLElement | null
  if (bottomMargin) {
    bottomMargin.style.height = `${marginBottomPx}px`
    bottomMargin.style.marginLeft = `-${marginLeftPx}px`
    bottomMargin.style.marginRight = `-${marginRightPx}px`
    bottomMargin.style.width = `calc(100% + ${marginLeftPx + marginRightPx}px)`
  }

  const gap = root.querySelector(
    ".apex-page-break-spacer__gap"
  ) as HTMLElement | null
  if (gap) {
    gap.style.height = `${gapPx}px`
    gap.style.marginLeft = `-${marginLeftPx}px`
    gap.style.marginRight = `-${marginRightPx}px`
    gap.style.width = `calc(100% + ${marginLeftPx + marginRightPx}px)`
  }

  const topMargin = root.querySelector(
    ".apex-page-break-spacer__page-margin-top"
  ) as HTMLElement | null
  if (topMargin) {
    topMargin.style.height = `${marginTopPx}px`
    topMargin.style.marginLeft = `-${marginLeftPx}px`
    topMargin.style.marginRight = `-${marginRightPx}px`
    topMargin.style.width = `calc(100% + ${marginLeftPx + marginRightPx}px)`
  }

  const label = root.querySelector(".apex-page-break-spacer__label")
  if (label) label.textContent = `Page ${placement.pageNumber}`
}

export function applySpacerGeometryToDom(
  root: ParentNode,
  placements: readonly PageBreakPlacement[]
): void {
  if (typeof document === "undefined") return
  for (const placement of placements) {
    const key = decorationKeyForPlacement(placement)
    const el = root.querySelector(
      `[data-page-break-spacer="${key}"]`
    ) as HTMLElement | null
    if (el) applyBreakSpacerGeometry(el, placement)
  }
}

/**
 * Google Docs-style page sheet break:
 *  1. Fill remainder of current page content area (white)
 *  2. Bottom margin strip (white)
 *  3. Inter-page gray gutter with page label
 *  4. Next page top margin (white) so following content starts on a new sheet
 *
 * Uses float:left;clear:both so remaining inline content is pushed below the
 * full page stack (engine-authoritative mid-paragraph technique).
 */
export function createBreakSpacerElement(
  placement: PageBreakPlacement
): HTMLElement {
  const restPx = Math.max(0, twipToPx(placement.restTwips))
  const marginBottomPx = Math.max(0, twipToPx(placement.marginBottomTwips))
  const marginTopPx = Math.max(0, twipToPx(placement.marginTopTwips))
  const marginLeftPx = Math.max(0, twipToPx(placement.marginLeftTwips))
  const marginRightPx = Math.max(0, twipToPx(placement.marginRightTwips))
  const gapPx = DEFAULT_PAGE_GAP_PX
  const totalHeight = restPx + marginBottomPx + gapPx + marginTopPx

  const root = document.createElement("span")
  root.className = "apex-page-break-spacer"
  root.setAttribute("contenteditable", "false")
  root.style.cssText = [
    "display:block",
    "float:left",
    "clear:both",
    "width:100%",
    `height:${totalHeight}px`,
    "pointer-events:none",
    "user-select:none",
    "position:relative",
    "box-sizing:border-box",
  ].join(";")

  // 1) Remainder of current page body
  const rest = document.createElement("div")
  rest.className = "apex-page-break-spacer__rest"
  rest.style.cssText = `height:${restPx}px;width:100%;background:var(--apex-page-bg,#fff);`

  // 2) Bottom margin of current page (extends white sheet)
  const bottomMargin = document.createElement("div")
  bottomMargin.className = "apex-page-break-spacer__page-margin-bottom"
  bottomMargin.style.cssText = [
    `height:${marginBottomPx}px`,
    ...overhangCss(marginLeftPx, marginRightPx),
    "background:var(--apex-page-bg,#fff)",
    /* Shadows are painted in the desk gutter, not on the margin strip. */
    "box-shadow:none",
    "box-sizing:border-box",
  ].join(";")

  // 3) Gray inter-page gutter (Google Docs desk)
  const gap = document.createElement("div")
  gap.className = "apex-page-break-spacer__gap"
  gap.style.cssText = [
    `height:${gapPx}px`,
    ...overhangCss(marginLeftPx, marginRightPx),
    "background:var(--apex-desk,#e5e7eb)",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "box-sizing:border-box",
    "position:relative",
    "overflow:hidden",
  ].join(";")
  const label = document.createElement("span")
  label.className = "apex-page-break-spacer__label"
  gap.append(label)

  // 4) Top margin of next page (new white sheet starts)
  const topMargin = document.createElement("div")
  topMargin.className = "apex-page-break-spacer__page-margin-top"
  topMargin.style.cssText = [
    `height:${marginTopPx}px`,
    ...overhangCss(marginLeftPx, marginRightPx),
    "background:var(--apex-page-bg,#fff)",
    "box-shadow:none",
    "box-sizing:border-box",
    "border-radius:1px 1px 0 0",
  ].join(";")

  root.append(rest, bottomMargin, gap, topMargin)
  applyBreakSpacerGeometry(root, placement)
  return root
}

/** Create a valid table continuation row spanning the authored table grid. */
export function createTableBreakRowElement(
  placement: PageBreakPlacement,
  columnCount: number
): HTMLTableRowElement {
  const row = document.createElement("tr")
  row.className = "apex-page-break-row"
  row.setAttribute("data-page-number", String(placement.pageNumber))
  row.setAttribute("contenteditable", "false")
  const cell = document.createElement("td")
  cell.colSpan = Math.max(1, columnCount)
  cell.style.cssText = [
    "padding:0",
    "border:none",
    "background:transparent",
    "overflow:visible",
  ].join(";")
  cell.append(createBreakSpacerElement(placement))
  row.append(cell)
  return row
}

export type SpacerSpec = Readonly<{
  position: number
  side: -1
  key: string
  heightTwips: number
  technique: "float-block"
  charOffset: number
  sourceNodeId: string
  pageNumber: number
}>

export function spacerSpecsFromPlacements(
  doc: PMNode,
  placements: readonly PageBreakPlacement[]
): readonly SpacerSpec[] {
  const specs: SpacerSpec[] = []
  for (const placement of placements) {
    const position =
      placement.explicitPosition ??
      positionForParagraphOffset(
        doc,
        String(placement.sourceNodeId),
        placement.charOffset
      )
    if (position === null) continue
    const heightTwips =
      placement.restTwips +
      placement.marginBottomTwips +
      Math.round(DEFAULT_PAGE_GAP_PX * TWIPS_PER_PX) +
      placement.marginTopTwips
    specs.push({
      position,
      side: -1,
      key: placement.key,
      heightTwips,
      technique: "float-block",
      charOffset: placement.charOffset,
      sourceNodeId: String(placement.sourceNodeId),
      pageNumber: placement.pageNumber,
    })
  }
  return specs
}

export type OversizedBlockDiagnostic = Readonly<{
  code: "editor/oversized-non-splittable-block"
  sourceNodeId: string
  contentHeightTwips: number
  pageContentHeightTwips: number
  message: string
}>

export function detectOversizedNonSplittable(
  trace: LayoutTrace,
  displayList: PageDisplayList,
  options: Readonly<{ maxIterations?: number; iteration?: number }> = {}
): {
  diagnostics: readonly OversizedBlockDiagnostic[]
  shouldAbort: boolean
} {
  const maxIterations = options.maxIterations ?? 8
  const iteration = options.iteration ?? 0
  const diagnostics: OversizedBlockDiagnostic[] = []
  const pageHeight =
    displayList.pages[0]?.contentBounds.height ?? Number.POSITIVE_INFINITY

  for (const event of trace.events) {
    if (event.kind !== "overflow" && event.kind !== "block") continue
    if (event.kind === "block" && event.bounds.height > pageHeight) {
      diagnostics.push({
        code: "editor/oversized-non-splittable-block",
        sourceNodeId: String(event.sourceNodeId),
        contentHeightTwips: event.bounds.height,
        pageContentHeightTwips: pageHeight,
        message: `Block ${event.sourceNodeId} is taller than the page content box and cannot be split.`,
      })
    }
  }

  return {
    diagnostics,
    shouldAbort: iteration >= maxIterations && diagnostics.length > 0,
  }
}
