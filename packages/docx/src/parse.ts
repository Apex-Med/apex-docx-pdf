import { DEFAULT_RESOURCE_LIMITS, throwIfAborted } from "@apex-docx-pdf/core"
import { XMLParser, XMLValidator } from "fast-xml-parser"

import { diagnostic, source } from "./diagnostics"
import type {
  DocxParseOptions,
  ParsedDocxDocument,
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
  keepWithNext: false,
  keepLinesTogether: false,
  pageBreakBefore: false,
})
const DEFAULT_RUN: ParsedDocxRunProperties = Object.freeze({
  fontFamily: "Calibri",
  fontSizeHalfPoints: 22,
  bold: false,
  italic: false,
  underline: false,
  color: "000000",
})

function localName(name: string): string {
  const separator = name.indexOf(":")
  return separator < 0 ? name : name.slice(separator + 1)
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
  return Object.entries(attributes(element)).find(
    ([name]) => localName(name) === expectedLocalName
  )?.[1]
}

function textContent(element: OrderedElement): string {
  for (const node of element.children) {
    if (node !== null && typeof node === "object" && !Array.isArray(node)) {
      const value = (node as Record<string, unknown>)[XML_TEXT]
      if (typeof value === "string") return value
    }
  }
  return ""
}

function parseXml(xml: string): OrderedElement | undefined {
  const parsed = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributesGroupName: XML_ATTRIBUTES,
    attributeNamePrefix: "",
    trimValues: false,
    processEntities: true,
  }).parse(xml)
  return Array.isArray(parsed)
    ? parseElementNodes(parsed).find((element) => !element.name.startsWith("?"))
    : undefined
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
  for (const [part, bytes] of pkg.parts) {
    throwIfAborted(options.signal)
    if (!part.endsWith(".xml") && !part.endsWith(".rels")) {
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
    const tree = parseXml(xml)
    if (tree === undefined || xmlDepth(tree) > maxXmlDepth) {
      diagnostics.push(
        diagnostic(
          "DOCX_XML_DEPTH_LIMIT",
          `Part '${part}' exceeds the XML nesting limit of ${maxXmlDepth}.`,
          "error",
          source(part, "/")
        )
      )
    }
  }
  return diagnostics
}

function xmlDepth(element: OrderedElement): number {
  const nested = childElements(element)
  return nested.length === 0
    ? 1
    : 1 +
        Math.max(
          ...nested.map(({ element: childElement }) => xmlDepth(childElement))
        )
}

function relationshipPartTargets(
  xml: string
): readonly Readonly<{ target: string; external: boolean }>[] | undefined {
  const tree = parseXml(xml)
  if (tree === undefined) {
    return undefined
  }
  if (localName(tree.name) !== "Relationships") {
    return undefined
  }
  return children(tree, "Relationship").map(({ element }) => ({
    target: attr(element, "Target") ?? "",
    external: (attr(element, "TargetMode") ?? "").toLowerCase() === "external",
  }))
}

