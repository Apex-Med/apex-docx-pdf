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
  const header = /^%PDF-(\d+\.\d+)/u.exec(source)
  if (!header?.[1]) errors.push("Missing PDF header")
  if (!/%%EOF\s*$/u.test(source)) errors.push("Missing terminal PDF EOF marker")

  const syntax = stripCommentsAndLiteralStrings(source)
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

  const pages = Array.from(
    source.matchAll(/\/Type \/Page\b[\s\S]*?\/Contents (\d+) 0 R/gu)
  )
  const pageTexts = pages.map((page) => {
    const objectNumber = page[1]
    if (objectNumber === undefined) return ""
    const object = indirectObject(source, objectNumber)
    if (object === undefined) {
      errors.push(`Missing content object ${objectNumber}`)
      return ""
    }
    return extractPageText(source, page[0], object, errors)
  })
  const declaredCount = /\/Type \/Pages \/Count (\d+)/u.exec(source)?.[1]
  if (declaredCount !== undefined && Number(declaredCount) !== pages.length) {
    errors.push(
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

function extractPageText(
  source: string,
  pageObject: string,
  contentObject: string,
  errors: string[]
): string {
  const unicodeByResource = pageFontUnicodeMaps(source, pageObject, errors)
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
  source: string,
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
    const fontObject = indirectObject(source, objectNumber)
    const cmapObjectNumber = fontObject
      ? /\/ToUnicode\s+(\d+)\s+0\s+R/u.exec(fontObject)?.[1]
      : undefined
    if (cmapObjectNumber === undefined) continue
    const cmapObject = indirectObject(source, cmapObjectNumber)
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
  source: string,
  objectNumber: string
): string | undefined {
  return new RegExp(
    `(?:^|\\n)${escapeRegExp(objectNumber)} 0 obj\\n([\\s\\S]*?)\\nendobj`,
    "u"
  ).exec(source)?.[1]
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")
}
