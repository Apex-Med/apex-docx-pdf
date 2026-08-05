import {
  documentHash,
  fontFaceId,
  twips,
  type EmbeddedFontSubset,
  type FontConfiguration,
  type FontEmbeddingProvider,
  type FontFaceId,
  type FontFaceMetrics,
  type FontFaceRegistration,
  type FontFaceRequest,
  type FontFaceResource,
  type FontMatch,
  type FontRegistry,
  type GlyphId,
  type ShapeTextInput,
  type ShapedGlyph,
  type ShapedText,
  type TextShaper,
  type Twip,
} from "@apex-docx-pdf/core"
import { FontConfigurationError, FontShapingError } from "./errors"
import type {
  FontParserAdapter,
  FontSubsetAdapter,
  ParsedFontFace,
} from "./parser"

const asciiWhitespace = /[\t\n\f\r ]+/gu
const latinText = /^[\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]*$/u

type FaceKey = `${string}\u0000${400 | 700}\u0000${"normal" | "italic"}`

type StoredFace = Readonly<{
  resource: FontFaceResource
  parsed: ParsedFontFace
  normalizedFamily: string
}>

export interface ManagedFontRegistry
  extends FontRegistry, TextShaper, FontEmbeddingProvider {}

export type CreateFontRegistryOptions = Readonly<{
  parser?: FontParserAdapter
  subsetter?: FontSubsetAdapter
}>

export function normalizeFontFamily(value: string): string {
  const normalized = value
    .normalize("NFC")
    .replace(asciiWhitespace, " ")
    .replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/gu, "")
    .toLowerCase()
    .normalize("NFC")
  if (!normalized) {
    throw new FontConfigurationError("Font family names cannot be empty")
  }
  return normalized
}

function keyOf(
  family: string,
  weight: 400 | 700,
  style: "normal" | "italic"
): FaceKey {
  return `${family}\u0000${weight}\u0000${style}`
}

function immutableMetrics(metrics: FontFaceMetrics): FontFaceMetrics {
  return Object.freeze({
    ...metrics,
    bbox: Object.freeze({ ...metrics.bbox }),
  })
}

function encodeFrame(value: string | Uint8Array): Uint8Array {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value
  const result = new Uint8Array(4 + bytes.length)
  new DataView(result.buffer).setUint32(0, bytes.length, false)
  result.set(bytes, 4)
  return result
}

function joinBytes(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.length, 0)
  const result = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

async function sha256Hex(
  parts: readonly (string | Uint8Array)[]
): Promise<string> {
  const bytes = joinBytes(parts.map(encodeFrame))
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer)
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
}

function resolvedAliases(
  configuration: FontConfiguration,
  registeredFamilies: ReadonlySet<string>
): ReadonlyMap<string, string> {
  const direct = new Map<string, string>()
  for (const alias of configuration.aliases ?? []) {
    const from = normalizeFontFamily(alias.from)
    const to = normalizeFontFamily(alias.to)
    if (registeredFamilies.has(from)) {
      throw new FontConfigurationError(
        `Font alias '${alias.from}' conflicts with a registered family`
      )
    }
    if (direct.has(from)) {
      throw new FontConfigurationError(`Duplicate font alias '${alias.from}'`)
    }
    direct.set(from, to)
  }

  const resolved = new Map<string, string>()
  for (const start of direct.keys()) {
    const visited = new Set<string>()
    let current = start
    while (direct.has(current)) {
      if (visited.has(current)) {
        throw new FontConfigurationError(`Font alias cycle includes '${start}'`)
      }
      visited.add(current)
      current = direct.get(current) as string
    }
    if (!registeredFamilies.has(current)) {
      throw new FontConfigurationError(
        `Font alias '${start}' resolves to missing family '${current}'`
      )
    }
    resolved.set(start, current)
  }
  return resolved
}

