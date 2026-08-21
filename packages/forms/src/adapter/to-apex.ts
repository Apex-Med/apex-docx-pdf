import { flattenChoiceOptions, optionHasChildren } from "../model/options"
import {
  isLayoutBlock,
  isQuestion,
  type FormConditionGroup,
  type FormLayoutKind,
  type FormNode,
  type FormQuestion,
  type FormQuestionKind,
  type FormTemplate,
} from "../model/types"
import { flattenQuestions } from "../model/walk"
import type {
  AdapterDiagnostic,
  ApexAdapterResult,
  ApexFieldType,
  ApexFieldVisibility,
  ApexFormField,
  ApexFormPage,
  ApexLeafField,
  ApexLeafFieldType,
  ApexReferenceType,
} from "./types"

const KIND_TO_APEX: Partial<
  Record<FormQuestionKind | FormLayoutKind, ApexFieldType>
> = {
  short_text: "text",
  long_text: "textarea",
  number: "number",
  date: "date",
  boolean: "yes_no",
  select: "select",
  multi_select: "multiselect",
  autocomplete: "select",
  cascader: "select",
  reference: "reference",
  attachment: "file",
  repeater: "repeater",
  context: "reference",
  section: "section",
  heading: "heading",
}

const APEX_LEAF = new Set<ApexFieldType>([
  "text",
  "textarea",
  "number",
  "date",
  "yes_no",
  "select",
  "multiselect",
  "reference",
  "file",
])

export function toApexPages(
  form: FormTemplate
): ApexAdapterResult<readonly ApexFormPage[]> {
  const diagnostics: AdapterDiagnostic[] = []
  const pages = form.pages.map((page) => ({
    key: page.key,
    title: page.title,
    ...(page.description ? { description: page.description } : {}),
    fields: page.nodes.flatMap((node) => {
      const mapped = toApexField(node, diagnostics, 0)
      return mapped ? [mapped] : []
    }),
  }))
  return { value: pages, diagnostics }
}

export function toApexPlaceholderPaths(form: FormTemplate): readonly string[] {
  const paths = new Set<string>()
  for (const question of flattenQuestions(form)) {
    if (question.kind === "reference" || question.kind === "context") {
      paths.add(`${question.key}__text`)
      const suffixes =
        question.reference?.fields && question.reference.fields.length > 0
          ? question.reference.fields.map((field) => field.key)
          : defaultSuffixes(question)
      for (const suffix of suffixes) paths.add(`${question.key}.${suffix}`)
      continue
    }
    if (question.kind === "repeater") {
      paths.add(question.key)
      paths.add(`${question.key}__text`)
      for (const child of question.children ?? []) {
        if (isQuestion(child)) paths.add(`${question.key}[].${child.key}`)
      }
      continue
    }
    if (isLayoutBlock(question)) continue
    paths.add(question.key)
  }
  return [...paths]
}

function defaultSuffixes(question: FormQuestion): readonly string[] {
  const source = question.reference?.source ?? question.context?.binding
  if (source === "clinician" || source === "current_user") {
    return [
      "first_name",
      "last_name",
      "full_name",
      "initials",
      "hpcsa_number",
      "qualifications",
    ]
  }
  if (source === "patient") return ["first_name", "last_name", "full_name"]
  if (source === "ward") return ["name"]
  return []
}

function toApexField(
  node: FormNode,
  diagnostics: AdapterDiagnostic[],
  depth: number
): ApexFormField | null {
  if (node.kind === "text" || node.kind === "image") {
    diagnostics.push({
      code: "UNREPRESENTABLE_LAYOUT",
      severity: "warning",
      message: `“${node.label}” (${node.kind}) has no Apex field equivalent and was skipped`,
      key: node.key,
    })
    return null
  }
  const type = KIND_TO_APEX[node.kind]
  if (!type) {
    diagnostics.push({
      code: "UNREPRESENTABLE_KIND",
      severity: "warning",
      message: `“${node.label}” cannot be represented as an Apex field`,
      key: node.key,
    })
    return null
  }
  const question = isQuestion(node) ? node : null
  const visibility = toApexVisibility(node.condition, node.key, diagnostics)
  const base: ApexFormField = {
    key: node.key,
    label: node.label,
    ...(node.description ? { description: node.description } : {}),
    type,
    required: question?.required ?? false,
    ...(question?.locked ? { locked: true } : {}),
    ...(question?.options
      ? { options: apexOptionLabels(question, diagnostics) }
      : {}),
    ...(question?.allowOther ? { allowOther: true } : {}),
    ...(question?.includeTime ? { includeTime: true } : {}),
    ...(question?.quickDateSelection ? { quickDateSelection: true } : {}),
    ...(question?.dateRange ? { dateRange: true } : {}),
    ...(question?.unit ? { unit: question.unit } : {}),
    ...(question?.validation ? { validation: question.validation } : {}),
    ...(visibility ? { visibility } : {}),
    ...referenceExtras(question),
    ...(question?.attachment
      ? {
          accept: question.attachment.accept,
          ...(question.attachment.maxFileSizeMb !== undefined
            ? { maxFileSizeMb: question.attachment.maxFileSizeMb }
            : {}),
        }
      : {}),
  }
  if (type !== "repeater") return base
  if (depth > 0) {
    diagnostics.push({
      code: "NESTED_REPEATER",
      severity: "warning",
      message: `Nested repeater “${node.label}” was flattened; Apex allows one repeater level`,
      key: node.key,
    })
  }
  const children = (question?.children ?? [])
    .map((child) => toApexLeaf(child, diagnostics, depth + 1))
    .filter((child): child is ApexLeafField => child !== null)
  return {
    ...base,
    columns: question?.columns ?? 2,
    fields: children,
  }
}

