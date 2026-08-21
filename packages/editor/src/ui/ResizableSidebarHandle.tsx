import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react"

type ResizableSidebarHandleProps = Readonly<{
  label: string
  width: number
  minWidth: number
  maxWidth: number
  defaultWidth: number
  onWidthChange: (width: number) => void
}>

type DragState = {
  pointerId: number
  startX: number
  startWidth: number
  currentWidth: number
  target: HTMLHRElement
  sidebar: HTMLElement
  body: HTMLElement
  previousCursor: string
  previousUserSelect: string
}

function clampWidth(width: number, minWidth: number, maxWidth: number): number {
  return Math.round(Math.min(maxWidth, Math.max(minWidth, width)))
}

export function ResizableSidebarHandle({
  label,
  width,
  minWidth,
  maxWidth,
  defaultWidth,
  onWidthChange,
}: ResizableSidebarHandleProps): ReactNode {
  const dragRef = useRef<DragState | null>(null)
  const [liveWidth, setLiveWidth] = useState(width)

  useEffect(() => setLiveWidth(width), [width])

  const finishDrag = useCallback((): void => {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    drag.body.style.cursor = drag.previousCursor
    drag.body.style.userSelect = drag.previousUserSelect
    if (drag.target.hasPointerCapture(drag.pointerId)) {
      drag.target.releasePointerCapture(drag.pointerId)
    }
    onWidthChange(drag.currentWidth)
  }, [onWidthChange])

  useEffect(
    () => () => {
      const drag = dragRef.current
      if (!drag) return
      dragRef.current = null
      drag.body.style.cursor = drag.previousCursor
      drag.body.style.userSelect = drag.previousUserSelect
      if (drag.target.hasPointerCapture(drag.pointerId)) {
        drag.target.releasePointerCapture(drag.pointerId)
      }
    },
    []
  )

  const applyWidth = (
    target: HTMLHRElement,
    nextWidth: number,
    persist: boolean
  ): void => {
    const clamped = clampWidth(nextWidth, minWidth, maxWidth)
    const sidebar = target.parentElement
    if (sidebar) sidebar.style.width = `${clamped}px`
    setLiveWidth(clamped)
    if (persist) onWidthChange(clamped)
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLHRElement>): void => {
    const step = event.shiftKey ? 32 : 8
    let nextWidth: number | null = null
    if (event.key === "ArrowLeft") nextWidth = liveWidth + step
    if (event.key === "ArrowRight") nextWidth = liveWidth - step
    if (event.key === "Home") nextWidth = minWidth
    if (event.key === "End") nextWidth = maxWidth
    if (nextWidth === null) return
    event.preventDefault()
    applyWidth(event.currentTarget, nextWidth, true)
  }

  return (
    <hr
      className="apex-sidebar-resize-handle"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      aria-valuenow={Math.round(liveWidth)}
      aria-valuetext={`${Math.round(liveWidth)} pixels`}
      tabIndex={0}
      title="Drag to resize. Use Left and Right arrow keys. Double-click to reset."
      onDoubleClick={(event) =>
        applyWidth(event.currentTarget, defaultWidth, true)
      }
      onKeyDown={handleKeyDown}
      onPointerDown={(event: ReactPointerEvent<HTMLHRElement>) => {
        if (event.button !== 0) return
        event.preventDefault()
        finishDrag()
        const body = event.currentTarget.ownerDocument.body
        const sidebar = event.currentTarget.parentElement
        if (!sidebar) return
        dragRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startWidth: liveWidth,
          currentWidth: liveWidth,
          target: event.currentTarget,
          sidebar,
          body,
          previousCursor: body.style.cursor,
          previousUserSelect: body.style.userSelect,
        }
        body.style.cursor = "ew-resize"
        body.style.userSelect = "none"
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event: ReactPointerEvent<HTMLHRElement>) => {
        const drag = dragRef.current
        if (!drag || drag.pointerId !== event.pointerId) return
        const nextWidth = clampWidth(
          drag.startWidth + drag.startX - event.clientX,
          minWidth,
          maxWidth
        )
        drag.currentWidth = nextWidth
        drag.sidebar.style.width = `${nextWidth}px`
        setLiveWidth(nextWidth)
      }}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
    />
  )
}
