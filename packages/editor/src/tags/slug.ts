const RESERVED_PATH_SEGMENTS = new Set([
  "__proto__",
  "prototype",
  "constructor",
])

const PATH_SEGMENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/u
const PATH = /^[A-Za-z_$][A-Za-z0-9_$.]*$/u

/** Turn a human label into a template path slug (`Author name` → `author_name`). */
export function slugifyLabel(label: string): string {
  const ascii = label
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/['’]/gu, "")
    .toLowerCase()
  let slug = ascii
    .replace(/[^a-z0-9$]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .replace(/_+/gu, "_")
  if (slug.length === 0) slug = "tag"
  if (!/^[A-Za-z_$]/u.test(slug)) slug = `tag_${slug}`
  if (RESERVED_PATH_SEGMENTS.has(slug)) slug = `${slug}_field`
  return slug
}

export function isValidTemplatePath(path: string): boolean {
  if (!PATH.test(path)) return false
  return path
    .split(".")
    .every((segment) => PATH_SEGMENT.test(segment) && !RESERVED_PATH_SEGMENTS.has(segment))
}

export function uniqueSlug(
  desired: string,
  taken: Iterable<string>
): string {
  const used = new Set(taken)
  const base = isValidTemplatePath(desired) ? desired : slugifyLabel(desired)
  if (!used.has(base)) return base
  let index = 2
  while (used.has(`${base}_${index}`)) index += 1
  return `${base}_${index}`
}

export function prettifySlug(slug: string): string {
  return slug
    .split(/[._]/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}
