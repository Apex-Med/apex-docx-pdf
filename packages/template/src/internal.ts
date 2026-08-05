import type {
  Diagnostic,
  FormatterReference,
  ResourceLimits,
  SemanticParagraph,
  SemanticTableRow,
  SemanticText,
  SourceLocation,
  TemplateFieldKind,
} from "@apex-docx-pdf/core"

export const RESERVED_PATH_SEGMENTS = new Set([
  "__proto__",
  "prototype",
  "constructor",
])
const PATH_SEGMENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/u

export type ParsedPlaceholder = Readonly<{
  raw: string
  path: string
  kind: TemplateFieldKind
  explicitKind: boolean
  formatters: readonly FormatterReference[]
  start: number
  end: number
  source: SourceLocation
  node: SemanticText
}>

export type BlockMarker = Readonly<{
  type: "if" | "else" | "endIf" | "each" | "endEach"
  path?: string
  raw: string
  source: SourceLocation
  node: SemanticText
}>

export type ParsedParagraph = Readonly<{
  placeholders: readonly ParsedPlaceholder[]
  diagnostics: readonly Diagnostic[]
}>

/** Non-text inlines occupy one logical position and split template syntax. */
export function inlineLogicalLength(
  inline: SemanticParagraph["children"][number]
): number {
  return inline.type === "text" ? inline.text.length : 1
}

export function templateDiagnostic(
  code: string,
  message: string,
  source: SourceLocation,
  node?: SemanticText
): Diagnostic {
  return {
    code,
    severity: "error",
    message,
    source,
    ...(node === undefined ? {} : { nodeId: node.id }),
  }
}

export function paragraphText(paragraph: SemanticParagraph): string {
  return paragraph.children
    .filter((child): child is SemanticText => child.type === "text")
    .map((child) => child.text)
    .join("")
}

function nodeAt(paragraph: SemanticParagraph, offset: number): SemanticText {
  let cursor = 0
  for (const child of paragraph.children) {
    if (child.type !== "text") {
      cursor += 1
      continue
    }
    const next = cursor + child.text.length
    if (offset < next || (child.text.length === 0 && offset === cursor)) {
      return child
    }
    cursor = next
  }
  let fallback: SemanticText | undefined
  for (const child of paragraph.children)
    if (child.type === "text") fallback = child
  if (fallback === undefined) {
    throw new TypeError("A template tag cannot exist in an empty paragraph")
  }
  return fallback
}

function validatePath(
  path: string,
  source: SourceLocation,
  node: SemanticText,
  limits: ResourceLimits
): Diagnostic | undefined {
  const segments = path.split(".")
  if (segments.some((segment) => !PATH_SEGMENT.test(segment))) {
    return templateDiagnostic(
      "TEMPLATE_INVALID_EXPRESSION",
      "The template path is malformed",
      source,
      node
    )
  }
  if (segments.some((segment) => RESERVED_PATH_SEGMENTS.has(segment))) {
    return templateDiagnostic(
      "TEMPLATE_UNSAFE_PATH",
      "Prototype-related property names are forbidden in template paths",
      source,
      node
    )
  }
  if (segments.length > limits.maxExpressionDepth) {
    return templateDiagnostic(
      "TEMPLATE_EXPRESSION_LIMIT",
      `The template path exceeds the ${limits.maxExpressionDepth}-segment expression limit`,
      source,
      node
    )
  }
  return undefined
}

function splitPipes(body: string): readonly string[] | undefined {
  const parts: string[] = []
  let start = 0
  let quote: '"' | "'" | undefined
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index]
    if (quote !== undefined) {
      if (character === "\\") return undefined
      if (character === quote) quote = undefined
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
    } else if (character === "|") {
      parts.push(body.slice(start, index).trim())
      start = index + 1
    }
  }
  if (quote !== undefined) return undefined
  parts.push(body.slice(start).trim())
  return parts
}

type ParsedFormatter = Readonly<{
  reference: FormatterReference
  kind: TemplateFieldKind
}>

