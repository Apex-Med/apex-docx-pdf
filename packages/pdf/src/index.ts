import {
  throwIfAborted,
  twips,
  type Diagnostic,
  type EmbeddedFontSubset,
  type FontEmbeddingProvider,
  type FontFaceId,
  type GlyphId,
  type NodeId,
  type PageDisplayList,
  type PositionedGlyph,
  type RenderMetadata,
  type Twip,
} from "@apex-docx-pdf/core"
import type {
  ImagePreparationProvider,
  PreparedImage,
} from "@apex-docx-pdf/images"

export type PdfSerializeOptions = Readonly<{
  fonts?: FontEmbeddingProvider
  images?: ImagePreparationProvider
  metadata?: RenderMetadata
  signal?: AbortSignal
}>

export type PdfSerializeResult = Readonly<{
  bytes: Uint8Array
  diagnostics: readonly Diagnostic[]
}>

/**
 * Deterministically serializes a display list as PDF 1.7. Standard runs retain
 * the built-in Helvetica path; embedded runs use caller-supplied font bytes.
 * Output contains no clock, random document identifier, or compressed stream.
 */
export function serializePdf(
  displayList: PageDisplayList,
  options: PdfSerializeOptions = {}
): PdfSerializeResult {
  throwIfAborted(options.signal)
  const diagnostics: Diagnostic[] = []
  const serializableDisplayList = validPageDisplayList(
    displayList,
    diagnostics,
    options.signal
  )
  const embeddedFonts = prepareEmbeddedFonts(
    serializableDisplayList,
    options.fonts,
    diagnostics,
    options.signal
  )
  const preparedImages = preparePdfImages(
    serializableDisplayList,
    options.images,
    diagnostics,
    options.signal
  )
  const pageCount = serializableDisplayList.pages.length
  const embeddedObjectStart = 5
  const imageObjectStart =
    embeddedObjectStart + embeddedFonts.length * EMBEDDED_FONT_OBJECT_COUNT
  assignImageObjects(preparedImages.unique, imageObjectStart)
  const pageObjectStart =
    imageObjectStart +
    preparedImages.unique.reduce(
      (count, image) => count + (image.image.alphaBytes ? 2 : 1),
      0
    )
  const objects: Uint8Array[] = []
  const pageReferences = serializableDisplayList.pages
    .map((_, index) => `${pageObjectStart + index * 2} 0 R`)
    .join(" ")

  objects.push(ascii("<< /Type /Catalog /Pages 2 0 R >>"))
  objects.push(
    ascii(`<< /Type /Pages /Count ${pageCount} /Kids [${pageReferences}] >>`)
  )
  objects.push(
    ascii(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
    )
  )
  objects.push(infoObject(options.metadata, diagnostics))

  for (const [index, font] of embeddedFonts.entries()) {
    throwIfAborted(options.signal)
    const firstObject = embeddedObjectStart + index * EMBEDDED_FONT_OBJECT_COUNT
    objects.push(...embeddedFontObjects(font, firstObject, options.signal))
  }

  for (const image of preparedImages.unique) {
    throwIfAborted(options.signal)
    objects.push(...imageObjects(image))
  }

  for (const [index, page] of serializableDisplayList.pages.entries()) {
    throwIfAborted(options.signal)
    const content = pageContent(
      page,
      embeddedFonts,
      preparedImages.byAsset,
      diagnostics,
      options.signal
    )
    const pageObjectNumber = pageObjectStart + index * 2
    const contentObjectNumber = pageObjectNumber + 1
    objects.push(
      ascii(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${point(page.width)} ${point(page.height)}] ` +
          `/Resources << /Font << ${fontResources(embeddedFonts, embeddedObjectStart)} >>${pageImageResources(page, preparedImages.byAsset)} >> /Contents ${contentObjectNumber} 0 R >>`
      )
    )
    objects.push(
      concat([
        ascii(`<< /Length ${content.length} >>\nstream\n`),
        content,
        ascii("\nendstream"),
      ])
    )
  }

  const header = ascii("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n")
  const writer = new ByteWriter()
  writer.write(header)
  const offsets: number[] = [0]
  for (const [index, object] of objects.entries()) {
    throwIfAborted(options.signal)
    offsets.push(writer.length)
    writer.write(ascii(`${index + 1} 0 obj\n`))
    writer.write(object)
    writer.write(ascii("\nendobj\n"))
  }
  const xrefOffset = writer.length
  writer.write(ascii(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`))
  for (const offset of offsets.slice(1)) {
    throwIfAborted(options.signal)
    writer.write(ascii(`${String(offset).padStart(10, "0")} 00000 n \n`))
  }
  writer.write(
    ascii(
      `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 4 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
    )
  )

  return Object.freeze({
    bytes: writer.toBytes(),
    diagnostics: Object.freeze(diagnostics),
  })
}

function validPageDisplayList(
  displayList: PageDisplayList,
  diagnostics: Diagnostic[],
  signal?: AbortSignal
): PageDisplayList {
  const pages: PageDisplayList["pages"][number][] = []
  for (const [index, page] of displayList.pages.entries()) {
    throwIfAborted(signal)
    if (
      !Number.isSafeInteger(page.width) ||
      page.width <= 0 ||
      !Number.isSafeInteger(page.height) ||
      page.height <= 0
    ) {
      diagnostics.push({
        code: "pdf/page-geometry-invalid",
        severity: "error",
        message: `Page ${index + 1} width and height must be positive safe-integer twips; page was omitted`,
        details: { pageIndex: index + 1 },
      })
      continue
    }
    pages.push(page)
  }
  return Object.freeze({ pages: Object.freeze(pages) })
}

function pageContent(
  page: PageDisplayList["pages"][number],
  embeddedFonts: readonly PreparedEmbeddedFont[],
  imagesByAsset: ReadonlyMap<string, PreparedPdfImage>,
  diagnostics: Diagnostic[],
  signal?: AbortSignal
): Uint8Array {
  const writer = new ByteWriter()
  const fontsByFace = new Map(embeddedFonts.map((font) => [font.faceId, font]))
  for (const item of page.items) {
    throwIfAborted(signal)
    if (item.type === "image") {
      const boundsError = validateImageBounds(item.bounds)
      if (boundsError) {
        diagnostics.push(
          diagnostic(
            "pdf/image-placement-invalid",
            "error",
            `${boundsError}; item was omitted`,
            item.sourceNodeId
          )
        )
        continue
      }
      const image = imagesByAsset.get(item.assetId)
      if (!image) continue
      writer.write(
        ascii(
          `q\n${point(item.bounds.width)} 0 0 ${point(item.bounds.height)} ${point(item.bounds.x)} ${point(twips(page.height - item.bounds.y - item.bounds.height))} cm\n/${image.resourceName} Do\nQ\n`
        )
      )
      continue
    }
    if (item.type === "glyph-run") {
      if (item.fontSource === "embedded") {
        const font = fontsByFace.get(item.faceId)
        if (!font) continue
        const color = parseColor(item.color)
        if (!color) {
          diagnostics.push(
            diagnostic(
              "pdf/color",
              "error",
              `Unsupported color '${item.color}' in glyph run; run was omitted`,
              item.sourceNodeId
            )
          )
          continue
        }
        writeEmbeddedRun(writer, page.height, item, font, color, signal)
        continue
      }
      if (item.fontFamily !== "Helvetica") {
        diagnostics.push(
          diagnostic(
            "pdf/font-fallback",
            "warning",
            `Phase 1 PDF renders '${item.fontFamily}' with built-in Helvetica`,
            item.sourceNodeId
          )
        )
      }
      const encoded = encodeWinAnsi(item.text)
      if (!encoded) {
        diagnostics.push(
          diagnostic(
            "pdf/text-encoding",
            "error",
            "Glyph run contains characters outside Phase 1 WinAnsi encoding and was omitted",
            item.sourceNodeId
          )
        )
        continue
      }
      const color = parseColor(item.color)
      if (!color) {
        diagnostics.push(
          diagnostic(
            "pdf/color",
            "error",
            `Unsupported color '${item.color}' in glyph run; run was omitted`,
            item.sourceNodeId
          )
        )
        continue
      }
      writer.write(ascii("q\nBT\n"))
      writer.write(ascii(`/F1 ${point(item.fontSize)} Tf\n${color} rg\n`))
      writer.write(
        ascii(
          `1 0 0 1 ${point(item.x)} ${point(twips(page.height - item.baselineY))} Tm\n(`
        )
      )
      writer.write(escapePdfLiteral(encoded))
      writer.write(ascii(") Tj\nET\nQ\n"))
      continue
    }
    if (item.type === "line") {
      const lineError = validateLine(item)
      if (lineError) {
        diagnostics.push(
          diagnostic(
            "pdf/line-invalid",
            "error",
            `${lineError}; item was omitted`,
            item.sourceNodeId
          )
        )
        continue
      }
      const color = parseColor(item.color)
      if (!color) {
        diagnostics.push(
          diagnostic(
            "pdf/color",
            "error",
            "Unsupported line color; item was omitted",
            item.sourceNodeId
          )
        )
        continue
      }
      writer.write(ascii("q\n"))
      const dashArray = item.dashArray ?? []
      const dashPhase = item.dashPhase ?? (0 as Twip)
      const lineCap = item.lineCap ?? "butt"
      writer.write(
        ascii(
          `${color} RG\n${point(item.width)} w\n[${dashArray.map(point).join(" ")}] ${point(dashPhase)} d\n${pdfLineCap(lineCap)} J\n1 0 0 -1 0 ${point(page.height)} cm\n${point(item.x1)} ${point(item.y1)} m ${point(item.x2)} ${point(item.y2)} l S\n`
        )
      )
    } else {
      const rectangleError = validateRectangle(item)
      if (rectangleError) {
        diagnostics.push(
          diagnostic(
            "pdf/rectangle-invalid",
            "error",
            `${rectangleError}; item was omitted`,
            item.sourceNodeId
          )
        )
        continue
      }
      const stroke = item.strokeColor ? parseColor(item.strokeColor) : undefined
      const fill = item.fillColor ? parseColor(item.fillColor) : undefined
      if ((item.strokeColor && !stroke) || (item.fillColor && !fill)) {
        diagnostics.push(
          diagnostic(
            "pdf/color",
            "error",
            "Unsupported rectangle color; item was omitted",
            item.sourceNodeId
          )
        )
        continue
      }
      writer.write(ascii("q\n"))
      const { bounds } = item
      if (fill) writer.write(ascii(`${fill} rg\n`))
      if (stroke)
        writer.write(
          ascii(`${stroke} RG\n${point(item.strokeWidth ?? (20 as Twip))} w\n`)
        )
      writer.write(
        ascii(
          `1 0 0 -1 0 ${point(page.height)} cm\n${point(bounds.x)} ${point(bounds.y)} ${point(bounds.width)} ${point(bounds.height)} re ${fill && stroke ? "B" : fill ? "f" : "S"}\n`
        )
      )
    }
    writer.write(ascii("Q\n"))
  }
  return writer.toBytes()
}

function validateImageBounds(
  bounds: Extract<
    PageDisplayList["pages"][number]["items"][number],
    { type: "image" }
  >["bounds"]
): string | undefined {
  if (
    [bounds.x, bounds.y, bounds.width, bounds.height].some(
      (value) => !Number.isSafeInteger(value)
    )
  )
    return "Image bounds must be safe integer twips"
  if (bounds.width <= 0 || bounds.height <= 0)
    return "Image dimensions must be positive twip values"
  return undefined
}

type PreparedPdfImage = {
  resourceName: string
  image: PreparedImage
  objectNumber: number
  smaskObjectNumber?: number
}

function preparePdfImages(
  displayList: PageDisplayList,
  provider: ImagePreparationProvider | undefined,
  diagnostics: Diagnostic[],
  signal?: AbortSignal
): Readonly<{
  unique: PreparedPdfImage[]
  byAsset: ReadonlyMap<string, PreparedPdfImage>
}> {
  const placements = displayList.pages.flatMap((page) =>
    page.items.filter(
      (item): item is Extract<typeof item, { type: "image" }> =>
        item.type === "image"
    )
  )
  if (placements.length === 0) return { unique: [], byAsset: new Map() }
  if (!provider) {
    for (const placement of placements)
      diagnostics.push(
        diagnostic(
          "pdf/image-unavailable",
          "error",
          `Image asset '${placement.assetId}' requires an image preparation provider; item was omitted`,
          placement.sourceNodeId
        )
      )
    return { unique: [], byAsset: new Map() }
  }
  const byAsset = new Map<string, PreparedPdfImage>()
  const buckets = new Map<string, PreparedPdfImage[]>()
  const unique: PreparedPdfImage[] = []
  const ids = [
    ...new Set(placements.map((placement) => placement.assetId)),
  ].sort(compareStrings)
  for (const assetId of ids) {
    throwIfAborted(signal)
    let image: PreparedImage | undefined
    try {
      image = provider.get(assetId)
    } catch (error) {
      throwIfAborted(signal)
      for (const placement of placements.filter(
        (item) => item.assetId === assetId
      ))
        diagnostics.push(
          diagnostic(
            "pdf/image-provider-failed",
            "error",
            `Image provider failed for asset '${assetId}': ${errorMessage(error)}; item was omitted`,
            placement.sourceNodeId
          )
        )
      continue
    }
    const problem = validatePreparedImage(image)
    if (problem) {
      for (const placement of placements.filter(
        (item) => item.assetId === assetId
      ))
        diagnostics.push(
          diagnostic(
            image ? "pdf/image-invalid" : "pdf/image-unavailable",
            "error",
            `${problem}; image asset '${assetId}' was omitted`,
            placement.sourceNodeId
          )
        )
      continue
    }
    const valid = image as PreparedImage
    let prepared = (buckets.get(valid.hash) ?? []).find((candidate) =>
      equalPreparedImages(candidate.image, valid)
    )
    if (!prepared) {
      prepared = {
        resourceName: `Im${unique.length + 1}`,
        image: valid,
        objectNumber: 0,
      }
      unique.push(prepared)
      const bucket = buckets.get(valid.hash) ?? []
      bucket.push(prepared)
      buckets.set(valid.hash, bucket)
    }
    byAsset.set(assetId, prepared)
  }
  return { unique, byAsset }
}

function validatePreparedImage(
  image: PreparedImage | undefined
): string | undefined {
  if (!image || typeof image !== "object")
    return "Prepared image is unavailable"
  if (!/^[a-f0-9]{64}$/u.test(image.hash))
    return "Prepared image hash must be lowercase SHA-256"
  if (
    !Number.isSafeInteger(image.width) ||
    !Number.isSafeInteger(image.height) ||
    image.width <= 0 ||
    image.height <= 0
  )
    return "Prepared image dimensions must be positive safe integers"
  if (image.colorSpace !== "DeviceGray" && image.colorSpace !== "DeviceRGB")
    return "Prepared image color space is unsupported"
  if (image.bitsPerComponent !== 8)
    return "Prepared image must use 8 bits per component"
  if (image.filter !== "FlateDecode" && image.filter !== "DCTDecode")
    return "Prepared image filter is unsupported"
  if (!validOctets(image.bytes) || image.bytes.length === 0)
    return "Prepared image bytes are invalid"
  if (
    image.alphaBytes &&
    (!validOctets(image.alphaBytes) ||
      image.alphaBytes.length === 0 ||
      image.filter !== "FlateDecode")
  )
    return "Prepared image alpha bytes are invalid"
  return undefined
}

function validOctets(bytes: readonly number[]): boolean {
  return (
    Array.isArray(bytes) &&
    bytes.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
  )
}

function equalPreparedImages(
  left: PreparedImage,
  right: PreparedImage
): boolean {
  return (
    left.width === right.width &&
    left.height === right.height &&
    left.colorSpace === right.colorSpace &&
    left.bitsPerComponent === right.bitsPerComponent &&
    left.filter === right.filter &&
    equalNumbers(left.bytes, right.bytes) &&
    equalNumbers(left.alphaBytes ?? [], right.alphaBytes ?? [])
  )
}

function equalNumbers(
  left: readonly number[],
  right: readonly number[]
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
}

function assignImageObjects(images: PreparedPdfImage[], start: number): void {
  let objectNumber = start
  for (const image of images) {
    image.objectNumber = objectNumber++
    if (image.image.alphaBytes) image.smaskObjectNumber = objectNumber++
  }
}

function imageObjects(prepared: PreparedPdfImage): Uint8Array[] {
  const { image } = prepared
  const main = imageStream(
    image.bytes,
    image.width,
    image.height,
    image.colorSpace,
    image.filter,
    prepared.smaskObjectNumber
  )
  if (!image.alphaBytes) return [main]
  return [
    main,
    imageStream(
      image.alphaBytes,
      image.width,
      image.height,
      "DeviceGray",
      "FlateDecode"
    ),
  ]
}

function imageStream(
  bytes: readonly number[],
  width: number,
  height: number,
  colorSpace: "DeviceGray" | "DeviceRGB",
  filter: "FlateDecode" | "DCTDecode",
  smaskObject?: number
): Uint8Array {
  return concat([
    ascii(
      `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /${colorSpace} /BitsPerComponent 8 /Filter /${filter}${smaskObject ? ` /SMask ${smaskObject} 0 R` : ""} /Length ${bytes.length} >>\nstream\n`
    ),
    Uint8Array.from(bytes),
    ascii("\nendstream"),
  ])
}

function pageImageResources(
  page: PageDisplayList["pages"][number],
  imagesByAsset: ReadonlyMap<string, PreparedPdfImage>
): string {
  const images = new Map<string, PreparedPdfImage>()
  for (const item of page.items) {
    if (item.type !== "image") continue
    const image = imagesByAsset.get(item.assetId)
    if (image) images.set(image.resourceName, image)
  }
  if (images.size === 0) return ""
  return ` /XObject << ${[...images.values()]
    .sort((left, right) =>
      compareStrings(left.resourceName, right.resourceName)
    )
    .map((image) => `/${image.resourceName} ${image.objectNumber} 0 R`)
    .join(" ")} >>`
}

function validateLine(
  line: Extract<
    PageDisplayList["pages"][number]["items"][number],
    { type: "line" }
  >
): string | undefined {
  for (const value of [line.x1, line.y1, line.x2, line.y2]) {
    if (!Number.isSafeInteger(value))
      return "Line coordinates must be safe integer twips"
  }
  if (!Number.isSafeInteger(line.width) || line.width < 0)
    return "Line width must be a non-negative safe integer twip value"
  if (
    line.dashPhase !== undefined &&
    (!Number.isSafeInteger(line.dashPhase) || line.dashPhase < 0)
  )
    return "Line dash phase must be a non-negative safe integer twip value"
  if (
    line.dashArray?.some(
      (component) => !Number.isSafeInteger(component) || component <= 0
    )
  )
    return "Line dash components must be positive safe integer twip values"
  if (
    line.lineCap !== undefined &&
    line.lineCap !== "butt" &&
    line.lineCap !== "round" &&
    line.lineCap !== "square"
  )
    return "Line cap must be 'butt', 'round', or 'square'"
  return undefined
}

function validateRectangle(
  rectangle: Extract<
    PageDisplayList["pages"][number]["items"][number],
    { type: "rectangle" }
  >
): string | undefined {
  const { bounds } = rectangle
  for (const value of [bounds.x, bounds.y, bounds.width, bounds.height]) {
    if (!Number.isSafeInteger(value))
      return "Rectangle bounds must be safe integer twips"
  }
  if (bounds.width < 0 || bounds.height < 0)
    return "Rectangle dimensions must be non-negative twip values"
  if (
    rectangle.strokeWidth !== undefined &&
    (!Number.isSafeInteger(rectangle.strokeWidth) || rectangle.strokeWidth < 0)
  )
    return "Rectangle stroke width must be a non-negative safe integer twip value"
  if (rectangle.strokeColor === undefined && rectangle.fillColor === undefined)
    return "Rectangle must define a stroke color, a fill color, or both"
  return undefined
}

function pdfLineCap(lineCap: "butt" | "round" | "square"): 0 | 1 | 2 {
  if (lineCap === "round") return 1
  if (lineCap === "square") return 2
  return 0
}

const EMBEDDED_FONT_OBJECT_COUNT = 6
const MAX_CID = 0xffff

type GlyphPair = Readonly<{
  sourceGlyphId: number
  unicode: string
}>

type PreparedEmbeddedFont = Readonly<{
  faceId: FontFaceId
  resourceName: string
  subset: EmbeddedFontSubset
  pairs: readonly GlyphPair[]
  cidByPair: ReadonlyMap<string, number>
  subsetGlyphBySource: ReadonlyMap<number, number>
}>

function prepareEmbeddedFonts(
  displayList: PageDisplayList,
  provider: FontEmbeddingProvider | undefined,
  diagnostics: Diagnostic[],
  signal?: AbortSignal
): PreparedEmbeddedFont[] {
  const runsByFace = new Map<
    FontFaceId,
    Array<
      Extract<
        PageDisplayList["pages"][number]["items"][number],
        { fontSource: "embedded" }
      >
    >
  >()
  for (const page of displayList.pages) {
    throwIfAborted(signal)
    for (const item of page.items) {
      throwIfAborted(signal)
      if (item.type !== "glyph-run" || item.fontSource !== "embedded") continue
      const runs = runsByFace.get(item.faceId) ?? []
      runs.push(item)
      runsByFace.set(item.faceId, runs)
    }
  }
  if (runsByFace.size === 0) return []
  if (!provider) {
    for (const runs of runsByFace.values()) {
      for (const run of runs) {
        diagnostics.push(
          diagnostic(
            "pdf/embedded-font-unavailable",
            "error",
            "Embedded glyph runs require a font embedding provider; run was omitted",
            run.sourceNodeId
          )
        )
      }
    }
    return []
  }

  const prepared: PreparedEmbeddedFont[] = []
  const faces = [...runsByFace.keys()].sort(compareStrings)
  for (const [faceIndex, faceId] of faces.entries()) {
    throwIfAborted(signal)
    const runs = runsByFace.get(faceId) ?? []
    const pairByKey = new Map<string, GlyphPair>()
    pairByKey.set(pairKey(0, ""), { sourceGlyphId: 0, unicode: "" })
    let invalidRun = false
    for (const run of runs) {
      for (const glyph of run.glyphs) {
        throwIfAborted(signal)
        const glyphError = validatePositionedGlyph(glyph)
        if (glyphError) {
          diagnostics.push(
            diagnostic(
              "pdf/embedded-glyph-invalid",
              "error",
              `${glyphError}; run was omitted`,
              run.sourceNodeId
            )
          )
          invalidRun = true
          break
        }
        pairByKey.set(pairKey(glyph.glyphId, glyph.unicode), {
          sourceGlyphId: glyph.glyphId,
          unicode: glyph.unicode,
        })
      }
    }
    if (invalidRun) continue
    const pairs = [...pairByKey.values()].sort(compareGlyphPairs)
    if (pairs.length > MAX_CID + 1) {
      diagnostics.push(
        diagnostic(
          "pdf/embedded-font-invalid",
          "error",
          `Font face '${faceId}' requires more than 65536 CIDs; its runs were omitted`
        )
      )
      continue
    }
    const glyphIds = [...new Set(pairs.map((pair) => pair.sourceGlyphId))].sort(
      (left, right) => left - right
    ) as GlyphId[]
    let subset: EmbeddedFontSubset
    try {
      subset = provider.subset(faceId, glyphIds, signal)
      throwIfAborted(signal)
    } catch (error) {
      throwIfAborted(signal)
      diagnostics.push(
        diagnostic(
          "pdf/font-embedding-failed",
          "error",
          `Font provider failed for face '${faceId}': ${errorMessage(error)}`
        )
      )
      continue
    }
    const validation = validateSubset(subset, faceId, glyphIds)
    if (validation.error) {
      diagnostics.push(
        diagnostic(
          validation.code,
          "error",
          `${validation.error}; face '${faceId}' was omitted`
        )
      )
      continue
    }
    const cidByPair = new Map<string, number>()
    for (const [cid, pair] of pairs.entries())
      cidByPair.set(pairKey(pair.sourceGlyphId, pair.unicode), cid)
    prepared.push({
      faceId,
      resourceName: `F${faceIndex + 2}`,
      subset,
      pairs,
      cidByPair,
      subsetGlyphBySource: validation.glyphMap,
    })
  }
  return prepared
}

function validatePositionedGlyph(glyph: PositionedGlyph): string | undefined {
  if (
    !Number.isSafeInteger(glyph.glyphId) ||
    glyph.glyphId < 0 ||
    glyph.glyphId > MAX_CID
  )
    return "Embedded glyph ID must be an integer from 0 through 65535"
  if (hasUnpairedSurrogate(glyph.unicode))
    return "Embedded glyph Unicode contains an unpaired surrogate"
  for (const value of [
    glyph.xAdvance,
    glyph.yAdvance,
    glyph.xOffset,
    glyph.yOffset,
  ]) {
    if (!Number.isSafeInteger(value))
      return "Embedded glyph positions must be safe integer twips"
  }
  return undefined
}

function validateSubset(
  subset: EmbeddedFontSubset,
  faceId: FontFaceId,
  requestedGlyphIds: readonly GlyphId[]
): Readonly<{
  code: string
  error?: string
  glyphMap: ReadonlyMap<number, number>
}> {
  const empty = new Map<number, number>()
  if (!subset || typeof subset !== "object" || subset.faceId !== faceId)
    return {
      code: "pdf/embedded-font-invalid",
      error: "Provider returned a mismatched font face ID",
      glyphMap: empty,
    }
  if (subset.kind === "opentype-cff")
    return {
      code: "pdf/embedded-font-cff-unsupported",
      error: "OpenType CFF embedding is not supported",
      glyphMap: empty,
    }
  if (subset.kind !== "truetype")
    return {
      code: "pdf/embedded-font-invalid",
      error: "Provider returned an unknown font program kind",
      glyphMap: empty,
    }
  if (typeof subset.subsetted !== "boolean")
    return {
      code: "pdf/embedded-font-invalid",
      error: "Provider returned an invalid subsetted flag",
      glyphMap: empty,
    }
  if (!(subset.bytes instanceof Uint8Array) || subset.bytes.length === 0)
    return {
      code: "pdf/embedded-font-invalid",
      error: "Provider returned empty or invalid TrueType bytes",
      glyphMap: empty,
    }
  if (
    typeof subset.postscriptName !== "string" ||
    !isPdfName(subset.postscriptName)
  )
    return {
      code: "pdf/embedded-font-invalid",
      error: "Provider returned a PostScript name that is not a valid PDF name",
      glyphMap: empty,
    }
  if (
    !subset.metrics ||
    typeof subset.metrics !== "object" ||
    !subset.metrics.bbox ||
    typeof subset.metrics.bbox !== "object"
  )
    return {
      code: "pdf/embedded-font-invalid",
      error: "Provider returned invalid font metrics",
      glyphMap: empty,
    }
  const metricError = validateMetrics(subset.metrics)
  if (metricError)
    return {
      code: "pdf/embedded-font-invalid",
      error: metricError,
      glyphMap: empty,
    }
  if (!Array.isArray(subset.glyphMap))
    return {
      code: "pdf/embedded-font-invalid",
      error: "Provider returned an invalid glyph map",
      glyphMap: empty,
    }
  const glyphMap = new Map<number, number>()
  for (const mapping of subset.glyphMap) {
    if (!mapping || typeof mapping !== "object")
      return {
        code: "pdf/embedded-font-invalid",
        error: "Provider glyph map contains an invalid entry",
        glyphMap: empty,
      }
    if (
      !Number.isSafeInteger(mapping.sourceGlyphId) ||
      mapping.sourceGlyphId < 0 ||
      mapping.sourceGlyphId > MAX_CID
    )
      return {
        code: "pdf/embedded-font-invalid",
        error: "Provider glyph map contains an invalid source glyph ID",
        glyphMap: empty,
      }
    if (
      !Number.isSafeInteger(mapping.subsetGlyphId) ||
      mapping.subsetGlyphId < 0 ||
      mapping.subsetGlyphId > MAX_CID
    )
      return {
        code: "pdf/embedded-font-invalid",
        error: "Provider glyph map contains an invalid subset glyph ID",
        glyphMap: empty,
      }
    if (glyphMap.has(mapping.sourceGlyphId))
      return {
        code: "pdf/embedded-font-invalid",
        error: "Provider glyph map contains duplicate source glyph IDs",
        glyphMap: empty,
      }
    glyphMap.set(mapping.sourceGlyphId, mapping.subsetGlyphId)
  }
  for (const glyphId of requestedGlyphIds) {
    if (!glyphMap.has(glyphId))
      return {
        code: "pdf/embedded-font-invalid",
        error: `Provider glyph map is missing source glyph ID ${glyphId}`,
        glyphMap: empty,
      }
  }
  return { code: "pdf/embedded-font-invalid", glyphMap }
}

function validateMetrics(
  metrics: EmbeddedFontSubset["metrics"]
): string | undefined {
  if (
    !Number.isSafeInteger(metrics.unitsPerEm) ||
    metrics.unitsPerEm <= 0 ||
    metrics.unitsPerEm > 16_384
  )
    return "Font unitsPerEm must be an integer from 1 through 16384"
  const values = [
    metrics.ascent,
    metrics.descent,
    metrics.lineGap,
    metrics.underlinePosition,
    metrics.underlineThickness,
    metrics.bbox.xMin,
    metrics.bbox.yMin,
    metrics.bbox.xMax,
    metrics.bbox.yMax,
  ]
  if (values.some((value) => !Number.isSafeInteger(value)))
    return "Font metrics must be safe integers"
  if (
    metrics.bbox.xMin > metrics.bbox.xMax ||
    metrics.bbox.yMin > metrics.bbox.yMax
  )
    return "Font bounding box coordinates are reversed"
  return undefined
}

function embeddedFontObjects(
  font: PreparedEmbeddedFont,
  firstObject: number,
  signal?: AbortSignal
): Uint8Array[] {
  const cidFontObject = firstObject + 1
  const descriptorObject = firstObject + 2
  const fontFileObject = firstObject + 3
  const cidMapObject = firstObject + 4
  const toUnicodeObject = firstObject + 5
  const metrics = font.subset.metrics
  const baseFont = font.subset.postscriptName
  const cidMap = new Uint8Array(font.pairs.length * 2)
  for (const [cid, pair] of font.pairs.entries()) {
    throwIfAborted(signal)
    const subsetGlyphId = font.subsetGlyphBySource.get(pair.sourceGlyphId)
    if (subsetGlyphId === undefined)
      throw new TypeError("Validated glyph map became incomplete")
    cidMap[cid * 2] = subsetGlyphId >>> 8
    cidMap[cid * 2 + 1] = subsetGlyphId & 0xff
  }
  const fontFile = streamObject(
    font.subset.bytes,
    `/Length1 ${font.subset.bytes.length}`
  )
  const cidMapStream = streamObject(cidMap)
  const toUnicode = toUnicodeCMap(font.pairs, signal)
  return [
    ascii(
      `<< /Type /Font /Subtype /Type0 /BaseFont /${baseFont} /Encoding /Identity-H /DescendantFonts [${cidFontObject} 0 R] /ToUnicode ${toUnicodeObject} 0 R >>`
    ),
    ascii(
      `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${baseFont} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descriptorObject} 0 R /DW 1000 /CIDToGIDMap ${cidMapObject} 0 R >>`
    ),
    ascii(
      `<< /Type /FontDescriptor /FontName /${baseFont} /Flags 32 /FontBBox [${metric(metrics.bbox.xMin, metrics.unitsPerEm)} ${metric(metrics.bbox.yMin, metrics.unitsPerEm)} ${metric(metrics.bbox.xMax, metrics.unitsPerEm)} ${metric(metrics.bbox.yMax, metrics.unitsPerEm)}] /ItalicAngle 0 /Ascent ${metric(metrics.ascent, metrics.unitsPerEm)} /Descent ${metric(metrics.descent, metrics.unitsPerEm)} /CapHeight ${metric(metrics.ascent, metrics.unitsPerEm)} /StemV 80 /FontFile2 ${fontFileObject} 0 R >>`
    ),
    fontFile,
    cidMapStream,
    streamObject(toUnicode),
  ]
}

function writeEmbeddedRun(
  writer: ByteWriter,
  pageHeight: Twip,
  run: Extract<
    PageDisplayList["pages"][number]["items"][number],
    { fontSource: "embedded" }
  >,
  font: PreparedEmbeddedFont,
  color: string,
  signal?: AbortSignal
): void {
  writer.write(
    ascii(
      `q\nBT\n/${font.resourceName} ${point(run.fontSize)} Tf\n${color} rg\n`
    )
  )
  let x = run.x as number
  let y = run.baselineY as number
  for (const glyph of run.glyphs) {
    throwIfAborted(signal)
    const cid = font.cidByPair.get(pairKey(glyph.glyphId, glyph.unicode))
    if (cid === undefined)
      throw new TypeError("Validated embedded glyph pair became unavailable")
    writer.write(
      ascii(
        `1 0 0 1 ${point(twips(x + glyph.xOffset))} ${point(twips(pageHeight - y - glyph.yOffset))} Tm\n<${hex16(cid)}> Tj\n`
      )
    )
    x += glyph.xAdvance
    y += glyph.yAdvance
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y))
      throw new TypeError(
        "Embedded glyph advances exceed supported integer twips"
      )
  }
  writer.write(ascii("ET\nQ\n"))
}

function toUnicodeCMap(
  pairs: readonly GlyphPair[],
  signal?: AbortSignal
): Uint8Array {
  const mappings = pairs.flatMap((pair, cid) =>
    pair.unicode.length === 0 ? [] : [{ cid, unicode: pair.unicode }]
  )
  const writer = new ByteWriter()
  writer.write(
    ascii(
      "/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /ApexToUnicode def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n"
    )
  )
  for (let start = 0; start < mappings.length; start += 100) {
    throwIfAborted(signal)
    const chunk = mappings.slice(start, start + 100)
    writer.write(ascii(`${chunk.length} beginbfchar\n`))
    for (const mapping of chunk) {
      throwIfAborted(signal)
      writer.write(
        ascii(`<${hex16(mapping.cid)}> <${utf16Hex(mapping.unicode)}>\n`)
      )
    }
    writer.write(ascii("endbfchar\n"))
  }
  writer.write(
    ascii("endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend")
  )
  return writer.toBytes()
}

function fontResources(
  fonts: readonly PreparedEmbeddedFont[],
  objectStart: number
): string {
  const entries = ["/F1 3 0 R"]
  for (const [index, font] of fonts.entries())
    entries.push(
      `/${font.resourceName} ${objectStart + index * EMBEDDED_FONT_OBJECT_COUNT} 0 R`
    )
  return entries.join(" ")
}

function streamObject(bytes: Uint8Array, extra = ""): Uint8Array {
  return concat([
    ascii(`<< /Length ${bytes.length}${extra ? ` ${extra}` : ""} >>\nstream\n`),
    bytes,
    ascii("\nendstream"),
  ])
}

function pairKey(glyphIdValue: number, unicode: string): string {
  return `${glyphIdValue}:${unicode}`
}

function compareGlyphPairs(left: GlyphPair, right: GlyphPair): number {
  return (
    left.sourceGlyphId - right.sourceGlyphId ||
    compareStrings(left.unicode, right.unicode)
  )
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function isPdfName(value: string): boolean {
  return (
    value.length > 0 && value.length <= 127 && /^[A-Za-z0-9_.+-]+$/u.test(value)
  )
}

function metric(value: number, unitsPerEm: number): string {
  return String(Math.round((value * 1000) / unitsPerEm))
}

function hex16(value: number): string {
  return value.toString(16).toUpperCase().padStart(4, "0")
}

function utf16Hex(value: string): string {
  let result = ""
  for (let index = 0; index < value.length; index += 1)
    result += value
      .charCodeAt(index)
      .toString(16)
      .toUpperCase()
      .padStart(4, "0")
  return result
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next < 0xdc00 || next > 0xdfff) return true
      index += 1
    } else if (code >= 0xdc00 && code <= 0xdfff) return true
  }
  return false
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function infoObject(
  metadata: RenderMetadata | undefined,
  diagnostics: Diagnostic[]
): Uint8Array {
  const entries: Array<readonly [string, string]> = [
    ["Producer", "Apex DOCX PDF"],
  ]
  if (metadata?.title) entries.push(["Title", metadata.title])
  if (metadata?.author) entries.push(["Author", metadata.author])
  if (metadata?.subject) entries.push(["Subject", metadata.subject])
  if (metadata?.keywords?.length)
    entries.push(["Keywords", metadata.keywords.join(", ")])
  const writer = new ByteWriter()
  writer.write(ascii("<<"))
  for (const [name, value] of entries) {
    const encoded = encodeWinAnsi(value)
    if (!encoded) {
      diagnostics.push(
        diagnostic(
          "pdf/metadata-encoding",
          "error",
          `Metadata field ${name} contains characters outside Phase 1 WinAnsi encoding and was omitted`
        )
      )
      continue
    }
    writer.write(ascii(` /${name} (`))
    writer.write(escapePdfLiteral(encoded))
    writer.write(ascii(")"))
  }
  writer.write(ascii(" >>"))
  return writer.toBytes()
}

function point(value: Twip): string {
  const numeric = value as number
  const absolute = Math.abs(numeric)
  const whole = Math.trunc(absolute / 20)
  const remainder = absolute % 20
  const sign = numeric < 0 ? "-" : ""
  if (remainder === 0) return `${sign}${whole}`
  return `${sign}${whole}.${String(remainder * 5)
    .padStart(2, "0")
    .replace(/0$/u, "")}`
}

function parseColor(value: string): string | undefined {
  const match = /^#([0-9a-fA-F]{6})$/u.exec(value)
  if (!match?.[1]) return undefined
  const red = Number.parseInt(match[1].slice(0, 2), 16) / 255
  const green = Number.parseInt(match[1].slice(2, 4), 16) / 255
  const blue = Number.parseInt(match[1].slice(4, 6), 16) / 255
  return `${colorComponent(red)} ${colorComponent(green)} ${colorComponent(blue)}`
}

function colorComponent(value: number): string {
  return value.toFixed(6).replace(/0+$/u, "").replace(/\.$/u, "") || "0"
}

function encodeWinAnsi(text: string): Uint8Array | undefined {
  const bytes: number[] = []
  for (const character of text) {
    const codePoint = character.codePointAt(0)
    if (codePoint === undefined) return undefined
    if (codePoint >= 0x20 && codePoint <= 0x7e) bytes.push(codePoint)
    else if (codePoint >= 0xa0 && codePoint <= 0xff) bytes.push(codePoint)
    else {
      const mapped = WIN_ANSI.get(character)
      if (mapped === undefined) return undefined
      bytes.push(mapped)
    }
  }
  return Uint8Array.from(bytes)
}

const WIN_ANSI = new Map<string, number>([
  ["€", 0x80],
  ["‚", 0x82],
  ["ƒ", 0x83],
  ["„", 0x84],
  ["…", 0x85],
  ["†", 0x86],
  ["‡", 0x87],
  ["ˆ", 0x88],
  ["‰", 0x89],
  ["Š", 0x8a],
  ["‹", 0x8b],
  ["Œ", 0x8c],
  ["Ž", 0x8e],
  ["‘", 0x91],
  ["’", 0x92],
  ["“", 0x93],
  ["”", 0x94],
  ["•", 0x95],
  ["–", 0x96],
  ["—", 0x97],
  ["˜", 0x98],
  ["™", 0x99],
  ["š", 0x9a],
  ["›", 0x9b],
  ["œ", 0x9c],
  ["ž", 0x9e],
  ["Ÿ", 0x9f],
])

function escapePdfLiteral(bytes: Uint8Array): Uint8Array {
  const escaped: number[] = []
  for (const byte of bytes) {
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) escaped.push(0x5c)
    escaped.push(byte)
  }
  return Uint8Array.from(escaped)
}

function diagnostic(
  code: string,
  severity: Diagnostic["severity"],
  message: string,
  nodeId?: NodeId
): Diagnostic {
  return { code, severity, message, ...(nodeId ? { nodeId } : {}) }
}

function ascii(value: string): Uint8Array {
  const bytes: number[] = []
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code > 0xff) throw new TypeError("PDF syntax must be Latin-1")
    bytes.push(code)
  }
  return Uint8Array.from(bytes)
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.length, 0)
  const result = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

class ByteWriter {
  private readonly chunks: Uint8Array[] = []
  private size = 0

  get length(): number {
    return this.size
  }

  write(value: Uint8Array): void {
    this.chunks.push(value)
    this.size += value.length
  }

  toBytes(): Uint8Array {
    return concat(this.chunks)
  }
}
