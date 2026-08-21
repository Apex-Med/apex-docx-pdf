import { GOOGLE_FONT_CATALOG_FALLBACK } from "./google-catalog-fallback"

export const GOOGLE_FONTS_METADATA_URL =
  "https://fonts.google.com/metadata/fonts"

export const GOOGLE_FONTS_CACHE_NAME = "apex-google-fonts-meta-v1"

export type GoogleFontAxis = Readonly<{
  tag: string
  min: number
  max: number
  defaultValue: number
}>

export type GoogleFontFamily = Readonly<{
  family: string
  category: string
  axes: readonly GoogleFontAxis[]
  /** Named CSS weights published for this family. */
  weights?: readonly number[]
}>

export type GoogleFontCatalog = Readonly<{
  version: number
  families: readonly GoogleFontFamily[]
  source: "network" | "fallback"
}>

type RawAxis = Readonly<{
  tag?: string
  min?: number
  max?: number
  minValue?: number
  maxValue?: number
  default?: number
  defaultValue?: number
}>

type RawFamily = Readonly<{
  family?: string
  category?: string
  axes?: readonly RawAxis[]
  fonts?: Readonly<Record<string, unknown>>
}>

type RawMetadata = Readonly<{
  familyMetadataList?: readonly RawFamily[]
}>

let memoryCatalog: GoogleFontCatalog | null = null

function stripXssiPrefix(text: string): string {
  const trimmed = text.trimStart()
  if (trimmed.startsWith(")]}'")) {
    const newline = trimmed.indexOf("\n")
    return newline >= 0 ? trimmed.slice(newline + 1) : trimmed.slice(4)
  }
  return trimmed
}

function parseAxis(raw: RawAxis): GoogleFontAxis | null {
  const tag = raw.tag?.trim()
  if (!tag) return null
  const min = raw.min ?? raw.minValue
  const max = raw.max ?? raw.maxValue
  const defaultValue = raw.default ?? raw.defaultValue
  if (
    min === undefined ||
    max === undefined ||
    defaultValue === undefined ||
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    !Number.isFinite(defaultValue)
  ) {
    return null
  }
  return Object.freeze({
    tag,
    min,
    max,
    defaultValue,
  })
}

function parseFamily(raw: RawFamily): GoogleFontFamily | null {
  const family = raw.family?.trim()
  if (!family) return null
  const category = raw.category?.trim() ?? "Sans Serif"
  const axes = (raw.axes ?? [])
    .map(parseAxis)
    .filter((axis): axis is GoogleFontAxis => axis !== null)
  const weights = Object.keys(raw.fonts ?? {})
    .map((key) => Number.parseInt(key, 10))
    .filter(
      (weight, index, list) =>
        Number.isInteger(weight) &&
        weight >= 100 &&
        weight <= 900 &&
        list.indexOf(weight) === index
    )
    .sort((left, right) => left - right)
  return Object.freeze({
    family,
    category,
    axes,
    ...(weights.length === 0 ? {} : { weights: Object.freeze(weights) }),
  })
}

function catalogFromRaw(
  raw: RawMetadata,
  source: "network" | "fallback"
): GoogleFontCatalog {
  const families = (raw.familyMetadataList ?? [])
    .map(parseFamily)
    .filter((entry): entry is GoogleFontFamily => entry !== null)
    .sort((left, right) => left.family.localeCompare(right.family))
  return Object.freeze({
    version: 1,
    families: Object.freeze(families),
    source,
  })
}

function fallbackCatalog(): GoogleFontCatalog {
  return Object.freeze({
    version: 1,
    families: GOOGLE_FONT_CATALOG_FALLBACK,
    source: "fallback",
  })
}

async function readCache(): Promise<GoogleFontCatalog | null> {
  if (typeof caches === "undefined") return null
  try {
    const cache = await caches.open(GOOGLE_FONTS_CACHE_NAME)
    const response = await cache.match(GOOGLE_FONTS_METADATA_URL)
    if (!response?.ok) return null
    const raw = JSON.parse(
      stripXssiPrefix(await response.text())
    ) as RawMetadata
    const catalog = catalogFromRaw(raw, "network")
    return catalog.families.length > 0 ? catalog : null
  } catch {
    return null
  }
}

