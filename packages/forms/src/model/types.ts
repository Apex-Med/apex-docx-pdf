export const FORM_QUESTION_KINDS = [
  "short_text",
  "long_text",
  "number",
  "date",
  "boolean",
  "select",
  "multi_select",
  "autocomplete",
  "cascader",
  "reference",
  "attachment",
  "repeater",
  "context",
] as const

export const FORM_CHOICE_KINDS = [
  "select",
  "multi_select",
  "autocomplete",
  "cascader",
] as const

export const FORM_LAYOUT_KINDS = [
  "section",
  "heading",
  "text",
  "image",
] as const

export type FormQuestionKind = (typeof FORM_QUESTION_KINDS)[number]
export type FormChoiceKind = (typeof FORM_CHOICE_KINDS)[number]
export type FormLayoutKind = (typeof FORM_LAYOUT_KINDS)[number]
export type FormNodeKind = FormQuestionKind | FormLayoutKind

export const CONTEXT_BINDINGS = [
  "patient",
  "clinician",
  "current_user",
  "ward",
  "facility",
  "department",
  "today",
] as const

export type ContextBinding = (typeof CONTEXT_BINDINGS)[number]

export type FormOption = Readonly<{
  value: string
  label: string
  children?: readonly FormOption[]
}>

export type FormValidation = Readonly<{
  min?: number
  max?: number
  minLength?: number
  maxLength?: number
}>

export type FormConditionOp =
  | "eq"
  | "neq"
  | "in"
  | "not_in"
  | "is_set"
  | "is_empty"
  | "gt"
  | "lt"

export type FormConditionRule = Readonly<{
  fieldKey: string
  op: FormConditionOp
  value?: string | number | readonly string[]
}>

export type FormConditionGroup = Readonly<{
  match: "all" | "any"
  rules: readonly FormConditionRule[]
}>

export type FormFileValue = Readonly<{
  id: string
  name: string
  mimeType?: string
  sizeBytes?: number
}>

export type FormScalarAnswer = string | number | boolean | null
export type FormRepeaterRow = Record<string, FormAnswerValue>
export type FormAnswerValue =
  | FormScalarAnswer
  | readonly string[]
  | readonly FormFileValue[]
  | readonly FormRepeaterRow[]

export type FormAnswers = Record<string, FormAnswerValue>

export type FormNodeBase = Readonly<{
  id: string
  key: string
  label: string
  description?: string
  condition?: FormConditionGroup
}>

export type FormQuestion = FormNodeBase &
  Readonly<{
    kind: FormQuestionKind
    required: boolean
    locked?: boolean
    options?: readonly FormOption[]
    allowOther?: boolean
    includeTime?: boolean
    quickDateSelection?: boolean
    dateRange?: boolean
    unit?: string
    reference?: Readonly<{
      source: string
      allowedIds?: readonly string[]
      fields?: readonly Readonly<{ key: string; label: string }>[]
    }>
    attachment?: Readonly<{
      accept: readonly string[]
      maxFileSizeMb?: number
      maxCount?: number
    }>
    context?: Readonly<{ binding: ContextBinding }>
    columns?: number
    children?: readonly FormNode[]
    validation?: FormValidation
    defaultValue?: FormAnswerValue
  }>

export type FormLayoutBlock = FormNodeBase &
  Readonly<{
    kind: FormLayoutKind
    body?: string
    image?: Readonly<{ src?: string; alt?: string }>
  }>

export type FormNode = FormQuestion | FormLayoutBlock

export type FormPage = Readonly<{
  id: string
  key: string
  title: string
  description?: string
  nodes: readonly FormNode[]
}>

export type FormTemplate = Readonly<{
  id: string
  name: string
  pages: readonly FormPage[]
}>

export type ReferenceOption = Readonly<{
  id: string
  label: string
  fields?: Readonly<Record<string, string>>
}>

export type ReferenceResolver = Readonly<{
  search: (
    query: string,
    signal?: AbortSignal
  ) => Promise<readonly ReferenceOption[]>
  load: (ids: readonly string[]) => Promise<readonly ReferenceOption[]>
  fields?: readonly Readonly<{ key: string; label: string }>[]
}>

export type FormContextValues = Readonly<Partial<Record<ContextBinding, string>>>

export const FORM_TEMPLATE_META_KEY = "formTemplate"
export const FORM_ANSWERS_META_KEY = "formAnswers"

export const OTHER_OPTION_VALUE = "__other__"
export const DATE_DEFAULT_TODAY = "today"

export const FORM_QUESTION_KIND_LABELS: Record<FormQuestionKind, string> = {
  short_text: "Short text",
  long_text: "Long text",
  number: "Number",
  date: "Date",
  boolean: "Yes / No",
  select: "Select",
  multi_select: "Multi-select",
  autocomplete: "Autocomplete",
  cascader: "Cascader",
  reference: "Reference",
  attachment: "Attachment",
  repeater: "Repeater",
  context: "Context",
}

export const FORM_QUESTION_KIND_DESCRIPTIONS: Record<FormQuestionKind, string> = {
  short_text: "A single line for names, IDs, or other short answers.",
  long_text: "Several lines for notes, comments, or explanations.",
  number: "A numeric value. Optionally add a unit and a min/max range.",
  date: "A calendar date. Optionally include the time, a date range, or quick picks.",
  boolean: "A simple yes or no choice.",
  select: "Choose one option from a list.",
  multi_select: "Choose one or more options from a list.",
  autocomplete: "Search a long list, then pick one option.",
  cascader: "Choose from nested options, such as category then subcategory.",
  reference: "Look up an existing record, such as a patient or clinician.",
  attachment: "Upload one or more files.",
  repeater: "A repeating group of questions, such as a list of medications.",
  context: "Filled automatically from the current patient, user, or visit.",
}

export const FORM_LAYOUT_KIND_LABELS: Record<FormLayoutKind, string> = {
  section: "Section",
  heading: "Heading",
  text: "Text block",
  image: "Image",
}

export const FORM_LAYOUT_KIND_DESCRIPTIONS: Record<FormLayoutKind, string> = {
  section: "Groups related questions under a heading.",
  heading: "A title that organizes the form.",
  text: "Static instructions or notes on the form.",
  image: "A static image shown on the form.",
}

export const CONTEXT_BINDING_LABELS: Record<ContextBinding, string> = {
  patient: "Patient",
  clinician: "Clinician",
  current_user: "Current user",
  ward: "Ward",
  facility: "Facility",
  department: "Department",
  today: "Today",
}

export function isLayoutKind(kind: FormNodeKind): kind is FormLayoutKind {
  return (FORM_LAYOUT_KINDS as readonly string[]).includes(kind)
}

export function isQuestionKind(kind: FormNodeKind): kind is FormQuestionKind {
  return (FORM_QUESTION_KINDS as readonly string[]).includes(kind)
}

export function isChoiceKind(kind: FormNodeKind): kind is FormChoiceKind {
  return (FORM_CHOICE_KINDS as readonly string[]).includes(kind)
}

export function isLayoutBlock(node: FormNode): node is FormLayoutBlock {
  return isLayoutKind(node.kind)
}

export function isQuestion(node: FormNode): node is FormQuestion {
  return isQuestionKind(node.kind)
}
