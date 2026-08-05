import type { BrowserTemplatePreview } from "@apex-docx-pdf/browser"
import { DisplayListPreview } from "@apex-docx-pdf/devtools"

import { browserCatalogFontCss } from "@/lib/font-assets"

export function EngineTemplatePreview({
  preview,
}: Readonly<{
  preview: BrowserTemplatePreview
}>) {
  return (
    <>
      <style>{browserCatalogFontCss}</style>
      <DisplayListPreview preview={preview} />
    </>
  )
}
