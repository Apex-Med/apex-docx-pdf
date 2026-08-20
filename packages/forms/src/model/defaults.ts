import { DATE_RANGE_SEPARATOR, normalizeStoredDateAnswer } from "./dates"
import { isKnownChoiceValue, isOtherSentinel, knownChoiceValues } from "./other"
import {
  DATE_DEFAULT_TODAY,
  type FormAnswerValue,
  type FormQuestion,
  type FormQuestionKind,
} from "./types"

export function questionSupportsDefaultAnswer(kind: FormQuestionKind): boolean {
  switch (kind) {
    case "short_text":
    case "long_text":
    case "number":
    case "date":
    case "boolean":
    case "select":
    case "multi_select":
    case "autocomplete":
    case "cascader":
    case "reference":
      return true
    case "attachment":
    case "repeater":
    case "context":
      return false
  }
}

export function hasDefaultAnswer(question: FormQuestion): boolean {
  return normalizeDefaultValue(question) !== undefined
}

export function isTodayDateDefault(
  value: FormAnswerValue | undefined
): boolean {
  return value === DATE_DEFAULT_TODAY
}

export function formatLocalDateInput(now: Date, includeTime: boolean): string {
  const year = String(now.getFullYear())
  const month = pad2(now.getMonth() + 1)
  const day = pad2(now.getDate())
  if (!includeTime) return `${year}-${month}-${day}`
  return `${year}-${month}-${day}T${pad2(now.getHours())}:${pad2(now.getMinutes())}`
}

export function resolveDefaultValue(
  question: FormQuestion,
  now: Date = new Date()
): FormAnswerValue | undefined {
  const value = normalizeDefaultValue(question)
  if (question.kind === "date" && isTodayDateDefault(value)) {
    const day = formatLocalDateInput(now, question.includeTime === true)
    return question.dateRange === true
      ? `${day}${DATE_RANGE_SEPARATOR}${day}`
      : day
  }
  return value
}

export function coerceDefaultFromSource(
  kind: FormQuestionKind,
  source: FormQuestion | null
): FormAnswerValue | undefined {
  if (!source || source.defaultValue === undefined) return undefined
  const value = source.defaultValue
  if (isTodayDateDefault(value) && kind !== "date") return undefined
  if (
    kind === "multi_select" &&
    typeof value === "string" &&
    value.length > 0
  ) {
    return [value]
  }
  if (
    (kind === "select" || kind === "autocomplete" || kind === "cascader") &&
    Array.isArray(value) &&
    value.every((item) => typeof item === "string")
  ) {
    return value.find((item) => item.length > 0)
  }
  return value
}

export function normalizeDefaultValue(
  question: FormQuestion
): FormAnswerValue | undefined {
  if (!questionSupportsDefaultAnswer(question.kind)) return undefined
  const value = question.defaultValue
  if (value === undefined || value === null) return undefined

  switch (question.kind) {
    case "short_text":
    case "long_text":
    case "reference": {
      if (typeof value !== "string") return undefined
      return value.trim().length > 0 ? value : undefined
    }
    case "date": {
      if (typeof value !== "string") return undefined
      const trimmed = value.trim()
      if (trimmed.length === 0) return undefined
      return normalizeStoredDateAnswer(trimmed, {
        includeTime: question.includeTime === true,
        dateRange: question.dateRange === true,
      })
    }
    case "number":
      return typeof value === "number" && Number.isFinite(value)
        ? value
        : undefined
    case "boolean":
      return typeof value === "boolean" ? value : undefined
    case "select":
    case "autocomplete":
    case "cascader": {
      if (typeof value !== "string" || value.length === 0) return undefined
      if (isKnownChoiceValue(value, question.options)) return value
      if (
        question.allowOther === true &&
        !isOtherSentinel(value) &&
        value.trim().length > 0
      ) {
        return value
      }
      return undefined
    }
    case "multi_select": {
      if (
        !Array.isArray(value) ||
        !value.every((item) => typeof item === "string")
      ) {
        return undefined
      }
      const allowed = knownChoiceValues(question.options)
      const kept = value.filter((item) => {
        if (allowed.has(item)) return true
        return (
          question.allowOther === true &&
          !isOtherSentinel(item) &&
          item.trim().length > 0
        )
      })
      return kept.length > 0 ? kept : undefined
    }
    default:
      return undefined
  }
}

export function questionWithNormalizedDefault(
  question: FormQuestion
): FormQuestion {
  const defaultValue = normalizeDefaultValue(question)
  if (defaultValue === undefined) {
    if (!("defaultValue" in question)) return question
    const { defaultValue: _removed, ...rest } = question
    return rest
  }
  if (sameAnswer(question.defaultValue, defaultValue)) return question
  return { ...question, defaultValue }
}

function pad2(value: number): string {
  return String(value).padStart(2, "0")
}

function sameAnswer(
  left: FormAnswerValue | undefined,
  right: FormAnswerValue | undefined
): boolean {
  if (left === right) return true
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((item, index) => item === right[index])
    )
  }
  return false
}
