import { isNodeVisible, visibleInputQuestions } from "./conditions"
import { isCompleteDateAnswer } from "./dates"
import { resolveDefaultValue } from "./defaults"
import { flattenChoiceOptions } from "./options"
import { isOtherSentinel, isUnresolvedOtherValue, resolvedChoiceStrings } from "./other"
import {
  isLayoutBlock,
  isQuestion,
  type FormAnswers,
  type FormAnswerValue,
  type FormFileValue,
  type FormNode,
  type FormOption,
  type FormQuestion,
  type FormRepeaterRow,
  type FormTemplate,
} from "./types"

export type FieldErrors = Record<string, string>

export type ValidationResult = Readonly<{
  ok: boolean
  errors: FieldErrors
}>

function allowedChoiceValues(options: readonly FormOption[]): string[] {
  return flattenChoiceOptions(options).map((option) => option.value)
}

function isEmptyValue(value: FormAnswerValue | undefined): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed.length === 0 || isOtherSentinel(trimmed)
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return true
    if (value.every((item) => typeof item === "string")) {
      return resolvedChoiceStrings(value).length === 0
    }
    return false
  }
  return false
}

function isStringArray(value: FormAnswerValue): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

function isFileArray(value: FormAnswerValue): value is readonly FormFileValue[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item !== null &&
        typeof item === "object" &&
        !Array.isArray(item) &&
        typeof (item as FormFileValue).id === "string" &&
        typeof (item as FormFileValue).name === "string"
    )
  )
}

function isRepeaterRows(
  value: FormAnswerValue
): value is readonly FormRepeaterRow[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) => item !== null && typeof item === "object" && !Array.isArray(item)
    ) &&
    !isStringArray(value) &&
    !isFileArray(value)
  )
}

function errorPath(prefix: string, key: string): string {
  return prefix.length === 0 ? key : `${prefix}.${key}`
}

function validateQuestion(
  question: FormQuestion,
  value: FormAnswerValue | undefined,
  errors: FieldErrors,
  path: string
): void {
  const label = question.label
  const key = path

  if (question.required && isEmptyValue(value)) {
    errors[key] = `${label} is required`
    return
  }
  if (value === undefined || value === null || value === "") return

  switch (question.kind) {
    case "short_text":
    case "long_text":
    case "reference":
    case "select":
    case "autocomplete":
    case "cascader":
    case "context": {
      if (typeof value !== "string") {
        errors[key] = `${label} must be text`
        return
      }
      if (
        (question.kind === "select" || question.kind === "autocomplete") &&
        isUnresolvedOtherValue(value)
      ) {
        errors[key] = `${label} requires a custom value`
        return
      }
      const trimmed = value.trim()
      if (
        question.validation?.minLength !== undefined &&
        trimmed.length < question.validation.minLength
      ) {
        errors[key] =
          `${label} must be at least ${question.validation.minLength} characters`
      }
      if (
        question.validation?.maxLength !== undefined &&
        trimmed.length > question.validation.maxLength
      ) {
        errors[key] =
          `${label} must be at most ${question.validation.maxLength} characters`
      }
      if (
        (question.kind === "select" ||
          question.kind === "autocomplete" ||
          question.kind === "cascader") &&
        question.options &&
        !question.allowOther &&
        !allowedChoiceValues(question.options).includes(value)
      ) {
        errors[key] = `${label} has an invalid option`
      }
      if (
        question.kind === "reference" &&
        question.reference?.allowedIds &&
        question.reference.allowedIds.length > 0 &&
        !question.reference.allowedIds.includes(value)
      ) {
        errors[key] = `${label} is not an allowed option`
      }
      return
    }
    case "date": {
      if (typeof value !== "string") {
        errors[key] = `${label} must be a date`
        return
      }
      if (
        !isCompleteDateAnswer(value, {
          includeTime: question.includeTime === true,
          dateRange: question.dateRange === true,
        })
      ) {
        errors[key] =
          question.dateRange === true
            ? `${label} needs a start and end date`
            : question.includeTime === true
              ? `${label} needs a date and time`
              : `${label} must be a date`
      }
      return
    }
    case "number": {
      if (typeof value !== "number" || Number.isNaN(value)) {
        errors[key] = `${label} must be a number`
        return
      }
      if (
        question.validation?.min !== undefined &&
        value < question.validation.min
      ) {
        errors[key] = `${label} must be at least ${question.validation.min}`
      }
      if (
        question.validation?.max !== undefined &&
        value > question.validation.max
      ) {
        errors[key] = `${label} must be at most ${question.validation.max}`
      }
      return
    }
    case "boolean": {
      if (typeof value !== "boolean") {
        errors[key] = `${label} must be yes or no`
      }
      return
    }
    case "multi_select": {
      if (!isStringArray(value)) {
        errors[key] = `${label} must be a list of options`
        return
      }
      if (value.some((item) => isUnresolvedOtherValue(item))) {
        errors[key] = `${label} requires a custom value`
        return
      }
      if (!question.allowOther) {
        const allowed = new Set((question.options ?? []).map((option) => option.value))
        if (value.some((item) => !allowed.has(item))) {
          errors[key] = `${label} has an invalid option`
        }
      }
      return
    }
    case "attachment": {
      if (!isFileArray(value) && typeof value !== "string") {
        errors[key] = `${label} must be a file`
      }
      return
    }
    case "repeater": {
      if (!isRepeaterRows(value)) {
        errors[key] = `${label} must be a list of rows`
        return
      }
      value.forEach((row, index) => {
        for (const child of question.children ?? []) {
          if (!isQuestion(child) || isLayoutBlock(child)) continue
          if (!isNodeVisible(child, row as FormAnswers)) continue
          validateQuestion(
            child,
            row[child.key],
            errors,
            `${key}[${index}].${child.key}`
          )
        }
      })
      return
    }
    default:
      return
  }
}