function validateRegistration(registration: FontFaceRegistration): void {
  if (
    !(registration.bytes instanceof Uint8Array) ||
    registration.bytes.length === 0
  ) {
    throw new FontConfigurationError(
      "Font bytes must be a non-empty Uint8Array"
    )
  }
  if (
    registration.postscriptName !== undefined &&
    registration.postscriptName.length === 0
  ) {
    throw new FontConfigurationError(
      "A supplied PostScript name cannot be empty"
    )
  }
}

function scaleMetric(value: number, fontSize: Twip, unitsPerEm: number): Twip {
  const scaled = (value * fontSize) / unitsPerEm
  if (!Number.isFinite(scaled) || !Number.isSafeInteger(Math.round(scaled))) {
    throw new FontShapingError(
      "fonts/shaping-boundary",
      "Shaped font coordinates exceed supported integer twips"
    )
  }
  return twips(Math.round(scaled))
}

function assertLatinLtr(input: ShapeTextInput): void {
  if (input.direction !== "ltr") {
    throw new FontShapingError(
      "fonts/shaping-boundary",
      "Only left-to-right shaping is supported"
    )
  }
  if (!latinText.test(input.text) || hasUnpairedSurrogate(input.text)) {
    throw new FontShapingError(
      "fonts/shaping-boundary",
      "Only well-formed Latin-script text is supported"
    )
  }
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index)
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next < 0xdc00 || next > 0xdfff) return true
      index += 1
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return true
    }
  }
  return false
}

class Registry implements ManagedFontRegistry {
  readonly registryHash
  readonly #byId: ReadonlyMap<FontFaceId, StoredFace>
  readonly #byKey: ReadonlyMap<FaceKey, StoredFace>
  readonly #aliases: ReadonlyMap<string, string>
  readonly #fallbackFamily: string
  readonly #subsetter?: FontSubsetAdapter

  constructor(
    registryHash: ReturnType<typeof documentHash>,
    byId: ReadonlyMap<FontFaceId, StoredFace>,
    byKey: ReadonlyMap<FaceKey, StoredFace>,
    aliases: ReadonlyMap<string, string>,
    fallbackFamily: string,
    subsetter?: FontSubsetAdapter
  ) {
    this.registryHash = registryHash
    this.#byId = byId
    this.#byKey = byKey
    this.#aliases = aliases
    this.#fallbackFamily = fallbackFamily
    this.#subsetter = subsetter
  }

