import type {
  FontFaceRegistration,
  FontStyle,
  FontWeight,
  SemanticBlock,
  SemanticDocument,
  SemanticFontAsset,
  SemanticHeaderFooter,
  SemanticInline,
} from "@apexmed/core"
import {
  OFFLINE_FONT_ALIASES,
  OFFLINE_FONT_CATALOG,
  OFFLINE_FONT_FALLBACK_FAMILY,
  createFontRegistry,
  type ManagedFontRegistry,
} from "@apexmed/fonts"

import { catalogFontAssetUrls } from "./catalog-font-urls.generated"

const EDITOR_INTER_FACES = [
  {
    family: "Inter",
    weight: 400 as const,
    style: "normal" as const,
    file: "inter-400.ttf",
    catalog: "catalog/inter/Inter-Regular.ttf",
  },
  {
    family: "Inter",
    weight: 500 as const,
    style: "normal" as const,
    file: "inter-500.ttf",
    catalog: "catalog/inter/Inter-Medium.ttf",
  },
  {
    family: "Inter",
    weight: 600 as const,
    style: "normal" as const,
    file: "inter-600.ttf",
    catalog: "catalog/inter/Inter-SemiBold.ttf",
  },
  {
    family: "Inter",
    weight: 700 as const,
    style: "normal" as const,
    file: "inter-700.ttf",
    catalog: "catalog/inter/Inter-Bold.ttf",
  },
] as const

let catalogFacesPromise: Promise<readonly FontFaceRegistration[]> | undefined
const exportRegistryCache = new WeakMap<
  SemanticDocument,
  Promise<ManagedFontRegistry | undefined>
>()

function faceKey(
  family: string,
  weight: FontWeight,
  style: FontStyle
): string {
  return `${family.toLowerCase()}\u0000${weight}\u0000${style}`
}

async function readResolvedBytes(spec: string): Promise<Uint8Array | undefined> {
  try {
    const resolved = import.meta.resolve(spec)
    const url = new URL(resolved, import.meta.url)
    if (url.protocol === "file:") {
      const { readFileSync } = await import("node:fs")
      const { fileURLToPath } = await import("node:url")
      return new Uint8Array(readFileSync(fileURLToPath(url)))
    }
    if (typeof fetch === "function") {
      const response = await fetch(url)
      if (response.ok) return new Uint8Array(await response.arrayBuffer())
    }
  } catch {
    return undefined
  }
  return undefined
}

async function readPublicFont(file: string): Promise<Uint8Array | undefined> {
  if (typeof fetch !== "function") return undefined
  try {
    const response = await fetch(`/fonts/${file}`)
    if (response.ok) return new Uint8Array(await response.arrayBuffer())
  } catch {
    return undefined
  }
  return undefined
}

async function readBundledCatalogUrl(url: string): Promise<Uint8Array | undefined> {
  // Bun resolves `?url` imports to absolute filesystem paths; Vite emits fetchable URLs.
  if (url.startsWith("/") && !url.startsWith("//")) {
    try {
      const { readFileSync } = await import("node:fs")
      return new Uint8Array(readFileSync(url))
    } catch {
      // Fall through to fetch for non-Node hosts.
    }
  }
  if (typeof fetch !== "function") return undefined
  try {
    const response = await fetch(url)
    if (!response.ok) return undefined
    return new Uint8Array(await response.arrayBuffer())
  } catch {
    return undefined
  }
}

async function readCatalogAssetBytes(asset: string): Promise<Uint8Array | undefined> {
  const fromPackage =
    (await readResolvedBytes(`@apexmed/fonts/assets/${asset}`)) ??
    (await readResolvedBytes(`../../../fonts/assets/${asset}`))
  if (fromPackage) return fromPackage

  const bundledUrl = catalogFontAssetUrls[asset as keyof typeof catalogFontAssetUrls]
  if (!bundledUrl) return undefined
  return readBundledCatalogUrl(bundledUrl)
}

async function loadCatalogFaces(): Promise<readonly FontFaceRegistration[]> {
  const faces: FontFaceRegistration[] = []
  for (const family of OFFLINE_FONT_CATALOG) {
    for (const face of family.faces) {
      const bytes = await readCatalogAssetBytes(face.asset)
      if (!bytes) return []
      faces.push({
        family: family.family,
        weight: face.weight,
        style: face.style,
        bytes,
      })
    }
  }
  return faces
}

