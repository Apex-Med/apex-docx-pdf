import { DEFAULT_RESOURCE_LIMITS, throwIfAborted } from "@apexmed/core"
import { XMLParser, XMLValidator } from "fast-xml-parser"

import { diagnostic, source } from "./diagnostics"
import type { DocxParseOptions } from "./types"

type ActiveContentKind =
  "vba" | "ole" | "activex" | "package" | "executable" | "active"

type Detection = Readonly<{
  kind: ActiveContentKind
  part: string
  xmlPath: string
  detail: string
}>

type XmlElement = Readonly<{
  name: string
  attributes: Readonly<Record<string, string>>
  children: readonly unknown[]
}>

const XML_ATTRIBUTES = ":@"
const XML_TEXT = "#text"

const ACTIVE_CONTENT_DIAGNOSTICS: Readonly<
  Record<ActiveContentKind, Readonly<{ code: string; label: string }>>
> = {
  vba: { code: "DOCX_FORBIDDEN_VBA", label: "VBA or macro content" },
  ole: { code: "DOCX_FORBIDDEN_OLE_OBJECT", label: "OLE embedded content" },
  activex: { code: "DOCX_FORBIDDEN_ACTIVEX", label: "ActiveX content" },
  package: {
    code: "DOCX_FORBIDDEN_ATTACHED_PACKAGE",
    label: "an attached package",
  },
  executable: {
    code: "DOCX_FORBIDDEN_EXECUTABLE_CONTENT",
    label: "executable content",
  },
  active: {
    code: "DOCX_FORBIDDEN_ACTIVE_CONTENT",
    label: "executable or active OOXML content",
  },
}

const DIAGNOSTIC_ORDER: readonly ActiveContentKind[] = [
  "vba",
  "ole",
  "activex",
  "package",
  "executable",
  "active",
]

const EXECUTABLE_EXTENSIONS = new Set([
  "bat",
  "chm",
  "class",
  "cmd",
  "com",
  "dll",
  "exe",
  "hta",
  "jar",
  "js",
  "jse",
  "lnk",
  "msi",
  "msp",
  "ps1",
  "reg",
  "scr",
  "sh",
  "vbe",
  "vbs",
  "wsf",
  "wsh",
])

function localName(name: string): string {
  const separator = name.indexOf(":")
  return separator < 0 ? name : name.slice(separator + 1)
}

function elements(nodes: readonly unknown[]): XmlElement[] {
  const result: XmlElement[] = []
  for (const node of nodes) {
    if (node === null || typeof node !== "object" || Array.isArray(node)) {
      continue
    }
    const record = node as Record<string, unknown>
    const rawAttributes = record[XML_ATTRIBUTES]
    const attributes =
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
        result.push({ name, attributes, children: value })
      }
    }
  }
  return result
}