export function validateAnswers(
  form: FormTemplate,
  answers: FormAnswers
): ValidationResult {
  const errors: FieldErrors = {}
  for (const question of visibleInputQuestions(form, answers)) {
    validateQuestion(question, answers[question.key], errors, question.key)
  }
  return { ok: Object.keys(errors).length === 0, errors }
}

export function emptyAnswerForQuestion(
  question: FormQuestion
): FormAnswerValue {
  switch (question.kind) {
    case "multi_select":
    case "attachment":
    case "repeater":
      return []
    case "boolean":
      return null
    case "number":
      return null
    default:
      return ""
  }
}

export function buildDefaultAnswers(
  form: FormTemplate,
  now: Date = new Date()
): FormAnswers {
  const answers: FormAnswers = {}
  for (const page of form.pages) {
    for (const node of page.nodes) {
      if (!isQuestion(node) || isLayoutBlock(node)) continue
      answers[node.key] =
        resolveDefaultValue(node, now) ?? emptyAnswerForQuestion(node)
    }
  }
  return answers
}

export function emptyRepeaterRow(
  question: FormQuestion,
  now: Date = new Date()
): FormRepeaterRow {
  const row: FormRepeaterRow = {}
  for (const child of question.children ?? []) {
    if (!isQuestion(child) || isLayoutBlock(child)) continue
    row[child.key] =
      resolveDefaultValue(child, now) ?? emptyAnswerForQuestion(child)
  }
  return row
}

export function stripHiddenAnswers(
  form: FormTemplate,
  answers: FormAnswers
): FormAnswers {
  const visible = new Set(
    visibleInputQuestions(form, answers).map((question) => question.key)
  )
  const next: FormAnswers = {}
  for (const [key, value] of Object.entries(answers)) {
    if (visible.has(key)) next[key] = value
  }
  return next
}

export function fieldErrorPath(
  questionKey: string,
  nested?: string
): string {
  return nested ? errorPath(questionKey, nested) : questionKey
}

export function walkFormNodesForAnswers(
  nodes: readonly FormNode[],
  answers: FormAnswers,
  visit: (node: FormQuestion, value: FormAnswerValue | undefined) => void
): void {
  for (const node of nodes) {
    if (!isQuestion(node) || isLayoutBlock(node)) continue
    if (!isNodeVisible(node, answers)) continue
    visit(node, answers[node.key])
  }
}
