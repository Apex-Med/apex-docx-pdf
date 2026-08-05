import type {
  FontConfiguration,
  FontFaceRegistration,
  FontWeight,
} from "@apex-docx-pdf/core"
import {
  OFFLINE_FONT_ALIASES,
  OFFLINE_FONT_CATALOG,
  OFFLINE_FONT_FALLBACK_FAMILY,
} from "@apex-docx-pdf/fonts"
import bricolageBoldUrl from "@apex-docx-pdf/fonts/assets/catalog/bricolage-grotesque/BricolageGrotesque-Bold.ttf?url"
import bricolageMediumUrl from "@apex-docx-pdf/fonts/assets/catalog/bricolage-grotesque/BricolageGrotesque-Medium.ttf?url"
import bricolageRegularUrl from "@apex-docx-pdf/fonts/assets/catalog/bricolage-grotesque/BricolageGrotesque-Regular.ttf?url"
import bricolageSemiBoldUrl from "@apex-docx-pdf/fonts/assets/catalog/bricolage-grotesque/BricolageGrotesque-SemiBold.ttf?url"
import geistMonoBoldUrl from "@apex-docx-pdf/fonts/assets/catalog/geist-mono/GeistMono-Bold.ttf?url"
import geistMonoBoldItalicUrl from "@apex-docx-pdf/fonts/assets/catalog/geist-mono/GeistMono-BoldItalic.ttf?url"
import geistMonoItalicUrl from "@apex-docx-pdf/fonts/assets/catalog/geist-mono/GeistMono-Italic.ttf?url"
import geistMonoRegularUrl from "@apex-docx-pdf/fonts/assets/catalog/geist-mono/GeistMono-Regular.ttf?url"
import instrumentSansBoldUrl from "@apex-docx-pdf/fonts/assets/catalog/instrument-sans/InstrumentSans-Bold.ttf?url"
import instrumentSansBoldItalicUrl from "@apex-docx-pdf/fonts/assets/catalog/instrument-sans/InstrumentSans-BoldItalic.ttf?url"
import instrumentSansItalicUrl from "@apex-docx-pdf/fonts/assets/catalog/instrument-sans/InstrumentSans-Italic.ttf?url"
import instrumentSansRegularUrl from "@apex-docx-pdf/fonts/assets/catalog/instrument-sans/InstrumentSans-Regular.ttf?url"
import instrumentSerifItalicUrl from "@apex-docx-pdf/fonts/assets/catalog/instrument-serif/InstrumentSerif-Italic.ttf?url"
import instrumentSerifRegularUrl from "@apex-docx-pdf/fonts/assets/catalog/instrument-serif/InstrumentSerif-Regular.ttf?url"
import interBoldUrl from "@apex-docx-pdf/fonts/assets/catalog/inter/Inter-Bold.ttf?url"
import interBoldItalicUrl from "@apex-docx-pdf/fonts/assets/catalog/inter/Inter-BoldItalic.ttf?url"
import interItalicUrl from "@apex-docx-pdf/fonts/assets/catalog/inter/Inter-Italic.ttf?url"
import interMediumUrl from "@apex-docx-pdf/fonts/assets/catalog/inter/Inter-Medium.ttf?url"
import interRegularUrl from "@apex-docx-pdf/fonts/assets/catalog/inter/Inter-Regular.ttf?url"
import interSemiBoldUrl from "@apex-docx-pdf/fonts/assets/catalog/inter/Inter-SemiBold.ttf?url"

