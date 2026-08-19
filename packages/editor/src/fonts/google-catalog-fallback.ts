import type { GoogleFontAxis, GoogleFontFamily } from "./google-catalog"

function axis(
  tag: string,
  min: number,
  max: number,
  defaultValue: number
): GoogleFontAxis {
  return Object.freeze({ tag, min, max, defaultValue })
}

function family(
  name: string,
  category: string,
  axes: readonly GoogleFontAxis[],
  weights?: readonly number[]
): GoogleFontFamily {
  return Object.freeze({
    family: name,
    category,
    axes,
    ...(weights ? { weights: Object.freeze(weights) } : {}),
  })
}

/** Offline snapshot of popular Google Fonts families with variation axes. */
export const GOOGLE_FONT_CATALOG_FALLBACK: readonly GoogleFontFamily[] =
  Object.freeze([
    family(
      "Inter",
      "Sans Serif",
      [axis("wght", 100, 900, 400), axis("ital", 0, 1, 0)],
      [100, 200, 300, 400, 500, 600, 700, 800, 900]
    ),
    family(
      "Instrument Sans",
      "Sans Serif",
      [axis("wdth", 75, 100, 100), axis("wght", 400, 700, 400)],
      [400, 500, 600, 700]
    ),
    family("Instrument Serif", "Serif", [], [400]),
    family(
      "Geist",
      "Sans Serif",
      [axis("wght", 100, 900, 400)],
      [100, 200, 300, 400, 500, 600, 700, 800, 900]
    ),
    family(
      "Geist Mono",
      "Monospace",
      [axis("wght", 100, 900, 400)],
      [100, 200, 300, 400, 500, 600, 700, 800, 900]
    ),
    family(
      "Bricolage Grotesque",
      "Sans Serif",
      [
        axis("opsz", 12, 96, 14),
        axis("wdth", 75, 100, 100),
        axis("wght", 200, 800, 400),
      ],
      [200, 300, 400, 500, 600, 700, 800]
    ),
    family("Roboto", "Sans Serif", [axis("wght", 100, 900, 400)]),
    family("Open Sans", "Sans Serif", [
      axis("wght", 300, 800, 400),
      axis("ital", 0, 1, 0),
    ]),
    family("Lato", "Sans Serif", [
      axis("wght", 100, 900, 400),
      axis("ital", 0, 1, 0),
    ]),
    family("Montserrat", "Sans Serif", [
      axis("wght", 100, 900, 400),
      axis("ital", 0, 1, 0),
    ]),
    family("Source Sans 3", "Sans Serif", [
      axis("wght", 200, 900, 400),
      axis("ital", 0, 1, 0),
    ]),
    family("Noto Sans", "Sans Serif", [
      axis("wght", 100, 900, 400),
      axis("ital", 0, 1, 0),
    ]),
    family("Merriweather", "Serif", [
      axis("wght", 300, 900, 400),
      axis("ital", 0, 1, 0),
    ]),
    family("Playfair Display", "Display", [
      axis("wght", 400, 900, 400),
      axis("ital", 0, 1, 0),
    ]),
    family("JetBrains Mono", "Monospace", [
      axis("wght", 100, 800, 400),
      axis("ital", 0, 1, 0),
    ]),
    family("Poppins", "Sans Serif", [
      axis("wght", 100, 900, 400),
      axis("ital", 0, 1, 0),
    ]),
    family("Raleway", "Sans Serif", [
      axis("wght", 100, 900, 400),
      axis("ital", 0, 1, 0),
    ]),
    family("Nunito", "Sans Serif", [
      axis("wght", 200, 1000, 400),
      axis("ital", 0, 1, 0),
    ]),
    family("Ubuntu", "Sans Serif", [
      axis("wght", 300, 700, 400),
      axis("ital", 0, 1, 0),
    ]),
    family("Oswald", "Sans Serif", [axis("wght", 200, 700, 400)]),
    family("Rubik", "Sans Serif", [
      axis("wght", 300, 900, 400),
      axis("ital", 0, 1, 0),
    ]),
    family("Work Sans", "Sans Serif", [
      axis("wght", 100, 900, 400),
      axis("ital", 0, 1, 0),
    ]),
    family("DM Sans", "Sans Serif", [
      axis("opsz", 9, 40, 14),
      axis("wght", 100, 1000, 400),
      axis("ital", 0, 1, 0),
    ]),
    family("IBM Plex Sans", "Sans Serif", [
      axis("wght", 100, 700, 400),
      axis("ital", 0, 1, 0),
    ]),
    family("Fira Sans", "Sans Serif", [
      axis("wght", 100, 900, 400),
      axis("ital", 0, 1, 0),
    ]),
    family("PT Serif", "Serif", [
      axis("wght", 400, 700, 400),
      axis("ital", 0, 1, 0),
    ]),
    family("Noto Serif", "Serif", [
      axis("wght", 100, 900, 400),
      axis("ital", 0, 1, 0),
    ]),
    family("Crimson Text", "Serif", [
      axis("wght", 400, 700, 400),
      axis("ital", 0, 1, 0),
    ]),
    family("Libre Baskerville", "Serif", [
      axis("wght", 400, 700, 400),
      axis("ital", 0, 1, 0),
    ]),
    family("Space Grotesk", "Sans Serif", [axis("wght", 300, 700, 400)]),
    family("Manrope", "Sans Serif", [axis("wght", 200, 800, 400)]),
    family("Mulish", "Sans Serif", [
      axis("wght", 200, 1000, 400),
      axis("ital", 0, 1, 0),
    ]),
    family("Source Code Pro", "Monospace", [
      axis("wght", 200, 900, 400),
      axis("ital", 0, 1, 0),
    ]),
    family("Inconsolata", "Monospace", [
      axis("wght", 200, 900, 400),
      axis("ital", 0, 1, 0),
    ]),
    family("Roboto Mono", "Monospace", [
      axis("wght", 100, 700, 400),
      axis("ital", 0, 1, 0),
    ]),
    family("Literata", "Serif", [
      axis("opsz", 7, 72, 12),
      axis("wght", 200, 900, 400),
      axis("ital", 0, 1, 0),
    ]),
    family("EB Garamond", "Serif", [
      axis("wght", 400, 800, 400),
      axis("ital", 0, 1, 0),
    ]),
    family("Barlow", "Sans Serif", [
      axis("wght", 100, 900, 400),
      axis("ital", 0, 1, 0),
    ]),
    family("Karla", "Sans Serif", [
      axis("wght", 200, 800, 400),
      axis("ital", 0, 1, 0),
    ]),
    family("Jost", "Sans Serif", [
      axis("wght", 100, 900, 400),
      axis("ital", 0, 1, 0),
    ]),
    family("Outfit", "Sans Serif", [axis("wght", 100, 900, 400)]),
    family("Plus Jakarta Sans", "Sans Serif", [
      axis("wght", 200, 800, 400),
      axis("ital", 0, 1, 0),
    ]),
    family("Lexend", "Sans Serif", [axis("wght", 100, 900, 400)]),
    family("Figtree", "Sans Serif", [
      axis("wght", 300, 900, 400),
      axis("ital", 0, 1, 0),
    ]),
    family("Public Sans", "Sans Serif", [
      axis("wght", 100, 900, 400),
      axis("ital", 0, 1, 0),
    ]),
    family("Spectral", "Serif", [
      axis("wght", 200, 800, 400),
      axis("ital", 0, 1, 0),
    ]),
    family("Bitter", "Serif", [
      axis("wght", 100, 900, 400),
      axis("ital", 0, 1, 0),
    ]),
    family("Arvo", "Serif", [
      axis("wght", 400, 700, 400),
      axis("ital", 0, 1, 0),
    ]),
    family("Bebas Neue", "Display", []),
    family("Anton", "Sans Serif", [axis("wght", 400, 400, 400)]),
    family("Caveat", "Handwriting", [axis("wght", 400, 700, 400)]),
    family("Dancing Script", "Handwriting", [axis("wght", 400, 700, 400)]),
  ])
