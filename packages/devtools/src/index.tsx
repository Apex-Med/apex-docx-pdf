import type {
  DisplayListItem,
  LayoutTrace,
  LayoutTraceEvent,
  PageDisplayList,
  PageDisplayListPage,
} from "@apex-docx-pdf/core"
import { useMemo, useState } from "react"

export type DisplayListPreviewAsset = Readonly<{
  assetId: string
  mimeType: "image/png" | "image/jpeg"
  bytes: Uint8Array
}>

export type DisplayListPreviewModel = Readonly<{
  displayList: PageDisplayList
  placeholderNodes: Readonly<Record<string, string>>
  assets: readonly DisplayListPreviewAsset[]
  layoutTrace?: LayoutTrace
}>

export type LayoutTraceOverlayVisibility = Readonly<{
  pageBounds: boolean
  contentBounds: boolean
  blockBounds: boolean
  lineBounds: boolean
  tableBounds: boolean
  rowFragments: boolean
  baselines: boolean
  sourceNodeIds: boolean
  pageBreakReasons: boolean
  keepDecisions: boolean
  overflows: boolean
  clipping: boolean
  fontFallbacks: boolean
  approximations: boolean
}>

export type DisplayListPreviewProps = Readonly<{
  preview: DisplayListPreviewModel
  className?: string
  maxHeight?: string | number
  pageLabel?: (pageNumber: number) => string
  placeholderHighlight?: string
  overlays?: Partial<LayoutTraceOverlayVisibility>
}>

export type LayoutTraceViewerProps = Omit<DisplayListPreviewProps, "overlays"> &
  Readonly<{
    preview: DisplayListPreviewModel & Readonly<{ layoutTrace: LayoutTrace }>
    initialOverlays?: Partial<LayoutTraceOverlayVisibility>
  }>

const DEFAULT_TRACE_OVERLAYS: LayoutTraceOverlayVisibility = Object.freeze({
  pageBounds: false,
  contentBounds: true,
  blockBounds: false,
  lineBounds: false,
  tableBounds: false,
  rowFragments: false,
  baselines: false,
  sourceNodeIds: false,
  pageBreakReasons: true,
  keepDecisions: true,
  overflows: true,
  clipping: true,
  fontFallbacks: true,
  approximations: true,
})

const OVERLAY_CONTROLS = [
  ["contentBounds", "Margins"],
  ["pageBounds", "Page box"],
  ["blockBounds", "Blocks"],
  ["lineBounds", "Lines"],
  ["tableBounds", "Tables"],
  ["rowFragments", "Row fragments"],
  ["baselines", "Glyph baselines"],
  ["sourceNodeIds", "Source nodes"],
  ["pageBreakReasons", "Page breaks"],
  ["keepDecisions", "Keep decisions"],
  ["overflows", "Overflows"],
  ["clipping", "Clipping avoided"],
  ["fontFallbacks", "Font fallbacks"],
  ["approximations", "Approximations"],
] as const

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
  overlays,
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
    <section
      className={className}
      data-slot="display-list-preview"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: axe requires a directly focusable scrollable preview region.
      tabIndex={0}
      aria-label="Engine document preview"
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
            tracePage={preview.layoutTrace?.pages.find(
              (tracePage) => tracePage.pageNumber === page.pageNumber
            )}
            traceEvents={
              preview.layoutTrace?.events.filter(
                (event) => event.pageNumber === page.pageNumber
              ) ?? []
            }
            overlays={{ ...DEFAULT_TRACE_OVERLAYS, ...overlays }}
          />
        ))}
      </div>
    </section>
  )
}

/**
 * Interactive developer surface for the deterministic layout trace. It keeps
 * diagnostic geometry separate from the canonical display-list drawing so
 * overlays can never influence pagination or PDF output.
 */
export function LayoutTraceViewer({
  preview,
  initialOverlays,
  ...previewProps
}: LayoutTraceViewerProps) {
  const [overlays, setOverlays] = useState<LayoutTraceOverlayVisibility>({
    ...DEFAULT_TRACE_OVERLAYS,
    ...initialOverlays,
  })

  return (
    <div data-slot="layout-trace-viewer">
      <fieldset
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "8px 14px",
          margin: "0 0 10px",
          border: 0,
          padding: 0,
          fontFamily: "inherit",
          fontSize: 12,
        }}
      >
        <legend
          style={{
            width: "100%",
            marginBottom: 6,
            fontWeight: 600,
          }}
        >
          Layout trace overlays
        </legend>
        {OVERLAY_CONTROLS.map(([key, label]) => (
          <label
            key={key}
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <input
              type="checkbox"
              checked={overlays[key]}
              onChange={(event) =>
                setOverlays((current) => ({
                  ...current,
                  [key]: event.currentTarget.checked,
                }))
              }
            />
            {label}
          </label>
        ))}
      </fieldset>
      <DisplayListPreview
        {...previewProps}
        preview={preview}
        overlays={overlays}
      />
    </div>
  )
}