async function loadBuiltinInterFaces(): Promise<readonly FontFaceRegistration[]> {
  const faces: FontFaceRegistration[] = []
  for (const face of EDITOR_INTER_FACES) {
    const bytes =
      (await readResolvedBytes(`../../assets/fonts/${face.file}`)) ??
      (await readResolvedBytes(`@apexmed/fonts/assets/${face.catalog}`)) ??
      (await readPublicFont(face.file))
    if (!bytes) continue
    faces.push({
      family: face.family,
      weight: face.weight,
      style: face.style,
      bytes,
    })
  }
  return faces
}

function collectUsedFamilies(document: SemanticDocument): ReadonlySet<string> {
  const families = new Set<string>([OFFLINE_FONT_FALLBACK_FAMILY])
  const visitInline = (inline: SemanticInline): void => {
    if (inline.type === "text" || inline.type === "pageField") {
      families.add(inline.style.fontFamily)
    }
  }
  const visitBlocks = (blocks: readonly SemanticBlock[]): void => {
    for (const block of blocks) {
      if (block.type === "paragraph") {
        for (const child of block.children) visitInline(child)
      } else if (block.type === "table") {
        for (const row of block.rows) {
          for (const cell of row.cells) visitBlocks(cell.blocks)
        }
      }
    }
  }
  const visitPart = (part: SemanticHeaderFooter): void => {
    visitBlocks(part.blocks)
  }
  for (const section of document.sections) visitBlocks(section.blocks)
  for (const header of document.headers) visitPart(header)
  for (const footer of document.footers) visitPart(footer)
  const defaults = document.styles?.defaults.text.fontFamily
  if (defaults) families.add(defaults)
  return families
}

function facesFromAssets(
  assets: readonly SemanticFontAsset[] | undefined
): FontFaceRegistration[] {
  return (assets ?? []).map((asset) => ({
    family: asset.family,
    weight: asset.weight,
    style: asset.style,
    bytes: Uint8Array.from(asset.bytes),
  }))
}

function mergeFaces(
  ...groups: readonly (readonly FontFaceRegistration[])[]
): FontFaceRegistration[] {
  const byKey = new Map<string, FontFaceRegistration>()
  for (const group of groups) {
    for (const face of group) {
      byKey.set(faceKey(face.family, face.weight, face.style), face)
    }
  }
  return [...byKey.values()]
}

async function catalogOrBuiltinFaces(): Promise<readonly FontFaceRegistration[]> {
  catalogFacesPromise ??= loadCatalogFaces()
  const catalog = await catalogFacesPromise
  if (catalog.length > 0) return catalog
  return loadBuiltinInterFaces()
}

/**
 * Fonts for editor PDF/print: document-embedded programs plus the full
 * offline six-family catalog (every published static weight).
 */
export function fontRegistryForExport(
  document: SemanticDocument
): Promise<ManagedFontRegistry | undefined> {
  const cached = exportRegistryCache.get(document)
  if (cached) return cached
  const promise = buildExportRegistry(document)
  exportRegistryCache.set(document, promise)
  return promise
}

async function buildExportRegistry(
  document: SemanticDocument
): Promise<ManagedFontRegistry | undefined> {
  const usedFamilies = collectUsedFamilies(document)
  const aliasedTargets = new Set<string>()
  for (const alias of OFFLINE_FONT_ALIASES) {
    if (usedFamilies.has(alias.from)) aliasedTargets.add(alias.to)
  }
  const wanted = new Set([...usedFamilies, ...aliasedTargets, "Inter"])
  const catalog = (await catalogOrBuiltinFaces()).filter((face) =>
    wanted.has(face.family)
  )
  const faces = mergeFaces(catalog, facesFromAssets(document.fontAssets))
  const families = new Set(faces.map((face) => face.family))
  const fallbackFamily = families.has(OFFLINE_FONT_FALLBACK_FAMILY)
    ? OFFLINE_FONT_FALLBACK_FAMILY
    : faces.find((face) => face.weight === 400 && face.style === "normal")
        ?.family
  if (
    fallbackFamily === undefined ||
    !faces.some(
      (face) =>
        face.family === fallbackFamily &&
        face.weight === 400 &&
        face.style === "normal"
    )
  ) {
    return undefined
  }
  const aliases = OFFLINE_FONT_ALIASES.filter((alias) =>
    families.has(alias.to)
  )
  return createFontRegistry({
    faces,
    aliases,
    fallbackFamily,
  })
}

/** Reset cached catalog bytes (tests). */
export function resetExportFontRegistryCacheForTests(): void {
  catalogFacesPromise = undefined
}
