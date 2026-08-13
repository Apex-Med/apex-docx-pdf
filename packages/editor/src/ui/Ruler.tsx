import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react"

import { TWIPS_PER_INCH } from "./chrome-types"

const RULER_HEIGHT_PX = 22
const PIXELS_PER_INCH = 96
const TAB_ADD_GUTTER_PX = 28

export type TabStop = Readonly<{
  position: number
  alignment: "left"
}>

export type RulerProps = Readonly<{
  pageWidthTwips: number
  marginLeftTwips: number
  marginRightTwips: number
  indentStartTwips: number
  firstLineIndentTwips: number
  tabStops: readonly TabStop[]
  zoom: number
  /** Scroll/zoom container that holds `section[data-section]` page sheets. */
  pageHostRef?: RefObject<HTMLElement | null>
  onMarginsChange: (options: {
    marginLeft?: number
    marginRight?: number
  }) => void
  onIndentsChange: (options: {
    indentStart?: number
    firstLineIndent?: number
  }) => void
  onTabStopsChange: (tabStops: readonly TabStop[]) => void
}>

type DragKind =
  "margin-left" | "margin-right" | "indent-start" | "first-line" | "tab-stop"

type DragState = Readonly<{
  kind: DragKind
  tabIndex?: number
  startClientX: number
  startTwips: number
}>

function twipsToPx(
  twips: number,
  pageWidthTwips: number,
  trackWidthPx: number
): number {
  if (pageWidthTwips <= 0) return 0
  return (twips / pageWidthTwips) * trackWidthPx
}

function pxToTwips(
  px: number,
  pageWidthTwips: number,
  trackWidthPx: number
): number {
  if (trackWidthPx <= 0) return 0
  const ratio = px / trackWidthPx
  return Math.max(
    0,
    Math.min(pageWidthTwips, Math.round(ratio * pageWidthTwips))
  )
}

function snapTwips(value: number, step = 90): number {
  return Math.round(value / step) * step
}

/** Map a page sheet's viewport box onto the ruler strip. */
export function alignmentFromRects(
  page: Pick<DOMRect, "left" | "width">,
  wrap: Pick<DOMRect, "left">,
  unscaledTrackWidth: number
): { left: number; width: number; scale: number } {
  const width = Math.max(0, page.width)
  return {
    left: page.left - wrap.left,
    width,
    scale: unscaledTrackWidth > 0 ? width / unscaledTrackWidth : 1,
  }
}

