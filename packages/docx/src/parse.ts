import { DEFAULT_RESOURCE_LIMITS, throwIfAborted } from "@apexmed/core"
import { XMLParser, XMLValidator } from "fast-xml-parser"
import { unzlibSync } from "fflate"

import { diagnostic, source } from "./diagnostics"
import type {
  DocxParseOptions,
  ParsedDocxDocument,
  ParsedDocxHeaderFooter,
  ParsedDocxImageAsset,
  ParsedDocxHorizontalRule,
  ParsedDocxInline,
  ParsedDocxNumberingDefinition,
  ParsedDocxNumberingLevelDefinition,
  ParsedDocxParagraph,
  ParsedDocxParagraphProperties,
  ParsedDocxRun,
  ParsedDocxRunProperties,
  ParsedDocxSectionProperties,
  ParsedDocxTable,
  ParsedDocxTableBorder,
  ParsedDocxTableBorders,
  ParsedDocxTableCell,
  ParsedDocxTableCellBorders,
  ParsedDocxText,
} from "./types"
import type { ValidatedDocxPackage } from "./zip"

type OrderedElement = Readonly<{
  name: string
  children: readonly unknown[]
  attributes: Readonly<Record<string, string>>
}>
type ParseFailure = Readonly<{
  ok: false
  diagnostics: readonly ReturnType<typeof diagnostic>[]
}>
type ParseSuccess = Readonly<{
  ok: true
  value: ParsedDocxDocument
  diagnostics: readonly ReturnType<typeof diagnostic>[]
}>

const XML_ATTRIBUTES = ":@"
const XML_TEXT = "#text"
const DEFAULT_SECTION: ParsedDocxSectionProperties = Object.freeze({
  pageWidth: 11_907,
  pageHeight: 16_839,
  marginTop: 1_440,
  marginRight: 1_440,
  marginBottom: 1_440,
  marginLeft: 1_440,
  orientation: "portrait",
  headerDistance: 720,
  footerDistance: 720,
})

type OwnerRelationship = Readonly<{
  id: string
  type: string
  target: string
  external: boolean
  index: number
}>

type MediaContext = {
  pkg: ValidatedDocxPackage
  relationships: Map<string, ReadonlyMap<string, OwnerRelationship>>
  contentTypes: ReadonlyMap<string, string>
  assets: Map<string, ParsedDocxImageAsset>
  imageBytes: number
}

type ComplexFieldState = {
  instruction: string
  phase: "instruction" | "result"
  separatorSeen: boolean
  field?: {
    type: "docx-page-field"
    source: ReturnType<typeof source>
    field: "PAGE" | "NUMPAGES"
    displayText: string
  }
}
const DEFAULT_PARAGRAPH: ParsedDocxParagraphProperties = Object.freeze({
  alignment: "left",
  spacingBefore: 0,
  spacingAfter: 0,
  lineSpacing: null,
  indentStart: 0,
  indentEnd: 0,
  firstLineIndent: 0,
  keepWithNext: false,
  keepLinesTogether: false,
  widowControl: true,
  pageBreakBefore: false,
  numbering: null,
  tabStops: Object.freeze([]),
})
const DEFAULT_RUN: ParsedDocxRunProperties = Object.freeze({
  fontFamily: "Calibri",
  fontSizeHalfPoints: 22,
  fontWeight: 400,
  fontStyle: "normal",
  underline: false,
  color: "000000",
  highlightColor: null,
  verticalAlignment: "baseline",
})

function localName(name: string): string {
  const separator = name.indexOf(":")
  return separator < 0 ? name : name.slice(separator + 1)
}

function decodeXmlReferences(value: string): string {
  const predefined: Readonly<Record<string, string>> = {
    "&amp;": "&",
    "&apos;": "'",
    "&gt;": ">",
    "&lt;": "<",
    "&quot;": '"',
  }
  return value
    .replace(
      /&(amp|apos|gt|lt|quot);/gu,
      (reference) => predefined[reference] ?? reference
    )
    .replace(/&#(x[\da-f]+|\d+);/giu, (reference, encoded: string) => {
      const radix = encoded[0]?.toLowerCase() === "x" ? 16 : 10
      const digits = radix === 16 ? encoded.slice(1) : encoded
      const codePoint = Number.parseInt(digits, radix)
      try {
        return String.fromCodePoint(codePoint)
      } catch {
        return reference
      }
    })
}

function parseElementNodes(nodes: readonly unknown[]): OrderedElement[] {
  const elements: OrderedElement[] = []
  for (const node of nodes) {
    if (node === null || typeof node !== "object" || Array.isArray(node))
      continue
    const record = node as Record<string, unknown>
    const rawAttributes = record[XML_ATTRIBUTES]
    const nodeAttributes =
      rawAttributes !== null &&
      typeof rawAttributes === "object" &&
      !Array.isArray(rawAttributes)
        ? Object.fromEntries(
            Object.entries(rawAttributes).filter(
              (entry): entry is [string, string] => typeof entry[1] === "string"
            )
          )
        : {}
    for (const [name, value] of Object.entries(record)) {
      if (
        name !== XML_ATTRIBUTES &&
        name !== XML_TEXT &&
        Array.isArray(value)
      ) {
        elements.push({ name, children: value, attributes: nodeAttributes })
      }
    }
  }
  return elements
}

function childElements(
  element: OrderedElement
): readonly Readonly<{ name: string; element: OrderedElement }>[] {
  return parseElementNodes(element.children).map((childElement) => ({
    name: childElement.name,
    element: childElement,
  }))
}

function child(
  element: OrderedElement,
  expectedLocalName: string
): Readonly<{ name: string; element: OrderedElement }> | undefined {
  return childElements(element).find(
    ({ name }) => localName(name) === expectedLocalName
  )
}

function children(
  element: OrderedElement,
  expectedLocalName: string
): readonly Readonly<{ name: string; element: OrderedElement }>[] {
  return childElements(element).filter(
    ({ name }) => localName(name) === expectedLocalName
  )
}

function attributes(element: OrderedElement): Readonly<Record<string, string>> {
  return element.attributes
}

function attr(
  element: OrderedElement | undefined,
  expectedLocalName: string
): string | undefined {
  if (element === undefined) return undefined
  const value = Object.entries(attributes(element)).find(
    ([name]) => localName(name) === expectedLocalName
  )?.[1]
  return value === undefined ? undefined : decodeXmlReferences(value)
}

function textContent(element: OrderedElement): string {
  for (const node of element.children) {
    if (node !== null && typeof node === "object" && !Array.isArray(node)) {
      const value = (node as Record<string, unknown>)[XML_TEXT]
      if (typeof value === "string") return decodeXmlReferences(value)
    }
  }
  return ""
}

function descendantText(element: OrderedElement, expectedName: string): string {
  let value = ""
  const pending = [...childElements(element)]
  while (pending.length > 0) {
    const current = pending.shift()
    if (current === undefined) break
    if (localName(current.name) === expectedName)
      value += textContent(current.element)
    pending.unshift(...childElements(current.element))
  }
  return value
}

function parseXml(
  xml: string,
  maxXmlDepth: number
): OrderedElement | undefined {
  try {
    const parsed = new XMLParser({
      preserveOrder: true,
      ignoreAttributes: false,
      attributesGroupName: XML_ATTRIBUTES,
      attributeNamePrefix: "",
      trimValues: false,
      processEntities: false,
      maxNestedTags: maxXmlDepth,
    }).parse(xml)
    return Array.isArray(parsed)
      ? parseElementNodes(parsed).find(
          (element) => !element.name.startsWith("?")
        )
      : undefined
  } catch {
    return undefined
  }
}

function decodeXml(bytes: Uint8Array): string | undefined {
  try {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
      return new TextDecoder("utf-16le", { fatal: true }).decode(bytes)
    }
    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      return new TextDecoder("utf-16be", { fatal: true }).decode(bytes)
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return undefined
  }
}

function validateXmlParts(
  pkg: ValidatedDocxPackage,
  options: DocxParseOptions
): readonly ReturnType<typeof diagnostic>[] {
  const diagnostics: ReturnType<typeof diagnostic>[] = []
  const maxXmlDepth =
    options.limits?.maxXmlDepth ?? DEFAULT_RESOURCE_LIMITS.maxXmlDepth
  const maxXmlTextBytes =
    options.limits?.maxXmlTextBytes ?? DEFAULT_RESOURCE_LIMITS.maxXmlTextBytes
  const maxXmlNodes =
    options.limits?.maxXmlNodes ?? DEFAULT_RESOURCE_LIMITS.maxXmlNodes
  for (const [part, bytes] of pkg.parts) {
    throwIfAborted(options.signal)
    if (!part.endsWith(".xml") && !part.endsWith(".rels")) {
      continue
    }
    if (bytes.byteLength > maxXmlTextBytes) {
      diagnostics.push(
        diagnostic(
          "DOCX_XML_TEXT_SIZE_LIMIT",
          `Part '${part}' has ${bytes.byteLength} encoded bytes, exceeding the XML text limit of ${maxXmlTextBytes}.`,
          "error",
          source(part, "/")
        )
      )
      continue
    }
    const xml = decodeXml(bytes)
    if (xml === undefined) {
      diagnostics.push(
        diagnostic(
          "DOCX_INVALID_XML_ENCODING",
          `Part '${part}' is not valid UTF-8 or UTF-16 XML.`,
          "error",
          source(part, "/")
        )
      )
      continue
    }
    const decodedTextBytes = new TextEncoder().encode(xml).byteLength
    if (decodedTextBytes > maxXmlTextBytes) {
      diagnostics.push(
        diagnostic(
          "DOCX_XML_TEXT_SIZE_LIMIT",
          `Part '${part}' has ${decodedTextBytes} decoded UTF-8 bytes, exceeding the XML text limit of ${maxXmlTextBytes}.`,
          "error",
          source(part, "/")
        )
      )
      continue
    }
    if (/<!\s*(?:DOCTYPE|ENTITY)\b/iu.test(xml)) {
      diagnostics.push(
        diagnostic(
          "DOCX_FORBIDDEN_XML_DECLARATION",
          `Part '${part}' contains a forbidden DOCTYPE or entity declaration.`,
          "error",
          source(part, "/")
        )
      )
      continue
    }
    const preflight = preflightXml(xml, maxXmlDepth, maxXmlNodes)
    if (preflight === "depth") {
      diagnostics.push(
        diagnostic(
          "DOCX_XML_DEPTH_LIMIT",
          `Part '${part}' exceeds the XML nesting limit of ${maxXmlDepth}.`,
          "error",
          source(part, "/")
        )
      )
      continue
    }
    if (preflight === "nodes") {
      diagnostics.push(
        diagnostic(
          "DOCX_XML_NODE_LIMIT",
          `Part '${part}' exceeds the XML element limit of ${maxXmlNodes}.`,
          "error",
          source(part, "/")
        )
      )
      continue
    }
    const validation = XMLValidator.validate(xml)
    if (validation !== true) {
      diagnostics.push(
        diagnostic(
          "DOCX_INVALID_XML",
          `Part '${part}' is not well-formed XML.`,
          "error",
          source(part, "/")
        )
      )
      continue
    }
    const tree = parseXml(xml, maxXmlDepth)
    if (tree === undefined) {
      diagnostics.push(
        diagnostic(
          "DOCX_XML_PARSER_ERROR",
          `Part '${part}' could not be parsed within the configured XML limits.`,
          "error",
          source(part, "/")
        )
      )
      continue
    }
    const parsedLimit = parsedTreeLimit(tree, maxXmlDepth, maxXmlNodes)
    if (parsedLimit !== undefined) {
      diagnostics.push(
        diagnostic(
          parsedLimit === "depth"
            ? "DOCX_XML_DEPTH_LIMIT"
            : "DOCX_XML_NODE_LIMIT",
          parsedLimit === "depth"
            ? `Part '${part}' exceeds the XML nesting limit of ${maxXmlDepth}.`
            : `Part '${part}' exceeds the XML element limit of ${maxXmlNodes}.`,
          "error",
          source(part, "/")
        )
      )
    }
  }
  return diagnostics
}

function preflightXml(
  xml: string,
  maxDepth: number,
  maxNodes: number
): "depth" | "nodes" | undefined {
  let cursor = 0
  let depth = 0
  let nodes = 0
  while (cursor < xml.length) {
    const start = xml.indexOf("<", cursor)
    if (start < 0) return undefined
    if (xml.startsWith("<!--", start)) {
      const end = xml.indexOf("-->", start + 4)
      if (end < 0) return undefined
      cursor = end + 3
      continue
    }
    if (xml.startsWith("<![CDATA[", start)) {
      const end = xml.indexOf("]]>", start + 9)
      if (end < 0) return undefined
      cursor = end + 3
      continue
    }
    if (xml.startsWith("<?", start)) {
      const end = xml.indexOf("?>", start + 2)
      if (end < 0) return undefined
      cursor = end + 2
      continue
    }

    let quote: string | undefined
    let end = start + 1
    for (; end < xml.length; end += 1) {
      const character = xml[end]
      if (character === undefined) return undefined
      if (quote !== undefined) {
        if (character === quote) quote = undefined
      } else if (character === '"' || character === "'") {
        quote = character
      } else if (character === ">") {
        break
      }
    }
    if (end >= xml.length) return undefined
    const token = xml.slice(start + 1, end).trim()
    if (token.startsWith("/")) {
      depth = Math.max(0, depth - 1)
    } else if (!token.startsWith("!")) {
      nodes += 1
      if (nodes > maxNodes) return "nodes"
      if (!token.endsWith("/")) {
        depth += 1
        if (depth > maxDepth) return "depth"
      }
    }
    cursor = end + 1
  }
  return undefined
}

function parsedTreeLimit(
  root: OrderedElement,
  maxDepth: number,
  maxNodes: number
): "depth" | "nodes" | undefined {
  const pending: { element: OrderedElement; depth: number }[] = [
    { element: root, depth: 1 },
  ]
  let nodes = 0
  while (pending.length > 0) {
    const current = pending.pop()
    if (current === undefined) return undefined
    nodes += 1
    if (nodes > maxNodes) return "nodes"
    if (current.depth > maxDepth) return "depth"
    for (const { element } of childElements(current.element)) {
      pending.push({ element, depth: current.depth + 1 })
    }
  }
  return undefined
}

function relationshipPartTargets(
  xml: string,
  maxXmlDepth: number
):
  | readonly Readonly<{
      target: string
      external: boolean
      type: string
      id: string
      index: number
    }>[]
  | undefined {
  const tree = parseXml(xml, maxXmlDepth)
  if (tree === undefined) {
    return undefined
  }
  if (localName(tree.name) !== "Relationships") {
    return undefined
  }
  return children(tree, "Relationship").map(({ element }, index) => ({
    target: attr(element, "Target") ?? "",
    external: (attr(element, "TargetMode") ?? "").toLowerCase() === "external",
    type: attr(element, "Type") ?? "",
    id: attr(element, "Id") ?? "",
    index: index + 1,
  }))
}

function relationshipOwnerPart(sourcePart: string): string | undefined {
  if (sourcePart === "_rels/.rels") return ""
  const match = /^(.*\/)?_rels\/([^/]+)\.rels$/u.exec(sourcePart)
  if (match === null) return undefined
  return `${match[1] ?? ""}${match[2]}`
}

function resolveTarget(ownerPart: string, target: string): string | undefined {
  if (
    target.length === 0 ||
    target.startsWith("/") ||
    /^[a-z][a-z\d+.-]*:/iu.test(target) ||
    target.includes("\\") ||
    target.includes("\0") ||
    target.includes("?") ||
    target.includes("#")
  ) {
    return undefined
  }
  const base = ownerPart === "" ? [] : ownerPart.split("/").slice(0, -1)
  for (const encodedSegment of target.split("/")) {
    let decodedSegment: string
    try {
      decodedSegment = decodeURIComponent(encodedSegment)
    } catch {
      return undefined
    }
    if (
      decodedSegment.includes("/") ||
      decodedSegment.includes("\\") ||
      decodedSegment.includes("\0") ||
      (decodedSegment === "." && encodedSegment !== ".") ||
      (decodedSegment === ".." && encodedSegment !== "..")
    ) {
      return undefined
    }
    const segment = decodedSegment
    if (segment === "" || segment === ".") {
      continue
    }
    if (segment === "..") {
      if (base.length === 0) {
        return undefined
      }
      base.pop()
      continue
    }
    base.push(segment)
  }
  const resolved = base.join("/")
  return resolved.length > 0 ? resolved : undefined
}

function parseContentTypeMap(
  root: OrderedElement
): ReadonlyMap<string, string> {
  const defaults = new Map<string, string>()
  const overrides = new Map<string, string>()
  for (const current of childElements(root)) {
    if (localName(current.name) === "Default") {
      const extension = attr(current.element, "Extension")?.toLowerCase()
      const mimeType = attr(current.element, "ContentType")
      if (extension !== undefined && mimeType !== undefined)
        defaults.set(extension, mimeType)
    } else if (localName(current.name) === "Override") {
      const partName = attr(current.element, "PartName")
      const mimeType = attr(current.element, "ContentType")
      if (partName !== undefined && mimeType !== undefined)
        overrides.set(partName.replace(/^\//u, ""), mimeType)
    }
  }
  const result = new Map(overrides)
  result.set("*defaults*", JSON.stringify(Object.fromEntries(defaults)))
  return result
}

function contentTypeFor(
  contentTypes: ReadonlyMap<string, string>,
  part: string
): string | undefined {
  const exact = contentTypes.get(part)
  if (exact !== undefined) return exact
  const encodedDefaults = contentTypes.get("*defaults*")
  const extension = part.split(".").pop()?.toLowerCase()
  if (encodedDefaults === undefined || extension === undefined) return undefined
  const defaults = JSON.parse(encodedDefaults) as Record<string, string>
  return defaults[extension]
}

function buildOwnerRelationships(
  pkg: ValidatedDocxPackage,
  options: DocxParseOptions,
  diagnostics: ReturnType<typeof diagnostic>[]
): Map<string, ReadonlyMap<string, OwnerRelationship>> {
  const result = new Map<string, ReadonlyMap<string, OwnerRelationship>>()
  const maxDepth =
    options.limits?.maxXmlDepth ?? DEFAULT_RESOURCE_LIMITS.maxXmlDepth
  for (const [relationshipPart, bytes] of pkg.parts) {
    if (!relationshipPart.endsWith(".rels")) continue
    const owner = relationshipOwnerPart(relationshipPart)
    const xml = decodeXml(bytes)
    const relationships =
      xml === undefined ? undefined : relationshipPartTargets(xml, maxDepth)
    if (owner === undefined || relationships === undefined) continue
    const byId = new Map<string, OwnerRelationship>()
    for (const relationship of relationships) {
      if (relationship.id.length === 0 || byId.has(relationship.id)) {
        diagnostics.push(
          diagnostic(
            "DOCX_DUPLICATE_RELATIONSHIP_ID",
            `Relationship owner '${owner || "/"}' has a missing or duplicate Id '${relationship.id}'.`,
            "error",
            source(
              relationshipPart,
              `/Relationships/Relationship[${relationship.index}]`
            )
          )
        )
        continue
      }
      byId.set(relationship.id, relationship)
    }
    result.set(owner, byId)
  }
  return result
}

function imageDimensions(
  bytes: Uint8Array,
  mimeType: "image/png" | "image/jpeg",
  signal?: AbortSignal
): Readonly<{ width: number; height: number }> | undefined {
  throwIfAborted(signal)
  if (mimeType === "image/png") {
    if (
      bytes.length < 24 ||
      bytes[0] !== 0x89 ||
      bytes[1] !== 0x50 ||
      bytes[2] !== 0x4e ||
      bytes[3] !== 0x47 ||
      bytes[4] !== 0x0d ||
      bytes[5] !== 0x0a ||
      bytes[6] !== 0x1a ||
      bytes[7] !== 0x0a ||
      String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR"
    )
      return undefined
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return { width: view.getUint32(16), height: view.getUint32(20) }
  }
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8)
    return undefined
  let offset = 2
  while (offset + 9 < bytes.length) {
    throwIfAborted(signal)
    if (bytes[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = bytes[offset + 1]
    if (marker === undefined) return undefined
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2
      continue
    }
    const length = ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0)
    if (length < 2 || offset + 2 + length > bytes.length) return undefined
    if (
      [
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
        0xcf,
      ].includes(marker)
    ) {
      return {
        height: ((bytes[offset + 5] ?? 0) << 8) | (bytes[offset + 6] ?? 0),
        width: ((bytes[offset + 7] ?? 0) << 8) | (bytes[offset + 8] ?? 0),
      }
    }
    offset += 2 + length
  }
  return undefined
}

const PNG_CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value
  for (let bit = 0; bit < 8; bit += 1)
    crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
  return crc >>> 0
})

function pngCrc32(
  type: Uint8Array,
  data: Uint8Array,
  signal?: AbortSignal
): number {
  let crc = 0xffffffff
  let scanned = 0
  for (const bytes of [type, data]) {
    for (const byte of bytes) {
      if ((scanned++ & 0xffff) === 0) throwIfAborted(signal)
      crc = (PNG_CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function readImageU16(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0)
}

function readImageU32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) * 0x1000000 +
      ((bytes[offset + 1] ?? 0) << 16) +
      ((bytes[offset + 2] ?? 0) << 8) +
      (bytes[offset + 3] ?? 0)) >>>
    0
  )
}

