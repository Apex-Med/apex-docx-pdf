import type {
  DisplayListItem,
  LayoutTrace,
  PageDisplayList,
  SemanticDocument,
  SemanticHeaderFooter,
  SemanticImageAsset,
} from "@apexmed/core"
import {
  Plugin,
  PluginKey,
  type EditorState,
  type Transaction,
} from "prosemirror-state"
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view"

import {
  HEADER_FOOTER_CONTENT_TR_META,
  HEADER_FOOTER_EDIT_REQUEST_EVENT,
  type HeaderFooterEditRequestDetail,
  type HeaderFooterKind,
  type HeaderFooterVariant,
} from "../header-footer"
import { toSemanticDocument } from "../model/bridge"
import { TEMPLATE_TAG_VALUES_TR_META } from "../tags"
import {
  applySectionPageCountsToDom,
  applySpacerGeometryToDom,
  createBreakSpacerElement,
  createTableBreakRowElement,
  decorationKeyForPlacement,
  detectOversizedNonSplittable,
  mergeManualPageBreakPlacements,
  PAGE_BREAK_SCROLL_META,
  PAGE_GAP_TWIPS,
  pageBreaksFromTrace,
  paginationSignature,
  positionForParagraphOffset,
  sectionBoundaryStartPages,
  sectionPageCountsFromLayout,
  type PageBreakPlacement,
  type SectionPageCount,
} from "./breaks"
import {
  createLayoutClient,
  getLayoutAsync,
  layoutInProcess,
  type LayoutClient,
} from "./layout-client"
import type { LayoutWorkerSuccess } from "./protocol"

function tableRowBoundary(
  doc: import("prosemirror-model").Node,
  position: number
): Readonly<{ position: number; columnCount: number }> | null {
  const resolved = doc.resolve(Math.min(position, doc.content.size))
  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    if (resolved.node(depth).type.name !== "table_row") continue
    const table = resolved.node(depth - 1)
    let columnCount = 1
    table.forEach((row) => {
      let columns = 0
      row.forEach((cell) => {
        columns += Math.max(1, Number(cell.attrs.colspan ?? 1))
      })
      columnCount = Math.max(columnCount, columns)
    })
    return Object.freeze({
      position: resolved.before(depth),
      columnCount,
    })
  }
  return null
}

export type PaginationPluginState = Readonly<{
  decorations: DecorationSet
  signature: string
  placements: readonly PageBreakPlacement[]
  pageCount: number
  sectionPages: readonly SectionPageCount[]
  diagnostics: readonly string[]
  iteration: number
  valuesEpoch: number
  scrollAfterPagination: boolean
}>

export const paginationPluginKey = new PluginKey<PaginationPluginState>(
  "apexPagination"
)

export type PaginationLayoutFn = (
  document: SemanticDocument,
  options: { includeTrace: true; maxPages?: number }
) => {
  displayList: import("@apexmed/core").PageDisplayList
  trace?: import("@apexmed/core").LayoutTrace
  diagnostics: readonly { code: string; message: string; severity: string }[]
}

export type PaginationPluginOptions = Readonly<{
  /**
   * Sync layout function for tests. When omitted, a Web Worker client is used
   * so layoutDocument(..., { includeTrace }) runs off the main thread.
   */
  layout?: PaginationLayoutFn
  /** Pre-built layout client (worker). Takes precedence over creating one. */
  layoutClient?: LayoutClient
  /** Force in-process layout even when Worker is available. */
  forceInProcess?: boolean
  /** Optional bridge context when converting PM → semantic. */
  toSemantic?: (state: EditorState) => SemanticDocument
  maxPages?: number
  maxIterations?: number
  /** When true, skip real DOM spacer construction (headless tests). */
  structuralOnly?: boolean
}>

const EMPTY_STATE: PaginationPluginState = {
  decorations: DecorationSet.empty,
  signature: "",
  placements: [],
  pageCount: 0,
  sectionPages: [],
  diagnostics: [],
  iteration: 0,
  valuesEpoch: 0,
  scrollAfterPagination: false,
}

