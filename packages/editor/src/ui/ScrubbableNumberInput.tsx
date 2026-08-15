import {
  forwardRef,
  useRef,
  type ComponentProps,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

type NumberScrubOptions = Readonly<{
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  pixelsPerStep?: number
}>

function roundToStep(value: number, step: number): number {
  const decimals = String(step).split(".")[1]?.length ?? 0
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function useNumberScrub<T extends HTMLElement>({
  value,
  onChange,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
  step = 1,
  pixelsPerStep = 3,
}: NumberScrubOptions) {
  const dragRef = useRef<{
    pointerId: number
    startY: number
    startValue: number
    moved: boolean
  } | null>(null)
  const suppressClickRef = useRef(false)

  const onPointerDown = (event: PointerEvent<T>) => {
    if (event.button !== 0) return
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startValue: value,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: PointerEvent<T>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if ((event.buttons & 1) !== 1) {
      dragRef.current = null
      return
    }
    const deltaY = drag.startY - event.clientY
    if (!drag.moved && Math.abs(deltaY) < 3) return
    drag.moved = true
    event.preventDefault()
    const steps = Math.round(deltaY / pixelsPerStep)
    const next = Math.min(
      max,
      Math.max(min, roundToStep(drag.startValue + steps * step, step))
    )
    onChange(next)
  }

  const onPointerUp = (event: PointerEvent<T>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    suppressClickRef.current = drag.moved
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    event.currentTarget.ownerDocument.defaultView?.setTimeout(() => {
      suppressClickRef.current = false
    }, 0)
  }

  const onPointerCancel = () => {
    dragRef.current = null
    suppressClickRef.current = false
  }

  const onLostPointerCapture = () => {
    dragRef.current = null
  }

  const suppressScrubClick = (event: MouseEvent<T>): boolean => {
    if (!suppressClickRef.current) return false
    event.preventDefault()
    event.stopPropagation()
    return true
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onLostPointerCapture,
    suppressScrubClick,
  }
}

export type ScrubbableNumberInputProps = Omit<
  ComponentProps<typeof Input>,
  "onChange"
> &
  Readonly<{
    value: string | number
    onValueChange: (value: string) => void
    scrubValue?: number
    scrubMin?: number
    scrubMax?: number
    scrubStep?: number
    scrubPixelsPerStep?: number
  }>

export const ScrubbableNumberInput = forwardRef<
  HTMLInputElement,
  ScrubbableNumberInputProps
>(function ScrubbableNumberInput(
  {
    value,
    onValueChange,
    scrubValue,
    scrubMin,
    scrubMax,
    scrubStep = 1,
    scrubPixelsPerStep,
    className = "",
    title = "Click to type, or drag vertically to adjust",
    type = "number",
    onPointerDown: onPointerDownProp,
    onPointerMove: onPointerMoveProp,
    onPointerUp: onPointerUpProp,
    onPointerCancel: onPointerCancelProp,
    onLostPointerCapture: onLostPointerCaptureProp,
    onClick: onClickProp,
    ...props
  },
  ref
) {
  const numericValue =
    scrubValue ?? (Number.isFinite(Number(value)) ? Number(value) : 0)
  const scrub = useNumberScrub<HTMLInputElement>({
    value: numericValue,
    onChange: (next) => onValueChange(String(next)),
    min: scrubMin,
    max: scrubMax,
    step: scrubStep,
    pixelsPerStep: scrubPixelsPerStep,
  })

  return (
    <Input
      {...props}
      ref={ref}
      type={type}
      value={value}
      title={title}
      className={`cursor-ns-resize touch-pan-x tabular-nums ${className}`}
      onChange={(event) => onValueChange(event.target.value)}
      onPointerDown={(event) => {
        onPointerDownProp?.(event)
        if (!event.defaultPrevented) scrub.onPointerDown(event)
      }}
      onPointerMove={(event) => {
        onPointerMoveProp?.(event)
        if (!event.defaultPrevented) scrub.onPointerMove(event)
      }}
      onPointerUp={(event) => {
        onPointerUpProp?.(event)
        if (!event.defaultPrevented) scrub.onPointerUp(event)
      }}
      onPointerCancel={(event) => {
        onPointerCancelProp?.(event)
        scrub.onPointerCancel()
      }}
      onLostPointerCapture={(event) => {
        onLostPointerCaptureProp?.(event)
        scrub.onLostPointerCapture()
      }}
      onClick={(event) => {
        if (scrub.suppressScrubClick(event)) return
        onClickProp?.(event)
      }}
    />
  )
})

export function ScrubbableNumberLabel({
  htmlFor,
  value,
  onChange,
  min,
  max,
  step,
  children,
  className = "",
}: NumberScrubOptions & {
  htmlFor: string
  children: ReactNode
  className?: string
}) {
  const scrub = useNumberScrub<HTMLLabelElement>({
    value,
    onChange,
    min,
    max,
    step,
  })

  return (
    <Label
      htmlFor={htmlFor}
      className={`-mx-1 w-fit cursor-ns-resize rounded-sm px-1 hover:bg-(--apex-chrome-hover) ${className}`}
      title="Click to type, or drag vertically to adjust"
      onPointerDown={scrub.onPointerDown}
      onPointerMove={scrub.onPointerMove}
      onPointerUp={scrub.onPointerUp}
      onPointerCancel={scrub.onPointerCancel}
      onLostPointerCapture={scrub.onLostPointerCapture}
      onClick={(event) => {
        scrub.suppressScrubClick(event)
      }}
    >
      {children}
    </Label>
  )
}

export function ScrubbableNumberDisclosure({
  value,
  onChange,
  onActivate,
  expanded,
  controls,
  label,
  children,
}: NumberScrubOptions & {
  onActivate: () => void
  expanded: boolean
  controls: string
  label: string
  children: ReactNode
}) {
  const scrub = useNumberScrub<HTMLButtonElement>({
    value,
    onChange,
    min: 0,
    step: 10,
  })

  return (
    <Button
      type="button"
      variant={expanded ? "secondary" : "ghost"}
      size="icon-sm"
      className="shrink-0 cursor-ns-resize touch-pan-x"
      aria-label={`${expanded ? "Hide" : "Show"} individual cell padding controls`}
      aria-expanded={expanded}
      aria-controls={controls}
      title={`Click to ${expanded ? "hide" : "show"} individual sides. Drag vertically to adjust ${label.toLowerCase()} padding.`}
      onPointerDown={scrub.onPointerDown}
      onPointerMove={scrub.onPointerMove}
      onPointerUp={scrub.onPointerUp}
      onPointerCancel={scrub.onPointerCancel}
      onLostPointerCapture={scrub.onLostPointerCapture}
      onClick={(event) => {
        if (!scrub.suppressScrubClick(event)) onActivate()
      }}
    >
      {children}
    </Button>
  )
}
