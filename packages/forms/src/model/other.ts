import { flattenChoiceOptions } from "./options"
import { OTHER_OPTION_VALUE, type FormOption } from "./types"

export function isOtherSentinel(value: string | undefined | null): boolean {
  return value === OTHER_OPTION_VALUE
}

export function knownChoiceValues(
  options: readonly FormOption[] | undefined
): Set<string> {
  return new Set(
    flattenChoiceOptions(options ?? []).map((option) => option.value)
  )
}

export function isKnownChoiceValue(
  value: string,
  options: readonly FormOption[] | undefined
): boolean {
  return knownChoiceValues(options).has(value)
}

export function isUnresolvedOtherValue(
  value: string | undefined | null
): boolean {
  if (typeof value !== "string") return false
  return isOtherSentinel(value.trim())
}

export function otherTextFromSelectValue(
  value: string | undefined,
  options: readonly FormOption[] | undefined
): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    isOtherSentinel(value)
  ) {
    return ""
  }
  if (isKnownChoiceValue(value, options)) return ""
  return value
}

export function isOtherSelectedValue(
  value: string | undefined,
  options: readonly FormOption[] | undefined,
  allowOther: boolean
): boolean {
  if (!allowOther || typeof value !== "string" || value.length === 0)
    return false
  return isOtherSentinel(value) || !isKnownChoiceValue(value, options)
}

export function selectValueForControl(
  value: string | undefined,
  options: readonly FormOption[] | undefined,
  allowOther: boolean
): string {
  if (typeof value !== "string" || value.length === 0) return ""
  if (isKnownChoiceValue(value, options)) return value
  if (allowOther) return OTHER_OPTION_VALUE
  return value
}

export function commitOtherText(text: string): string {
  return text.length === 0 ? OTHER_OPTION_VALUE : text
}

export function splitMultiSelectValues(
  selected: readonly string[],
  options: readonly FormOption[] | undefined
): { known: string[]; otherSelected: boolean; otherText: string } {
  const allowed = knownChoiceValues(options)
  const known: string[] = []
  let otherSelected = false
  let otherText = ""
  for (const item of selected) {
    if (allowed.has(item)) {
      known.push(item)
      continue
    }
    otherSelected = true
    if (!isOtherSentinel(item) && item.length > 0 && otherText.length === 0) {
      otherText = item
    }
  }
  return { known, otherSelected, otherText }
}

export function joinMultiSelectValues(
  known: readonly string[],
  otherSelected: boolean,
  otherText: string
): string[] {
  if (!otherSelected) return [...known]
  return [...known, otherText.length === 0 ? OTHER_OPTION_VALUE : otherText]
}

export function resolvedChoiceStrings(value: readonly string[]): string[] {
  return value.filter(
    (item) => item.trim().length > 0 && !isOtherSentinel(item)
  )
}