const fontAssetUrls = Object.freeze({
  "catalog/inter/Inter-Regular.ttf": interRegularUrl,
  "catalog/inter/Inter-Medium.ttf": interMediumUrl,
  "catalog/inter/Inter-SemiBold.ttf": interSemiBoldUrl,
  "catalog/inter/Inter-Bold.ttf": interBoldUrl,
  "catalog/inter/Inter-Italic.ttf": interItalicUrl,
  "catalog/inter/Inter-BoldItalic.ttf": interBoldItalicUrl,
  "catalog/bricolage-grotesque/BricolageGrotesque-Regular.ttf":
    bricolageRegularUrl,
  "catalog/bricolage-grotesque/BricolageGrotesque-Medium.ttf":
    bricolageMediumUrl,
  "catalog/bricolage-grotesque/BricolageGrotesque-SemiBold.ttf":
    bricolageSemiBoldUrl,
  "catalog/bricolage-grotesque/BricolageGrotesque-Bold.ttf": bricolageBoldUrl,
  "catalog/instrument-sans/InstrumentSans-Regular.ttf":
    instrumentSansRegularUrl,
  "catalog/instrument-sans/InstrumentSans-Bold.ttf": instrumentSansBoldUrl,
  "catalog/instrument-sans/InstrumentSans-Italic.ttf": instrumentSansItalicUrl,
  "catalog/instrument-sans/InstrumentSans-BoldItalic.ttf":
    instrumentSansBoldItalicUrl,
  "catalog/instrument-serif/InstrumentSerif-Regular.ttf":
    instrumentSerifRegularUrl,
  "catalog/instrument-serif/InstrumentSerif-Italic.ttf":
    instrumentSerifItalicUrl,
  "catalog/geist-mono/GeistMono-Regular.ttf": geistMonoRegularUrl,
  "catalog/geist-mono/GeistMono-Bold.ttf": geistMonoBoldUrl,
  "catalog/geist-mono/GeistMono-Italic.ttf": geistMonoItalicUrl,
  "catalog/geist-mono/GeistMono-BoldItalic.ttf": geistMonoBoldItalicUrl,
} satisfies Readonly<Record<string, string>>)

export const browserCatalogFontCss = [
  ...OFFLINE_FONT_CATALOG.flatMap(({ family, faces }) =>
    faces.map((face) =>
      fontFace(family, urlFor(face.asset), face.weight, face.style)
    )
  ),
  ...OFFLINE_FONT_ALIASES.flatMap((alias) => {
    const family = OFFLINE_FONT_CATALOG.find(
      ({ family }) => family === alias.to
    )
    if (!family) return []
    const faces =
      "weight" in alias
        ? family.faces.filter(
            (face) =>
              face.weight === alias.weight &&
              (!("style" in alias) || face.style === alias.style)
          )
        : family.faces
    return faces.map((face) =>
      fontFace(alias.from, urlFor(face.asset), face.weight, face.style)
    )
  }),
].join("\n")

export async function loadOfflineFontConfiguration(): Promise<FontConfiguration> {
  const faces = await Promise.all(
    OFFLINE_FONT_CATALOG.flatMap(({ family, faces }) =>
      faces.map(async (face): Promise<FontFaceRegistration> => ({
        family,
        weight: face.weight,
        style: face.style,
        bytes: await loadFont(urlFor(face.asset), family),
      }))
    )
  )
  return {
    faces,
    aliases: OFFLINE_FONT_ALIASES,
    fallbackFamily: OFFLINE_FONT_FALLBACK_FAMILY,
  }
}

function urlFor(asset: string): string {
  const url = fontAssetUrls[asset as keyof typeof fontAssetUrls]
  if (!url) throw new Error(`Missing bundled font asset '${asset}'`)
  return url
}

async function loadFont(url: string, family: string): Promise<Uint8Array> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(
      `Unable to load the bundled ${family} font (${response.status})`
    )
  }
  return new Uint8Array(await response.arrayBuffer())
}

function fontFace(
  family: string,
  url: string,
  weight: FontWeight,
  style: "normal" | "italic"
): string {
  return `@font-face{font-family:${JSON.stringify(family)};src:url(${JSON.stringify(url)}) format("truetype");font-weight:${weight};font-style:${style};font-display:block;}`
}
