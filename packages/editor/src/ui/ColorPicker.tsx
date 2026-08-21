import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react"

import type { CustomPalette } from "../fonts"
import {
  hexToHsv,
  hsvToHex,
  normalizeHexColor,
  type HsvColor,
} from "./color-utils"

const TAILWIND_SHADE_LABELS = [
  "50",
  "100",
  "200",
  "300",
  "400",
  "500",
  "600",
  "700",
  "800",
  "900",
  "950",
] as const

export type ColorPickerProps = Readonly<{
  value: string
  palettes: Readonly<Record<string, readonly string[]>>
  customPalettes?: readonly CustomPalette[]
  onCustomPalettesChange?: (palettes: CustomPalette[]) => void
  onPick: (color: string) => void
}>

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function shadeLabel(index: number, total: number): string {
  if (total === TAILWIND_SHADE_LABELS.length) {
    return TAILWIND_SHADE_LABELS[index] ?? String(index + 1)
  }
  return String(index + 1)
}

function SwatchButton({
  color,
  label,
  selected,
  onPick,
}: {
  color: string
  label: string
  selected: boolean
  onPick: (color: string) => void
}): ReactNode {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={selected}
      data-selected={selected ? "true" : undefined}
      className="size-6 rounded-sm border border-black/10 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)] transition-transform outline-none hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 motion-reduce:transition-none dark:border-white/15"
      style={{
        background: color,
        ...(selected
          ? {
              boxShadow:
                "inset 0 0 0 2px var(--popover), 0 0 0 2px var(--foreground)",
            }
          : {}),
      }}
      onClick={() => onPick(color)}
    />
  )
}

function TailwindSwatches({
  palettes,
  selectedColor,
  onPick,
}: {
  palettes: Readonly<Record<string, readonly string[]>>
  selectedColor: string
  onPick: (color: string) => void
}): ReactNode {
  const groups = Object.entries(palettes)
  const shadeCount = Math.max(1, ...groups.map(([, colors]) => colors.length))
  const gridStyle = {
    gridTemplateColumns: `3.5rem repeat(${shadeCount}, 1.5rem)`,
  } as CSSProperties

  return (
    <div
      className="overflow-auto overscroll-contain rounded-md border border-border p-2"
      style={{ maxHeight: "min(21rem, calc(100vh - 11rem))" }}
    >
      <div className="grid w-max items-center gap-1" style={gridStyle}>
        <span aria-hidden="true" />
        {Array.from({ length: shadeCount }, (_, index) =>
          shadeLabel(index, shadeCount)
        ).map((shade) => (
          <span
            key={shade}
            className="text-center text-[9px] font-medium text-muted-foreground tabular-nums"
          >
            {shade}
          </span>
        ))}
        {groups.map(([name, colors]) => (
          <Fragment key={name}>
            <span className="truncate pr-1 text-[10px] font-medium text-muted-foreground capitalize">
              {name}
            </span>
            {Array.from({ length: shadeCount }, (_, index) => {
              const color = colors[index]
              return color ? (
                <SwatchButton
                  key={`${name}-${color}`}
                  color={color}
                  label={`${name} ${shadeLabel(index, colors.length)} (${color})`}
                  selected={selectedColor === normalizeHexColor(color)}
                  onPick={onPick}
                />
              ) : (
                <span
                  key={`${name}-empty-${shadeLabel(index, shadeCount)}`}
                  aria-hidden="true"
                />
              )
            })}
          </Fragment>
        ))}
      </div>
    </div>
  )
}

