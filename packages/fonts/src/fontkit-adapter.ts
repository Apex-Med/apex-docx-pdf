/// <reference path="./fontkit.d.ts" />

import {
  glyphId,
  type FontFaceMetrics,
  type FontProgramKind,
  type GlyphId,
} from "@apex-docx-pdf/core"
import { create } from "fontkit"
import { FontConfigurationError, FontShapingError } from "./errors"
import type {
  FontParserAdapter,
  FontSubsetAdapter,
  ParsedFontFace,
  ParsedGlyph,
} from "./parser"

const fontkitFaces = new WeakMap<ParsedFontFace, ReturnType<typeof create>>()

function finiteMetric(value: number, name: string): number {
  if (!Number.isFinite(value)) {
    throw new FontConfigurationError(`Font metric '${name}' must be finite`)
  }
  return value
}

function programKind(bytes: Uint8Array): FontProgramKind {
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x4f &&
    bytes[1] === 0x54 &&
    bytes[2] === 0x54 &&
    bytes[3] === 0x4f
  ) {
    return "opentype-cff"
  }
  if (
    bytes.length >= 4 &&
    ((bytes[0] === 0x00 &&
      bytes[1] === 0x01 &&
      bytes[2] === 0x00 &&
      bytes[3] === 0x00) ||
      (bytes[0] === 0x74 &&
        bytes[1] === 0x72 &&
        bytes[2] === 0x75 &&
        bytes[3] === 0x65))
  ) {
    return "truetype"
  }
  throw new FontConfigurationError(
    "Only unwrapped TrueType and OpenType/CFF font programs are supported"
  )
}

function metricsOf(font: ReturnType<typeof create>): FontFaceMetrics {
  const unitsPerEm = finiteMetric(font.unitsPerEm, "unitsPerEm")
  if (!Number.isSafeInteger(unitsPerEm) || unitsPerEm <= 0) {
    throw new FontConfigurationError(
      "Font unitsPerEm must be a positive safe integer"
    )
  }
  return Object.freeze({
    unitsPerEm,
    ascent: finiteMetric(font.ascent, "ascent"),
    descent: finiteMetric(font.descent, "descent"),
    lineGap: finiteMetric(font.lineGap, "lineGap"),
    underlinePosition: finiteMetric(
      font.underlinePosition,
      "underlinePosition"
    ),
    underlineThickness: finiteMetric(
      font.underlineThickness,
      "underlineThickness"
    ),
    bbox: Object.freeze({
      xMin: finiteMetric(font.bbox.minX, "bbox.minX"),
      yMin: finiteMetric(font.bbox.minY, "bbox.minY"),
      xMax: finiteMetric(font.bbox.maxX, "bbox.maxX"),
      yMax: finiteMetric(font.bbox.maxY, "bbox.maxY"),
    }),
  })
}

export const fontkitParserAdapter: FontParserAdapter = Object.freeze({
  parse(bytes: Uint8Array, requestedPostscriptName?: string): ParsedFontFace {
    const kind = programKind(bytes)
    const font = create(bytes, requestedPostscriptName ?? null)
    const postscriptName = font.postscriptName ?? requestedPostscriptName
    if (!postscriptName) {
      throw new FontConfigurationError("The font must have a PostScript name")
    }
    const metrics = metricsOf(font)
    const parsed: ParsedFontFace = Object.freeze({
      postscriptName,
      kind,
      metrics,
      hasGlyphForCodePoint(codePoint: number): boolean {
        return font.hasGlyphForCodePoint(codePoint)
      },
      layout(
        text: string,
        _options: Readonly<{
          direction: "ltr"
          script: "latn"
          language?: string
        }>
      ) {
        // Latin-only, LTR input is enforced before this documented layout call.
        const run = font.layout(text)
        if (run.glyphs.length !== run.positions.length) {
          throw new FontShapingError(
            "fonts/shaping-boundary",
            "fontkit returned mismatched glyph and position arrays"
          )
        }
        let clusterStart = 0
        const glyphs: ParsedGlyph[] = run.glyphs.map((glyph, index) => {
          const position = run.positions[index]
          if (!position) {
            throw new FontShapingError(
              "fonts/shaping-boundary",
              "fontkit omitted a glyph position"
            )
          }
          const unicode = String.fromCodePoint(...glyph.codePoints)
          const clusterEnd = clusterStart + unicode.length
          const parsed = Object.freeze({
            glyphId: glyphId(glyph.id),
            unicode,
            clusterStart,
            clusterEnd,
            advanceX: position.xAdvance,
            advanceY: position.yAdvance,
            offsetX: position.xOffset,
            offsetY: position.yOffset,
          })
          clusterStart = clusterEnd
          return parsed
        })
        if (glyphs.map((glyph) => glyph.unicode).join("") !== text) {
          throw new FontShapingError(
            "fonts/shaping-boundary",
            "fontkit did not expose a lossless left-to-right Latin cluster mapping"
          )
        }
        return Object.freeze({ glyphs: Object.freeze(glyphs) })
      },
    })
    fontkitFaces.set(parsed, font)
    return parsed
  },
})

/** Rewrites a TrueType program to the exact sorted glyph set used by one PDF. */
export const fontkitSubsetAdapter: FontSubsetAdapter = Object.freeze({
  subset(
    face: ParsedFontFace,
    glyphIds: readonly GlyphId[],
    signal?: AbortSignal
  ) {
    signal?.throwIfAborted()
    if (face.kind !== "truetype") {
      throw new FontConfigurationError(
        "The default fontkit subsetter supports TrueType programs only"
      )
    }
    const font = fontkitFaces.get(face)
    if (font === undefined) {
      throw new FontConfigurationError(
        "The font face was not created by the default fontkit parser"
      )
    }
    const orderedGlyphIds = [...new Set(glyphIds)].sort(
      (left, right) => left - right
    )
    const subset = font.createSubset()
    const glyphMap = orderedGlyphIds.map((sourceGlyphId) => {
      signal?.throwIfAborted()
      return Object.freeze({
        sourceGlyphId,
        subsetGlyphId: subset.includeGlyph(sourceGlyphId),
      })
    })
    signal?.throwIfAborted()
    const bytes = subset.encode()
    signal?.throwIfAborted()
    return Object.freeze({
      bytes: bytes.slice(),
      postscriptName: subsetPostscriptName(
        face.postscriptName,
        orderedGlyphIds
      ),
      glyphMap: Object.freeze(glyphMap),
    })
  },
})

function subsetPostscriptName(
  postscriptName: string,
  glyphIds: readonly GlyphId[]
): string {
  let hash = 0x811c9dc5
  const framed = `${postscriptName}\u0000${glyphIds.join(",")}`
  for (const byte of new TextEncoder().encode(framed)) {
    hash = Math.imul(hash ^ byte, 0x01000193) >>> 0
  }
  let value = hash
  let prefix = ""
  for (let index = 0; index < 6; index += 1) {
    prefix += String.fromCharCode(65 + (value % 26))
    value = Math.floor(value / 26)
  }
  return `${prefix}+${postscriptName}`
}
