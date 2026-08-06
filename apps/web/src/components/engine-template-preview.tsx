import type { BrowserTemplatePreview } from "@apexmed/browser"
import { LayoutTraceViewer } from "@apexmed/devtools"

import { browserCatalogFontCss } from "@/lib/font-assets"

export function EngineTemplatePreview({
  preview,
}: Readonly<{
  preview: BrowserTemplatePreview
}>) {
  return (
    <>
      <style>{browserCatalogFontCss}</style>
      <LayoutTraceViewer preview={preview} />
    </>
  )
}