const SVG_NS = "http://www.w3.org/2000/svg"

export type HeaderFooterOverlayPage = Readonly<{
  pageNumber: number
  width: number
  height: number
  contentBounds: PageDisplayList["pages"][number]["contentBounds"]
  items: readonly DisplayListItem[]
  headerItemCount: number
  footerItemCount: number
  variant: HeaderFooterVariant
}>

export type HeaderFooterOverlaySpec = Readonly<{
  position: number
  sectionId: string
  pages: readonly HeaderFooterOverlayPage[]
}>

function headerFooterSourceNodeIds(
  definitions: readonly SemanticHeaderFooter[]
): ReadonlySet<string> {
  const ids = new Set<string>()
  const addParagraph = (
    paragraph: Extract<SemanticHeaderFooter["blocks"][number], { type: "paragraph" }>
  ): void => {
    ids.add(String(paragraph.id))
    for (const inline of paragraph.children) ids.add(String(inline.id))
  }
  for (const definition of definitions) {
    for (const block of definition.blocks) {
      if (block.type === "paragraph") {
        addParagraph(block)
        continue
      }
      ids.add(String(block.id))
      if (block.type === "horizontalRule") continue
      for (const row of block.rows) {
        ids.add(String(row.id))
        for (const cell of row.cells) {
          ids.add(String(cell.id))
          for (const paragraph of cell.blocks) addParagraph(paragraph)
        }
      }
    }
  }
  return ids
}

/**
 * Select the engine-painted header/footer items and assign them to the
 * matching ProseMirror section sheet. Body items deliberately remain native
 * editable DOM; only the non-editable page furniture is mirrored here.
 */
export function headerFooterOverlaySpecs(
  doc: import("prosemirror-model").Node,
  semanticDocument: SemanticDocument,
  displayList: PageDisplayList,
  trace: LayoutTrace
): readonly HeaderFooterOverlaySpec[] {
  const headerSourceNodeIds = headerFooterSourceNodeIds(
    semanticDocument.headers
  )
  const footerSourceNodeIds = headerFooterSourceNodeIds(
    semanticDocument.footers
  )
  const sourceNodeIds = new Set([
    ...headerSourceNodeIds,
    ...footerSourceNodeIds,
  ])
  if (sourceNodeIds.size === 0) return []

  const sections: Array<Readonly<{ position: number; sectionId: string }>> = []
  doc.forEach((node, offset) => {
    if (node.type.name !== "section") return
    sections.push({
      position: offset + 1,
      sectionId: String(node.attrs.nodeId ?? ""),
    })
  })

  const sectionStarts = sectionBoundaryStartPages(trace)

  return sections
    .map((section, index): HeaderFooterOverlaySpec => {
      const startPage = sectionStarts[index] ?? 1
      const endPage =
        (sectionStarts[index + 1] ?? displayList.pages.length + 1) - 1
      const semanticSection = semanticDocument.sections.find(
        (entry) => String(entry.id) === section.sectionId
      )
      return {
        ...section,
        pages: displayList.pages
          .filter(
            (page) => page.pageNumber >= startPage && page.pageNumber <= endPage
          )
          .map((page) => {
            const items = page.items.filter((item) =>
              sourceNodeIds.has(String(item.sourceNodeId))
            )
            return {
              pageNumber: page.pageNumber,
              width: page.width,
              height: page.height,
              contentBounds: page.contentBounds,
              items,
              headerItemCount: items.filter((item) =>
                headerSourceNodeIds.has(String(item.sourceNodeId))
              ).length,
              footerItemCount: items.filter((item) =>
                footerSourceNodeIds.has(String(item.sourceNodeId))
              ).length,
              variant:
                page.pageNumber === startPage &&
                semanticSection?.properties.differentFirstPage === true
                  ? "first"
                  : "default",
            }
          }),
      }
    })
    .filter((spec) => spec.pages.some((page) => page.items.length > 0))
}