function ColorWheel({
  color,
  onChange,
}: {
  color: HsvColor
  onChange: (color: HsvColor) => void
}): ReactNode {
  const pointerIdRef = useRef<number | null>(null)
  const radians = (color.h * Math.PI) / 180
  const left = 50 + Math.cos(radians) * color.s * 50
  const top = 50 + Math.sin(radians) * color.s * 50

  const updateFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const radius = Math.min(bounds.width, bounds.height) / 2
    const x = event.clientX - (bounds.left + bounds.width / 2)
    const y = event.clientY - (bounds.top + bounds.height / 2)
    onChange({
      h: ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360,
      s: clamp(Math.hypot(x, y) / radius, 0, 1),
      v: color.v,
    })
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    let next = color
    const step = event.shiftKey ? 10 : 2
    if (event.key === "ArrowLeft") next = { ...color, h: color.h - step }
    else if (event.key === "ArrowRight") next = { ...color, h: color.h + step }
    else if (event.key === "ArrowUp") {
      next = { ...color, s: clamp(color.s + step / 100, 0, 1) }
    } else if (event.key === "ArrowDown") {
      next = { ...color, s: clamp(color.s - step / 100, 0, 1) }
    } else if (event.key === "Home") next = { ...color, s: 0 }
    else if (event.key === "End") next = { ...color, s: 1 }
    else return
    event.preventDefault()
    onChange(next)
  }

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Hue and saturation color wheel"
      aria-valuemin={0}
      aria-valuemax={359}
      aria-valuenow={Math.round(color.h)}
      aria-valuetext={`Hue ${Math.round(color.h)} degrees, saturation ${Math.round(color.s * 100)} percent`}
      className="relative aspect-square w-40 touch-none rounded-full ring-offset-background outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      style={{
        background:
          "radial-gradient(circle, #fff 0%, rgba(255,255,255,0) 72%), conic-gradient(from 90deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
        boxShadow: `inset 0 0 0 999px rgb(0 0 0 / ${1 - color.v})`,
      }}
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => {
        pointerIdRef.current = event.pointerId
        event.currentTarget.setPointerCapture(event.pointerId)
        updateFromPointer(event)
      }}
      onPointerMove={(event) => {
        if (pointerIdRef.current === event.pointerId) updateFromPointer(event)
      }}
      onPointerUp={(event) => {
        if (pointerIdRef.current !== event.pointerId) return
        pointerIdRef.current = null
        event.currentTarget.releasePointerCapture(event.pointerId)
      }}
      onPointerCancel={() => {
        pointerIdRef.current = null
      }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute size-3 -translate-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.55),0_1px_3px_rgba(0,0,0,0.35)]"
        style={{ left: `${left}%`, top: `${top}%` }}
      />
    </div>
  )
}

