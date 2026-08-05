export type PdfStructuralValidation = Readonly<{
  valid: boolean
  errors: readonly string[]
  version?: string
  pageCount: number
  pageTexts: readonly string[]
  text: string
}>

/**
 * Performs narrow structural checks and text extraction for PDFs emitted by
 * this workspace's standard-font serializer. It is not a general PDF parser.
 */
export function validatePdfStructure(
  bytes: Uint8Array
): PdfStructuralValidation {
  const source = latin1(bytes)
  const errors: string[] = []
  const parsed = classicXrefObjects(bytes, errors)
  const { objects } = parsed
  const header = /^%PDF-(\d+\.\d+)/u.exec(source)
  if (!header?.[1]) errors.push("Missing PDF header")
  if (!/%%EOF\s*$/u.test(source)) errors.push("Missing terminal PDF EOF marker")

  const syntax = stripCommentsAndLiteralStrings(
    objects.size > 0
      ? [...objects.values()].map(withoutStreamPayload).join("\n")
      : source
  )
  if (/(?:^|\s)(?:NaN|[+-]?Infinity)(?=\s|$)/u.test(syntax)) {
    errors.push("PDF contains a non-finite numeric token")
  }
  for (const match of syntax.matchAll(
    /(?:^|[\s[\]<>/])([+-]?(?:\d+\.\d*|\.\d+|\d+)(?:[Ee][+-]?\d+)?)(?=$|[\s[\]<>/])/gu
  )) {
    if (!Number.isFinite(Number(match[1]))) {
      errors.push("PDF contains a non-finite numeric token")
      break
    }
  }

  const pages = pageTreePages(objects, parsed.root, errors)
  const pageTexts = pages.map(([, pageObject], pageIndex) => {
    validatePageMediaBox(pageObject, pageIndex + 1, errors)
    const objectNumber = /\/Contents (\d+) 0 R/u.exec(pageObject)?.[1]
    if (objectNumber === undefined) return ""
    const object = indirectObject(objects, objectNumber)
    if (object === undefined) {
      errors.push(`Missing content object ${objectNumber}`)
      return ""
    }
    validateTextRenderingTransforms(object, pageIndex + 1, errors)
    validatePageImages(objects, pageObject, object, pageIndex + 1, errors)
    return extractPageText(objects, pageObject, object, errors)
  })
  const declaredCount =
    [...objects.values()]
      .map((object) => /\/Type \/Pages \/Count (\d+)/u.exec(object)?.[1])
      .find((value) => value !== undefined) ??
    (objects.size === 0
      ? /\/Type \/Pages \/Count (\d+)/u.exec(source)?.[1]
      : undefined)
  if (declaredCount !== undefined && Number(declaredCount) !== pages.length) {
    addUniqueError(
      errors,
      `Page tree declares ${declaredCount} pages but ${pages.length} page objects were found`
    )
  }

  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors),
    ...(header?.[1] === undefined ? {} : { version: header[1] }),
    pageCount: pages.length,
    pageTexts: Object.freeze(pageTexts),
    text: pageTexts.join("\n"),
  })
}

function validatePageMediaBox(
  pageObject: string,
  pageNumber: number,
  errors: string[]
): void {
  const contents = /\/MediaBox\s*\[([^\]]*)\]/u.exec(pageObject)?.[1]
  const tokens = contents?.trim().split(/\s+/u) ?? []
  const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?$/u
  if (tokens.length !== 4 || tokens.some((token) => !numeric.test(token))) {
    addUniqueError(errors, `Page ${pageNumber} MediaBox is malformed`)
    return
  }
  const coordinates = tokens.map(Number)
  const [left, bottom, right, top] = coordinates
  if (
    left === undefined ||
    bottom === undefined ||
    right === undefined ||
    top === undefined ||
    !coordinates.every(Number.isFinite) ||
    coordinates.some((coordinate) => coordinate < 0) ||
    right <= left ||
    top <= bottom
  )
    addUniqueError(
      errors,
      `Page ${pageNumber} MediaBox must have finite non-negative coordinates and positive dimensions`
    )
}

