import type {
  FontConfiguration,
  FontFaceRegistration,
  FontWeight,
} from "@apexmed/core"
import {
  OFFLINE_FONT_ALIASES,
  OFFLINE_FONT_CATALOG,
  OFFLINE_FONT_FALLBACK_FAMILY,
} from "@apexmed/fonts"
import { fontAssetUrls } from "./font-asset-urls.generated"

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
