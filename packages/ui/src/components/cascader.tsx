"use client"

import { useMemo, useState, type ReactNode } from "react"
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Tick02Icon,
  UnfoldMoreIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { cn } from "@workspace/ui/lib/utils"

export type CascaderOption = Readonly<{
  value: string
  label: string
  children?: readonly CascaderOption[]
  disabled?: boolean
}>

export type CascaderProps = Readonly<{
  value?: string
  onValueChange: (value: string) => void
  options: readonly CascaderOption[]
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
  className?: string
  id?: string
  "aria-invalid"?: boolean
}>

function optionHasChildren(option: CascaderOption): boolean {
  return (option.children?.length ?? 0) > 0
}

export function findCascaderPath(
  options: readonly CascaderOption[],
  value: string | undefined
): readonly CascaderOption[] {
  if (!value) return []
  for (const option of options) {
    if (option.value === value) return [option]
    const nested = findCascaderPath(option.children ?? [], value)
    if (nested.length > 0) return [option, ...nested]
  }
  return []
}

function levelItems(
  options: readonly CascaderOption[],
  trail: readonly CascaderOption[]
): readonly CascaderOption[] {
  const current = trail.at(-1)
  return current ? (current.children ?? []) : options
}

export function Cascader({
  value,
  onValueChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search this level…",
  emptyText = "No results",
  disabled,
  className,
  id,
  "aria-invalid": ariaInvalid,
}: CascaderProps): ReactNode {
  const [open, setOpen] = useState(false)
  const [trail, setTrail] = useState<readonly CascaderOption[]>([])
  const [query, setQuery] = useState("")
  const selectedPath = useMemo(
    () => findCascaderPath(options, value),
    [options, value]
  )
  const items = levelItems(options, trail)
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (needle.length === 0) return items
    return items.filter((item) => item.label.toLowerCase().includes(needle))
  }, [items, query])

  const display =
    selectedPath.length > 0
      ? selectedPath.map((item) => item.label).join(" / ")
      : undefined

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setTrail(selectedPath.slice(0, -1))
          setQuery("")
        }
      }}
    >
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-invalid={ariaInvalid}
            className={cn(
              "w-full min-w-0 shrink justify-between overflow-hidden font-normal",
              className
            )}
          />
        }
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-left",
            !display && "text-muted-foreground"
          )}
        >
          {display ?? placeholder}
        </span>
        <HugeiconsIcon
          icon={UnfoldMoreIcon}
          strokeWidth={2}
          className="shrink-0 text-muted-foreground"
        />
      </PopoverTrigger>
      <PopoverContent
        className="w-(--anchor-width) min-w-56 gap-0 p-0"
        align="start"
      >
        <div className="flex items-center gap-1 border-b p-1.5">
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            disabled={trail.length === 0}
            aria-label="Back"
            onClick={() => {
              setTrail(trail.slice(0, -1))
              setQuery("")
            }}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
          </Button>
          <p className="min-w-0 flex-1 truncate px-1 text-xs text-muted-foreground">
            {trail.length === 0
              ? "All"
              : trail.map((item) => item.label).join(" / ")}
          </p>
        </div>
        <div className="p-1.5">
          <Input
            value={query}
            placeholder={searchPlaceholder}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <ScrollArea className="max-h-60">
          <div className="flex flex-col p-1">
            {filtered.length === 0 ? (
              <p className="px-2 py-1.5 text-center text-sm text-muted-foreground">
                {emptyText}
              </p>
            ) : (
              filtered.map((item) => {
                const branch = optionHasChildren(item)
                const selected = item.value === value
                return (
                  <button
                    key={item.value}
                    type="button"
                    disabled={item.disabled}
                    className={cn(
                      "flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm outline-hidden hover:bg-accent hover:text-accent-foreground disabled:opacity-50",
                      selected && "bg-accent/60"
                    )}
                    onClick={() => {
                      if (branch) {
                        setTrail([...trail, item])
                        setQuery("")
                        return
                      }
                      onValueChange(item.value)
                      setOpen(false)
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {item.label}
                    </span>
                    {selected && !branch ? (
                      <HugeiconsIcon
                        icon={Tick02Icon}
                        strokeWidth={2}
                        className="size-4"
                      />
                    ) : null}
                    {branch ? (
                      <HugeiconsIcon
                        icon={ArrowRight01Icon}
                        strokeWidth={2}
                        className="size-4 text-muted-foreground"
                      />
                    ) : null}
                  </button>
                )
              })
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
