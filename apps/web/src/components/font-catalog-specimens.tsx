import { OFFLINE_FONT_CATALOG } from "@apexmed/fonts"

import { browserCatalogFontCss } from "@/lib/font-assets"

const specimen = "Sphinx of black quartz, judge my vow. 0123456789"

export function FontCatalogSpecimens() {
  return (
    <section className="mt-4" aria-labelledby="font-catalog-specimens-title">
      <style>{browserCatalogFontCss}</style>
      <h4 id="font-catalog-specimens-title" className="sr-only">
        Bundled font family specimens
      </h4>
      <div className="grid gap-px border bg-border sm:grid-cols-2">
        {OFFLINE_FONT_CATALOG.map(({ family, faces }) => (
          <div key={family} className="min-w-0 bg-background p-3">
            <p className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              {family}
            </p>
            <div className="mt-2 space-y-1">
              {faces
                .filter(({ style }) => style === "normal")
                .map(({ weight }) => (
                  <p
                    key={weight}
                    className="text-base leading-tight"
                    style={{
                      fontFamily: JSON.stringify(family),
                      fontWeight: weight,
                    }}
                  >
                    <span className="mr-2 inline-block w-7 font-mono text-[9px] text-muted-foreground">
                      {weight}
                    </span>
                    {specimen}
                  </p>
                ))}
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">
              {faces.length} bundled {faces.length === 1 ? "face" : "faces"}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