export function ColorPicker({
  value,
  palettes,
  customPalettes = [],
  onCustomPalettesChange,
  onPick,
}: ColorPickerProps): ReactNode {
  const id = useId()
  const selectedColor = normalizeHexColor(value) ?? "#000000"
  const [customColor, setCustomColor] = useState<HsvColor>(() =>
    hexToHsv(selectedColor)
  )
  const [hexDraft, setHexDraft] = useState(selectedColor)
  const [paletteName, setPaletteName] = useState("My palette")

  useEffect(() => {
    const normalized = normalizeHexColor(value)
    if (!normalized) return
    setCustomColor(hexToHsv(normalized))
    setHexDraft(normalized)
  }, [value])

  const commitCustomColor = (next: HsvColor) => {
    const normalized = hsvToHex(next)
    setCustomColor(next)
    setHexDraft(normalized)
    onPick(normalized)
  }

  const addCustomColor = () => {
    if (!onCustomPalettesChange) return
    const color = hsvToHex(customColor)
    const name = paletteName.trim() || "My palette"
    const existing = customPalettes.find(
      (palette) => palette.name.toLowerCase() === name.toLowerCase()
    )
    if (existing) {
      if (existing.colors.includes(color)) return
      onCustomPalettesChange(
        customPalettes.map((palette) =>
          palette.id === existing.id
            ? { ...palette, colors: [...palette.colors, color] }
            : palette
        )
      )
      return
    }
    onCustomPalettesChange([
      ...customPalettes,
      {
        id: `palette-${Date.now().toString(36)}`,
        name,
        colors: [color],
      },
    ])
  }

  const vividColor = hsvToHex({ ...customColor, v: 1 })
  const hexIsValid = normalizeHexColor(hexDraft) !== null

  return (
    <Tabs defaultValue="swatches" className="gap-3">
      <div className="flex items-center gap-2">
        <TabsList className="grid min-w-0 flex-1 grid-cols-2">
          <TabsTrigger value="swatches">Swatches</TabsTrigger>
          <TabsTrigger value="custom">Custom</TabsTrigger>
        </TabsList>
        <div
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background/50 px-2 font-mono text-[10px] uppercase"
          title={`Current color ${selectedColor}`}
        >
          <span
            className="size-3.5 rounded-sm border border-black/10 dark:border-white/15"
            style={{ background: selectedColor }}
            aria-hidden="true"
          />
          {selectedColor}
        </div>
      </div>

      <TabsContent value="swatches" className="grid gap-3">
        <div className="flex items-center gap-2">
          <span className="w-14 text-[10px] font-medium text-muted-foreground">
            Base
          </span>
          <SwatchButton
            color="#ffffff"
            label="white (#ffffff)"
            selected={selectedColor === "#ffffff"}
            onPick={onPick}
          />
          <SwatchButton
            color="#000000"
            label="black (#000000)"
            selected={selectedColor === "#000000"}
            onPick={onPick}
          />
        </div>
        <TailwindSwatches
          palettes={palettes}
          selectedColor={selectedColor}
          onPick={onPick}
        />
        {customPalettes.length > 0 ? (
          <div className="grid gap-2 border-t border-border pt-3">
            <div className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
              Saved palettes
            </div>
            {customPalettes.map((palette) => (
              <div key={palette.id} className="grid gap-1">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="truncate text-[10px] text-muted-foreground">
                    {palette.name}
                  </span>
                  {onCustomPalettesChange ? (
                    <button
                      type="button"
                      className="rounded-sm px-1 text-xs text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Delete ${palette.name} palette`}
                      onClick={() =>
                        onCustomPalettesChange(
                          customPalettes.filter(
                            (entry) => entry.id !== palette.id
                          )
                        )
                      }
                    >
                      ×
                    </button>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-1">
                  {palette.colors.map((color) => (
                    <SwatchButton
                      key={`${palette.id}-${color}`}
                      color={color}
                      label={`${palette.name} ${color}`}
                      selected={selectedColor === normalizeHexColor(color)}
                      onPick={onPick}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </TabsContent>

      <TabsContent value="custom" className="grid gap-4">
        <div className="flex justify-center">
          <ColorWheel color={customColor} onChange={commitCustomColor} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-brightness`} className="text-xs">
            Brightness
          </Label>
          <input
            id={`${id}-brightness`}
            type="range"
            min={0}
            max={100}
            value={Math.round(customColor.v * 100)}
            aria-valuetext={`${Math.round(customColor.v * 100)} percent`}
            className="h-3 w-full appearance-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-transparent [&::-moz-range-thumb]:shadow-[0_0_0_1px_rgba(0,0,0,0.55)] [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-transparent [&::-webkit-slider-thumb]:shadow-[0_0_0_1px_rgba(0,0,0,0.55)]"
            style={{
              background: `linear-gradient(to right, #000, ${vividColor})`,
            }}
            onChange={(event) =>
              commitCustomColor({
                ...customColor,
                v: Number(event.target.value) / 100,
              })
            }
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-hex`} className="text-xs">
            Hex color
          </Label>
          <div className="grid grid-cols-[2.25rem_1fr] gap-2">
            <span
              className="rounded-md border border-border shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]"
              style={{ background: hsvToHex(customColor) }}
              aria-hidden="true"
            />
            <Input
              id={`${id}-hex`}
              value={hexDraft}
              aria-invalid={!hexIsValid}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              className="font-mono uppercase"
              onChange={(event) => {
                const nextDraft = event.target.value
                setHexDraft(nextDraft)
                const raw = nextDraft.trim().replace(/^#/, "")
                const normalized =
                  raw.length === 6 ? normalizeHexColor(nextDraft) : null
                if (normalized) {
                  setCustomColor(hexToHsv(normalized))
                  onPick(normalized)
                }
              }}
              onBlur={() => {
                const normalized = normalizeHexColor(hexDraft)
                if (normalized) commitCustomColor(hexToHsv(normalized))
                else setHexDraft(hsvToHex(customColor))
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return
                event.preventDefault()
                event.currentTarget.blur()
              }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            Enter a 3- or 6-digit hex value.
          </p>
        </div>
        {onCustomPalettesChange ? (
          <div className="grid grid-cols-[1fr_auto] gap-2 border-t border-border pt-3">
            <Label htmlFor={`${id}-palette-name`} className="sr-only">
              Palette name
            </Label>
            <Input
              id={`${id}-palette-name`}
              value={paletteName}
              onChange={(event) => setPaletteName(event.target.value)}
              placeholder="Palette name"
              className="text-xs"
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={addCustomColor}
            >
              Save color
            </Button>
          </div>
        ) : null}
      </TabsContent>
    </Tabs>
  )
}
