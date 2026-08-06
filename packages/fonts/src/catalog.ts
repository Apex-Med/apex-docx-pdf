import type { FontWeight } from "@apexmed/core"

export const OFFLINE_FONT_CATALOG_VERSION = "apex-offline-ttf/v2"

export type OfflineFontCatalogFace = Readonly<{
  asset: string
  sha256: string
  weight: FontWeight
  style: "normal" | "italic"
}>

export type OfflineFontCatalogFamily = Readonly<{
  family: string
  source: string
  revision: string
  license: "OFL-1.1"
  faces: readonly OfflineFontCatalogFace[]
}>

export const OFFLINE_FONT_CATALOG = Object.freeze([
  Object.freeze({
    family: "Inter",
    source:
      "https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip",
    revision: "v4.1",
    license: "OFL-1.1",
    faces: Object.freeze([
      face(
        "catalog/inter/Inter-Regular.ttf",
        "40d692fce188e4471e2b3cba937be967878f631ad3ebbbdcd587687c7ebe0c82",
        400,
        "normal"
      ),
      face(
        "catalog/inter/Inter-Medium.ttf",
        "97ad806f526e41546d46365bb3a393145f75b7b1568913db74549ad8b8dba872",
        500,
        "normal"
      ),
      face(
        "catalog/inter/Inter-SemiBold.ttf",
        "78a843fade9d4612a5567302fb595b56976eb5fcebf4fea5a5912d638bafcde3",
        600,
        "normal"
      ),
      face(
        "catalog/inter/Inter-Bold.ttf",
        "288316099b1e0a47a4716d159098005eef7c0066921f34e3200393dbdb01947f",
        700,
        "normal"
      ),
      face(
        "catalog/inter/Inter-Italic.ttf",
        "bbc051dd204b5019a1aa0bc0ae2aa8a05ab13e7a3f979fa357631dc7feb6833a",
        400,
        "italic"
      ),
      face(
        "catalog/inter/Inter-BoldItalic.ttf",
        "948405a16cdc62701da5f4005ed068ca5f4d27061d98f7974ccfc37831d9581d",
        700,
        "italic"
      ),
    ]),
  }),
  Object.freeze({
    family: "Bricolage Grotesque",
    source:
      "https://github.com/ateliertriay/bricolage/tree/84745e5b96261ae5f8c6c856e262fe78d1d6efdd/fonts/ttf",
    revision: "84745e5b96261ae5f8c6c856e262fe78d1d6efdd",
    license: "OFL-1.1",
    faces: Object.freeze([
      face(
        "catalog/bricolage-grotesque/BricolageGrotesque-Regular.ttf",
        "dcfe24ee4e7aa40aa13a91837acca9b170befd4dbbbcf9e084a0db1c1676e06f",
        400,
        "normal"
      ),
      face(
        "catalog/bricolage-grotesque/BricolageGrotesque-Medium.ttf",
        "1dd2a3b41e0ce8eff2d9000ce8e79e8a5d9d2f0b22f4e27dc8c59e94894fe50a",
        500,
        "normal"
      ),
      face(
        "catalog/bricolage-grotesque/BricolageGrotesque-SemiBold.ttf",
        "25534ff95de6305903a3f74b237f07d9e32adefec13d0f0a0d99a4b820c6a8cf",
        600,
        "normal"
      ),
      face(
        "catalog/bricolage-grotesque/BricolageGrotesque-Bold.ttf",
        "f83cb3f1ddb91bdb02868eeddb4f817b326aef993f96fe6f8a3b40b0f31c689b",
        700,
        "normal"
      ),
    ]),
  }),
  Object.freeze({
    family: "Instrument Sans",
    source:
      "https://github.com/Instrument/instrument-sans/tree/7fa22308a3d0c94ee2b3cd537a1196b65db34a3e/fonts/ttf",
    revision: "7fa22308a3d0c94ee2b3cd537a1196b65db34a3e",
    license: "OFL-1.1",
    faces: Object.freeze([
      face(
        "catalog/instrument-sans/InstrumentSans-Regular.ttf",
        "69fd3f7c467c70c1f73b232812407f688f3d87dd7a801ea7281aa97d29cf53d5",
        400,
        "normal"
      ),
      face(
        "catalog/instrument-sans/InstrumentSans-Bold.ttf",
        "735badeb8b2046cee6f5e1226412ab6c29db04accbca413af03d70e991dce10d",
        700,
        "normal"
      ),
      face(
        "catalog/instrument-sans/InstrumentSans-Italic.ttf",
        "7e6ebe089d1a62b73840f74fcfa477f2f5e43c4df5db18fb790908938e5aef96",
        400,
        "italic"
      ),
      face(
        "catalog/instrument-sans/InstrumentSans-BoldItalic.ttf",
        "c423640296fc5c59442320aa673f4214010a2989b93cc83396bed9f341f8322b",
        700,
        "italic"
      ),
    ]),
  }),
  Object.freeze({
    family: "Instrument Serif",
    source:
      "https://github.com/Instrument/instrument-serif/tree/65c0ef225f386a3c7e87570a4aa9cc0262c2fd81/fonts/ttf",
    revision: "65c0ef225f386a3c7e87570a4aa9cc0262c2fd81",
    license: "OFL-1.1",
    faces: Object.freeze([
      face(
        "catalog/instrument-serif/InstrumentSerif-Regular.ttf",
        "498efd461f6ddfcb7a111bf9a565709d2085d48201d501ead960d93e84ffbb88",
        400,
        "normal"
      ),
      face(
        "catalog/instrument-serif/InstrumentSerif-Italic.ttf",
        "08939b8bdf534afec24ae0ef5e03f948940cd9a8fe08e7fecbad040e62327385",
        400,
        "italic"
      ),
    ]),
  }),
  Object.freeze({
    family: "Geist Mono",
    source:
      "https://github.com/vercel/geist-font/tree/10dc7658f13c38a474cde201bb09a4617267545b/fonts/GeistMono/ttf",
    revision: "10dc7658f13c38a474cde201bb09a4617267545b",
    license: "OFL-1.1",
    faces: Object.freeze([
      face(
        "catalog/geist-mono/GeistMono-Regular.ttf",
        "5a0de4b3d54ab272f76a1d8c84b7fb24c67bbec6591d5300e61c7bc10094b6c8",
        400,
        "normal"
      ),
      face(
        "catalog/geist-mono/GeistMono-Bold.ttf",
        "325de0913317e63c9b0084d3f571c6d1c9279e776e9260c62be19e1c12d1be3c",
        700,
        "normal"
      ),
      face(
        "catalog/geist-mono/GeistMono-Italic.ttf",
        "c249093c0f30720afc801c9e8ca1e8c718809cf56860875a590ad69bc803dfbb",
        400,
        "italic"
      ),
      face(
        "catalog/geist-mono/GeistMono-BoldItalic.ttf",
        "b7c96991c157b37a59d0d44304dadd1beb75f1b053acaf6fd42567e1415ed2e3",
        700,
        "italic"
      ),
    ]),
  }),
] as const satisfies readonly OfflineFontCatalogFamily[])

