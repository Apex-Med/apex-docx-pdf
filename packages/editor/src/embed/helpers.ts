import type { SemanticDocument } from "@apexmed/core"
import { normaliseDocxBytes, serializeDocx } from "@apexmed/docx"
import { prepareImageAssetsAsync } from "@apexmed/images"
import { layoutDocument } from "@apexmed/layout"

import { fontRegistryForExport } from "../fonts/export-registry"
import { applyTemplateTagValues } from "../tags"

/** Detail payload for the embed `change` event. */
export type EmbedChangeDetail = Readonly<{
  /** Monotonic counter of document mutations for this mount. */
  revision: number
}>

/** Detail payload for the embed `error` event. */
export type EmbedErrorDetail = Readonly<{
  message: string
}>

/** Coerce DOCX/PDF input bytes to a Uint8Array view. */
export function toUint8Array(bytes: Uint8Array | ArrayBuffer): Uint8Array {
  return bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes
}

/**
 * Parse DOCX bytes into a semantic document.
 * Throws with a joined diagnostic message when normalisation fails.
 */
export function parseEmbedDocx(
  bytes: Uint8Array | ArrayBuffer
): SemanticDocument {
  const result = normaliseDocxBytes(toUint8Array(bytes))
  if (!result.ok) {
    throw new Error(
      result.diagnostics.map((entry) => entry.message).join("; ") ||
        "Failed to parse DOCX"
    )
  }
  return result.value
}

/** Serialize a semantic document to DOCX bytes. */
export function serializeEmbedDocx(document: SemanticDocument): Uint8Array {
  return serializeDocx(document)
}

/** Layout + serialize a semantic document to PDF bytes. */
export async function serializeEmbedPdf(
  document: SemanticDocument
): Promise<Uint8Array> {
  const { serializePdf } = await import("@apexmed/pdf")
  const resolved = applyTemplateTagValues(document)
  const fonts = await fontRegistryForExport(resolved)
  const layout = fonts
    ? layoutDocument(resolved, {
        includeTrace: false,
        fonts,
        shaper: fonts,
      })
    : layoutDocument(resolved, { includeTrace: false })
  const images = await prepareImageAssetsAsync(resolved.assets)
  return serializePdf(layout.displayList, {
    images,
    ...(fonts ? { fonts } : {}),
  }).bytes
}
