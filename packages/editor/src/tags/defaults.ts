import {
  DEFAULT_DATE_PATTERN,
  DEFAULT_DATE_TIME_PATTERN,
  type TemplateTagDefinition,
  type TemplateTagValue,
  type TemplateTagValues,
} from "./types"

export const PRINTED_AT_SLUG = "printed_at"
export const TODAY_SLUG = "today"
export const PRINTED_AT_TAG_ID = "tag:printed_at"
export const TODAY_TAG_ID = "tag:today"

/** Built-in tags present on every new or hydrated document. */
export function defaultTemplateTags(): readonly TemplateTagDefinition[] {
  return [
    {
      id: PRINTED_AT_TAG_ID,
      label: "Printed at",
      slug: PRINTED_AT_SLUG,
      kind: "date",
      source: "system",
      date: { includeTime: true, pattern: DEFAULT_DATE_TIME_PATTERN },
    },
    {
      id: TODAY_TAG_ID,
      label: "Today",
      slug: TODAY_SLUG,
      kind: "date",
      source: "system",
      date: { includeTime: false, pattern: DEFAULT_DATE_PATTERN },
    },
  ]
}

export function isPrintedAtTag(
  tag: Pick<TemplateTagDefinition, "slug" | "kind" | "date">
): boolean {
  return (
    tag.slug === PRINTED_AT_SLUG &&
    tag.kind === "date" &&
    tag.date?.includeTime === true
  )
}

export function isTodayTag(
  tag: Pick<TemplateTagDefinition, "slug" | "kind" | "date">
): boolean {
  return (
    tag.slug === TODAY_SLUG &&
    tag.kind === "date" &&
    tag.date?.includeTime !== true
  )
}

export function isSystemTemplateTag(
  tag: Pick<TemplateTagDefinition, "slug" | "kind" | "date" | "source">
): boolean {
  return tag.source === "system" || isPrintedAtTag(tag) || isTodayTag(tag)
}

/** Calendar date in the local timezone, stored as UTC midnight so UTC formatters keep the same day. */
export function todayDateValue(now: Date = new Date()): TemplateTagValue {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return { kind: "date", value: `${year}-${month}-${day}T00:00:00.000Z` }
}

export function mergeDefaultTemplateTags(
  tags: readonly TemplateTagDefinition[],
  values: TemplateTagValues,
  now: Date = new Date()
): { tags: TemplateTagDefinition[]; values: TemplateTagValues } {
  const defaults = defaultTemplateTags()
  const defaultSlugs = new Set(defaults.map((tag) => tag.slug))
  const bySlug = new Map(tags.map((tag) => [tag.slug, tag]))
  const nextTags: TemplateTagDefinition[] = []
  const nextValues: Record<string, TemplateTagValue> = { ...values }

  for (const def of defaults) {
    const existing = bySlug.get(def.slug)
    if (!existing) {
      nextTags.push(def)
      continue
    }
    if (isCompatibleDefault(existing, def)) {
      nextTags.push({
        ...existing,
        source: "system",
        kind: def.kind,
        date: existing.date ?? def.date,
      })
    } else {
      nextTags.push(existing)
    }
  }

  for (const tag of tags) {
    if (!defaultSlugs.has(tag.slug)) nextTags.push(tag)
  }

  for (const tag of nextTags) {
    if (isTodayTag(tag) && nextValues[tag.id] === undefined) {
      nextValues[tag.id] = todayDateValue(now)
    }
  }

  return { tags: nextTags, values: nextValues }
}

function isCompatibleDefault(
  existing: TemplateTagDefinition,
  def: TemplateTagDefinition
): boolean {
  if (existing.kind !== def.kind) return false
  if (def.kind !== "date") return true
  return existing.date?.includeTime === def.date?.includeTime
}