export const OFFLINE_FONT_FAMILIES = Object.freeze(
  OFFLINE_FONT_CATALOG.map(({ family }) => family)
)

export const OFFLINE_FONT_ALIASES = Object.freeze([
  Object.freeze({ from: "Arial", to: "Inter" }),
  Object.freeze({ from: "Calibri", to: "Inter" }),
  Object.freeze({ from: "Helvetica", to: "Inter" }),
  Object.freeze({ from: "Times New Roman", to: "Instrument Serif" }),
  Object.freeze({ from: "Courier New", to: "Geist Mono" }),
  Object.freeze({ from: "Inter Variable", to: "Inter" }),
  Object.freeze({ from: "Inter Medium", to: "Inter", weight: 500 }),
  Object.freeze({ from: "Inter SemiBold", to: "Inter", weight: 600 }),
  Object.freeze({ from: "BricolageGrotesque", to: "Bricolage Grotesque" }),
  Object.freeze({
    from: "Bricolage Grotesque Medium",
    to: "Bricolage Grotesque",
    weight: 500,
  }),
  Object.freeze({
    from: "Bricolage Grotesque SemiBold",
    to: "Bricolage Grotesque",
    weight: 600,
  }),
  Object.freeze({ from: "InstrumentSans", to: "Instrument Sans" }),
  Object.freeze({ from: "InstrumentSerif", to: "Instrument Serif" }),
  Object.freeze({ from: "GeistMono", to: "Geist Mono" }),
])

export const OFFLINE_FONT_FALLBACK_FAMILY = "Inter"

function face(
  asset: string,
  sha256: string,
  weight: FontWeight,
  style: "normal" | "italic"
): OfflineFontCatalogFace {
  return Object.freeze({ asset, sha256, weight, style })
}
