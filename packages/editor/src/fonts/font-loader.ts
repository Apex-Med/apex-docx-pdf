import type { FontStyle, FontWeight } from "@apexmed/core"

import {
  BUILTIN_FONT_INDEX,
  injectDomFontFaces,
  loadWorkerFontBytes,
  type FontFaceEntry,
} from "./index-core"
import {
  findGoogleFontFamily,
  familyHasWeightAxis,
  loadGoogleFontCatalog,
  nearestAvailableFontWeight,
  type GoogleFontCatalog,
  type GoogleFontFamily,
  weightAxisRange,
} from "./google-catalog"

export const FONT_BINARIES_CACHE_NAME = "apex-font-binaries-v1"

export type EnsureFontLoadedOptions = Readonly<{
  weight?: number
  italic?: boolean
  catalog?: GoogleFontCatalog
  /** Called with worker-ready TTF bytes after load. */
  register?: RegisterFontCallback
}>

export type EnsureFontLoadedResult = Readonly<{
  family: string
  weight: FontWeight
  style: FontStyle
  bytes: Uint8Array
  variable: boolean
}>

export type FontWorkerRegistration = Readonly<{
  family: string
  weight: FontWeight
  style: FontStyle
  bytes: Uint8Array
}>

export type RegisterFontCallback = (
  registration: FontWorkerRegistration
) => void | Promise<void>

const STATIC_WEIGHTS: readonly FontWeight[] = Object.freeze([
  100, 200, 300, 400, 500, 600, 700, 800, 900,
])

const loadedDomFamilies = new Set<string>()
const loadedBinaryKeys = new Set<string>()

export function familyToSlug(family: string): string {
  return family
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
}

export function snapToFontWeight(weight: number): FontWeight {
  let nearest: FontWeight = 400
  let distance = Number.POSITIVE_INFINITY
  for (const candidate of STATIC_WEIGHTS) {
    const next = Math.abs(candidate - weight)
    if (next < distance) {
      distance = next
      nearest = candidate
    }
  }
  return nearest
}

function clampWeight(
  weight: number,
  family: GoogleFontFamily | undefined
): number {
  if (!family) return snapToFontWeight(weight)
  return nearestAvailableFontWeight(family, weight)
}

function buildGoogleCss2FamilyParam(family: GoogleFontFamily): string {
  const encoded = encodeURIComponent(family.family).replace(/%20/g, "+")
  const wght = weightAxisRange(family)
  const ital = family.axes.find((axis) => axis.tag === "ital")
  if (wght && ital) {
    return `family=${encoded}:ital,wght@0,${wght.min}..${wght.max};1,${wght.min}..${wght.max}`
  }
  if (wght) {
    return `family=${encoded}:wght@${wght.min}..${wght.max}`
  }
  return `family=${encoded}`
}

/** Inject a Google Fonts CSS2 stylesheet for one family (variable axes when available). */
export function injectGoogleFontFamilyStylesheet(
  family: GoogleFontFamily
): void {
  if (typeof document === "undefined") return
  const slug = familyToSlug(family.family)
  const id = `apex-google-font-${slug}`
  if (document.getElementById(id)) return
  const link = document.createElement("link")
  link.id = id
  link.rel = "stylesheet"
  link.href = `https://fonts.googleapis.com/css2?${buildGoogleCss2FamilyParam(family)}&display=swap`
  document.head.appendChild(link)
}

function builtinFace(
  family: string,
  weight: FontWeight,
  style: FontStyle
): FontFaceEntry | undefined {
  const entry = BUILTIN_FONT_INDEX.families.find(
    (item) =>
      item.family.toLowerCase() === family.toLowerCase() &&
      item.faces.some((face) => face.weight === weight && face.style === style)
  )
  if (!entry) return undefined
  return entry.faces.find(
    (face) => face.weight === weight && face.style === style
  )
}

function variableFontBinaryUrl(slug: string): string {
  return `https://cdn.jsdelivr.net/gh/fontsource/font-files@main/fonts/google/${slug}/${slug}-latin-wght-normal.ttf`
}

function staticFontBinaryUrl(
  slug: string,
  weight: FontWeight,
  style: FontStyle
): string {
  const styleToken = style === "italic" ? "italic" : "normal"
  return `https://cdn.jsdelivr.net/gh/fontsource/font-files@main/fonts/google/${slug}/${slug}-latin-${weight}-${styleToken}.ttf`
}

