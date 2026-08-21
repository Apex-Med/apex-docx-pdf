import type { SemanticDocument } from "@apexmed/core"
import { layoutDocument, type PreparedBlockCache } from "@apexmed/layout"

import { fontRegistryForDocument } from "../fonts/embedded"

/** Layout with the same embedded font programs painted by the editor DOM. */
export async function layoutDocumentWithEmbeddedFonts(
  document: SemanticDocument,
  options: Readonly<{
    includeTrace: true
    maxPages?: number
    cache?: PreparedBlockCache
  }>
) {
  const fonts = await fontRegistryForDocument(document)
  const common = {
    includeTrace: options.includeTrace,
    maxPages: options.maxPages,
    ...(options.cache ? { cache: options.cache } : {}),
  }
  return fonts
    ? layoutDocument(document, { ...common, fonts, shaper: fonts })
    : layoutDocument(document, common)
}
