"use client"

import type { ReactNode } from "react"
import { Autocomplete as AutocompletePrimitive } from "@base-ui/react/autocomplete"
import { Cancel01Icon, UnfoldMoreIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { cva, type VariantProps } from "class-variance-authority"

import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { cn } from "@workspace/ui/lib/utils"

const autocompleteInputVariants = cva(
  "flex w-full rounded-lg border border-input bg-transparent text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
  {
    variants: {
      size: {
        sm: "h-7 px-2",
        default: "h-8 px-2.5",
        lg: "h-9 px-2.5",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

const Autocomplete = AutocompletePrimitive.Root

function AutocompleteValue({ ...props }: AutocompletePrimitive.Value.Props) {
  return (
    <AutocompletePrimitive.Value data-slot="autocomplete-value" {...props} />
  )
}

function AutocompleteInput({
  className,
  size = "default",
  showClear = false,
  showTrigger = false,
  ...props
}: Omit<AutocompletePrimitive.Input.Props, "size"> &
  VariantProps<typeof autocompleteInputVariants> & {
    showClear?: boolean
    showTrigger?: boolean
  }) {
  return (
    <div className="relative w-full">
      <AutocompletePrimitive.Input
        data-slot="autocomplete-input"
        data-size={size}
        className={cn(
          autocompleteInputVariants({ size }),
          (showClear || showTrigger) && "pe-8",
          showClear && showTrigger && "pe-14",
          className
        )}
        {...props}
      />
      {showTrigger ? <AutocompleteTrigger /> : null}
      {showClear ? <AutocompleteClear /> : null}
    </div>
  )
}

function AutocompleteStatus({
  className,
  ...props
}: AutocompletePrimitive.Status.Props) {
  return (
    <AutocompletePrimitive.Status
      data-slot="autocomplete-status"
      className={cn(
        "px-2 py-1.5 text-sm text-muted-foreground empty:m-0 empty:p-0",
        className
      )}
      {...props}
    />
  )
}

function AutocompletePortal({ ...props }: AutocompletePrimitive.Portal.Props) {
  return (
    <AutocompletePrimitive.Portal data-slot="autocomplete-portal" {...props} />
  )
}

function AutocompletePositioner({
  className,
  ...props
}: AutocompletePrimitive.Positioner.Props) {
  return (
    <AutocompletePrimitive.Positioner
      data-slot="autocomplete-positioner"
      className={cn("z-50 outline-none", className)}
      {...props}
    />
  )
}

function AutocompleteList({
  className,
  scrollAreaClassName,
  ...props
}: AutocompletePrimitive.List.Props & {
  scrollAreaClassName?: string
}) {
  return (
    <ScrollArea
      className={cn(
        "max-h-60 min-h-0 **:data-[slot=scroll-area-viewport]:overscroll-contain",
        scrollAreaClassName
      )}
    >
      <AutocompletePrimitive.List
        data-slot="autocomplete-list"
        className={cn("not-empty:scroll-py-1 not-empty:p-1", className)}
        {...props}
      />
    </ScrollArea>
  )
}

function AutocompleteCollection({
  ...props
}: AutocompletePrimitive.Collection.Props) {
  return (
    <AutocompletePrimitive.Collection
      data-slot="autocomplete-collection"
      {...props}
    />
  )
}

function AutocompleteItem({
  className,
  ...props
}: AutocompletePrimitive.Item.Props) {
  return (
    <AutocompletePrimitive.Item
      data-slot="autocomplete-item"
      className={cn(
        "relative flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export type AutocompleteContentProps = AutocompletePrimitive.Popup.Props & {
  align?: AutocompletePrimitive.Positioner.Props["align"]
  sideOffset?: AutocompletePrimitive.Positioner.Props["sideOffset"]
  alignOffset?: AutocompletePrimitive.Positioner.Props["alignOffset"]
  side?: AutocompletePrimitive.Positioner.Props["side"]
}

function AutocompleteContent({
  className,
  children,
  align = "start",
  sideOffset = 4,
  alignOffset = 0,
  side = "bottom",
  ...props
}: AutocompleteContentProps) {
  return (
    <AutocompletePortal>
      <AutocompletePositioner
        align={align}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        side={side}
      >
        <AutocompletePrimitive.Popup
          data-slot="autocomplete-popup"
          className={cn(
            "flex w-(--anchor-width) max-w-(--available-width) origin-(--transform-origin) flex-col overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10",
            className
          )}
          {...props}
        >
          {children}
        </AutocompletePrimitive.Popup>
      </AutocompletePositioner>
    </AutocompletePortal>
  )
}

function AutocompleteGroup({ ...props }: AutocompletePrimitive.Group.Props) {
  return (
    <AutocompletePrimitive.Group data-slot="autocomplete-group" {...props} />
  )
}

function AutocompleteGroupLabel({
  className,
  ...props
}: AutocompletePrimitive.GroupLabel.Props) {
  return (
    <AutocompletePrimitive.GroupLabel
      data-slot="autocomplete-group-label"
      className={cn(
        "px-1.5 py-1 text-xs font-medium text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function AutocompleteEmpty({
  className,
  ...props
}: AutocompletePrimitive.Empty.Props) {
  return (
    <AutocompletePrimitive.Empty
      data-slot="autocomplete-empty"
      className={cn(
        "px-2 py-1.5 text-center text-sm text-muted-foreground empty:m-0 empty:p-0",
        className
      )}
      {...props}
    />
  )
}

function AutocompleteClear({
  className,
  ...props
}: AutocompletePrimitive.Clear.Props) {
  return (
    <AutocompletePrimitive.Clear
      data-slot="autocomplete-clear"
      className={cn(
        "absolute end-1.5 top-1/2 -translate-y-1/2 cursor-pointer opacity-70 transition-opacity hover:opacity-100",
        className
      )}
      {...props}
    >
      <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-4" />
    </AutocompletePrimitive.Clear>
  )
}

function AutocompleteTrigger({
  className,
  ...props
}: AutocompletePrimitive.Trigger.Props) {
  return (
    <AutocompletePrimitive.Trigger
      data-slot="autocomplete-trigger"
      className={cn(
        "absolute end-1.5 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground opacity-70 transition-opacity hover:opacity-100 has-[+[data-slot=autocomplete-clear]]:end-7",
        className
      )}
      {...props}
    >
      <HugeiconsIcon icon={UnfoldMoreIcon} strokeWidth={2} className="size-4" />
    </AutocompletePrimitive.Trigger>
  )
}

export type AutocompleteOption = Readonly<{
  value: string
  label: string
  group?: string
  keywords?: string
}>

type AutocompleteGroupItems = Readonly<{
  value: string
  items: readonly AutocompleteOption[]
}>

function optionSearchText(option: AutocompleteOption): string {
  return [option.label, option.value, option.group, option.keywords]
    .filter(
      (part): part is string => typeof part === "string" && part.length > 0
    )
    .join("\n")
}

function optionMatchesQuery(
  option: AutocompleteOption,
  query: string
): boolean {
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) return true
  return optionSearchText(option).toLowerCase().includes(needle)
}

function findOption(
  options: readonly AutocompleteOption[],
  query: string
): AutocompleteOption | undefined {
  const needle = query.trim().toLowerCase()
  return options.find(
    (option) =>
      option.value.toLowerCase() === needle ||
      option.label.toLowerCase() === needle
  )
}

function groupedOptions(
  options: readonly AutocompleteOption[]
): AutocompleteGroupItems[] {
  const groups: AutocompleteGroupItems[] = []
  const indexByName = new Map<string, number>()
  for (const option of options) {
    const name = option.group ?? ""
    const existing = indexByName.get(name)
    if (existing === undefined) {
      indexByName.set(name, groups.length)
      groups.push({ value: name, items: [option] })
      continue
    }
    const group = groups[existing]
    if (!group) continue
    groups[existing] = { ...group, items: [...group.items, option] }
  }
  return groups
}

export type AutocompleteFieldProps = Readonly<{
  value?: string
  onValueChange: (value: string) => void
  options: readonly AutocompleteOption[]
  placeholder?: string
  emptyText?: string
  disabled?: boolean
  className?: string
  id?: string
  "aria-invalid"?: boolean
  autoHighlight?: boolean | "always"
  allowCustomValue?: boolean
  customValueLabel?: (query: string) => string
}>

function AutocompleteField({
  value,
  onValueChange,
  options,
  placeholder = "Search…",
  emptyText,
  disabled,
  className,
  id,
  "aria-invalid": ariaInvalid,
  autoHighlight = true,
  allowCustomValue = true,
  customValueLabel = (query) => `Use “${query}”`,
}: AutocompleteFieldProps): ReactNode {
  const selected = findOption(options, value ?? "")
  const inputValue = selected?.label ?? value ?? ""
  const query = inputValue.trim()
  const catalogMatch = findOption(options, query)
  const items =
    allowCustomValue && query.length > 0 && catalogMatch === undefined
      ? [
          {
            value: query,
            label: query,
            group: "Custom",
          },
          ...options,
        ]
      : options
  const groups = groupedOptions(items)
  const useGroups = items.some((option) => option.group !== undefined)
  const resolvedEmptyText =
    emptyText ??
    (allowCustomValue
      ? "No matches. Your text will be used as a custom value."
      : "No results")

  const renderItem = (item: AutocompleteOption) => {
    const isCustom =
      allowCustomValue &&
      item.value === query &&
      catalogMatch === undefined &&
      item.group === "Custom"
    return (
      <AutocompleteItem key={item.value} value={item}>
        {isCustom ? customValueLabel(item.label) : item.label}
      </AutocompleteItem>
    )
  }

  const handleValueChange = (next: string) => {
    const match = findOption(options, next)
    if (match) {
      onValueChange(match.value)
      return
    }
    if (allowCustomValue) {
      onValueChange(next)
      return
    }
    onValueChange("")
  }

  const input = (
    <AutocompleteInput
      id={id}
      disabled={disabled}
      placeholder={placeholder}
      showClear
      showTrigger
      aria-invalid={ariaInvalid}
      className={className}
    />
  )

  if (useGroups) {
    return (
      <Autocomplete
        items={groups}
        value={inputValue}
        autoHighlight={autoHighlight}
        openOnInputClick
        itemToStringValue={(item) => item.label}
        filter={(item, filterQuery) => optionMatchesQuery(item, filterQuery)}
        onValueChange={handleValueChange}
      >
        {input}
        <AutocompleteContent>
          <AutocompleteEmpty>{resolvedEmptyText}</AutocompleteEmpty>
          <AutocompleteList>
            {(group: AutocompleteGroupItems) => (
              <AutocompleteGroup
                key={group.value || "options"}
                items={group.items}
              >
                {group.value ? (
                  <AutocompleteGroupLabel>{group.value}</AutocompleteGroupLabel>
                ) : null}
                <AutocompleteCollection>
                  {(item: AutocompleteOption) => renderItem(item)}
                </AutocompleteCollection>
              </AutocompleteGroup>
            )}
          </AutocompleteList>
        </AutocompleteContent>
      </Autocomplete>
    )
  }

  return (
    <Autocomplete
      items={items}
      value={inputValue}
      autoHighlight={autoHighlight}
      openOnInputClick
      itemToStringValue={(item) => item.label}
      filter={(item, filterQuery) => optionMatchesQuery(item, filterQuery)}
      onValueChange={handleValueChange}
    >
      {input}
      <AutocompleteContent>
        <AutocompleteEmpty>{resolvedEmptyText}</AutocompleteEmpty>
        <AutocompleteList>
          {(item: AutocompleteOption) => renderItem(item)}
        </AutocompleteList>
      </AutocompleteContent>
    </Autocomplete>
  )
}

export {
  Autocomplete,
  AutocompleteClear,
  AutocompleteCollection,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteField,
  AutocompleteGroup,
  AutocompleteGroupLabel,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
  AutocompletePortal,
  AutocompletePositioner,
  AutocompleteStatus,
  AutocompleteTrigger,
  AutocompleteValue,
}
