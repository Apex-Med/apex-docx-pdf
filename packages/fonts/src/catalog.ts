import type { FontWeight } from "@apexmed/core"
import { GENERATED_OFFLINE_FONT_FACES } from "./catalog-faces.generated"

export const OFFLINE_FONT_CATALOG_VERSION = "apex-offline-ttf/v3"

export type OfflineFontCatalogFace = Readonly<{
  asset: string
  sha256: string
  weight: FontWeight
  style: "normal" | "italic"
}>

export type OfflineFontCatalogFamily = Readonly<{
  family: string
  source: string
  revision: string
  license: "OFL-1.1"
  faces: readonly OfflineFontCatalogFace[]
}>

const GOOGLE_FONTS_REVISION = "e1118da94a8cb00cf6d06cdac9ef13eb1e5c6ab7"

export const OFFLINE_FONT_CATALOG = Object.freeze([
  catalogFamily("Inter", "ofl/inter"),
  catalogFamily("Instrument Sans", "ofl/instrumentsans"),
  catalogFamily("Instrument Serif", "ofl/instrumentserif"),
  catalogFamily("Geist", "ofl/geist"),
  catalogFamily("Geist Mono", "ofl/geistmono"),
  catalogFamily("Bricolage Grotesque", "ofl/bricolagegrotesque"),
] as const satisfies readonly OfflineFontCatalogFamily[])

export const OFFLINE_FONT_FAMILIES = Object.freeze(
  OFFLINE_FONT_CATALOG.map(({ family }) => family)
)

export const OFFLINE_FONT_ALIASES = Object.freeze([
  Object.freeze({ from: "Arial", to: "Inter" }),
  Object.freeze({ from: "Calibri", to: "Inter" }),
  Object.freeze({ from: "Helvetica", to: "Inter" }),
  Object.freeze({ from: "Times New Roman", to: "Instrument Serif" }),
  Object.freeze({ from: "Courier New", to: "Geist Mono" }),
  Object.freeze({ from: "Inter Variable", to: "Inter" }),
  Object.freeze({ from: "Inter Medium", to: "Inter", weight: 500 }),
  Object.freeze({ from: "Inter SemiBold", to: "Inter", weight: 600 }),
  Object.freeze({ from: "BricolageGrotesque", to: "Bricolage Grotesque" }),
  Object.freeze({
    from: "Bricolage Grotesque Medium",
    to: "Bricolage Grotesque",
    weight: 500,
  }),
  Object.freeze({
    from: "Bricolage Grotesque SemiBold",
    to: "Bricolage Grotesque",
    weight: 600,
  }),
  Object.freeze({ from: "InstrumentSans", to: "Instrument Sans" }),
  Object.freeze({ from: "InstrumentSerif", to: "Instrument Serif" }),
  Object.freeze({ from: "GeistMono", to: "Geist Mono" }),
])

export const OFFLINE_FONT_FALLBACK_FAMILY = "Inter"

function catalogFamily(
  family: keyof typeof GENERATED_OFFLINE_FONT_FACES,
  sourcePath: string
): OfflineFontCatalogFamily {
  return Object.freeze({
    family,
    source: `https://github.com/google/fonts/tree/${GOOGLE_FONTS_REVISION}/${sourcePath}`,
    revision: GOOGLE_FONTS_REVISION,
    license: "OFL-1.1",
    faces: Object.freeze(GENERATED_OFFLINE_FONT_FACES[family]),
  })
}