async function readBinaryCache(url: string): Promise<Uint8Array | null> {
  if (typeof caches === "undefined") return null
  try {
    const cache = await caches.open(FONT_BINARIES_CACHE_NAME)
    const response = await cache.match(url)
    if (!response?.ok) return null
    return new Uint8Array(await response.arrayBuffer())
  } catch {
    return null
  }
}

async function writeBinaryCache(url: string, bytes: Uint8Array): Promise<void> {
  if (typeof caches === "undefined") return
  try {
    const cache = await caches.open(FONT_BINARIES_CACHE_NAME)
    await cache.put(
      url,
      new Response(bytes.slice(), {
        headers: { "Content-Type": "font/ttf" },
      })
    )
  } catch {
    // Non-fatal.
  }
}

async function fetchBinary(url: string): Promise<Uint8Array> {
  const cached = await readBinaryCache(url)
  if (cached) return cached
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch font binary ${url}: ${response.status}`)
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  await writeBinaryCache(url, bytes)
  return bytes
}

async function loadGoogleFontBinary(
  familyName: string,
  meta: GoogleFontFamily | undefined,
  weight: FontWeight,
  style: FontStyle
): Promise<{ bytes: Uint8Array; variable: boolean }> {
  const slug = familyToSlug(familyName)
  const variable = meta !== undefined && familyHasWeightAxis(meta)
  if (variable) {
    try {
      const url = variableFontBinaryUrl(slug)
      const bytes = await fetchBinary(url)
      return { bytes, variable: true }
    } catch {
      // Fall through to static snap.
    }
  }
  const url = staticFontBinaryUrl(slug, weight, style)
  const bytes = await fetchBinary(url)
  return { bytes, variable: false }
}

export async function registerFontWithWorker(
  callback: RegisterFontCallback,
  family: string,
  bytes: Uint8Array,
  weight: FontWeight,
  style: FontStyle = "normal"
): Promise<void> {
  await callback({ family, weight, style, bytes })
}

/**
 * Ensure a font is available for DOM preview and layout worker metrics.
 * Self-hosted builtins are preferred; Google families load on demand.
 */
export async function ensureFontLoaded(
  familyName: string,
  options: EnsureFontLoadedOptions = {}
): Promise<EnsureFontLoadedResult> {
  const italic = options.italic === true
  const style: FontStyle = italic ? "italic" : "normal"
  const catalog = options.catalog ?? (await loadGoogleFontCatalog())
  const meta = findGoogleFontFamily(catalog, familyName)
  const requestedWeight =
    options.weight ??
    meta?.axes.find((a) => a.tag === "wght")?.defaultValue ??
    400
  const weight = snapToFontWeight(clampWeight(requestedWeight, meta))

  const builtin = builtinFace(familyName, weight, style)
  if (builtin) {
    injectDomFontFaces(BUILTIN_FONT_INDEX)
    const bytes = await loadWorkerFontBytes(builtin)
    const result: EnsureFontLoadedResult = Object.freeze({
      family: familyName,
      weight,
      style,
      bytes,
      variable: false,
    })
    if (options.register) {
      await registerFontWithWorker(
        options.register,
        familyName,
        bytes,
        weight,
        style
      )
    }
    return result
  }

  if (meta) {
    injectGoogleFontFamilyStylesheet(meta)
    loadedDomFamilies.add(meta.family)
  }

  const binaryKey = `${familyToSlug(familyName)}:${weight}:${style}`
  let bytes: Uint8Array
  let variable = false
  if (loadedBinaryKeys.has(binaryKey)) {
    const { bytes: loaded, variable: isVariable } = await loadGoogleFontBinary(
      familyName,
      meta,
      weight,
      style
    )
    bytes = loaded
    variable = isVariable
  } else {
    const loaded = await loadGoogleFontBinary(familyName, meta, weight, style)
    bytes = loaded.bytes
    variable = loaded.variable
    loadedBinaryKeys.add(binaryKey)
  }

  const result: EnsureFontLoadedResult = Object.freeze({
    family: familyName,
    weight,
    style,
    bytes,
    variable,
  })

  if (options.register) {
    await registerFontWithWorker(
      options.register,
      familyName,
      bytes,
      weight,
      style
    )
  }

  return result
}

/** Reset loader caches (tests). */
export function resetFontLoaderCachesForTests(): void {
  loadedDomFamilies.clear()
  loadedBinaryKeys.clear()
}
