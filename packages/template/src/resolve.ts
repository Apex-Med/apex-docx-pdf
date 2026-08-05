import {
  DEFAULT_RESOURCE_LIMITS,
  hasErrors,
  throwIfAborted,
  type CompiledTemplate,
  type Diagnostic,
  type OperationResult,
  type ResolvedDocument,
  type ResourceLimits,
  type SemanticParagraph,
  type SemanticText,
  type TemplateFieldKind,
} from "@apex-docx-pdf/core"

import { parseParagraph, type ParsedPlaceholder } from "./internal"

export type TemplateResolveOptions = Readonly<{
  /** Strict is the default. Permissive resolution warns and substitutes empty text. */
  permissive?: boolean
  limits?: Partial<
    Pick<
      ResourceLimits,
      | "maxExpressionDepth"
      | "maxObjectTraversalDepth"
      | "maxExpandedNodes"
      | "maxExpandedTextBytes"
    >
  >
  signal?: AbortSignal
}>

type ResolvedValue =
  | Readonly<{ ok: true; text: string }>
  | Readonly<{ ok: false; code: string; message: string }>

function limitsFor(options: TemplateResolveOptions): ResourceLimits {
  return { ...DEFAULT_RESOURCE_LIMITS, ...options.limits }
}

function fieldKind(
  compiled: CompiledTemplate,
  path: string
): TemplateFieldKind {
  return (
    compiled.manifest.fields.find((field) => field.path === path)?.kind ??
    "unknown"
  )
}

function lookup(
  data: Readonly<Record<string, unknown>>,
  path: string,
  limits: ResourceLimits
):
  | Readonly<{ found: true; value: unknown }>
  | Readonly<{ found: false; code: string; message: string }> {
  const segments = path.split(".")
  if (segments.length > limits.maxObjectTraversalDepth) {
    return {
      found: false,
      code: "TEMPLATE_TRAVERSAL_LIMIT",
      message: `Placeholder ${path} exceeds the ${limits.maxObjectTraversalDepth}-segment traversal limit`,
    }
  }
  let current: unknown = data
  for (const segment of segments) {
    if (
      typeof current !== "object" ||
      current === null ||
      Array.isArray(current)
    ) {
      return {
        found: false,
        code: "TEMPLATE_VALUE_MISSING",
        message: `Missing value for ${path}`,
      }
    }
    if (!Object.hasOwn(current, segment)) {
      return {
        found: false,
        code: "TEMPLATE_VALUE_MISSING",
        message: `Missing value for ${path}`,
      }
    }
    current = (current as Record<string, unknown>)[segment]
  }
  return { found: true, value: current }
}

function asText(value: unknown, kind: TemplateFieldKind): ResolvedValue {
  if (kind === "string" || kind === "date") {
    return typeof value === "string"
      ? { ok: true, text: value }
      : {
          ok: false,
          code: "TEMPLATE_VALUE_TYPE",
          message: `Expected a ${kind} string value`,
        }
  }
  if (kind === "number") {
    return typeof value === "number" && Number.isFinite(value)
      ? { ok: true, text: String(value) }
      : {
          ok: false,
          code: "TEMPLATE_VALUE_TYPE",
          message: "Expected a finite number value",
        }
  }
  if (kind === "boolean") {
    return typeof value === "boolean"
      ? { ok: true, text: value ? "true" : "false" }
      : {
          ok: false,
          code: "TEMPLATE_VALUE_TYPE",
          message: "Expected a boolean value",
        }
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return { ok: true, text: String(value) }
  }
  return {
    ok: false,
    code: "TEMPLATE_VALUE_TYPE",
    message: "Expected a string, number, or boolean value",
  }
}

function diagnostic(
  placeholder: ParsedPlaceholder,
  code: string,
  severity: "error" | "warning",
  message: string
): Diagnostic {
  return {
    code,
    severity,
    message,
    source: placeholder.source,
    nodeId: placeholder.node.id,
  }
}

function sourcePieces(
  paragraph: SemanticParagraph,
  start: number,
  end: number,
  add: (source: SemanticText, text: string, whole: boolean) => void
): void {
  let cursor = 0
  for (const child of paragraph.children) {
    const childStart = cursor
    const childEnd = childStart + child.text.length
    const from = Math.max(start, childStart)
    const to = Math.min(end, childEnd)
    if (from < to) {
      add(
        child,
        child.text.slice(from - childStart, to - childStart),
        from === childStart && to === childEnd
      )
    }
    cursor = childEnd
  }
}