type PdfObjectMap = ReadonlyMap<string, string>

function classicXrefObjects(
  bytes: Uint8Array,
  errors: string[]
): Readonly<{ objects: Map<string, string>; root?: string }> {
  const objects = new Map<string, string>()
  const source = latin1(bytes)
  const start = /startxref\s+(\d+)\s+%%EOF\s*$/u.exec(source)?.[1]
  if (start === undefined) {
    errors.push("Missing classic PDF startxref")
    return { objects }
  }
  const xrefOffset = Number(start)
  if (
    !Number.isSafeInteger(xrefOffset) ||
    source.slice(xrefOffset, xrefOffset + 5) !== "xref\n"
  ) {
    errors.push("startxref does not point to a classic xref table")
    return { objects }
  }
  let cursor = xrefOffset + 5
  const entries = new Set<number>()
  while (cursor < source.length) {
    if (source.startsWith("trailer", cursor)) break
    const headerEnd = source.indexOf("\n", cursor)
    if (headerEnd < 0) {
      errors.push("Truncated classic xref subsection")
      return { objects }
    }
    const match = /^(\d+) (\d+)\r?$/u.exec(source.slice(cursor, headerEnd))
    if (!match?.[1] || !match[2]) {
      errors.push("Invalid classic xref subsection")
      return { objects }
    }
    const first = Number(match[1])
    const count = Number(match[2])
    cursor = headerEnd + 1
    for (let index = 0; index < count; index += 1) {
      const lineEnd = source.indexOf("\n", cursor)
      if (lineEnd < 0) {
        errors.push("Truncated classic xref entry")
        return { objects }
      }
      const entry = /^(\d{10}) (\d{5}) ([nf]) \r?$/u.exec(
        source.slice(cursor, lineEnd)
      )
      if (!entry?.[1] || !entry[3]) {
        errors.push("Invalid classic xref entry")
        return { objects }
      }
      const objectNumber = first + index
      if (entries.has(objectNumber)) {
        errors.push(`Duplicate classic xref entry for object ${objectNumber}`)
      } else {
        entries.add(objectNumber)
      }
      if (entry[3] === "n") {
        const body = sliceIndirectObject(
          bytes,
          Number(entry[1]),
          objectNumber,
          errors
        )
        if (body !== undefined) objects.set(String(objectNumber), body)
      }
      cursor = lineEnd + 1
    }
  }
  if (!source.startsWith("trailer", cursor)) {
    errors.push("Classic xref table is missing its trailer")
    return { objects }
  }
  const trailerEnd = source.indexOf("startxref", cursor)
  const trailer =
    trailerEnd < 0 ? "" : source.slice(cursor + "trailer".length, trailerEnd)
  const sizeText = /\/Size\s+(\d+)\b/u.exec(trailer)?.[1]
  const root = /\/Root\s+(\d+)\s+0\s+R\b/u.exec(trailer)?.[1]
  if (sizeText === undefined) {
    errors.push("Classic xref trailer is missing /Size")
  } else {
    const size = Number(sizeText)
    if (!Number.isSafeInteger(size) || size <= 0) {
      errors.push("Classic xref trailer has an invalid /Size")
    } else {
      for (let objectNumber = 0; objectNumber < size; objectNumber += 1)
        if (!entries.has(objectNumber))
          errors.push(
            `Classic xref /Size coverage omits object ${objectNumber}`
          )
      for (const objectNumber of entries)
        if (objectNumber >= size)
          errors.push(
            `Classic xref entry ${objectNumber} is outside trailer /Size ${size}`
          )
    }
  }
  if (root === undefined) {
    errors.push("Classic xref trailer is missing /Root")
  } else {
    const catalog = objects.get(root)
    if (!catalog) errors.push(`Classic xref /Root object ${root} is missing`)
    else if (!/\/Type \/Catalog\b/u.test(catalog))
      errors.push(`Classic xref /Root object ${root} is not a catalog`)
  }
  return { objects, ...(root ? { root } : {}) }
}

