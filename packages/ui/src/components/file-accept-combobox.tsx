"use client"

import { useMemo, useState, type ReactNode } from "react"

import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxValue,
} from "@workspace/ui/components/combobox"

export type FileAcceptOption = Readonly<{
  value: string
  label: string
}>

/** Sensible defaults for clinical/document uploads. */
export const DEFAULT_FILE_ACCEPT: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/heic",
  "application/pdf",
  ".docx",
]

export const FILE_ACCEPT_OPTIONS: readonly FileAcceptOption[] = [
  { value: "image/png", label: "PNG" },
  { value: "image/jpeg", label: "JPEG" },
  { value: "image/heic", label: "HEIC" },
  { value: "application/pdf", label: "PDF" },
  { value: ".docx", label: "Word" },
  { value: ".xlsx", label: "Excel" },
  { value: "image/gif", label: "GIF" },
  { value: "image/webp", label: "WebP" },
  { value: "image/*", label: "Any image" },
  { value: "*/*", label: "Any file" },
]

type AcceptItem = FileAcceptOption & Readonly<{ creatable?: boolean }>

export type FileAcceptComboboxProps = Readonly<{
  value: readonly string[]
  onValueChange: (value: string[]) => void
  placeholder?: string
  disabled?: boolean
  id?: string
}>

function toItem(value: string): AcceptItem {
  const preset = FILE_ACCEPT_OPTIONS.find((option) => option.value === value)
  return preset ?? { value, label: value }
}

export function FileAcceptCombobox({
  value,
  onValueChange,
  placeholder = "Add file type…",
  disabled,
  id,
}: FileAcceptComboboxProps): ReactNode {
  const [query, setQuery] = useState("")
  const selected = useMemo(() => value.map(toItem), [value])

  const catalog = useMemo(() => {
    const map = new Map<string, AcceptItem>()
    for (const option of FILE_ACCEPT_OPTIONS) {
      map.set(option.value, option)
    }
    for (const item of selected) {
      map.set(item.value, item)
    }
    return [...map.values()]
  }, [selected])

  const items = useMemo(() => {
    const trimmed = query.trim()
    if (trimmed.length === 0) return catalog
    const lowered = trimmed.toLowerCase()
    const exactExists = catalog.some(
      (item) =>
        item.value.toLowerCase() === lowered ||
        item.label.toLowerCase() === lowered
    )
    if (exactExists) return catalog
    return [
      ...catalog,
      {
        value: trimmed,
        label: trimmed,
        creatable: true,
      } satisfies AcceptItem,
    ]
  }, [catalog, query])

  return (
    <div className="w-full min-w-0" style={{ width: "100%" }}>
      <Combobox
        multiple
        disabled={disabled}
        items={items}
        value={selected}
        inputValue={query}
        onInputValueChange={setQuery}
        isItemEqualToValue={(a, b) => a.value === b.value}
        onValueChange={(next) => {
          const cleaned = next
            .filter((item): item is AcceptItem => item != null)
            .map((item) => ({
              value: item.value,
              label: item.creatable ? item.value : item.label,
            }))
          onValueChange(cleaned.map((item) => item.value))
          setQuery("")
        }}
      >
        <ComboboxChips className="w-full min-w-0" style={{ width: "100%" }}>
          <ComboboxValue>
            {(selectedValue: AcceptItem[]) => (
              <>
                {selectedValue.map((item) => (
                  <ComboboxChip
                    aria-label={item.label}
                    key={item.value}
                    title={
                      item.value === item.label
                        ? item.label
                        : `${item.label} (${item.value})`
                    }
                  >
                    {item.label}
                  </ComboboxChip>
                ))}
                <ComboboxChipsInput
                  id={id}
                  aria-label="Accepted file types"
                  placeholder={
                    selectedValue.length > 0 ? undefined : placeholder
                  }
                />
              </>
            )}
          </ComboboxValue>
        </ComboboxChips>
        <ComboboxPopup>
          <ComboboxEmpty>No file types found.</ComboboxEmpty>
          <ComboboxList>
            {(item: AcceptItem) => (
              <ComboboxItem key={item.value} value={item}>
                {item.creatable ? `Add “${item.value}”` : item.label}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxPopup>
      </Combobox>
    </div>
  )
}
