/**
 * Self-hosted Google Fonts index and loaders.
 * DOM gets woff2; layout worker gets ttf for FontRegistry.
 * Index hashes are SHA-256 of file bytes (see scripts/build-fonts-index.ts).
 */

import { GENERATED_FONT_INDEX } from "./fonts-index.generated"

export type FontFaceEntry = {
  family: string
  weight: number
  style: "normal" | "italic"
  /** Hash-pinned relative path or absolute URL for browser woff2. */
  woff2: string
  /** Hash-pinned relative path or absolute URL for worker ttf. */
  ttf: string
  woff2Sha256?: string
  ttfSha256?: string
}

export type FontFamilyEntry = {
  family: string
  category: string
  faces: readonly FontFaceEntry[]
}

export type FontIndex = {
  version: number
  generatedAt: string
  families: readonly FontFamilyEntry[]
}

/** Hash-pinned static-weight index (Inter + Calibri alias). */
export const BUILTIN_FONT_INDEX: FontIndex = GENERATED_FONT_INDEX

/**
 * Common Google Fonts families available in the picker. Loaded on demand via
 * the Google Fonts CSS API for DOM rendering (layout worker still uses
 * self-hosted TTFs for engine metrics when registered).
 */
export const GOOGLE_FONT_FAMILIES: readonly string[] = Object.freeze([
  "Inter",
  "Roboto",
  "Open Sans",
  "Lato",
  "Montserrat",
  "Source Sans 3",
  "Nunito",
  "Poppins",
  "Raleway",
  "Merriweather",
  "Playfair Display",
  "PT Serif",
  "Noto Sans",
  "Noto Serif",
  "Work Sans",
  "DM Sans",
  "IBM Plex Sans",
  "IBM Plex Serif",
  "Libre Baskerville",
  "Crimson Text",
  "Fira Sans",
  "Oswald",
  "Ubuntu",
  "Rubik",
  "Mulish",
  "Manrope",
  "Space Grotesk",
  "JetBrains Mono",
  "Source Code Pro",
  "Inconsolata",
])

/** Inject @font-face rules for DOM rendering from a font index. */
export function injectDomFontFaces(
  index: FontIndex = BUILTIN_FONT_INDEX,
  root?: Document | ShadowRoot
): void {
  if (typeof document === "undefined") return
  const host = root ?? document
  const existing = host.querySelector("style[data-apex-fonts]")
  if (existing) return

  const style = document.createElement("style")
  style.setAttribute("data-apex-fonts", "true")
  const rules: string[] = []
  for (const family of index.families) {
    for (const face of family.faces) {
      rules.push(
        `@font-face{font-family:'${face.family}';font-style:${face.style};font-weight:${face.weight};src:url('${face.woff2}') format('woff2');font-display:swap;}`
      )
    }
  }
  style.textContent = rules.join("\n")
  if (typeof Document !== "undefined" && host instanceof Document) {
    host.head.appendChild(style)
  } else {
    host.appendChild(style)
  }
}

/**
 * Load Google Fonts CSS for the given family names (static weights 400+700).
 * Idempotent; safe to call on mount.
 */
export function injectGoogleFontStylesheet(
  families: readonly string[] = GOOGLE_FONT_FAMILIES
): void {
  if (typeof document === "undefined") return
  if (document.getElementById("apex-google-fonts")) return
  if (families.length === 0) return
  const params = families
    .map(
      (family) =>
        `family=${encodeURIComponent(family).replace(/%20/g, "+")}:ital,wght@0,400;0,700;1,400;1,700`
    )
    .join("&")
  const link = document.createElement("link")
  link.id = "apex-google-fonts"
  link.rel = "stylesheet"
  link.href = `https://fonts.googleapis.com/css2?${params}&display=swap`
  document.head.appendChild(link)
}

/** Resolve ttf URLs for worker FontRegistry registration. */
export function workerFontUrls(
  index: FontIndex = BUILTIN_FONT_INDEX
): readonly FontFaceEntry[] {
  return index.families.flatMap((family) => family.faces)
}

/** Fetch ttf bytes for a face (worker registration). */
export async function loadWorkerFontBytes(
  face: FontFaceEntry
): Promise<Uint8Array> {
  const response = await fetch(face.ttf)
  if (!response.ok) {
    throw new Error(`Failed to load font ttf ${face.ttf}: ${response.status}`)
  }
  return new Uint8Array(await response.arrayBuffer())
}

/** Tailwind-inspired default palettes for the color picker. */
export const TAILWIND_PALETTES = Object.freeze({
  slate: ["#f8fafc", "#e2e8f0", "#94a3b8", "#475569", "#0f172a"],
  red: ["#fef2f2", "#fecaca", "#f87171", "#dc2626", "#7f1d1d"],
  orange: ["#fff7ed", "#fed7aa", "#fb923c", "#ea580c", "#7c2d12"],
  amber: ["#fffbeb", "#fde68a", "#fbbf24", "#d97706", "#78350f"],
  green: ["#f0fdf4", "#bbf7d0", "#4ade80", "#16a34a", "#14532d"],
  blue: ["#eff6ff", "#bfdbfe", "#60a5fa", "#2563eb", "#1e3a8a"],
  purple: ["#faf5ff", "#e9d5ff", "#c084fc", "#9333ea", "#581c87"],
  pink: ["#fdf2f8", "#fbcfe8", "#f472b6", "#db2777", "#831843"],
})

export type CustomPalette = Readonly<{
  id: string
  name: string
  colors: readonly string[]
}>
