"use client"

import { useId, useState, type ComponentProps, type FocusEvent } from "react"

import {
  Group,
  GroupSeparator,
  GroupText,
} from "@workspace/ui/components/group"
import { Input } from "@workspace/ui/components/input"
import { cn } from "@workspace/ui/lib/utils"

export type NumberFieldProps = Omit<
  ComponentProps<"input">,
  "type" | "value" | "onChange"
> & {
  value?: number | null
  onValueChange: (value: number | null) => void
  suffix?: string
}

export function normalizeDecimalInput(raw: string): string {
  let negative = false
  let body = ""
  for (const char of raw) {
    if (char === "-") {
      if (body.length === 0 && !negative) negative = true
      continue
    }
    if (char === "," || char === ".") {
      body += "."
      continue
    }
    if (char >= "0" && char <= "9") body += char
  }
  const firstDot = body.indexOf(".")
  if (firstDot === -1) return `${negative ? "-" : ""}${body}`
  const integer = body.slice(0, firstDot).replaceAll(".", "")
  const fraction = body.slice(firstDot + 1).replaceAll(".", "")
  return `${negative ? "-" : ""}${integer}.${fraction}`
}

export function parseDecimalInput(text: string): number | null {
  if (text === "" || text === "-" || text === "." || text === "-.") return null
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}

function NumberField({
  className,
  value,
  onValueChange,
  suffix,
  id,
  onBlur,
  ...props
}: NumberFieldProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const unitId = `${inputId}-unit`
  const [draft, setDraft] = useState<string | null>(null)
  const [prevValue, setPrevValue] = useState(value)
  if (value !== prevValue) {
    setPrevValue(value)
    if (draft !== null && parseDecimalInput(draft) !== value) {
      setDraft(null)
    }
  }
  const display = draft ?? (value == null ? "" : String(value))
  const handleChange = (next: string) => {
    const normalized = normalizeDecimalInput(next)
    setDraft(normalized)
    onValueChange(parseDecimalInput(normalized))
  }
  const field = {
    type: "text" as const,
    inputMode: "decimal" as const,
    autoComplete: "off",
    spellCheck: false,
    "data-slot": "number-field",
    value: display,
    onChange: (event: { currentTarget: { value: string } }) => {
      handleChange(event.currentTarget.value)
    },
    onBlur: (event: FocusEvent<HTMLInputElement>) => {
      setDraft(null)
      onBlur?.(event)
    },
  }
  if (!suffix) {
    return (
      <Input
        {...props}
        id={id}
        className={cn("w-full min-w-0", className)}
        {...field}
      />
    )
  }
  return (
    <Group className={cn("w-full max-w-full min-w-0", className)}>
      <Input
        {...props}
        id={inputId}
        className="min-w-0 flex-1 text-right"
        aria-describedby={unitId}
        {...field}
      />
      <GroupSeparator />
      <GroupText
        id={unitId}
        className="max-w-[40%] shrink-0 cursor-text truncate"
        onClick={(event) => {
          event.currentTarget.parentElement?.querySelector("input")?.focus()
        }}
      >
        {suffix}
      </GroupText>
    </Group>
  )
}

export { NumberField }