function imageProfileError(
  mimeType: "image/png" | "image/jpeg",
  bytes: Uint8Array,
  dimensions: Readonly<{ width: number; height: number }>,
  maxBytes: number,
  signal?: AbortSignal
): string | undefined {
  if (mimeType === "image/png") {
    if (bytes.length < 33)
      return "PNG is shorter than the supported image profile"
    let offset = 8
    let chunks = 0
    let sawHeader = false
    let sawData = false
    let sawEnd = false
    const compressed: Uint8Array[] = []
    let rowBytes = 0
    while (offset < bytes.length) {
      throwIfAborted(signal)
      if (++chunks > 10_000)
        return "PNG chunk count exceeds the image preparation profile"
      if (offset + 12 > bytes.length) return "PNG contains a truncated chunk"
      const length = readImageU32(bytes, offset)
      if (length > maxBytes || offset + 12 + length > bytes.length)
        return "PNG contains an invalid chunk length"
      const typeBytes = bytes.subarray(offset + 4, offset + 8)
      const type = String.fromCharCode(...typeBytes)
      if (!/^[A-Za-z]{4}$/u.test(type))
        return "PNG contains an invalid chunk type"
      const data = bytes.subarray(offset + 8, offset + 8 + length)
      if (
        pngCrc32(typeBytes, data, signal) !==
        readImageU32(bytes, offset + 8 + length)
      )
        return `PNG ${type} chunk has an invalid CRC`
      if (!sawHeader && type !== "IHDR")
        return "PNG IHDR is not the first chunk"
      if (type === "IHDR") {
        if (sawHeader || length !== 13) return "PNG has an invalid IHDR chunk"
        sawHeader = true
        const depth = data[8] ?? -1
        const color = data[9] ?? -1
        const channels =
          color === 0
            ? 1
            : color === 2
              ? 3
              : color === 3
                ? 1
                : color === 4
                  ? 2
                  : color === 6
                    ? 4
                    : 0
        const legal =
          (color === 0 && [1, 2, 4, 8, 16].includes(depth)) ||
          (color === 2 && [8, 16].includes(depth)) ||
          (color === 3 && [1, 2, 4, 8].includes(depth)) ||
          (color === 4 && [8, 16].includes(depth)) ||
          (color === 6 && [8, 16].includes(depth))
        if (!legal || data[10] !== 0 || data[11] !== 0 || data[12] !== 0)
          return "PNG IHDR uses an unsupported profile"
        if (
          readImageU32(data, 0) !== dimensions.width ||
          readImageU32(data, 4) !== dimensions.height
        )
          return "PNG IHDR dimensions disagree with the image asset"
        rowBytes = Math.ceil((dimensions.width * channels * depth) / 8)
      } else if (["acTL", "fcTL", "fdAT"].includes(type)) {
        return "Animated PNG is unsupported"
      } else if (["iCCP", "zTXt", "iTXt"].includes(type)) {
        return "Compressed PNG metadata is unsupported"
      } else if (type === "IDAT") {
        sawData = true
        compressed.push(data)
      } else if (type === "IEND") {
        if (length !== 0 || !sawData)
          return "PNG has an invalid IEND or no IDAT"
        sawEnd = true
        offset += 12
        break
      } else if (
        (typeBytes[0] ?? 0) >= 65 &&
        (typeBytes[0] ?? 0) <= 90 &&
        type !== "PLTE"
      ) {
        return `PNG contains unsupported critical chunk ${type}`
      }
      offset += 12 + length
    }
    if (!sawEnd || offset !== bytes.length)
      return "PNG must end exactly at IEND"
    let compressedBytes = 0
    for (const chunk of compressed) compressedBytes += chunk.length
    const joined = new Uint8Array(compressedBytes)
    let cursor = 0
    for (const chunk of compressed) {
      throwIfAborted(signal)
      joined.set(chunk, cursor)
      cursor += chunk.length
    }
    const expectedDecodedBytes = (rowBytes + 1) * dimensions.height
    if (
      !Number.isSafeInteger(expectedDecodedBytes) ||
      expectedDecodedBytes > 400_000_000
    ) {
      return "PNG decoded scanlines exceed the image preparation byte limit"
    }
    try {
      const decoded = unzlibSync(joined)
      if (decoded.length !== expectedDecodedBytes)
        return "PNG scanline byte count does not match its dimensions"
      for (let row = 0; row < dimensions.height; row += 1) {
        if ((row & 0x3ff) === 0) throwIfAborted(signal)
        if ((decoded[row * (rowBytes + 1)] ?? 5) > 4)
          return "PNG uses an invalid row filter"
      }
    } catch {
      return "PNG IDAT data cannot be decoded"
    }
    return undefined
  }

  let offset = 2
  let width = 0
  let height = 0
  let components = 0
  let sawFrame = false
  let sawScan = false
  let jfif = false
  let adobeTransform: number | undefined
  let markers = 0
  while (offset < bytes.length) {
    throwIfAborted(signal)
    if (++markers > 10_000)
      return "JPEG marker count exceeds the image preparation profile"
    if (bytes[offset] !== 0xff) return "JPEG marker is malformed"
    while (bytes[offset] === 0xff) offset += 1
    const marker = bytes[offset++]
    if (marker === undefined) return "JPEG marker is truncated"
    if (marker === 0xd9) {
      if (!sawScan || offset !== bytes.length) return "JPEG EOI is invalid"
      break
    }
    if (marker === 0xda) {
      if (offset + 2 > bytes.length) return "JPEG SOS is truncated"
      const length = readImageU16(bytes, offset)
      if (length < 2 || offset + length > bytes.length)
        return "JPEG SOS length is invalid"
      sawScan = true
      offset += length
      while (offset + 1 < bytes.length) {
        if ((offset & 0xffff) === 0) throwIfAborted(signal)
        if (bytes[offset] !== 0xff) {
          offset += 1
          continue
        }
        const next = bytes[offset + 1]
        if (
          next === 0 ||
          (next !== undefined && next >= 0xd0 && next <= 0xd7)
        ) {
          offset += 2
          continue
        }
        break
      }
      continue
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue
    if (offset + 2 > bytes.length) return "JPEG segment is truncated"
    const length = readImageU16(bytes, offset)
    if (length < 2 || length > maxBytes || offset + length > bytes.length)
      return "JPEG segment length is invalid"
    const data = bytes.subarray(offset + 2, offset + length)
    const starts = (prefix: readonly number[]) =>
      prefix.every((value, index) => data[index] === value)
    if (marker === 0xe0 && starts([0x4a, 0x46, 0x49, 0x46, 0])) jfif = true
    if (marker === 0xe1 && starts([0x45, 0x78, 0x69, 0x66, 0, 0])) {
      const exifError = jpegExifProfileError(data.subarray(6))
      if (exifError !== undefined) return exifError
    }
    if (
      marker === 0xe2 &&
      starts([
        0x49, 0x43, 0x43, 0x5f, 0x50, 0x52, 0x4f, 0x46, 0x49, 0x4c, 0x45, 0,
      ])
    )
      return "JPEG ICC profiles are unsupported"
    if (marker === 0xee && starts([0x41, 0x64, 0x6f, 0x62, 0x65]))
      adobeTransform = data[11]
    if (marker === 0xc0 || marker === 0xc2) {
      if (sawFrame || data.length < 6)
        return "JPEG frame is invalid or duplicated"
      sawFrame = true
      if (data[0] !== 8) return "Only 8-bit JPEG is supported"
      height = readImageU16(data, 1)
      width = readImageU16(data, 3)
      components = data[5] ?? 0
      if (data.length !== 6 + components * 3)
        return "JPEG component table is invalid"
    } else if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker)
    ) {
      return "JPEG frame type is unsupported"
    }
    offset += length
  }
  if (
    !sawFrame ||
    !sawScan ||
    bytes[bytes.length - 2] !== 0xff ||
    bytes[bytes.length - 1] !== 0xd9
  )
    return "JPEG is missing a supported frame, scan, or EOI"
  if (width !== dimensions.width || height !== dimensions.height)
    return "JPEG frame dimensions disagree with the image asset"
  if (components !== 1 && components !== 3)
    return "JPEG must be grayscale or three-component"
  if (components === 3 && !jfif && adobeTransform === undefined)
    return "JPEG color transform is ambiguous"
  if (components === 3 && jfif && adobeTransform === 0)
    return "JPEG color transforms conflict"
  if (
    adobeTransform !== undefined &&
    adobeTransform !== 0 &&
    adobeTransform !== 1
  )
    return "JPEG Adobe transform is unsupported"
  return undefined
}

function jpegExifProfileError(bytes: Uint8Array): string | undefined {
  if (bytes.length < 8) return "JPEG EXIF metadata is truncated"
  const little =
    bytes[0] === 0x49 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x2a &&
    bytes[3] === 0
  const big =
    bytes[0] === 0x4d &&
    bytes[1] === 0x4d &&
    bytes[2] === 0 &&
    bytes[3] === 0x2a
  if (!little && !big) return "JPEG EXIF byte order is invalid"
  const u16 = (at: number) =>
    little
      ? (bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8)
      : ((bytes[at] ?? 0) << 8) | (bytes[at + 1] ?? 0)
  const u32 = (at: number) =>
    little
      ? ((bytes[at] ?? 0) |
          ((bytes[at + 1] ?? 0) << 8) |
          ((bytes[at + 2] ?? 0) << 16) |
          ((bytes[at + 3] ?? 0) << 24)) >>>
        0
      : (((bytes[at] ?? 0) << 24) |
          ((bytes[at + 1] ?? 0) << 16) |
          ((bytes[at + 2] ?? 0) << 8) |
          (bytes[at + 3] ?? 0)) >>>
        0
  const ifd = u32(4)
  if (ifd + 2 > bytes.length) return "JPEG EXIF IFD offset is invalid"
  const count = u16(ifd)
  if (ifd + 2 + count * 12 > bytes.length) return "JPEG EXIF IFD is truncated"
  for (let index = 0; index < count; index += 1) {
    const entry = ifd + 2 + index * 12
    if (u16(entry) !== 0x0112) continue
    if (u16(entry + 2) !== 3 || u32(entry + 4) !== 1)
      return "JPEG EXIF orientation is invalid"
    const orientation = u16(entry + 8)
    if (orientation !== 1)
      return `JPEG EXIF orientation ${orientation} is unsupported`
  }
  return undefined
}

function frozenImageBytes(
  bytes: Uint8Array,
  signal?: AbortSignal
): readonly number[] {
  const copy = new Array<number>(bytes.length)
  for (let index = 0; index < bytes.length; index += 1) {
    if ((index & 0xffff) === 0) throwIfAborted(signal)
    copy[index] = bytes[index] ?? 0
  }
  return Object.freeze(copy)
}

function mediaProblem(
  diagnostics: ReturnType<typeof diagnostic>[],
  code: string,
  message: string,
  location: ReturnType<typeof source>
): void {
  diagnostics.push(diagnostic(code, message, "error", location))
  diagnostics.push(
    diagnostic(
      "DOCX_CONTENT_LOSS",
      "Rendering cannot continue because image content would be omitted or ambiguous.",
      "error",
      location
    )
  )
}

function parseDrawing(
  element: OrderedElement,
  part: string,
  xmlPath: string,
  context: MediaContext,
  options: DocxParseOptions,
  diagnostics: ReturnType<typeof diagnostic>[]
): ParsedDocxInline | undefined {
  const inlineElements = children(element, "inline")
  if (children(element, "anchor").length > 0) {
    mediaProblem(
      diagnostics,
      "DOCX_UNSUPPORTED_FLOATING_IMAGE",
      "Floating or anchored DrawingML images are not supported.",
      source(part, xmlPath)
    )
    return undefined
  }
  if (inlineElements.length !== 1) {
    mediaProblem(
      diagnostics,
      "DOCX_MALFORMED_DRAWING",
      "DrawingML must contain exactly one inline drawing.",
      source(part, xmlPath)
    )
    return undefined
  }
  const inline = inlineElements[0]?.element
  if (inline === undefined) return undefined
  const extent = child(inline, "extent")?.element
  const cx = integer(attr(extent, "cx"))
  const cy = integer(attr(extent, "cy"))
  const graphic = child(inline, "graphic")?.element
  const graphicData =
    graphic === undefined ? undefined : child(graphic, "graphicData")?.element
  const picture =
    graphicData === undefined ? undefined : child(graphicData, "pic")?.element
  const blipFill =
    picture === undefined ? undefined : child(picture, "blipFill")?.element
  const blip =
    blipFill === undefined ? undefined : child(blipFill, "blip")?.element
  const relationshipId = attr(blip, "embed")
  if (
    cx === undefined ||
    cy === undefined ||
    cx <= 0 ||
    cy <= 0 ||
    relationshipId === undefined
  ) {
    mediaProblem(
      diagnostics,
      "DOCX_MALFORMED_DRAWING",
      "Inline DrawingML requires a relationship embed and explicit positive EMU extent.",
      source(part, xmlPath)
    )
    return undefined
  }
  const relationship = context.relationships.get(part)?.get(relationshipId)
  const imageTypes = new Set([
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
    "http://purl.oclc.org/ooxml/officeDocument/relationships/image",
  ])
  if (relationship === undefined || !imageTypes.has(relationship.type)) {
    mediaProblem(
      diagnostics,
      "DOCX_MISSING_IMAGE_RELATIONSHIP",
      `Image embed '${relationshipId}' is missing from the owning part's relationships.`,
      source(part, xmlPath)
    )
    return undefined
  }
  if (relationship.external) {
    mediaProblem(
      diagnostics,
      "DOCX_EXTERNAL_IMAGE_RELATIONSHIP",
      "External image relationships are forbidden.",
      source(part, xmlPath)
    )
    return undefined
  }
  const target = resolveTarget(part, relationship.target)
  const bytes = target === undefined ? undefined : context.pkg.parts.get(target)
  if (target === undefined || bytes === undefined) {
    mediaProblem(
      diagnostics,
      "DOCX_MISSING_IMAGE_PART",
      "The image relationship does not resolve to an internal package part.",
      source(part, xmlPath)
    )
    return undefined
  }
  const declaredMime = contentTypeFor(context.contentTypes, target)
  if (declaredMime !== "image/png" && declaredMime !== "image/jpeg") {
    mediaProblem(
      diagnostics,
      "DOCX_UNSUPPORTED_IMAGE_TYPE",
      `Image part '${target}' does not declare PNG or JPEG content.`,
      source(target, "/")
    )
    return undefined
  }
  const dimensions = imageDimensions(bytes, declaredMime, options.signal)
  if (
    dimensions === undefined ||
    dimensions.width <= 0 ||
    dimensions.height <= 0
  ) {
    mediaProblem(
      diagnostics,
      "DOCX_INVALID_IMAGE_SIGNATURE",
      `Image part '${target}' does not match its declared ${declaredMime} signature.`,
      source(target, "/")
    )
    return undefined
  }
  const maxCount =
    options.limits?.maxImageCount ?? DEFAULT_RESOURCE_LIMITS.maxImageCount
  const maxBytes =
    options.limits?.maxImageBytes ?? DEFAULT_RESOURCE_LIMITS.maxImageBytes
  const maxDimension =
    options.limits?.maxImageDimensionPixels ??
    DEFAULT_RESOURCE_LIMITS.maxImageDimensionPixels
  const maxPixels =
    options.limits?.maxImagePixels ?? DEFAULT_RESOURCE_LIMITS.maxImagePixels
  if (
    dimensions.width > maxDimension ||
    dimensions.height > maxDimension ||
    dimensions.width > Math.floor(maxPixels / dimensions.height)
  ) {
    mediaProblem(
      diagnostics,
      "DOCX_IMAGE_DIMENSION_LIMIT",
      `Image dimensions ${dimensions.width}x${dimensions.height} exceed the ${maxDimension}-pixel side or ${maxPixels}-pixel area limit.`,
      source(target, "/")
    )
    return undefined
  }
  const profileError = imageProfileError(
    declaredMime,
    bytes,
    dimensions,
    maxBytes,
    options.signal
  )
  if (profileError !== undefined) {
    mediaProblem(
      diagnostics,
      "DOCX_UNSUPPORTED_IMAGE_PROFILE",
      `Image part '${target}' is rejected by the bounded PDF image profile: ${profileError}.`,
      source(target, "/")
    )
    return undefined
  }
  let asset = context.assets.get(target)
  if (asset === undefined) {
    if (
      context.assets.size + 1 > maxCount ||
      context.imageBytes + bytes.byteLength > maxBytes
    ) {
      mediaProblem(
        diagnostics,
        "DOCX_IMAGE_RESOURCE_LIMIT",
        `Embedded images exceed the configured count (${maxCount}) or byte (${maxBytes}) limit.`,
        source(target, "/")
      )
      return undefined
    }
    context.imageBytes += bytes.byteLength
    asset = Object.freeze({
      type: "docx-image-asset" as const,
      id: `docx:asset:${target}`,
      source: source(target, "/"),
      packagePath: target,
      mimeType: declaredMime,
      bytes: frozenImageBytes(bytes, options.signal),
      pixelWidth: dimensions.width,
      pixelHeight: dimensions.height,
    })
    context.assets.set(target, asset)
  }
  const frameProperties = child(inline, "cNvGraphicFramePr")?.element
  const aspectLocks =
    frameProperties === undefined
      ? undefined
      : child(frameProperties, "graphicFrameLocks")?.element
  const rawPreserveAspect = attr(aspectLocks, "noChangeAspect")?.toLowerCase()
  const preserveAspect =
    rawPreserveAspect === "1" ||
    rawPreserveAspect === "true" ||
    rawPreserveAspect === "on"
  if (
    rawPreserveAspect !== undefined &&
    !["0", "1", "true", "false", "on", "off"].includes(rawPreserveAspect)
  ) {
    mediaProblem(
      diagnostics,
      "DOCX_MALFORMED_DRAWING",
      `DrawingML noChangeAspect value '${rawPreserveAspect}' is invalid.`,
      source(part, xmlPath)
    )
    return undefined
  }
  const intrinsicRatio = dimensions.width / dimensions.height
  const extentRatio = cx / cy
  // OOXML extents are exact EMUs; allow only a small rounding tolerance.
  const ratioTolerance = 0.001
  if (
    preserveAspect &&
    Math.abs(extentRatio - intrinsicRatio) / intrinsicRatio > ratioTolerance
  ) {
    mediaProblem(
      diagnostics,
      "DOCX_IMAGE_ASPECT_MISMATCH",
      "DrawingML locks image aspect ratio, but its extent conflicts with the intrinsic image ratio.",
      source(part, xmlPath)
    )
    return undefined
  }
  return {
    type: "docx-image",
    source: source(part, xmlPath),
    assetId: asset.id,
    widthTwips: Math.max(1, Math.round(cx / 635)),
    heightTwips: Math.max(1, Math.round(cy / 635)),
    pixelWidth: dimensions.width,
    pixelHeight: dimensions.height,
    intrinsicRatio,
    preserveAspect,
  }
}

function resolveOfficeDocumentPart(
  pkg: ValidatedDocxPackage,
  options: DocxParseOptions
): { ok: true; value: string } | ParseFailure {
  const diagnostics: ReturnType<typeof diagnostic>[] = []
  const maxXmlDepth =
    options.limits?.maxXmlDepth ?? DEFAULT_RESOURCE_LIMITS.maxXmlDepth
  const OFFICE_DOCUMENT_RELATIONSHIPS = new Set([
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument",
    "http://purl.oclc.org/ooxml/officeDocument/relationships/officeDocument",
  ])
  for (const [part, bytes] of pkg.parts) {
    if (!part.endsWith(".rels")) {
      continue
    }
    const xml = decodeXml(bytes)
    if (xml === undefined) {
      continue
    }
    const relationships = relationshipPartTargets(xml, maxXmlDepth)
    if (relationships === undefined) {
      diagnostics.push(
        diagnostic(
          "DOCX_INVALID_RELATIONSHIPS",
          `Relationship part '${part}' has no Relationships root element.`,
          "error",
          source(part, "/")
        )
      )
      continue
    }
    const ownerPart = relationshipOwnerPart(part)
    if (
      ownerPart === undefined ||
      (ownerPart !== "" && !pkg.parts.has(ownerPart))
    ) {
      diagnostics.push(
        diagnostic(
          "DOCX_INVALID_RELATIONSHIP_PART",
          `Relationship part '${part}' does not map to an existing owner part.`,
          "error",
          source(part, "/Relationships")
        )
      )
      continue
    }
    for (const relation of relationships) {
      if (relation.external) {
        diagnostics.push(
          diagnostic(
            "DOCX_EXTERNAL_RELATIONSHIP",
            `Relationship part '${part}' contains an external target.`,
            "error",
            source(part, `/Relationships/Relationship[${relation.index}]`)
          )
        )
        continue
      }
      const resolved = resolveTarget(ownerPart, relation.target)
      if (resolved === undefined) {
        diagnostics.push(
          diagnostic(
            "DOCX_UNSAFE_RELATIONSHIP_TARGET",
            `Relationship part '${part}' contains an unsafe internal target '${relation.target}'.`,
            "error",
            source(part, `/Relationships/Relationship[${relation.index}]`)
          )
        )
      } else if (!pkg.parts.has(resolved)) {
        diagnostics.push(
          diagnostic(
            "DOCX_MISSING_RELATIONSHIP_TARGET",
            `Relationship part '${part}' targets missing package part '${resolved}'.`,
            "error",
            source(part, `/Relationships/Relationship[${relation.index}]`)
          )
        )
        if (
          part === "_rels/.rels" &&
          OFFICE_DOCUMENT_RELATIONSHIPS.has(relation.type)
        ) {
          diagnostics.push(
            diagnostic(
              "DOCX_MISSING_REQUIRED_PART",
              "The officeDocument relationship does not resolve to a package part.",
              "error",
              source(part, `/Relationships/Relationship[${relation.index}]`)
            )
          )
        }
      }
    }
  }
  if (diagnostics.length > 0) {
    return { ok: false, diagnostics }
  }

  const rootRelationshipsPart = pkg.parts.get("_rels/.rels")
  if (rootRelationshipsPart === undefined) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          "DOCX_MISSING_REQUIRED_PART",
          "The DOCX package is missing required part '_rels/.rels'.",
          "error",
          source("_rels/.rels", "/")
        ),
      ],
    }
  }
  const rootXml = decodeXml(rootRelationshipsPart)
  if (rootXml === undefined) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          "DOCX_INVALID_RELATIONSHIPS",
          "The root relationship part cannot be decoded."
        ),
      ],
    }
  }
  const rootRelationships = relationshipPartTargets(rootXml, maxXmlDepth)
  if (rootRelationships === undefined) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          "DOCX_INVALID_RELATIONSHIPS",
          "The root relationship part has no Relationships root element."
        ),
      ],
    }
  }
  const officeDocumentRelationships = rootRelationships.filter((relationship) =>
    OFFICE_DOCUMENT_RELATIONSHIPS.has(relationship.type)
  )
  if (officeDocumentRelationships.length !== 1) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          "DOCX_MISSING_OFFICE_DOCUMENT_RELATIONSHIP",
          "The root relationships must contain exactly one officeDocument relationship.",
          "error",
          source("_rels/.rels", "/Relationships")
        ),
      ],
    }
  }
  const officeDocumentRelationship = officeDocumentRelationships[0]
  if (officeDocumentRelationship === undefined) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          "DOCX_MISSING_OFFICE_DOCUMENT_RELATIONSHIP",
          "The root relationships must contain exactly one officeDocument relationship.",
          "error",
          source("_rels/.rels", "/Relationships")
        ),
      ],
    }
  }
  const officeDocumentPart = resolveTarget(
    "",
    officeDocumentRelationship.target
  )
  if (officeDocumentPart === undefined || !pkg.parts.has(officeDocumentPart)) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          "DOCX_MISSING_REQUIRED_PART",
          "The officeDocument relationship does not resolve to a package part.",
          "error",
          source("_rels/.rels", "/Relationships/Relationship[1]")
        ),
      ],
    }
  }
  return { ok: true, value: officeDocumentPart }
}

type ContinuingUnsupportedFeatureMode = "compatible" | "lenient"

function unsupportedFeatureMode(
  options: DocxParseOptions
): "strict" | ContinuingUnsupportedFeatureMode {
  return options.unsupportedFeatures ?? "strict"
}

function canApplyUnsupportedFallback(
  options: DocxParseOptions,
  minimumMode: ContinuingUnsupportedFeatureMode
): boolean {
  const mode = unsupportedFeatureMode(options)
  return mode === "lenient" || (mode === "compatible" && minimumMode === mode)
}

function reportUnsupportedFallback(
  diagnostics: ReturnType<typeof diagnostic>[],
  message: string,
  location: ReturnType<typeof source>,
  options: DocxParseOptions,
  minimumMode: ContinuingUnsupportedFeatureMode,
  feature: string,
  fallback: string
): boolean {
  if (!canApplyUnsupportedFallback(options, minimumMode)) return false
  const mode = unsupportedFeatureMode(options)
  diagnostics.push({
    code: "DOCX_UNSUPPORTED_FEATURE_FALLBACK",
    severity: "warning",
    message,
    source: location,
    details: { mode, feature, fallback },
  })
  return true
}

