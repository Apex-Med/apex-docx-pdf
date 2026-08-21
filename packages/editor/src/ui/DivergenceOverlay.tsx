import type { LayoutTrace, SemanticDocument } from "@apexmed/core"
import type { ReactNode } from "react"

export type DivergenceOverlayProps = Readonly<{
  document: SemanticDocument
  trace: LayoutTrace
  host: HTMLElement | null
}>

/**
 * Dev overlay: flags paragraphs where browser line count diverges from engine.
 * Theme-aware via .apex-divergence-overlay tokens.
 */
export function DivergenceOverlay({
  document,
  trace,
  host,
}: DivergenceOverlayProps): ReactNode {
  const engineLines = new Map<string, number>()
  for (const event of trace.events) {
    if (event.kind !== "line") continue
    const id = String(event.sourceNodeId)
    engineLines.set(id, (engineLines.get(id) ?? 0) + 1)
  }

  const browserLines = new Map<string, number>()
  if (host) {
    const paragraphs = host.querySelectorAll("p[data-node-id]")
    for (const el of paragraphs) {
      const id = el.getAttribute("data-node-id")
      if (!id) continue
      const height = (el as HTMLElement).clientHeight
      const lineHeight = Number.parseFloat(
        getComputedStyle(el as HTMLElement).lineHeight
      )
      const approx =
        Number.isFinite(lineHeight) && lineHeight > 0
          ? Math.max(1, Math.round(height / lineHeight))
          : 1
      browserLines.set(id, approx)
    }
  }

  const rows: Array<{
    id: string
    engine: number
    browser: number
    delta: number
  }> = []
  for (const [id, engine] of engineLines) {
    const browser = browserLines.get(id) ?? engine
    if (browser !== engine) {
      rows.push({ id, engine, browser, delta: browser - engine })
    }
  }

  let paragraphCount = 0
  for (const section of document.sections) {
    for (const block of section.blocks) {
      if (block.type === "paragraph") paragraphCount += 1
    }
  }

  return (
    <div className="apex-divergence-overlay" role="status">
      <strong>Line-count divergence</strong>
      {": "}
      {rows.length === 0
        ? `none across ${paragraphCount} paragraphs (engine lines match browser estimate)`
        : `${rows.length} paragraph(s) diverge`}
      {rows.length > 0 ? (
        <ul className="mt-1 list-disc pl-4">
          {rows.slice(0, 12).map((row) => (
            <li key={row.id}>
              {row.id}: engine={row.engine} browser≈{row.browser} (Δ
              {row.delta > 0 ? "+" : ""}
              {row.delta})
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