export function headerFooterOverlaySignature(
  specs: readonly HeaderFooterOverlaySpec[]
): string {
  return JSON.stringify(
    specs.map((spec) => [
      spec.sectionId,
      spec.pages.map((page) => [
        page.pageNumber,
        page.width,
        page.height,
        page.contentBounds,
        page.items,
        page.headerItemCount,
        page.footerItemCount,
        page.variant,
      ]),
    ])
  )
}

function bytesToDataUrl(asset: SemanticImageAsset): string {
  let binary = ""
  const chunkSize = 0x8000
  for (let offset = 0; offset < asset.bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...asset.bytes.slice(offset, offset + chunkSize)
    )
  }
  return `data:${asset.mimeType};base64,${btoa(binary)}`
}

function setSvgAttribute(
  element: SVGElement,
  name: string,
  value: string | number | undefined
): void {
  if (value === undefined) return
  element.setAttribute(name, String(value))
}

function appendDisplayListItem(
  parent: SVGGElement,
  item: DisplayListItem,
  imageSources: ReadonlyMap<string, string>
): void {
  if (item.type === "glyph-run") {
    const text = document.createElementNS(SVG_NS, "text")
    setSvgAttribute(text, "x", item.x)
    setSvgAttribute(text, "y", item.baselineY)
    setSvgAttribute(text, "fill", item.color)
    setSvgAttribute(text, "font-family", item.fontFamily ?? "sans-serif")
    setSvgAttribute(text, "font-size", item.fontSize)
    setSvgAttribute(text, "font-weight", item.fontWeight ?? 400)
    setSvgAttribute(text, "font-style", item.fontStyle ?? "normal")
    if (item.width > 0 && !/^[\t \u00a0\u200b]+$/u.test(item.text)) {
      setSvgAttribute(text, "textLength", item.width)
      setSvgAttribute(text, "lengthAdjust", "spacingAndGlyphs")
    }
    text.setAttribute("xml:space", "preserve")
    text.setAttribute("data-color", item.color)
    text.setAttribute("data-source-node", String(item.sourceNodeId))
    text.style.whiteSpace = "pre"
    text.textContent = item.text
    parent.append(text)
    return
  }

  if (item.type === "line") {
    const line = document.createElementNS(SVG_NS, "line")
    setSvgAttribute(line, "x1", item.x1)
    setSvgAttribute(line, "y1", item.y1)
    setSvgAttribute(line, "x2", item.x2)
    setSvgAttribute(line, "y2", item.y2)
    setSvgAttribute(line, "stroke", item.color)
    setSvgAttribute(line, "stroke-width", item.width)
    setSvgAttribute(line, "stroke-dasharray", item.dashArray?.join(" "))
    setSvgAttribute(line, "stroke-dashoffset", item.dashPhase)
    setSvgAttribute(line, "stroke-linecap", item.lineCap)
    line.setAttribute("data-source-node", String(item.sourceNodeId))
    parent.append(line)
    return
  }

  if (item.type === "rectangle") {
    const rectangle = document.createElementNS(SVG_NS, "rect")
    setSvgAttribute(rectangle, "x", item.bounds.x)
    setSvgAttribute(rectangle, "y", item.bounds.y)
    setSvgAttribute(rectangle, "width", item.bounds.width)
    setSvgAttribute(rectangle, "height", item.bounds.height)
    setSvgAttribute(rectangle, "fill", item.fillColor ?? "none")
    setSvgAttribute(rectangle, "stroke", item.strokeColor ?? "none")
    setSvgAttribute(rectangle, "stroke-width", item.strokeWidth ?? 0)
    rectangle.setAttribute("data-source-node", String(item.sourceNodeId))
    parent.append(rectangle)
    return
  }

  const source = imageSources.get(item.assetId)
  if (!source) return
  const image = document.createElementNS(SVG_NS, "image")
  setSvgAttribute(image, "href", source)
  setSvgAttribute(image, "x", item.bounds.x)
  setSvgAttribute(image, "y", item.bounds.y)
  setSvgAttribute(image, "width", item.bounds.width)
  setSvgAttribute(image, "height", item.bounds.height)
  setSvgAttribute(image, "preserveAspectRatio", "none")
  image.setAttribute("data-source-node", String(item.sourceNodeId))
  parent.append(image)
}