function reportUnsupported(
  diagnostics: ReturnType<typeof diagnostic>[],
  code:
    | "DOCX_UNSUPPORTED_BLOCK"
    | "DOCX_UNSUPPORTED_INLINE"
    | "DOCX_UNSUPPORTED_STYLE_PROPERTY",
  message: string,
  location: ReturnType<typeof source>,
  options: DocxParseOptions,
  feature?: string
): void {
  diagnostics.push({
    code,
    severity: "error",
    message,
    source: location,
    details: {
      mode: unsupportedFeatureMode(options),
      fallback: "none",
      ...(feature === undefined ? {} : { feature }),
    },
  })
  diagnostics.push(
    diagnostic(
      "DOCX_CONTENT_LOSS",
      "Rendering cannot continue because meaningful DOCX content would be omitted.",
      "error",
      location
    )
  )
}

const UNSUPPORTED_CONTENT_FEATURES = Object.freeze([
  Object.freeze({
    feature: "textBoxes",
    names: Object.freeze(["textbox", "txbx", "txbxContent"]),
  }),
  Object.freeze({
    feature: "wordArt",
    names: Object.freeze(["textpath"]),
  }),
  Object.freeze({
    feature: "smartArt",
    names: Object.freeze(["relIds"]),
  }),
  Object.freeze({
    feature: "charts",
    names: Object.freeze(["chart"]),
  }),
  Object.freeze({
    feature: "equations",
    names: Object.freeze(["oMath", "oMathPara"]),
  }),
  Object.freeze({
    feature: "embeddedObjects",
    names: Object.freeze(["object", "OLEObject", "oleObject"]),
  }),
  Object.freeze({
    feature: "trackedChanges",
    names: Object.freeze([
      "ins",
      "del",
      "moveFrom",
      "moveTo",
      "moveFromRangeStart",
      "moveFromRangeEnd",
      "moveToRangeStart",
      "moveToRangeEnd",
      "pPrChange",
      "rPrChange",
      "sectPrChange",
      "tblPrChange",
      "trPrChange",
      "tcPrChange",
    ]),
  }),
  Object.freeze({
    feature: "comments",
    names: Object.freeze([
      "commentRangeStart",
      "commentRangeEnd",
      "commentReference",
    ]),
  }),
  Object.freeze({
    feature: "footnotes",
    names: Object.freeze(["footnoteReference"]),
  }),
  Object.freeze({
    feature: "endnotes",
    names: Object.freeze(["endnoteReference"]),
  }),
] as const)

function descendantLocalNames(element: OrderedElement): ReadonlySet<string> {
  const names = new Set<string>([localName(element.name)])
  const pending = [...childElements(element).map(({ element: child }) => child)]
  while (pending.length > 0) {
    const current = pending.pop()
    if (current === undefined) continue
    names.add(localName(current.name))
    pending.push(...childElements(current).map(({ element: child }) => child))
  }
  return names
}

function unsupportedContentFeature(
  element: OrderedElement
): string | undefined {
  const names = descendantLocalNames(element)
  return UNSUPPORTED_CONTENT_FEATURES.find(({ names: featureNames }) =>
    featureNames.some((name) => names.has(name))
  )?.feature
}

type PartialRunProperties = Readonly<{
  fontFamily?: string
  fontSizeHalfPoints?: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  color?: string
  highlightColor?: string | null
  verticalAlignment?: "baseline" | "superscript" | "subscript"
}>

type PartialParagraphProperties = Readonly<{
  alignment?: ParsedDocxParagraphProperties["alignment"]
  spacingBefore?: number
  spacingAfter?: number
  lineSpacing?: Exclude<ParsedDocxParagraphProperties["lineSpacing"], null>
  indentStart?: number
  indentEnd?: number
  firstLineIndent?: number
  keepWithNext?: boolean
  keepLinesTogether?: boolean
  widowControl?: boolean
  pageBreakBefore?: boolean
  numberingId?: number | null
  numberingLevel?: number
  tabStops?: readonly Readonly<{ position: number; alignment: "left" }>[]
}>

type ParsedStyle = Readonly<{
  id: string
  type: "paragraph" | "character"
  basedOn?: string
  paragraph: PartialParagraphProperties
  run: PartialRunProperties
  source: ReturnType<typeof source>
  basedOnSource?: ReturnType<typeof source>
}>

type ParsedTableStyle = Readonly<{
  id: string
  basedOn?: string
  element: OrderedElement
  source: ReturnType<typeof source>
}>

type StyleSheet = Readonly<{
  paragraphDefaults: PartialParagraphProperties
  runDefaults: PartialRunProperties
  defaultParagraphStyleId?: string
  defaultCharacterStyleId?: string
  styles: ReadonlyMap<string, ParsedStyle>
  tableStyles: ReadonlyMap<string, ParsedTableStyle>
}>

const EMPTY_STYLE_SHEET: StyleSheet = Object.freeze({
  paragraphDefaults: Object.freeze({}),
  runDefaults: Object.freeze({}),
  defaultParagraphStyleId: undefined,
  defaultCharacterStyleId: undefined,
  styles: new Map(),
  tableStyles: new Map(),
})

function booleanProperty(
  element: OrderedElement | undefined
): boolean | undefined {
  if (element === undefined) return undefined
  const value = attr(element, "val")?.toLowerCase()
  return value !== "0" && value !== "false" && value !== "off"
}

function integer(value: string | undefined): number | undefined {
  if (value === undefined || !/^-?\d+$/u.test(value)) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : undefined
}

function roundedNonNegativeDecimal(
  value: string | undefined
): number | undefined {
  if (value === undefined || !/^\d+(?:\.\d+)?$/u.test(value)) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return undefined
  const rounded = Math.round(parsed)
  return Number.isSafeInteger(rounded) ? rounded : undefined
}