function parseFormatter(
  text: string,
  source: SourceLocation,
  node: SemanticText
): ParsedFormatter | Diagnostic {
  const match = /^(?<name>[A-Za-z]+)(?:\s*:\s*(?<argument>.*))?$/u.exec(text)
  const name = match?.groups?.name?.toLowerCase()
  const argument = match?.groups?.argument
  if (
    name !== "upper" &&
    name !== "lower" &&
    name !== "currency" &&
    name !== "date"
  ) {
    return templateDiagnostic(
      "TEMPLATE_UNKNOWN_FORMATTER",
      `Unknown template formatter ${name ?? text}`,
      source,
      node
    )
  }
  if (name === "upper" || name === "lower") {
    if (argument !== undefined) {
      return templateDiagnostic(
        "TEMPLATE_FORMATTER_ARGUMENT",
        `Formatter ${name} does not accept arguments`,
        source,
        node
      )
    }
    return { reference: { name, arguments: [] }, kind: "string" }
  }
  if (argument === undefined) {
    return templateDiagnostic(
      "TEMPLATE_FORMATTER_ARGUMENT",
      `Formatter ${name} requires one quoted string argument`,
      source,
      node
    )
  }
  const quoted = /^(["'])(?<value>[^"']*)\1$/u.exec(argument.trim())
  const value = quoted?.groups?.value
  if (value === undefined) {
    return templateDiagnostic(
      "TEMPLATE_FORMATTER_ARGUMENT",
      `Formatter ${name} requires one simply quoted string argument`,
      source,
      node
    )
  }
  if (name === "currency" && !/^[A-Z]{3}$/u.test(value)) {
    return templateDiagnostic(
      "TEMPLATE_FORMATTER_ARGUMENT",
      "The currency formatter requires an uppercase three-letter ISO currency code",
      source,
      node
    )
  }
  if (name === "date" && value !== "d MMMM yyyy") {
    return templateDiagnostic(
      "TEMPLATE_FORMATTER_ARGUMENT",
      'The date formatter supports only the exact pattern "d MMMM yyyy"',
      source,
      node
    )
  }
  return {
    reference: { name, arguments: [value] },
    kind: name === "currency" ? "number" : "date",
  }
}

function parseValueBody(
  raw: string,
  source: SourceLocation,
  node: SemanticText,
  limits: ResourceLimits
): Omit<ParsedPlaceholder, "start" | "end" | "source" | "node"> | Diagnostic {
  const body = raw.trim()
  if (
    body.startsWith("#") ||
    body.startsWith("/") ||
    body === "else" ||
    body.startsWith("else ")
  ) {
    return templateDiagnostic(
      "TEMPLATE_BLOCK_MARKER_PLACEMENT",
      "Block markers must occupy a whole paragraph",
      source,
      node
    )
  }
  if (
    body.startsWith("@") ||
    /^image(?:\s|:|\()/iu.test(body) ||
    /:\s*image(?:\s*\|.*)?$/iu.test(body)
  ) {
    return templateDiagnostic(
      "TEMPLATE_UNSUPPORTED_IMAGE_TAG",
      "Image template tags are not supported",
      source,
      node
    )
  }

  const parts = splitPipes(body)
  if (parts === undefined) {
    return templateDiagnostic(
      "TEMPLATE_MALFORMED_QUOTE",
      "Template formatter arguments must use balanced simple quotes without escapes",
      source,
      node
    )
  }
  const expression = parts[0]
  if (
    expression === undefined ||
    expression.length === 0 ||
    parts.slice(1).some((part) => part.length === 0)
  ) {
    return templateDiagnostic(
      "TEMPLATE_INVALID_EXPRESSION",
      "A template value requires a path and complete formatter expressions",
      source,
      node
    )
  }
  const match =
    /^(?<path>[A-Za-z_$][A-Za-z0-9_$.]*)(?:\s*:\s*(?<kind>[A-Za-z]+))?$/u.exec(
      expression
    )
  if (
    match === null ||
    match.groups === undefined ||
    match.groups.path === undefined
  ) {
    return templateDiagnostic(
      "TEMPLATE_INVALID_EXPRESSION",
      "A template value must be a dotted property path with an optional type before formatters",
      source,
      node
    )
  }
  const path = match.groups.path
  const pathError = validatePath(path, source, node, limits)
  if (pathError !== undefined) return pathError

  let kind: TemplateFieldKind = "unknown"
  let explicitKind = false
  const kindName = match.groups.kind?.toLowerCase()
  if (kindName !== undefined) {
    if (kindName === "image") {
      return templateDiagnostic(
        "TEMPLATE_UNSUPPORTED_IMAGE_TAG",
        "Image template tags are not supported",
        source,
        node
      )
    }
    if (
      kindName !== "string" &&
      kindName !== "number" &&
      kindName !== "boolean" &&
      kindName !== "date"
    ) {
      return templateDiagnostic(
        "TEMPLATE_INVALID_EXPRESSION",
        "Template values support only string, number, boolean, and date types",
        source,
        node
      )
    }
    kind = kindName
    explicitKind = true
  }

  const formatters: FormatterReference[] = []
  let formatterKind: TemplateFieldKind | undefined
  for (const formatterText of parts.slice(1)) {
    const parsed = parseFormatter(formatterText, source, node)
    if ("code" in parsed) return parsed
    if (formatterKind !== undefined && formatterKind !== parsed.kind) {
      return templateDiagnostic(
        "TEMPLATE_FORMATTER_TYPE",
        "The formatter chain combines incompatible value types",
        source,
        node
      )
    }
    formatterKind = parsed.kind
    formatters.push(parsed.reference)
  }
  if (formatterKind !== undefined && explicitKind && kind !== formatterKind) {
    return templateDiagnostic(
      "TEMPLATE_FORMATTER_TYPE",
      `The formatter requires ${formatterKind} but the value is declared ${kind}`,
      source,
      node
    )
  }
  if (formatterKind !== undefined) kind = formatterKind
  return { raw, path, kind, explicitKind, formatters }
}

/** Returns a marker only when the tag is the paragraph's sole non-whitespace content. */
export function parseBlockMarker(
  paragraph: SemanticParagraph,
  limits: ResourceLimits
): BlockMarker | Diagnostic | undefined {
  if (paragraph.children.some((child) => child.type !== "text"))
    return undefined
  const text = paragraphText(paragraph)
  const match = /^\s*\{\{(?<body>[\s\S]*?)\}\}\s*$/u.exec(text)
  const body = match?.groups?.body?.trim()
  if (body === undefined) return undefined
  const open = text.indexOf("{{")
  const node = nodeAt(paragraph, open)
  const source = node.source
  if (body === "else") return { type: "else", raw: body, source, node }
  if (body === "/if") return { type: "endIf", raw: body, source, node }
  if (body === "/each") return { type: "endEach", raw: body, source, node }
  const start = /^#(?<type>if|each)\s+(?<path>\S+)$/u.exec(body)
  if (start?.groups?.type !== undefined && start.groups.path !== undefined) {
    const pathError = validatePath(start.groups.path, source, node, limits)
    if (pathError !== undefined) return pathError
    return {
      type: start.groups.type as "if" | "each",
      path: start.groups.path,
      raw: body,
      source,
      node,
    }
  }
  if (body.startsWith("#") || body.startsWith("/") || body.startsWith("else")) {
    return templateDiagnostic(
      "TEMPLATE_MALFORMED_BLOCK",
      "Malformed if/each block marker",
      source,
      node
    )
  }
  return undefined
}

/** Returns a marker only when its paragraph is the row's sole visible content. */
export function parseTableRowMarker(
  row: SemanticTableRow,
  limits: ResourceLimits
): BlockMarker | Diagnostic | undefined {
  const markers: BlockMarker[] = []
  let visibleParagraphs = 0
  for (const cell of row.cells) {
    for (const block of cell.blocks) {
      if (block.type !== "paragraph") {
        return {
          code: "TEMPLATE_UNSUPPORTED_NESTED_TABLE",
          severity: "error",
          message:
            "Nested tables in template table cells are unsupported and would cause content loss",
          source: block.source,
          nodeId: block.id,
        }
      }
      if (
        paragraphText(block).trim().length > 0 ||
        block.children.some((child) => child.type !== "text")
      )
        visibleParagraphs += 1
      const parsed = parseBlockMarker(block, limits)
      if (parsed !== undefined && "code" in parsed) return parsed
      if (parsed !== undefined) markers.push(parsed)
    }
  }
  const marker = markers[0]
  if (marker === undefined) return undefined
  if (markers.length !== 1 || visibleParagraphs !== 1) {
    return templateDiagnostic(
      "TEMPLATE_TABLE_ROW_MARKER_CONTENT",
      "A table row block marker must be the row's only visible content",
      marker.source,
      marker.node
    )
  }
  return marker
}

/** Parses tags against a paragraph's logical text, rather than individual OOXML runs. */
export function parseParagraph(
  paragraph: SemanticParagraph,
  limits: ResourceLimits
): ParsedParagraph {
  const placeholders: ParsedPlaceholder[] = []
  const diagnostics: Diagnostic[] = []
  let logicalOffset = 0
  let segmentText = ""
  let segmentStart = 0
  const parseSegment = (text: string, base: number): void => {
    let cursor = 0
    while (cursor < text.length) {
      const open = text.indexOf("{{", cursor)
      const unmatchedClose = text.indexOf("}}", cursor)
      if (unmatchedClose !== -1 && (open === -1 || unmatchedClose < open)) {
        const node = nodeAt(paragraph, base + unmatchedClose)
        diagnostics.push(
          templateDiagnostic(
            "TEMPLATE_MALFORMED_TAG",
            "Found a closing tag without an opening tag",
            node.source,
            node
          )
        )
        cursor = unmatchedClose + 2
        continue
      }
      if (open === -1) break
      const node = nodeAt(paragraph, base + open)
      const close = text.indexOf("}}", open + 2)
      const nestedOpen = text.indexOf("{{", open + 2)
      if (close === -1 || (nestedOpen !== -1 && nestedOpen < close)) {
        diagnostics.push(
          templateDiagnostic(
            "TEMPLATE_MALFORMED_TAG",
            "Template tags cannot be nested or left unclosed",
            node.source,
            node
          )
        )
        cursor = open + 2
        continue
      }
      const raw = text.slice(open + 2, close)
      const result = parseValueBody(raw, node.source, node, limits)
      if ("code" in result) diagnostics.push(result)
      else
        placeholders.push({
          ...result,
          start: base + open,
          end: base + close + 2,
          source: node.source,
          node,
        })
      cursor = close + 2
    }
  }
  for (const child of paragraph.children) {
    if (child.type === "text") {
      if (segmentText.length === 0) segmentStart = logicalOffset
      segmentText += child.text
      logicalOffset += child.text.length
      continue
    }
    parseSegment(segmentText, segmentStart)
    segmentText = ""
    logicalOffset += 1
  }
  parseSegment(segmentText, segmentStart)

  const textBeforeBarrier = paragraph.children.some((child, index) => {
    if (child.type === "text" || index === 0) return false
    const before = paragraph.children
      .slice(0, index)
      .filter((item): item is SemanticText => item.type === "text")
      .map((item) => item.text)
      .join("")
    const after = paragraph.children
      .slice(index + 1)
      .filter((item): item is SemanticText => item.type === "text")
      .map((item) => item.text)
      .join("")
    return (
      before.lastIndexOf("{{") > before.lastIndexOf("}}") &&
      after.includes("}}")
    )
  })
  if (textBeforeBarrier) {
    const node = paragraph.children.find(
      (child): child is SemanticText => child.type === "text"
    )
    if (node !== undefined)
      diagnostics.push(
        templateDiagnostic(
          "TEMPLATE_INLINE_BARRIER",
          "Template tags cannot span images or page fields",
          node.source,
          node
        )
      )
  }
  return { placeholders, diagnostics }
}

export function stableDiagnostics(
  diagnostics: readonly Diagnostic[]
): readonly Diagnostic[] {
  return diagnostics.slice()
}
