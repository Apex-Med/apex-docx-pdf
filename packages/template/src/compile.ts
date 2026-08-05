import {
  DEFAULT_RESOURCE_LIMITS,
  documentHash,
  throwIfAborted,
  type CompiledTemplate,
  type Diagnostic,
  type DocumentHash,
  type ResourceLimits,
  type SemanticDocument,
  type TemplateField,
  type TemplateFieldKind,
} from "@apex-docx-pdf/core"

import {
  parseParagraph,
  stableDiagnostics,
  type ParsedPlaceholder,
} from "./internal"

export type TemplateCompileOptions = Readonly<{
  limits?: Partial<
    Pick<
      ResourceLimits,
      "maxExpressionDepth" | "maxObjectTraversalDepth" | "maxExpandedTextBytes"
    >
  >
  signal?: AbortSignal
  templateHash?: DocumentHash
  version?: string
}>

type FieldAccumulator = {
  kind: TemplateFieldKind
  explicitKinds: Set<TemplateFieldKind>
  sourceLocations: ParsedPlaceholder["source"][]
  inferredFrom: string[]
}

function limitsFor(options: TemplateCompileOptions): ResourceLimits {
  return { ...DEFAULT_RESOURCE_LIMITS, ...options.limits }
}

function stableSourceDocument(document: SemanticDocument): string {
  const serialize = (value: unknown): string => {
    if (value === null || typeof value !== "object")
      return JSON.stringify(value)
    if (Array.isArray(value)) return `[${value.map(serialize).join(",")}]`
    return `{${Object.keys(value)
      .sort()
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .map(
        (key) =>
          `${JSON.stringify(key)}:${serialize((value as Record<string, unknown>)[key])}`
      )
      .join(",")}}`
  }
  return serialize(document)
}

async function hashDocument(
  document: SemanticDocument,
  signal?: AbortSignal
): Promise<DocumentHash> {
  throwIfAborted(signal)
  const bytes = new TextEncoder().encode(stableSourceDocument(document))
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  throwIfAborted(signal)
  const value = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
  return documentHash(value)
}

function fieldDiagnostic(
  code: string,
  message: string,
  placeholder: ParsedPlaceholder
): Diagnostic {
  return {
    code,
    severity: "error",
    message,
    source: placeholder.source,
    nodeId: placeholder.node.id,
  }
}

function nestedPathConflicts(
  paths: readonly string[]
): readonly [string, string][] {
  const conflicts: [string, string][] = []
  const sorted = paths.slice().sort()
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const current = sorted[index]
    const next = sorted[index + 1]
    if (
      current !== undefined &&
      next !== undefined &&
      next.startsWith(`${current}.`)
    ) {
      conflicts.push([current, next])
    }
  }
  return conflicts
}

function buildManifest(
  fields: ReadonlyMap<string, FieldAccumulator>
): readonly TemplateField[] {
  return Array.from(fields.entries())
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([path, field]) => ({
      path,
      kind: field.kind,
      required: true,
      formatters: [],
      sourceLocations: field.sourceLocations,
      inferredFrom: field.inferredFrom,
    }))
}

type MutableSchema = Record<string, unknown>

function isObjectSchema(value: unknown): value is MutableSchema {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false
  const candidate = value as MutableSchema
  return (
    candidate.type === "object" &&
    typeof candidate.properties === "object" &&
    candidate.properties !== null &&
    Array.isArray(candidate.required)
  )
}

function schemaForKind(kind: TemplateFieldKind): MutableSchema {
  switch (kind) {
    case "string":
      return { type: "string" }
    case "number":
      return { type: "number" }
    case "boolean":
      return { type: "boolean" }
    case "date":
      return { type: "string", format: "date-time" }
    default:
      return {}
  }
}

function buildSchema(
  fields: readonly TemplateField[]
): Readonly<Record<string, unknown>> {
  const root: MutableSchema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  }
  for (const field of fields) {
    const segments = field.path.split(".")
    let schema = root
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index]
      if (segment === undefined) continue
      const properties = schema.properties as MutableSchema
      const required = schema.required as string[]
      if (!required.includes(segment)) required.push(segment)
      if (index === segments.length - 1) {
        properties[segment] = schemaForKind(field.kind)
      } else {
        const existing = properties[segment]
        if (!isObjectSchema(existing)) {
          properties[segment] = {
            type: "object",
            properties: {},
            required: [],
            additionalProperties: false,
          }
        }
        schema = properties[segment] as MutableSchema
      }
    }
  }
  return root
}

