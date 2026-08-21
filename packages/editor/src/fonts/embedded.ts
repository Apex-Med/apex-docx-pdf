import type { SemanticDocument, SemanticFontAsset } from "@apexmed/core"
import { createFontRegistry, type ManagedFontRegistry } from "@apexmed/fonts"

const registryCache = new WeakMap<
  readonly SemanticFontAsset[],
  Promise<ManagedFontRegistry | undefined>
>()

/** Build a layout/PDF registry from font programs embedded in a DOCX. */
export function fontRegistryForDocument(
  document: SemanticDocument
): Promise<ManagedFontRegistry | undefined> {
  const assets = document.fontAssets
  if (!assets || assets.length === 0) return Promise.resolve(undefined)
  const cached = registryCache.get(assets)
  if (cached) return cached
  const fallback =
    assets.find((asset) => asset.weight === 400 && asset.style === "normal") ??
    assets[0]
  const promise =
    fallback === undefined ||
    !assets.some(
      (asset) =>
        asset.family === fallback.family &&
        asset.weight === 400 &&
        asset.style === "normal"
    )
      ? Promise.resolve(undefined)
      : createFontRegistry({
          fallbackFamily: fallback.family,
          faces: assets.map((asset) => ({
            family: asset.family,
            weight: asset.weight,
            style: asset.style,
            bytes: Uint8Array.from(asset.bytes),
          })),
        })
  registryCache.set(assets, promise)
  return promise
}

function cssString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")
}

/**
 * Make document-embedded faces available to the contenteditable DOM. The
 * returned cleanup revokes all object URLs and removes the scoped rules.
 */
export function injectEmbeddedDocumentFonts(
  document: SemanticDocument,
  root?: Document | ShadowRoot
): () => void {
  if (typeof globalThis.document === "undefined") return () => undefined
  const assets = document.fontAssets ?? []
  if (assets.length === 0) return () => undefined
  const host = root ?? globalThis.document
  const style = globalThis.document.createElement("style")
  style.setAttribute("data-apex-embedded-fonts", document.id)
  const urls: string[] = []
  style.textContent = assets
    .map((asset) => {
      const url = URL.createObjectURL(
        new Blob([Uint8Array.from(asset.bytes)], { type: "font/ttf" })
      )
      urls.push(url)
      return `@font-face{font-family:'${cssString(asset.family)}';font-style:${asset.style};font-weight:${asset.weight};src:url('${url}') format('truetype');font-display:swap;}`
    })
    .join("\n")
  if (typeof Document !== "undefined" && host instanceof Document) {
    host.head.appendChild(style)
  } else {
    host.appendChild(style)
  }
  return () => {
    style.remove()
    for (const url of urls) URL.revokeObjectURL(url)
  }
}
