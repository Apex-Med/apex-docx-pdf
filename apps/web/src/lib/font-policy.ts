import {
  OFFLINE_FONT_ALIASES,
  OFFLINE_FONT_CATALOG_VERSION,
  OFFLINE_FONT_FALLBACK_FAMILY,
  OFFLINE_FONT_FAMILIES,
} from "@apexmed/fonts"

export const FONT_CATALOG_VERSION = OFFLINE_FONT_CATALOG_VERSION

export const BUNDLED_FONT_FAMILIES = OFFLINE_FONT_FAMILIES
export const SYSTEM_FONT_ALIASES = OFFLINE_FONT_ALIASES

export const REFERENCE_FONT_POLICY = Object.freeze({
  source: "Application-owned, OFL-licensed static TrueType assets",
  allowOperatingSystemLookup: false,
  allowRuntimeNetworkFetch: false,
  allowUploadedEmbeddedFonts: false,
  fallbackFamily: OFFLINE_FONT_FALLBACK_FAMILY,
  catalogVersion: FONT_CATALOG_VERSION,
  families: BUNDLED_FONT_FAMILIES,
  systemAliases: SYSTEM_FONT_ALIASES,
})