function pageTreePages(
  objects: PdfObjectMap,
  root: string | undefined,
  errors: string[]
): Array<readonly [string, string]> {
  const catalog = root ? objects.get(root) : undefined
  const pagesReference = catalog
    ? /\/Pages\s+(\d+)\s+0\s+R\b/u.exec(catalog)?.[1]
    : undefined
  if (!catalog || pagesReference === undefined) {
    if (objects.size > 0)
      errors.push("PDF catalog is missing its /Pages reference")
    return []
  }
  const pages: Array<readonly [string, string]> = []
  const visited = new Set<string>()
  const visit = (objectNumber: string): void => {
    if (visited.has(objectNumber)) {
      errors.push(`Page tree contains a cycle at object ${objectNumber}`)
      return
    }
    visited.add(objectNumber)
    const object = objects.get(objectNumber)
    if (!object) {
      errors.push(`Page tree references missing xref object ${objectNumber}`)
      return
    }
    if (/\/Type \/Page\b/u.test(object)) {
      pages.push([objectNumber, object])
      return
    }
    if (!/\/Type \/Pages\b/u.test(object)) {
      errors.push(
        `Page tree object ${objectNumber} is neither /Pages nor /Page`
      )
      return
    }
    const kids = /\/Kids\s*\[([\s\S]*?)\]/u.exec(object)?.[1]
    if (kids === undefined) {
      errors.push(`Page tree node ${objectNumber} is missing /Kids`)
      return
    }
    const references = [...kids.matchAll(/(\d+)\s+0\s+R/gu)]
    const residue = kids.replace(/\d+\s+0\s+R/gu, "").trim()
    if (residue.length > 0)
      errors.push(`Page tree node ${objectNumber} has invalid /Kids entries`)
    for (const reference of references) {
      const child = reference[1]
      if (child) visit(child)
    }
  }
  visit(pagesReference)
  const declaredCount = Number(
    /\/Count\s+(\d+)\b/u.exec(objects.get(pagesReference) ?? "")?.[1]
  )
  if (Number.isSafeInteger(declaredCount) && declaredCount !== pages.length)
    addUniqueError(
      errors,
      `Page tree declares ${declaredCount} pages but ${pages.length} page objects were found`
    )
  return pages
}

function sliceIndirectObject(
  bytes: Uint8Array,
  offset: number,
  objectNumber: number,
  errors: string[]
): string | undefined {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset >= bytes.length) {
    errors.push(`Invalid xref offset for object ${objectNumber}`)
    return undefined
  }
  const tail = latin1(bytes.subarray(offset))
  const header = new RegExp(`^${objectNumber} 0 obj\\r?\\n`, "u").exec(
    tail
  )?.[0]
  if (!header) {
    errors.push(
      `Xref offset for object ${objectNumber} does not point to its header`
    )
    return undefined
  }
  const bodyStart = offset + header.length
  const streamMarker = findBytes(bytes, asciiBytes("\nstream\n"), bodyStart)
  const endObjectMarker = findBytes(bytes, asciiBytes("\nendobj"), bodyStart)
  if (endObjectMarker < 0) {
    errors.push(`Missing endobj for object ${objectNumber}`)
    return undefined
  }
  if (streamMarker < 0 || streamMarker > endObjectMarker)
    return latin1(bytes.subarray(bodyStart, endObjectMarker))
  const dictionary = latin1(bytes.subarray(bodyStart, streamMarker))
  const lengthText = /\/Length\s+(\d+)\b/u.exec(dictionary)?.[1]
  if (lengthText === undefined) {
    errors.push(`Stream object ${objectNumber} requires a direct /Length`)
    return undefined
  }
  const length = Number(lengthText)
  const payloadStart = streamMarker + 8
  const payloadEnd = payloadStart + length
  if (
    !Number.isSafeInteger(length) ||
    length < 0 ||
    payloadEnd > bytes.length
  ) {
    errors.push(`Invalid stream length for object ${objectNumber}`)
    return undefined
  }
  const suffix = asciiBytes("\nendstream\nendobj")
  if (!matchesAt(bytes, suffix, payloadEnd)) {
    errors.push(
      `Declared stream length is inconsistent for object ${objectNumber}`
    )
    return undefined
  }
  return `${dictionary}\nstream\n${latin1(bytes.subarray(payloadStart, payloadEnd))}\nendstream`
}

