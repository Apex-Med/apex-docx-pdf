import type {
  DisplayListItem,
  PageDisplayList,
  PageDisplayListPage,
} from "@apex-docx-pdf/core"
import { useMemo } from "react"

export type DisplayListPreviewAsset = Readonly<{
  assetId: string
  mimeType: "image/png" | "image/jpeg"
  bytes: Uint8Array
}>

export type DisplayListPreviewModel = Readonly<{
  displayList: PageDisplayList
  placeholderNodes: Readonly<Record<string, string>>
  assets: readonly DisplayListPreviewAsset[]
}>

export type DisplayListPreviewProps = Readonly<{
  preview: DisplayListPreviewModel
  className?: string
  maxHeight?: string | number
  pageLabel?: (pageNumber: number) => string
  placeholderHighlight?: string
}>

/**
 * Paints the engine's canonical page display list without approximating DOCX
 * layout. Host applications remain responsible for loading the exact font
 * faces named by glyph runs.
 */
export function DisplayListPreview({
  preview,
  className,
  maxHeight = "min(48svh, 420px)",
  pageLabel = defaultPageLabel,
  placeholderHighlight = "#fde68a",
}: DisplayListPreviewProps) {
  const imageSources = useMemo(
    () =>
      new Map(
        preview.assets.map(
          (asset) => [asset.assetId, bytesToDataUrl(asset)] as const
        )
      ),
    [preview.assets]
  )

  return (
    <div
      className={className}
      data-slot="display-list-preview"
      style={{
        maxHeight,
        overflow: "auto",
        border: "1px solid color-mix(in srgb, currentColor 18%, transparent)",
        background: "color-mix(in srgb, currentColor 4%, transparent)",
        padding: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          width: "100%",
          maxWidth: 672,
          marginInline: "auto",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {preview.displayList.pages.map((page) => (
          <PreviewPage
            key={page.pageNumber}
            page={page}
            label={pageLabel(page.pageNumber)}
            placeholderNodes={preview.placeholderNodes}
            imageSources={imageSources}
            placeholderHighlight={placeholderHighlight}
          />
        ))}
      </div>
    </div>
  )
}

function PreviewPage({
  page,
  label,
  placeholderNodes,
  imageSources,
  placeholderHighlight,
}: Readonly<{
  page: PageDisplayListPage
  label: string
  placeholderNodes: Readonly<Record<string, string>>
  imageSources: ReadonlyMap<string, string>
  placeholderHighlight: string
}>) {
  return (
    <svg
      viewBox={`0 0 ${page.width} ${page.height}`}
      role="img"
      aria-label={label}
      style={{
        display: "block",
        width: "100%",
        height: "auto",
        background: "#fff",
        boxShadow: "0 8px 24px rgb(0 0 0 / 0.12)",
      }}
    >
      <rect width={page.width} height={page.height} fill="#ffffff" />
      {page.items.map((item) => (
        <PreviewItem
          key={displayItemKey(item)}
          item={item}
          placeholderPath={placeholderNodes[item.sourceNodeId]}
          imageSource={
            item.type === "image" ? imageSources.get(item.assetId) : undefined
          }
          placeholderHighlight={placeholderHighlight}
        />
      ))}
    </svg>
  )
}

function PreviewItem({
  item,
  placeholderPath,
  imageSource,
  placeholderHighlight,
}: Readonly<{
  item: DisplayListItem
  placeholderPath?: string
  imageSource?: string
  placeholderHighlight: string
}>) {
  if (item.type === "rectangle") {
    return (
      <rect
        x={item.bounds.x}
        y={item.bounds.y}
        width={item.bounds.width}
        height={item.bounds.height}
        fill={item.fillColor ?? "none"}
        stroke={item.strokeColor ?? "none"}
        strokeWidth={item.strokeWidth ?? 0}
        data-source-node={item.sourceNodeId}
      />
    )
  }
  if (item.type === "line") {
    return (
      <line
        x1={item.x1}
        y1={item.y1}
        x2={item.x2}
        y2={item.y2}
        stroke={item.color}
        strokeWidth={item.width}
        strokeDasharray={item.dashArray?.join(" ")}
        strokeDashoffset={item.dashPhase}
        strokeLinecap={item.lineCap}
        data-source-node={item.sourceNodeId}
      />
    )
  }
  if (item.type === "image") {
    return imageSource ? (
      <image
        href={imageSource}
        x={item.bounds.x}
        y={item.bounds.y}
        width={item.bounds.width}
        height={item.bounds.height}
        preserveAspectRatio="none"
        data-source-node={item.sourceNodeId}
      />
    ) : null
  }

  const highlightHeight = Math.max(
    item.fontSize,
    Math.round(item.fontSize * 1.2)
  )
  return (
    <g
      data-source-node={item.sourceNodeId}
      data-template-path={placeholderPath}
    >
      {placeholderPath ? (
        <rect
          x={item.x}
          y={item.baselineY - item.fontSize}
          width={Math.max(item.width, 1)}
          height={highlightHeight}
          rx={Math.max(1, Math.round(item.fontSize / 12))}
          fill={placeholderHighlight}
          fillOpacity={0.72}
        >
          <title>{placeholderPath}</title>
        </rect>
      ) : null}
      <text
        x={item.x}
        y={item.baselineY}
        fill={item.color}
        fontFamily={item.fontFamily ?? "sans-serif"}
        fontSize={item.fontSize}
        fontWeight={item.fontWeight ?? 400}
        fontStyle={item.fontStyle ?? "normal"}
        textLength={item.width > 0 ? item.width : undefined}
        lengthAdjust="spacingAndGlyphs"
      >
        {item.text}
      </text>
    </g>
  )
}

function displayItemKey(item: DisplayListItem): string {
  if (item.type === "glyph-run")
    return `${item.type}:${item.sourceNodeId}:${item.x}:${item.baselineY}:${item.text}`
  if (item.type === "line")
    return `${item.type}:${item.sourceNodeId}:${item.x1}:${item.y1}:${item.x2}:${item.y2}`
  return `${item.type}:${item.sourceNodeId}:${item.bounds.x}:${item.bounds.y}:${item.bounds.width}:${item.bounds.height}`
}

function bytesToDataUrl(asset: DisplayListPreviewAsset): string {
  let binary = ""
  const chunkSize = 0x8000
  for (let offset = 0; offset < asset.bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...asset.bytes.subarray(offset, offset + chunkSize)
    )
  }
  return `data:${asset.mimeType};base64,${btoa(binary)}`
}

function defaultPageLabel(pageNumber: number): string {
  return `Engine template preview, page ${pageNumber}`
}
