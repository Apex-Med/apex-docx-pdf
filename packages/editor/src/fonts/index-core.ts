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

/** Product font families that must remain available even when metadata is offline. */
export const EDITOR_FONT_FAMILIES = Object.freeze([
  "Inter",
  "Instrument Sans",
  "Instrument Serif",
  "Geist",
  "Geist Mono",
  "Bricolage Grotesque",
] as const)

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

/** Tailwind's default color families, ordered from shade 50 through 950. */
export const TAILWIND_PALETTES = Object.freeze({
  neutral: [
    "#fafafa",
    "#f5f5f5",
    "#e5e5e5",
    "#d4d4d4",
    "#a3a3a3",
    "#737373",
    "#525252",
    "#404040",
    "#262626",
    "#171717",
    "#0a0a0a",
  ],
  red: [
    "#fef2f2",
    "#fee2e2",
    "#fecaca",
    "#fca5a5",
    "#f87171",
    "#ef4444",
    "#dc2626",
    "#b91c1c",
    "#991b1b",
    "#7f1d1d",
    "#450a0a",
  ],
  orange: [
    "#fff7ed",
    "#ffedd5",
    "#fed7aa",
    "#fdba74",
    "#fb923c",
    "#f97316",
    "#ea580c",
    "#c2410c",
    "#9a3412",
    "#7c2d12",
    "#431407",
  ],
  amber: [
    "#fffbeb",
    "#fef3c7",
    "#fde68a",
    "#fcd34d",
    "#fbbf24",
    "#f59e0b",
    "#d97706",
    "#b45309",
    "#92400e",
    "#78350f",
    "#451a03",
  ],
  yellow: [
    "#fefce8",
    "#fef9c3",
    "#fef08a",
    "#fde047",
    "#facc15",
    "#eab308",
    "#ca8a04",
    "#a16207",
    "#854d0e",
    "#713f12",
    "#422006",
  ],
  lime: [
    "#f7fee7",
    "#ecfccb",
    "#d9f99d",
    "#bef264",
    "#a3e635",
    "#84cc16",
    "#65a30d",
    "#4d7c0f",
    "#3f6212",
    "#365314",
    "#1a2e05",
  ],
  green: [
    "#f0fdf4",
    "#dcfce7",
    "#bbf7d0",
    "#86efac",
    "#4ade80",
    "#22c55e",
    "#16a34a",
    "#15803d",
    "#166534",
    "#14532d",
    "#052e16",
  ],
  emerald: [
    "#ecfdf5",
    "#d1fae5",
    "#a7f3d0",
    "#6ee7b7",
    "#34d399",
    "#10b981",
    "#059669",
    "#047857",
    "#065f46",
    "#064e3b",
    "#022c22",
  ],
  teal: [
    "#f0fdfa",
    "#ccfbf1",
    "#99f6e4",
    "#5eead4",
    "#2dd4bf",
    "#14b8a6",
    "#0d9488",
    "#0f766e",
    "#115e59",
    "#134e4a",
    "#042f2e",
  ],
  cyan: [
    "#ecfeff",
    "#cffafe",
    "#a5f3fc",
    "#67e8f9",
    "#22d3ee",
    "#06b6d4",
    "#0891b2",
    "#0e7490",
    "#155e75",
    "#164e63",
    "#083344",
  ],
  sky: [
    "#f0f9ff",
    "#e0f2fe",
    "#bae6fd",
    "#7dd3fc",
    "#38bdf8",
    "#0ea5e9",
    "#0284c7",
    "#0369a1",
    "#075985",
    "#0c4a6e",
    "#082f49",
  ],
  blue: [
    "#eff6ff",
    "#dbeafe",
    "#bfdbfe",
    "#93c5fd",
    "#60a5fa",
    "#3b82f6",
    "#2563eb",
    "#1d4ed8",
    "#1e40af",
    "#1e3a8a",
    "#172554",
  ],
  indigo: [
    "#eef2ff",
    "#e0e7ff",
    "#c7d2fe",
    "#a5b4fc",
    "#818cf8",
    "#6366f1",
    "#4f46e5",
    "#4338ca",
    "#3730a3",
    "#312e81",
    "#1e1b4b",
  ],
  violet: [
    "#f5f3ff",
    "#ede9fe",
    "#ddd6fe",
    "#c4b5fd",
    "#a78bfa",
    "#8b5cf6",
    "#7c3aed",
    "#6d28d9",
    "#5b21b6",
    "#4c1d95",
    "#2e1065",
  ],
  purple: [
    "#faf5ff",
    "#f3e8ff",
    "#e9d5ff",
    "#d8b4fe",
    "#c084fc",
    "#a855f7",
    "#9333ea",
    "#7e22ce",
    "#6b21a8",
    "#581c87",
    "#3b0764",
  ],
  fuchsia: [
    "#fdf4ff",
    "#fae8ff",
    "#f5d0fe",
    "#f0abfc",
    "#e879f9",
    "#d946ef",
    "#c026d3",
    "#a21caf",
    "#86198f",
    "#701a75",
    "#4a044e",
  ],
  pink: [
    "#fdf2f8",
    "#fce7f3",
    "#fbcfe8",
    "#f9a8d4",
    "#f472b6",
    "#ec4899",
    "#db2777",
    "#be185d",
    "#9d174d",
    "#831843",
    "#500724",
  ],
  rose: [
    "#fff1f2",
    "#ffe4e6",
    "#fecdd3",
    "#fda4af",
    "#fb7185",
    "#f43f5e",
    "#e11d48",
    "#be123c",
    "#9f1239",
    "#881337",
    "#4c0519",
  ],
})

export type CustomPalette = Readonly<{
  id: string
  name: string
  colors: readonly string[]
}>
