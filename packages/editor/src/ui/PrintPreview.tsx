import type { LayoutTrace, PageDisplayList } from "@apexmed/core"
import { DisplayListPreview } from "@apexmed/devtools"
import type { ReactNode } from "react"

export type PrintPreviewProps = Readonly<{
  displayList: PageDisplayList
  trace?: LayoutTrace
}>

/**
 * Read-only Print Preview painting the engine display list exactly.
 * Chrome colors follow host dark/light theme.
 */
export function PrintPreview({
  displayList,
  trace,
}: PrintPreviewProps): ReactNode {
  return (
    <div className="apex-print-preview">
      <div className="apex-print-preview__title">Print Preview</div>
      <DisplayListPreview
        preview={{
          displayList,
          placeholderNodes: {},
          assets: [],
          layoutTrace: trace,
        }}
        maxHeight="70vh"
      />
    </div>
  )
}