function PreviewPage({
  page,
  label,
  placeholderNodes,
  imageSources,
  placeholderHighlight,
  tracePage,
  traceEvents,
  overlays,
}: Readonly<{
  page: PageDisplayListPage
  label: string
  placeholderNodes: Readonly<Record<string, string>>
  imageSources: ReadonlyMap<string, string>
  placeholderHighlight: string
  tracePage?: LayoutTrace["pages"][number]
  traceEvents: readonly LayoutTraceEvent[]
  overlays: LayoutTraceOverlayVisibility
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
      {tracePage ? (
        <TraceOverlay
          page={page}
          tracePage={tracePage}
          events={traceEvents}
          overlays={overlays}
        />
      ) : null}
    </svg>
  )
}

function TraceOverlay({
  page,
  tracePage,
  events,
  overlays,
}: Readonly<{
  page: PageDisplayListPage
  tracePage: LayoutTrace["pages"][number]
  events: readonly LayoutTraceEvent[]
  overlays: LayoutTraceOverlayVisibility
}>) {
  const strokeWidth = Math.max(10, Math.round(page.width / 1_000))
  const fontSize = Math.max(120, Math.round(page.width / 80))
  const boundedEvents = events.filter(
    (
      event
    ): event is LayoutTraceEvent & {
      bounds: NonNullable<typeof event.bounds>
    } => event.bounds !== undefined
  )
  const breakEvents = events.filter((event) => event.kind === "page-break")
  const glyphEvents = events.filter(
    (event): event is Extract<LayoutTraceEvent, { kind: "glyph-run" }> =>
      event.kind === "glyph-run"
  )
  const annotationEvents = events.filter(
    (event) =>
      (overlays.keepDecisions && event.kind === "keep-decision") ||
      (overlays.fontFallbacks && event.kind === "font-fallback") ||
      (overlays.approximations && event.kind === "unsupported-approximation") ||
      (overlays.clipping && event.kind === "clipping")
  )
  const keyedBoundedEvents = keyTraceEvents(boundedEvents)
  const keyedBreakEvents = keyTraceEvents(breakEvents)
  const keyedGlyphEvents = keyTraceEvents(glyphEvents)
  const keyedAnnotationEvents = keyTraceEvents(annotationEvents)

  return (
    <g data-layout-trace-overlay="true">
      {overlays.pageBounds ? (
        <TraceRect
          bounds={tracePage.pageBounds}
          color="#7c3aed"
          strokeWidth={strokeWidth}
        />
      ) : null}
      {overlays.contentBounds ? (
        <TraceRect
          bounds={tracePage.contentBounds}
          color="#d97706"
          strokeWidth={strokeWidth}
        />
      ) : null}
      {overlays.blockBounds
        ? keyedBoundedEvents
            .filter(({ event }) => event.kind === "block")
            .map(({ event, key }) => (
              <TraceRect
                key={`block:${key}`}
                bounds={event.bounds}
                color="#2563eb"
                strokeWidth={strokeWidth}
              />
            ))
        : null}
      {overlays.lineBounds
        ? keyedBoundedEvents
            .filter(({ event }) => event.kind === "line")
            .map(({ event, key }) => (
              <TraceRect
                key={`line:${key}`}
                bounds={event.bounds}
                color="#16a34a"
                strokeWidth={strokeWidth}
              />
            ))
        : null}
      {overlays.tableBounds
        ? keyedBoundedEvents
            .filter(({ event }) => event.kind === "table")
            .map(({ event, key }) => (
              <TraceRect
                key={`table:${key}`}
                bounds={event.bounds}
                color="#0891b2"
                strokeWidth={strokeWidth * 2}
              />
            ))
        : null}
      {overlays.rowFragments
        ? keyedBoundedEvents
            .filter(({ event }) => event.kind === "table-row-fragment")
            .map(({ event, key }) => (
              <TraceRect
                key={`row:${key}`}
                bounds={event.bounds}
                color="#4f46e5"
                strokeWidth={strokeWidth}
              />
            ))
        : null}
      {overlays.overflows
        ? keyedBoundedEvents
            .filter(({ event }) => event.kind === "overflow")
            .map(({ event, key }) => (
              <TraceRect
                key={`overflow:${key}`}
                bounds={event.bounds}
                color="#dc2626"
                strokeWidth={strokeWidth * 2}
              />
            ))
        : null}
      {overlays.clipping
        ? keyedBoundedEvents
            .filter(({ event }) => event.kind === "clipping")
            .map(({ event, key }) => (
              <TraceRect
                key={`clipping:${key}`}
                bounds={event.bounds}
                color="#ea580c"
                strokeWidth={strokeWidth * 2}
              />
            ))
        : null}
      {overlays.baselines
        ? keyedGlyphEvents.map(({ event, key }) => (
            <line
              key={`baseline:${key}`}
              x1={event.bounds.x}
              y1={event.baselineY}
              x2={event.bounds.x + Math.max(event.bounds.width, strokeWidth)}
              y2={event.baselineY}
              stroke="#db2777"
              strokeWidth={strokeWidth}
              strokeDasharray={`${strokeWidth * 3} ${strokeWidth * 2}`}
            />
          ))
        : null}
      {overlays.sourceNodeIds
        ? keyedBoundedEvents.map(({ event, key }) => (
            <text
              key={`source:${key}`}
              x={event.bounds.x}
              y={Math.max(fontSize, event.bounds.y - strokeWidth * 2)}
              fill="#111827"
              fontFamily="monospace"
              fontSize={fontSize}
              paintOrder="stroke"
              stroke="#ffffff"
              strokeWidth={strokeWidth * 2}
            >
              {event.sourceNodeId}
            </text>
          ))
        : null}
      {overlays.pageBreakReasons
        ? keyedBreakEvents.map(({ event, key }, index) => (
            <text
              key={`break:${key}`}
              x={tracePage.contentBounds.x + strokeWidth * 3}
              y={
                tracePage.contentBounds.y +
                fontSize * (index + 1) +
                strokeWidth * 2
              }
              fill="#7c3aed"
              fontFamily="monospace"
              fontSize={fontSize}
              fontWeight={700}
              paintOrder="stroke"
              stroke="#ffffff"
              strokeWidth={strokeWidth * 2}
            >
              {`break: ${event.reason ?? "unspecified"} (${event.sourceNodeId})`}
            </text>
          ))
        : null}
      {keyedAnnotationEvents.map(({ event, key }, index) => (
        <text
          key={`annotation:${key}`}
          x={tracePage.contentBounds.x + strokeWidth * 3}
          y={
            tracePage.contentBounds.y +
            fontSize * (breakEvents.length + index + 1) +
            strokeWidth * 2
          }
          fill={traceAnnotationColor(event.kind)}
          fontFamily="monospace"
          fontSize={fontSize}
          fontWeight={700}
          paintOrder="stroke"
          stroke="#ffffff"
          strokeWidth={strokeWidth * 2}
        >
          {`${traceAnnotationLabel(event)} (${event.sourceNodeId})`}
        </text>
      ))}
    </g>
  )
}

