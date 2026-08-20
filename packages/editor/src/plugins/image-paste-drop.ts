import type { SemanticImageMimeType } from "@apexmed/core"
import {
  ensureRasterCompanion,
  sanitizeSvg,
  sniffMimeType,
  svgIntrinsicSize,
} from "@apexmed/images"
import { Plugin, TextSelection } from "prosemirror-state"
import type { EditorView } from "prosemirror-view"

import { insertImageFromBytes } from "../commands"

const IMAGE_FILE_RE = /^image\/(png|jpeg|jpg|gif|webp|avif|svg\+xml)$/iu

function normalizeMime(
  file: File,
  bytes: Uint8Array
): SemanticImageMimeType | undefined {
  const sniffed = sniffMimeType(bytes)
  if (sniffed) return sniffed
  const type = file.type.toLowerCase()
  if (type === "image/jpg" || type === "image/jpeg") return "image/jpeg"
  if (type === "image/png") return "image/png"
  if (type === "image/gif") return "image/gif"
  if (type === "image/webp") return "image/webp"
  if (type === "image/avif") return "image/avif"
  if (type === "image/svg+xml") return "image/svg+xml"
  if (file.name.toLowerCase().endsWith(".svg")) return "image/svg+xml"
  return undefined
}

/**
 * Insert an image file at the current selection (used by toolbar, paste, drop).
 */
export async function insertImageFile(
  view: EditorView,
  file: File
): Promise<boolean> {
  if (
    !IMAGE_FILE_RE.test(file.type) &&
    !/\.(png|jpe?g|gif|webp|avif|svg)$/iu.test(file.name)
  )
    return false
  const bytes = new Uint8Array(await file.arrayBuffer())
  const mimeType = normalizeMime(file, bytes)
  if (!mimeType) return false

  let pixelWidth = 100
  let pixelHeight = 100
  let workingBytes = bytes
  let workingMime = mimeType
  let rasterFallback: Parameters<
    typeof insertImageFromBytes
  >[0]["rasterFallback"]

  if (mimeType === "image/svg+xml") {
    const { svgText } = sanitizeSvg(new TextDecoder().decode(bytes))
    workingBytes = new TextEncoder().encode(svgText)
    const size = svgIntrinsicSize(svgText)
    pixelWidth = size.width
    pixelHeight = size.height
    const assetStub = {
      type: "imageAsset" as const,
      id: "tmp",
      source: { part: "editor", xmlPath: "/tmp" },
      packagePath: "word/media/tmp.svg",
      mimeType: "image/svg+xml" as const,
      bytes: Array.from(workingBytes),
      pixelWidth,
      pixelHeight,
    }
    const withRaster = await ensureRasterCompanion(assetStub)
    rasterFallback = withRaster.rasterFallback
    if (rasterFallback) {
      pixelWidth = rasterFallback.pixelWidth
      pixelHeight = rasterFallback.pixelHeight
    }
  } else if (
    mimeType === "image/gif" ||
    mimeType === "image/webp" ||
    mimeType === "image/avif"
  ) {
    try {
      if (typeof createImageBitmap === "function") {
        const bitmap = await createImageBitmap(
          new Blob([bytes as BlobPart], { type: mimeType })
        )
        pixelWidth = bitmap.width
        pixelHeight = bitmap.height
        bitmap.close()
      }
      const assetStub = {
        type: "imageAsset" as const,
        id: "tmp",
        source: { part: "editor", xmlPath: "/tmp" },
        packagePath: `word/media/tmp.${mimeType.split("/")[1]}`,
        mimeType,
        bytes: Array.from(bytes),
        pixelWidth,
        pixelHeight,
      }
      const withRaster = await ensureRasterCompanion(assetStub)
      rasterFallback = withRaster.rasterFallback
      if (rasterFallback) {
        pixelWidth = rasterFallback.pixelWidth
        pixelHeight = rasterFallback.pixelHeight
      }
    } catch {
      // Keep declared mime; preparation may fail later without companion.
    }
  } else {
    try {
      if (typeof createImageBitmap === "function") {
        const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]))
        pixelWidth = bitmap.width
        pixelHeight = bitmap.height
        bitmap.close()
      }
    } catch {
      // Keep defaults.
    }
  }

  const { command } = insertImageFromBytes({
    bytes: workingBytes,
    mimeType: workingMime,
    pixelWidth,
    pixelHeight,
    altText: file.name,
    rasterFallback,
  })
  return command(view.state, view.dispatch.bind(view))
}

/** Paste/drop handler for image files into the editor. */
export function createImagePasteDropPlugin(): Plugin {
  return new Plugin({
    props: {
      handleDOMEvents: {
        paste(view, event) {
          const clipboard = event.clipboardData
          if (!clipboard) return false
          const files = [...clipboard.files].filter(
            (file) =>
              IMAGE_FILE_RE.test(file.type) ||
              /\.(png|jpe?g|gif|webp|avif|svg)$/iu.test(file.name)
          )
          if (files.length === 0) return false
          event.preventDefault()
          void (async () => {
            for (const file of files) await insertImageFile(view, file)
          })()
          return true
        },
        drop(view, event) {
          const data = event.dataTransfer
          if (!data) return false
          const files = [...data.files].filter(
            (file) =>
              IMAGE_FILE_RE.test(file.type) ||
              /\.(png|jpe?g|gif|webp|avif|svg)$/iu.test(file.name)
          )
          if (files.length === 0) return false
          event.preventDefault()
          const coords = view.posAtCoords({
            left: event.clientX,
            top: event.clientY,
          })
          if (coords) {
            view.dispatch(
              view.state.tr.setSelection(
                TextSelection.create(view.state.doc, coords.pos)
              )
            )
          }
          void (async () => {
            for (const file of files) await insertImageFile(view, file)
          })()
          return true
        },
      },
    },
  })
}
