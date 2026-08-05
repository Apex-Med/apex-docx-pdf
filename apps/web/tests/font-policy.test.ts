import { describe, expect, test } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { FontCatalogSpecimens } from "../src/components/font-catalog-specimens"
import { browserCatalogFontCss } from "../src/lib/font-assets"
import {
  BUNDLED_FONT_FAMILIES,
  REFERENCE_FONT_POLICY,
  SYSTEM_FONT_ALIASES,
} from "../src/lib/font-policy"

describe("reference font policy", () => {
  test("uses only the bundled five-family catalog and deterministic aliases", () => {
    expect(BUNDLED_FONT_FAMILIES).toEqual([
      "Inter",
      "Bricolage Grotesque",
      "Instrument Sans",
      "Instrument Serif",
      "Geist Mono",
    ])
    expect(REFERENCE_FONT_POLICY).toMatchObject({
      allowOperatingSystemLookup: false,
      allowRuntimeNetworkFetch: false,
      allowUploadedEmbeddedFonts: false,
      fallbackFamily: "Inter",
    })
    expect(SYSTEM_FONT_ALIASES).toEqual([
      { from: "Arial", to: "Inter" },
      { from: "Calibri", to: "Inter" },
      { from: "Helvetica", to: "Inter" },
      { from: "Times New Roman", to: "Instrument Serif" },
      { from: "Courier New", to: "Geist Mono" },
      { from: "Inter Variable", to: "Inter" },
      { from: "Inter Medium", to: "Inter", weight: 500 },
      { from: "Inter SemiBold", to: "Inter", weight: 600 },
      { from: "BricolageGrotesque", to: "Bricolage Grotesque" },
      {
        from: "Bricolage Grotesque Medium",
        to: "Bricolage Grotesque",
        weight: 500,
      },
      {
        from: "Bricolage Grotesque SemiBold",
        to: "Bricolage Grotesque",
        weight: 600,
      },
      { from: "InstrumentSans", to: "Instrument Sans" },
      { from: "InstrumentSerif", to: "Instrument Serif" },
      { from: "GeistMono", to: "Geist Mono" },
    ])
  })

  test("binds weight-bearing family aliases to one real static browser face", () => {
    expect(cssWeights("Inter Medium")).toEqual([500])
    expect(cssWeights("Inter SemiBold")).toEqual([600])
    expect(cssWeights("Bricolage Grotesque Medium")).toEqual([500])
    expect(cssWeights("Bricolage Grotesque SemiBold")).toEqual([600])
    expect(cssWeights("Inter")).toEqual([400, 500, 600, 700, 400, 700])
  })

  test("renders visible catalog specimens for every bundled normal weight", () => {
    const markup = renderToStaticMarkup(createElement(FontCatalogSpecimens))

    expect(markup).toContain(">400<")
    expect(markup).toContain(">500<")
    expect(markup).toContain(">600<")
    expect(markup).toContain(">700<")
    expect(
      markup.match(/style="font-family:[^"]+font-weight:[^"]+"/gu)
    ).toHaveLength(13)
  })
})

function cssWeights(family: string): number[] {
  const escaped = family.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")
  return [
    ...browserCatalogFontCss.matchAll(
      new RegExp(
        `@font-face\\{font-family:"${escaped}";[^}]*font-weight:(\\d+)`,
        "gu"
      )
    ),
  ].map((match) => Number(match[1]))
}
