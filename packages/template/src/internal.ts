import type {
  Diagnostic,
  ResourceLimits,
  SemanticParagraph,
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
  start: number
  end: number
  source: SourceLocation
  node: SemanticText
}>

export type ParsedParagraph = Readonly<{
  placeholders: readonly ParsedPlaceholder[]
  diagnostics: readonly Diagnostic[]
}>

function diagnostic(
  code: string,
  message: string,
  source: SourceLocation,
  node: SemanticText
): Diagnostic {
  return { code, severity: "error", message, source, nodeId: node.id }
}

function nodeAt(paragraph: SemanticParagraph, offset: number): SemanticText {
  let cursor = 0
  for (const child of paragraph.children) {
    const next = cursor + child.text.length
    if (offset < next || (child.text.length === 0 && offset === cursor)) {
      return child
    }
    cursor = next
  }

  // A paragraph with no text cannot contain a tag. This fallback is retained for
  // defensive callers and never exposed in a successful parse.
  const fallback = paragraph.children[paragraph.children.length - 1]
  if (fallback === undefined) {
    throw new TypeError("A placeholder cannot exist in an empty paragraph")
  }
  return fallback
}

function parseBody(
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
    return diagnostic(
      "TEMPLATE_UNSUPPORTED_BLOCK_TAG",
      "Block template tags are not supported in Phase 1",
      source,
      node
    )
  }

  if (
    body.startsWith("@") ||
    /^image(?:\s|:|\()/iu.test(body) ||
    /:\s*image\s*$/iu.test(body)
  ) {
    return diagnostic(
      "TEMPLATE_UNSUPPORTED_IMAGE_TAG",
      "Image template tags are not supported in Phase 1",
      source,
      node
    )
  }

  const match =
    /^(?<path>[A-Za-z_$][A-Za-z0-9_$.]*)(?:\s*:\s*(?<kind>[A-Za-z]+))?$/u.exec(
      body
    )
  if (match === null || match.groups === undefined) {
    return diagnostic(
      "TEMPLATE_INVALID_EXPRESSION",
      "A Phase 1 placeholder must be a dotted property path with an optional type",
      source,
      node
    )
  }

  const path = match.groups.path
  const kindName = match.groups.kind
  if (path === undefined) {
    return diagnostic(
      "TEMPLATE_INVALID_EXPRESSION",
      "The placeholder path is missing",
      source,
      node
    )
  }
  const segments = path.split(".")
  if (segments.some((segment) => !PATH_SEGMENT.test(segment))) {
    return diagnostic(
      "TEMPLATE_INVALID_EXPRESSION",
      "The placeholder path is malformed",
      source,
      node
    )
  }
  if (segments.some((segment) => RESERVED_PATH_SEGMENTS.has(segment))) {
    return diagnostic(
      "TEMPLATE_UNSAFE_PATH",
      "Prototype-related property names are forbidden in template paths",
      source,
      node
    )
  }
  if (segments.length > limits.maxExpressionDepth) {
    return diagnostic(
      "TEMPLATE_EXPRESSION_LIMIT",
      `The placeholder path exceeds the ${limits.maxExpressionDepth}-segment expression limit`,
      source,
      node
    )
  }

  if (kindName === undefined) {
    return { raw, path, kind: "unknown", explicitKind: false }
  }
  const kind = kindName.toLowerCase()
  if (kind === "image") {
    return diagnostic(
      "TEMPLATE_UNSUPPORTED_IMAGE_TAG",
      "Image template tags are not supported in Phase 1",
      source,
      node
    )
  }
  if (
    kind !== "string" &&
    kind !== "number" &&
    kind !== "boolean" &&
    kind !== "date"
  ) {
    return diagnostic(
      "TEMPLATE_INVALID_EXPRESSION",
      "Phase 1 supports only string, number, boolean, and date placeholder types",
      source,
      node
    )
  }
  return { raw, path, kind, explicitKind: true }
}

/** Parses tags against a paragraph's logical text, rather than individual OOXML runs. */
export function parseParagraph(
  paragraph: SemanticParagraph,
  limits: ResourceLimits
): ParsedParagraph {
  const text = paragraph.children.map((child) => child.text).join("")
  const placeholders: ParsedPlaceholder[] = []
  const diagnostics: Diagnostic[] = []
  let cursor = 0

  while (cursor < text.length) {
    const open = text.indexOf("{{", cursor)
    const unmatchedClose = text.indexOf("}}", cursor)
    if (unmatchedClose !== -1 && (open === -1 || unmatchedClose < open)) {
      const node = nodeAt(paragraph, unmatchedClose)
      diagnostics.push(
        diagnostic(
          "TEMPLATE_MALFORMED_TAG",
          "Found a closing tag without an opening tag",
          node.source,
          node
        )
      )
      cursor = unmatchedClose + 2
      continue
    }
    if (open === -1) {
      break
    }

    const node = nodeAt(paragraph, open)
    const close = text.indexOf("}}", open + 2)
    const nestedOpen = text.indexOf("{{", open + 2)
    if (close === -1 || (nestedOpen !== -1 && nestedOpen < close)) {
      diagnostics.push(
        diagnostic(
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
    const result = parseBody(raw, node.source, node, limits)
    if ("code" in result) {
      diagnostics.push(result)
    } else {
      placeholders.push({
        ...result,
        start: open,
        end: close + 2,
        source: node.source,
        node,
      })
    }
    cursor = close + 2
  }

  return { placeholders, diagnostics }
}

export function stableDiagnostics(
  diagnostics: readonly Diagnostic[]
): readonly Diagnostic[] {
  return diagnostics.slice()
}
