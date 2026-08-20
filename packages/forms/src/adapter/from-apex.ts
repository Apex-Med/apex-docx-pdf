import { createFormId, uniqueKey } from "../model/ids"
import { DEFAULT_ATTACHMENT_ACCEPT } from "../model/attachment"
import { defaultReferenceFields } from "../model/ops"
import type {
  FormConditionGroup,
  FormLayoutBlock,
  FormNode,
  FormNodeKind,
  FormOption,
  FormPage,
  FormQuestion,
  FormQuestionKind,
  FormTemplate,
} from "../model/types"
import type {
  ApexAdapterResult,
  ApexFieldType,
  ApexFieldVisibility,
  ApexFormField,
  ApexFormPage,
  ApexLeafField,
  ApexReferenceType,
} from "./types"

const APEX_TO_KIND: Record<ApexFieldType, FormNodeKind> = {
  text: "short_text",
  textarea: "long_text",
  number: "number",
  date: "date",
  yes_no: "boolean",
  select: "select",
  multiselect: "multi_select",
  repeater: "repeater",
  reference: "reference",
  file: "attachment",
  section: "section",
  heading: "heading",
}

export function fromApexPages(
  pages: readonly ApexFormPage[],
  name = "Imported form"
): ApexAdapterResult<FormTemplate> {
  const taken = new Set<string>()
  const formPages: FormPage[] = pages.map((page, index) => {
    const key = uniqueKey(page.key || `page_${index + 1}`, taken)
    taken.add(key)
    return {
      id: createFormId("page"),
      key,
      title: page.title,
      ...(page.description ? { description: page.description } : {}),
      nodes: page.fields.map((field) => fromApexField(field, taken)),
    }
  })
  return {
    value: {
      id: createFormId("form"),
      name,
      pages:
        formPages.length > 0
          ? formPages
          : [
              {
                id: createFormId("page"),
                key: "page_1",
                title: "Page 1",
                nodes: [],
              },
            ],
    },
    diagnostics: [],
  }
}

function fromApexField(field: ApexFormField, taken: Set<string>): FormNode {
  const kind = APEX_TO_KIND[field.type]
  const key = uniqueKey(field.key, taken)
  taken.add(key)
  if (kind === "section" || kind === "heading") {
    const block: FormLayoutBlock = {
      id: createFormId("node"),
      key,
      label: field.label,
      kind,
      ...(field.description ? { description: field.description } : {}),
      ...(fromVisibility(field.visibility)
        ? { condition: fromVisibility(field.visibility) }
        : {}),
    }
    return block
  }
  const question: FormQuestion = {
    id: createFormId("node"),
    key,
    label: field.label,
    kind: kind as FormQuestionKind,
    required: field.required,
    ...(field.description ? { description: field.description } : {}),
    ...(field.locked ? { locked: true } : {}),
    ...(field.options ? { options: optionsFromLabels(field.options) } : {}),
    ...(field.allowOther ? { allowOther: true } : {}),
    ...(field.includeTime ? { includeTime: true } : {}),
    ...(field.quickDateSelection ? { quickDateSelection: true } : {}),
    ...(field.dateRange ? { dateRange: true } : {}),
    ...(field.unit ? { unit: field.unit } : {}),
    ...(field.validation ? { validation: field.validation } : {}),
    ...(fromVisibility(field.visibility)
      ? { condition: fromVisibility(field.visibility) }
      : {}),
    ...referenceFromApex(field.referenceType, field.allowedReferenceIds),
    ...(field.type === "file"
      ? {
          attachment: {
            accept: field.accept ?? [...DEFAULT_ATTACHMENT_ACCEPT],
            ...(field.maxFileSizeMb !== undefined
              ? { maxFileSizeMb: field.maxFileSizeMb }
              : {}),
            maxCount: 1,
          },
        }
      : {}),
    ...(field.type === "repeater"
      ? {
          columns: field.columns ?? 2,
          children: (field.fields ?? []).map((child) =>
            fromApexField(child as ApexFormField, taken)
          ),
        }
      : {}),
  }
  return question
}

function optionsFromLabels(labels: readonly string[]): FormOption[] {
  return labels.map((label, index) => ({
    value: slugOption(label, index),
    label,
  }))
}

function slugOption(label: string, index: number): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
  return slug.length > 0 ? slug : `option_${index + 1}`
}

function fromVisibility(
  visibility: ApexFieldVisibility | undefined
): FormConditionGroup | undefined {
  if (!visibility) return undefined
  return {
    match: "all",
    rules: [
      {
        fieldKey: visibility.fieldKey,
        op: visibility.op,
        value: visibility.value,
      },
    ],
  }
}

function referenceFromApex(
  referenceType: ApexReferenceType | undefined,
  allowedIds: readonly string[] | undefined
): Pick<FormQuestion, "reference"> {
  if (!referenceType) return {}
  return {
    reference: {
      source: referenceType,
      fields: defaultReferenceFields(referenceType),
      ...(allowedIds ? { allowedIds } : {}),
    },
  }
}

export function fromApexLeafField(field: ApexLeafField): FormNode {
  return fromApexField(field, new Set())
}