export function Ruler({
  pageWidthTwips,
  marginLeftTwips,
  marginRightTwips,
  indentStartTwips,
  firstLineIndentTwips,
  tabStops,
  zoom,
  pageHostRef,
  onMarginsChange,
  onIndentsChange,
  onTabStopsChange,
}: RulerProps): ReactNode {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const rulerRef = useRef<HTMLDivElement | null>(null)
  const addBtnRef = useRef<HTMLButtonElement | null>(null)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<DragState | null>(null)

  const pageWidthInches = pageWidthTwips / TWIPS_PER_INCH
  const trackWidthPx = pageWidthInches * PIXELS_PER_INCH
  const scale = zoom / 100
  const scaleRef = useRef(scale)
  scaleRef.current = scale

  const tickMarks = useMemo(() => {
    const inches = Math.ceil(pageWidthInches)
    return Array.from({ length: inches + 1 }, (_, inch) => inch)
  }, [pageWidthInches])

  const contentRightTwips = pageWidthTwips - marginRightTwips
  const firstLineTwips = indentStartTwips + firstLineIndentTwips

  useLayoutEffect(() => {
    const wrap = wrapRef.current
    const host = pageHostRef?.current ?? null
    if (!wrap) return

    const observed = new Set<Element>()
    let ro: ResizeObserver
    const observe = (el: Element | null | undefined) => {
      if (!el || observed.has(el)) return
      observed.add(el)
      ro.observe(el)
    }

    const applyFallback = () => {
      const ruler = rulerRef.current
      const track = trackRef.current
      scaleRef.current = scale
      if (ruler) {
        ruler.style.marginLeft = ""
        ruler.style.width = `${trackWidthPx * scale}px`
        ruler.style.visibility = "hidden"
      }
      if (track) {
        track.style.transform = `scale(${scale})`
        track.style.transformOrigin = "top left"
      }
      if (addBtnRef.current) {
        addBtnRef.current.style.left = "4px"
        addBtnRef.current.style.visibility = "hidden"
      }
    }

    const sync = () => {
      const ruler = rulerRef.current
      const track = trackRef.current
      const page = host?.querySelector<HTMLElement>("section[data-section]")
      if (!ruler || !host || !page) {
        applyFallback()
        return
      }
      observe(page)
      observe(host.querySelector(".apex-editor-surface"))
      const align = alignmentFromRects(
        page.getBoundingClientRect(),
        wrap.getBoundingClientRect(),
        trackWidthPx
      )
      scaleRef.current = align.scale
      ruler.style.visibility = "visible"
      ruler.style.marginLeft = `${align.left}px`
      ruler.style.width = `${align.width}px`
      if (track) {
        track.style.transform = `scale(${align.scale})`
        track.style.transformOrigin = "top left"
      }
      if (addBtnRef.current) {
        addBtnRef.current.style.visibility = "visible"
        addBtnRef.current.style.left = `${Math.max(4, align.left - TAB_ADD_GUTTER_PX)}px`
      }
    }

    ro = new ResizeObserver(sync)
    observe(wrap)
    observe(host)
    sync()
    host?.addEventListener("scroll", sync, true)
    window.addEventListener("resize", sync)
    const mo = host ? new MutationObserver(sync) : null
    // Direct children only — subtree would resync on every typed character.
    if (host && mo) {
      mo.observe(host, { childList: true })
      const surface = host.querySelector(".apex-editor-surface")
      if (surface) mo.observe(surface, { childList: true })
    }
    return () => {
      ro.disconnect()
      mo?.disconnect()
      host?.removeEventListener("scroll", sync, true)
      window.removeEventListener("resize", sync)
    }
  }, [pageHostRef, scale, trackWidthPx])

  const onPointerMoveRef = useRef<(event: PointerEvent) => void>(
    () => undefined
  )
  const onPointerUpRef = useRef<() => void>(() => undefined)

  onPointerMoveRef.current = (event: PointerEvent) => {
    const drag = dragRef.current
    const track = trackRef.current
    if (!drag || !track) return
    const deltaPx = (event.clientX - drag.startClientX) / scaleRef.current
    const deltaTwips = pxToTwips(deltaPx, pageWidthTwips, trackWidthPx)
    const nextTwips = snapTwips(drag.startTwips + deltaTwips)

    switch (drag.kind) {
      case "margin-left": {
        const max = Math.max(0, contentRightTwips - 720)
        onMarginsChange({
          marginLeft: Math.max(0, Math.min(max, nextTwips)),
        })
        break
      }
      case "margin-right": {
        const marginRight = Math.max(
          0,
          Math.min(
            pageWidthTwips - marginLeftTwips - 720,
            pageWidthTwips - nextTwips
          )
        )
        onMarginsChange({ marginRight })
        break
      }
      case "indent-start": {
        const max = contentRightTwips - marginLeftTwips
        onIndentsChange({
          indentStart: Math.max(0, Math.min(max, nextTwips - marginLeftTwips)),
        })
        break
      }
      case "first-line": {
        const base = marginLeftTwips + indentStartTwips
        onIndentsChange({
          firstLineIndent: nextTwips - base,
        })
        break
      }
      case "tab-stop": {
        if (drag.tabIndex === undefined) break
        const min = marginLeftTwips
        const max = contentRightTwips
        const position = Math.max(min, Math.min(max, nextTwips))
        const next = tabStops.map((stop, index) =>
          index === drag.tabIndex ? { ...stop, position } : stop
        )
        onTabStopsChange(next)
        break
      }
      default:
        break
    }
  }

  onPointerUpRef.current = () => {
    dragRef.current = null
    window.removeEventListener("pointermove", handlePointerMove)
    window.removeEventListener("pointerup", handlePointerUp)
  }

  const handlePointerMove = useCallback((event: PointerEvent) => {
    onPointerMoveRef.current(event)
  }, [])

  const handlePointerUp = useCallback(() => {
    onPointerUpRef.current()
  }, [])

  const startDrag = useCallback(
    (
      event: ReactPointerEvent<HTMLElement>,
      kind: DragKind,
      startTwips: number,
      tabIndex?: number
    ) => {
      event.preventDefault()
      event.stopPropagation()
      dragRef.current = {
        kind,
        tabIndex,
        startClientX: event.clientX,
        startTwips,
      }
      window.addEventListener("pointermove", handlePointerMove)
      window.addEventListener("pointerup", handlePointerUp)
    },
    [handlePointerMove, handlePointerUp]
  )

  const handleTrackClick = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (dragRef.current) return
      const track = trackRef.current
      if (!track) return
      const rect = track.getBoundingClientRect()
      const x = (event.clientX - rect.left) / scaleRef.current
      const twips = snapTwips(pxToTwips(x, pageWidthTwips, trackWidthPx))
      if (twips < marginLeftTwips || twips > contentRightTwips) return
      onTabStopsChange([...tabStops, { position: twips, alignment: "left" }])
    },
    [
      contentRightTwips,
      marginLeftTwips,
      onTabStopsChange,
      pageWidthTwips,
      tabStops,
      trackWidthPx,
    ]
  )

  const handleTabStopDoubleClick = useCallback(
    (index: number) => {
      onTabStopsChange(tabStops.filter((_, i) => i !== index))
    },
    [onTabStopsChange, tabStops]
  )

  const keyboardValue = (
    event: ReactKeyboardEvent<HTMLElement>,
    current: number,
    min: number,
    max: number
  ): number | null => {
    const step = event.shiftKey ? 360 : 90
    if (event.key === "ArrowLeft") return Math.max(min, current - step)
    if (event.key === "ArrowRight") return Math.min(max, current + step)
    if (event.key === "Home") return min
    if (event.key === "End") return max
    return null
  }

  return (
    <div
      ref={wrapRef}
      className="apex-editor-ruler-wrap relative overflow-hidden border-b border-(--apex-chrome-border) bg-(--apex-chrome-bg) py-1"
    >
      <button
        ref={addBtnRef}
        type="button"
        className="apex-editor-ruler__tab-add absolute top-1/2 z-10 size-6 -translate-y-1/2 rounded-sm border border-(--apex-chrome-border) text-xs text-(--apex-chrome-muted) hover:bg-(--apex-chrome-hover)"
        style={{ left: 4, visibility: "hidden" }}
        aria-label="Add a tab stop at the midpoint"
        onClick={() => {
          const midpoint = snapTwips(
            marginLeftTwips + (contentRightTwips - marginLeftTwips) / 2
          )
          onTabStopsChange([
            ...tabStops,
            { position: midpoint, alignment: "left" },
          ])
        }}
      >
        +
      </button>
      <div
        ref={rulerRef}
        className="apex-editor-ruler"
        style={{
          width: trackWidthPx * scale,
          height: RULER_HEIGHT_PX,
          visibility: "hidden",
        }}
      >
        <div
          ref={trackRef}
          className="apex-editor-ruler__track"
          style={{
            width: trackWidthPx,
            height: RULER_HEIGHT_PX,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
          onClick={handleTrackClick}
          onKeyDown={(event) => {
            // Keyboard users use the adjacent Add tab stop button. Keep this
            // handler scoped to the track so child slider keys never add tabs.
            if (event.target !== event.currentTarget) return
            if (event.key !== "Enter" && event.key !== " ") return
            event.preventDefault()
          }}
          role="toolbar"
          aria-label="Page ruler"
        >
          <div
            className="apex-editor-ruler__margin apex-editor-ruler__margin--left"
            style={{
              width: twipsToPx(marginLeftTwips, pageWidthTwips, trackWidthPx),
            }}
          />
          <div
            className="apex-editor-ruler__margin apex-editor-ruler__margin--right"
            style={{
              left: twipsToPx(contentRightTwips, pageWidthTwips, trackWidthPx),
              width: twipsToPx(marginRightTwips, pageWidthTwips, trackWidthPx),
            }}
          />

          <div className="apex-editor-ruler__ticks" aria-hidden>
            {tickMarks.map((inch) => (
              <span
                key={inch}
                className="apex-editor-ruler__tick"
                style={{ left: inch * PIXELS_PER_INCH }}
              >
                {inch > 0 ? inch : null}
              </span>
            ))}
          </div>

          <button
            type="button"
            className="apex-editor-ruler__handle apex-editor-ruler__handle--margin-left"
            style={{
              left: twipsToPx(marginLeftTwips, pageWidthTwips, trackWidthPx),
            }}
            aria-label="Left margin"
            role="slider"
            aria-valuemin={0}
            aria-valuemax={Math.max(0, contentRightTwips - 720)}
            aria-valuenow={marginLeftTwips}
            onPointerDown={(event) =>
              startDrag(event, "margin-left", marginLeftTwips)
            }
            onKeyDown={(event) => {
              const next = keyboardValue(
                event,
                marginLeftTwips,
                0,
                Math.max(0, contentRightTwips - 720)
              )
              if (next === null) return
              event.preventDefault()
              onMarginsChange({ marginLeft: next })
            }}
          />
          <button
            type="button"
            className="apex-editor-ruler__handle apex-editor-ruler__handle--margin-right"
            style={{
              left: twipsToPx(contentRightTwips, pageWidthTwips, trackWidthPx),
            }}
            aria-label="Right margin"
            role="slider"
            aria-valuemin={marginLeftTwips + 720}
            aria-valuemax={pageWidthTwips}
            aria-valuenow={contentRightTwips}
            onPointerDown={(event) =>
              startDrag(event, "margin-right", contentRightTwips)
            }
            onKeyDown={(event) => {
              const next = keyboardValue(
                event,
                contentRightTwips,
                marginLeftTwips + 720,
                pageWidthTwips
              )
              if (next === null) return
              event.preventDefault()
              onMarginsChange({ marginRight: pageWidthTwips - next })
            }}
          />

          <button
            type="button"
            className="apex-editor-ruler__marker apex-editor-ruler__marker--indent"
            style={{
              left: twipsToPx(
                marginLeftTwips + indentStartTwips,
                pageWidthTwips,
                trackWidthPx
              ),
            }}
            aria-label="Left indent"
            onPointerDown={(event) =>
              startDrag(
                event,
                "indent-start",
                marginLeftTwips + indentStartTwips
              )
            }
            onKeyDown={(event) => {
              const current = marginLeftTwips + indentStartTwips
              const next = keyboardValue(
                event,
                current,
                marginLeftTwips,
                contentRightTwips
              )
              if (next === null) return
              event.preventDefault()
              onIndentsChange({ indentStart: next - marginLeftTwips })
            }}
          />
          <button
            type="button"
            className="apex-editor-ruler__marker apex-editor-ruler__marker--first-line"
            style={{
              left: twipsToPx(
                marginLeftTwips + firstLineTwips,
                pageWidthTwips,
                trackWidthPx
              ),
            }}
            aria-label="First line indent"
            onPointerDown={(event) =>
              startDrag(event, "first-line", marginLeftTwips + firstLineTwips)
            }
            onKeyDown={(event) => {
              const base = marginLeftTwips + indentStartTwips
              const next = keyboardValue(
                event,
                base + firstLineIndentTwips,
                marginLeftTwips,
                contentRightTwips
              )
              if (next === null) return
              event.preventDefault()
              onIndentsChange({ firstLineIndent: next - base })
            }}
          />

          {tabStops.map((stop, index) => (
            <button
              key={`${stop.position}-${stop.alignment}`}
              type="button"
              className="apex-editor-ruler__tab-stop"
              style={{
                left: twipsToPx(stop.position, pageWidthTwips, trackWidthPx),
              }}
              aria-label={`Tab stop at ${(stop.position / TWIPS_PER_INCH).toFixed(2)} inches`}
              onPointerDown={(event) =>
                startDrag(event, "tab-stop", stop.position, index)
              }
              onDoubleClick={() => handleTabStopDoubleClick(index)}
              onKeyDown={(event) => {
                if (event.key === "Delete" || event.key === "Backspace") {
                  event.preventDefault()
                  handleTabStopDoubleClick(index)
                  return
                }
                const next = keyboardValue(
                  event,
                  stop.position,
                  marginLeftTwips,
                  contentRightTwips
                )
                if (next === null) return
                event.preventDefault()
                onTabStopsChange(
                  tabStops.map((entry, entryIndex) =>
                    entryIndex === index ? { ...entry, position: next } : entry
                  )
                )
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