function resolveTarget(sourcePart: string, target: string): string | undefined {
  if (
    target.length === 0 ||
    target.startsWith("/") ||
    target.includes("\\") ||
    target.includes("\0")
  ) {
    return undefined
  }
  const base =
    sourcePart === "_rels/.rels" ? [] : sourcePart.split("/").slice(0, -1)
  for (const segment of target.split("/")) {
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
  pkg: ValidatedDocxPackage
): { ok: true; value: string } | ParseFailure {
  const diagnostics: ReturnType<typeof diagnostic>[] = []
  let officeDocumentPart: string | undefined
  for (const [part, bytes] of pkg.parts) {
    if (!part.endsWith(".rels")) {
      continue
    }
    const xml = decodeXml(bytes)
    if (xml === undefined) {
      continue
    }
    const relationships = relationshipPartTargets(xml)
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
    for (const relation of relationships) {
      if (relation.external) {
        diagnostics.push(
          diagnostic(
            "DOCX_EXTERNAL_RELATIONSHIP",
            `Relationship part '${part}' contains an external target.`,
            "error",
            source(part, "/Relationships")
          )
        )
      }
    }
  }
  if (diagnostics.length > 0) {
    return { ok: false, diagnostics }
  }

  const rootXml = decodeXml(pkg.parts.get("_rels/.rels")!)
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
  const rootRelationships = relationshipPartTargets(rootXml)
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
  const OFFICE_DOCUMENT_RELATIONSHIP =
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
  const root = parseXml(rootXml)!
  const officeDocumentRelationships = children(root, "Relationship").filter(
    ({ element }) => attr(element, "Type") === OFFICE_DOCUMENT_RELATIONSHIP
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
  officeDocumentPart = resolveTarget(
    "_rels/.rels",
    attr(officeDocumentRelationships[0]!.element, "Target") ?? ""
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

function booleanProperty(element: OrderedElement | undefined): boolean {
  if (element === undefined) {
    return false
  }
  const value = attr(element, "val")
  return value !== "0" && value !== "false" && value !== "off"
}

function nonNegativeInteger(
  value: string | undefined,
  fallback: number
): number {
  if (value === undefined || !/^\d+$/u.test(value)) {
    return fallback
  }
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : fallback
}

function parseParagraphProperties(
  element: OrderedElement | undefined
): ParsedDocxParagraphProperties {
  if (element === undefined) {
    return DEFAULT_PARAGRAPH
  }
  const alignmentValue = attr(child(element, "jc")?.element, "val")
  const alignment =
    alignmentValue === "center" ||
    alignmentValue === "right" ||
    alignmentValue === "both"
      ? alignmentValue === "both"
        ? "justify"
        : alignmentValue
      : "left"
  const spacing = child(element, "spacing")?.element
  return {
    alignment,
    spacingBefore: nonNegativeInteger(attr(spacing, "before"), 0),
    spacingAfter: nonNegativeInteger(attr(spacing, "after"), 0),
    lineSpacing:
      spacing === undefined
        ? null
        : nonNegativeInteger(attr(spacing, "line"), 0) || null,
    keepWithNext: booleanProperty(child(element, "keepNext")?.element),
    keepLinesTogether: booleanProperty(child(element, "keepLines")?.element),
    pageBreakBefore: booleanProperty(
      child(element, "pageBreakBefore")?.element
    ),
  }
}

function parseRunProperties(
  element: OrderedElement | undefined
): ParsedDocxRunProperties {
  if (element === undefined) {
    return DEFAULT_RUN
  }
  const fonts = child(element, "rFonts")?.element
  const fontFamily =
    attr(fonts, "ascii") ?? attr(fonts, "hAnsi") ?? DEFAULT_RUN.fontFamily
  const color =
    attr(child(element, "color")?.element, "val") ?? DEFAULT_RUN.color
  return {
    fontFamily,
    fontSizeHalfPoints: nonNegativeInteger(
      attr(child(element, "sz")?.element, "val"),
      DEFAULT_RUN.fontSizeHalfPoints
    ),
    bold: booleanProperty(child(element, "b")?.element),
    italic: booleanProperty(child(element, "i")?.element),
    underline: (attr(child(element, "u")?.element, "val") ?? "none") !== "none",
    color: /^[0-9a-f]{6}$/iu.test(color)
      ? color.toUpperCase()
      : DEFAULT_RUN.color,
  }
}

function parseRun(
  element: OrderedElement,
  part: string,
  xmlPath: string,
  options: DocxParseOptions,
  diagnostics: ReturnType<typeof diagnostic>[]
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
      diagnostics.push(
        diagnostic(
          "DOCX_UNSUPPORTED_INLINE",
          `Run child '${current.name}' is not supported.`,
          unsupportedSeverity(options),
          source(part, `${xmlPath}/${current.name}[${count}]`)
        )
      )
    }
  }
  return {
    type: "docx-run",
    source: source(part, xmlPath),
    properties: parseRunProperties(child(element, "rPr")?.element),
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
  const contentTypesXml = decodeXml(pkg.parts.get("[Content_Types].xml")!)
  const contentTypes =
    contentTypesXml === undefined ? undefined : parseXml(contentTypesXml)
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
  const officeDocumentPart = resolveOfficeDocumentPart(pkg)
  if (!officeDocumentPart.ok) {
    return officeDocumentPart
  }
  const documentXml = decodeXml(pkg.parts.get(officeDocumentPart.value)!)
  const root = documentXml === undefined ? undefined : parseXml(documentXml)
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
              diagnostics
            )
          )
        } else if (
          childName !== "pPr" &&
          childName !== "bookmarkStart" &&
          childName !== "bookmarkEnd" &&
          childName !== "proofErr"
        ) {
          diagnostics.push(
            diagnostic(
              "DOCX_UNSUPPORTED_INLINE",
              `Paragraph child '${paragraphChild.name}' is not supported.`,
              unsupportedSeverity(options),
              source(
                officeDocumentPart.value,
                `${currentPath}/${paragraphChild.name}[${childCount}]`
              )
            )
          )
        }
      }
      paragraphs.push({
        type: "docx-paragraph",
        source: source(officeDocumentPart.value, currentPath),
        properties: parseParagraphProperties(
          child(current.element, "pPr")?.element
        ),
        runs,
      })
    } else if (name === "sectPr") {
      sectionProperties = parseSectionProperties(current.element)
    } else {
      diagnostics.push(
        diagnostic(
          "DOCX_UNSUPPORTED_BLOCK",
          `Document body child '${current.name}' is not supported.`,
          unsupportedSeverity(options),
          source(officeDocumentPart.value, currentPath)
        )
      )
    }
  }

  const document: ParsedDocxDocument = {
    type: "docx-document",
    source: source(officeDocumentPart.value, `/${root.name}[1]`),
    documentPart: officeDocumentPart.value,
    paragraphs,
    sectionProperties,
  }
  return { ok: true, value: document, diagnostics }
}
