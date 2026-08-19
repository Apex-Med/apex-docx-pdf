import { Slider as SliderPrimitive } from "@base-ui/react/slider"

import { cn } from "@workspace/ui/lib/utils"

type SliderProps = SliderPrimitive.Root.Props &
  Readonly<{
    getAriaLabel?: (index: number) => string
    getAriaValueText?: (
      formattedValue: string,
      value: number,
      index: number
    ) => string
    /** Visual density. `lg` enlarges the track and thumb for denser tool surfaces. */
    size?: "default" | "lg"
  }>

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  getAriaLabel,
  getAriaValueText,
  size = "default",
  ...props
}: SliderProps) {
  const _values = Array.isArray(value)
    ? value
    : Array.isArray(defaultValue)
      ? defaultValue
      : [min, max]
  const large = size === "lg"

  return (
    <SliderPrimitive.Root
      className={cn("data-horizontal:w-full data-vertical:h-full", className)}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control
        className={cn(
          "relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col",
          large
            ? "data-horizontal:min-h-8 data-vertical:min-w-8"
            : "data-horizontal:min-h-5"
        )}
      >
        <SliderPrimitive.Track
          data-slot="slider-track"
          className={cn(
            "relative grow overflow-hidden rounded-full bg-muted select-none data-horizontal:w-full data-vertical:h-full",
            large
              ? "data-horizontal:h-2 data-vertical:w-2"
              : "data-horizontal:h-1 data-vertical:w-1"
          )}
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="bg-primary select-none data-horizontal:h-full data-vertical:w-full"
          />
        </SliderPrimitive.Track>
        {Array.from({ length: _values.length }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            index={index}
            getAriaLabel={getAriaLabel}
            getAriaValueText={getAriaValueText}
            className={cn(
              "relative block shrink-0 rounded-full border border-ring bg-white ring-ring/50 transition-[color,box-shadow] select-none hover:ring-3 focus-visible:ring-3 focus-visible:outline-hidden active:ring-3 disabled:pointer-events-none disabled:opacity-50",
              large
                ? "size-4 after:absolute after:-inset-3"
                : "size-3 after:absolute after:-inset-2"
            )}
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