function withoutStreamPayload(object: string): string {
  const marker = object.indexOf("\nstream\n")
  return marker < 0 ? object : object.slice(0, marker)
}

function asciiBytes(value: string): Uint8Array {
  return Uint8Array.from([...value].map((character) => character.charCodeAt(0)))
}
function findBytes(
  haystack: Uint8Array,
  needle: Uint8Array,
  start: number
): number {
  for (
    let offset = start;
    offset <= haystack.length - needle.length;
    offset += 1
  )
    if (matchesAt(haystack, needle, offset)) return offset
  return -1
}
function matchesAt(
  haystack: Uint8Array,
  needle: Uint8Array,
  offset: number
): boolean {
  return needle.every((value, index) => haystack[offset + index] === value)
}

function validateTextRenderingTransforms(
  contentObject: string,
  pageNumber: number,
  errors: string[]
): void {
  const content =
    /(?:^|\r?\n)stream\r?\n([\s\S]*?)\r?\nendstream(?:\r?\n|$)/u.exec(
      contentObject
    )?.[1]
  if (content === undefined) return

  let graphicsDeterminant = 1
  const graphicsStack: number[] = []
  let inTextObject = false
  let textDeterminant = 1
  let operands: number[] = []

  for (const token of contentTokens(content)) {
    if (typeof token === "number") {
      operands.push(token)
      continue
    }

    if (token === "q") {
      graphicsStack.push(graphicsDeterminant)
    } else if (token === "Q") {
      graphicsDeterminant = graphicsStack.pop() ?? 1
    } else if (token === "BT") {
      inTextObject = true
      textDeterminant = 1
    } else if (token === "ET") {
      inTextObject = false
    } else if (token === "cm" || token === "Tm") {
      const matrix = operands.slice(-6)
      if (matrix.length === 6) {
        const [a, b, c, d] = matrix
        if (
          a !== undefined &&
          b !== undefined &&
          c !== undefined &&
          d !== undefined
        ) {
          const determinant = a * d - b * c
          if (token === "cm") {
            graphicsDeterminant *= determinant
          } else if (inTextObject) {
            textDeterminant = determinant
            if (!matrix.every(Number.isFinite)) {
              addUniqueError(
                errors,
                `Page ${pageNumber} text matrix contains non-finite values`
              )
            } else if (determinant === 0) {
              addUniqueError(
                errors,
                `Page ${pageNumber} text matrix is singular`
              )
            }
          }
        }
      }
    } else if (
      inTextObject &&
      (token === "Tj" || token === "TJ" || token === "'" || token === '"')
    ) {
      const renderingDeterminant = graphicsDeterminant * textDeterminant
      if (!Number.isFinite(renderingDeterminant)) {
        addUniqueError(
          errors,
          `Page ${pageNumber} text rendering transform is non-finite`
        )
      } else if (renderingDeterminant === 0) {
        addUniqueError(
          errors,
          `Page ${pageNumber} text rendering transform is singular`
        )
      } else if (renderingDeterminant < 0) {
        addUniqueError(
          errors,
          `Page ${pageNumber} text rendering transform is mirrored`
        )
      }
    }

    operands = []
  }
}