async function writeCache(text: string): Promise<void> {
  if (typeof caches === "undefined") return
  try {
    const cache = await caches.open(GOOGLE_FONTS_CACHE_NAME)
    await cache.put(
      GOOGLE_FONTS_METADATA_URL,
      new Response(text, {
        headers: { "Content-Type": "application/json" },
      })
    )
  } catch {
    // Cache failures are non-fatal.
  }
}

/** Load the Google Fonts metadata catalog (network + Cache API + offline fallback). */
export async function loadGoogleFontCatalog(): Promise<GoogleFontCatalog> {
  if (memoryCatalog) return memoryCatalog

  const cached = await readCache()
  if (cached) {
    memoryCatalog = cached
    return cached
  }

  try {
    const response = await fetch(GOOGLE_FONTS_METADATA_URL)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const text = await response.text()
    const raw = JSON.parse(stripXssiPrefix(text)) as RawMetadata
    const catalog = catalogFromRaw(raw, "network")
    if (catalog.families.length === 0) throw new Error("Empty catalog")
    memoryCatalog = catalog
    await writeCache(text)
    return catalog
  } catch {
    const catalog = fallbackCatalog()
    memoryCatalog = catalog
    return catalog
  }
}

/** Case-insensitive search across family names. */
export function searchGoogleFonts(
  catalog: GoogleFontCatalog,
  query: string
): readonly GoogleFontFamily[] {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return catalog.families
  return catalog.families.filter((entry) =>
    entry.family.toLowerCase().includes(trimmed)
  )
}

/** Find a single family entry in a catalog (exact name match). */
export function findGoogleFontFamily(
  catalog: GoogleFontCatalog,
  family: string
): GoogleFontFamily | undefined {
  const target = family.trim().toLowerCase()
  return catalog.families.find((entry) => entry.family.toLowerCase() === target)
}

/** Whether a family supports a weight (`wght`) variation axis. */
export function familyHasWeightAxis(family: GoogleFontFamily): boolean {
  return family.axes.some((axis) => axis.tag === "wght")
}

/** Resolve the wght axis range for a family, if present. */
export function weightAxisRange(
  family: GoogleFontFamily
): GoogleFontAxis | undefined {
  return family.axes.find((axis) => axis.tag === "wght")
}

const CSS_FONT_WEIGHTS = Object.freeze([
  100, 200, 300, 400, 500, 600, 700, 800, 900,
])

/** Return the discrete, user-selectable weights that a family actually ships. */
export function availableFontWeights(
  family: GoogleFontFamily
): readonly number[] {
  const published = (family.weights ?? []).filter((weight) =>
    CSS_FONT_WEIGHTS.includes(weight)
  )
  if (published.length > 0) {
    return Object.freeze(
      [...new Set(published)].sort((left, right) => left - right)
    )
  }
  const axis = weightAxisRange(family)
  if (axis) {
    return Object.freeze(
      CSS_FONT_WEIGHTS.filter(
        (weight) => weight >= axis.min && weight <= axis.max
      )
    )
  }
  return Object.freeze([400])
}

/** Snap an arbitrary value to the closest weight published by a family. */
export function nearestAvailableFontWeight(
  family: GoogleFontFamily,
  requestedWeight: number
): number {
  const weights = availableFontWeights(family)
  return weights.reduce((nearest, candidate) => {
    const candidateDistance = Math.abs(candidate - requestedWeight)
    const nearestDistance = Math.abs(nearest - requestedWeight)
    return candidateDistance < nearestDistance ? candidate : nearest
  }, weights[0] ?? 400)
}

/** Human-readable OpenType/CSS name for a discrete font weight. */
export function fontWeightLabel(weight: number): string {
  switch (weight) {
    case 100:
      return "Thin"
    case 200:
      return "Extra light"
    case 300:
      return "Light"
    case 400:
      return "Regular"
    case 500:
      return "Medium"
    case 600:
      return "Semibold"
    case 700:
      return "Bold"
    case 800:
      return "Extra bold"
    case 900:
      return "Black"
    default:
      return String(weight)
  }
}

/** Reset in-memory catalog cache (tests). */
export function resetGoogleFontCatalogCacheForTests(): void {
  memoryCatalog = null
}