  matchFace(request: FontFaceRequest): FontMatch {
    const requestedFamily = normalizeFontFamily(request.family)
    const resolvedFamily = this.#aliases.get(requestedFamily) ?? requestedFamily
    const exact = this.#byKey.get(
      keyOf(resolvedFamily, request.weight, request.style)
    )
    if (exact) {
      return this.#match(
        exact,
        request.family,
        requestedFamily === resolvedFamily ? "exact" : "alias"
      )
    }
    const faceFallback = this.#matchWithinFamily(resolvedFamily, request)
    if (faceFallback) {
      return this.#match(faceFallback, request.family, "face-fallback")
    }

    const fallback = this.#matchWithinFamily(this.#fallbackFamily, request)
    if (!fallback) {
      throw new FontConfigurationError(
        "The required regular fallback face is missing"
      )
    }
    return this.#match(fallback, request.family, "family-fallback")
  }

  #matchWithinFamily(
    family: string,
    request: FontFaceRequest
  ): StoredFace | undefined {
    const candidates = [
      keyOf(family, request.weight, request.style),
      keyOf(family, 400, request.style),
      keyOf(family, request.weight, "normal"),
      keyOf(family, 400, "normal"),
    ]
    for (const candidate of new Set(candidates)) {
      const face = this.#byKey.get(candidate)
      if (face) return face
    }
    return undefined
  }

  face(id: FontFaceId): FontFaceResource {
    const stored = this.#byId.get(id)
    if (!stored) throw new FontConfigurationError(`Unknown font face '${id}'`)
    return Object.freeze({
      ...stored.resource,
      bytes: stored.resource.bytes.slice(),
    })
  }

  shape(input: ShapeTextInput): ShapedText {
    assertLatinLtr(input)
    const stored = this.#byId.get(input.face.faceId)
    if (!stored) {
      throw new FontShapingError(
        "fonts/shaping-boundary",
        `Font face '${input.face.faceId}' does not belong to this registry`
      )
    }
    for (const character of input.text) {
      const codePoint = character.codePointAt(0)
      if (
        codePoint === undefined ||
        !stored.parsed.hasGlyphForCodePoint(codePoint)
      ) {
        throw new FontShapingError(
          "fonts/missing-glyph",
          `Font '${stored.resource.postscriptName}' has no glyph for U+${(
            codePoint ?? 0
          )
            .toString(16)
            .toUpperCase()
            .padStart(4, "0")}`
        )
      }
    }

    const run = stored.parsed.layout(input.text, {
      direction: "ltr",
      script: "latn",
      ...(input.language === undefined ? {} : { language: input.language }),
    })
    let rawX = 0
    let rawY = 0
    let roundedX = 0
    let roundedY = 0
    const glyphs: ShapedGlyph[] = run.glyphs.map((glyph) => {
      if (glyph.glyphId === 0) {
        throw new FontShapingError(
          "fonts/missing-glyph",
          `Font '${stored.resource.postscriptName}' produced the missing glyph`
        )
      }
      rawX += glyph.advanceX
      // Font coordinates are y-up; the display list is y-down.
      rawY -= glyph.advanceY
      const nextRoundedX = scaleMetric(
        rawX,
        input.fontSize,
        stored.parsed.metrics.unitsPerEm
      )
      const nextRoundedY = scaleMetric(
        rawY,
        input.fontSize,
        stored.parsed.metrics.unitsPerEm
      )
      const shaped = Object.freeze({
        glyphId: glyph.glyphId,
        unicode: glyph.unicode,
        clusterStart: glyph.clusterStart,
        clusterEnd: glyph.clusterEnd,
        advanceX: twips(nextRoundedX - roundedX),
        advanceY: twips(nextRoundedY - roundedY),
        offsetX: scaleMetric(
          glyph.offsetX,
          input.fontSize,
          stored.parsed.metrics.unitsPerEm
        ),
        offsetY: scaleMetric(
          -glyph.offsetY,
          input.fontSize,
          stored.parsed.metrics.unitsPerEm
        ),
      })
      roundedX = nextRoundedX
      roundedY = nextRoundedY
      return shaped
    })
    return Object.freeze({
      glyphs: Object.freeze(glyphs),
      advanceX: twips(roundedX),
      ascent: scaleMetric(
        stored.parsed.metrics.ascent,
        input.fontSize,
        stored.parsed.metrics.unitsPerEm
      ),
      descent: scaleMetric(
        stored.parsed.metrics.descent,
        input.fontSize,
        stored.parsed.metrics.unitsPerEm
      ),
      lineGap: scaleMetric(
        stored.parsed.metrics.lineGap,
        input.fontSize,
        stored.parsed.metrics.unitsPerEm
      ),
    })
  }

  subset(
    faceIdValue: FontFaceId,
    glyphIds: readonly GlyphId[],
    signal?: AbortSignal
  ): EmbeddedFontSubset {
    signal?.throwIfAborted()
    const stored = this.#byId.get(faceIdValue)
    if (!stored)
      throw new FontConfigurationError(`Unknown font face '${faceIdValue}'`)
    const uniqueGlyphIds = [...new Set(glyphIds)].sort(
      (left, right) => left - right
    )
    if (!this.#subsetter) {
      return Object.freeze({
        faceId: faceIdValue,
        kind: stored.resource.kind,
        subsetted: false,
        bytes: stored.resource.bytes.slice(),
        postscriptName: stored.resource.postscriptName,
        metrics: stored.resource.metrics,
        glyphMap: Object.freeze(
          uniqueGlyphIds.map((sourceGlyphId) =>
            Object.freeze({
              sourceGlyphId,
              subsetGlyphId: sourceGlyphId,
            })
          )
        ),
      })
    }
    const result = this.#subsetter.subset(stored.parsed, uniqueGlyphIds, signal)
    signal?.throwIfAborted()
    return Object.freeze({
      faceId: faceIdValue,
      kind: stored.resource.kind,
      subsetted: true,
      bytes: result.bytes.slice(),
      postscriptName: result.postscriptName,
      metrics: stored.resource.metrics,
      glyphMap: Object.freeze(
        result.glyphMap.map((mapping) => Object.freeze({ ...mapping }))
      ),
    })
  }

  #match(
    stored: StoredFace,
    requestedFamily: string,
    kind: FontMatch["kind"]
  ): FontMatch {
    return Object.freeze({
      faceId: stored.resource.faceId,
      requestedFamily,
      resolvedFamily: stored.resource.family,
      kind,
      metrics: stored.resource.metrics,
    })
  }
}