function nonNegativeDecimal(value: string | undefined): number | undefined {
  if (value === undefined || !/^\d+(?:\.\d+)?$/u.test(value)) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

function nonNegativeInteger(
  value: string | undefined,
  fallback: number
): number {
  const parsed = integer(value)
  return parsed !== undefined && parsed >= 0 ? parsed : fallback
}

function reportFormattingProblem(
  diagnostics: ReturnType<typeof diagnostic>[],
  code: "DOCX_INVALID_STYLE_VALUE" | "DOCX_UNSUPPORTED_STYLE_PROPERTY",
  message: string,
  location: ReturnType<typeof source>
): void {
  diagnostics.push(diagnostic(code, message, "error", location))
  diagnostics.push(
    diagnostic(
      "DOCX_CONTENT_LOSS",
      "Rendering cannot continue because meaningful DOCX formatting would be omitted.",
      "error",
      location
    )
  )
}

function reportTableProblem(
  diagnostics: ReturnType<typeof diagnostic>[],
  code:
    | "DOCX_INVALID_TABLE"
    | "DOCX_INVALID_TABLE_VALUE"
    | "DOCX_AMBIGUOUS_TABLE"
    | "DOCX_UNSUPPORTED_TABLE_PROPERTY",
  message: string,
  location: ReturnType<typeof source>
): void {
  diagnostics.push(diagnostic(code, message, "error", location))
  diagnostics.push(
    diagnostic(
      "DOCX_CONTENT_LOSS",
      "Rendering cannot continue because table content or layout would be ambiguous or omitted.",
      "error",
      location
    )
  )
}

function reportSectionProblem(
  diagnostics: ReturnType<typeof diagnostic>[],
  code: "DOCX_INVALID_SECTION_STRUCTURE" | "DOCX_UNSUPPORTED_SECTION_BREAK",
  message: string,
  location: ReturnType<typeof source>
): void {
  diagnostics.push(diagnostic(code, message, "error", location))
  diagnostics.push(
    diagnostic(
      "DOCX_CONTENT_LOSS",
      "Rendering cannot continue because section pagination or content ownership would be ambiguous.",
      "error",
      location
    )
  )
}

function validatePropertyChildren(
  element: OrderedElement | undefined,
  allowed: ReadonlySet<string>,
  part: string,
  xmlPath: string,
  diagnostics: ReturnType<typeof diagnostic>[]
): void {
  if (element === undefined) return
  const counts = new Map<string, number>()
  for (const current of childElements(element)) {
    const name = localName(current.name)
    const count = (counts.get(name) ?? 0) + 1
    counts.set(name, count)
    if (!allowed.has(name)) {
      reportFormattingProblem(
        diagnostics,
        "DOCX_UNSUPPORTED_STYLE_PROPERTY",
        `Formatting property '${current.name}' is not supported.`,
        source(part, `${xmlPath}/${current.name}[${count}]`)
      )
    }
  }
}

function validatePropertyAttributes(
  element: OrderedElement,
  supported: Readonly<Record<string, ReadonlySet<string>>>,
  part: string,
  xmlPath: string,
  diagnostics: ReturnType<typeof diagnostic>[]
): void {
  const counts = new Map<string, number>()
  for (const current of childElements(element)) {
    const name = localName(current.name)
    const count = (counts.get(name) ?? 0) + 1
    counts.set(name, count)
    const allowed = supported[name]
    if (allowed === undefined) continue
    for (const attributeName of Object.keys(attributes(current.element))) {
      const attribute = localName(attributeName)
      if (!allowed.has(attribute)) {
        reportFormattingProblem(
          diagnostics,
          "DOCX_UNSUPPORTED_STYLE_PROPERTY",
          `Formatting attribute '${attributeName}' on '${current.name}' is not supported.`,
          source(part, `${xmlPath}/${current.name}[${count}]`)
        )
      }
    }
  }
}

const PARAGRAPH_PROPERTY_NAMES = new Set([
  "pStyle",
  "jc",
  "spacing",
  "ind",
  "keepNext",
  "keepLines",
  "widowControl",
  "pageBreakBefore",
  "numPr",
  "tabs",
  "sectPr",
  "rPr",
  "pBdr",
  "shd",
])
const RUN_PROPERTY_NAMES = new Set([
  "rStyle",
  "rFonts",
  "b",
  "bCs",
  "i",
  "iCs",
  "u",
  "color",
  "sz",
  "szCs",
  "rtl",
  "lang",
  "vertAlign",
  "highlight",
])

const HIGHLIGHT_COLORS: Readonly<Record<string, string>> = Object.freeze({
  black: "000000",
  blue: "0000FF",
  cyan: "00FFFF",
  green: "00FF00",
  magenta: "FF00FF",
  red: "FF0000",
  yellow: "FFFF00",
  white: "FFFFFF",
  darkBlue: "000080",
  darkCyan: "008080",
  darkGreen: "008000",
  darkMagenta: "800080",
  darkRed: "800000",
  darkYellow: "808000",
  darkGray: "808080",
  lightGray: "C0C0C0",
})

function validateNoOpParagraphBorders(
  element: OrderedElement | undefined,
  part: string,
  xmlPath: string,
  diagnostics: ReturnType<typeof diagnostic>[]
): void {
  if (element === undefined) return
  const sides = childElements(element)
  const allowedSides = new Set([
    "top",
    "left",
    "bottom",
    "right",
    "between",
    "bar",
  ])
  const noOp =
    sides.length > 0 &&
    sides.every(({ name, element: side }) => {
      const sideAttributes = Object.fromEntries(
        Object.entries(attributes(side)).map(([key, value]) => [
          localName(key),
          decodeXmlReferences(value),
        ])
      )
      return (
        allowedSides.has(localName(name)) &&
        Object.keys(sideAttributes).every((key) =>
          ["val", "sz", "space", "color"].includes(key)
        ) &&
        (sideAttributes.val === "nil" || sideAttributes.val === "none") &&
        (sideAttributes.sz === undefined || sideAttributes.sz === "0") &&
        (sideAttributes.space === undefined || sideAttributes.space === "0") &&
        (sideAttributes.color === undefined ||
          sideAttributes.color === "auto") &&
        childElements(side).length === 0
      )
    })
  if (!noOp) {
    reportFormattingProblem(
      diagnostics,
      "DOCX_UNSUPPORTED_STYLE_PROPERTY",
      "Paragraph borders are supported only when every declared side is an explicit nil/none no-op.",
      source(part, xmlPath)
    )
  }
}

function validateNoOpParagraphShading(
  element: OrderedElement | undefined,
  part: string,
  xmlPath: string,
  diagnostics: ReturnType<typeof diagnostic>[]
): void {
  if (element === undefined) return
  const shadingAttributes = Object.fromEntries(
    Object.entries(attributes(element)).map(([key, value]) => [
      localName(key),
      decodeXmlReferences(value),
    ])
  )
  const noOp =
    Object.keys(shadingAttributes).every((key) =>
      ["val", "fill", "color"].includes(key)
    ) &&
    shadingAttributes.val === "clear" &&
    (shadingAttributes.fill === undefined ||
      shadingAttributes.fill === "auto") &&
    (shadingAttributes.color === undefined ||
      shadingAttributes.color === "auto") &&
    childElements(element).length === 0
  if (!noOp) {
    reportFormattingProblem(
      diagnostics,
      "DOCX_UNSUPPORTED_STYLE_PROPERTY",
      "Paragraph shading is supported only as clear with auto fill and color.",
      source(part, xmlPath)
    )
  }
}

function parseParagraphProperties(
  element: OrderedElement | undefined,
  part: string,
  xmlPath: string,
  diagnostics: ReturnType<typeof diagnostic>[]
): PartialParagraphProperties {
  if (element === undefined) return {}
  validatePropertyChildren(
    element,
    PARAGRAPH_PROPERTY_NAMES,
    part,
    xmlPath,
    diagnostics
  )
  validatePropertyAttributes(
    element,
    {
      pStyle: new Set(["val"]),
      jc: new Set(["val"]),
      spacing: new Set(["before", "after", "line", "lineRule"]),
      ind: new Set(["start", "left", "end", "right", "firstLine", "hanging"]),
      keepNext: new Set(["val"]),
      keepLines: new Set(["val"]),
      widowControl: new Set(["val"]),
      pageBreakBefore: new Set(["val"]),
    },
    part,
    xmlPath,
    diagnostics
  )
  validateNoOpParagraphBorders(
    child(element, "pBdr")?.element,
    part,
    `${xmlPath}/w:pBdr[1]`,
    diagnostics
  )
  validateNoOpParagraphShading(
    child(element, "shd")?.element,
    part,
    `${xmlPath}/w:shd[1]`,
    diagnostics
  )
  const alignmentValue = attr(child(element, "jc")?.element, "val")
  let alignment: ParsedDocxParagraphProperties["alignment"] | undefined
  if (alignmentValue !== undefined) {
    if (
      ["left", "start", "center", "right", "end", "both"].includes(
        alignmentValue
      )
    ) {
      alignment =
        alignmentValue === "both"
          ? "justify"
          : alignmentValue === "start"
            ? "left"
            : alignmentValue === "end"
              ? "right"
              : (alignmentValue as ParsedDocxParagraphProperties["alignment"])
    } else {
      reportFormattingProblem(
        diagnostics,
        "DOCX_INVALID_STYLE_VALUE",
        `Paragraph alignment '${alignmentValue}' is not supported.`,
        source(part, `${xmlPath}/w:jc[1]`)
      )
    }
  }
  const spacing = child(element, "spacing")?.element
  const before = integer(attr(spacing, "before"))
  const after = integer(attr(spacing, "after"))
  const rawLine = attr(spacing, "line")
  const line = roundedNonNegativeDecimal(rawLine)
  const lineRule = attr(spacing, "lineRule")
  let lineSpacing: PartialParagraphProperties["lineSpacing"]
  if (line !== undefined) {
    if (lineRule === undefined || lineRule === "auto") {
      lineSpacing = { rule: "auto", value240ths: line }
    } else if (lineRule === "exact" || lineRule === "atLeast") {
      lineSpacing = { rule: lineRule, valueTwips: line }
    } else {
      reportFormattingProblem(
        diagnostics,
        "DOCX_INVALID_STYLE_VALUE",
        `Line-spacing rule '${lineRule}' is not supported.`,
        source(part, `${xmlPath}/w:spacing[1]`)
      )
    }
  } else if (rawLine !== undefined) {
    reportFormattingProblem(
      diagnostics,
      "DOCX_INVALID_STYLE_VALUE",
      "Line spacing requires a non-negative decimal w:line value that rounds to a safe integer.",
      source(part, `${xmlPath}/w:spacing[1]`)
    )
  } else if (lineRule === "exact" || lineRule === "atLeast") {
    reportFormattingProblem(
      diagnostics,
      "DOCX_INVALID_STYLE_VALUE",
      `Line-spacing rule '${lineRule}' requires a w:line value.`,
      source(part, `${xmlPath}/w:spacing[1]`)
    )
  } else if (lineRule !== undefined && lineRule !== "auto") {
    reportFormattingProblem(
      diagnostics,
      "DOCX_INVALID_STYLE_VALUE",
      `Line-spacing rule '${lineRule}' is not supported.`,
      source(part, `${xmlPath}/w:spacing[1]`)
    )
  }

  const indentation = child(element, "ind")?.element
  const start = integer(attr(indentation, "start"))
  const left = integer(attr(indentation, "left"))
  const end = integer(attr(indentation, "end"))
  const right = integer(attr(indentation, "right"))
  const firstLine = integer(attr(indentation, "firstLine"))
  const hanging = integer(attr(indentation, "hanging"))
  if (start !== undefined && left !== undefined && start !== left) {
    diagnostics.push(
      diagnostic(
        "DOCX_INDENT_CONFLICT",
        "Both w:start and legacy w:left indentation are present; w:start takes precedence.",
        "warning",
        source(part, `${xmlPath}/w:ind[1]`)
      )
    )
  }
  if (end !== undefined && right !== undefined && end !== right) {
    diagnostics.push(
      diagnostic(
        "DOCX_INDENT_CONFLICT",
        "Both w:end and legacy w:right indentation are present; w:end takes precedence.",
        "warning",
        source(part, `${xmlPath}/w:ind[1]`)
      )
    )
  }
  if (firstLine !== undefined && hanging !== undefined) {
    diagnostics.push(
      diagnostic(
        "DOCX_INDENT_CONFLICT",
        "Both w:firstLine and w:hanging indentation are present; w:firstLine takes precedence.",
        "warning",
        source(part, `${xmlPath}/w:ind[1]`)
      )
    )
  }
  const numbering = child(element, "numPr")?.element
  if (numbering !== undefined) {
    validatePropertyChildren(
      numbering,
      new Set(["ilvl", "numId"]),
      part,
      `${xmlPath}/w:numPr[1]`,
      diagnostics
    )
    validatePropertyAttributes(
      numbering,
      { ilvl: new Set(["val"]), numId: new Set(["val"]) },
      part,
      `${xmlPath}/w:numPr[1]`,
      diagnostics
    )
  }
  const tabs = child(element, "tabs")?.element
  const tabStops: Array<Readonly<{ position: number; alignment: "left" }>> = []
  if (tabs !== undefined) {
    if (children(element, "tabs").length > 1) {
      reportFormattingProblem(
        diagnostics,
        "DOCX_INVALID_STYLE_VALUE",
        "Paragraph properties must contain at most one tabs collection.",
        source(part, `${xmlPath}/w:tabs[2]`)
      )
    }
    validatePropertyChildren(
      tabs,
      new Set(["tab"]),
      part,
      `${xmlPath}/w:tabs[1]`,
      diagnostics
    )
    const seen = new Set<number>()
    for (const [index, tab] of children(tabs, "tab").entries()) {
      validatePropertyAttributes(
        tabs,
        { tab: new Set(["val", "pos", "leader"]) },
        part,
        `${xmlPath}/w:tabs[1]`,
        diagnostics
      )
      const tabPath = `${xmlPath}/w:tabs[1]/w:tab[${index + 1}]`
      const alignment = attr(tab.element, "val")
      const position = integer(attr(tab.element, "pos"))
      const leader = attr(tab.element, "leader")
      if (
        (alignment !== "left" && alignment !== "start") ||
        position === undefined ||
        position <= 0 ||
        (leader !== undefined && leader !== "none")
      ) {
        reportFormattingProblem(
          diagnostics,
          "DOCX_UNSUPPORTED_STYLE_PROPERTY",
          "Tab stops require a positive integer position, left/start alignment, and no leader.",
          source(part, tabPath)
        )
        continue
      }
      if (seen.has(position)) {
        reportFormattingProblem(
          diagnostics,
          "DOCX_INVALID_STYLE_VALUE",
          `Tab-stop position ${position} is duplicated.`,
          source(part, tabPath)
        )
        continue
      }
      seen.add(position)
      tabStops.push({ position, alignment: "left" })
    }
    tabStops.sort((left, right) => left.position - right.position)
  }
  // w:pPr/w:rPr formats Word's paragraph mark, not the paragraph's rendered
  // glyph runs. Validate it using the same bounded profile, but do not merge it
  // into paragraph text styling.
  parseRunProperties(
    child(element, "rPr")?.element,
    part,
    `${xmlPath}/w:rPr[1]`,
    diagnostics
  )
  const rawNumberingId = attr(
    child(numbering ?? element, "numId")?.element,
    "val"
  )
  const numberingId = integer(rawNumberingId)
  const rawNumberingLevel = attr(
    child(numbering ?? element, "ilvl")?.element,
    "val"
  )
  const numberingLevel = integer(rawNumberingLevel)
  if (
    rawNumberingId !== undefined &&
    (numberingId === undefined || numberingId < 0)
  ) {
    reportFormattingProblem(
      diagnostics,
      "DOCX_INVALID_STYLE_VALUE",
      "Paragraph numbering ID must be a non-negative integer.",
      source(part, `${xmlPath}/w:numPr[1]/w:numId[1]`)
    )
  }
  if (
    rawNumberingLevel !== undefined &&
    (numberingLevel === undefined || numberingLevel < 0 || numberingLevel > 8)
  ) {
    reportFormattingProblem(
      diagnostics,
      "DOCX_INVALID_STYLE_VALUE",
      "Paragraph numbering level must be an integer from 0 through 8.",
      source(part, `${xmlPath}/w:numPr[1]/w:ilvl[1]`)
    )
  }
  return {
    ...(alignment === undefined ? {} : { alignment }),
    ...(before === undefined ? {} : { spacingBefore: before }),
    ...(after === undefined ? {} : { spacingAfter: after }),
    ...(lineSpacing === undefined ? {} : { lineSpacing }),
    ...((start ?? left) === undefined ? {} : { indentStart: start ?? left }),
    ...((end ?? right) === undefined ? {} : { indentEnd: end ?? right }),
    ...((firstLine ?? hanging) === undefined
      ? {}
      : { firstLineIndent: firstLine ?? -(hanging ?? 0) }),
    ...(booleanProperty(child(element, "keepNext")?.element) === undefined
      ? {}
      : { keepWithNext: booleanProperty(child(element, "keepNext")?.element) }),
    ...(booleanProperty(child(element, "keepLines")?.element) === undefined
      ? {}
      : {
          keepLinesTogether: booleanProperty(
            child(element, "keepLines")?.element
          ),
        }),
    ...(booleanProperty(child(element, "widowControl")?.element) === undefined
      ? {}
      : {
          widowControl: booleanProperty(
            child(element, "widowControl")?.element
          ),
        }),
    ...(booleanProperty(child(element, "pageBreakBefore")?.element) ===
    undefined
      ? {}
      : {
          pageBreakBefore: booleanProperty(
            child(element, "pageBreakBefore")?.element
          ),
        }),
    ...(numberingId === undefined || numberingId < 0
      ? {}
      : { numberingId: numberingId === 0 ? null : numberingId }),
    ...(numberingLevel === undefined || numberingLevel < 0 || numberingLevel > 8
      ? {}
      : { numberingLevel }),
    ...(tabs === undefined ? {} : { tabStops: Object.freeze(tabStops) }),
  }
}

function parseRunProperties(
  element: OrderedElement | undefined,
  part: string,
  xmlPath: string,
  diagnostics: ReturnType<typeof diagnostic>[]
): Readonly<{ formatting: PartialRunProperties; styleId?: string }> {
  if (element === undefined) return { formatting: {} }
  validatePropertyChildren(
    element,
    RUN_PROPERTY_NAMES,
    part,
    xmlPath,
    diagnostics
  )
  validatePropertyAttributes(
    element,
    {
      rStyle: new Set(["val"]),
      rFonts: new Set(["ascii", "hAnsi", "cs", "eastAsia"]),
      b: new Set(["val"]),
      bCs: new Set(["val"]),
      i: new Set(["val"]),
      iCs: new Set(["val"]),
      u: new Set(["val"]),
      color: new Set(["val"]),
      sz: new Set(["val"]),
      szCs: new Set(["val"]),
      rtl: new Set(["val"]),
      lang: new Set(["val", "eastAsia", "bidi"]),
      vertAlign: new Set(["val"]),
      highlight: new Set(["val"]),
    },
    part,
    xmlPath,
    diagnostics
  )
  const fonts = child(element, "rFonts")?.element
  const asciiFont = attr(fonts, "ascii")
  const highAnsiFont = attr(fonts, "hAnsi")
  const fontFamily = asciiFont ?? highAnsiFont
  const complexScriptFont = attr(fonts, "cs")
  const eastAsiaFont = attr(fonts, "eastAsia")
  const color = attr(child(element, "color")?.element, "val")
  const size = integer(attr(child(element, "sz")?.element, "val"))
  const complexScriptSize = integer(
    attr(child(element, "szCs")?.element, "val")
  )
  const bold = booleanProperty(child(element, "b")?.element)
  const complexScriptBold = booleanProperty(child(element, "bCs")?.element)
  const italic = booleanProperty(child(element, "i")?.element)
  const complexScriptItalic = booleanProperty(child(element, "iCs")?.element)
  const verticalAlignment = attr(child(element, "vertAlign")?.element, "val")
  const highlightElement = child(element, "highlight")?.element
  const highlight = attr(highlightElement, "val")
  const highlightColor =
    highlight === "none"
      ? null
      : highlight === undefined
        ? undefined
        : HIGHLIGHT_COLORS[highlight]
  if (children(element, "highlight").length > 1) {
    reportFormattingProblem(
      diagnostics,
      "DOCX_INVALID_STYLE_VALUE",
      "Run properties must contain at most one highlight value.",
      source(part, `${xmlPath}/w:highlight[2]`)
    )
  }
  if (children(element, "vertAlign").length > 1) {
    reportFormattingProblem(
      diagnostics,
      "DOCX_INVALID_STYLE_VALUE",
      "Run properties must contain at most one vertical alignment value.",
      source(part, `${xmlPath}/w:vertAlign[2]`)
    )
  }
  if (
    asciiFont !== undefined &&
    highAnsiFont !== undefined &&
    asciiFont !== highAnsiFont
  ) {
    reportFormattingProblem(
      diagnostics,
      "DOCX_UNSUPPORTED_STYLE_PROPERTY",
      `Run fonts w:ascii ('${asciiFont}') and w:hAnsi ('${highAnsiFont}') conflict for supported LTR Latin text.`,
      source(part, `${xmlPath}/w:rFonts[1]`)
    )
  }
  if (highlightElement !== undefined && highlightColor === undefined) {
    reportFormattingProblem(
      diagnostics,
      "DOCX_INVALID_STYLE_VALUE",
      `Run highlight '${highlight ?? "<missing>"}' is outside the supported fixed-color palette.`,
      source(part, `${xmlPath}/w:highlight[1]`)
    )
  }
  if (
    verticalAlignment !== undefined &&
    verticalAlignment !== "baseline" &&
    verticalAlignment !== "superscript" &&
    verticalAlignment !== "subscript"
  ) {
    reportFormattingProblem(
      diagnostics,
      "DOCX_INVALID_STYLE_VALUE",
      `Run vertical alignment '${verticalAlignment}' is invalid.`,
      source(part, `${xmlPath}/w:vertAlign[1]`)
    )
  }
  for (const [attribute, scriptFont] of [
    ["w:cs", complexScriptFont],
    ["w:eastAsia", eastAsiaFont],
  ] as const) {
    if (
      scriptFont !== undefined &&
      (fontFamily === undefined || scriptFont !== fontFamily)
    ) {
      reportFormattingProblem(
        diagnostics,
        "DOCX_UNSUPPORTED_STYLE_PROPERTY",
        `Run font ${attribute} ('${scriptFont}') is not equivalent to the supported LTR Latin font ('${fontFamily ?? "<unspecified>"}').`,
        source(part, `${xmlPath}/w:rFonts[1]`)
      )
    }
  }
  for (const [property, latinValue, complexValue] of [
    ["w:szCs", size, complexScriptSize],
    ["w:bCs", bold, complexScriptBold],
    ["w:iCs", italic, complexScriptItalic],
  ] as const) {
    if (
      complexValue !== undefined &&
      (latinValue === undefined || complexValue !== latinValue)
    ) {
      reportFormattingProblem(
        diagnostics,
        "DOCX_UNSUPPORTED_STYLE_PROPERTY",
        `Run property ${property} is not equivalent to its supported LTR Latin property.`,
        source(part, `${xmlPath}/${property}[1]`)
      )
    }
  }
  if (booleanProperty(child(element, "rtl")?.element) === true) {
    reportFormattingProblem(
      diagnostics,
      "DOCX_UNSUPPORTED_STYLE_PROPERTY",
      "Right-to-left run formatting is not supported.",
      source(part, `${xmlPath}/w:rtl[1]`)
    )
  }
  if (color !== undefined && !/^[0-9a-f]{6}$/iu.test(color)) {
    reportFormattingProblem(
      diagnostics,
      "DOCX_INVALID_STYLE_VALUE",
      `Run color '${color}' is not a six-digit RGB value.`,
      source(part, `${xmlPath}/w:color[1]`)
    )
  }
  if (
    attr(child(element, "sz")?.element, "val") !== undefined &&
    (size === undefined || size < 0)
  ) {
    reportFormattingProblem(
      diagnostics,
      "DOCX_INVALID_STYLE_VALUE",
      "Run font size must be a non-negative integer half-point value.",
      source(part, `${xmlPath}/w:sz[1]`)
    )
  }
  const underlineElement = child(element, "u")?.element
  const underlineValue = attr(underlineElement, "val")
  return {
    styleId: attr(child(element, "rStyle")?.element, "val"),
    formatting: {
      ...(fontFamily === undefined ? {} : { fontFamily }),
      ...(size === undefined || size < 0 ? {} : { fontSizeHalfPoints: size }),
      ...(bold === undefined ? {} : { bold }),
      ...(italic === undefined ? {} : { italic }),
      ...(underlineElement === undefined
        ? {}
        : {
            underline: !["none", "0", "false", "off"].includes(
              underlineValue?.toLowerCase() ?? "single"
            ),
          }),
      ...(color !== undefined && /^[0-9a-f]{6}$/iu.test(color)
        ? { color: color.toUpperCase() }
        : {}),
      ...(verticalAlignment === "baseline" ||
      verticalAlignment === "superscript" ||
      verticalAlignment === "subscript"
        ? { verticalAlignment }
        : {}),
      ...(highlightColor === undefined ? {} : { highlightColor }),
    },
  }
}

function relationshipsPartForOwner(ownerPart: string): string {
  const slash = ownerPart.lastIndexOf("/")
  const directory = slash < 0 ? "" : ownerPart.slice(0, slash + 1)
  const file = slash < 0 ? ownerPart : ownerPart.slice(slash + 1)
  return `${directory}_rels/${file}.rels`
}

function resolveStylesPart(
  pkg: ValidatedDocxPackage,
  documentPart: string,
  options: DocxParseOptions
): { part?: string; diagnostics: readonly ReturnType<typeof diagnostic>[] } {
  const relationshipsPart = relationshipsPartForOwner(documentPart)
  const bytes = pkg.parts.get(relationshipsPart)
  if (bytes === undefined) return { diagnostics: [] }
  const xml = decodeXml(bytes)
  const relationships =
    xml === undefined
      ? undefined
      : relationshipPartTargets(
          xml,
          options.limits?.maxXmlDepth ?? DEFAULT_RESOURCE_LIMITS.maxXmlDepth
        )
  if (relationships === undefined) {
    return {
      diagnostics: [
        diagnostic(
          "DOCX_INVALID_RELATIONSHIPS",
          `Relationship part '${relationshipsPart}' has no Relationships root element.`,
          "error",
          source(relationshipsPart, "/")
        ),
      ],
    }
  }
  const styleRelationshipTypes = new Set([
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles",
    "http://purl.oclc.org/ooxml/officeDocument/relationships/styles",
  ])
  const styleRelationships = relationships.filter(({ type }) =>
    styleRelationshipTypes.has(type)
  )
  if (styleRelationships.length === 0) return { diagnostics: [] }
  if (styleRelationships.length !== 1) {
    return {
      diagnostics: [
        diagnostic(
          "DOCX_DUPLICATE_STYLES_RELATIONSHIP",
          "The main document must not have more than one styles relationship.",
          "error",
          source(relationshipsPart, "/Relationships")
        ),
      ],
    }
  }
  const relationship = styleRelationships[0]
  const resolved =
    relationship === undefined
      ? undefined
      : resolveTarget(documentPart, relationship.target)
  if (resolved === undefined || !pkg.parts.has(resolved)) {
    return {
      diagnostics: [
        diagnostic(
          "DOCX_MISSING_STYLES_PART",
          "The styles relationship does not resolve to a package part.",
          "error",
          source(
            relationshipsPart,
            `/Relationships/Relationship[${relationship?.index ?? 1}]`
          )
        ),
      ],
    }
  }
  return { part: resolved, diagnostics: [] }
}

function resolveNumberingPart(
  pkg: ValidatedDocxPackage,
  documentPart: string,
  options: DocxParseOptions
): { part?: string; diagnostics: readonly ReturnType<typeof diagnostic>[] } {
  const relationshipsPart = relationshipsPartForOwner(documentPart)
  const bytes = pkg.parts.get(relationshipsPart)
  if (bytes === undefined) return { diagnostics: [] }
  const xml = decodeXml(bytes)
  const relationships =
    xml === undefined
      ? undefined
      : relationshipPartTargets(
          xml,
          options.limits?.maxXmlDepth ?? DEFAULT_RESOURCE_LIMITS.maxXmlDepth
        )
  if (relationships === undefined) {
    return {
      diagnostics: [
        diagnostic(
          "DOCX_INVALID_RELATIONSHIPS",
          `Relationship part '${relationshipsPart}' has no Relationships root element.`,
          "error",
          source(relationshipsPart, "/")
        ),
      ],
    }
  }
  const relationshipTypes = new Set([
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering",
    "http://purl.oclc.org/ooxml/officeDocument/relationships/numbering",
  ])
  const matches = relationships.filter(({ type }) =>
    relationshipTypes.has(type)
  )
  if (matches.length === 0) return { diagnostics: [] }
  if (matches.length !== 1) {
    return {
      diagnostics: [
        diagnostic(
          "DOCX_DUPLICATE_NUMBERING_RELATIONSHIP",
          "The main document must not have more than one numbering relationship.",
          "error",
          source(relationshipsPart, "/Relationships")
        ),
      ],
    }
  }
  const relationship = matches[0]
  const resolved =
    relationship === undefined
      ? undefined
      : resolveTarget(documentPart, relationship.target)
  if (resolved === undefined || !pkg.parts.has(resolved)) {
    return {
      diagnostics: [
        diagnostic(
          "DOCX_MISSING_NUMBERING_PART",
          "The numbering relationship does not resolve to a package part.",
          "error",
          source(
            relationshipsPart,
            `/Relationships/Relationship[${relationship?.index ?? 1}]`
          )
        ),
      ],
    }
  }
  return { part: resolved, diagnostics: [] }
}

function reportNumberingProblem(
  diagnostics: ReturnType<typeof diagnostic>[],
  code: string,
  message: string,
  location: ReturnType<typeof source>
): void {
  diagnostics.push(diagnostic(code, message, "error", location))
  diagnostics.push(
    diagnostic(
      "DOCX_CONTENT_LOSS",
      "Rendering cannot continue because meaningful DOCX numbering would be omitted.",
      "error",
      location
    )
  )
}

type AbstractNumbering = Readonly<{
  levels: ReadonlyMap<number, ParsedDocxNumberingLevelDefinition>
}>

function parseNumberingLevel(
  element: OrderedElement,
  part: string,
  xmlPath: string,
  diagnostics: ReturnType<typeof diagnostic>[]
): ParsedDocxNumberingLevelDefinition | undefined {
  const rawLevel = attr(element, "ilvl")
  const level = integer(rawLevel)
  if (level === undefined || level < 0 || level > 8) {
    reportNumberingProblem(
      diagnostics,
      "DOCX_INVALID_NUMBERING_LEVEL",
      "Numbering level w:ilvl must be an integer from 0 through 8.",
      source(part, xmlPath)
    )
    return undefined
  }
  const formatTokens = {
    bullet: "bullet",
    decimal: "decimal",
    lowerLetter: "lowerLetter",
    upperLetter: "upperLetter",
    lowerRoman: "lowerRoman",
    upperRoman: "upperRoman",
  } as const
  const rawFormat = attr(child(element, "numFmt")?.element, "val")
  const format =
    rawFormat === undefined
      ? undefined
      : formatTokens[rawFormat as keyof typeof formatTokens]
  if (format === undefined) {
    reportNumberingProblem(
      diagnostics,
      rawFormat === undefined
        ? "DOCX_MALFORMED_NUMBERING"
        : "DOCX_UNSUPPORTED_NUMBERING_FORMAT",
      rawFormat === undefined
        ? `Numbering level ${level} has no w:numFmt.`
        : `Numbering format '${rawFormat}' is not supported.`,
      source(part, `${xmlPath}/w:numFmt[1]`)
    )
    return undefined
  }
  const rawText = attr(child(element, "lvlText")?.element, "val")
  if (rawText === undefined) {
    reportNumberingProblem(
      diagnostics,
      "DOCX_MALFORMED_NUMBERING",
      `Numbering level ${level} has no w:lvlText.`,
      source(part, `${xmlPath}/w:lvlText[1]`)
    )
    return undefined
  }
  for (const match of rawText.matchAll(/%(\d+)/gu)) {
    const reference = Number(match[1])
    if (reference < 1 || reference > 9) {
      reportNumberingProblem(
        diagnostics,
        "DOCX_INVALID_NUMBERING_TOKEN",
        `Numbering level text contains invalid counter token '${match[0]}'.`,
        source(part, `${xmlPath}/w:lvlText[1]`)
      )
    }
  }
  const rawStart = attr(child(element, "start")?.element, "val")
  const startAt = rawStart === undefined ? 1 : integer(rawStart)
  if (startAt === undefined || startAt < 0) {
    reportNumberingProblem(
      diagnostics,
      "DOCX_INVALID_NUMBERING_VALUE",
      "Numbering start must be a non-negative integer.",
      source(part, `${xmlPath}/w:start[1]`)
    )
    return undefined
  }
  const rawSuffix = attr(child(element, "suff")?.element, "val") ?? "tab"
  const suffix = ["tab", "space", "nothing"].includes(rawSuffix)
    ? (rawSuffix as "tab" | "space" | "nothing")
    : undefined
  const rawAlignment = attr(child(element, "lvlJc")?.element, "val") ?? "left"
  const alignment =
    rawAlignment === "start"
      ? "left"
      : rawAlignment === "end"
        ? "right"
        : ["left", "center", "right"].includes(rawAlignment)
          ? (rawAlignment as "left" | "center" | "right")
          : undefined
  if (suffix === undefined || alignment === undefined) {
    reportNumberingProblem(
      diagnostics,
      "DOCX_INVALID_NUMBERING_VALUE",
      suffix === undefined
        ? `Numbering suffix '${rawSuffix}' is invalid.`
        : `Numbering alignment '${rawAlignment}' is invalid.`,
      source(part, xmlPath)
    )
    return undefined
  }
  const indentation = child(
    child(element, "pPr")?.element ?? element,
    "ind"
  )?.element
  const rawIndentStart = attr(indentation, "start")
  const rawIndentLeft = attr(indentation, "left")
  const rawFirstLine = attr(indentation, "firstLine")
  const rawHanging = attr(indentation, "hanging")
  const indentStart = integer(attr(indentation, "start"))
  const indentLeft = integer(attr(indentation, "left"))
  const firstLine = integer(attr(indentation, "firstLine"))
  const hanging = integer(attr(indentation, "hanging"))
  if (
    [rawIndentStart, rawIndentLeft, rawFirstLine, rawHanging].some(
      (value) => value !== undefined && integer(value) === undefined
    )
  ) {
    reportNumberingProblem(
      diagnostics,
      "DOCX_INVALID_NUMBERING_VALUE",
      "Numbering-level indentation values must be integers.",
      source(part, `${xmlPath}/w:pPr[1]/w:ind[1]`)
    )
    return undefined
  }
  if (
    indentStart !== undefined &&
    indentLeft !== undefined &&
    indentStart !== indentLeft
  ) {
    diagnostics.push(
      diagnostic(
        "DOCX_INDENT_CONFLICT",
        "Both w:start and legacy w:left level indentation are present; w:start takes precedence.",
        "warning",
        source(part, `${xmlPath}/w:pPr[1]/w:ind[1]`)
      )
    )
  }
  if (firstLine !== undefined && hanging !== undefined) {
    diagnostics.push(
      diagnostic(
        "DOCX_INDENT_CONFLICT",
        "Both w:firstLine and w:hanging level indentation are present; w:firstLine takes precedence.",
        "warning",
        source(part, `${xmlPath}/w:pPr[1]/w:ind[1]`)
      )
    )
  }
  const rawRestart = attr(child(element, "lvlRestart")?.element, "val")
  const restart = rawRestart === undefined ? undefined : integer(rawRestart)
  if (
    rawRestart !== undefined &&
    (restart === undefined || restart < 0 || restart > level)
  ) {
    reportNumberingProblem(
      diagnostics,
      "DOCX_INVALID_NUMBERING_VALUE",
      `w:lvlRestart for level ${level} must be 0 or identify a preceding level using its one-based index.`,
      source(part, `${xmlPath}/w:lvlRestart[1]`)
    )
    return undefined
  }
  const legalElement = child(element, "isLgl")?.element
  const rawLegal = attr(legalElement, "val")?.toLowerCase()
  if (
    rawLegal !== undefined &&
    !["0", "1", "true", "false", "on", "off"].includes(rawLegal)
  ) {
    reportNumberingProblem(
      diagnostics,
      "DOCX_INVALID_NUMBERING_VALUE",
      `w:isLgl value '${rawLegal}' is invalid.`,
      source(part, `${xmlPath}/w:isLgl[1]`)
    )
    return undefined
  }
  return {
    level,
    startAt,
    format,
    levelText: rawText,
    suffix,
    alignment,
    indentStart: indentStart ?? indentLeft ?? 0,
    firstLineIndent: firstLine ?? -(hanging ?? 0),
    restartAfterLevel:
      restart === 0
        ? null
        : restart === undefined
          ? level === 0
            ? null
            : level - 1
          : restart - 1,
    legal: booleanProperty(legalElement) ?? false,
  }
}

function parseNumberingDefinitions(
  pkg: ValidatedDocxPackage,
  numberingPart: string | undefined,
  options: DocxParseOptions,
  diagnostics: ReturnType<typeof diagnostic>[]
): readonly ParsedDocxNumberingDefinition[] {
  if (numberingPart === undefined) return []
  const bytes = pkg.parts.get(numberingPart)
  const xml = bytes === undefined ? undefined : decodeXml(bytes)
  const root =
    xml === undefined
      ? undefined
      : parseXml(
          xml,
          options.limits?.maxXmlDepth ?? DEFAULT_RESOURCE_LIMITS.maxXmlDepth
        )
  if (root === undefined || localName(root.name) !== "numbering") {
    reportNumberingProblem(
      diagnostics,
      "DOCX_INVALID_NUMBERING",
      "The numbering part must have a numbering root element.",
      source(numberingPart, "/")
    )
    return []
  }
  const abstracts = new Map<number, AbstractNumbering>()
  const instances: {
    numId: number
    abstractId: number
    overrides: Map<
      number,
      Readonly<{
        startAt?: number
        level?: ParsedDocxNumberingLevelDefinition
      }>
    >
    path: string
  }[] = []
  let abstractIndex = 0
  let numIndex = 0
  for (const current of childElements(root)) {
    const name = localName(current.name)
    if (name === "abstractNum") {
      abstractIndex += 1
      const path = `/${root.name}[1]/${current.name}[${abstractIndex}]`
      const abstractId = integer(attr(current.element, "abstractNumId"))
      if (
        abstractId === undefined ||
        abstractId < 0 ||
        abstracts.has(abstractId)
      ) {
        reportNumberingProblem(
          diagnostics,
          abstractId !== undefined && abstracts.has(abstractId)
            ? "DOCX_DUPLICATE_NUMBERING_ID"
            : "DOCX_INVALID_NUMBERING_VALUE",
          `Abstract numbering ID '${attr(current.element, "abstractNumId") ?? "<missing>"}' is invalid or duplicated.`,
          source(numberingPart, path)
        )
        continue
      }
      const levels = new Map<number, ParsedDocxNumberingLevelDefinition>()
      let levelIndex = 0
      for (const levelElement of children(current.element, "lvl")) {
        levelIndex += 1
        const level = parseNumberingLevel(
          levelElement.element,
          numberingPart,
          `${path}/${levelElement.name}[${levelIndex}]`,
          diagnostics
        )
        if (level === undefined) continue
        if (levels.has(level.level)) {
          reportNumberingProblem(
            diagnostics,
            "DOCX_DUPLICATE_NUMBERING_LEVEL",
            `Abstract numbering ${abstractId} defines level ${level.level} more than once.`,
            source(numberingPart, `${path}/${levelElement.name}[${levelIndex}]`)
          )
        } else {
          levels.set(level.level, level)
        }
      }
      if (levels.size === 0) {
        reportNumberingProblem(
          diagnostics,
          "DOCX_MALFORMED_NUMBERING",
          `Abstract numbering ${abstractId} defines no valid levels.`,
          source(numberingPart, path)
        )
      }
      abstracts.set(abstractId, { levels })
    } else if (name === "num") {
      numIndex += 1
      const path = `/${root.name}[1]/${current.name}[${numIndex}]`
      const numId = integer(attr(current.element, "numId"))
      const abstractId = integer(
        attr(child(current.element, "abstractNumId")?.element, "val")
      )
      if (
        numId === undefined ||
        numId <= 0 ||
        instances.some((instance) => instance.numId === numId) ||
        abstractId === undefined ||
        abstractId < 0
      ) {
        reportNumberingProblem(
          diagnostics,
          instances.some((instance) => instance.numId === numId)
            ? "DOCX_DUPLICATE_NUMBERING_ID"
            : "DOCX_INVALID_NUMBERING_VALUE",
          "Concrete numbering requires unique positive w:numId and a non-negative w:abstractNumId.",
          source(numberingPart, path)
        )
        continue
      }
      const overrides = new Map<
        number,
        Readonly<{
          startAt?: number
          level?: ParsedDocxNumberingLevelDefinition
        }>
      >()
      let overrideIndex = 0
      for (const overrideElement of children(current.element, "lvlOverride")) {
        overrideIndex += 1
        const overridePath = `${path}/${overrideElement.name}[${overrideIndex}]`
        const overrideLevel = integer(attr(overrideElement.element, "ilvl"))
        const startOverrideElement = child(
          overrideElement.element,
          "startOverride"
        )?.element
        const rawStartOverride = attr(startOverrideElement, "val")
        const startOverride = integer(rawStartOverride)
        const replacementElement = child(overrideElement.element, "lvl")
        const replacement =
          replacementElement === undefined
            ? undefined
            : parseNumberingLevel(
                replacementElement.element,
                numberingPart,
                `${overridePath}/${replacementElement.name}[1]`,
                diagnostics
              )
        if (
          overrideLevel === undefined ||
          overrideLevel < 0 ||
          overrideLevel > 8 ||
          (rawStartOverride !== undefined &&
            (startOverride === undefined || startOverride < 0)) ||
          (startOverride === undefined && replacementElement === undefined) ||
          (replacement !== undefined && replacement.level !== overrideLevel) ||
          overrides.has(overrideLevel)
        ) {
          reportNumberingProblem(
            diagnostics,
            overrides.has(overrideLevel ?? -1)
              ? "DOCX_DUPLICATE_NUMBERING_LEVEL"
              : "DOCX_INVALID_NUMBERING_VALUE",
            "A level override requires a unique level 0 through 8 and a valid startOverride or matching replacement level.",
            source(numberingPart, overridePath)
          )
        } else {
          overrides.set(overrideLevel, {
            ...(startOverride === undefined ? {} : { startAt: startOverride }),
            ...(replacement === undefined ? {} : { level: replacement }),
          })
        }
      }
      instances.push({ numId, abstractId, overrides, path })
    }
  }
  return instances
    .sort((left, right) => left.numId - right.numId)
    .flatMap((instance) => {
      const abstract = abstracts.get(instance.abstractId)
      if (abstract === undefined) {
        reportNumberingProblem(
          diagnostics,
          "DOCX_MISSING_NUMBERING_REFERENCE",
          `Concrete numbering ${instance.numId} references missing abstract numbering ${instance.abstractId}.`,
          source(numberingPart, instance.path)
        )
        return []
      }
      for (const [level, override] of instance.overrides) {
        if (!abstract.levels.has(level) && override.level === undefined) {
          reportNumberingProblem(
            diagnostics,
            "DOCX_MISSING_NUMBERING_LEVEL",
            `Concrete numbering ${instance.numId} overrides missing level ${level}.`,
            source(numberingPart, instance.path)
          )
        }
      }
      return [
        {
          id: `docx-num-${instance.numId}`,
          levels: [
            ...new Set([
              ...abstract.levels.keys(),
              ...instance.overrides.keys(),
            ]),
          ]
            .sort((left, right) => left - right)
            .flatMap((levelNumber) => {
              const override = instance.overrides.get(levelNumber)
              const level = override?.level ?? abstract.levels.get(levelNumber)
              return level === undefined
                ? []
                : [
                    {
                      ...level,
                      startAt: override?.startAt ?? level.startAt,
                    },
                  ]
            }),
        },
      ]
    })
}

function parseStyleSheet(
  pkg: ValidatedDocxPackage,
  stylesPart: string | undefined,
  options: DocxParseOptions,
  diagnostics: ReturnType<typeof diagnostic>[]
): StyleSheet {
  if (stylesPart === undefined) return EMPTY_STYLE_SHEET
  const bytes = pkg.parts.get(stylesPart)
  const xml = bytes === undefined ? undefined : decodeXml(bytes)
  const root =
    xml === undefined
      ? undefined
      : parseXml(
          xml,
          options.limits?.maxXmlDepth ?? DEFAULT_RESOURCE_LIMITS.maxXmlDepth
        )
  if (root === undefined || localName(root.name) !== "styles") {
    diagnostics.push(
      diagnostic(
        "DOCX_INVALID_STYLES",
        "The styles part must have a styles root element.",
        "error",
        source(stylesPart, "/")
      )
    )
    return EMPTY_STYLE_SHEET
  }

  let paragraphDefaults: PartialParagraphProperties = {}
  let runDefaults: PartialRunProperties = {}
  let defaultParagraphStyleId: string | undefined
  let defaultCharacterStyleId: string | undefined
  const styles = new Map<string, ParsedStyle>()
  const tableStyles = new Map<string, ParsedTableStyle>()
  const rootCounts = new Map<string, number>()
  for (const current of childElements(root)) {
    const name = localName(current.name)
    const count = (rootCounts.get(name) ?? 0) + 1
    rootCounts.set(name, count)
    const currentPath = `/${root.name}[1]/${current.name}[${count}]`
    if (name === "docDefaults") {
      const pPr = child(
        child(current.element, "pPrDefault")?.element ?? current.element,
        "pPr"
      )?.element
      const rPr = child(
        child(current.element, "rPrDefault")?.element ?? current.element,
        "rPr"
      )?.element
      paragraphDefaults = parseParagraphProperties(
        pPr,
        stylesPart,
        `${currentPath}/w:pPrDefault[1]/w:pPr[1]`,
        diagnostics
      )
      runDefaults = parseRunProperties(
        rPr,
        stylesPart,
        `${currentPath}/w:rPrDefault[1]/w:rPr[1]`,
        diagnostics
      ).formatting
      for (const defaultChild of childElements(current.element)) {
        const defaultName = localName(defaultChild.name)
        if (defaultName !== "pPrDefault" && defaultName !== "rPrDefault") {
          reportFormattingProblem(
            diagnostics,
            "DOCX_UNSUPPORTED_STYLE_PROPERTY",
            `Document-default construct '${defaultChild.name}' is not supported.`,
            source(stylesPart, `${currentPath}/${defaultChild.name}[1]`)
          )
        }
      }
      continue
    }
    if (name === "latentStyles") continue
    if (name !== "style") {
      reportFormattingProblem(
        diagnostics,
        "DOCX_UNSUPPORTED_STYLE_PROPERTY",
        `Styles construct '${current.name}' is not supported.`,
        source(stylesPart, currentPath)
      )
      continue
    }
    const id = attr(current.element, "styleId")
    const type = attr(current.element, "type")
    if (id !== undefined && type === "table") {
      if (tableStyles.has(id)) {
        diagnostics.push(
          diagnostic(
            "DOCX_DUPLICATE_STYLE",
            `Table style '${id}' is defined more than once.`,
            "error",
            source(stylesPart, currentPath)
          )
        )
      } else {
        tableStyles.set(id, {
          id,
          basedOn: attr(child(current.element, "basedOn")?.element, "val"),
          element: current.element,
          source: source(stylesPart, currentPath),
        })
      }
      continue
    }
    if (id === undefined || (type !== "paragraph" && type !== "character")) {
      if (type !== "table" && type !== "numbering") {
        reportFormattingProblem(
          diagnostics,
          "DOCX_INVALID_STYLE_VALUE",
          `Style '${id ?? "<missing>"}' has an unsupported or missing type '${type ?? "<missing>"}'.`,
          source(stylesPart, currentPath)
        )
      }
      continue
    }
    if (styles.has(id)) {
      diagnostics.push(
        diagnostic(
          "DOCX_DUPLICATE_STYLE",
          `Style '${id}' is defined more than once.`,
          "error",
          source(stylesPart, currentPath)
        )
      )
      continue
    }
    const basedOnElement = child(current.element, "basedOn")?.element
    const style: ParsedStyle = {
      id,
      type,
      basedOn: attr(basedOnElement, "val"),
      basedOnSource:
        basedOnElement === undefined
          ? undefined
          : source(stylesPart, `${currentPath}/w:basedOn[1]`),
      paragraph: parseParagraphProperties(
        child(current.element, "pPr")?.element,
        stylesPart,
        `${currentPath}/w:pPr[1]`,
        diagnostics
      ),
      run: parseRunProperties(
        child(current.element, "rPr")?.element,
        stylesPart,
        `${currentPath}/w:rPr[1]`,
        diagnostics
      ).formatting,
      source: source(stylesPart, currentPath),
    }
    styles.set(id, style)
    const defaultValue = attr(current.element, "default")
    const isDefault =
      defaultValue !== undefined &&
      defaultValue !== "0" &&
      defaultValue !== "false" &&
      defaultValue !== "off"
    if (isDefault) {
      const existingDefault =
        type === "paragraph" ? defaultParagraphStyleId : defaultCharacterStyleId
      if (existingDefault !== undefined) {
        diagnostics.push(
          diagnostic(
            "DOCX_DUPLICATE_DEFAULT_STYLE",
            `Both '${existingDefault}' and '${id}' are marked as the default ${type} style.`,
            "error",
            source(stylesPart, currentPath)
          )
        )
      } else if (type === "paragraph") {
        defaultParagraphStyleId = id
      } else {
        defaultCharacterStyleId = id
      }
    }
    const metadata = new Set([
      "name",
      "aliases",
      "basedOn",
      "next",
      "link",
      "autoRedefine",
      "hidden",
      "uiPriority",
      "semiHidden",
      "unhideWhenUsed",
      "qFormat",
      "locked",
      "personal",
      "personalCompose",
      "personalReply",
      "rsid",
      "pPr",
      "rPr",
    ])
    validatePropertyChildren(
      current.element,
      metadata,
      stylesPart,
      currentPath,
      diagnostics
    )
  }
  return {
    paragraphDefaults,
    runDefaults,
    defaultParagraphStyleId,
    defaultCharacterStyleId,
    styles,
    tableStyles,
  }
}

function styleChain(
  styleId: string,
  expectedType: ParsedStyle["type"],
  sheet: StyleSheet,
  referenceSource: ReturnType<typeof source>,
  diagnostics: ReturnType<typeof diagnostic>[]
): readonly ParsedStyle[] {
  const chain: ParsedStyle[] = []
  const visiting = new Set<string>()
  const visit = (
    id: string,
    location: ReturnType<typeof source>,
    isParent = false
  ): boolean => {
    const style = sheet.styles.get(id)
    if (style === undefined) {
      diagnostics.push(
        diagnostic(
          isParent ? "DOCX_MISSING_STYLE_PARENT" : "DOCX_UNKNOWN_STYLE",
          isParent
            ? `Parent style '${id}' is referenced but is not defined.`
            : `Style '${id}' is referenced but is not defined.`,
          "error",
          location
        )
      )
      return false
    }
    if (style.type !== expectedType) {
      diagnostics.push(
        diagnostic(
          "DOCX_STYLE_TYPE_MISMATCH",
          `Style '${id}' is '${style.type}' but is used as a '${expectedType}' style.`,
          "error",
          location
        )
      )
      return false
    }
    if (visiting.has(id)) {
      diagnostics.push(
        diagnostic(
          "DOCX_STYLE_CYCLE",
          `Style inheritance contains a cycle at '${id}'.`,
          "error",
          style.source
        )
      )
      return false
    }
    if (chain.some((entry) => entry.id === id)) return true
    visiting.add(id)
    if (style.basedOn !== undefined) {
      visit(style.basedOn, style.basedOnSource ?? style.source, true)
    }
    visiting.delete(id)
    chain.push(style)
    return true
  }
  visit(styleId, referenceSource)
  return chain
}

function mergeParagraphStyles(
  initial: PartialParagraphProperties,
  chain: readonly ParsedStyle[]
): PartialParagraphProperties {
  const properties = { ...initial }
  for (const style of chain) Object.assign(properties, style.paragraph)
  return properties
}

function mergeRunStyles(
  initial: PartialRunProperties,
  chain: readonly ParsedStyle[]
): PartialRunProperties {
  const properties = { ...initial }
  for (const style of chain) Object.assign(properties, style.run)
  return properties
}

function completeParagraphProperties(
  properties: PartialParagraphProperties,
  numberingDefinitions: ReadonlyMap<string, ParsedDocxNumberingDefinition>,
  hasNumberingPart: boolean,
  location: ReturnType<typeof source>,
  diagnostics: ReturnType<typeof diagnostic>[]
): ParsedDocxParagraphProperties {
  const { numberingId, numberingLevel, ...formatting } = properties
  let numbering = null
  if (numberingId !== undefined && numberingId !== null) {
    const definitionId = `docx-num-${numberingId}`
    const definition = numberingDefinitions.get(definitionId)
    const level = numberingLevel ?? 0
    if (definition === undefined) {
      reportNumberingProblem(
        diagnostics,
        hasNumberingPart
          ? "DOCX_MISSING_NUMBERING_REFERENCE"
          : "DOCX_MISSING_NUMBERING_RELATIONSHIP",
        hasNumberingPart
          ? `Paragraph references undefined concrete numbering ${numberingId}.`
          : `Paragraph references concrete numbering ${numberingId}, but the main document has no numbering relationship.`,
        location
      )
    } else if (!definition.levels.some((entry) => entry.level === level)) {
      reportNumberingProblem(
        diagnostics,
        "DOCX_MISSING_NUMBERING_LEVEL",
        `Paragraph references undefined level ${level} in concrete numbering ${numberingId}.`,
        location
      )
    } else {
      numbering = { definitionId, level }
    }
  }
  return { ...DEFAULT_PARAGRAPH, ...formatting, numbering }
}

function completeRunProperties(
  properties: PartialRunProperties
): ParsedDocxRunProperties {
  const { bold, italic, ...direct } = properties
  return {
    ...DEFAULT_RUN,
    ...direct,
    fontWeight: bold === true ? 700 : 400,
    fontStyle: italic === true ? "italic" : "normal",
  }
}

function exactK3HorizontalRulePict(element: OrderedElement): boolean {
  if (element.name !== "w:pict") return false
  if (Object.keys(attributes(element)).length !== 0) return false
  const pictChildren = childElements(element)
  const rectangle = pictChildren[0]
  if (
    pictChildren.length !== 1 ||
    rectangle?.name !== "v:rect" ||
    childElements(rectangle.element).length !== 0
  )
    return false
  const expected: Readonly<Record<string, string>> = {
    style: "width:0.0pt;height:1.5pt",
    "o:hr": "t",
    "o:hrstd": "t",
    "o:hralign": "center",
    fillcolor: "#A0A0A0",
    stroked: "f",
  }
  const actual = attributes(rectangle.element)
  return (
    Object.keys(actual).length === Object.keys(expected).length &&
    Object.entries(expected).every(([name, value]) => actual[name] === value)
  )
}

/**
 * Recognizes only the two isolated Word VML rule paragraphs present in K3.
 * Empty runs and bookmark/proofing markers are harmless, but any other inline
 * content keeps the paragraph on the normal fail-closed pict path.
 */
function exactK3HorizontalRuleParagraphPictPath(
  element: OrderedElement,
  xmlPath: string
): string | undefined {
  let pictPath: string | undefined
  const paragraphCounts = new Map<string, number>()
  for (const paragraphChild of childElements(element)) {
    const childName = localName(paragraphChild.name)
    const childCount = (paragraphCounts.get(childName) ?? 0) + 1
    paragraphCounts.set(childName, childCount)
    if (
      childName === "pPr" ||
      childName === "bookmarkStart" ||
      childName === "bookmarkEnd" ||
      childName === "proofErr"
    )
      continue
    if (childName !== "r") return undefined
    const runPath = `${xmlPath}/${paragraphChild.name}[${childCount}]`
    const runCounts = new Map<string, number>()
    for (const runChild of childElements(paragraphChild.element)) {
      const runChildName = localName(runChild.name)
      const runChildCount = (runCounts.get(runChildName) ?? 0) + 1
      runCounts.set(runChildName, runChildCount)
      if (runChildName === "rPr") continue
      if (
        runChildName !== "pict" ||
        pictPath !== undefined ||
        !exactK3HorizontalRulePict(runChild.element)
      )
        return undefined
      pictPath = `${runPath}/${runChild.name}[${runChildCount}]`
    }
  }
  return pictPath
}

function parseRun(
  element: OrderedElement,
  part: string,
  xmlPath: string,
  options: DocxParseOptions,
  diagnostics: ReturnType<typeof diagnostic>[],
  sheet: StyleSheet,
  paragraphRunProperties: PartialRunProperties,
  media: MediaContext,
  fieldState: { current?: ComplexFieldState },
  tabStopsAvailable: boolean,
  pageBreaksAllowed: boolean,
  allowedHorizontalRulePictPath?: string
): ParsedDocxRun {
  const texts: ParsedDocxText[] = []
  const inlines: ParsedDocxInline[] = []
  let allRunText = ""
  const counts = new Map<string, number>()
  for (const current of childElements(element)) {
    const name = localName(current.name)
    const count = (counts.get(name) ?? 0) + 1
    counts.set(name, count)
    if (name === "t") {
      const parsedText: ParsedDocxText = {
        type: "docx-text",
        text: textContent(current.element),
        preserveSpace: attr(current.element, "space") === "preserve",
        source: source(part, `${xmlPath}/${current.name}[${count}]`),
      }
      allRunText += parsedText.text
      if (
        fieldState.current?.phase === "result" &&
        fieldState.current.field !== undefined
      ) {
        fieldState.current.field.displayText += parsedText.text
      } else {
        texts.push(parsedText)
        inlines.push(parsedText)
      }
    } else if (name === "br" || name === "cr") {
      const breakPath = `${xmlPath}/${current.name}[${count}]`
      const allowedAttributes =
        name === "br" ? new Set(["type", "clear"]) : new Set<string>()
      const unknownAttribute = Object.keys(attributes(current.element)).find(
        (attributeName) => !allowedAttributes.has(localName(attributeName))
      )
      const type =
        name === "cr"
          ? "textWrapping"
          : (attr(current.element, "type") ?? "textWrapping")
      const clear = attr(current.element, "clear")
      const supportedLine =
        type === "textWrapping" && (clear === undefined || clear === "none")
      const supportedPage =
        type === "page" && clear === undefined && pageBreaksAllowed
      const simpleElement =
        unknownAttribute === undefined &&
        childElements(current.element).length === 0
      if ((supportedLine || supportedPage) && simpleElement) {
        inlines.push({
          type: "docx-break",
          source: source(part, breakPath),
          kind: supportedPage ? "page" : "line",
        })
      } else {
        reportUnsupported(
          diagnostics,
          "DOCX_UNSUPPORTED_INLINE",
          unknownAttribute !== undefined
            ? `Break attribute '${unknownAttribute}' is not supported.`
            : childElements(current.element).length > 0
              ? "Break elements cannot contain child elements."
              : type === "page" && !pageBreaksAllowed
                ? "Manual page breaks are supported only in main-document body paragraphs."
                : `Break type '${type}' with clear '${clear ?? "<absent>"}' is outside the supported line/page-break profile.`,
          source(part, breakPath),
          options
        )
      }
    } else if (name === "tab") {
      const tabPath = `${xmlPath}/${current.name}[${count}]`
      const simpleElement =
        Object.keys(attributes(current.element)).length === 0 &&
        childElements(current.element).length === 0
      if (tabStopsAvailable && simpleElement) {
        inlines.push({ type: "docx-tab", source: source(part, tabPath) })
      } else {
        reportUnsupported(
          diagnostics,
          "DOCX_UNSUPPORTED_INLINE",
          !simpleElement
            ? "Word tab elements cannot contain attributes or child elements."
            : "A Word tab element requires at least one explicit supported paragraph tab stop.",
          source(part, tabPath),
          options
        )
      }
    } else if (name === "lastRenderedPageBreak") {
      const location = source(part, `${xmlPath}/${current.name}[${count}]`)
      if (
        !reportUnsupportedFallback(
          diagnostics,
          "Ignored Word's last-rendered-page-break pagination hint; this engine paginates from the supported document model.",
          location,
          options,
          "compatible",
          "lastRenderedPageBreak",
          "ignore-pagination-hint"
        )
      ) {
        reportUnsupported(
          diagnostics,
          "DOCX_UNSUPPORTED_INLINE",
          "Word's last-rendered-page-break pagination hint is not part of the strict supported profile.",
          location,
          options
        )
      }
    } else if (name === "softHyphen") {
      const location = source(part, `${xmlPath}/${current.name}[${count}]`)
      if (
        !reportUnsupportedFallback(
          diagnostics,
          "Replaced a discretionary soft-hyphen hint with an empty inline; surrounding text remains in source order.",
          location,
          options,
          "lenient",
          "softHyphen",
          "empty-inline"
        )
      ) {
        reportUnsupported(
          diagnostics,
          "DOCX_UNSUPPORTED_INLINE",
          "A discretionary soft hyphen is outside this mode's supported profile.",
          location,
          options
        )
      }
    } else if (name === "drawing") {
      const feature = unsupportedContentFeature(current.element)
      if (feature !== undefined) {
        reportUnsupported(
          diagnostics,
          "DOCX_UNSUPPORTED_INLINE",
          `Drawing content is outside the supported inline-image profile (${feature}).`,
          source(part, `${xmlPath}/${current.name}[${count}]`),
          options,
          feature
        )
      } else {
        const image = parseDrawing(
          current.element,
          part,
          `${xmlPath}/${current.name}[${count}]`,
          media,
          options,
          diagnostics
        )
        if (image !== undefined) inlines.push(image)
      }
    } else if (name === "fldChar") {
      const fieldType = attr(current.element, "fldCharType")
      if (fieldType === "begin") {
        if (fieldState.current !== undefined)
          reportFormattingProblem(
            diagnostics,
            "DOCX_INVALID_STYLE_VALUE",
            "Nested complex fields are not supported.",
            source(part, `${xmlPath}/${current.name}[${count}]`)
          )
        fieldState.current = {
          instruction: "",
          phase: "instruction",
          separatorSeen: false,
        }
      } else if (fieldType === "separate") {
        if (fieldState.current === undefined) {
          reportFormattingProblem(
            diagnostics,
            "DOCX_INVALID_STYLE_VALUE",
            "A complex field separator has no matching begin.",
            source(part, `${xmlPath}/${current.name}[${count}]`)
          )
        } else if (
          fieldState.current.separatorSeen ||
          fieldState.current.phase !== "instruction"
        ) {
          reportFormattingProblem(
            diagnostics,
            "DOCX_INVALID_STYLE_VALUE",
            "A complex field must contain exactly one separator.",
            source(part, `${xmlPath}/${current.name}[${count}]`)
          )
        } else {
          const kind = parsePageFieldInstruction(fieldState.current.instruction)
          if (kind === undefined) {
            reportFormattingProblem(
              diagnostics,
              "DOCX_UNSUPPORTED_STYLE_PROPERTY",
              "Only PAGE and NUMPAGES fields with decimal or no-op switches are supported.",
              source(part, `${xmlPath}/${current.name}[${count}]`)
            )
            fieldState.current.separatorSeen = true
            fieldState.current.phase = "result"
            continue
          }
          const parsedField = {
            type: "docx-page-field" as const,
            source: source(part, `${xmlPath}/${current.name}[${count}]`),
            field: kind,
            displayText: "",
          }
          fieldState.current.phase = "result"
          fieldState.current.separatorSeen = true
          fieldState.current.field = parsedField
          inlines.push(parsedField)
        }
      } else if (fieldType === "end") {
        if (fieldState.current === undefined) {
          reportFormattingProblem(
            diagnostics,
            "DOCX_INVALID_STYLE_VALUE",
            "A complex field end has no matching begin.",
            source(part, `${xmlPath}/${current.name}[${count}]`)
          )
        } else if (
          !fieldState.current.separatorSeen ||
          fieldState.current.phase !== "result"
        ) {
          reportFormattingProblem(
            diagnostics,
            "DOCX_INVALID_STYLE_VALUE",
            "A complex field end requires one preceding separator.",
            source(part, `${xmlPath}/${current.name}[${count}]`)
          )
        }
        fieldState.current = undefined
      } else {
        reportFormattingProblem(
          diagnostics,
          "DOCX_INVALID_STYLE_VALUE",
          "Field character type must be begin, separate, or end.",
          source(part, `${xmlPath}/${current.name}[${count}]`)
        )
      }
    } else if (name === "instrText") {
      if (fieldState.current?.phase !== "instruction") {
        reportFormattingProblem(
          diagnostics,
          "DOCX_INVALID_STYLE_VALUE",
          "Field instruction text must occur between begin and separate.",
          source(part, `${xmlPath}/${current.name}[${count}]`)
        )
      } else {
        fieldState.current.instruction += textContent(current.element)
      }
    } else if (
      name === "pict" &&
      allowedHorizontalRulePictPath === `${xmlPath}/${current.name}[${count}]`
    ) {
      // The paragraph owner materializes this isolated safe profile as a
      // semantic full-width block. It is intentionally not an inline glyph.
    } else if (name !== "rPr") {
      const feature = unsupportedContentFeature(current.element)
      reportUnsupported(
        diagnostics,
        "DOCX_UNSUPPORTED_INLINE",
        feature === undefined
          ? `Run child '${current.name}' is not supported.`
          : `Run child '${current.name}' contains unsupported ${feature}.`,
        source(part, `${xmlPath}/${current.name}[${count}]`),
        options,
        feature
      )
    }
  }
  const direct = parseRunProperties(
    child(element, "rPr")?.element,
    part,
    `${xmlPath}/w:rPr[1]`,
    diagnostics
  )
  let effective = paragraphRunProperties
  const characterStyleId = direct.styleId ?? sheet.defaultCharacterStyleId
  if (characterStyleId !== undefined) {
    effective = mergeRunStyles(
      effective,
      styleChain(
        characterStyleId,
        "character",
        sheet,
        source(part, `${xmlPath}/w:rPr[1]/w:rStyle[1]`),
        diagnostics
      )
    )
  }
  effective = { ...effective, ...direct.formatting }
  const cachedFieldText = allRunText || descendantText(element, "t")
  if (cachedFieldText.length > 0) {
    for (const inline of inlines) {
      if (
        inline.type === "docx-page-field" &&
        inline.displayText.length === 0
      ) {
        ;(inline as { displayText: string }).displayText = cachedFieldText
      }
    }
  }
  return {
    type: "docx-run",
    source: source(part, xmlPath),
    properties: completeRunProperties(effective),
    inlines,
    texts,
  }
}

function parsePageFieldInstruction(
  value: string | undefined
): "PAGE" | "NUMPAGES" | undefined {
  const tokens = value?.trim().match(/"[^"]*"|\S+/gu) ?? []
  const command = tokens.shift()?.toUpperCase()
  if (command !== "PAGE" && command !== "NUMPAGES") return undefined
  for (let index = 0; index < tokens.length; index += 2) {
    const switchName = tokens[index]?.toUpperCase()
    const argument = tokens[index + 1]?.replace(/^"|"$/gu, "").toUpperCase()
    if (!(
      (switchName === "\\*" &&
        (argument === "ARABIC" || argument === "MERGEFORMAT")) ||
      (switchName === "\\#" && argument === "0")
    )) {
      return undefined
    }
  }
  return command
}

function parseParagraph(
  element: OrderedElement,
  part: string,
  xmlPath: string,
  options: DocxParseOptions,
  diagnostics: ReturnType<typeof diagnostic>[],
  sheet: StyleSheet,
  numberingDefinitions: ReadonlyMap<string, ParsedDocxNumberingDefinition>,
  hasNumberingPart: boolean,
  media: MediaContext,
  pageBreaksAllowed: boolean,
  allowedHorizontalRulePictPath?: string
): ParsedDocxParagraph {
  const paragraphPropertiesElement = child(element, "pPr")?.element
  const paragraphPropertiesPath = `${xmlPath}/w:pPr[1]`
  const directParagraphProperties = parseParagraphProperties(
    paragraphPropertiesElement,
    part,
    paragraphPropertiesPath,
    diagnostics
  )
  const paragraphStyleId =
    attr(
      paragraphPropertiesElement === undefined
        ? undefined
        : child(paragraphPropertiesElement, "pStyle")?.element,
      "val"
    ) ?? sheet.defaultParagraphStyleId
  const paragraphStyleChain =
    paragraphStyleId === undefined
      ? []
      : styleChain(
          paragraphStyleId,
          "paragraph",
          sheet,
          source(part, `${paragraphPropertiesPath}/w:pStyle[1]`),
          diagnostics
        )
  const effectiveParagraphProperties = completeParagraphProperties(
    {
      ...mergeParagraphStyles(sheet.paragraphDefaults, paragraphStyleChain),
      ...directParagraphProperties,
    },
    numberingDefinitions,
    hasNumberingPart,
    source(part, paragraphPropertiesPath),
    diagnostics
  )
  const paragraphRunProperties = mergeRunStyles(
    sheet.runDefaults,
    paragraphStyleChain
  )
  const runs: ParsedDocxRun[] = []
  const fieldState: { current?: ComplexFieldState } = {}
  const paragraphCounts = new Map<string, number>()
  for (const paragraphChild of childElements(element)) {
    throwIfAborted(options.signal)
    const childName = localName(paragraphChild.name)
    const childCount = (paragraphCounts.get(childName) ?? 0) + 1
    paragraphCounts.set(childName, childCount)
    if (childName === "r") {
      runs.push(
        parseRun(
          paragraphChild.element,
          part,
          `${xmlPath}/${paragraphChild.name}[${childCount}]`,
          options,
          diagnostics,
          sheet,
          paragraphRunProperties,
          media,
          fieldState,
          effectiveParagraphProperties.tabStops.length > 0,
          pageBreaksAllowed,
          allowedHorizontalRulePictPath
        )
      )
    } else if (childName === "fldSimple") {
      const kind = parsePageFieldInstruction(
        attr(paragraphChild.element, "instr")
      )
      if (kind === undefined) {
        reportFormattingProblem(
          diagnostics,
          "DOCX_UNSUPPORTED_STYLE_PROPERTY",
          "Only PAGE and NUMPAGES simple fields are supported.",
          source(part, `${xmlPath}/${paragraphChild.name}[${childCount}]`)
        )
      } else {
        const displayText = children(paragraphChild.element, "r")
          .flatMap(({ element: run }) =>
            children(run, "t").map(({ element: text }) => textContent(text))
          )
          .join("")
        runs.push({
          type: "docx-run",
          source: source(
            part,
            `${xmlPath}/${paragraphChild.name}[${childCount}]`
          ),
          properties: completeRunProperties(paragraphRunProperties),
          inlines: [
            {
              type: "docx-page-field",
              field: kind,
              displayText,
              source: source(
                part,
                `${xmlPath}/${paragraphChild.name}[${childCount}]`
              ),
            },
          ],
          texts: [],
        })
      }
    } else if (
      childName !== "pPr" &&
      childName !== "bookmarkStart" &&
      childName !== "bookmarkEnd" &&
      childName !== "proofErr"
    ) {
      const feature = unsupportedContentFeature(paragraphChild.element)
      reportUnsupported(
        diagnostics,
        "DOCX_UNSUPPORTED_INLINE",
        feature === undefined
          ? `Paragraph child '${paragraphChild.name}' is not supported.`
          : `Paragraph child '${paragraphChild.name}' contains unsupported ${feature}.`,
        source(part, `${xmlPath}/${paragraphChild.name}[${childCount}]`),
        options,
        feature
      )
    }
  }
  if (fieldState.current !== undefined) {
    reportFormattingProblem(
      diagnostics,
      "DOCX_INVALID_STYLE_VALUE",
      "A complex field is missing its end marker.",
      source(part, xmlPath)
    )
  }
  return {
    type: "docx-paragraph",
    source: source(part, xmlPath),
    properties: effectiveParagraphProperties,
    runs,
  }
}

const EMPTY_TABLE_BORDERS: ParsedDocxTableBorders = Object.freeze({
  top: null,
  right: null,
  bottom: null,
  left: null,
  insideHorizontal: null,
  insideVertical: null,
})

const EMPTY_TABLE_CELL_BORDERS: ParsedDocxTableCellBorders = Object.freeze({
  top: null,
  right: null,
  bottom: null,
  left: null,
})

function singularTableChild(
  element: OrderedElement | undefined,
  name: string,
  part: string,
  xmlPath: string,
  diagnostics: ReturnType<typeof diagnostic>[]
): OrderedElement | undefined {
  if (element === undefined) return undefined
  const matches = children(element, name)
  if (matches.length > 1) {
    reportTableProblem(
      diagnostics,
      "DOCX_AMBIGUOUS_TABLE",
      `Table property '${name}' occurs more than once.`,
      source(part, `${xmlPath}/w:${name}[2]`)
    )
  }
  return matches[0]?.element
}

function validateTableChildren(
  element: OrderedElement | undefined,
  allowed: ReadonlySet<string>,
  part: string,
  xmlPath: string,
  diagnostics: ReturnType<typeof diagnostic>[]
): void {
  if (element === undefined) return
  const counts = new Map<string, number>()
  for (const current of childElements(element)) {
    const name = localName(current.name)
    const count = (counts.get(name) ?? 0) + 1
    counts.set(name, count)
    if (!allowed.has(name)) {
      reportTableProblem(
        diagnostics,
        "DOCX_UNSUPPORTED_TABLE_PROPERTY",
        `Table property '${current.name}' is not supported.`,
        source(part, `${xmlPath}/${current.name}[${count}]`)
      )
    }
  }
}

function validateTableAttributes(
  element: OrderedElement | undefined,
  allowed: ReadonlySet<string>,
  part: string,
  xmlPath: string,
  diagnostics: ReturnType<typeof diagnostic>[]
): void {
  if (element === undefined) return
  for (const name of Object.keys(attributes(element))) {
    if (!allowed.has(localName(name))) {
      reportTableProblem(
        diagnostics,
        "DOCX_UNSUPPORTED_TABLE_PROPERTY",
        `Table attribute '${name}' is not supported.`,
        source(part, `${xmlPath}/@${name}`)
      )
    }
  }
}

function tableStyleCompatibility(
  styleId: string,
  sheet: StyleSheet,
  seen = new Set<string>()
): Readonly<{ compatible: boolean; requiresDirectCellPadding: boolean }> {
  if (seen.has(styleId)) {
    return { compatible: false, requiresDirectCellPadding: false }
  }
  const style = sheet.tableStyles.get(styleId)
  if (style === undefined) {
    return { compatible: false, requiresDirectCellPadding: false }
  }
  const nextSeen = new Set(seen).add(styleId)
  const inherited =
    style.basedOn === undefined
      ? { compatible: true, requiresDirectCellPadding: false }
      : tableStyleCompatibility(style.basedOn, sheet, nextSeen)
  let compatible = inherited.compatible
  let requiresDirectCellPadding = inherited.requiresDirectCellPadding
  for (const current of childElements(style.element)) {
    const name = localName(current.name)
    if (name === "name" || name === "basedOn") continue
    if (name === "tblPr") {
      for (const property of childElements(current.element)) {
        const propertyName = localName(property.name)
        if (propertyName === "tblCellMar") {
          requiresDirectCellPadding = true
        } else if (
          propertyName !== "tblStyleRowBandSize" &&
          propertyName !== "tblStyleColBandSize"
        ) {
          compatible = false
        }
      }
      continue
    }
    if (name === "tblStylePr") {
      // Conditional formatting is a proven no-op only when its property
      // containers are empty. tblLook can then be retained as metadata.
      for (const property of childElements(current.element)) {
        if (
          Object.keys(attributes(property.element)).length > 0 ||
          childElements(property.element).length > 0
        ) {
          compatible = false
        }
      }
      continue
    }
    compatible = false
  }
  return { compatible, requiresDirectCellPadding }
}

function roundTableGridWidths(
  columns: readonly Readonly<{
    element: OrderedElement
    path: string
  }>[],
  part: string,
  diagnostics: ReturnType<typeof diagnostic>[]
): readonly number[] {
  const valid: Readonly<{ value: number }>[] = columns.flatMap(
    ({ element, path }) => {
      validateTableAttributes(element, new Set(["w"]), part, path, diagnostics)
      const value = nonNegativeDecimal(attr(element, "w"))
      if (
        value === undefined ||
        value <= 0 ||
        value > Number.MAX_SAFE_INTEGER
      ) {
        reportTableProblem(
          diagnostics,
          "DOCX_INVALID_TABLE_VALUE",
          "Each gridCol width must be a positive decimal twip value that rounds within the safe integer range.",
          source(part, path)
        )
        return []
      }
      return [{ value }]
    }
  )
  if (valid.length === 0) return []
  const rawTotal = valid.reduce((sum, column) => sum + column.value, 0)
  const roundedTotal = Math.round(rawTotal)
  const widths = valid.map((column) => Math.floor(column.value))
  const floorTotal = widths.reduce((sum, width) => sum + width, 0)
  if (
    !Number.isSafeInteger(roundedTotal) ||
    !Number.isSafeInteger(floorTotal)
  ) {
    reportTableProblem(
      diagnostics,
      "DOCX_INVALID_TABLE_VALUE",
      "The combined table-grid width exceeds the safe integer twip range.",
      source(part, columns[0]?.path ?? "/w:tblGrid[1]")
    )
    return []
  }
  const remainder = roundedTotal - floorTotal
  const allocationOrder = valid
    .map((column, index) => ({
      ...column,
      index,
    }))
    .sort(
      (left, right) =>
        right.value -
          Math.floor(right.value) -
          (left.value - Math.floor(left.value)) || left.index - right.index
    )
  for (let index = 0; index < remainder; index += 1) {
    const column = allocationOrder[index]
    if (column !== undefined)
      widths[column.index] = (widths[column.index] ?? 0) + 1
  }
  return widths
}

function parseTableWidth(
  element: OrderedElement | undefined,
  part: string,
  xmlPath: string,
  diagnostics: ReturnType<typeof diagnostic>[],
  allowAuto: boolean
): number | null | undefined {
  if (element === undefined) return undefined
  validateTableAttributes(
    element,
    new Set(["w", "type"]),
    part,
    xmlPath,
    diagnostics
  )
  const type = attr(element, "type") ?? "dxa"
  const rawWidth = attr(element, "w")
  if (
    allowAuto &&
    type === "auto" &&
    (rawWidth === undefined || rawWidth === "0")
  ) {
    return null
  }
  const width = roundedNonNegativeDecimal(rawWidth)
  if (type !== "dxa") {
    reportTableProblem(
      diagnostics,
      "DOCX_UNSUPPORTED_TABLE_PROPERTY",
      `Table width type '${type}' is not supported; use decimal twips ('dxa')${allowAuto ? " or auto" : ""}.`,
      source(part, xmlPath)
    )
    return undefined
  }
  if (width === undefined || width < 0) {
    reportTableProblem(
      diagnostics,
      "DOCX_INVALID_TABLE_VALUE",
      "Table width must be a non-negative decimal twip value that rounds within the safe integer range.",
      source(part, xmlPath)
    )
    return undefined
  }
  return width
}

function parseTableBorder(
  element: OrderedElement | undefined,
  part: string,
  xmlPath: string,
  diagnostics: ReturnType<typeof diagnostic>[]
): ParsedDocxTableBorder | null {
  if (element === undefined) return null
  validateTableAttributes(
    element,
    new Set(["val", "sz", "space", "color"]),
    part,
    xmlPath,
    diagnostics
  )
  const rawStyle = attr(element, "val") ?? "single"
  const style = rawStyle === "nil" ? "none" : rawStyle
  if (!["none", "single", "double", "dotted", "dashed"].includes(style)) {
    reportTableProblem(
      diagnostics,
      "DOCX_UNSUPPORTED_TABLE_PROPERTY",
      `Table border style '${rawStyle}' is not supported.`,
      source(part, xmlPath)
    )
    return null
  }
  const size = integer(attr(element, "sz") ?? "0")
  const space = integer(attr(element, "space") ?? "0")
  const rawColor = attr(element, "color") ?? "000000"
  const color = rawColor.toLowerCase() === "auto" ? "000000" : rawColor
  if (
    size === undefined ||
    size < 0 ||
    space === undefined ||
    space < 0 ||
    !Number.isSafeInteger(Math.round((size * 20) / 8)) ||
    !Number.isSafeInteger(space * 20) ||
    !/^[0-9a-f]{6}$/iu.test(color)
  ) {
    reportTableProblem(
      diagnostics,
      "DOCX_INVALID_TABLE_VALUE",
      "Table border size, spacing, or color is malformed.",
      source(part, xmlPath)
    )
    return null
  }
  return {
    style: style as ParsedDocxTableBorder["style"],
    color: color.toUpperCase(),
    size,
    space,
  }
}

function safeTableWidthSum(
  widths: readonly number[],
  part: string,
  xmlPath: string,
  diagnostics: ReturnType<typeof diagnostic>[]
): number | undefined {
  let sum = 0
  for (const width of widths) {
    sum += width
    if (!Number.isSafeInteger(sum)) {
      reportTableProblem(
        diagnostics,
        "DOCX_INVALID_TABLE_VALUE",
        "The combined table-grid width exceeds the safe integer twip range.",
        source(part, xmlPath)
      )
      return undefined
    }
  }
  return sum
}

function parseTableBorders(
  element: OrderedElement | undefined,
  part: string,
  xmlPath: string,
  diagnostics: ReturnType<typeof diagnostic>[]
): ParsedDocxTableBorders {
  if (element === undefined) return EMPTY_TABLE_BORDERS
  validateTableChildren(
    element,
    new Set(["top", "right", "bottom", "left", "insideH", "insideV"]),
    part,
    xmlPath,
    diagnostics
  )
  const borderElement = (name: string) =>
    singularTableChild(element, name, part, xmlPath, diagnostics)
  return {
    top: parseTableBorder(
      borderElement("top"),
      part,
      `${xmlPath}/w:top[1]`,
      diagnostics
    ),
    right: parseTableBorder(
      borderElement("right"),
      part,
      `${xmlPath}/w:right[1]`,
      diagnostics
    ),
    bottom: parseTableBorder(
      borderElement("bottom"),
      part,
      `${xmlPath}/w:bottom[1]`,
      diagnostics
    ),
    left: parseTableBorder(
      borderElement("left"),
      part,
      `${xmlPath}/w:left[1]`,
      diagnostics
    ),
    insideHorizontal: parseTableBorder(
      borderElement("insideH"),
      part,
      `${xmlPath}/w:insideH[1]`,
      diagnostics
    ),
    insideVertical: parseTableBorder(
      borderElement("insideV"),
      part,
      `${xmlPath}/w:insideV[1]`,
      diagnostics
    ),
  }
}

function parseTableCellBorders(
  element: OrderedElement | undefined,
  part: string,
  xmlPath: string,
  diagnostics: ReturnType<typeof diagnostic>[]
): ParsedDocxTableCellBorders {
  if (element === undefined) return EMPTY_TABLE_CELL_BORDERS
  validateTableChildren(
    element,
    new Set(["top", "right", "bottom", "left"]),
    part,
    xmlPath,
    diagnostics
  )
  const border = (name: "top" | "right" | "bottom" | "left") =>
    parseTableBorder(
      singularTableChild(element, name, part, xmlPath, diagnostics),
      part,
      `${xmlPath}/w:${name}[1]`,
      diagnostics
    )
  return {
    top: border("top"),
    right: border("right"),
    bottom: border("bottom"),
    left: border("left"),
  }
}

function tableBordersEqual(
  left: ParsedDocxTableBorder,
  right: ParsedDocxTableBorder
): boolean {
  return (
    left.style === right.style &&
    left.color === right.color &&
    left.size === right.size &&
    left.space === right.space
  )
}

function reportConflictingDirectCellBorders(
  rows: ParsedDocxTable["rows"],
  diagnostics: ReturnType<typeof diagnostic>[]
): void {
  const conflict = (
    first: ParsedDocxTableBorder | null,
    second: ParsedDocxTableBorder | null,
    location: ParsedDocxTableCell["source"]
  ): void => {
    if (first === null || second === null || tableBordersEqual(first, second))
      return
    reportTableProblem(
      diagnostics,
      "DOCX_AMBIGUOUS_TABLE",
      "Adjacent direct cell borders conflict on one shared table edge.",
      location
    )
  }
  for (const [rowIndex, row] of rows.entries()) {
    for (const [cellIndex, cell] of row.cells.entries()) {
      const previous = row.cells[cellIndex - 1]
      if (previous !== undefined)
        conflict(previous.borders.right, cell.borders.left, cell.source)
      const previousRow = rows[rowIndex - 1]
      if (previousRow === undefined || cell.verticalMerge === "continue")
        continue
      for (const above of previousRow.cells) {
        const overlaps =
          above.columnIndex < cell.columnIndex + cell.columnSpan &&
          cell.columnIndex < above.columnIndex + above.columnSpan
        if (overlaps)
          conflict(above.borders.bottom, cell.borders.top, cell.source)
      }
    }
  }
}

function parseCellPadding(
  element: OrderedElement | undefined,
  part: string,
  xmlPath: string,
  diagnostics: ReturnType<typeof diagnostic>[]
): { top: number; right: number; bottom: number; left: number } {
  const side = (logical: string, legacy?: string): number => {
    const logicalElement =
      element === undefined
        ? undefined
        : singularTableChild(element, logical, part, xmlPath, diagnostics)
    const legacyElement =
      legacy === undefined || element === undefined
        ? undefined
        : singularTableChild(element, legacy, part, xmlPath, diagnostics)
    if (logicalElement !== undefined && legacyElement !== undefined) {
      reportTableProblem(
        diagnostics,
        "DOCX_AMBIGUOUS_TABLE",
        `Cell padding defines both '${logical}' and legacy '${legacy}'.`,
        source(part, xmlPath)
      )
    }
    const selectedName =
      logicalElement !== undefined
        ? logical
        : legacyElement !== undefined && legacy !== undefined
          ? legacy
          : logical
    const defaultWidth = logical === "start" || logical === "end" ? 115 : 0
    return (
      parseTableWidth(
        logicalElement ?? legacyElement,
        part,
        `${xmlPath}/w:${selectedName}[1]`,
        diagnostics,
        false
      ) ?? defaultWidth
    )
  }
  if (element !== undefined) {
    validateTableChildren(
      element,
      new Set(["top", "start", "bottom", "end", "left", "right"]),
      part,
      xmlPath,
      diagnostics
    )
  }
  return {
    top: side("top"),
    right: side("end", "right"),
    bottom: side("bottom"),
    left: side("start", "left"),
  }
}

function parseDirectCellPadding(
  element: OrderedElement | undefined,
  part: string,
  xmlPath: string,
  diagnostics: ReturnType<typeof diagnostic>[]
): { top: number; right: number; bottom: number; left: number } | undefined {
  if (element === undefined) return undefined
  validateTableChildren(
    element,
    new Set(["top", "start", "bottom", "end", "left", "right"]),
    part,
    xmlPath,
    diagnostics
  )
  const end = singularTableChild(element, "end", part, xmlPath, diagnostics)
  const right = singularTableChild(element, "right", part, xmlPath, diagnostics)
  const start = singularTableChild(element, "start", part, xmlPath, diagnostics)
  const left = singularTableChild(element, "left", part, xmlPath, diagnostics)
  if (
    (end !== undefined && right !== undefined) ||
    (start !== undefined && left !== undefined)
  ) {
    reportTableProblem(
      diagnostics,
      "DOCX_AMBIGUOUS_TABLE",
      "Direct cell margins cannot define both logical and legacy values for the same side.",
      source(part, xmlPath)
    )
  }
  const selected = {
    top: singularTableChild(element, "top", part, xmlPath, diagnostics),
    right: end ?? right,
    bottom: singularTableChild(element, "bottom", part, xmlPath, diagnostics),
    left: start ?? left,
  }
  if (Object.values(selected).some((side) => side === undefined)) {
    reportTableProblem(
      diagnostics,
      "DOCX_UNSUPPORTED_TABLE_PROPERTY",
      "Direct cell margins must specify all four sides because the semantic table model has one uniform padding value.",
      source(part, xmlPath)
    )
    return undefined
  }
  const parseSide = (name: keyof typeof selected): number | undefined =>
    parseTableWidth(
      selected[name],
      part,
      `${xmlPath}/w:${name}[1]`,
      diagnostics,
      false
    ) ?? undefined
  const padding = {
    top: parseSide("top"),
    right: parseSide("right"),
    bottom: parseSide("bottom"),
    left: parseSide("left"),
  }
  return Object.values(padding).some((side) => side === undefined)
    ? undefined
    : (padding as { top: number; right: number; bottom: number; left: number })
}

function parseTableBoolean(
  element: OrderedElement | undefined,
  part: string,
  xmlPath: string,
  diagnostics: ReturnType<typeof diagnostic>[]
): boolean | undefined {
  if (element === undefined) return undefined
  const rawValue = attr(element, "val")
  if (
    rawValue !== undefined &&
    !["0", "1", "true", "false", "on", "off"].includes(rawValue.toLowerCase())
  ) {
    reportTableProblem(
      diagnostics,
      "DOCX_INVALID_TABLE_VALUE",
      `Table boolean value '${rawValue}' is invalid.`,
      source(part, xmlPath)
    )
    return undefined
  }
  return booleanProperty(element)
}

function parseRowHeight(
  element: OrderedElement | undefined,
  part: string,
  xmlPath: string,
  diagnostics: ReturnType<typeof diagnostic>[]
): Readonly<{ rule: "exact" | "atLeast"; value: number }> | null {
  if (element === undefined) return null
  validateTableAttributes(
    element,
    new Set(["val", "hRule"]),
    part,
    xmlPath,
    diagnostics
  )
  const value = roundedNonNegativeDecimal(attr(element, "val"))
  const rawRule = attr(element, "hRule") ?? "auto"
  if (
    value === undefined ||
    value < 0 ||
    (rawRule !== "exact" && rawRule !== "atLeast")
  ) {
    reportTableProblem(
      diagnostics,
      rawRule === "auto"
        ? "DOCX_UNSUPPORTED_TABLE_PROPERTY"
        : "DOCX_INVALID_TABLE_VALUE",
      "Row height must use a non-negative decimal twip value that rounds within the safe integer range with hRule 'exact' or 'atLeast'.",
      source(part, xmlPath)
    )
    return null
  }
  return { rule: rawRule, value }
}

function parseCellFill(
  element: OrderedElement | undefined,
  part: string,
  xmlPath: string,
  diagnostics: ReturnType<typeof diagnostic>[]
): string | null {
  if (element === undefined) return null
  validateTableAttributes(
    element,
    new Set([
      "val",
      "fill",
      "color",
      "themeFill",
      "themeFillTint",
      "themeFillShade",
    ]),
    part,
    xmlPath,
    diagnostics
  )
  const pattern = attr(element, "val") ?? "clear"
  const foreground = attr(element, "color") ?? "auto"
  const fill = attr(element, "fill")
  const themeFill = attr(element, "themeFill")
  const themeTint = attr(element, "themeFillTint")
  const themeShade = attr(element, "themeFillShade")
  if (
    themeFill !== undefined ||
    themeTint !== undefined ||
    themeShade !== undefined
  ) {
    reportTableProblem(
      diagnostics,
      "DOCX_UNSUPPORTED_TABLE_PROPERTY",
      `Theme cell shading '${themeFill ?? "<missing themeFill>"}' cannot be resolved without mapping the document theme.`,
      source(part, xmlPath)
    )
    return null
  }
  if (pattern !== "clear" || foreground.toLowerCase() !== "auto") {
    reportTableProblem(
      diagnostics,
      "DOCX_UNSUPPORTED_TABLE_PROPERTY",
      "Only clear-pattern cell shading with an automatic foreground color and explicit fill is supported.",
      source(part, xmlPath)
    )
    return null
  }
  if (fill === undefined || fill.toLowerCase() === "auto") return null
  if (!/^[0-9a-f]{6}$/iu.test(fill)) {
    reportTableProblem(
      diagnostics,
      "DOCX_INVALID_TABLE_VALUE",
      "Cell shading fill must be a six-digit RGB color.",
      source(part, xmlPath)
    )
    return null
  }
  return fill.toUpperCase()
}

function parseCellVerticalAlignment(
  element: OrderedElement | undefined,
  part: string,
  xmlPath: string,
  diagnostics: ReturnType<typeof diagnostic>[]
): "top" | "center" | "bottom" {
  if (element === undefined) return "top"
  validateTableAttributes(element, new Set(["val"]), part, xmlPath, diagnostics)
  const value = attr(element, "val")
  if (value === "top" || value === "center" || value === "bottom") {
    return value
  }
  reportTableProblem(
    diagnostics,
    "DOCX_INVALID_TABLE_VALUE",
    `Cell vertical alignment '${value ?? "<missing>"}' is invalid.`,
    source(part, xmlPath)
  )
  return "top"
}

function parseTable(
  element: OrderedElement,
  part: string,
  xmlPath: string,
  options: DocxParseOptions,
  diagnostics: ReturnType<typeof diagnostic>[],
  sheet: StyleSheet,
  numberingDefinitions: ReadonlyMap<string, ParsedDocxNumberingDefinition>,
  hasNumberingPart: boolean,
  media: MediaContext
): ParsedDocxTable | undefined {
  const tableProperties = singularTableChild(
    element,
    "tblPr",
    part,
    xmlPath,
    diagnostics
  )
  const tableGrid = singularTableChild(
    element,
    "tblGrid",
    part,
    xmlPath,
    diagnostics
  )
  if (tableGrid === undefined) {
    reportTableProblem(
      diagnostics,
      "DOCX_INVALID_TABLE",
      "A table must provide tblGrid so column widths are deterministic.",
      source(part, xmlPath)
    )
    return undefined
  }
  if (tableProperties !== undefined) {
    validateTableChildren(
      tableProperties,
      new Set([
        "tblStyle",
        "tblW",
        "jc",
        "tblLayout",
        "tblLook",
        "tblBorders",
        "tblCellMar",
      ]),
      part,
      `${xmlPath}/w:tblPr[1]`,
      diagnostics
    )
  }
  const propertiesPath = `${xmlPath}/w:tblPr[1]`
  const tableStyleElement = singularTableChild(
    tableProperties,
    "tblStyle",
    part,
    propertiesPath,
    diagnostics
  )
  validateTableAttributes(
    tableStyleElement,
    new Set(["val"]),
    part,
    `${propertiesPath}/w:tblStyle[1]`,
    diagnostics
  )
  const tableStyleId = attr(tableStyleElement, "val")
  const tableStyle =
    tableStyleId === undefined
      ? { compatible: true, requiresDirectCellPadding: false }
      : tableStyleCompatibility(tableStyleId, sheet)
  if (
    tableStyleElement !== undefined &&
    (tableStyleId === undefined || !tableStyle.compatible)
  ) {
    reportTableProblem(
      diagnostics,
      "DOCX_UNSUPPORTED_TABLE_PROPERTY",
      `Table style '${tableStyleId ?? "<missing>"}' is missing, cyclic, or contains visual formatting outside the bounded direct-formatting profile.`,
      source(part, `${propertiesPath}/w:tblStyle[1]`)
    )
  }
  const alignmentElement = singularTableChild(
    tableProperties,
    "jc",
    part,
    propertiesPath,
    diagnostics
  )
  validateTableAttributes(
    alignmentElement,
    new Set(["val"]),
    part,
    `${propertiesPath}/w:jc[1]`,
    diagnostics
  )
  const alignment = attr(alignmentElement, "val")
  if (
    alignmentElement !== undefined &&
    alignment !== "left" &&
    alignment !== "start"
  ) {
    reportTableProblem(
      diagnostics,
      "DOCX_UNSUPPORTED_TABLE_PROPERTY",
      `Table alignment '${alignment ?? "<missing>"}' is not supported by the semantic table model; only the default left/start alignment is a no-op.`,
      source(part, `${propertiesPath}/w:jc[1]`)
    )
  }
  const lookElement = singularTableChild(
    tableProperties,
    "tblLook",
    part,
    propertiesPath,
    diagnostics
  )
  validateTableAttributes(
    lookElement,
    new Set([
      "val",
      "firstRow",
      "lastRow",
      "firstColumn",
      "lastColumn",
      "noHBand",
      "noVBand",
    ]),
    part,
    `${propertiesPath}/w:tblLook[1]`,
    diagnostics
  )
  if (lookElement !== undefined && !tableStyle.compatible) {
    reportTableProblem(
      diagnostics,
      "DOCX_UNSUPPORTED_TABLE_PROPERTY",
      "tblLook cannot be applied because the referenced table style has unresolved conditional formatting.",
      source(part, `${propertiesPath}/w:tblLook[1]`)
    )
  }
  const gridColumns: { element: OrderedElement; path: string }[] = []
  const gridChanges: { element: OrderedElement; path: string }[] = []
  const gridCounts = new Map<string, number>()
  for (const gridChild of childElements(tableGrid)) {
    throwIfAborted(options.signal)
    const name = localName(gridChild.name)
    const count = (gridCounts.get(name) ?? 0) + 1
    gridCounts.set(name, count)
    const path = `${xmlPath}/w:tblGrid[1]/${gridChild.name}[${count}]`
    if (name === "tblGridChange") {
      gridChanges.push({ element: gridChild.element, path })
      continue
    }
    if (name !== "gridCol") {
      reportTableProblem(
        diagnostics,
        "DOCX_UNSUPPORTED_TABLE_PROPERTY",
        `Table grid child '${gridChild.name}' is not supported.`,
        source(part, path)
      )
      continue
    }
    gridColumns.push({ element: gridChild.element, path })
  }
  const columnWidths = [...roundTableGridWidths(gridColumns, part, diagnostics)]
  if (columnWidths.length === 0) {
    reportTableProblem(
      diagnostics,
      "DOCX_INVALID_TABLE",
      "A table grid must contain at least one valid gridCol.",
      source(part, `${xmlPath}/w:tblGrid[1]`)
    )
    return undefined
  }
  for (const change of gridChanges) {
    validateTableAttributes(
      change.element,
      new Set(["id"]),
      part,
      change.path,
      diagnostics
    )
    const archivedGrid = singularTableChild(
      change.element,
      "tblGrid",
      part,
      change.path,
      diagnostics
    )
    const archivedChildren =
      archivedGrid === undefined
        ? []
        : childElements(archivedGrid).map((entry, index) => ({
            element: entry.element,
            path: `${change.path}/w:tblGrid[1]/${entry.name}[${index + 1}]`,
            name: localName(entry.name),
          }))
    const archivedWidths = roundTableGridWidths(
      archivedChildren
        .filter((entry) => entry.name === "gridCol")
        .map(({ element, path }) => ({ element, path })),
      part,
      diagnostics
    )
    if (
      archivedGrid === undefined ||
      archivedChildren.some((entry) => entry.name !== "gridCol") ||
      archivedWidths.length !== columnWidths.length ||
      archivedWidths.some((width, index) => width !== columnWidths[index])
    ) {
      reportTableProblem(
        diagnostics,
        "DOCX_UNSUPPORTED_TABLE_PROPERTY",
        "tblGridChange is accepted only when its archived grid is equivalent to the current deterministic grid.",
        source(part, change.path)
      )
    }
  }
  const gridWidth = safeTableWidthSum(
    columnWidths,
    part,
    `${xmlPath}/w:tblGrid[1]`,
    diagnostics
  )
  if (gridWidth === undefined) return undefined
  const preferredWidth = parseTableWidth(
    singularTableChild(
      tableProperties,
      "tblW",
      part,
      propertiesPath,
      diagnostics
    ),
    part,
    `${propertiesPath}/w:tblW[1]`,
    diagnostics,
    true
  )
  if (
    preferredWidth !== undefined &&
    preferredWidth !== null &&
    preferredWidth !== gridWidth
  ) {
    reportTableProblem(
      diagnostics,
      "DOCX_AMBIGUOUS_TABLE",
      `Declared table width ${preferredWidth} does not match the deterministic table-grid width ${gridWidth}.`,
      source(part, `${propertiesPath}/w:tblW[1]`)
    )
    return undefined
  }
  const layoutElement = singularTableChild(
    tableProperties,
    "tblLayout",
    part,
    propertiesPath,
    diagnostics
  )
  const rawLayout = attr(layoutElement, "type") ?? "autofit"
  validateTableAttributes(
    layoutElement,
    new Set(["type"]),
    part,
    `${propertiesPath}/w:tblLayout[1]`,
    diagnostics
  )
  const layout =
    rawLayout === "fixed" || rawLayout === "autofit" ? rawLayout : "autofit"
  if (
    layoutElement !== undefined &&
    rawLayout !== "fixed" &&
    rawLayout !== "autofit"
  ) {
    reportTableProblem(
      diagnostics,
      "DOCX_INVALID_TABLE_VALUE",
      `Table layout '${rawLayout}' is invalid.`,
      source(part, `${propertiesPath}/w:tblLayout[1]`)
    )
  }
  const borders = parseTableBorders(
    singularTableChild(
      tableProperties,
      "tblBorders",
      part,
      propertiesPath,
      diagnostics
    ),
    part,
    `${propertiesPath}/w:tblBorders[1]`,
    diagnostics
  )
  let cellPadding = parseCellPadding(
    singularTableChild(
      tableProperties,
      "tblCellMar",
      part,
      propertiesPath,
      diagnostics
    ),
    part,
    `${propertiesPath}/w:tblCellMar[1]`,
    diagnostics
  )

  const rows: ParsedDocxTable["rows"][number][] = []
  const directCellPaddings: Readonly<{
    value: { top: number; right: number; bottom: number; left: number }
    path: string
  }>[] = []
  let cellCount = 0
  const tableCounts = new Map<string, number>()
  let sawNonHeader = false
  const activeVerticalMerges = new Map<
    number,
    Readonly<{ span: number; repeatAsHeader: boolean }>
  >()
  for (const tableChild of childElements(element)) {
    throwIfAborted(options.signal)
    const childName = localName(tableChild.name)
    const childCount = (tableCounts.get(childName) ?? 0) + 1
    tableCounts.set(childName, childCount)
    if (childName === "tblPr" || childName === "tblGrid") continue
    const rowPath = `${xmlPath}/${tableChild.name}[${childCount}]`
    if (childName !== "tr") {
      reportTableProblem(
        diagnostics,
        "DOCX_UNSUPPORTED_TABLE_PROPERTY",
        `Table child '${tableChild.name}' is not supported.`,
        source(part, rowPath)
      )
      continue
    }
    const rowProperties = singularTableChild(
      tableChild.element,
      "trPr",
      part,
      rowPath,
      diagnostics
    )
    if (rowProperties !== undefined) {
      validateTableChildren(
        rowProperties,
        new Set(["tblHeader", "cantSplit", "trHeight"]),
        part,
        `${rowPath}/w:trPr[1]`,
        diagnostics
      )
    }
    const headerElement = singularTableChild(
      rowProperties,
      "tblHeader",
      part,
      `${rowPath}/w:trPr[1]`,
      diagnostics
    )
    validateTableAttributes(
      headerElement,
      new Set(["val"]),
      part,
      `${rowPath}/w:trPr[1]/w:tblHeader[1]`,
      diagnostics
    )
    const cantSplitElement = singularTableChild(
      rowProperties,
      "cantSplit",
      part,
      `${rowPath}/w:trPr[1]`,
      diagnostics
    )
    const height = parseRowHeight(
      singularTableChild(
        rowProperties,
        "trHeight",
        part,
        `${rowPath}/w:trPr[1]`,
        diagnostics
      ),
      part,
      `${rowPath}/w:trPr[1]/w:trHeight[1]`,
      diagnostics
    )
    validateTableAttributes(
      cantSplitElement,
      new Set(["val"]),
      part,
      `${rowPath}/w:trPr[1]/w:cantSplit[1]`,
      diagnostics
    )
    const repeatAsHeader =
      parseTableBoolean(
        headerElement,
        part,
        `${rowPath}/w:trPr[1]/w:tblHeader[1]`,
        diagnostics
      ) ?? false
    if (repeatAsHeader && sawNonHeader) {
      reportTableProblem(
        diagnostics,
        "DOCX_AMBIGUOUS_TABLE",
        "Repeating table headers must be a contiguous set of leading rows.",
        source(part, `${rowPath}/w:trPr[1]/w:tblHeader[1]`)
      )
    }
    if (!repeatAsHeader) sawNonHeader = true
    const cells: ParsedDocxTable["rows"][number]["cells"][number][] = []
    const rowCounts = new Map<string, number>()
    let columnIndex = 0
    const continuedColumns = new Set<number>()
    for (const rowChild of childElements(tableChild.element)) {
      throwIfAborted(options.signal)
      const rowChildName = localName(rowChild.name)
      const rowChildCount = (rowCounts.get(rowChildName) ?? 0) + 1
      rowCounts.set(rowChildName, rowChildCount)
      if (rowChildName === "trPr") continue
      const cellPath = `${rowPath}/${rowChild.name}[${rowChildCount}]`
      if (rowChildName !== "tc") {
        reportTableProblem(
          diagnostics,
          "DOCX_UNSUPPORTED_TABLE_PROPERTY",
          `Table row child '${rowChild.name}' is not supported.`,
          source(part, cellPath)
        )
        continue
      }
      cellCount += 1
      const cellProperties = singularTableChild(
        rowChild.element,
        "tcPr",
        part,
        cellPath,
        diagnostics
      )
      if (cellProperties !== undefined) {
        validateTableChildren(
          cellProperties,
          new Set([
            "tcW",
            "gridSpan",
            "vMerge",
            "tcBorders",
            "shd",
            "tcMar",
            "vAlign",
          ]),
          part,
          `${cellPath}/w:tcPr[1]`,
          diagnostics
        )
      }
      const directPaddingPath = `${cellPath}/w:tcPr[1]/w:tcMar[1]`
      const directPadding = parseDirectCellPadding(
        singularTableChild(
          cellProperties,
          "tcMar",
          part,
          `${cellPath}/w:tcPr[1]`,
          diagnostics
        ),
        part,
        directPaddingPath,
        diagnostics
      )
      if (directPadding !== undefined) {
        directCellPaddings.push({
          value: directPadding,
          path: directPaddingPath,
        })
      }
      const directBordersPath = `${cellPath}/w:tcPr[1]/w:tcBorders[1]`
      const directBordersElement = singularTableChild(
        cellProperties,
        "tcBorders",
        part,
        `${cellPath}/w:tcPr[1]`,
        diagnostics
      )
      const directBorders = parseTableCellBorders(
        directBordersElement,
        part,
        directBordersPath,
        diagnostics
      )
      const spanElement = singularTableChild(
        cellProperties,
        "gridSpan",
        part,
        `${cellPath}/w:tcPr[1]`,
        diagnostics
      )
      const rawSpan = attr(spanElement, "val")
      validateTableAttributes(
        spanElement,
        new Set(["val"]),
        part,
        `${cellPath}/w:tcPr[1]/w:gridSpan[1]`,
        diagnostics
      )
      const parsedSpan = rawSpan === undefined ? 1 : integer(rawSpan)
      const columnSpan =
        parsedSpan !== undefined && parsedSpan > 0 ? parsedSpan : 1
      if (parsedSpan === undefined || parsedSpan <= 0) {
        reportTableProblem(
          diagnostics,
          "DOCX_INVALID_TABLE_VALUE",
          "gridSpan must be a positive safe integer.",
          source(part, `${cellPath}/w:tcPr[1]/w:gridSpan[1]`)
        )
      }
      if (columnIndex + columnSpan > columnWidths.length) {
        reportTableProblem(
          diagnostics,
          "DOCX_INVALID_TABLE",
          "A table cell spans beyond the declared table grid.",
          source(part, cellPath)
        )
      }
      const cellGridWidth =
        safeTableWidthSum(
          columnWidths.slice(columnIndex, columnIndex + columnSpan),
          part,
          cellPath,
          diagnostics
        ) ?? 0
      const cellPreferredWidth = parseTableWidth(
        singularTableChild(
          cellProperties,
          "tcW",
          part,
          `${cellPath}/w:tcPr[1]`,
          diagnostics
        ),
        part,
        `${cellPath}/w:tcPr[1]/w:tcW[1]`,
        diagnostics,
        true
      )
      const mergeElement = singularTableChild(
        cellProperties,
        "vMerge",
        part,
        `${cellPath}/w:tcPr[1]`,
        diagnostics
      )
      const rawMerge = attr(mergeElement, "val")
      validateTableAttributes(
        mergeElement,
        new Set(["val"]),
        part,
        `${cellPath}/w:tcPr[1]/w:vMerge[1]`,
        diagnostics
      )
      let verticalMerge: "none" | "restart" | "continue" = "none"
      if (mergeElement !== undefined) {
        if (rawMerge === undefined || rawMerge === "continue")
          verticalMerge = "continue"
        else if (rawMerge === "restart") verticalMerge = "restart"
        else {
          reportTableProblem(
            diagnostics,
            "DOCX_INVALID_TABLE_VALUE",
            `Vertical merge value '${rawMerge}' is invalid.`,
            source(part, `${cellPath}/w:tcPr[1]/w:vMerge[1]`)
          )
        }
      }
      if (verticalMerge === "continue") {
        const activeMerge = activeVerticalMerges.get(columnIndex)
        if (activeMerge?.span !== columnSpan) {
          reportTableProblem(
            diagnostics,
            "DOCX_AMBIGUOUS_TABLE",
            "A vertical-merge continuation has no matching restart in the previous row.",
            source(part, `${cellPath}/w:tcPr[1]/w:vMerge[1]`)
          )
        }
        if (
          activeMerge !== undefined &&
          activeMerge.repeatAsHeader !== repeatAsHeader
        ) {
          reportTableProblem(
            diagnostics,
            "DOCX_AMBIGUOUS_TABLE",
            "A vertical merge cannot cross the repeating-header and body-row boundary.",
            source(part, `${cellPath}/w:tcPr[1]/w:vMerge[1]`)
          )
        }
        for (
          let column = columnIndex;
          column < columnIndex + columnSpan;
          column += 1
        )
          continuedColumns.add(column)
      } else if (verticalMerge === "restart") {
        activeVerticalMerges.set(columnIndex, {
          span: columnSpan,
          repeatAsHeader,
        })
        for (
          let column = columnIndex;
          column < columnIndex + columnSpan;
          column += 1
        )
          continuedColumns.add(column)
      }
      const fillColor = parseCellFill(
        singularTableChild(
          cellProperties,
          "shd",
          part,
          `${cellPath}/w:tcPr[1]`,
          diagnostics
        ),
        part,
        `${cellPath}/w:tcPr[1]/w:shd[1]`,
        diagnostics
      )
      const verticalAlignment = parseCellVerticalAlignment(
        singularTableChild(
          cellProperties,
          "vAlign",
          part,
          `${cellPath}/w:tcPr[1]`,
          diagnostics
        ),
        part,
        `${cellPath}/w:tcPr[1]/w:vAlign[1]`,
        diagnostics
      )
      const paragraphs: ParsedDocxParagraph[] = []
      const cellCounts = new Map<string, number>()
      for (const cellChild of childElements(rowChild.element)) {
        throwIfAborted(options.signal)
        const cellChildName = localName(cellChild.name)
        const cellChildCount = (cellCounts.get(cellChildName) ?? 0) + 1
        cellCounts.set(cellChildName, cellChildCount)
        if (cellChildName === "tcPr") continue
        if (cellChildName === "p") {
          paragraphs.push(
            parseParagraph(
              cellChild.element,
              part,
              `${cellPath}/${cellChild.name}[${cellChildCount}]`,
              options,
              diagnostics,
              sheet,
              numberingDefinitions,
              hasNumberingPart,
              media,
              false
            )
          )
        } else {
          reportUnsupported(
            diagnostics,
            "DOCX_UNSUPPORTED_BLOCK",
            `Table cell child '${cellChild.name}' is not supported.`,
            source(part, `${cellPath}/${cellChild.name}[${cellChildCount}]`),
            options
          )
        }
      }
      if (paragraphs.length === 0) {
        reportTableProblem(
          diagnostics,
          "DOCX_INVALID_TABLE",
          "A table cell must contain at least one paragraph.",
          source(part, cellPath)
        )
      }
      cells.push({
        type: "docx-table-cell",
        source: source(part, cellPath),
        columnIndex,
        width: cellGridWidth,
        preferredWidth: cellPreferredWidth ?? null,
        columnSpan,
        verticalMerge,
        verticalAlignment,
        fillColor,
        borders: directBorders,
        paragraphs,
      })
      columnIndex += columnSpan
    }
    if (columnIndex !== columnWidths.length) {
      reportTableProblem(
        diagnostics,
        "DOCX_INVALID_TABLE",
        `Table row covers ${columnIndex} grid columns but the table declares ${columnWidths.length}.`,
        source(part, rowPath)
      )
    }
    for (const [start, activeMerge] of activeVerticalMerges) {
      let continued = true
      for (let column = start; column < start + activeMerge.span; column += 1) {
        if (!continuedColumns.has(column)) continued = false
      }
      if (!continued) activeVerticalMerges.delete(start)
    }
    rows.push({
      type: "docx-table-row",
      source: source(part, rowPath),
      repeatAsHeader,
      allowBreakAcrossPages: !(
        parseTableBoolean(
          cantSplitElement,
          part,
          `${rowPath}/w:trPr[1]/w:cantSplit[1]`,
          diagnostics
        ) ?? false
      ),
      height,
      cells,
    })
  }
  if (rows.length === 0) {
    reportTableProblem(
      diagnostics,
      "DOCX_INVALID_TABLE",
      "A table must contain at least one row.",
      source(part, xmlPath)
    )
    return undefined
  }
  reportConflictingDirectCellBorders(rows, diagnostics)
  if (directCellPaddings.length > 0) {
    const first = directCellPaddings[0]?.value
    const uniform = directCellPaddings.every(
      ({ value }) =>
        value.top === first?.top &&
        value.right === first.right &&
        value.bottom === first.bottom &&
        value.left === first.left
    )
    if (
      first === undefined ||
      directCellPaddings.length !== cellCount ||
      !uniform
    ) {
      reportTableProblem(
        diagnostics,
        "DOCX_UNSUPPORTED_TABLE_PROPERTY",
        "Direct cell margins can be mapped only when every cell specifies the same complete four-side padding.",
        source(part, directCellPaddings[0]?.path ?? xmlPath)
      )
    } else {
      cellPadding = first
    }
  }
  if (
    tableStyle.requiresDirectCellPadding &&
    directCellPaddings.length !== cellCount
  ) {
    reportTableProblem(
      diagnostics,
      "DOCX_UNSUPPORTED_TABLE_PROPERTY",
      `Table style '${tableStyleId ?? "<missing>"}' supplies inherited cell margins that are not fully overridden by direct cell margins.`,
      source(part, `${propertiesPath}/w:tblStyle[1]`)
    )
  }
  return {
    type: "docx-table",
    source: source(part, xmlPath),
    width: preferredWidth ?? gridWidth,
    preferredWidth: preferredWidth ?? null,
    layout,
    columnWidths,
    borders,
    cellPadding,
    repeatHeaderRowCount:
      rows.findIndex((row) => !row.repeatAsHeader) < 0
        ? rows.length
        : rows.findIndex((row) => !row.repeatAsHeader),
    rows,
  }
}

function parseSectionProperties(
  element: OrderedElement,
  part: string,
  xmlPath: string,
  diagnostics: ReturnType<typeof diagnostic>[],
  options: DocxParseOptions
): ParsedDocxSectionProperties {
  const pageSize = child(element, "pgSz")?.element
  const margins = child(element, "pgMar")?.element
  const sectionType = attr(child(element, "type")?.element, "val")
  if (sectionType !== undefined && sectionType !== "nextPage") {
    reportSectionProblem(
      diagnostics,
      "DOCX_UNSUPPORTED_SECTION_BREAK",
      `Section break type '${sectionType}' is unsupported; only nextPage is deterministic.`,
      source(part, `${xmlPath}/w:type[1]`)
    )
  }
  const columns = child(element, "cols")?.element
  const explicitColumnCount =
    columns === undefined ? 0 : children(columns, "col").length
  const declaredColumnCount = integer(attr(columns, "num"))
  if (
    columns !== undefined &&
    ((declaredColumnCount !== undefined && declaredColumnCount > 1) ||
      explicitColumnCount > 1)
  ) {
    reportUnsupported(
      diagnostics,
      "DOCX_UNSUPPORTED_STYLE_PROPERTY",
      "Multi-column sections are outside the supported single-column section profile.",
      source(part, `${xmlPath}/w:cols[1]`),
      options,
      "multiColumnSections"
    )
  }
  const width = integer(attr(pageSize, "w"))
  const height = integer(attr(pageSize, "h"))
  if (
    (width !== undefined && width <= 0) ||
    (height !== undefined && height <= 0)
  ) {
    reportFormattingProblem(
      diagnostics,
      "DOCX_INVALID_STYLE_VALUE",
      "Section page width and height must be positive integer twips.",
      source(part, xmlPath)
    )
  }
  const rawOrientation = attr(pageSize, "orient")
  const effectiveWidth =
    width !== undefined && width > 0 ? width : DEFAULT_SECTION.pageWidth
  const effectiveHeight =
    height !== undefined && height > 0 ? height : DEFAULT_SECTION.pageHeight
  const orientation =
    rawOrientation === "landscape" ||
    (rawOrientation === undefined && effectiveWidth > effectiveHeight)
      ? "landscape"
      : "portrait"
  if (
    rawOrientation !== undefined &&
    rawOrientation !== "portrait" &&
    rawOrientation !== "landscape"
  ) {
    reportFormattingProblem(
      diagnostics,
      "DOCX_INVALID_STYLE_VALUE",
      `Section orientation '${rawOrientation}' is invalid.`,
      source(part, xmlPath)
    )
  }
  if (
    rawOrientation !== undefined &&
    ((orientation === "landscape" && effectiveWidth <= effectiveHeight) ||
      (orientation === "portrait" && effectiveWidth > effectiveHeight))
  ) {
    reportFormattingProblem(
      diagnostics,
      "DOCX_INVALID_STYLE_VALUE",
      `Section ${orientation} orientation conflicts with page geometry ${effectiveWidth}x${effectiveHeight}.`,
      source(part, xmlPath)
    )
  }
  return {
    pageWidth: effectiveWidth,
    pageHeight: effectiveHeight,
    marginTop: nonNegativeInteger(
      attr(margins, "top"),
      DEFAULT_SECTION.marginTop
    ),
    marginRight: nonNegativeInteger(
      attr(margins, "right"),
      DEFAULT_SECTION.marginRight
    ),
    marginBottom: nonNegativeInteger(
      attr(margins, "bottom"),
      DEFAULT_SECTION.marginBottom
    ),
    marginLeft: nonNegativeInteger(
      attr(margins, "left"),
      DEFAULT_SECTION.marginLeft
    ),
    orientation,
    headerDistance: nonNegativeInteger(
      attr(margins, "header"),
      DEFAULT_SECTION.headerDistance
    ),
    footerDistance: nonNegativeInteger(
      attr(margins, "footer"),
      DEFAULT_SECTION.footerDistance
    ),
  }
}

function sectionReference(
  element: OrderedElement,
  kind: "header" | "footer",
  ownerPart: string,
  context: MediaContext,
  xmlPath: string,
  diagnostics: ReturnType<typeof diagnostic>[]
): string | null | undefined {
  const references = children(element, `${kind}Reference`)
  const defaults = references.filter(
    ({ element: reference }) =>
      (attr(reference, "type") ?? "default") === "default"
  )
  const unsupported = references.filter(
    ({ element: reference }) =>
      (attr(reference, "type") ?? "default") !== "default"
  )
  for (const _reference of unsupported) {
    reportFormattingProblem(
      diagnostics,
      "DOCX_UNSUPPORTED_STYLE_PROPERTY",
      `Only default ${kind} references are supported.`,
      source(ownerPart, xmlPath)
    )
  }
  if (defaults.length > 1) {
    reportFormattingProblem(
      diagnostics,
      "DOCX_INVALID_STYLE_VALUE",
      `A section has duplicate default ${kind} references.`,
      source(ownerPart, xmlPath)
    )
    return null
  }
  const reference = defaults[0]?.element
  if (reference === undefined) return undefined
  const relationshipId = attr(reference, "id")
  const relationship =
    relationshipId === undefined
      ? undefined
      : context.relationships.get(ownerPart)?.get(relationshipId)
  const expectedTypes = new Set([
    `http://schemas.openxmlformats.org/officeDocument/2006/relationships/${kind}`,
    `http://purl.oclc.org/ooxml/officeDocument/relationships/${kind}`,
  ])
  if (
    relationship === undefined ||
    !expectedTypes.has(relationship.type) ||
    relationship.external
  ) {
    reportFormattingProblem(
      diagnostics,
      "DOCX_INVALID_STYLE_VALUE",
      `Default ${kind} reference does not resolve through an internal owner-relative ${kind} relationship.`,
      source(ownerPart, xmlPath)
    )
    return null
  }
  const target = resolveTarget(ownerPart, relationship.target)
  if (target === undefined || !context.pkg.parts.has(target)) {
    reportFormattingProblem(
      diagnostics,
      "DOCX_INVALID_STYLE_VALUE",
      `Default ${kind} relationship targets a missing or unsafe package part.`,
      source(ownerPart, xmlPath)
    )
    return null
  }
  return `docx:${kind}:${target}`
}

function parseHeaderFooterPart(
  id: string,
  context: MediaContext,
  options: DocxParseOptions,
  diagnostics: ReturnType<typeof diagnostic>[],
  sheet: StyleSheet,
  numberingDefinitions: ReadonlyMap<string, ParsedDocxNumberingDefinition>,
  hasNumberingPart: boolean
): ParsedDocxHeaderFooter | undefined {
  const prefix = id.startsWith("docx:header:") ? "docx:header:" : "docx:footer:"
  const kind = prefix === "docx:header:" ? "header" : "footer"
  const part = id.slice(prefix.length)
  const bytes = context.pkg.parts.get(part)
  const xml = bytes === undefined ? undefined : decodeXml(bytes)
  const root =
    xml === undefined
      ? undefined
      : parseXml(
          xml,
          options.limits?.maxXmlDepth ?? DEFAULT_RESOURCE_LIMITS.maxXmlDepth
        )
  if (
    root === undefined ||
    localName(root.name) !== (kind === "header" ? "hdr" : "ftr")
  ) {
    reportFormattingProblem(
      diagnostics,
      "DOCX_INVALID_STYLE_VALUE",
      `The ${kind} part '${part}' has an invalid root element.`,
      source(part, "/")
    )
    return undefined
  }
  const paragraphs: ParsedDocxParagraph[] = []
  const counts = new Map<string, number>()
  for (const current of childElements(root)) {
    const name = localName(current.name)
    const count = (counts.get(name) ?? 0) + 1
    counts.set(name, count)
    const path = `/${root.name}[1]/${current.name}[${count}]`
    if (name === "p") {
      paragraphs.push(
        parseParagraph(
          current.element,
          part,
          path,
          options,
          diagnostics,
          sheet,
          numberingDefinitions,
          hasNumberingPart,
          context,
          false
        )
      )
    } else {
      reportUnsupported(
        diagnostics,
        "DOCX_UNSUPPORTED_BLOCK",
        `${kind} child '${current.name}' is not supported.`,
        source(part, path),
        options
      )
    }
  }
  return {
    type: kind === "header" ? "docx-header" : "docx-footer",
    id,
    source: source(part, `/${root.name}[1]`),
    part,
    paragraphs,
  }
}

export function parseValidatedDocx(
  pkg: ValidatedDocxPackage,
  options: DocxParseOptions = {}
): ParseSuccess | ParseFailure {
  throwIfAborted(options.signal)
  const xmlDiagnostics = validateXmlParts(pkg, options)
  if (xmlDiagnostics.length > 0) {
    return { ok: false, diagnostics: xmlDiagnostics }
  }
  const contentTypesPart = pkg.parts.get("[Content_Types].xml")
  if (contentTypesPart === undefined) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          "DOCX_MISSING_REQUIRED_PART",
          "The DOCX package is missing required part '[Content_Types].xml'.",
          "error",
          source("[Content_Types].xml", "/")
        ),
      ],
    }
  }
  const contentTypesXml = decodeXml(contentTypesPart)
  const contentTypes =
    contentTypesXml === undefined
      ? undefined
      : parseXml(
          contentTypesXml,
          options.limits?.maxXmlDepth ?? DEFAULT_RESOURCE_LIMITS.maxXmlDepth
        )
  if (contentTypes === undefined || localName(contentTypes.name) !== "Types") {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          "DOCX_INVALID_CONTENT_TYPES",
          "The [Content_Types].xml part must have a Types root element.",
          "error",
          source("[Content_Types].xml", "/")
        ),
      ],
    }
  }
  const officeDocumentPart = resolveOfficeDocumentPart(pkg, options)
  if (!officeDocumentPart.ok) {
    return officeDocumentPart
  }
  const documentPart = pkg.parts.get(officeDocumentPart.value)
  if (documentPart === undefined) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          "DOCX_MISSING_REQUIRED_PART",
          "The officeDocument relationship does not resolve to a package part.",
          "error",
          source("_rels/.rels", "/Relationships/Relationship[1]")
        ),
      ],
    }
  }
  const documentXml = decodeXml(documentPart)
  const root =
    documentXml === undefined
      ? undefined
      : parseXml(
          documentXml,
          options.limits?.maxXmlDepth ?? DEFAULT_RESOURCE_LIMITS.maxXmlDepth
        )
  if (root === undefined || localName(root.name) !== "document") {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          "DOCX_INVALID_DOCUMENT",
          "The officeDocument part must have a document root element.",
          "error",
          source(officeDocumentPart.value, "/")
        ),
      ],
    }
  }
  const body = child(root, "body")
  if (body === undefined) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          "DOCX_INVALID_DOCUMENT",
          "The Word document has no body element.",
          "error",
          source(officeDocumentPart.value, `/${root.name}[1]`)
        ),
      ],
    }
  }

  const diagnostics: ReturnType<typeof diagnostic>[] = []
  const media: MediaContext = {
    pkg,
    relationships: new Map(),
    contentTypes: parseContentTypeMap(contentTypes),
    assets: new Map(),
    imageBytes: 0,
  }
  media.relationships = buildOwnerRelationships(pkg, options, diagnostics)
  const stylesPart = resolveStylesPart(pkg, officeDocumentPart.value, options)
  diagnostics.push(...stylesPart.diagnostics)
  const sheet = parseStyleSheet(pkg, stylesPart.part, options, diagnostics)
  const numberingPart = resolveNumberingPart(
    pkg,
    officeDocumentPart.value,
    options
  )
  diagnostics.push(...numberingPart.diagnostics)
  const numberingDefinitions = parseNumberingDefinitions(
    pkg,
    numberingPart.part,
    options,
    diagnostics
  )
  const numberingDefinitionsById = new Map(
    numberingDefinitions.map((definition) => [definition.id, definition])
  )
  for (const style of sheet.styles.values()) {
    styleChain(style.id, style.type, sheet, style.source, diagnostics)
  }
  const blocks: ParsedDocxDocument["blocks"][number][] = []
  const paragraphs: ParsedDocxParagraph[] = []
  const sections: ParsedDocxDocument["sections"][number][] = []
  let sectionBlocks: ParsedDocxDocument["blocks"][number][] = []
  let inheritedHeaderId: string | null = null
  let inheritedFooterId: string | null = null
  let sectionProperties = DEFAULT_SECTION
  const bodyPath = `/${root.name}[1]/${body.name}[1]`
  const counts = new Map<string, number>()
  let sawBodySectionProperties = false
  for (const current of childElements(body.element)) {
    throwIfAborted(options.signal)
    const name = localName(current.name)
    const count = (counts.get(name) ?? 0) + 1
    counts.set(name, count)
    const currentPath = `${bodyPath}/${current.name}[${count}]`
    if (sawBodySectionProperties) {
      reportSectionProblem(
        diagnostics,
        "DOCX_INVALID_SECTION_STRUCTURE",
        name === "sectPr"
          ? "The document body must contain at most one body-level sectPr."
          : "The body-level sectPr must be the final document-body child.",
        source(officeDocumentPart.value, currentPath)
      )
    }
    if (name === "p") {
      const horizontalRulePictPath = exactK3HorizontalRuleParagraphPictPath(
        current.element,
        currentPath
      )
      const paragraph = parseParagraph(
        current.element,
        officeDocumentPart.value,
        currentPath,
        options,
        diagnostics,
        sheet,
        numberingDefinitionsById,
        numberingPart.part !== undefined,
        media,
        true,
        horizontalRulePictPath
      )
      if (horizontalRulePictPath === undefined) {
        paragraphs.push(paragraph)
        blocks.push(paragraph)
        sectionBlocks.push(paragraph)
      } else {
        const horizontalRule: ParsedDocxHorizontalRule = {
          type: "docx-horizontal-rule",
          source: source(officeDocumentPart.value, horizontalRulePictPath),
          properties: paragraph.properties,
          heightTwips: 30,
          color: "A0A0A0",
        }
        blocks.push(horizontalRule)
        sectionBlocks.push(horizontalRule)
      }
      const paragraphSectionProperties = child(
        child(current.element, "pPr")?.element ?? current.element,
        "sectPr"
      )?.element
      if (paragraphSectionProperties !== undefined) {
        const headerReference = sectionReference(
          paragraphSectionProperties,
          "header",
          officeDocumentPart.value,
          media,
          `${currentPath}/w:pPr[1]/w:sectPr[1]`,
          diagnostics
        )
        const footerReference = sectionReference(
          paragraphSectionProperties,
          "footer",
          officeDocumentPart.value,
          media,
          `${currentPath}/w:pPr[1]/w:sectPr[1]`,
          diagnostics
        )
        if (headerReference !== undefined) inheritedHeaderId = headerReference
        if (footerReference !== undefined) inheritedFooterId = footerReference
        sectionProperties = parseSectionProperties(
          paragraphSectionProperties,
          officeDocumentPart.value,
          `${currentPath}/w:pPr[1]/w:sectPr[1]`,
          diagnostics,
          options
        )
        sections.push({
          type: "docx-section",
          source: source(
            officeDocumentPart.value,
            `${currentPath}/w:pPr[1]/w:sectPr[1]`
          ),
          properties: sectionProperties,
          defaultHeaderId: inheritedHeaderId,
          defaultFooterId: inheritedFooterId,
          blocks: sectionBlocks,
        })
        sectionBlocks = []
      }
    } else if (name === "tbl") {
      const table = parseTable(
        current.element,
        officeDocumentPart.value,
        currentPath,
        options,
        diagnostics,
        sheet,
        numberingDefinitionsById,
        numberingPart.part !== undefined,
        media
      )
      if (table !== undefined) {
        blocks.push(table)
        sectionBlocks.push(table)
      }
    } else if (name === "sectPr") {
      sawBodySectionProperties = true
      const headerReference = sectionReference(
        current.element,
        "header",
        officeDocumentPart.value,
        media,
        currentPath,
        diagnostics
      )
      const footerReference = sectionReference(
        current.element,
        "footer",
        officeDocumentPart.value,
        media,
        currentPath,
        diagnostics
      )
      if (headerReference !== undefined) inheritedHeaderId = headerReference
      if (footerReference !== undefined) inheritedFooterId = footerReference
      sectionProperties = parseSectionProperties(
        current.element,
        officeDocumentPart.value,
        currentPath,
        diagnostics,
        options
      )
      sections.push({
        type: "docx-section",
        source: source(officeDocumentPart.value, currentPath),
        properties: sectionProperties,
        defaultHeaderId: inheritedHeaderId,
        defaultFooterId: inheritedFooterId,
        blocks: sectionBlocks,
      })
      sectionBlocks = []
    } else {
      const feature = unsupportedContentFeature(current.element)
      reportUnsupported(
        diagnostics,
        "DOCX_UNSUPPORTED_BLOCK",
        feature === undefined
          ? `Document body child '${current.name}' is not supported.`
          : `Document body child '${current.name}' contains unsupported ${feature}.`,
        source(officeDocumentPart.value, currentPath),
        options,
        feature
      )
    }
  }
  if (sections.length === 0 || sectionBlocks.length > 0) {
    sections.push({
      type: "docx-section",
      source: source(officeDocumentPart.value, bodyPath),
      properties: sectionProperties,
      defaultHeaderId: inheritedHeaderId,
      defaultFooterId: inheritedFooterId,
      blocks: sectionBlocks,
    })
  }
  const referencedHeaderIds = [
    ...new Set(
      sections.flatMap((section) =>
        section.defaultHeaderId === null ? [] : [section.defaultHeaderId]
      )
    ),
  ]
  const referencedFooterIds = [
    ...new Set(
      sections.flatMap((section) =>
        section.defaultFooterId === null ? [] : [section.defaultFooterId]
      )
    ),
  ]
  const headers = referencedHeaderIds.flatMap((id) => {
    const parsed = parseHeaderFooterPart(
      id,
      media,
      options,
      diagnostics,
      sheet,
      numberingDefinitionsById,
      numberingPart.part !== undefined
    )
    return parsed === undefined ? [] : [parsed]
  })
  const footers = referencedFooterIds.flatMap((id) => {
    const parsed = parseHeaderFooterPart(
      id,
      media,
      options,
      diagnostics,
      sheet,
      numberingDefinitionsById,
      numberingPart.part !== undefined
    )
    return parsed === undefined ? [] : [parsed]
  })

  const document: ParsedDocxDocument = {
    type: "docx-document",
    source: source(officeDocumentPart.value, `/${root.name}[1]`),
    documentPart: officeDocumentPart.value,
    assets: [...media.assets.values()],
    headers,
    footers,
    numberingDefinitions,
    sections,
    blocks,
    paragraphs,
    sectionProperties,
  }
  return { ok: true, value: document, diagnostics }
}