function createHeaderFooterOverlayElement(
  spec: HeaderFooterOverlaySpec,
  assets: readonly SemanticImageAsset[]
): HTMLElement {
  const root = document.createElement("span")
  root.className = "apex-header-footer-overlay"
  root.contentEditable = "false"
  root.setAttribute("data-header-footer-overlay", spec.sectionId)

  const width = Math.max(...spec.pages.map((page) => page.width))
  const totalHeight = spec.pages.reduce(
    (height, page, index) =>
      height +
      page.height +
      (index === spec.pages.length - 1 ? 0 : PAGE_GAP_TWIPS),
    0
  )
  const svg = document.createElementNS(SVG_NS, "svg")
  svg.setAttribute("viewBox", `0 0 ${width} ${totalHeight}`)
  svg.setAttribute("width", `${width / 15}px`)
  svg.setAttribute("height", `${totalHeight / 15}px`)
  svg.setAttribute("focusable", "false")
  svg.setAttribute("aria-hidden", "true")

  const imageSources = new Map(
    assets.map((asset) => [asset.id, bytesToDataUrl(asset)] as const)
  )
  const appendEditHit = (
    page: HeaderFooterOverlayPage,
    pageOffsetTwips: number,
    kind: HeaderFooterKind
  ): void => {
    const hit = document.createElement("span")
    const bodyBottom = page.contentBounds.y + page.contentBounds.height
    const topTwips =
      kind === "header" ? pageOffsetTwips : pageOffsetTwips + bodyBottom
    const heightTwips =
      kind === "header" ? page.contentBounds.y : page.height - bodyBottom
    hit.className = `apex-header-footer-overlay__hit apex-header-footer-overlay__hit--${kind}`
    hit.style.left = "0"
    hit.style.top = `${topTwips / 15}px`
    hit.style.width = `${page.width / 15}px`
    hit.style.height = `${Math.max(1, heightTwips / 15)}px`
    hit.tabIndex = 0
    hit.setAttribute("role", "button")
    hit.setAttribute("data-header-footer-kind", kind)
    hit.setAttribute("data-header-footer-variant", page.variant)
    hit.setAttribute("data-page-number", String(page.pageNumber))
    const variantLabel = page.variant === "first" ? "first-page " : ""
    hit.setAttribute("aria-label", `Edit ${variantLabel}${kind}`)
    hit.title = `Double-click to edit ${variantLabel}${kind}`

    const requestEdit = (): void => {
      const ownerWindow = root.ownerDocument.defaultView
      if (!ownerWindow) return
      const detail: HeaderFooterEditRequestDetail = {
        sectionId: spec.sectionId,
        kind,
        variant: page.variant,
        pageNumber: page.pageNumber,
      }
      root.dispatchEvent(
        new ownerWindow.CustomEvent(HEADER_FOOTER_EDIT_REQUEST_EVENT, {
          bubbles: true,
          detail,
        })
      )
    }
    hit.addEventListener("mousedown", (event) => event.stopPropagation())
    hit.addEventListener("dblclick", (event) => {
      event.preventDefault()
      event.stopPropagation()
      requestEdit()
    })
    hit.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return
      event.preventDefault()
      event.stopPropagation()
      requestEdit()
    })
    root.append(hit)
  }
  let pageOffset = 0
  for (const page of spec.pages) {
    const group = document.createElementNS(SVG_NS, "g")
    group.setAttribute("transform", `translate(0 ${pageOffset})`)
    group.setAttribute("data-page-number", String(page.pageNumber))
    for (const item of page.items) {
      appendDisplayListItem(group, item, imageSources)
    }
    svg.append(group)
    if (page.headerItemCount > 0) appendEditHit(page, pageOffset, "header")
    if (page.footerItemCount > 0) appendEditHit(page, pageOffset, "footer")
    pageOffset += page.height + PAGE_GAP_TWIPS
  }
  root.prepend(svg)
  return root
}

