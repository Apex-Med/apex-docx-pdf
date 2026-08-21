import { isValidTemplatePath } from "./slug"

export const TEMPLATE_MARKER_TYPES = [
  "if",
  "else",
  "endIf",
  "each",
  "endEach",
] as const

export type TemplateMarkerType = (typeof TEMPLATE_MARKER_TYPES)[number]

export type TemplateMarkerMatch = Readonly<{
  type: TemplateMarkerType
  path?: string
  raw: string
}>

export type TemplateImageMatch = Readonly<{
  start: number
  end: number
  path: string
  raw: string
}>

const MARKER_BODY: Record<TemplateMarkerType, (path?: string) => string> = {
  if: (path) => `#if ${path ?? "condition"}`,
  each: (path) => `#each ${path ?? "items"}`,
  else: () => "else",
  endIf: () => "/if",
  endEach: () => "/each",
}

export function encodeTemplateMarker(
  type: TemplateMarkerType,
  path?: string
): string {
  return `{{${MARKER_BODY[type](path)}}}`
}

export function encodeTemplateImage(path: string): string {
  return `{{@image ${path}}}`
}

export function parseStandaloneMarker(
  text: string
): TemplateMarkerMatch | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith("{{") || !trimmed.endsWith("}}")) return null
  const inner = trimmed.slice(2, -2).trim()
  if (inner === "else") return { type: "else", raw: trimmed }
  if (inner === "/if") return { type: "endIf", raw: trimmed }
  if (inner === "/each") return { type: "endEach", raw: trimmed }
  const openIf = /^#if\s+(?<path>[A-Za-z_$][A-Za-z0-9_$.]*)$/u.exec(inner)
  if (openIf?.groups?.path && isValidTemplatePath(openIf.groups.path)) {
    return { type: "if", path: openIf.groups.path, raw: trimmed }
  }
  const openEach = /^#each\s+(?<path>[A-Za-z_$][A-Za-z0-9_$.]*)$/u.exec(inner)
  if (openEach?.groups?.path && isValidTemplatePath(openEach.groups.path)) {
    return { type: "each", path: openEach.groups.path, raw: trimmed }
  }
  return null
}

export function paragraphIsStandaloneMarker(
  text: string
): TemplateMarkerMatch | null {
  if (text.includes("\n")) return null
  return parseStandaloneMarker(text)
}

export function findImagePlaceholders(
  text: string
): readonly TemplateImageMatch[] {
  const matches: TemplateImageMatch[] = []
  const pattern = /\{\{\s*@image\s+(?<path>[A-Za-z_$][A-Za-z0-9_$.]*)\s*\}\}/gu
  for (const match of text.matchAll(pattern)) {
    const path = match.groups?.path
    if (!path || !isValidTemplatePath(path) || match.index === undefined)
      continue
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      path,
      raw: match[0],
    })
  }
  return matches
}