function attribute(element: XmlElement, expectedName: string): string {
  const value =
    Object.entries(element.attributes).find(
      ([name]) => localName(name) === expectedName
    )?.[1] ?? ""
  return value
    .replace(/&(amp|apos|gt|lt|quot);/gu, (reference) => {
      const predefined: Readonly<Record<string, string>> = {
        "&amp;": "&",
        "&apos;": "'",
        "&gt;": ">",
        "&lt;": "<",
        "&quot;": '"',
      }
      return predefined[reference] ?? reference
    })
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

function parseBoundedXml(
  bytes: Uint8Array,
  options: DocxParseOptions
): XmlElement | undefined {
  const maxTextBytes =
    options.limits?.maxXmlTextBytes ?? DEFAULT_RESOURCE_LIMITS.maxXmlTextBytes
  const xml = decodeXml(bytes)
  if (
    xml === undefined ||
    new TextEncoder().encode(xml).byteLength > maxTextBytes ||
    /<!\s*(?:DOCTYPE|ENTITY)\b/iu.test(xml) ||
    XMLValidator.validate(xml) !== true
  ) {
    return undefined
  }
  try {
    const parsed = new XMLParser({
      preserveOrder: true,
      ignoreAttributes: false,
      attributesGroupName: XML_ATTRIBUTES,
      attributeNamePrefix: "",
      trimValues: false,
      processEntities: false,
      maxNestedTags:
        options.limits?.maxXmlDepth ?? DEFAULT_RESOURCE_LIMITS.maxXmlDepth,
    }).parse(xml)
    if (!Array.isArray(parsed)) return undefined
    const root = elements(parsed).find(
      (element) => !element.name.startsWith("?")
    )
    if (root === undefined) return undefined
    const maxNodes =
      options.limits?.maxXmlNodes ?? DEFAULT_RESOURCE_LIMITS.maxXmlNodes
    const pending = [root]
    let nodes = 0
    while (pending.length > 0) {
      throwIfAborted(options.signal)
      const current = pending.pop()
      if (current === undefined) break
      nodes += 1
      if (nodes > maxNodes) return undefined
      pending.push(...elements(current.children))
    }
    return root
  } catch {
    return undefined
  }
}

function classifyPartPath(part: string): ActiveContentKind | undefined {
  const path = part.toLowerCase()
  if (
    path.endsWith("/vbaproject.bin") ||
    path.endsWith("/vbadata.xml") ||
    path === "vbaproject.bin" ||
    path === "vbadata.xml"
  ) {
    return "vba"
  }
  if (path.startsWith("word/activex/") || path.includes("/activex/")) {
    return "activex"
  }
  if (path.startsWith("word/embeddings/") || path.includes("/embeddings/")) {
    return "ole"
  }
  const extension = path.slice(path.lastIndexOf(".") + 1)
  if (EXECUTABLE_EXTENSIONS.has(extension)) return "executable"
  if (
    path.startsWith("customui/") ||
    path.startsWith("word/webextensions/") ||
    path.startsWith("word/taskpanes/") ||
    path.endsWith("/attachedtoolbars.bin")
  ) {
    return "active"
  }
  return undefined
}

function classifyContentType(
  contentType: string
): ActiveContentKind | undefined {
  const value = contentType.trim().toLowerCase()
  if (
    value.includes("macroenabled") ||
    value.includes("ms-office.vbaproject") ||
    value.includes("ms-word.vbadata")
  ) {
    return "vba"
  }
  if (value.includes("activex") || value.includes("controlproperties")) {
    return "activex"
  }
  if (value.includes("officedocument.oleobject")) return "ole"
  if (
    value === "application/javascript" ||
    value === "text/javascript" ||
    value === "application/java-archive" ||
    value === "application/vnd.microsoft.portable-executable" ||
    value === "application/x-bat" ||
    value === "application/x-msdownload" ||
    value === "application/x-msdos-program" ||
    value === "application/x-powershell" ||
    value === "application/x-sh"
  ) {
    return "executable"
  }
  if (
    value.includes("customui") ||
    value.includes("webextension") ||
    value.includes("taskpane") ||
    value.includes("attachedtoolbars")
  ) {
    return "active"
  }
  return undefined
}

function classifyRelationshipType(type: string): ActiveContentKind | undefined {
  const value = type.trim().toLowerCase().replace(/\/+$/u, "")
  const finalSegment = value.slice(value.lastIndexOf("/") + 1)
  if (finalSegment === "vbaproject" || finalSegment === "vbadata") return "vba"
  if (finalSegment === "oleobject") return "ole"
  if (finalSegment === "control" || finalSegment === "activexcontrolbinary") {
    return "activex"
  }
  if (finalSegment === "package") return "package"
  if (
    finalSegment === "attachedtemplate" ||
    finalSegment === "attachedtoolbars" ||
    finalSegment === "customui" ||
    value.endsWith("/ui/extensibility") ||
    finalSegment === "webextension" ||
    finalSegment === "taskpanes" ||
    finalSegment === "afchunk"
  ) {
    return "active"
  }
  return undefined
}

function contentTypeDetections(part: string, root: XmlElement): Detection[] {
  if (localName(root.name) !== "Types") return []
  const detections: Detection[] = []
  let index = 0
  for (const element of elements(root.children)) {
    if (
      localName(element.name) !== "Default" &&
      localName(element.name) !== "Override"
    ) {
      continue
    }
    index += 1
    const contentType = attribute(element, "ContentType")
    const kind = classifyContentType(contentType)
    if (kind !== undefined) {
      detections.push({
        kind,
        part,
        xmlPath: `/Types/${localName(element.name)}[${index}]`,
        detail: `content type '${contentType}'`,
      })
    }
  }
  return detections
}

function relationshipDetections(part: string, root: XmlElement): Detection[] {
  if (localName(root.name) !== "Relationships") return []
  const detections: Detection[] = []
  let index = 0
  for (const element of elements(root.children)) {
    if (localName(element.name) !== "Relationship") continue
    index += 1
    const type = attribute(element, "Type")
    const kind = classifyRelationshipType(type)
    if (kind !== undefined) {
      detections.push({
        kind,
        part,
        xmlPath: `/Relationships/Relationship[${index}]`,
        detail: `relationship type '${type}'`,
      })
    }
  }
  return detections
}

/** Rejects executable and active package features before WordprocessingML parsing. */
export function activeContentDiagnostics(
  parts: ReadonlyMap<string, Uint8Array>,
  options: DocxParseOptions
): readonly ReturnType<typeof diagnostic>[] {
  const detections: Detection[] = []
  for (const part of [...parts.keys()].sort()) {
    throwIfAborted(options.signal)
    const kind = classifyPartPath(part)
    if (kind !== undefined) {
      detections.push({ kind, part, xmlPath: "/", detail: `part '${part}'` })
    }
  }

  const structuredParts = [...parts.entries()]
    .filter(
      ([part]) => part === "[Content_Types].xml" || part.endsWith(".rels")
    )
    .sort(([left], [right]) => left.localeCompare(right))
  for (const [part, bytes] of structuredParts) {
    throwIfAborted(options.signal)
    const root = parseBoundedXml(bytes, options)
    if (root === undefined) continue
    detections.push(
      ...(part === "[Content_Types].xml"
        ? contentTypeDetections(part, root)
        : relationshipDetections(part, root))
    )
  }

  const firstByKind = new Map<ActiveContentKind, Detection>()
  for (const detection of detections) {
    if (!firstByKind.has(detection.kind)) {
      firstByKind.set(detection.kind, detection)
    }
  }
  return DIAGNOSTIC_ORDER.flatMap((kind) => {
    const detection = firstByKind.get(kind)
    if (detection === undefined) return []
    const contract = ACTIVE_CONTENT_DIAGNOSTICS[kind]
    return [
      diagnostic(
        contract.code,
        `DOCX packages containing ${contract.label} are forbidden (${detection.detail}).`,
        "error",
        source(detection.part, detection.xmlPath)
      ),
    ]
  })
}
