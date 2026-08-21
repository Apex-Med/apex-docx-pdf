"use client"

import type { DateRange } from "@daypicker/react"
import { Calendar03Icon, Clock01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  format,
  isSameDay,
  isValid,
  parse,
  subDays,
  subMonths,
  subYears,
} from "date-fns"
import * as React from "react"

import { Button } from "@workspace/ui/components/button"
import { Calendar } from "@workspace/ui/components/calendar"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
} from "@workspace/ui/components/input-group"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@workspace/ui/components/select"
import { cn } from "@workspace/ui/lib/utils"

const DATE_FORMAT = "yyyy-MM-dd"
const RANGE_SEPARATOR = "/"
const DEFAULT_TIME = "09:00"

const HOURS = Array.from({ length: 24 }, (_, hour) =>
  String(hour).padStart(2, "0")
)
const MINUTES = Array.from({ length: 60 }, (_, minute) =>
  String(minute).padStart(2, "0")
)

export type DatePickerProps = {
  value?: string
  onValueChange: (value: string) => void
  includeTime?: boolean
  range?: boolean
  quickSelect?: boolean
  disabled?: boolean
  id?: string
  className?: string
  placeholder?: string
}

type DatePart = {
  date: string
  time: string
}

function splitPart(value: string | undefined): DatePart {
  if (!value) return { date: "", time: "" }
  const [date = "", time = ""] = value.split("T")
  return { date, time: time.slice(0, 5) }
}

function parseAnswer(value: string | undefined): {
  start: DatePart
  end?: DatePart
} {
  if (!value) return { start: { date: "", time: "" } }
  const [startRaw, endRaw] = value.split(RANGE_SEPARATOR)
  return {
    start: splitPart(startRaw),
    ...(endRaw !== undefined ? { end: splitPart(endRaw) } : {}),
  }
}

function parseDate(value: string): Date | undefined {
  if (!value) return undefined
  const parsed = parse(value, DATE_FORMAT, new Date())
  return isValid(parsed) ? parsed : undefined
}

function formatPart(part: DatePart, includeTime: boolean): string {
  if (!part.date) return ""
  if (!includeTime) return part.date
  return `${part.date}T${part.time || DEFAULT_TIME}`
}

function joinAnswer(
  start: DatePart,
  end: DatePart | undefined,
  range: boolean,
  includeTime: boolean
): string {
  const startValue = formatPart(start, includeTime)
  if (!range) return startValue
  if (!end?.date) return startValue
  return `${startValue}${RANGE_SEPARATOR}${formatPart(end, includeTime)}`
}

function isSelectPopupEvent(event: Event): boolean {
  const target = event.target
  if (!(target instanceof Element)) return false
  return Boolean(
    target.closest("[data-slot='select-content'], [data-slot='select-trigger']")
  )
}

function padSegment(value: string, size: number): string {
  return value.padStart(size, "0")
}

function clampSegment(value: string, max: number): string {
  if (value.length !== 2) return value
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return value
  return padSegment(String(Math.min(Math.max(numeric, 0), max)), 2)
}

function DateSegmentInput({
  id,
  inputRef,
  "aria-label": ariaLabel,
  value,
  placeholder,
  maxLength,
  disabled,
  onValueChange,
  onComplete,
  onBackspaceEmpty,
}: Readonly<{
  id?: string
  inputRef?: React.Ref<HTMLInputElement>
  "aria-label": string
  value: string
  placeholder: string
  maxLength: number
  disabled?: boolean
  onValueChange: (value: string) => void
  onComplete: () => void
  onBackspaceEmpty: () => void
}>): React.ReactElement {
  return (
    <input
      ref={inputRef}
      id={id}
      aria-label={ariaLabel}
      data-slot="input-group-control"
      className={cn(
        "h-7 min-w-0 appearance-none border-0 bg-transparent text-center text-sm tabular-nums shadow-none ring-0 outline-none placeholder:text-muted-foreground focus:border-0 focus:shadow-none focus:ring-0 focus:outline-none focus-visible:border-0 focus-visible:shadow-none focus-visible:ring-0 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        maxLength === 4 ? "w-10" : "w-7"
      )}
      disabled={disabled}
      inputMode="numeric"
      maxLength={maxLength}
      onChange={(event) => {
        const next = event.target.value.replace(/\D/g, "").slice(0, maxLength)
        onValueChange(next)
        if (next.length === maxLength) onComplete()
      }}
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={(event) => {
        if (event.key === "Backspace" && value.length === 0) {
          event.preventDefault()
          onBackspaceEmpty()
        }
      }}
      placeholder={placeholder}
      type="text"
      value={value}
    />
  )
}

