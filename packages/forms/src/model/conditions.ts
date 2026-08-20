import { isOtherSentinel } from "./other"
import {
  isQuestion,
  type FormAnswers,
  type FormAnswerValue,
  type FormConditionGroup,
  type FormConditionRule,
  type FormNode,
  type FormQuestion,
  type FormTemplate,
} from "./types"
import { flattenQuestions } from "./walk"

export function answerAsComparable(
  value: FormAnswerValue | undefined
): string | null {
  if (value === undefined || value === null) return null
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (trimmed.length === 0 || isOtherSentinel(trimmed)) return null
    return trimmed
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }
  return null
}

export function isRuleSatisfied(
  rule: FormConditionRule,
  answers: FormAnswers
): boolean {
  const current = answerAsComparable(answers[rule.fieldKey])
  switch (rule.op) {
    case "eq":
      return typeof rule.value === "string" && current === rule.value
    case "neq":
      return typeof rule.value === "string" && current !== rule.value
    case "in": {
      const list = Array.isArray(rule.value)
        ? rule.value
        : typeof rule.value === "string"
          ? [rule.value]
          : []
      return current !== null && list.includes(current)
    }
    case "not_in": {
      const list = Array.isArray(rule.value)
        ? rule.value
        : typeof rule.value === "string"
          ? [rule.value]
          : []
      return current === null || !list.includes(current)
    }
    case "is_set":
      return current !== null
    case "is_empty":
      return current === null
    case "gt": {
      const expected = Number(rule.value)
      const actual = Number(current)
      return (
        Number.isFinite(expected) &&
        Number.isFinite(actual) &&
        actual > expected
      )
    }
    case "lt": {
      const expected = Number(rule.value)
      const actual = Number(current)
      return (
        Number.isFinite(expected) &&
        Number.isFinite(actual) &&
        actual < expected
      )
    }
    default:
      return true
  }
}

export function isConditionSatisfied(
  group: FormConditionGroup | undefined,
  answers: FormAnswers
): boolean {
  if (!group || group.rules.length === 0) return true
  if (group.match === "any") {
    return group.rules.some((rule) => isRuleSatisfied(rule, answers))
  }
  return group.rules.every((rule) => isRuleSatisfied(rule, answers))
}

export function isNodeVisible(node: FormNode, answers: FormAnswers): boolean {
  return isConditionSatisfied(node.condition, answers)
}

export function visibilitySourceQuestions(form: FormTemplate): FormQuestion[] {
  return flattenQuestions(form).filter(
    (question) =>
      question.kind === "select" ||
      question.kind === "multi_select" ||
      question.kind === "autocomplete" ||
      question.kind === "cascader" ||
      question.kind === "boolean" ||
      question.kind === "reference" ||
      question.kind === "number" ||
      question.kind === "short_text"
  )
}

export function visibleInputQuestions(
  form: FormTemplate,
  answers: FormAnswers
): FormQuestion[] {
  const visible: FormQuestion[] = []
  for (const page of form.pages) {
    collectVisible(page.nodes, answers, visible)
  }
  return visible
}

function collectVisible(
  nodes: readonly FormNode[],
  answers: FormAnswers,
  into: FormQuestion[]
): void {
  for (const node of nodes) {
    if (!isNodeVisible(node, answers)) continue
    if (!isQuestion(node)) continue
    if (node.kind === "repeater") {
      into.push(node)
      continue
    }
    into.push(node)
  }
}
