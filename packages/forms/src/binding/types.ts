import { isLayoutBlock, type FormQuestion } from "../model/types"

export const DEFAULT_DATE_PATTERN = "dd-MM-yyyy"
export const DEFAULT_DATE_TIME_PATTERN = "dd-MM-yyyy HH:mm"

export type BoundTagKind = "string" | "number" | "date"
export type BoundTagRole = "value" | "each" | "if" | "image"

export const TEMPLATE_TAG_MIME = "application/x-apex-template-tag"
export const FORM_TAG_MIME = TEMPLATE_TAG_MIME

export type BoundTag = Readonly<{
  id: string
  label: string
  slug: string
  kind: BoundTagKind
  date?: Readonly<{ includeTime: boolean; pattern: string }>
  role: BoundTagRole
  parentKey?: string
  source?: "user" | "system" | "form"
}>

export type BindingMarker = Readonly<{
  type: "if" | "else" | "endIf" | "each" | "endEach"
  path?: string
}>

export type BindingDocument = Readonly<{
  valueSlugs: readonly string[]
  markers: readonly BindingMarker[]
  imagePaths: readonly string[]
}>

export type BindingDiagnostic = Readonly<{
  code: string
  severity: "error" | "warning"
  message: string
  key?: string
}>

export function tagKindForQuestion(question: FormQuestion): BoundTagKind {
  if (question.kind === "number") return "number"
  if (question.kind === "date" || question.kind === "context") {
    if (question.kind === "date") return "date"
    if (question.context?.binding === "today") return "date"
  }
  return "string"
}

export function isBindableQuestion(question: FormQuestion): boolean {
  return !isLayoutBlock(question)
}

export function questionTagId(key: string): string {
  return `tag:${key}`
}

export function encodeValuePlaceholder(tag: BoundTag): string {
  if (tag.kind === "date") {
    const pattern = tag.date?.pattern ?? DEFAULT_DATE_PATTERN
    return `{{${tag.slug}:date | date:"${pattern}"}}`
  }
  return `{{${tag.slug}:${tag.kind}}}`
}

export function encodeMarkerPlaceholder(marker: BindingMarker): string {
  switch (marker.type) {
    case "if":
      return `{{#if ${marker.path ?? "condition"}}}`
    case "each":
      return `{{#each ${marker.path ?? "items"}}}`
    case "else":
      return "{{else}}"
    case "endIf":
      return "{{/if}}"
    case "endEach":
      return "{{/each}}"
  }
}

export function encodeImagePlaceholder(path: string): string {
  return `{{@image ${path}}}`
}
