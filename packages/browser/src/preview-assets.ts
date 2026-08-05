import type { BrowserPreviewAsset } from "./protocol"

type PreviewAssetSource = Readonly<{
  id: string
  mimeType: BrowserPreviewAsset["mimeType"]
  bytes: ArrayLike<number>
}>

export function clonePreviewAssetsForResponse(
  assets: readonly PreviewAssetSource[]
): readonly BrowserPreviewAsset[] {
  return assets.map((asset) => ({
    assetId: asset.id,
    mimeType: asset.mimeType,
    // The worker cache retains the compiled template's asset bytes. Clone only
    // the bounded preview payload so transferring it cannot detach cache state.
    bytes: Uint8Array.from(asset.bytes),
  }))
}

export function previewAssetTransferList(
  assets: readonly BrowserPreviewAsset[]
): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>()
  for (const asset of assets) buffers.add(asset.bytes.buffer)
  return [...buffers]
}
