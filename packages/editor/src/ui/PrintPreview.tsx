import type { PageDisplayList } from "@apexmed/core"
import { DisplayListPreview } from "@apexmed/devtools"
import type { ReactNode } from "react"

export type PrintPreviewProps = Readonly<{
  displayList: PageDisplayList
}>

/**
 * Read-only Print Preview painting the engine display list exactly.
 * Chrome colors follow host dark/light theme. Layout-trace diagnostics stay
 * on the developer overlay, not in this user-facing preview.
 */
export function PrintPreview({ displayList }: PrintPreviewProps): ReactNode {
  return (
    <div className="apex-print-preview">
      <div className="apex-print-preview__title">Print Preview</div>
      <DisplayListPreview
        preview={{
          displayList,
          placeholderNodes: {},
          assets: [],
        }}
        maxHeight="70vh"
      />
    </div>
  )
}
