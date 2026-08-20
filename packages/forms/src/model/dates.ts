import { DATE_DEFAULT_TODAY } from "./types"

export const DATE_RANGE_SEPARATOR = "/"

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

export type DateAnswerOptions = Readonly<{
  includeTime?: boolean
  dateRange?: boolean
}>

export function isDateAnswerPart(
  value: string,
  includeTime: boolean
): boolean {
  if (includeTime) return DATETIME_RE.test(value)
  return DATE_RE.test(value) || DATETIME_RE.test(value)
}

export function dateAnswerParts(value: string): readonly string[] {
  return value.split(DATE_RANGE_SEPARATOR)
}

export function stripTimeFromDatePart(part: string): string {
  const [date = part] = part.split("T")
  return date
}

export function isCompleteDateAnswer(
  value: string,
  options: DateAnswerOptions
): boolean {
  if (value === DATE_DEFAULT_TODAY) return false
  const parts = dateAnswerParts(value)
  if (options.dateRange === true) {
    return (
      parts.length === 2 &&
      parts.every((part) => isDateAnswerPart(part, options.includeTime === true))
    )
  }
  return (
    parts.length === 1 &&
    isDateAnswerPart(parts[0] ?? "", options.includeTime === true)
  )
}

export function normalizeStoredDateAnswer(
  value: string,
  options: DateAnswerOptions
): string | undefined {
  if (value === DATE_DEFAULT_TODAY) return DATE_DEFAULT_TODAY
  const parts = dateAnswerParts(value).filter((part) => part.length > 0)
  if (parts.length === 0) return undefined
  const mapped = parts.map((part) =>
    options.includeTime === true ? part : stripTimeFromDatePart(part)
  )
  if (options.dateRange === true) {
    if (mapped.length === 1) return mapped[0]
    return `${mapped[0]}${DATE_RANGE_SEPARATOR}${mapped[1]}`
  }
  return mapped[0]
}