function DateSegments({
  id,
  value,
  disabled,
  onValueChange,
  yearInputRef,
  onComplete,
  className,
}: Readonly<{
  id?: string
  value: string
  disabled?: boolean
  onValueChange: (next: string) => void
  yearInputRef?: React.RefObject<HTMLInputElement | null>
  onComplete?: () => void
  className?: string
}>): React.ReactElement {
  const parsed = parseDate(value)
  const [day, setDay] = React.useState(() =>
    parsed ? format(parsed, "dd") : ""
  )
  const [month, setMonth] = React.useState(() =>
    parsed ? format(parsed, "MM") : ""
  )
  const [year, setYear] = React.useState(() =>
    parsed ? format(parsed, "yyyy") : ""
  )

  const dayRef = React.useRef<HTMLInputElement>(null)
  const monthRef = React.useRef<HTMLInputElement>(null)
  const localYearRef = React.useRef<HTMLInputElement>(null)
  const yearRef = yearInputRef ?? localYearRef

  React.useEffect(() => {
    const next = parseDate(value)
    if (!next) {
      if (!value) {
        setDay("")
        setMonth("")
        setYear("")
      }
      return
    }
    setDay(format(next, "dd"))
    setMonth(format(next, "MM"))
    setYear(format(next, "yyyy"))
  }, [value])

  const tryCommit = (nextDay: string, nextMonth: string, nextYear: string) => {
    if (
      nextDay.length !== 2 ||
      nextMonth.length !== 2 ||
      nextYear.length !== 4
    ) {
      if (!nextDay && !nextMonth && !nextYear) onValueChange("")
      return
    }
    const candidate = `${nextYear}-${nextMonth}-${nextDay}`
    const date = parseDate(candidate)
    if (!date) return
    onValueChange(format(date, DATE_FORMAT))
  }

  return (
    <div
      className={cn(
        "flex min-w-0 items-center justify-start gap-0.5 px-2",
        className
      )}
    >
      <DateSegmentInput
        id={id}
        inputRef={dayRef}
        aria-label="Day"
        disabled={disabled}
        maxLength={2}
        onBackspaceEmpty={() => undefined}
        onComplete={() => monthRef.current?.focus()}
        onValueChange={(next) => {
          setDay(next)
          tryCommit(next, month, year)
        }}
        placeholder="dd"
        value={day}
      />
      <span className="text-muted-foreground">/</span>
      <DateSegmentInput
        inputRef={monthRef}
        aria-label="Month"
        disabled={disabled}
        maxLength={2}
        onBackspaceEmpty={() => dayRef.current?.focus()}
        onComplete={() => yearRef.current?.focus()}
        onValueChange={(next) => {
          setMonth(next)
          tryCommit(day, next, year)
        }}
        placeholder="mm"
        value={month}
      />
      <span className="text-muted-foreground">/</span>
      <DateSegmentInput
        inputRef={yearRef}
        aria-label="Year"
        disabled={disabled}
        maxLength={4}
        onBackspaceEmpty={() => monthRef.current?.focus()}
        onComplete={() => onComplete?.()}
        onValueChange={(next) => {
          setYear(next)
          tryCommit(day, month, next)
        }}
        placeholder="yyyy"
        value={year}
      />
    </div>
  )
}

