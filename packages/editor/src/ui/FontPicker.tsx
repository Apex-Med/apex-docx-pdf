"use client"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { Slider } from "@workspace/ui/components/slider"
import { useVirtualList } from "@workspace/ui/hooks/use-virtual-list"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import {
  availableFontWeights,
  fontWeightLabel,
  nearestAvailableFontWeight,
  searchGoogleFonts,
  type GoogleFontCatalog,
  type GoogleFontFamily,
} from "../fonts/google-catalog"

const FONT_RECENTS_KEY = "apex-font-recents"
const MAX_RECENTS = 8
const ROW_HEIGHT = 36

export type FontPickerProps = Readonly<{
  value: string
  weight?: number
  onChange: (family: string, weight: number) => void
  catalog: GoogleFontCatalog
  /** Toolbar-friendly layout: keep the trigger compact and nest weight in the popover. */
  compact?: boolean
}>

function readRecents(): string[] {
  if (typeof localStorage === "undefined") return []
  try {
    const raw = localStorage.getItem(FONT_RECENTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((entry): entry is string => typeof entry === "string")
      .slice(0, MAX_RECENTS)
  } catch {
    return []
  }
}

function writeRecents(families: readonly string[]): void {
  if (typeof localStorage === "undefined") return
  try {
    localStorage.setItem(FONT_RECENTS_KEY, JSON.stringify(families))
  } catch {
    // Ignore quota errors.
  }
}

function pushRecent(family: string): void {
  const recents = readRecents().filter(
    (entry) => entry.toLowerCase() !== family.toLowerCase()
  )
  writeRecents([family, ...recents].slice(0, MAX_RECENTS))
}

function clampWeightIndex(index: number, weightCount: number): number {
  if (weightCount <= 0) return 0
  return Math.max(0, Math.min(weightCount - 1, Math.round(index)))
}

export function FontPicker(props: FontPickerProps): ReactNode {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [recents, setRecents] = useState<string[]>(readRecents)
  const [dragWeightIndex, setDragWeightIndex] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const selectedMeta = useMemo(
    () =>
      props.catalog.families.find(
        (entry) => entry.family.toLowerCase() === props.value.toLowerCase()
      ),
    [props.catalog.families, props.value]
  )

  const weights = useMemo(
    () => (selectedMeta ? availableFontWeights(selectedMeta) : [400]),
    [selectedMeta]
  )
  const requestedWeight = props.weight ?? 400
  const currentWeight = selectedMeta
    ? nearestAvailableFontWeight(selectedMeta, requestedWeight)
    : 400
  const committedWeightIndex = Math.max(0, weights.indexOf(currentWeight))
  const currentWeightIndex =
    dragWeightIndex === null
      ? committedWeightIndex
      : clampWeightIndex(dragWeightIndex, weights.length)
  const displayWeight = weights[currentWeightIndex] ?? currentWeight

  useEffect(() => {
    setDragWeightIndex(null)
  }, [props.value, weights])

  const filtered = useMemo(
    () => searchGoogleFonts(props.catalog, query),
    [props.catalog, query]
  )

  const recentFamilies = useMemo(
    () =>
      recents
        .map((name) =>
          props.catalog.families.find(
            (entry) => entry.family.toLowerCase() === name.toLowerCase()
          )
        )
        .filter((entry): entry is GoogleFontFamily => entry !== undefined),
    [props.catalog.families, recents]
  )

  const listItems = useMemo(() => {
    const items: GoogleFontFamily[] = []
    if (query.trim() === "" && recentFamilies.length > 0) {
      items.push(...recentFamilies)
    }
    for (const family of filtered) {
      if (!items.some((entry) => entry.family === family.family)) {
        items.push(family)
      }
    }
    return items
  }, [filtered, query, recentFamilies])

  const getScrollElement = useCallback(() => scrollRef.current, [])

  const { virtualItems, totalSize } = useVirtualList({
    count: listItems.length,
    estimateSize: ROW_HEIGHT,
    overscan: 8,
    getScrollElement,
    getItemKey: (index) => listItems[index]?.family ?? index,
  })

  const selectFamily = useCallback(
    (family: GoogleFontFamily) => {
      const nextWeight = nearestAvailableFontWeight(family, requestedWeight)
      pushRecent(family.family)
      setRecents(readRecents())
      props.onChange(family.family, nextWeight)
      setOpen(false)
    },
    [props, requestedWeight]
  )

  const applyWeightIndex = useCallback(
    (rawIndex: number, commit: boolean) => {
      const nextIndex = clampWeightIndex(rawIndex, weights.length)
      const nextWeight = weights[nextIndex]
      if (nextWeight === undefined) return
      setDragWeightIndex(commit ? null : nextIndex)
      if (nextWeight !== currentWeight) {
        props.onChange(props.value, nextWeight)
      }
    },
    [currentWeight, props, weights]
  )

  useEffect(() => {
    if (!open) setQuery("")
  }, [open])

  const weightControl = selectedMeta ? (
    <div className="flex flex-col gap-2 px-1 py-0.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium text-muted-foreground">
          Weight
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          <span className="font-medium text-foreground">
            {fontWeightLabel(displayWeight)}
          </span>{" "}
          {displayWeight}
        </span>
      </div>
      {weights.length > 1 ? (
        <Slider
          size="lg"
          min={0}
          max={weights.length - 1}
          step={1}
          value={[currentWeightIndex]}
          onValueChange={(values) => {
            const list = Array.isArray(values) ? values : [values]
            const nextIndex = list[0]
            if (nextIndex === undefined) return
            applyWeightIndex(nextIndex, false)
          }}
          onValueCommitted={(values) => {
            const list = Array.isArray(values) ? values : [values]
            const nextIndex = list[0]
            if (nextIndex === undefined) {
              setDragWeightIndex(null)
              return
            }
            applyWeightIndex(nextIndex, true)
          }}
          getAriaLabel={() => `Font weight for ${props.value}`}
          getAriaValueText={(_formattedValue, value) => {
            const weight =
              weights[clampWeightIndex(value, weights.length)] ?? displayWeight
            return `${fontWeightLabel(weight)}, ${weight}`
          }}
          className="w-full"
        />
      ) : (
        <div className="rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Only {fontWeightLabel(displayWeight).toLowerCase()} ({displayWeight})
          is published for this family.
        </div>
      )}
    </div>
  ) : null

  return (
    <div
      className={
        props.compact
          ? "apex-editor-toolbar__font-wrap flex shrink-0 items-center overflow-hidden"
          : "flex min-w-0 flex-col gap-3"
      }
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className={
                props.compact
                  ? "apex-editor-toolbar__font h-9 justify-start overflow-hidden text-sm font-normal tracking-normal normal-case"
                  : "max-w-[220px] justify-start truncate font-normal"
              }
              aria-label="Font family"
            />
          }
        >
          <span
            className="min-w-0 flex-1 truncate"
            style={{ fontFamily: `"${props.value}", system-ui, sans-serif` }}
          >
            {props.value || "Font"}
          </span>
        </PopoverTrigger>
        <PopoverContent className="w-96 p-0" align="start">
          <div className="border-b border-border p-2">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search fonts…"
              aria-label="Search fonts"
              className="h-8"
            />
          </div>
          <div
            ref={scrollRef}
            className="max-h-72 overflow-y-auto"
            role="listbox"
            aria-label="Font families"
          >
            <div style={{ height: totalSize, position: "relative" }}>
              {virtualItems.map((item) => {
                const family = listItems[item.index]
                if (!family) return null
                const isSelected =
                  family.family.toLowerCase() === props.value.toLowerCase()
                return (
                  <button
                    key={family.family}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className="absolute left-0 flex w-full items-center px-3 text-left text-sm hover:bg-accent"
                    style={{
                      top: item.start,
                      height: item.size,
                    }}
                    onClick={() => {
                      selectFamily(family)
                    }}
                  >
                    <span
                      className="truncate"
                      style={{
                        fontFamily: `"${family.family}", system-ui, sans-serif`,
                      }}
                    >
                      {family.family}
                    </span>
                    <span className="ml-auto pl-2 text-xs text-muted-foreground">
                      {family.category}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
          {props.compact && weightControl ? (
            <div className="border-t border-border p-3">{weightControl}</div>
          ) : null}
        </PopoverContent>
      </Popover>

      {!props.compact ? weightControl : null}
    </div>
  )
}
