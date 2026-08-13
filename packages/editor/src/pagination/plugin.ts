import type { SemanticDocument } from "@apexmed/core"
import {
  Plugin,
  PluginKey,
  type EditorState,
  type Transaction,
} from "prosemirror-state"
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view"

import { toSemanticDocument } from "../model/bridge"
import {
  createBreakSpacerElement,
  createTableBreakRowElement,
  detectOversizedNonSplittable,
  mergeManualPageBreakPlacements,
  pageBreaksFromTrace,
  paginationSignature,
  positionForParagraphOffset,
  type PageBreakPlacement,
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
  diagnostics: readonly string[]
  iteration: number
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
  diagnostics: [],
  iteration: 0,
}

/** Build widget decorations from placements (exported for mapping tests). */
export function decorationsFromPlacements(
  doc: import("prosemirror-model").Node,
  placements: readonly PageBreakPlacement[],
  structuralOnly = false
): DecorationSet {
  const decos: Decoration[] = []
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
          key: placement.key,
        }
      )
    )
  }
  return DecorationSet.create(doc, decos)
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
  ): Promise<LayoutWorkerSuccess | null> => {
    const document = options.toSemantic
      ? options.toSemantic(view.state)
      : toSemanticDocument(view.state.doc)

    // Prefer async worker path so layout is off the main thread.
    const asyncLayout = layoutClient ? getLayoutAsync(layoutClient) : null
    if (asyncLayout) {
      return asyncLayout(document, {
        includeTrace: true,
        maxPages: options.maxPages,
      })
    }

    if (options.layout) {
      const result = options.layout(document, {
        includeTrace: true,
        maxPages: options.maxPages,
      })
      if (!result.trace) return null
      return {
        type: "success",
        requestId: "sync",
        displayList: result.displayList,
        trace: result.trace,
        diagnostics: result.diagnostics,
      }
    }

    return layoutInProcess(document, {
      includeTrace: true,
      maxPages: options.maxPages,
    })
  }

  return new Plugin<PaginationPluginState>({
    key: paginationPluginKey,
    state: {
      init: () => EMPTY_STATE,
      apply: (tr, value) => {
        const mapped = value.decorations.map(tr.mapping, tr.doc)
        const meta = tr.getMeta(paginationPluginKey) as
          Partial<PaginationPluginState> | undefined
        if (!meta) {
          return { ...value, decorations: mapped }
        }
        return {
          decorations: meta.decorations ?? mapped,
          signature: meta.signature ?? value.signature,
          placements: meta.placements ?? value.placements,
          pageCount: meta.pageCount ?? value.pageCount,
          diagnostics: meta.diagnostics ?? value.diagnostics,
          iteration: meta.iteration ?? value.iteration,
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
              const result = await runLayout(view)
              if (layoutRevision !== documentRevision) return
              if (!result?.trace) {
                view.dom.dataset.apexPaginationStatus = "failed"
                return
              }
              const placements = mergeManualPageBreakPlacements(
                view.state.doc,
                pageBreaksFromTrace(result.trace, result.displayList),
                result.displayList,
                result.trace
              )
              const signature = paginationSignature(
                placements,
                result.displayList.pages.length
              )
              view.dom.dataset.apexPaginationStatus = "ready"
              view.dom.dataset.apexPageCount = String(
                result.displayList.pages.length
              )
              const prev = paginationPluginKey.getState(view.state)
              if (prev && prev.signature === signature) return

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
                  diagnostics: guard.diagnostics.map((d) => d.message),
                  iteration: (prev?.iteration ?? 0) + 1,
                })
                view.dispatch(tr)
                return
              }

              const decorations = decorationsFromPlacements(
                view.state.doc,
                placements,
                options.structuralOnly === true
              )
              view.dom.dataset.apexPageBreakCount = String(
                decorations.find().length
              )
              const tr = view.state.tr.setMeta(paginationPluginKey, {
                decorations,
                signature,
                placements,
                pageCount: result.displayList.pages.length,
                diagnostics: guard.diagnostics.map((d) => d.message),
                iteration: 0,
              })
              view.dispatch(tr)
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
          if (!view.state.doc.eq(prevState.doc)) {
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
  }
}