function traceAnnotationLabel(event: LayoutTraceEvent): string {
  if (event.kind === "keep-decision")
    return `keep ${event.decision}: ${event.reason}`
  if (event.kind === "font-fallback") return `font fallback: ${event.reason}`
  if (event.kind === "clipping") return `clipping: ${event.reason}`
  return `approximation: ${event.reason}`
}

function traceAnnotationColor(kind: LayoutTraceEvent["kind"]): string {
  if (kind === "keep-decision") return "#7c3aed"
  if (kind === "font-fallback") return "#0369a1"
  if (kind === "clipping") return "#ea580c"
  return "#b45309"
}

function keyTraceEvents<TEvent extends LayoutTraceEvent>(
  events: readonly TEvent[]
): readonly Readonly<{ event: TEvent; key: string }>[] {
  const occurrences = new Map<string, number>()
  return events.map((event) => {
    const bounds = event.bounds
      ? `${event.bounds.x}:${event.bounds.y}:${event.bounds.width}:${event.bounds.height}`
      : "none"
    const base = `${event.pageNumber}:${event.kind}:${event.sourceNodeId}:${bounds}:${event.reason ?? ""}`
    const occurrence = occurrences.get(base) ?? 0
    occurrences.set(base, occurrence + 1)
    return { event, key: `${base}:${occurrence}` }
  })
}

function TraceRect({
  bounds,
  color,
  strokeWidth,
}: Readonly<{
  bounds: LayoutTrace["pages"][number]["pageBounds"]
  color: string
  strokeWidth: number
}>) {
  return (
    <rect
      x={bounds.x}
      y={bounds.y}
      width={bounds.width}
      height={bounds.height}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeDasharray={`${strokeWidth * 5} ${strokeWidth * 3}`}
    />
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
