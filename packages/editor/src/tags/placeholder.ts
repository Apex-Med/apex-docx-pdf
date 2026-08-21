import {
  DEFAULT_DATE_FORMAT,
  formatDateTime,
  parseDateTimeFormat,
} from "@apexmed/template"

import { isPrintedAtTag } from "./defaults"
import { isValidTemplatePath, prettifySlug } from "./slug"
import {
  DEFAULT_DATE_PATTERN,
  TEMPLATE_TAG_TIME_ZONE,
  type TemplateTagDefinition,
  type TemplateTagKind,
  type TemplateTagValue,
  type TemplateTagValues,
} from "./types"

export type ValuePlaceholderMatch = Readonly<{
  start: number
  end: number
  raw: string
  slug: string
  kind: TemplateTagKind
  datePattern: string | null
  includeTime: boolean
}>

const VALUE_OPEN = "{{"
const VALUE_CLOSE = "}}"

export function encodeTemplatePlaceholder(
  tag: Pick<TemplateTagDefinition, "slug" | "kind" | "date">
): string {
  if (tag.kind === "date") {
    const pattern = tag.date?.pattern ?? DEFAULT_DATE_PATTERN
    return `{{${tag.slug}:date | date:"${pattern}"}}`
  }
  return `{{${tag.slug}:${tag.kind}}}`
}

export function formatTemplateTagValue(
  tag: Pick<TemplateTagDefinition, "kind" | "date">,
  value: TemplateTagValue
): string {
  if (value.kind === "number") {
    return Number.isFinite(value.value) ? String(value.value) : ""
  }
  if (value.kind === "date") {
    const pattern = parseDateTimeFormat(
      tag.date?.pattern ?? DEFAULT_DATE_FORMAT
    )
    const parsed = Date.parse(value.value)
    if (!pattern || !Number.isFinite(parsed)) return value.value
    return formatDateTime(new Date(parsed), pattern, TEMPLATE_TAG_TIME_ZONE)
  }
  return value.value
}

export function resolveTemplateTagValue(
  tag: Pick<TemplateTagDefinition, "id" | "slug" | "kind" | "date">,
  values: TemplateTagValues,
  now: Date = new Date()
): TemplateTagValue | undefined {
  if (isPrintedAtTag(tag)) {
    return { kind: "date", value: now.toISOString() }
  }
  return values[tag.id]
}

export function templateTagBadgeText(
  tag: TemplateTagDefinition,
  value: TemplateTagValue | undefined
): string {
  if (!value) return tag.label
  return formatTemplateTagValue(tag, value)
}

export function templateTagExportText(
  tag: Pick<TemplateTagDefinition, "slug" | "kind" | "date">,
  value: TemplateTagValue | undefined
): string {
  if (!value) return encodeTemplatePlaceholder(tag)
  return formatTemplateTagValue(tag, value)
}

export function definitionFromPlaceholder(
  match: ValuePlaceholderMatch,
  existing?: TemplateTagDefinition
): TemplateTagDefinition {
  if (existing) return existing
  return {
    id: `tag:${match.slug}`,
    label: prettifySlug(match.slug),
    slug: match.slug,
    kind: match.kind,
    ...(match.kind === "date"
      ? {
          date: {
            includeTime: match.includeTime,
            pattern: match.datePattern ?? DEFAULT_DATE_PATTERN,
          },
        }
      : {}),
  }
}

export function findValuePlaceholders(
  text: string
): readonly ValuePlaceholderMatch[] {
  const matches: ValuePlaceholderMatch[] = []
  let cursor = 0
  while (cursor < text.length) {
    const open = text.indexOf(VALUE_OPEN, cursor)
    if (open < 0) break
    const close = text.indexOf(VALUE_CLOSE, open + VALUE_OPEN.length)
    if (close < 0) break
    const nested = text.indexOf(VALUE_OPEN, open + VALUE_OPEN.length)
    if (nested >= 0 && nested < close) {
      cursor = nested
      continue
    }
    const raw = text.slice(open, close + VALUE_CLOSE.length)
    const parsed = parseValuePlaceholderBody(
      text.slice(open + VALUE_OPEN.length, close)
    )
    if (parsed) {
      matches.push({
        start: open,
        end: close + VALUE_CLOSE.length,
        raw,
        ...parsed,
      })
    }
    cursor = close + VALUE_CLOSE.length
  }
  return matches
}

function parseValuePlaceholderBody(
  raw: string
): Omit<ValuePlaceholderMatch, "start" | "end" | "raw"> | null {
  const body = raw.trim()
  if (
    body.startsWith("#") ||
    body.startsWith("/") ||
    body === "else" ||
    body.startsWith("else ") ||
    body.startsWith("@")
  ) {
    return null
  }
  const parts = splitPipes(body)
  if (parts === undefined || parts.length === 0) return null
  const expression = parts[0]
  if (!expression) return null
  const match =
    /^(?<path>[A-Za-z_$][A-Za-z0-9_$.]*)(?:\s*:\s*(?<kind>[A-Za-z]+))?$/u.exec(
      expression
    )
  if (!match?.groups?.path || !isValidTemplatePath(match.groups.path)) {
    return null
  }
  const kindToken = match.groups.kind
  if (
    kindToken !== undefined &&
    kindToken !== "string" &&
    kindToken !== "number" &&
    kindToken !== "date"
  ) {
    return null
  }
  const formatters = parts.slice(1)
  if (formatters.length > 1) return null
  let datePattern: string | null = null
  let includeTime = false
  if (formatters.length === 1) {
    const firstFormatter = formatters[0]
    if (!firstFormatter) return null
    const formatter = parseDateFormatter(firstFormatter)
    if (!formatter) return null
    datePattern = formatter.pattern
    includeTime = formatter.includeTime
  }
  const kind: TemplateTagKind =
    datePattern !== null
      ? "date"
      : ((kindToken as TemplateTagKind | undefined) ?? "string")
  if (kind !== "date" && datePattern !== null) return null
  if (kind === "date" && datePattern === null) {
    datePattern = DEFAULT_DATE_PATTERN
  }
  if (kind === "date" && datePattern) {
    const parsed = parseDateTimeFormat(datePattern)
    if (!parsed) return null
    includeTime = parsed.includesTime
  }
  return {
    slug: match.groups.path,
    kind,
    datePattern,
    includeTime,
  }
}

function parseDateFormatter(
  raw: string
): { pattern: string; includeTime: boolean } | null {
  const trimmed = raw.trim()
  if (trimmed === "date") {
    return { pattern: DEFAULT_DATE_FORMAT, includeTime: false }
  }
  const quoted =
    /^date\s*:\s*"(?<pattern>[^"]+)"$/u.exec(trimmed) ??
    /^date\s*:\s*'(?<pattern>[^']+)'$/u.exec(trimmed)
  const pattern = quoted?.groups?.pattern
  if (!pattern) return null
  const parsed = parseDateTimeFormat(pattern)
  if (!parsed) return null
  return { pattern, includeTime: parsed.includesTime }
}

function splitPipes(body: string): string[] | undefined {
  const parts: string[] = []
  let current = ""
  let quote: '"' | "'" | null = null
  for (const char of body) {
    if (quote) {
      current += char
      if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      current += char
      continue
    }
    if (char === "|") {
      parts.push(current.trim())
      current = ""
      continue
    }
    current += char
  }
  if (quote) return undefined
  parts.push(current.trim())
  return parts
}