function validatePageImages(
  objects: PdfObjectMap,
  pageObject: string,
  contentObject: string,
  pageNumber: number,
  errors: string[]
): void {
  const references = new Map<string, string>()
  const xobjects = /\/XObject\s*<<([\s\S]*?)>>/u.exec(pageObject)?.[1] ?? ""
  for (const match of xobjects.matchAll(
    /\/([A-Za-z0-9_.+-]+)\s+(\d+)\s+0\s+R/gu
  )) {
    if (match[1] && match[2]) references.set(match[1], match[2])
  }
  const stream = /\nstream\n([\s\S]*)\nendstream$/u.exec(contentObject)?.[1]
  if (stream === undefined) return
  type Matrix = [number, number, number, number, number, number]
  let current: Matrix = [1, 0, 0, 1, 0, 0]
  const stack: Matrix[] = []
  let operands: Array<number | string> = []
  for (const token of contentTokens(stream)) {
    if (typeof token === "number" || token.startsWith("/")) {
      operands.push(token)
      continue
    }
    if (token === "q") {
      stack.push([...current])
    } else if (token === "Q") {
      const restored = stack.pop()
      if (restored) current = restored
    } else if (token === "cm") {
      const matrix = operands.slice(-6)
      if (
        matrix.length !== 6 ||
        matrix.some((value) => typeof value !== "number")
      ) {
        current = [Number.NaN, 0, 0, Number.NaN, 0, 0]
      } else {
        current = multiplyMatrices(current, matrix as Matrix)
      }
    } else if (token === "Do") {
      const resource = operands.at(-1)
      const name =
        typeof resource === "string" && resource.startsWith("/")
          ? resource.slice(1)
          : undefined
      if (!name) {
        addUniqueError(errors, `Page ${pageNumber} Do has no XObject name`)
      } else {
        const [a, b, c, d] = current
        const determinant = a * d - b * c
        if (
          !current.every(Number.isFinite) ||
          determinant <= 0 ||
          a * a + b * b === 0 ||
          c * c + d * d === 0
        )
          addUniqueError(
            errors,
            `Page ${pageNumber} image matrix is non-finite, singular, or mirrored`
          )
        const objectNumber = references.get(name)
        if (!objectNumber) {
          addUniqueError(
            errors,
            `Page ${pageNumber} image resource ${name} is not declared`
          )
        } else {
          validateImageObject(objects, objectNumber, name, errors)
        }
      }
    }
    operands = []
  }
}

function multiplyMatrices(
  left: readonly [number, number, number, number, number, number],
  right: readonly [number, number, number, number, number, number]
): [number, number, number, number, number, number] {
  const [a1, b1, c1, d1, e1, f1] = left
  const [a2, b2, c2, d2, e2, f2] = right
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ]
}

function validateImageObject(
  objects: PdfObjectMap,
  objectNumber: string,
  resourceName: string,
  errors: string[]
): void {
  const object = objects.get(objectNumber)
  if (!object) {
    addUniqueError(
      errors,
      `Missing image object ${objectNumber} for ${resourceName}`
    )
    return
  }
  if (
    !/\/Type \/XObject\b/u.test(object) ||
    !/\/Subtype \/Image\b/u.test(object)
  ) {
    addUniqueError(
      errors,
      `Resource ${resourceName} does not reference an image XObject`
    )
    return
  }
  const width = Number(/\/Width\s+(\d+)/u.exec(object)?.[1])
  const height = Number(/\/Height\s+(\d+)/u.exec(object)?.[1])
  const color = /\/ColorSpace\s+\/(DeviceGray|DeviceRGB)\b/u.exec(object)?.[1]
  const bits = Number(/\/BitsPerComponent\s+(\d+)/u.exec(object)?.[1])
  const filter = /\/Filter\s+\/(FlateDecode|DCTDecode)\b/u.exec(object)?.[1]
  if (
    !Number.isSafeInteger(width) ||
    width <= 0 ||
    !Number.isSafeInteger(height) ||
    height <= 0 ||
    !color ||
    bits !== 8 ||
    !filter
  )
    addUniqueError(
      errors,
      `Image XObject ${objectNumber} has an unsupported profile`
    )
  const smask = /\/SMask\s+(\d+)\s+0\s+R/u.exec(object)?.[1]
  if (!smask) return
  const alpha = objects.get(smask)
  if (
    !alpha ||
    !/\/Subtype \/Image\b/u.test(alpha) ||
    !/\/ColorSpace \/DeviceGray\b/u.test(alpha) ||
    !/\/Filter \/FlateDecode\b/u.test(alpha) ||
    Number(/\/Width\s+(\d+)/u.exec(alpha)?.[1]) !== width ||
    Number(/\/Height\s+(\d+)/u.exec(alpha)?.[1]) !== height
  )
    addUniqueError(
      errors,
      `Image XObject ${objectNumber} has an invalid soft mask`
    )
}

