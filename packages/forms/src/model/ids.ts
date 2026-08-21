const RESERVED_PATH_SEGMENTS = new Set([
  "__proto__",
  "prototype",
  "constructor",
])

const PATH_SEGMENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/u

let idCounter = 0

export function createFormId(prefix = "fn"): string {
  idCounter += 1
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replaceAll("-", "").slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `${prefix}_${random}${idCounter.toString(36)}`
}

export function slugifyKey(label: string): string {
  const ascii = label
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/['’]/gu, "")
    .toLowerCase()
  let slug = ascii
    .replace(/[^a-z0-9$]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .replace(/_+/gu, "_")
  if (slug.length === 0) slug = "field"
  if (!/^[A-Za-z_$]/u.test(slug)) slug = `field_${slug}`
  if (RESERVED_PATH_SEGMENTS.has(slug)) slug = `${slug}_field`
  return slug
}

export function isValidKey(key: string): boolean {
  return PATH_SEGMENT.test(key) && !RESERVED_PATH_SEGMENTS.has(key)
}

export function uniqueKey(desired: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  const base = isValidKey(desired) ? desired : slugifyKey(desired)
  if (!used.has(base)) return base
  let index = 2
  while (used.has(`${base}_${index}`)) index += 1
  return `${base}_${index}`
}

export function prettifyKey(key: string): string {
  return key
    .split(/[._]/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}
