import type { SemanticDocument } from "@apexmed/core"

import { mergeDefaultTemplateTags } from "./defaults"
import { definitionFromPlaceholder, findValuePlaceholders } from "./placeholder"
import {
  TEMPLATE_TAGS_META_KEY,
  TEMPLATE_TAG_VALUES_META_KEY,
  type TemplateTagDefinition,
  type TemplateTagKind,
  type TemplateTagSource,
  type TemplateTagValue,
  type TemplateTagValues,
} from "./types"

export type TemplateTagMetadata = Readonly<{
  tags: readonly TemplateTagDefinition[]
  values: TemplateTagValues
}>

export function readTemplateTagMetadata(
  metadata: SemanticDocument["editorMetadata"]
): TemplateTagMetadata {
  if (!metadata || typeof metadata !== "object") {
    return { tags: [], values: {} }
  }
  const rawTags = (metadata as Record<string, unknown>)[TEMPLATE_TAGS_META_KEY]
  const rawValues = (metadata as Record<string, unknown>)[
    TEMPLATE_TAG_VALUES_META_KEY
  ]
  return {
    tags: Array.isArray(rawTags)
      ? rawTags
          .map((entry) => readDefinition(entry))
          .filter((entry): entry is TemplateTagDefinition => entry !== null)
      : [],
    values: readValues(rawValues),
  }
}

export function writeTemplateTagMetadata(
  metadata: SemanticDocument["editorMetadata"],
  tags: readonly TemplateTagDefinition[],
  values: TemplateTagValues
): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    [TEMPLATE_TAGS_META_KEY]: tags,
    [TEMPLATE_TAG_VALUES_META_KEY]: values,
  }
}

export function definitionFromNodeAttrs(attrs: {
  tagId?: unknown
  slug?: unknown
  kind?: unknown
  label?: unknown
  datePattern?: unknown
  includeTime?: unknown
}): TemplateTagDefinition {
  const kind = isTagKind(attrs.kind) ? attrs.kind : "string"
  const slug = String(attrs.slug ?? "tag")
  return {
    id: String(attrs.tagId ?? `tag:${slug}`),
    label: String(attrs.label ?? slug),
    slug,
    kind,
    ...(kind === "date"
      ? {
          date: {
            includeTime: attrs.includeTime === true,
            pattern: String(attrs.datePattern ?? "dd-MM-yyyy"),
          },
        }
      : {}),
  }
}

export function hydrateTemplateTagCatalog(
  document: SemanticDocument,
  now: Date = new Date()
): SemanticDocument {
  const current = readTemplateTagMetadata(document.editorMetadata)
  const bySlug = new Map(current.tags.map((tag) => [tag.slug, tag]))
  const adopted: TemplateTagDefinition[] = [...current.tags]
  walkSemanticText(document, (text) => {
    for (const match of findValuePlaceholders(text)) {
      if (bySlug.has(match.slug)) continue
      const next = definitionFromPlaceholder(match)
      bySlug.set(next.slug, next)
      adopted.push(next)
    }
  })
  const merged = mergeDefaultTemplateTags(adopted, current.values, now)
  if (
    sameTagCatalog(current.tags, merged.tags) &&
    sameTagValues(current.values, merged.values)
  ) {
    return document
  }
  return {
    ...document,
    editorMetadata: writeTemplateTagMetadata(
      document.editorMetadata,
      merged.tags,
      merged.values
    ),
  }
}

function walkSemanticText(
  document: SemanticDocument,
  visit: (text: string) => void
): void {
  const visitBlocks = (
    blocks: SemanticDocument["sections"][number]["blocks"]
  ): void => {
    for (const block of blocks) {
      if (block.type === "paragraph") {
        for (const child of block.children) {
          if (child.type === "text") visit(child.text)
        }
      } else if (block.type === "table") {
        for (const row of block.rows) {
          for (const cell of row.cells) {
            visitBlocks(cell.blocks)
          }
        }
      }
    }
  }
  for (const section of document.sections) visitBlocks(section.blocks)
  for (const part of [...document.headers, ...document.footers]) {
    visitBlocks(part.blocks)
  }
}

function readDefinition(value: unknown): TemplateTagDefinition | null {
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>
  if (typeof record.id !== "string" || typeof record.slug !== "string") {
    return null
  }
  if (typeof record.label !== "string" || !isTagKind(record.kind)) return null
  const date =
    record.kind === "date" && record.date && typeof record.date === "object"
      ? (record.date as Record<string, unknown>)
      : null
  return {
    id: record.id,
    label: record.label,
    slug: record.slug,
    kind: record.kind,
    ...(readSource(record.source) ? { source: readSource(record.source) } : {}),
    ...(record.kind === "date"
      ? {
          date: {
            includeTime: date?.includeTime === true,
            pattern:
              typeof date?.pattern === "string" ? date.pattern : "dd-MM-yyyy",
          },
        }
      : {}),
  }
}

function readSource(value: unknown): TemplateTagSource | undefined {
  return value === "system" || value === "user" ? value : undefined
}

function sameTagCatalog(
  left: readonly TemplateTagDefinition[],
  right: readonly TemplateTagDefinition[]
): boolean {
  if (left.length !== right.length) return false
  return left.every((tag, index) => {
    const other = right[index]
    return (
      other !== undefined &&
      tag.id === other.id &&
      tag.slug === other.slug &&
      tag.label === other.label &&
      tag.kind === other.kind &&
      tag.source === other.source &&
      tag.date?.includeTime === other.date?.includeTime &&
      tag.date?.pattern === other.date?.pattern
    )
  })
}

function sameTagValues(
  left: TemplateTagValues,
  right: TemplateTagValues
): boolean {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false
  return leftKeys.every((id) => {
    const a = left[id]
    const b = right[id]
    return a !== undefined && b !== undefined && a.kind === b.kind && a.value === b.value
  })
}

function readValues(value: unknown): TemplateTagValues {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const next: Record<string, TemplateTagValue> = {}
  for (const [id, entry] of Object.entries(value)) {
    const parsed = readValue(entry)
    if (parsed) next[id] = parsed
  }
  return next
}

function readValue(value: unknown): TemplateTagValue | null {
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>
  if (record.kind === "string" && typeof record.value === "string") {
    return { kind: "string", value: record.value }
  }
  if (
    record.kind === "number" &&
    typeof record.value === "number" &&
    Number.isFinite(record.value)
  ) {
    return { kind: "number", value: record.value }
  }
  if (record.kind === "date" && typeof record.value === "string") {
    return { kind: "date", value: record.value }
  }
  return null
}

function isTagKind(value: unknown): value is TemplateTagKind {
  return value === "string" || value === "number" || value === "date"
}