function* contentTokens(content: string): Generator<number | string> {
  let offset = 0
  while (offset < content.length) {
    const character = content[offset]
    if (character === undefined) return
    if (/\s/u.test(character)) {
      offset += 1
      continue
    }
    if (character === "%") {
      const end = /[\r\n]/u.exec(content.slice(offset))?.index
      offset = end === undefined ? content.length : offset + end
      continue
    }
    if (character === "(") {
      offset = skipLiteralString(content, offset)
      continue
    }
    if (character === "<" && content[offset + 1] !== "<") {
      const end = content.indexOf(">", offset + 1)
      offset = end === -1 ? content.length : end + 1
      continue
    }
    if (character === "/") {
      const start = offset++
      while (offset < content.length && !isPdfDelimiter(content[offset]))
        offset += 1
      yield content.slice(start, offset)
      continue
    }
    if (isPdfDelimiter(character)) {
      offset += 1
      continue
    }

    const end = nextPdfDelimiter(content, offset)
    const token = content.slice(offset, end)
    if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?$/u.test(token)) {
      yield Number(token)
    } else {
      yield token
    }
    offset = end
  }
}

function skipLiteralString(content: string, start: number): number {
  let depth = 1
  for (let offset = start + 1; offset < content.length; offset += 1) {
    const character = content[offset]
    if (character === "\\") {
      offset += 1
    } else if (character === "(") {
      depth += 1
    } else if (character === ")") {
      depth -= 1
      if (depth === 0) return offset + 1
    }
  }
  return content.length
}

function nextPdfDelimiter(content: string, start: number): number {
  let offset = start
  while (offset < content.length && !isPdfDelimiter(content[offset])) {
    offset += 1
  }
  return offset
}

function isPdfDelimiter(value: string | undefined): boolean {
  return value === undefined || /[\s()[\]<>/%]/u.test(value)
}

function addUniqueError(errors: string[], error: string): void {
  if (!errors.includes(error)) errors.push(error)
}

function extractPageText(
  objects: PdfObjectMap,
  pageObject: string,
  contentObject: string,
  errors: string[]
): string {
  const unicodeByResource = pageFontUnicodeMaps(objects, pageObject, errors)
  const text: string[] = []
  let currentFont: string | undefined
  const expression =
    /\/([A-Za-z0-9_.+-]+)\s+[+-]?(?:\d+(?:\.\d*)?|\.\d+)\s+Tf|\(((?:\\[\s\S]|[^\\)])*)\)\s*Tj|<([0-9A-Fa-f\s]+)>\s*Tj/gu
  for (const match of contentObject.matchAll(expression)) {
    if (match[1] !== undefined) {
      currentFont = match[1]
      continue
    }
    if (match[2] !== undefined) {
      text.push(decodePdfLiteral(match[2]))
      continue
    }
    if (match[3] === undefined) continue
    const cmap = currentFont ? unicodeByResource.get(currentFont) : undefined
    if (!cmap) {
      errors.push(
        `Hexadecimal text uses font ${currentFont ?? "<unset>"} without a ToUnicode map`
      )
      continue
    }
    const hex = match[3].replace(/\s/gu, "")
    if (hex.length % 4 !== 0) {
      errors.push(
        "Hexadecimal Type0 text does not contain complete two-byte CIDs"
      )
      continue
    }
    for (let offset = 0; offset < hex.length; offset += 4) {
      const cid = Number.parseInt(hex.slice(offset, offset + 4), 16)
      const unicode = cmap.get(cid)
      if (unicode === undefined) {
        errors.push(
          `ToUnicode map for font ${currentFont ?? "<unset>"} omits CID ${cid}`
        )
      } else {
        text.push(unicode)
      }
    }
  }
  return text.join("")
}

