import { isOtherSentinel, resolvedChoiceStrings } from "../model/other"
import {
  isQuestion,
  type FormAnswers,
  type FormAnswerValue,
  type FormQuestion,
  type FormRepeaterRow,
  type FormTemplate,
} from "../model/types"
import { walkNodes } from "../model/walk"
import { questionTagId, type BoundTagKind } from "./types"

export type TagValue =
  | Readonly<{ kind: "string"; value: string }>
  | Readonly<{ kind: "number"; value: number }>
  | Readonly<{ kind: "date"; value: string }>

export type TagValues = Readonly<Record<string, TagValue>>

export function answersToTagValues(
  form: FormTemplate,
  answers: FormAnswers
): TagValues {
  const values: Record<string, TagValue> = {}
  walkNodes(form, ({ node }) => {
    if (!isQuestion(node)) return
    const answer = answers[node.key]
    const mapped = mapAnswer(node, answer)
    if (mapped) values[questionTagId(node.key)] = mapped
  })
  return values
}

export function answersToTemplateData(
  form: FormTemplate,
  answers: FormAnswers
): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  for (const page of form.pages) {
    for (const node of page.nodes) {
      if (!isQuestion(node)) continue
      data[node.key] = toTemplateValue(node, answers[node.key])
    }
  }
  return data
}

function mapAnswer(
  question: FormQuestion,
  value: FormAnswerValue | undefined
): TagValue | null {
  if (value === undefined || value === null) return null
  if (question.kind === "number" && typeof value === "number") {
    return { kind: "number", value }
  }
  if (question.kind === "date" && typeof value === "string" && value.length > 0) {
    return { kind: "date", value }
  }
  if (typeof value === "boolean") {
    return { kind: "string", value: value ? "Yes" : "No" }
  }
  if (typeof value === "string") {
    const kind: BoundTagKind = question.kind === "date" ? "date" : "string"
    if (value.length === 0 || isOtherSentinel(value)) return null
    return kind === "date"
      ? { kind: "date", value }
      : { kind: "string", value }
  }
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === "string")) {
      const parts = resolvedChoiceStrings(value)
      if (parts.length === 0) return null
      return { kind: "string", value: parts.join(", ") }
    }
    if (
      question.kind === "repeater" &&
      value.every((item) => item !== null && typeof item === "object")
    ) {
      return {
        kind: "string",
        value: `${value.length} ${value.length === 1 ? "row" : "rows"}`,
      }
    }
  }
  return null
}

function toTemplateValue(
  question: FormQuestion,
  value: FormAnswerValue | undefined
): unknown {
  if (value === undefined || value === null) return question.kind === "boolean" ? false : ""
  if (typeof value === "string") {
    return isOtherSentinel(value) ? "" : value
  }
  if (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string")
  ) {
    return resolvedChoiceStrings(value)
  }
  if (question.kind === "repeater" && Array.isArray(value)) {
    return (value as FormRepeaterRow[]).map((row) => {
      const object: Record<string, unknown> = {}
      for (const child of question.children ?? []) {
        if (!isQuestion(child)) continue
        object[child.key] = toTemplateValue(child, row[child.key])
      }
      return object
    })
  }
  return value
}
