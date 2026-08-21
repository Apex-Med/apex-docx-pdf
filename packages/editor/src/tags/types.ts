export const TEMPLATE_TAG_KINDS = ["string", "number", "date"] as const

export type TemplateTagKind = (typeof TEMPLATE_TAG_KINDS)[number]

export const DATE_ONLY_PATTERNS = [
  "dd-MM-yyyy",
  "dd/MM/yyyy",
  "yyyy-MM-dd",
  "d MMM yyyy",
] as const

export const DATE_TIME_PATTERNS = [
  "dd-MM-yyyy HH:mm",
  "dd-MM-yyyy hh:mm a",
  "yyyy-MM-dd HH:mm",
] as const

export const DEFAULT_DATE_PATTERN = "dd-MM-yyyy"
export const DEFAULT_DATE_TIME_PATTERN = "dd-MM-yyyy HH:mm"

export const TEMPLATE_TAG_TIME_ZONE = "UTC"

export type TemplateTagDateOptions = Readonly<{
  includeTime: boolean
  pattern: string
}>

export type TemplateTagSource = "user" | "system" | "form"

export type TemplateTagDefinition = Readonly<{
  id: string
  label: string
  slug: string
  kind: TemplateTagKind
  date?: TemplateTagDateOptions
  source?: TemplateTagSource
}>

export type TemplateTagValue =
  | Readonly<{ kind: "string"; value: string }>
  | Readonly<{ kind: "number"; value: number }>
  | Readonly<{ kind: "date"; value: string }>

export type TemplateTagValues = Readonly<Record<string, TemplateTagValue>>

export const TEMPLATE_TAGS_META_KEY = "templateTags"
export const TEMPLATE_TAG_VALUES_META_KEY = "templateTagValues"

export const TEMPLATE_TAG_MIME = "application/x-apex-template-tag"

/** Invisible caret anchor so Chrome can sit next to a contenteditable=false chip. */
export const TEMPLATE_TAG_CARET_ZWSP = "\u200b"
export const TEMPLATE_TAG_VALUES_TR_META = "apexTemplateTagValues"

export type TemplateTagTextStyleAttrs = Readonly<{
  fontFamily: string
  fontSize: number
  fontWeight: number
  fontStyle: string
  underline: boolean
  strikethrough: boolean
  color: string
  highlightColor: string | null
  verticalAlignment: string
  styleId: string | null
}>

export const DEFAULT_TEMPLATE_TAG_STYLE: TemplateTagTextStyleAttrs = {
  fontFamily: "Inter",
  fontSize: 220,
  fontWeight: 400,
  fontStyle: "normal",
  underline: false,
  strikethrough: false,
  color: "#000000",
  highlightColor: null,
  verticalAlignment: "baseline",
  styleId: null,
}
