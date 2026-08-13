"use client"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
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
  familyHasWeightAxis,
  searchGoogleFonts,
  weightAxisRange,
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

export function FontPicker(props: FontPickerProps): ReactNode {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [recents, setRecents] = useState<string[]>(readRecents)
  const scrollRef = useRef<HTMLDivElement>(null)

  const selectedMeta = useMemo(
    () =>
      props.catalog.families.find(
        (entry) => entry.family.toLowerCase() === props.value.toLowerCase()
      ),
    [props.catalog.families, props.value]
  )

  const weightAxis = selectedMeta ? weightAxisRange(selectedMeta) : undefined
  const currentWeight =
    props.weight ??
    weightAxis?.defaultValue ??
    selectedMeta?.axes.find((axis) => axis.tag === "wght")?.defaultValue ??
    400

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

  const getScrollElement = useCallback(
    () => scrollRef.current,
    []
  )

  const { virtualItems, totalSize } = useVirtualList({
    count: listItems.length,
    estimateSize: ROW_HEIGHT,
    overscan: 8,
    getScrollElement,
    getItemKey: (index) => listItems[index]?.family ?? index,
  })

  const selectFamily = useCallback(
    (family: GoogleFontFamily, weight: number) => {
      pushRecent(family.family)
      setRecents(readRecents())
      props.onChange(family.family, weight)
      setOpen(false)
    },
    [props]
  )

  useEffect(() => {
    if (!open) setQuery("")
  }, [open])

  const weightControl =
    selectedMeta && familyHasWeightAxis(selectedMeta) && weightAxis ? (
      <div className="flex items-center gap-3 px-1">
        <Label className="text-xs text-muted-foreground shrink-0">Weight</Label>
        <Slider
          min={weightAxis.min}
          max={weightAxis.max}
          step={1}
          value={[currentWeight]}
          onValueChange={(values) => {
            const list = Array.isArray(values) ? values : [values]
            const next = list[0]
            if (next === undefined) return
            props.onChange(props.value, next)
          }}
          className="flex-1"
        />
        <span className="text-xs tabular-nums text-muted-foreground w-8 text-right">
          {currentWeight}
        </span>
      </div>
    ) : null

  return (
    <div
      className={
        props.compact
          ? "flex min-w-0 items-center"
          : "flex min-w-0 flex-col gap-2"
      }
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="xs"
              className={
                props.compact
                  ? "apex-editor-toolbar__font h-8 w-[132px] justify-start truncate text-xs font-normal tracking-normal normal-case"
                  : "max-w-[220px] justify-start truncate font-normal"
              }
              aria-label="Font family"
            />
          }
        >
          <span
            className="truncate"
            style={{ fontFamily: `"${props.value}", system-ui, sans-serif` }}
          >
            {props.value || "Font"}
          </span>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
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
                      const axis = weightAxisRange(family)
                      selectFamily(
                        family,
                        axis?.defaultValue ?? currentWeight
                      )
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
            <div className="border-t border-border p-2">{weightControl}</div>
          ) : null}
        </PopoverContent>
      </Popover>

      {!props.compact ? weightControl : null}
    </div>
  )
}