function derivedNodeId(
  source: SemanticText,
  ordinal: number
): SemanticText["id"] {
  return `${source.id}~template-${ordinal}` as SemanticText["id"]
}

function resolveParagraph(
  paragraph: SemanticParagraph,
  compiled: CompiledTemplate,
  data: Readonly<Record<string, unknown>>,
  options: TemplateResolveOptions,
  limits: ResourceLimits,
  diagnostics: Diagnostic[]
): readonly SemanticText[] | undefined {
  const parsed = parseParagraph(paragraph, limits)
  if (parsed.diagnostics.length > 0) {
    diagnostics.push(...parsed.diagnostics)
    return undefined
  }
  const replacements: { placeholder: ParsedPlaceholder; text: string }[] = []
  for (const placeholder of parsed.placeholders) {
    throwIfAborted(options.signal)
    const located = lookup(data, placeholder.path, limits)
    const result: ResolvedValue = located.found
      ? asText(located.value, fieldKind(compiled, placeholder.path))
      : { ok: false, code: located.code, message: located.message }
    if (result.ok) {
      replacements.push({ placeholder, text: result.text })
      continue
    }
    diagnostics.push(
      diagnostic(
        placeholder,
        result.code,
        options.permissive ? "warning" : "error",
        result.message
      )
    )
    replacements.push({ placeholder, text: "" })
  }

  let childOrdinal = 0
  const resolved: SemanticText[] = []
  const append = (source: SemanticText, text: string, whole: boolean): void => {
    if (text.length === 0) return
    resolved.push(
      whole
        ? source
        : { ...source, id: derivedNodeId(source, childOrdinal), text }
    )
    childOrdinal += 1
  }
  let cursor = 0
  for (const replacement of replacements) {
    sourcePieces(paragraph, cursor, replacement.placeholder.start, append)
    append(replacement.placeholder.node, replacement.text, false)
    cursor = replacement.placeholder.end
  }
  const paragraphLength = paragraph.children.reduce(
    (total, child) => total + child.text.length,
    0
  )
  sourcePieces(paragraph, cursor, paragraphLength, append)
  return resolved
}

function totalTextBytes(
  document: ResolvedDocument,
  limits: ResourceLimits,
  signal?: AbortSignal
): number | undefined {
  const encoder = new TextEncoder()
  let total = 0
  let nodes = 0
  for (const section of document.sections) {
    for (const paragraph of section.blocks) {
      for (const child of paragraph.children) {
        throwIfAborted(signal)
        nodes += 1
        total += encoder.encode(child.text).byteLength
        if (
          nodes > limits.maxExpandedNodes ||
          total > limits.maxExpandedTextBytes
        )
          return undefined
      }
    }
  }
  return total
}

/** Resolves a compiled Phase 1 template without evaluating arbitrary template code. */
export function resolveTemplate(
  compiled: CompiledTemplate,
  data: Readonly<Record<string, unknown>>,
  options: TemplateResolveOptions = {}
): OperationResult<ResolvedDocument> {
  throwIfAborted(options.signal)
  const limits = limitsFor(options)
  const diagnostics: Diagnostic[] = [...compiled.diagnostics]
  if (hasErrors(diagnostics)) return { ok: false, diagnostics }

  const sections =
    [] as ResolvedDocument["sections"] extends readonly (infer T)[]
      ? T[]
      : never[]
  for (const section of compiled.source.sections) {
    throwIfAborted(options.signal)
    const blocks = [] as typeof section.blocks extends readonly (infer T)[]
      ? T[]
      : never[]
    for (const paragraph of section.blocks) {
      const children = resolveParagraph(
        paragraph,
        compiled,
        data,
        options,
        limits,
        diagnostics
      )
      if (children === undefined) continue
      blocks.push({ ...paragraph, children } as (typeof blocks)[number])
    }
    sections.push({ ...section, blocks } as (typeof sections)[number])
  }
  if (hasErrors(diagnostics)) return { ok: false, diagnostics }

  const value = { ...compiled.source, sections } as ResolvedDocument
  if (totalTextBytes(value, limits, options.signal) === undefined) {
    return {
      ok: false,
      diagnostics: [
        ...diagnostics,
        {
          code: "TEMPLATE_EXPANDED_TEXT_LIMIT",
          severity: "error",
          message:
            "Resolved text or node count exceeds the configured resource limit",
        },
      ],
    }
  }
  return { ok: true, value, diagnostics }
}

export const resolve = resolveTemplate
