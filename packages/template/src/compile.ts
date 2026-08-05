import {
  DEFAULT_RESOURCE_LIMITS,
  documentHash,
  throwIfAborted,
  type CompiledTemplate,
  type Diagnostic,
  type DocumentHash,
  type FormatterReference,
  type ResourceLimits,
  type SemanticDocument,
  type SemanticParagraph,
  type SemanticTable,
  type TemplateField,
  type TemplateFieldKind,
} from "@apex-docx-pdf/core"

import {
  parseBlockMarker,
  parseParagraph,
  parseTableRowMarker,
  stableDiagnostics,
  templateDiagnostic,
  type BlockMarker,
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
  kinds: Set<TemplateFieldKind>
  sourceLocations: ParsedPlaceholder["source"][]
  inferredFrom: string[]
  formatters: FormatterReference[]
  first: ParsedPlaceholder | BlockMarker
}

type BlockFrame = {
  type: "if" | "each"
  marker: BlockMarker
  elseSeen: boolean
  itemBase?: string
  rowIndex?: number
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
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(stableSourceDocument(document))
  )
  throwIfAborted(signal)
  return documentHash(
    Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("")
  )
}

function markerDiagnostic(
  code: string,
  message: string,
  marker: BlockMarker
): Diagnostic {
  return templateDiagnostic(code, message, marker.source, marker.node)
}

function contentLossDiagnostic(
  source: ParsedPlaceholder["source"],
  node: { id: ParsedPlaceholder["node"]["id"] },
  feature: string
): Diagnostic {
  return {
    code: "TEMPLATE_CONTENT_LOSS",
    severity: "error",
    message: `Unsupported ${feature} would cause content loss`,
    source,
    nodeId: node.id,
  }
}

type CompileState = Readonly<{
  diagnostics: Diagnostic[]
  fields: Map<string, FieldAccumulator>
  placeholderNodes: Record<string, string>
  limits: ResourceLimits
  options: TemplateCompileOptions
}>

function currentItemBase(stack: readonly BlockFrame[]): string | undefined {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const base = stack[index]?.itemBase
    if (base !== undefined) return base
  }
  return undefined
}

function qualify(path: string, stack: readonly BlockFrame[]): string {
  const base = currentItemBase(stack)
  return base === undefined ? path : `${base}.${path}`
}

function sameFormatter(
  left: FormatterReference,
  right: FormatterReference
): boolean {
  return (
    left.name === right.name &&
    JSON.stringify(left.arguments) === JSON.stringify(right.arguments)
  )
}

function addField(
  fields: Map<string, FieldAccumulator>,
  path: string,
  kind: TemplateFieldKind,
  inferredFrom: string,
  source: ParsedPlaceholder["source"],
  first: ParsedPlaceholder | BlockMarker,
  formatters: readonly FormatterReference[] = []
): void {
  const existing = fields.get(path)
  if (existing === undefined) {
    fields.set(path, {
      kind,
      kinds: kind === "unknown" ? new Set() : new Set([kind]),
      sourceLocations: [source],
      inferredFrom: [inferredFrom],
      formatters: formatters.slice(),
      first,
    })
    return
  }
  existing.sourceLocations.push(source)
  existing.inferredFrom.push(inferredFrom)
  if (kind !== "unknown") existing.kinds.add(kind)
  if (existing.kinds.size === 1)
    existing.kind = Array.from(existing.kinds)[0] ?? "unknown"
  for (const formatter of formatters) {
    if (
      !existing.formatters.some((candidate) =>
        sameFormatter(candidate, formatter)
      )
    ) {
      existing.formatters.push(formatter)
    }
  }
}

function nestedPathConflicts(
  fields: ReadonlyMap<string, FieldAccumulator>
): readonly [string, string][] {
  const conflicts: [string, string][] = []
  const entries = Array.from(fields.entries()).sort(([left], [right]) =>
    left.localeCompare(right, "en")
  )
  for (let index = 0; index < entries.length; index += 1) {
    const [parent, parentField] = entries[index] ?? []
    if (parent === undefined || parentField === undefined) continue
    for (
      let childIndex = index + 1;
      childIndex < entries.length;
      childIndex += 1
    ) {
      const child = entries[childIndex]?.[0]
      if (child === undefined) continue
      if (parentField.kind === "array" && child.startsWith(`${parent}[].`))
        continue
      if (child.startsWith(`${parent}.`) || child.startsWith(`${parent}[].`))
        conflicts.push([parent, child])
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
      formatters: field.formatters,
      sourceLocations: field.sourceLocations,
      inferredFrom: field.inferredFrom,
    }))
}

