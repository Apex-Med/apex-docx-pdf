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
  return Object.freeze({ family, category, axes })
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
    const raw = JSON.parse(stripXssiPrefix(await response.text())) as RawMetadata
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
  return catalog.families.find(
    (entry) => entry.family.toLowerCase() === target
  )
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

/** Reset in-memory catalog cache (tests). */
export function resetGoogleFontCatalogCacheForTests(): void {
  memoryCatalog = null
}