function sectionPageCountDecorations(
  doc: import("prosemirror-model").Node,
  sectionPages: readonly SectionPageCount[]
): Decoration[] {
  if (sectionPages.length === 0) return []
  const decos: Decoration[] = []
  let index = 0
  doc.forEach((node, offset) => {
    if (node.type.name !== "section") return
    const id = String(node.attrs.nodeId ?? "")
    const match =
      (id.length > 0
        ? sectionPages.find((section) => section.sectionId === id)
        : undefined) ?? sectionPages[index]
    const pageCount = Math.max(1, match?.pageCount ?? 1)
    decos.push(
      Decoration.node(offset, offset + node.nodeSize, {
        style: "--apex-section-pages:" + String(pageCount),
      })
    )
    index += 1
  })
  return decos
}

/** Build widget decorations from placements (exported for mapping tests). */
export function decorationsFromPlacements(
  doc: import("prosemirror-model").Node,
  placements: readonly PageBreakPlacement[],
  structuralOnly = false,
  headerFooter?: Readonly<{
    specs: readonly HeaderFooterOverlaySpec[]
    assets: readonly SemanticImageAsset[]
    sectionPages?: readonly SectionPageCount[]
  }>
): DecorationSet {
  const decos: Decoration[] = []
  decos.push(
    ...sectionPageCountDecorations(doc, headerFooter?.sectionPages ?? [])
  )
  for (const placement of placements) {
    const pos =
      placement.explicitPosition ??
      positionForParagraphOffset(
        doc,
        String(placement.sourceNodeId),
        placement.charOffset
      )
    if (pos === null) continue
    const rowBoundary = tableRowBoundary(doc, pos)
    const widgetPosition = rowBoundary?.position ?? pos
    decos.push(
      Decoration.widget(
        widgetPosition,
        () => {
          if (structuralOnly || typeof document === "undefined") {
            return {
              nodeType: 1,
              style: {},
              setAttribute: () => undefined,
            } as unknown as HTMLElement
          }
          return rowBoundary
            ? createTableBreakRowElement(placement, rowBoundary.columnCount)
            : createBreakSpacerElement(placement)
        },
        {
          side: -1,
          key: decorationKeyForPlacement(placement),
        }
      )
    )
  }
  for (const spec of headerFooter?.specs ?? []) {
    decos.push(
      Decoration.widget(
        spec.position,
        () => {
          if (structuralOnly || typeof document === "undefined") {
            return {
              nodeType: 1,
              style: {},
              setAttribute: () => undefined,
            } as unknown as HTMLElement
          }
          return createHeaderFooterOverlayElement(
            spec,
            headerFooter?.assets ?? []
          )
        },
        {
          side: -1,
          key: `header-footer:${headerFooterOverlaySignature([spec])}`,
        }
      )
    )
  }
  return DecorationSet.create(doc, decos)
}

function scrollCaretToSurfaceTop(view: EditorView): void {
  const surface = view.dom.closest(".apex-editor-surface")
  if (!(surface instanceof HTMLElement)) return
  try {
    const coords = view.coordsAtPos(view.state.selection.from)
    const surfaceRect = surface.getBoundingClientRect()
    surface.scrollTop = Math.max(
      0,
      surface.scrollTop + (coords.top - surfaceRect.top)
    )
  } catch {
    // coordsAtPos throws when the selection is not in the current view.
  }
}

function paintSectionSheets(
  view: EditorView,
  placements: readonly PageBreakPlacement[],
  sectionPages: readonly SectionPageCount[]
): void {
  // Stable widget keys reuse the existing spacer DOM; paint the new
  // rest-height without tearing the page stack down.
  applySpacerGeometryToDom(view.dom, placements)
  applySectionPageCountsToDom(view.dom, sectionPages)
  if (paginationPluginKey.getState(view.state)?.scrollAfterPagination !== true) {
    return
  }
  scrollCaretToSurfaceTop(view)
  view.dispatch(
    view.state.tr.setMeta(paginationPluginKey, {
      scrollAfterPagination: false,
    })
  )
}

/**
 * Engine-authoritative pagination plugin.
 * - Maps DecorationSet through transactions
 * - rAF-schedules layout round-trips (off main thread via Worker when available)
 * - Signature bail-out avoids flicker
 * - Oversized non-splittable block guard with iteration cap
 */