function toApexLeaf(
  node: FormNode,
  diagnostics: AdapterDiagnostic[],
  depth: number
): ApexLeafField | null {
  if (node.kind === "repeater") {
    diagnostics.push({
      code: "NESTED_REPEATER",
      severity: "warning",
      message: `Nested repeater “${node.label}” cannot be an Apex repeater child`,
      key: node.key,
    })
    return null
  }
  const field = toApexField(node, diagnostics, depth)
  if (!field || !APEX_LEAF.has(field.type)) {
    if (field && !APEX_LEAF.has(field.type)) {
      diagnostics.push({
        code: "UNREPRESENTABLE_REPEATER_CHILD",
        severity: "warning",
        message: `“${node.label}” cannot be a repeater column in Apex`,
        key: node.key,
      })
    }
    return null
  }
  return {
    key: field.key,
    label: field.label,
    ...(field.description ? { description: field.description } : {}),
    type: field.type as ApexLeafFieldType,
    required: field.required,
    ...(field.locked ? { locked: true } : {}),
    ...(field.options ? { options: field.options } : {}),
    ...(field.allowOther ? { allowOther: true } : {}),
    ...(field.includeTime ? { includeTime: true } : {}),
    ...(field.quickDateSelection ? { quickDateSelection: true } : {}),
    ...(field.dateRange ? { dateRange: true } : {}),
    ...(field.unit ? { unit: field.unit } : {}),
    ...(field.referenceType ? { referenceType: field.referenceType } : {}),
    ...(field.allowedReferenceIds
      ? { allowedReferenceIds: field.allowedReferenceIds }
      : {}),
    ...(field.validation ? { validation: field.validation } : {}),
    ...(field.accept ? { accept: field.accept } : {}),
    ...(field.maxFileSizeMb !== undefined
      ? { maxFileSizeMb: field.maxFileSizeMb }
      : {}),
    ...(field.visibility ? { visibility: field.visibility } : {}),
  }
}

function toApexVisibility(
  group: FormConditionGroup | undefined,
  key: string,
  diagnostics: AdapterDiagnostic[]
): ApexFieldVisibility | undefined {
  if (!group || group.rules.length === 0) return undefined
  const supported = group.rules.filter(
    (rule) => rule.op === "eq" || rule.op === "neq" || rule.op === "in"
  )
  if (supported.length === 0) {
    diagnostics.push({
      code: "UNREPRESENTABLE_CONDITION",
      severity: "warning",
      message: `Visibility on “${key}” uses operators Apex cannot store and was dropped`,
      key,
    })
    return undefined
  }
  if (
    group.match === "any" ||
    group.rules.length > 1 ||
    supported.length !== group.rules.length
  ) {
    diagnostics.push({
      code: "CONDITION_SIMPLIFIED",
      severity: "warning",
      message: `Visibility on “${key}” was reduced to a single Apex rule`,
      key,
    })
  }
  const rule = supported[0]
  if (!rule) return undefined
  const op = rule.op
  if (op !== "eq" && op !== "neq" && op !== "in") return undefined
  const value =
    op === "in"
      ? Array.isArray(rule.value)
        ? rule.value.map(String)
        : [String(rule.value ?? "")]
      : String(rule.value ?? "")
  return {
    fieldKey: rule.fieldKey,
    op,
    value,
  }
}

function apexOptionLabels(
  question: FormQuestion,
  diagnostics: AdapterDiagnostic[]
): string[] {
  const options = question.options ?? []
  const nested = options.some((option) => optionHasChildren(option))
  if (nested) {
    diagnostics.push({
      code: "NESTED_OPTIONS_FLATTENED",
      severity: "warning",
      message: `“${question.label}” nested options were flattened for Apex`,
      key: question.key,
    })
    return flattenChoiceOptions(options).map((option) => option.label)
  }
  return options.map((option) => option.label)
}

function referenceExtras(
  question: FormQuestion | null
): Pick<ApexFormField, "referenceType" | "allowedReferenceIds"> {
  if (!question) return {}
  const source = question.reference?.source ?? question.context?.binding
  const referenceType: ApexReferenceType | undefined =
    source === "patient" || source === "clinician" || source === "ward"
      ? source
      : undefined
  return {
    ...(referenceType ? { referenceType } : {}),
    ...(question.reference?.allowedIds
      ? { allowedReferenceIds: question.reference.allowedIds }
      : {}),
  }
}
