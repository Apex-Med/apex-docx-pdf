import { slugifyKey, uniqueKey } from "./ids"
import type { FormOption } from "./types"

type MutableOption = {
  value: string
  label: string
  children?: MutableOption[]
}

export function optionHasChildren(option: FormOption): boolean {
  return (option.children?.length ?? 0) > 0
}

export function flattenChoiceOptions(
  options: readonly FormOption[]
): FormOption[] {
  const flattened: FormOption[] = []
  walkLeaves(options, [], flattened)
  return flattened
}

function walkLeaves(
  options: readonly FormOption[],
  ancestors: readonly string[],
  into: FormOption[]
): void {
  for (const option of options) {
    if (optionHasChildren(option)) {
      walkLeaves(option.children ?? [], [...ancestors, option.label], into)
      continue
    }
    into.push({
      value: option.value,
      label:
        ancestors.length > 0
          ? `${ancestors.join(" / ")} / ${option.label}`
          : option.label,
    })
  }
}

export function findOptionPath(
  options: readonly FormOption[],
  value: string | undefined
): readonly FormOption[] {
  if (!value) return []
  for (const option of options) {
    if (option.value === value) return [option]
    const nested = findOptionPath(option.children ?? [], value)
    if (nested.length > 0) return [option, ...nested]
  }
  return []
}

export function serializeOptionTree(options: readonly FormOption[]): string {
  const lines: string[] = []
  writeTree(options, 0, lines)
  return lines.join("\n")
}

function writeTree(
  options: readonly FormOption[],
  depth: number,
  lines: string[]
): void {
  const indent = "  ".repeat(depth)
  for (const option of options) {
    lines.push(`${indent}${option.label}`)
    if (optionHasChildren(option)) {
      writeTree(option.children ?? [], depth + 1, lines)
    }
  }
}

export function parseOptionTree(text: string): FormOption[] {
  const roots: MutableOption[] = []
  const stack: { indent: number; option: MutableOption }[] = []
  for (const raw of text.split("\n")) {
    if (raw.trim().length === 0) continue
    const indent = leadingIndent(raw)
    const option: MutableOption = { value: "", label: raw.trim() }
    while (stack.length > 0) {
      const parent = stack.at(-1)
      if (!parent || parent.indent < indent) break
      stack.pop()
    }
    const parent = stack.at(-1)
    if (!parent) {
      roots.push(option)
    } else {
      parent.option.children = [...(parent.option.children ?? []), option]
    }
    stack.push({ indent, option })
  }
  assignValues(roots, [])
  return roots
}

export function parseFlatOptions(text: string): FormOption[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((label, index) => ({
      value: slugifyKey(label) || `option_${index + 1}`,
      label,
    }))
}

function leadingIndent(line: string): number {
  let count = 0
  for (const char of line) {
    if (char === " ") count += 1
    else if (char === "\t") count += 2
    else break
  }
  return count
}

function assignValues(
  options: MutableOption[],
  parentPath: readonly string[]
): void {
  const taken = new Set<string>()
  for (const option of options) {
    const slug = uniqueKey(slugifyKey(option.label) || "option", taken)
    taken.add(slug)
    const value =
      parentPath.length > 0 ? `${parentPath.join("/")}/${slug}` : slug
    option.value = value
    if (option.children && option.children.length > 0) {
      assignValues(option.children, [...parentPath, slug])
    } else {
      option.children = undefined
    }
  }
}