export function createPaginationPlugin(
  options: PaginationPluginOptions = {}
): Plugin<PaginationPluginState> {
  let scheduled: number | null = null
  let documentRevision = 0
  const maxIterations = options.maxIterations ?? 8
  const ownedClient =
    options.layoutClient ??
    (options.layout
      ? null
      : createLayoutClient({ forceInProcess: options.forceInProcess === true }))
  const layoutClient = options.layoutClient ?? ownedClient

  const runLayout = async (
    view: EditorView
  ): Promise<Readonly<{
    semanticDocument: SemanticDocument
    result: LayoutWorkerSuccess
  }> | null> => {
    const semanticDocument = options.toSemantic
      ? options.toSemantic(view.state)
      : toSemanticDocument(view.state.doc)

    // Prefer async worker path so layout is off the main thread.
    const asyncLayout = layoutClient ? getLayoutAsync(layoutClient) : null
    if (asyncLayout) {
      const result = await asyncLayout(semanticDocument, {
        includeTrace: true,
        maxPages: options.maxPages,
      })
      if (!result) return null
      return { semanticDocument, result }
    }

    if (options.layout) {
      const result = options.layout(semanticDocument, {
        includeTrace: true,
        maxPages: options.maxPages,
      })
      if (!result.trace) return null
      return {
        semanticDocument,
        result: {
          type: "success",
          requestId: "sync",
          displayList: result.displayList,
          trace: result.trace,
          diagnostics: result.diagnostics,
        },
      }
    }

    const result = await layoutInProcess(semanticDocument, {
      includeTrace: true,
      maxPages: options.maxPages,
    })
    if (!result) return null
    return { semanticDocument, result }
  }

  return new Plugin<PaginationPluginState>({
    key: paginationPluginKey,
    state: {
      init: () => EMPTY_STATE,
      apply: (tr, value) => {
        const mapped = value.decorations.map(tr.mapping, tr.doc)
        const valuesEpoch =
          tr.getMeta(TEMPLATE_TAG_VALUES_TR_META) ||
          tr.getMeta(HEADER_FOOTER_CONTENT_TR_META)
            ? value.valuesEpoch + 1
            : value.valuesEpoch
        const meta = tr.getMeta(paginationPluginKey) as
          Partial<PaginationPluginState> | undefined
        const scrollAfterPagination =
          tr.getMeta(PAGE_BREAK_SCROLL_META) === true
            ? true
            : (meta?.scrollAfterPagination ?? value.scrollAfterPagination)
        if (!meta) {
          return {
            ...value,
            decorations: mapped,
            valuesEpoch,
            scrollAfterPagination,
          }
        }
        return {
          decorations: meta.decorations ?? mapped,
          signature: meta.signature ?? value.signature,
          placements: meta.placements ?? value.placements,
          pageCount: meta.pageCount ?? value.pageCount,
          sectionPages: meta.sectionPages ?? value.sectionPages,
          diagnostics: meta.diagnostics ?? value.diagnostics,
          iteration: meta.iteration ?? value.iteration,
          valuesEpoch,
          scrollAfterPagination,
        }
      },
    },
    props: {
      decorations(state) {
        return paginationPluginKey.getState(state)?.decorations
      },
    },
    view(view) {
      const schedule = (): void => {
        if (scheduled !== null) return
        const raf =
          typeof requestAnimationFrame === "function"
            ? requestAnimationFrame
            : (cb: FrameRequestCallback) =>
                setTimeout(() => cb(Date.now()), 0) as unknown as number
        scheduled = raf(() => {
          scheduled = null
          const layoutRevision = documentRevision
          view.dom.dataset.apexPaginationStatus = "pending"
          void (async () => {
            try {
              const layout = await runLayout(view)
              if (layoutRevision !== documentRevision) return
              if (!layout?.result.trace) {
                view.dom.dataset.apexPaginationStatus = "failed"
                return
              }
              const { result, semanticDocument } = layout
              const placements = mergeManualPageBreakPlacements(
                view.state.doc,
                pageBreaksFromTrace(result.trace, result.displayList),
                result.displayList,
                result.trace
              )
              const headerFooterSpecs = headerFooterOverlaySpecs(
                view.state.doc,
                semanticDocument,
                result.displayList,
                result.trace
              )
              const sectionPages = sectionPageCountsFromLayout(
                view.state.doc,
                result.displayList,
                result.trace
              )
              const signature = `${paginationSignature(
                placements,
                result.displayList.pages.length
              )}|header-footer:${headerFooterOverlaySignature(headerFooterSpecs)}|sections:${sectionPages
                .map((section) => `${section.sectionId}:${section.pageCount}`)
                .join(",")}`
              view.dom.dataset.apexPaginationStatus = "ready"
              view.dom.dataset.apexPageCount = String(
                result.displayList.pages.length
              )
              const prev = paginationPluginKey.getState(view.state)
              if (prev && prev.signature === signature) {
                paintSectionSheets(view, placements, sectionPages)
                return
              }

              const guard = detectOversizedNonSplittable(
                result.trace,
                result.displayList,
                {
                  maxIterations,
                  iteration: (prev?.iteration ?? 0) + 1,
                }
              )
              if (guard.shouldAbort) {
                const tr = view.state.tr.setMeta(paginationPluginKey, {
                  decorations: prev?.decorations ?? DecorationSet.empty,
                  signature,
                  placements,
                  pageCount: result.displayList.pages.length,
                  sectionPages,
                  diagnostics: guard.diagnostics.map((d) => d.message),
                  iteration: (prev?.iteration ?? 0) + 1,
                })
                view.dispatch(tr)
                paintSectionSheets(view, placements, sectionPages)
                return
              }

              const decorations = decorationsFromPlacements(
                view.state.doc,
                placements,
                options.structuralOnly === true,
                {
                  specs: headerFooterSpecs,
                  assets: semanticDocument.assets,
                  sectionPages,
                }
              )
              view.dom.dataset.apexPageBreakCount = String(
                decorations.find().length
              )
              const tr = view.state.tr.setMeta(paginationPluginKey, {
                decorations,
                signature,
                placements,
                pageCount: result.displayList.pages.length,
                sectionPages,
                diagnostics: guard.diagnostics.map((d) => d.message),
                iteration: 0,
              })
              view.dispatch(tr)
              paintSectionSheets(view, placements, sectionPages)
            } catch (error) {
              if (layoutRevision !== documentRevision) return
              view.dom.dataset.apexPaginationStatus = "failed"
              console.error(
                "[apex-editor:pagination] layout update failed",
                error
              )
            }
          })()
        })
      }

      schedule()

      return {
        update(view, prevState) {
          const prevEpoch = paginationPluginKey.getState(prevState)?.valuesEpoch
          const nextEpoch = paginationPluginKey.getState(
            view.state
          )?.valuesEpoch
          if (!view.state.doc.eq(prevState.doc) || prevEpoch !== nextEpoch) {
            documentRevision += 1
            schedule()
          }
        },
        destroy() {
          if (
            scheduled !== null &&
            typeof cancelAnimationFrame === "function"
          ) {
            cancelAnimationFrame(scheduled)
          }
          scheduled = null
          layoutClient?.cancel()
          ownedClient?.dispose()
        },
      }
    },
  })
}

/** Apply a follow-up document transform and remap pagination decorations. */
export function mapPaginationThroughTransaction(
  state: PaginationPluginState,
  tr: Transaction,
  doc: import("prosemirror-model").Node
): PaginationPluginState {
  return {
    ...state,
    decorations: state.decorations.map(tr.mapping, doc),
    valuesEpoch:
      tr.getMeta(TEMPLATE_TAG_VALUES_TR_META) ||
      tr.getMeta(HEADER_FOOTER_CONTENT_TR_META)
        ? state.valuesEpoch + 1
        : state.valuesEpoch,
    scrollAfterPagination:
      tr.getMeta(PAGE_BREAK_SCROLL_META) === true
        ? true
        : state.scrollAfterPagination,
  }
}