type MutableSchema = Record<string, unknown>

function objectSchema(): MutableSchema {
  return {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  }
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
    case "array":
      return { type: "array", items: objectSchema() }
    default:
      return {}
  }
}

function ensureProperty(
  schema: MutableSchema,
  name: string
): [MutableSchema, string[]] {
  const properties = schema.properties as MutableSchema
  const required = schema.required as string[]
  if (!required.includes(name)) required.push(name)
  return [properties, required]
}

function buildSchema(
  fields: readonly TemplateField[]
): Readonly<Record<string, unknown>> {
  const root: MutableSchema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    ...objectSchema(),
  }
  for (const field of fields) {
    const segments = field.path.split(".")
    let schema = root
    for (let index = 0; index < segments.length; index += 1) {
      const raw = segments[index]
      if (raw === undefined) continue
      const arrayItem = raw.endsWith("[]")
      const name = arrayItem ? raw.slice(0, -2) : raw
      const [properties] = ensureProperty(schema, name)
      const last = index === segments.length - 1
      if (last) {
        properties[name] = schemaForKind(field.kind)
      } else if (arrayItem) {
        const existing = properties[name] as MutableSchema | undefined
        if (existing?.type !== "array")
          properties[name] = { type: "array", items: objectSchema() }
        schema = (properties[name] as MutableSchema).items as MutableSchema
      } else {
        const existing = properties[name] as MutableSchema | undefined
        if (existing?.type !== "object") properties[name] = objectSchema()
        schema = properties[name] as MutableSchema
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
    case "array":
      return [{}]
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
    let value = root
    for (let index = 0; index < segments.length; index += 1) {
      const raw = segments[index]
      if (raw === undefined) continue
      const arrayItem = raw.endsWith("[]")
      const name = arrayItem ? raw.slice(0, -2) : raw
      const last = index === segments.length - 1
      if (last) {
        value[name] = starterForKind(field.kind)
      } else if (arrayItem) {
        if (!Array.isArray(value[name])) value[name] = [{}]
        const item = (value[name] as unknown[])[0]
        if (typeof item !== "object" || item === null || Array.isArray(item))
          (value[name] as unknown[])[0] = {}
        value = (value[name] as Record<string, unknown>[])[0] as Record<
          string,
          unknown
        >
      } else {
        if (
          typeof value[name] !== "object" ||
          value[name] === null ||
          Array.isArray(value[name])
        )
          value[name] = {}
        value = value[name] as Record<string, unknown>
      }
    }
  }
  return root
}

function compileParagraphs(
  paragraphs: readonly SemanticParagraph[],
  inheritedStack: readonly BlockFrame[],
  state: CompileState,
  containerName: string
): void {
  const isIsolatedContainer =
    containerName === "table cell" ||
    containerName === "header" ||
    containerName === "footer"
  const stack: BlockFrame[] = inheritedStack.map((frame) => ({ ...frame }))
  const inheritedDepth = stack.length
  for (const paragraph of paragraphs) {
    throwIfAborted(state.options.signal)
    const markerResult = parseBlockMarker(paragraph, state.limits)
    if (markerResult !== undefined && "code" in markerResult) {
      state.diagnostics.push(markerResult)
      continue
    }
    if (markerResult !== undefined) {
      const marker = markerResult
      if (marker.type === "if" || marker.type === "each") {
        const markerPath = marker.path
        if (markerPath === undefined) continue
        const canonical = qualify(markerPath, stack)
        addField(
          state.fields,
          canonical,
          marker.type === "if" ? "boolean" : "array",
          `{{${marker.raw}}}`,
          marker.source,
          marker
        )
        stack.push({
          type: marker.type,
          marker,
          elseSeen: false,
          ...(marker.type === "each" ? { itemBase: `${canonical}[]` } : {}),
        })
      } else if (marker.type === "else") {
        const frame = stack.at(-1)
        if (stack.length <= inheritedDepth || frame?.type !== "if")
          state.diagnostics.push(
            markerDiagnostic(
              isIsolatedContainer
                ? "TEMPLATE_CROSS_CONTAINER_BLOCK"
                : "TEMPLATE_UNBALANCED_BLOCK",
              `An else marker cannot cross the ${containerName} boundary`,
              marker
            )
          )
        else if (frame.elseSeen)
          state.diagnostics.push(
            markerDiagnostic(
              "TEMPLATE_DUPLICATE_ELSE",
              "An if block can contain only one else marker",
              marker
            )
          )
        else frame.elseSeen = true
      } else {
        const expected = marker.type === "endIf" ? "if" : "each"
        const frame = stack.at(-1)
        if (stack.length <= inheritedDepth || frame?.type !== expected)
          state.diagnostics.push(
            markerDiagnostic(
              isIsolatedContainer
                ? "TEMPLATE_CROSS_CONTAINER_BLOCK"
                : "TEMPLATE_UNBALANCED_BLOCK",
              `Closing ${expected} marker cannot cross the ${containerName} boundary`,
              marker
            )
          )
        else stack.pop()
      }
      continue
    }

    const parsed = parseParagraph(paragraph, state.limits)
    state.diagnostics.push(...parsed.diagnostics)
    if (
      parsed.diagnostics.some(
        (diagnostic) => diagnostic.code === "TEMPLATE_UNSUPPORTED_IMAGE_TAG"
      )
    )
      state.diagnostics.push(
        contentLossDiagnostic(
          paragraph.source,
          paragraph,
          "dynamic image template tag"
        )
      )
    for (const placeholder of parsed.placeholders) {
      throwIfAborted(state.options.signal)
      const canonical = qualify(placeholder.path, stack)
      if (state.placeholderNodes[placeholder.node.id] === undefined)
        state.placeholderNodes[placeholder.node.id] = canonical
      addField(
        state.fields,
        canonical,
        placeholder.kind,
        `{{${placeholder.raw}}}`,
        placeholder.source,
        placeholder,
        placeholder.formatters
      )
    }
  }
  for (const frame of stack.slice(inheritedDepth)) {
    state.diagnostics.push(
      markerDiagnostic(
        isIsolatedContainer
          ? "TEMPLATE_CROSS_CONTAINER_BLOCK"
          : "TEMPLATE_UNCLOSED_BLOCK",
        `The ${frame.type} block is not closed within its ${containerName}`,
        frame.marker
      )
    )
  }
}

function validateStructuralRows(
  table: SemanticTable,
  frame: BlockFrame,
  endRowIndex: number,
  endMarker: BlockMarker,
  diagnostics: Diagnostic[]
): void {
  if (frame.rowIndex === undefined) return
  const startRowIndex = frame.rowIndex
  const enclosed = table.rows.slice(startRowIndex, endRowIndex + 1)
  if (
    enclosed.some(
      (row, offset) =>
        row.repeatAsHeader ||
        startRowIndex + offset < table.repeatHeaderRowCount
    )
  ) {
    diagnostics.push(
      markerDiagnostic(
        "TEMPLATE_TABLE_LOOP_HEADER",
        "A structural table-row block cannot contain or alter repeating header rows",
        frame.marker
      )
    )
  }
  if (
    enclosed.some((row) =>
      row.cells.some((cell) => cell.verticalMerge !== "none")
    )
  ) {
    diagnostics.push(
      markerDiagnostic(
        "TEMPLATE_TABLE_LOOP_VERTICAL_MERGE",
        "A structural table-row block cannot contain vertical merges",
        endMarker
      )
    )
  }
}

function compileTable(table: SemanticTable, state: CompileState): void {
  const rowStack: BlockFrame[] = []
  for (let rowIndex = 0; rowIndex < table.rows.length; rowIndex += 1) {
    throwIfAborted(state.options.signal)
    const row = table.rows[rowIndex]
    if (row === undefined) continue
    const markerResult = parseTableRowMarker(row, state.limits)
    if (markerResult !== undefined && "code" in markerResult) {
      state.diagnostics.push(markerResult)
      if (markerResult.code === "TEMPLATE_UNSUPPORTED_NESTED_TABLE")
        state.diagnostics.push(
          contentLossDiagnostic(row.source, row, "nested table content")
        )
      continue
    }
    if (markerResult !== undefined) {
      const marker = markerResult
      if (marker.type === "if" || marker.type === "each") {
        const markerPath = marker.path
        if (markerPath === undefined) continue
        const canonical = qualify(markerPath, rowStack)
        addField(
          state.fields,
          canonical,
          marker.type === "if" ? "boolean" : "array",
          `{{${marker.raw}}}`,
          marker.source,
          marker
        )
        rowStack.push({
          type: marker.type,
          marker,
          elseSeen: false,
          rowIndex,
          ...(marker.type === "each" ? { itemBase: `${canonical}[]` } : {}),
        })
      } else if (marker.type === "else") {
        const frame = rowStack.at(-1)
        if (frame?.type !== "if")
          state.diagnostics.push(
            markerDiagnostic(
              "TEMPLATE_UNBALANCED_TABLE_BLOCK",
              "A table-row else marker must belong to an open row if block",
              marker
            )
          )
        else if (frame.elseSeen)
          state.diagnostics.push(
            markerDiagnostic(
              "TEMPLATE_DUPLICATE_ELSE",
              "An if block can contain only one else marker",
              marker
            )
          )
        else frame.elseSeen = true
      } else {
        const expected = marker.type === "endIf" ? "if" : "each"
        const frame = rowStack.at(-1)
        if (frame?.type !== expected)
          state.diagnostics.push(
            markerDiagnostic(
              "TEMPLATE_UNBALANCED_TABLE_BLOCK",
              `Closing table-row ${expected} marker does not match the open block`,
              marker
            )
          )
        else {
          validateStructuralRows(
            table,
            frame,
            rowIndex,
            marker,
            state.diagnostics
          )
          rowStack.pop()
        }
      }
      continue
    }

    for (const cell of row.cells) {
      const diagnosticStart = state.diagnostics.length
      compileParagraphs(cell.blocks, rowStack, state, "table cell")
      if (
        state.diagnostics
          .slice(diagnosticStart)
          .some(
            (diagnostic) =>
              diagnostic.code === "TEMPLATE_UNSUPPORTED_NESTED_TABLE"
          )
      )
        state.diagnostics.push(
          contentLossDiagnostic(cell.source, cell, "cell content")
        )
    }
  }
  for (const frame of rowStack) {
    state.diagnostics.push(
      markerDiagnostic(
        "TEMPLATE_UNCLOSED_TABLE_BLOCK",
        `The table-row ${frame.type} block is not closed in its table`,
        frame.marker
      )
    )
  }
}

/** Compiles deterministic inline values plus paragraph- and table-row blocks. */
export async function compileTemplate(
  source: SemanticDocument,
  options: TemplateCompileOptions = {}
): Promise<CompiledTemplate> {
  const limits = limitsFor(options)
  const diagnostics: Diagnostic[] = []
  const fields = new Map<string, FieldAccumulator>()
  const placeholderNodes: Record<string, string> = {}
  const state: CompileState = {
    diagnostics,
    fields,
    placeholderNodes,
    limits,
    options,
  }

  for (const header of source.headers) {
    compileParagraphs(header.blocks, [], state, "header")
  }
  for (const footer of source.footers) {
    compileParagraphs(footer.blocks, [], state, "footer")
  }

  for (const section of source.sections) {
    let paragraphs: SemanticParagraph[] = []
    const flushParagraphs = (): void => {
      if (paragraphs.length === 0) return
      compileParagraphs(paragraphs, [], state, "section paragraph sequence")
      paragraphs = []
    }
    for (const block of section.blocks) {
      if (block.type === "paragraph") paragraphs.push(block)
      else {
        flushParagraphs()
        compileTable(block, state)
      }
    }
    flushParagraphs()
  }

  for (const [path, field] of fields) {
    if (field.kinds.size > 1) {
      diagnostics.push(
        templateDiagnostic(
          "TEMPLATE_TYPE_CONFLICT",
          `Template field ${path} has incompatible inferred or explicit types`,
          field.first.source,
          field.first.node
        )
      )
    }
  }
  for (const [parent, child] of nestedPathConflicts(fields)) {
    const field = fields.get(parent)
    if (field !== undefined)
      diagnostics.push(
        templateDiagnostic(
          "TEMPLATE_PATH_CONFLICT",
          `Template field ${parent} conflicts with nested field ${child}`,
          field.first.source,
          field.first.node
        )
      )
  }

  const manifestFields = buildManifest(fields)
  return {
    version: options.version ?? "phase-6",
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