export async function createFontRegistry(
  configuration: FontConfiguration,
  options: CreateFontRegistryOptions = {}
): Promise<ManagedFontRegistry> {
  const parser =
    options.parser ?? (await import("./fontkit-adapter")).fontkitParserAdapter
  const snapshots = configuration.faces.map((registration) => {
    validateRegistration(registration)
    return Object.freeze({
      ...registration,
      normalizedFamily: normalizeFontFamily(registration.family),
      bytes: registration.bytes.slice(),
    })
  })
  const registeredFamilies = new Set(
    snapshots.map((registration) => registration.normalizedFamily)
  )
  const fallbackFamily = normalizeFontFamily(configuration.fallbackFamily)
  const aliases = resolvedAliases(configuration, registeredFamilies)

  const tuples = new Set<FaceKey>()
  for (const registration of snapshots) {
    const key = keyOf(
      registration.normalizedFamily,
      registration.weight,
      registration.style
    )
    if (tuples.has(key)) {
      throw new FontConfigurationError(
        `Duplicate font face '${registration.family}' ${registration.weight} ${registration.style}`
      )
    }
    tuples.add(key)
  }
  if (!tuples.has(keyOf(fallbackFamily, 400, "normal"))) {
    throw new FontConfigurationError(
      "The fallback family must include a 400 normal face"
    )
  }

  const built = await Promise.all(
    snapshots.map(async (registration) => {
      const id = fontFaceId(
        await sha256Hex([
          "apex-docx-pdf/font-face/v1",
          registration.normalizedFamily,
          String(registration.weight),
          registration.style,
          registration.postscriptName ?? "",
          registration.bytes,
        ])
      )
      const parsed = await parser.parse(
        registration.bytes.slice(),
        registration.postscriptName
      )
      const resource: FontFaceResource = Object.freeze({
        faceId: id,
        family: registration.family
          .normalize("NFC")
          .replace(asciiWhitespace, " ")
          .replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/gu, ""),
        weight: registration.weight,
        style: registration.style,
        postscriptName: parsed.postscriptName,
        kind: parsed.kind,
        bytes: registration.bytes,
        metrics: immutableMetrics(parsed.metrics),
      })
      return Object.freeze({
        resource,
        parsed,
        normalizedFamily: registration.normalizedFamily,
      })
    })
  )
  const sortedFaces = [...built].sort((left, right) => {
    const leftKey = keyOf(
      left.normalizedFamily,
      left.resource.weight,
      left.resource.style
    )
    const rightKey = keyOf(
      right.normalizedFamily,
      right.resource.weight,
      right.resource.style
    )
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0
  })
  const sortedAliases = [...aliases].sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0
  )
  const registryHash = documentHash(
    await sha256Hex([
      "apex-docx-pdf/font-registry/v1",
      fallbackFamily,
      ...sortedFaces.flatMap((face) => [
        face.normalizedFamily,
        String(face.resource.weight),
        face.resource.style,
        face.resource.faceId,
      ]),
      ...sortedAliases.flat(),
    ])
  )
  const byId = new Map(built.map((face) => [face.resource.faceId, face]))
  const byKey = new Map(
    built.map((face) => [
      keyOf(face.normalizedFamily, face.resource.weight, face.resource.style),
      face,
    ])
  )
  return Object.freeze(
    new Registry(
      registryHash,
      byId,
      byKey,
      aliases,
      fallbackFamily,
      options.subsetter
    )
  )
}