function TimeSegment({
  inputRef,
  "aria-label": ariaLabel,
  optionsLabel,
  value,
  placeholder,
  max,
  disabled,
  items,
  onValueChange,
  onComplete,
  onBackspaceEmpty,
}: Readonly<{
  inputRef?: React.Ref<HTMLInputElement>
  "aria-label": string
  optionsLabel: string
  value: string
  placeholder: string
  max: number
  disabled?: boolean
  items: readonly string[]
  onValueChange: (value: string) => void
  onComplete: () => void
  onBackspaceEmpty: () => void
}>): React.ReactElement {
  return (
    <div className="flex items-center">
      <DateSegmentInput
        inputRef={inputRef}
        aria-label={ariaLabel}
        disabled={disabled}
        maxLength={2}
        onBackspaceEmpty={onBackspaceEmpty}
        onComplete={onComplete}
        onValueChange={(next) => onValueChange(clampSegment(next, max))}
        placeholder={placeholder}
        value={value}
      />
      <Select
        disabled={disabled}
        value={value.length === 2 ? value : null}
        onValueChange={(next) => {
          if (next == null) return
          onValueChange(next)
          onComplete()
        }}
      >
        <SelectTrigger
          size="sm"
          aria-label={optionsLabel}
          className="h-7 w-6 shrink-0 border-0 bg-transparent px-0 shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent dark:hover:bg-transparent"
        />
        <SelectContent
          alignItemWithTrigger={false}
          className="max-h-60 min-w-16"
        >
          {items.map((item) => (
            <SelectItem key={item} value={item}>
              {item}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function TimeSegments({
  value,
  disabled,
  onValueChange,
  hourInputRef,
  onHourBackspaceEmpty,
  label,
}: Readonly<{
  value: string
  disabled?: boolean
  onValueChange: (time: string) => void
  hourInputRef?: React.RefObject<HTMLInputElement | null>
  onHourBackspaceEmpty?: () => void
  label?: string
}>): React.ReactElement {
  const [hour, setHour] = React.useState(() =>
    value.length >= 2 ? value.slice(0, 2) : ""
  )
  const [minute, setMinute] = React.useState(() =>
    value.length >= 5 ? value.slice(3, 5) : ""
  )
  const localHourRef = React.useRef<HTMLInputElement>(null)
  const hourRef = hourInputRef ?? localHourRef
  const minuteRef = React.useRef<HTMLInputElement>(null)
  const hourLabel = label ? `${label} hour` : "Hour"
  const minuteLabel = label ? `${label} minute` : "Minute"

  React.useEffect(() => {
    setHour(value.length >= 2 ? value.slice(0, 2) : "")
    setMinute(value.length >= 5 ? value.slice(3, 5) : "")
  }, [value])

  const tryCommit = (nextHour: string, nextMinute: string) => {
    if (nextHour.length !== 2 || nextMinute.length !== 2) return
    onValueChange(`${nextHour}:${nextMinute}`)
  }

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <TimeSegment
        inputRef={hourRef}
        aria-label={hourLabel}
        disabled={disabled}
        items={HOURS}
        max={23}
        onBackspaceEmpty={() => onHourBackspaceEmpty?.()}
        onComplete={() => minuteRef.current?.focus()}
        onValueChange={(next) => {
          setHour(next)
          if (next.length === 2) {
            tryCommit(next, minute.length === 2 ? minute : "00")
          }
        }}
        optionsLabel={`${hourLabel} options`}
        placeholder="HH"
        value={hour}
      />
      <span className="text-muted-foreground">:</span>
      <TimeSegment
        inputRef={minuteRef}
        aria-label={minuteLabel}
        disabled={disabled}
        items={MINUTES}
        max={59}
        onBackspaceEmpty={() => hourRef.current?.focus()}
        onComplete={() => undefined}
        onValueChange={(next) => {
          setMinute(next)
          if (next.length === 2) {
            tryCommit(hour.length === 2 ? hour : "09", next)
          }
        }}
        optionsLabel={`${minuteLabel} options`}
        placeholder="MM"
        value={minute}
      />
    </div>
  )
}

function DatePicker({
  className,
  value = "",
  onValueChange,
  includeTime = false,
  range = false,
  quickSelect = false,
  disabled,
  id,
  placeholder,
}: DatePickerProps): React.ReactElement {
  const parsed = parseAnswer(value)
  const startDate = parseDate(parsed.start.date)
  const endDate = parseDate(parsed.end?.date ?? "")
  const startDateKey = parsed.start.date
  const [month, setMonth] = React.useState<Date>(() => startDate ?? new Date())
  const [open, setOpen] = React.useState(false)
  const startYearRef = React.useRef<HTMLInputElement>(null)
  const startHourRef = React.useRef<HTMLInputElement>(null)
  const endYearRef = React.useRef<HTMLInputElement>(null)
  const endHourRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    const next = parseDate(startDateKey)
    if (next) setMonth(next)
  }, [startDateKey])

  const commit = (start: DatePart, end?: DatePart) => {
    onValueChange(joinAnswer(start, end, range, includeTime))
  }

  const applySingleDate = (next: Date, time = parsed.start.time) => {
    const date = format(next, DATE_FORMAT)
    commit({ date, time }, parsed.end)
    setMonth(next)
    if (!range) setOpen(false)
  }

  const applyRange = (
    next: DateRange | undefined,
    options?: { close?: boolean }
  ) => {
    if (!next?.from) {
      onValueChange("")
      return
    }
    const start = {
      date: format(next.from, DATE_FORMAT),
      time: parsed.start.time,
    }
    const end = next.to
      ? { date: format(next.to, DATE_FORMAT), time: parsed.end?.time ?? "" }
      : undefined
    commit(start, end)
    setMonth(next.to ?? next.from)
    const rangeComplete =
      next.to !== undefined && !isSameDay(next.from, next.to)
    if (options?.close || rangeComplete) setOpen(false)
  }

  const handleStartDateSegments = (nextDate: string) => {
    if (!nextDate) {
      if (range && parsed.end?.date) {
        commit({ date: "", time: "" }, parsed.end)
        return
      }
      onValueChange("")
      return
    }
    const next = parseDate(nextDate)
    if (!next) return
    commit(
      {
        date: nextDate,
        time: parsed.start.time || (includeTime ? DEFAULT_TIME : ""),
      },
      parsed.end
    )
    setMonth(next)
  }

  const handleEndDateSegments = (nextDate: string) => {
    if (!nextDate) {
      commit(parsed.start, undefined)
      return
    }
    const next = parseDate(nextDate)
    if (!next) return
    const start =
      parsed.start.date.length > 0
        ? parsed.start
        : {
            date: nextDate,
            time: parsed.start.time || (includeTime ? DEFAULT_TIME : ""),
          }
    commit(start, {
      date: nextDate,
      time: parsed.end?.time || (includeTime ? DEFAULT_TIME : ""),
    })
    setMonth(next)
  }

  const handleStartTime = (time: string) => {
    if (!parsed.start.date) {
      applySingleDate(new Date(), time)
      return
    }
    commit({ date: parsed.start.date, time }, parsed.end)
  }

  const handleEndTime = (time: string) => {
    if (!parsed.start.date && !parsed.end?.date) {
      const todayDate = format(new Date(), DATE_FORMAT)
      commit(
        {
          date: todayDate,
          time: parsed.start.time || DEFAULT_TIME,
        },
        { date: todayDate, time }
      )
      return
    }
    commit(parsed.start, {
      date: parsed.end?.date || parsed.start.date,
      time,
    })
  }

  const emptyLabel = placeholder ?? (range ? "Select dates" : "Select date")

  const singlePresets = [
    { label: "Today", date: new Date() },
    { label: "Yesterday", date: subDays(new Date(), 1) },
    { label: "Last week", date: subDays(new Date(), 7) },
    { label: "Last month", date: subMonths(new Date(), 1) },
    { label: "Last year", date: subYears(new Date(), 1) },
  ]

  const today = new Date()
  const rangePresets = [
    { label: "Today", from: today, to: today },
    {
      label: "Yesterday",
      from: subDays(today, 1),
      to: subDays(today, 1),
    },
    { label: "Last 7 days", from: subDays(today, 6), to: today },
    { label: "Last 30 days", from: subDays(today, 29), to: today },
    { label: "Last year", from: subYears(today, 1), to: today },
  ]

  return (
    <div className={cn("w-full min-w-0", className)}>
      <Popover
        open={open}
        onOpenChange={(next, details) => {
          if (
            !next &&
            (details.reason === "outside-press" ||
              details.reason === "focus-out") &&
            isSelectPopupEvent(details.event)
          ) {
            details.cancel()
            return
          }
          setOpen(next)
        }}
      >
        <div className="flex w-full min-w-0 flex-col gap-2">
          <InputGroup
            className="focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
            data-disabled={disabled ? true : undefined}
          >
            <DateSegments
              id={id}
              className={includeTime ? "flex-none" : "flex-1"}
              value={parsed.start.date}
              disabled={disabled}
              yearInputRef={startYearRef}
              onComplete={
                includeTime ? () => startHourRef.current?.focus() : undefined
              }
              onValueChange={handleStartDateSegments}
            />
            {includeTime ? (
              <div className="flex shrink-0 items-center gap-1 pr-1">
                <HugeiconsIcon
                  icon={Clock01Icon}
                  strokeWidth={2}
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <TimeSegments
                  label={range ? "Start" : undefined}
                  value={parsed.start.time}
                  disabled={disabled}
                  hourInputRef={startHourRef}
                  onHourBackspaceEmpty={() => startYearRef.current?.focus()}
                  onValueChange={handleStartTime}
                />
              </div>
            ) : null}
            <InputGroupAddon align="inline-end" className="ml-auto">
              <PopoverTrigger
                aria-label={emptyLabel}
                disabled={disabled}
                render={
                  <InputGroupButton
                    aria-label="Open calendar"
                    disabled={disabled}
                    size="icon-xs"
                    variant="ghost"
                  />
                }
              >
                <HugeiconsIcon
                  icon={Calendar03Icon}
                  strokeWidth={2}
                  aria-hidden="true"
                />
              </PopoverTrigger>
            </InputGroupAddon>
          </InputGroup>
          {range ? (
            <InputGroup
              className="focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
              data-disabled={disabled ? true : undefined}
            >
              <DateSegments
                className={includeTime ? "flex-none" : "flex-1"}
                value={parsed.end?.date ?? ""}
                disabled={disabled}
                yearInputRef={endYearRef}
                onComplete={
                  includeTime ? () => endHourRef.current?.focus() : undefined
                }
                onValueChange={handleEndDateSegments}
              />
              {includeTime ? (
                <div className="flex shrink-0 items-center gap-1 pr-2">
                  <HugeiconsIcon
                    icon={Clock01Icon}
                    strokeWidth={2}
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                  <TimeSegments
                    label="End"
                    value={parsed.end?.time ?? ""}
                    disabled={disabled}
                    hourInputRef={endHourRef}
                    onHourBackspaceEmpty={() => endYearRef.current?.focus()}
                    onValueChange={handleEndTime}
                  />
                </div>
              ) : null}
            </InputGroup>
          ) : null}
        </div>
        <PopoverContent
          align="start"
          alignOffset={-4}
          className={cn("p-3", quickSelect ? "w-[26rem]" : "w-[18.25rem]")}
          sideOffset={8}
        >
          <div className="flex w-full min-w-0 flex-col gap-3">
            <div
              className={cn(
                "grid w-full min-w-0",
                quickSelect
                  ? "grid-cols-[7.5rem_minmax(0,1fr)] gap-0 max-sm:grid-cols-1"
                  : "grid-cols-1"
              )}
            >
              {quickSelect ? (
                <div className="relative min-w-0 max-sm:order-1 max-sm:border-t max-sm:pt-3 sm:border-e sm:pe-3">
                  <div className="flex h-full w-full min-w-0 flex-col gap-0.5">
                    {range
                      ? rangePresets.map((preset) => (
                          <Button
                            key={preset.label}
                            className="w-full min-w-0 justify-start overflow-hidden"
                            onClick={() => {
                              applyRange(
                                { from: preset.from, to: preset.to },
                                { close: true }
                              )
                            }}
                            size="sm"
                            variant="ghost"
                          >
                            <span className="truncate">{preset.label}</span>
                          </Button>
                        ))
                      : singlePresets.map((preset) => (
                          <Button
                            key={preset.label}
                            className="w-full min-w-0 justify-start overflow-hidden"
                            onClick={() => applySingleDate(preset.date)}
                            size="sm"
                            variant="ghost"
                          >
                            <span className="truncate">{preset.label}</span>
                          </Button>
                        ))}
                  </div>
                </div>
              ) : null}
              <div className="min-w-0 justify-self-center">
                {range ? (
                  <Calendar
                    mode="range"
                    month={month}
                    onMonthChange={setMonth}
                    onSelect={(next) => applyRange(next)}
                    selected={
                      startDate ? { from: startDate, to: endDate } : undefined
                    }
                  />
                ) : (
                  <Calendar
                    mode="single"
                    month={month}
                    onMonthChange={setMonth}
                    onSelect={(next) => {
                      if (!next) {
                        onValueChange("")
                        return
                      }
                      applySingleDate(next)
                    }}
                    selected={startDate}
                  />
                )}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

export { DatePicker }
