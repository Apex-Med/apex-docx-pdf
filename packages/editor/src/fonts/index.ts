export {
  BUILTIN_FONT_INDEX,
  EDITOR_FONT_FAMILIES,
  GOOGLE_FONT_FAMILIES,
  TAILWIND_PALETTES,
  injectDomFontFaces,
  injectGoogleFontStylesheet,
  workerFontUrls,
  loadWorkerFontBytes,
  type FontIndex,
  type FontFaceEntry,
  type FontFamilyEntry,
  type CustomPalette,
} from "./index-core"

export {
  loadGoogleFontCatalog,
  searchGoogleFonts,
  findGoogleFontFamily,
  familyHasWeightAxis,
  availableFontWeights,
  fontWeightLabel,
  nearestAvailableFontWeight,
  weightAxisRange,
  resetGoogleFontCatalogCacheForTests,
  GOOGLE_FONTS_METADATA_URL,
  GOOGLE_FONTS_CACHE_NAME,
  type GoogleFontCatalog,
  type GoogleFontFamily,
  type GoogleFontAxis,
} from "./google-catalog"

export { GOOGLE_FONT_CATALOG_FALLBACK } from "./google-catalog-fallback"

export {
  ensureFontLoaded,
  registerFontWithWorker,
  injectGoogleFontFamilyStylesheet,
  familyToSlug,
  snapToFontWeight,
  resetFontLoaderCachesForTests,
  FONT_BINARIES_CACHE_NAME,
  type EnsureFontLoadedOptions,
  type EnsureFontLoadedResult,
  type FontWorkerRegistration,
  type RegisterFontCallback,
} from "./font-loader"

export {
  fontRegistryForDocument,
  injectEmbeddedDocumentFonts,
} from "./embedded"

export {
  fontRegistryForExport,
  resetExportFontRegistryCacheForTests,
} from "./export-registry"
