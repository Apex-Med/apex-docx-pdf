import { isRecord } from "@/lib/json-editor"

type PathSegment = string | number

const unsafeSegments = new Set(["__proto__", "constructor", "prototype"])

export function concretePath(
  canonicalPath: string,
  indexes: readonly number[]
): string | undefined {
  const segments = canonicalPath.split(".")
  if (segments.some((segment) => !segment)) return undefined

  let indexOffset = 0
  const concrete: string[] = []
  for (const segment of segments) {
    const array = segment.endsWith("[]")
    const name = array ? segment.slice(0, -2) : segment
    if (!isSafeProperty(name) || name.includes("[") || name.includes("]")) {
      return undefined
    }
    if (!array) {
      concrete.push(name)
      continue
    }
    const index = indexes[indexOffset]
    if (!Number.isSafeInteger(index) || index === undefined || index < 0) {
      return undefined
    }
    concrete.push(`${name}[${index}]`)
    indexOffset += 1
  }

  return indexOffset === indexes.length ? concrete.join(".") : undefined
}

export function getPath(data: unknown, path: string): unknown {
  const segments = parseConcretePath(path)
  if (!segments) return undefined
  let current = data
  for (const segment of segments) {
    if (typeof segment === "number") {
      if (!Array.isArray(current)) return undefined
      current = current[segment]
    } else {
      if (!isRecord(current)) return undefined
      current = current[segment]
    }
  }
  return current
}

export function setPath(
  data: Readonly<Record<string, unknown>>,
  path: string,
  value: unknown
): Readonly<Record<string, unknown>> {
  const segments = parseConcretePath(path)
  if (!segments || typeof segments[0] !== "string") return data
  return updateAt(data, segments, value) as Readonly<Record<string, unknown>>
}

export function addArrayItem(
  data: Readonly<Record<string, unknown>>,
  path: string,
  item: unknown = {}
): Readonly<Record<string, unknown>> {
  const segments = parseConcretePath(path)
  if (!segments || typeof segments[0] !== "string") return data
  const existing = getPath(data, path)
  const next = Array.isArray(existing) ? [...existing, item] : [item]
  return updateAt(data, segments, next) as Readonly<Record<string, unknown>>
}

export function removeArrayItem(
  data: Readonly<Record<string, unknown>>,
  path: string,
  index: number
): Readonly<Record<string, unknown>> {
  if (!Number.isSafeInteger(index) || index < 0) return data
  const segments = parseConcretePath(path)
  if (!segments || typeof segments[0] !== "string") return data
  const existing = getPath(data, path)
  if (!Array.isArray(existing) || index >= existing.length) return data
  const next = existing.filter((_, itemIndex) => itemIndex !== index)
  return updateAt(data, segments, next) as Readonly<Record<string, unknown>>
}

function parseConcretePath(path: string): readonly PathSegment[] | undefined {
  if (!path) return undefined
  const result: PathSegment[] = []
  for (const part of path.split(".")) {
    const match = /^(.+?)((?:\[\d+\])*)$/u.exec(part)
    const name = match?.[1] ?? ""
    if (
      !match ||
      !isSafeProperty(name) ||
      name.includes("[") ||
      name.includes("]")
    ) {
      return undefined
    }
    result.push(name)
    const indexes = match[2]?.matchAll(/\[(\d+)\]/gu) ?? []
    for (const indexMatch of indexes) {
      const index = Number(indexMatch[1])
      if (!Number.isSafeInteger(index)) return undefined
      result.push(index)
    }
  }
  return result
}

function isSafeProperty(segment: string): boolean {
  return segment.length > 0 && !unsafeSegments.has(segment)
}

function updateAt(
  current: unknown,
  segments: readonly PathSegment[],
  value: unknown
): unknown {
  if (segments.length === 0) return value
  const [segment, ...rest] = segments
  const nextSegment = rest[0]

  if (typeof segment === "number") {
    const result = Array.isArray(current) ? [...current] : []
    result[segment] = updateAt(result[segment], rest, value)
    return result
  }

  const result: Record<string, unknown> = isRecord(current)
    ? { ...current }
    : {}
  const child = result[segment]
  const compatibleChild =
    typeof nextSegment === "number"
      ? Array.isArray(child)
        ? child
        : []
      : isRecord(child)
        ? child
        : {}
  result[segment] = updateAt(
    child === undefined ? compatibleChild : child,
    rest,
    value
  )
  return result
}
