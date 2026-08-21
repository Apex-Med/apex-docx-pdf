export const APEX_FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "date",
  "yes_no",
  "select",
  "multiselect",
  "repeater",
  "reference",
  "file",
  "section",
  "heading",
] as const

export type ApexFieldType = (typeof APEX_FIELD_TYPES)[number]

export const APEX_LEAF_FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "date",
  "yes_no",
  "select",
  "multiselect",
  "reference",
  "file",
] as const

export type ApexLeafFieldType = (typeof APEX_LEAF_FIELD_TYPES)[number]

export const APEX_REFERENCE_TYPES = ["patient", "clinician", "ward"] as const

export type ApexReferenceType = (typeof APEX_REFERENCE_TYPES)[number]

export type ApexFieldVisibilityOp = "eq" | "neq" | "in"

export type ApexFieldVisibility = Readonly<{
  fieldKey: string
  op: ApexFieldVisibilityOp
  value: string | readonly string[]
}>

export type ApexFieldValidation = Readonly<{
  min?: number
  max?: number
  minLength?: number
  maxLength?: number
}>

export type ApexLeafField = Readonly<{
  key: string
  label: string
  description?: string
  type: ApexLeafFieldType
  required: boolean
  locked?: boolean
  options?: readonly string[]
  allowOther?: boolean
  includeTime?: boolean
  quickDateSelection?: boolean
  dateRange?: boolean
  unit?: string
  referenceType?: ApexReferenceType
  allowedReferenceIds?: readonly string[]
  validation?: ApexFieldValidation
  accept?: readonly string[]
  maxFileSizeMb?: number
  visibility?: ApexFieldVisibility
}>

export type ApexFormField = Readonly<{
  key: string
  label: string
  description?: string
  type: ApexFieldType
  required: boolean
  locked?: boolean
  options?: readonly string[]
  allowOther?: boolean
  includeTime?: boolean
  quickDateSelection?: boolean
  dateRange?: boolean
  unit?: string
  referenceType?: ApexReferenceType
  allowedReferenceIds?: readonly string[]
  validation?: ApexFieldValidation
  accept?: readonly string[]
  maxFileSizeMb?: number
  columns?: number
  fields?: readonly ApexLeafField[]
  visibility?: ApexFieldVisibility
}>

export type ApexFormPage = Readonly<{
  key: string
  title: string
  description?: string
  fields: readonly ApexFormField[]
}>

export type AdapterDiagnostic = Readonly<{
  code: string
  severity: "error" | "warning"
  message: string
  key?: string
}>

export type ApexAdapterResult<T> = Readonly<{
  value: T
  diagnostics: readonly AdapterDiagnostic[]
}>