function starterForKind(kind: TemplateFieldKind): unknown {
  switch (kind) {
    case "number":
      return 0
    case "boolean":
      return false
    case "date":
      return "1970-01-01T00:00:00.000Z"
    default:
      return ""
  }
}

function buildStarterData(
  fields: readonly TemplateField[]
): Readonly<Record<string, unknown>> {
  const root: Record<string, unknown> = {}
  for (const field of fields) {
    const segments = field.path.split(".")
    let value: Record<string, unknown> = root
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index]
      if (segment === undefined) continue
      if (index === segments.length - 1) {
        value[segment] = starterForKind(field.kind)
      } else {
        const next = value[segment]
        if (typeof next !== "object" || next === null || Array.isArray(next)) {
          value[segment] = {}
        }
        value = value[segment] as Record<string, unknown>
      }
    }
  }
  return root
}

/** Compiles Phase 1 inline placeholders from a normalized semantic document. */
export async function compileTemplate(
  source: SemanticDocument,
  options: TemplateCompileOptions = {}
): Promise<CompiledTemplate> {
  const limits = limitsFor(options)
  const diagnostics: Diagnostic[] = []
  const fields = new Map<string, FieldAccumulator>()
  const placeholderNodes: Record<string, string> = {}
  const firstByPath = new Map<string, ParsedPlaceholder>()

  for (const section of source.sections) {
    throwIfAborted(options.signal)
    for (const paragraph of section.blocks) {
      const parsed = parseParagraph(paragraph, limits)
      diagnostics.push(...parsed.diagnostics)
      for (const placeholder of parsed.placeholders) {
        throwIfAborted(options.signal)
        if (placeholderNodes[placeholder.node.id] === undefined) {
          placeholderNodes[placeholder.node.id] = placeholder.path
        }
        const existing = fields.get(placeholder.path)
        if (existing === undefined) {
          fields.set(placeholder.path, {
            kind: placeholder.kind,
            explicitKinds: placeholder.explicitKind
              ? new Set([placeholder.kind])
              : new Set(),
            sourceLocations: [placeholder.source],
            inferredFrom: [`{{${placeholder.raw}}}`],
          })
          firstByPath.set(placeholder.path, placeholder)
          continue
        }
        existing.sourceLocations.push(placeholder.source)
        existing.inferredFrom.push(`{{${placeholder.raw}}}`)
        if (placeholder.explicitKind)
          existing.explicitKinds.add(placeholder.kind)
        if (existing.explicitKinds.size === 1) {
          existing.kind = Array.from(existing.explicitKinds)[0] ?? "unknown"
        }
      }
    }
  }

  for (const [path, field] of fields) {
    if (field.explicitKinds.size > 1) {
      const placeholder = firstByPath.get(path)
      if (placeholder !== undefined) {
        diagnostics.push(
          fieldDiagnostic(
            "TEMPLATE_TYPE_CONFLICT",
            `Placeholder ${path} declares incompatible explicit types`,
            placeholder
          )
        )
      }
    }
  }
  for (const [parent, child] of nestedPathConflicts(
    Array.from(fields.keys())
  )) {
    const placeholder = firstByPath.get(parent)
    if (placeholder !== undefined) {
      diagnostics.push(
        fieldDiagnostic(
          "TEMPLATE_PATH_CONFLICT",
          `Placeholder ${parent} conflicts with nested placeholder ${child}`,
          placeholder
        )
      )
    }
  }

  const manifestFields = buildManifest(fields)
  return {
    version: options.version ?? "phase-1",
    templateHash:
      options.templateHash ?? (await hashDocument(source, options.signal)),
    source,
    manifest: { fields: manifestFields },
    jsonSchema: buildSchema(manifestFields),
    starterData: buildStarterData(manifestFields),
    diagnostics: stableDiagnostics(diagnostics),
    placeholderNodes: placeholderNodes as CompiledTemplate["placeholderNodes"],
  }
}

export const compile = compileTemplate
