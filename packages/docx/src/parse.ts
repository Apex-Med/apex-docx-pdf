import { DEFAULT_RESOURCE_LIMITS, throwIfAborted } from "@apex-docx-pdf/core"
import { XMLParser, XMLValidator } from "fast-xml-parser"

import { diagnostic, source } from "./diagnostics"
import type {
  DocxParseOptions,
  ParsedDocxDocument,
  ParsedDocxNumberingDefinition,
  ParsedDocxNumberingLevelDefinition,
  ParsedDocxParagraph,
  ParsedDocxParagraphProperties,
  ParsedDocxRun,
  ParsedDocxRunProperties,
  ParsedDocxSectionProperties,
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
})
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
})
const DEFAULT_RUN: ParsedDocxRunProperties = Object.freeze({
  fontFamily: "Calibri",
  fontSizeHalfPoints: 22,
  fontWeight: 400,
  fontStyle: "normal",
  underline: false,
  color: "000000",
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

function resolveOfficeDocumentPart(
  pkg: ValidatedDocxPackage,
  options: DocxParseOptions
): { ok: true; value: string } | ParseFailure {
  const diagnostics: ReturnType<typeof diagnostic>[] = []
  const maxXmlDepth =
    options.limits?.maxXmlDepth ?? DEFAULT_RESOURCE_LIMITS.maxXmlDepth
  const OFFICE_DOCUMENT_RELATIONSHIP =
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
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
          relation.type === OFFICE_DOCUMENT_RELATIONSHIP
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
  const officeDocumentRelationships = rootRelationships.filter(
    (relationship) => relationship.type === OFFICE_DOCUMENT_RELATIONSHIP
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

function unsupportedSeverity(
  options: DocxParseOptions
): "error" | "warning" | "info" {
  switch (options.unsupportedFeatures ?? "strict") {
    case "compatible":
      return "warning"
    case "lenient":
      return "info"
    default:
      return "error"
  }
}

function reportUnsupported(
  diagnostics: ReturnType<typeof diagnostic>[],
  code: "DOCX_UNSUPPORTED_BLOCK" | "DOCX_UNSUPPORTED_INLINE",
  message: string,
  location: ReturnType<typeof source>,
  options: DocxParseOptions
): void {
  diagnostics.push(
    diagnostic(code, message, unsupportedSeverity(options), location)
  )
  diagnostics.push(
    diagnostic(
      "DOCX_CONTENT_LOSS",
      "Rendering cannot continue because meaningful DOCX content would be omitted.",
      "error",
      location
    )
  )
}

type PartialRunProperties = Readonly<{
  fontFamily?: string
  fontSizeHalfPoints?: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  color?: string
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

type StyleSheet = Readonly<{
  paragraphDefaults: PartialParagraphProperties
  runDefaults: PartialRunProperties
  defaultParagraphStyleId?: string
  defaultCharacterStyleId?: string
  styles: ReadonlyMap<string, ParsedStyle>
}>

const EMPTY_STYLE_SHEET: StyleSheet = Object.freeze({
  paragraphDefaults: Object.freeze({}),
  runDefaults: Object.freeze({}),
  defaultParagraphStyleId: undefined,
  defaultCharacterStyleId: undefined,
  styles: new Map(),
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
])
const RUN_PROPERTY_NAMES = new Set([
  "rStyle",
  "rFonts",
  "b",
  "i",
  "u",
  "color",
  "sz",
])

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
  const line = integer(attr(spacing, "line"))
  const lineRule = attr(spacing, "lineRule")
  let lineSpacing: PartialParagraphProperties["lineSpacing"]
  if (line !== undefined && line >= 0) {
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
  } else if (attr(spacing, "line") !== undefined || lineRule !== undefined) {
    reportFormattingProblem(
      diagnostics,
      "DOCX_INVALID_STYLE_VALUE",
      "Line spacing requires a non-negative integer w:line value.",
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
  const rawNumberingId = attr(child(numbering ?? element, "numId")?.element, "val")
  const numberingId = integer(rawNumberingId)
  const rawNumberingLevel = attr(child(numbering ?? element, "ilvl")?.element, "val")
  const numberingLevel = integer(rawNumberingLevel)
  if (rawNumberingId !== undefined && (numberingId === undefined || numberingId < 0)) {
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
      : { widowControl: booleanProperty(child(element, "widowControl")?.element) }),
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
      rFonts: new Set(["ascii", "hAnsi"]),
      b: new Set(["val"]),
      i: new Set(["val"]),
      u: new Set(["val"]),
      color: new Set(["val"]),
      sz: new Set(["val"]),
    },
    part,
    xmlPath,
    diagnostics
  )
  const fonts = child(element, "rFonts")?.element
  const fontFamily = attr(fonts, "ascii") ?? attr(fonts, "hAnsi")
  const color = attr(child(element, "color")?.element, "val")
  const size = integer(attr(child(element, "sz")?.element, "val"))
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
      ...(booleanProperty(child(element, "b")?.element) === undefined
        ? {}
        : { bold: booleanProperty(child(element, "b")?.element) }),
      ...(booleanProperty(child(element, "i")?.element) === undefined
        ? {}
        : { italic: booleanProperty(child(element, "i")?.element) }),
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
  const matches = relationships.filter(({ type }) => relationshipTypes.has(type))
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
  const indentation = child(child(element, "pPr")?.element ?? element, "ind")?.element
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
  if (indentStart !== undefined && indentLeft !== undefined && indentStart !== indentLeft) {
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
  if (rawLegal !== undefined && !["0", "1", "true", "false", "on", "off"].includes(rawLegal)) {
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
      restart === 0 ? null : restart === undefined ? (level === 0 ? null : level - 1) : restart - 1,
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
      : parseXml(xml, options.limits?.maxXmlDepth ?? DEFAULT_RESOURCE_LIMITS.maxXmlDepth)
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
      if (abstractId === undefined || abstractId < 0 || abstracts.has(abstractId)) {
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
      const abstractId = integer(attr(child(current.element, "abstractNumId")?.element, "val"))
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
        const startOverrideElement = child(overrideElement.element, "startOverride")?.element
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
      return [{
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
      }]
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

function parseRun(
  element: OrderedElement,
  part: string,
  xmlPath: string,
  options: DocxParseOptions,
  diagnostics: ReturnType<typeof diagnostic>[],
  sheet: StyleSheet,
  paragraphRunProperties: PartialRunProperties
): ParsedDocxRun {
  const texts: ParsedDocxText[] = []
  const counts = new Map<string, number>()
  for (const current of childElements(element)) {
    const name = localName(current.name)
    const count = (counts.get(name) ?? 0) + 1
    counts.set(name, count)
    if (name === "t") {
      texts.push({
        type: "docx-text",
        text: textContent(current.element),
        preserveSpace: attr(current.element, "space") === "preserve",
        source: source(part, `${xmlPath}/${current.name}[${count}]`),
      })
    } else if (name !== "rPr") {
      reportUnsupported(
        diagnostics,
        "DOCX_UNSUPPORTED_INLINE",
        `Run child '${current.name}' is not supported.`,
        source(part, `${xmlPath}/${current.name}[${count}]`),
        options
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
  return {
    type: "docx-run",
    source: source(part, xmlPath),
    properties: completeRunProperties(effective),
    texts,
  }
}

function parseSectionProperties(
  element: OrderedElement
): ParsedDocxSectionProperties {
  const pageSize = child(element, "pgSz")?.element
  const margins = child(element, "pgMar")?.element
  return {
    pageWidth: nonNegativeInteger(
      attr(pageSize, "w"),
      DEFAULT_SECTION.pageWidth
    ),
    pageHeight: nonNegativeInteger(
      attr(pageSize, "h"),
      DEFAULT_SECTION.pageHeight
    ),
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
  const paragraphs: ParsedDocxParagraph[] = []
  let sectionProperties = DEFAULT_SECTION
  const bodyPath = `/${root.name}[1]/${body.name}[1]`
  const counts = new Map<string, number>()
  for (const current of childElements(body.element)) {
    throwIfAborted(options.signal)
    const name = localName(current.name)
    const count = (counts.get(name) ?? 0) + 1
    counts.set(name, count)
    const currentPath = `${bodyPath}/${current.name}[${count}]`
    if (name === "p") {
      const paragraphPropertiesElement = child(current.element, "pPr")?.element
      const paragraphPropertiesPath = `${currentPath}/w:pPr[1]`
      const directParagraphProperties = parseParagraphProperties(
        paragraphPropertiesElement,
        officeDocumentPart.value,
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
              source(
                officeDocumentPart.value,
                `${paragraphPropertiesPath}/w:pStyle[1]`
              ),
              diagnostics
            )
      const effectiveParagraphProperties = completeParagraphProperties(
        {
          ...mergeParagraphStyles(sheet.paragraphDefaults, paragraphStyleChain),
          ...directParagraphProperties,
        },
        numberingDefinitionsById,
        numberingPart.part !== undefined,
        source(officeDocumentPart.value, paragraphPropertiesPath),
        diagnostics
      )
      const paragraphRunProperties = mergeRunStyles(
        sheet.runDefaults,
        paragraphStyleChain
      )
      const runs: ParsedDocxRun[] = []
      const paragraphCounts = new Map<string, number>()
      for (const paragraphChild of childElements(current.element)) {
        const childName = localName(paragraphChild.name)
        const childCount = (paragraphCounts.get(childName) ?? 0) + 1
        paragraphCounts.set(childName, childCount)
        if (childName === "r") {
          runs.push(
            parseRun(
              paragraphChild.element,
              officeDocumentPart.value,
              `${currentPath}/${paragraphChild.name}[${childCount}]`,
              options,
              diagnostics,
              sheet,
              paragraphRunProperties
            )
          )
        } else if (
          childName !== "pPr" &&
          childName !== "bookmarkStart" &&
          childName !== "bookmarkEnd" &&
          childName !== "proofErr"
        ) {
          reportUnsupported(
            diagnostics,
            "DOCX_UNSUPPORTED_INLINE",
            `Paragraph child '${paragraphChild.name}' is not supported.`,
            source(
              officeDocumentPart.value,
              `${currentPath}/${paragraphChild.name}[${childCount}]`
            ),
            options
          )
        }
      }
      paragraphs.push({
        type: "docx-paragraph",
        source: source(officeDocumentPart.value, currentPath),
        properties: effectiveParagraphProperties,
        runs,
      })
    } else if (name === "sectPr") {
      sectionProperties = parseSectionProperties(current.element)
    } else {
      reportUnsupported(
        diagnostics,
        "DOCX_UNSUPPORTED_BLOCK",
        `Document body child '${current.name}' is not supported.`,
        source(officeDocumentPart.value, currentPath),
        options
      )
    }
  }

  const document: ParsedDocxDocument = {
    type: "docx-document",
    source: source(officeDocumentPart.value, `/${root.name}[1]`),
    documentPart: officeDocumentPart.value,
    numberingDefinitions,
    paragraphs,
    sectionProperties,
  }
  return { ok: true, value: document, diagnostics }
}
