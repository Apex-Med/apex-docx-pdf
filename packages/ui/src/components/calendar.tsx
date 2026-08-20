"use client"

import type { DropdownProps } from "@daypicker/react"
import { DayPicker } from "@daypicker/react"
import {
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowUp01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type * as React from "react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { cn } from "@workspace/ui/lib/utils"

const buttonClassNames =
  "relative flex size-(--cell-size) items-center justify-center rounded-lg text-base text-foreground not-in-data-selected:hover:bg-accent sm:text-sm disabled:pointer-events-none disabled:opacity-64 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='opacity-'])]:opacity-80 [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4"

const DEFAULT_START_MONTH = new Date(1900, 0)
const DEFAULT_END_MONTH = new Date(new Date().getFullYear() + 30, 11)

function CalendarDropdown(props: DropdownProps): React.ReactElement {
  const { options, value, onChange, "aria-label": ariaLabel } = props
  const isYear = (ariaLabel ?? "").toLowerCase().includes("year")

  const items =
    options?.map((option) => ({
      disabled: option.disabled,
      label: option.label,
      value: option.value.toString(),
    })) ?? []

  return (
    <Select
      aria-label={ariaLabel}
      items={items.map((item) => ({ value: item.value, label: item.label }))}
      onValueChange={(newValue) => {
        if (!onChange || newValue == null) return
        onChange({
          target: { value: String(newValue) },
        } as React.ChangeEvent<HTMLSelectElement>)
      }}
      value={value?.toString()}
    >
      <SelectTrigger
        className={cn(
          "h-8 min-h-8 min-w-0 overflow-hidden px-2",
          isYear ? "w-[4.75rem]" : "w-[4.5rem]"
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="center" alignItemWithTrigger={false}>
        {items.map((item) => (
          <SelectItem
            disabled={item.disabled}
            key={item.value}
            value={item.value}
          >
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  components: userComponents,
  mode = "single",
  captionLayout = "dropdown",
  startMonth = DEFAULT_START_MONTH,
  endMonth = DEFAULT_END_MONTH,
  ...props
}: React.ComponentProps<typeof DayPicker>): React.ReactElement {
  const defaultClassNames = {
    button_next: buttonClassNames,
    button_previous: buttonClassNames,
    caption_label:
      "flex h-full items-center gap-2 text-base font-medium sm:text-sm",
    day: "size-(--cell-size) py-px text-sm",
    day_button: cn(
      buttonClassNames,
      "in-data-disabled:pointer-events-none in-[.range-middle]:rounded-none in-[.range-end:not(.range-start)]:rounded-s-none in-[.range-start:not(.range-end)]:rounded-e-none in-[.range-middle]:in-data-selected:bg-accent in-data-selected:bg-primary in-[.range-middle]:in-data-selected:text-foreground in-data-disabled:text-muted-foreground/72 in-data-outside:text-muted-foreground/72 in-data-selected:in-data-outside:text-primary-foreground in-data-selected:text-primary-foreground in-data-disabled:line-through outline-none in-[[data-selected]:not(.range-middle)]:transition-[border-radius,box-shadow] focus-visible:z-1 focus-visible:ring-[3px] focus-visible:ring-ring/50"
    ),
    dropdown: "absolute inset-0 bg-popover opacity-0",
    dropdown_root:
      "relative h-9 w-full min-w-0 overflow-hidden rounded-lg border border-input px-[calc(--spacing(3)-1px)] shadow-xs/5 has-focus:border-ring has-focus:ring-[3px] has-focus:ring-ring/50 sm:h-8 [&_svg]:pointer-events-none [&_svg]:-me-1 [&_svg:not([class*='opacity-'])]:opacity-80 [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4",
    dropdowns:
      "flex h-(--cell-size) w-full min-w-0 items-center justify-center gap-1.5 text-base sm:text-sm *:[span]:font-medium",
    hidden: "invisible",
    month: "w-full",
    month_caption:
      "relative z-2 mx-(--cell-size) mb-1 flex h-(--cell-size) items-center justify-center px-1",
    months: "relative flex flex-col gap-2 sm:flex-row",
    nav: "absolute top-0 z-1 flex w-full justify-between",
    outside:
      "text-muted-foreground data-selected:bg-accent/50 data-selected:text-muted-foreground",
    range_end: "range-end",
    range_middle: "range-middle",
    range_start: "range-start",
    today:
      "*:after:pointer-events-none *:after:absolute *:after:bottom-1 *:after:start-1/2 *:after:z-1 *:after:size-[3px] *:after:-translate-x-1/2 *:after:rounded-full *:after:bg-primary [&[data-selected]:not(.range-middle)>*]:after:bg-background [&[data-disabled]>*]:after:bg-foreground/30",
    week_number:
      "size-(--cell-size) p-0 text-xs font-medium text-muted-foreground/72",
    weekday:
      "size-(--cell-size) p-0 text-xs font-medium text-muted-foreground/72",
  }
  const mergedClassNames: typeof defaultClassNames = Object.keys(
    defaultClassNames
  ).reduce(
    (acc, key) => {
      const userClass = classNames?.[key as keyof typeof classNames]
      const baseClass =
        defaultClassNames[key as keyof typeof defaultClassNames]

      acc[key as keyof typeof defaultClassNames] = userClass
        ? cn(baseClass, userClass)
        : baseClass

      return acc
    },
    { ...defaultClassNames } as typeof defaultClassNames
  )

  const defaultComponents = {
    Chevron: ({
      className,
      orientation,
      ...props
    }: {
      className?: string
      orientation?: "left" | "right" | "up" | "down"
    }): React.ReactElement => {
      const icon =
        orientation === "left"
          ? ArrowLeft01Icon
          : orientation === "right"
            ? ArrowRight01Icon
            : orientation === "up"
              ? ArrowUp01Icon
              : ArrowDown01Icon
      return (
        <HugeiconsIcon
          icon={icon}
          strokeWidth={2}
          className={cn(
            className,
            (orientation === "left" || orientation === "right") &&
            "rtl:rotate-180"
          )}
          aria-hidden="true"
          {...props}
        />
      )
    },
    Dropdown: CalendarDropdown,
  }

  const mergedComponents = {
    ...defaultComponents,
    ...userComponents,
  }

  const dayPickerProps = {
    className: cn(
      "w-[16.75rem] [--cell-size:--spacing(10)] sm:[--cell-size:--spacing(9)]",
      className
    ),
    classNames: mergedClassNames,
    components: mergedComponents,
    "data-slot": "calendar",
    formatters: {
      formatMonthDropdown: (date: Date) =>
        date.toLocaleString("default", { month: "short" }),
    } as React.ComponentProps<typeof DayPicker>["formatters"],
    captionLayout,
    endMonth,
    mode,
    showOutsideDays,
    startMonth,
    ...props,
  }

  return (
    <DayPicker
      {...(dayPickerProps as React.ComponentProps<typeof DayPicker>)}
    />
  )
}