function pageFontUnicodeMaps(
  objects: PdfObjectMap,
  pageObject: string,
  errors: string[]
): ReadonlyMap<string, ReadonlyMap<number, string>> {
  const maps = new Map<string, ReadonlyMap<number, string>>()
  const fontReferences = pageObject.matchAll(
    /\/([A-Za-z0-9_.+-]+)\s+(\d+)\s+0\s+R/gu
  )
  for (const reference of fontReferences) {
    const resourceName = reference[1]
    const objectNumber = reference[2]
    if (resourceName === undefined || objectNumber === undefined) continue
    const fontObject = indirectObject(objects, objectNumber)
    const cmapObjectNumber = fontObject
      ? /\/ToUnicode\s+(\d+)\s+0\s+R/u.exec(fontObject)?.[1]
      : undefined
    if (cmapObjectNumber === undefined) continue
    const cmapObject = indirectObject(objects, cmapObjectNumber)
    if (cmapObject === undefined) {
      errors.push(`Missing ToUnicode object ${cmapObjectNumber}`)
      continue
    }
    maps.set(resourceName, parseToUnicode(cmapObject, errors))
  }
  return maps
}

function parseToUnicode(
  cmapObject: string,
  errors: string[]
): ReadonlyMap<number, string> {
  const mappings = new Map<number, string>()
  for (const match of cmapObject.matchAll(
    /<([0-9A-Fa-f]{4})>\s+<([0-9A-Fa-f]+)>/gu
  )) {
    const cidHex = match[1]
    const unicodeHex = match[2]
    if (cidHex === undefined || unicodeHex === undefined) continue
    if (unicodeHex.length === 0 || unicodeHex.length % 4 !== 0) {
      errors.push(
        `ToUnicode mapping for CID ${cidHex} has invalid UTF-16BE data`
      )
      continue
    }
    let unicode = ""
    for (let offset = 0; offset < unicodeHex.length; offset += 4) {
      unicode += String.fromCharCode(
        Number.parseInt(unicodeHex.slice(offset, offset + 4), 16)
      )
    }
    mappings.set(Number.parseInt(cidHex, 16), unicode)
  }
  return mappings
}

function indirectObject(
  objects: PdfObjectMap,
  objectNumber: string
): string | undefined {
  return objects.get(objectNumber)
}

function decodePdfLiteral(value: string): string {
  const bytes: number[] = []
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code !== 0x5c) {
      bytes.push(code & 0xff)
      continue
    }
    const next = value[index + 1]
    if (next === undefined) break
    if (next === "\n") {
      index += 1
      continue
    }
    if (next === "\r") {
      index += value[index + 2] === "\n" ? 2 : 1
      continue
    }
    const escapes: Readonly<Record<string, number>> = {
      n: 0x0a,
      r: 0x0d,
      t: 0x09,
      b: 0x08,
      f: 0x0c,
      "(": 0x28,
      ")": 0x29,
      "\\": 0x5c,
    }
    if (escapes[next] !== undefined) {
      bytes.push(escapes[next])
      index += 1
      continue
    }
    const octal = /^[0-7]{1,3}/u.exec(value.slice(index + 1))?.[0]
    if (octal !== undefined) {
      bytes.push(Number.parseInt(octal, 8) & 0xff)
      index += octal.length
      continue
    }
    bytes.push(next.charCodeAt(0) & 0xff)
    index += 1
  }
  return decodeWinAnsi(Uint8Array.from(bytes))
}

function stripCommentsAndLiteralStrings(value: string): string {
  return value
    .replace(/%[^\r\n]*/gu, " ")
    .replace(/\((?:\\[\s\S]|[^\\)])*\)/gu, " ")
}

function decodeWinAnsi(bytes: Uint8Array): string {
  return new TextDecoder("windows-1252").decode(bytes)
}

function latin1(bytes: Uint8Array): string {
  let result = ""
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    result += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return result
}
