import {
  DEFAULT_RESOURCE_LIMITS,
  hasErrors,
  throwIfAborted,
  type CompiledTemplate,
  type Diagnostic,
  type FormatterReference,
  type OperationResult,
  type ResolvedDocument,
  type ResourceLimits,
  type SemanticBlock,
  type SemanticHeaderFooter,
  type SemanticImage,
  type SemanticImageAsset,
  type SemanticInline,
  type SemanticParagraph,
  type SemanticTable,
  type SemanticTableCell,
  type SemanticTableRow,
  type SemanticText,
  type TemplateFieldKind,
} from "@apex-docx-pdf/core"

import {
  inlineLogicalLength,
  parseBlockMarker,
  parseParagraph,
  parseTableRowMarker,
  templateDiagnostic,
  type ParsedPlaceholder,
} from "./internal"
import { formatDateTime, parseDateTimeFormat } from "./date-format"
import {
  canonicalFormatterLocale,
  formatCanonicalCurrency,
} from "./locale-format"

export type TemplateResolveOptions = Readonly<{
  /** Strict is the default. Permissive value resolution warns and substitutes empty text. */
  permissive?: boolean
  /** Explicit locale used by locale-sensitive formatters. No ambient locale is read. */
  locale?: string
  /** Explicit IANA time zone used by the date formatter. No ambient time zone is read. */
  timeZone?: string
  limits?: Partial<
    Pick<
      ResourceLimits,
      | "maxExpressionDepth"
      | "maxObjectTraversalDepth"
      | "maxLoopIterations"
      | "maxExpandedNodes"
      | "maxExpandedTextBytes"
    >
  >
  signal?: AbortSignal
}>

export type TemplateResolutionResult = Readonly<{
  document: ResolvedDocument
  expandedNodes: number
  expandedTextBytes: number
}>

type ResolvedValue =
  | Readonly<{ ok: true; text: string }>
  | Readonly<{ ok: false; code: string; message: string }>
type DataContext = Readonly<{
  root: Readonly<Record<string, unknown>>
  current?: Readonly<Record<string, unknown>>
  canonicalBase?: string
}>
type ParagraphNode = Readonly<{
  type: "paragraph"
  paragraph: SemanticParagraph
}>
type Marker = Exclude<
  NonNullable<ReturnType<typeof parseBlockMarker>>,
  Diagnostic
>
type IfNode = {
  type: "if"
  marker: Marker & { type: "if"; path: string }
  consequent: TemplateNode[]
  alternate: TemplateNode[]
}
type EachNode = {
  type: "each"
  marker: Marker & { type: "each"; path: string }
  children: TemplateNode[]
}
type TemplateNode = ParagraphNode | IfNode | EachNode
type TableRowNode = Readonly<{
  type: "row"
  row: SemanticTableRow
}>
type TableIfNode = {
  type: "if"
  marker: Marker & { type: "if"; path: string }
  consequent: TableTemplateNode[]
  alternate: TableTemplateNode[]
}
type TableEachNode = {
  type: "each"
  marker: Marker & { type: "each"; path: string }
  children: TableTemplateNode[]
}
type TableTemplateNode = TableRowNode | TableIfNode | TableEachNode
type ExpansionState = {
  iterations: number
  nodes: number
  textBytes: number
  stopped: boolean
  diagnostics: Diagnostic[]
  assets: SemanticImageAsset[]
  imageBytes: number
  imageOrdinal: number
}

type ImageReplacement = Readonly<{
  image: SemanticImage
  asset: SemanticImageAsset
}>

function positiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0
}

function resolveImageValue(
  value: unknown,
  placeholder: ParsedPlaceholder,
  state: ExpansionState,
  limits: ResourceLimits,
  iterationKey?: string
): ImageReplacement | ResolvedValue {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {
      ok: false,
      code: "TEMPLATE_IMAGE_VALUE_TYPE",
      message:
        "Expected an image value object with explicit bytes and dimensions",
    }
  }
  const image = value as Readonly<Record<string, unknown>>
  const mimeType = image.mimeType
  const rawBytes = image.bytes
  const bytes =
    rawBytes instanceof Uint8Array
      ? Array.from(rawBytes)
      : Array.isArray(rawBytes) &&
          rawBytes.every(
            (byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255
          )
        ? rawBytes.slice()
        : undefined
  if (
    (mimeType !== "image/png" && mimeType !== "image/jpeg") ||
    bytes === undefined ||
    bytes.length === 0 ||
    !positiveSafeInteger(image.pixelWidth) ||
    !positiveSafeInteger(image.pixelHeight) ||
    !positiveSafeInteger(image.width) ||
    !positiveSafeInteger(image.height) ||
    (image.preserveAspectRatio !== undefined &&
      typeof image.preserveAspectRatio !== "boolean") ||
    (image.altText !== undefined && typeof image.altText !== "string")
  ) {
    return {
      ok: false,
      code: "TEMPLATE_IMAGE_VALUE_TYPE",
      message:
        "Image values require PNG/JPEG Uint8Array bytes, positive pixel dimensions, positive twip bounds, and valid optional metadata",
    }
  }
  if (
    state.assets.length >= limits.maxImageCount ||
    bytes.length > limits.maxImageBytes ||
    state.imageBytes + bytes.length > limits.maxImageBytes ||
    image.pixelWidth > limits.maxImageDimensionPixels ||
    image.pixelHeight > limits.maxImageDimensionPixels ||
    image.pixelWidth * image.pixelHeight > limits.maxImagePixels
  ) {
    return {
      ok: false,
      code: "TEMPLATE_IMAGE_LIMIT",
      message: "The dynamic image exceeds the configured image resource limits",
    }
  }
  const preserve = image.preserveAspectRatio !== false
  let width = image.width
  let height = image.height
  if (preserve) {
    const intrinsicRatio = image.pixelWidth / image.pixelHeight
    if (width / height > intrinsicRatio)
      width = Math.max(1, Math.round(height * intrinsicRatio))
    else height = Math.max(1, Math.round(width / intrinsicRatio))
  }
  const ordinal = state.imageOrdinal
  state.imageOrdinal += 1
  state.imageBytes += bytes.length
  const suffix =
    iterationKey === undefined ? `${ordinal}` : `${iterationKey}-${ordinal}`
  const assetId = `template-image:${placeholder.node.id}:${suffix}`
  const asset: SemanticImageAsset = {
    type: "imageAsset",
    id: assetId,
    source: placeholder.source,
    packagePath: `template-data/${suffix}`,
    mimeType,
    bytes,
    pixelWidth: image.pixelWidth,
    pixelHeight: image.pixelHeight,
  }
  return {
    asset,
    image: {
      type: "image",
      id: expandedId(placeholder.node.id, iterationKey, `~image-${ordinal}`),
      source: placeholder.source,
      assetId,
      width: width as SemanticImage["width"],
      height: height as SemanticImage["height"],
      aspect: {
        pixelWidth: image.pixelWidth,
        pixelHeight: image.pixelHeight,
        intrinsicRatio: image.pixelWidth / image.pixelHeight,
        preserve,
      },
      ...(image.altText === undefined ? {} : { altText: image.altText }),
    },
  }
}

function limitsFor(options: TemplateResolveOptions): ResourceLimits {
  return { ...DEFAULT_RESOURCE_LIMITS, ...options.limits }
}

function canonicalPath(context: DataContext, path: string): string {
  return context.canonicalBase === undefined
    ? path
    : `${context.canonicalBase}.${path}`
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

function lookup(
  context: DataContext,
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
      message: `Template path ${path} exceeds the ${limits.maxObjectTraversalDepth}-segment traversal limit`,
    }
  }
  let current: unknown = context.current ?? context.root
  for (const segment of segments) {
    if (
      typeof current !== "object" ||
      current === null ||
      Array.isArray(current) ||
      !Object.hasOwn(current, segment)
    ) {
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
  if (kind === "string" || kind === "date")
    return typeof value === "string"
      ? { ok: true, text: value }
      : {
          ok: false,
          code: "TEMPLATE_VALUE_TYPE",
          message: `Expected a ${kind} string value`,
        }
  if (kind === "number")
    return typeof value === "number" && Number.isFinite(value)
      ? { ok: true, text: String(value) }
      : {
          ok: false,
          code: "TEMPLATE_VALUE_TYPE",
          message: "Expected a finite number value",
        }
  if (kind === "boolean")
    return typeof value === "boolean"
      ? { ok: true, text: value ? "true" : "false" }
      : {
          ok: false,
          code: "TEMPLATE_VALUE_TYPE",
          message: "Expected a boolean value",
        }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return { ok: true, text: String(value) }
  return {
    ok: false,
    code: "TEMPLATE_VALUE_TYPE",
    message: "Expected a string, number, or boolean value",
  }
}

function applyFormatters(
  value: unknown,
  kind: TemplateFieldKind,
  formatters: readonly FormatterReference[],
  options: TemplateResolveOptions
): ResolvedValue {
  const base = asText(value, kind)
  if (!base.ok || formatters.length === 0) return base
  let text = base.text
  try {
    for (const formatter of formatters) {
      if (formatter.name === "upper") text = text.toUpperCase()
      else if (formatter.name === "lower") text = text.toLowerCase()
      else if (formatter.name === "currency") {
        if (options.locale === undefined)
          return {
            ok: false,
            code: "TEMPLATE_FORMATTER_CONTEXT",
            message: "The currency formatter requires an explicit locale",
          }
        const locale = canonicalFormatterLocale(options.locale)
        if (locale === undefined)
          return {
            ok: false,
            code: "TEMPLATE_FORMATTER_CONTEXT",
            message:
              "The currency formatter supports only the canonical en-US and en-ZA locale profiles",
          }
        const formatted = formatCanonicalCurrency(
          value as number,
          String(formatter.arguments[0]),
          locale
        )
        if (formatted === undefined)
          return {
            ok: false,
            code: "TEMPLATE_VALUE_TYPE",
            message:
              "The currency formatter requires a finite value within the safe integer magnitude",
          }
        text = formatted
      } else if (formatter.name === "date") {
        if (options.locale === undefined || options.timeZone === undefined)
          return {
            ok: false,
            code: "TEMPLATE_FORMATTER_CONTEXT",
            message:
              "The date formatter requires explicit locale and timeZone values",
          }
        if (canonicalFormatterLocale(options.locale) === undefined)
          return {
            ok: false,
            code: "TEMPLATE_FORMATTER_CONTEXT",
            message:
              "The date formatter supports only the canonical en-US and en-ZA locale profiles",
          }
        if (
          typeof value !== "string" ||
          !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(
            value
          )
        )
          return {
            ok: false,
            code: "TEMPLATE_VALUE_TYPE",
            message:
              "The date formatter requires an ISO 8601 date-time string with an explicit offset",
          }
        const date = new Date(value)
        if (Number.isNaN(date.getTime()))
          return {
            ok: false,
            code: "TEMPLATE_VALUE_TYPE",
            message: "The date formatter received an invalid date-time",
          }
        const pattern = parseDateTimeFormat(String(formatter.arguments[0]))
        if (pattern === undefined)
          return {
            ok: false,
            code: "TEMPLATE_FORMATTER_ARGUMENT",
            message: "The date formatter received an invalid format pattern",
          }
        text = formatDateTime(date, pattern, options.timeZone)
      }
    }
  } catch {
    return {
      ok: false,
      code: "TEMPLATE_FORMATTER_CONTEXT",
      message:
        "The formatter locale, time zone, or currency configuration is invalid",
    }
  }
  return { ok: true, text }
}

function sourcePieces(
  paragraph: SemanticParagraph,
  start: number,
  end: number,
  addText: (source: SemanticText, text: string, whole: boolean) => void,
  addNonText: (source: Exclude<SemanticInline, SemanticText>) => void
): void {
  let cursor = 0
  for (const child of paragraph.children) {
    if (child.type !== "text") {
      const childEnd = cursor + 1
      if (start <= cursor && childEnd <= end) addNonText(child)
      cursor = childEnd
      continue
    }
    const childStart = cursor
    const childEnd = childStart + child.text.length
    const from = Math.max(start, childStart)
    const to = Math.min(end, childEnd)
    if (from < to)
      addText(
        child,
        child.text.slice(from - childStart, to - childStart),
        from === childStart && to === childEnd
      )
    cursor = childEnd
  }
}

function expandedId(
  id: string,
  iterationKey: string | undefined,
  suffix?: string
): SemanticInline["id"] {
  return `${id}${iterationKey === undefined ? "" : `~each-${iterationKey}`}${suffix ?? ""}` as SemanticText["id"]
}

function addBudget(
  state: ExpansionState,
  limits: ResourceLimits,
  source: Readonly<{ source: SemanticParagraph["source"] }>,
  text?: string
): boolean {
  state.nodes += 1
  if (text !== undefined)
    state.textBytes += new TextEncoder().encode(text).byteLength
  if (state.nodes > limits.maxExpandedNodes) {
    state.diagnostics.push(
      templateDiagnostic(
        "TEMPLATE_EXPANDED_NODE_LIMIT",
        `Resolved output exceeds the ${limits.maxExpandedNodes}-node limit`,
        source.source
      )
    )
    state.stopped = true
  } else if (state.textBytes > limits.maxExpandedTextBytes) {
    state.diagnostics.push(
      templateDiagnostic(
        "TEMPLATE_EXPANDED_TEXT_LIMIT",
        `Resolved output exceeds the ${limits.maxExpandedTextBytes}-byte text limit`,
        source.source
      )
    )
    state.stopped = true
  }
  return !state.stopped
}

function resolveParagraph(
  paragraph: SemanticParagraph,
  context: DataContext,
  fieldKinds: ReadonlyMap<string, TemplateFieldKind>,
  options: TemplateResolveOptions,
  limits: ResourceLimits,
  state: ExpansionState,
  iterationKey?: string
): SemanticParagraph | undefined {
  const parsed = parseParagraph(paragraph, limits)
  if (parsed.diagnostics.length > 0) {
    state.diagnostics.push(...parsed.diagnostics)
    return undefined
  }
  const replacements: Array<
    Readonly<{
      placeholder: ParsedPlaceholder
      value: string | ImageReplacement
    }>
  > = []
  for (const placeholder of parsed.placeholders) {
    throwIfAborted(options.signal)
    const located = lookup(context, placeholder.path, limits)
    const result: ResolvedValue | ImageReplacement = located.found
      ? placeholder.kind === "image"
        ? resolveImageValue(
            located.value,
            placeholder,
            state,
            limits,
            iterationKey
          )
        : applyFormatters(
            located.value,
            fieldKinds.get(canonicalPath(context, placeholder.path)) ??
              placeholder.kind,
            placeholder.formatters,
            options
          )
      : { ok: false, code: located.code, message: located.message }
    if ("image" in result) replacements.push({ placeholder, value: result })
    else if (result.ok) replacements.push({ placeholder, value: result.text })
    else {
      state.diagnostics.push(
        diagnostic(
          placeholder,
          result.code,
          options.permissive ? "warning" : "error",
          result.message
        )
      )
      replacements.push({ placeholder, value: "" })
    }
  }
  const children: SemanticInline[] = []
  let ordinal = 0
  const append = (source: SemanticText, text: string, whole: boolean): void => {
    if (text.length === 0 || state.stopped) return
    const unchanged = whole && iterationKey === undefined
    children.push(
      unchanged
        ? source
        : {
            ...source,
            id: expandedId(
              source.id,
              iterationKey,
              whole ? undefined : `~template-${ordinal}`
            ),
            text,
          }
    )
    ordinal += 1
  }
  const appendNonText = (
    source: Exclude<SemanticInline, SemanticText>
  ): void => {
    if (state.stopped) return
    children.push(
      iterationKey === undefined
        ? source
        : { ...source, id: expandedId(source.id, iterationKey) }
    )
  }
  let cursor = 0
  for (const replacement of replacements) {
    sourcePieces(
      paragraph,
      cursor,
      replacement.placeholder.start,
      append,
      appendNonText
    )
    if (typeof replacement.value === "string")
      append(replacement.placeholder.node, replacement.value, false)
    else {
      children.push(replacement.value.image)
      state.assets.push(replacement.value.asset)
    }
    cursor = replacement.placeholder.end
  }
  sourcePieces(
    paragraph,
    cursor,
    paragraph.children.reduce(
      (total, child) => total + inlineLogicalLength(child),
      0
    ),
    append,
    appendNonText
  )
  if (!addBudget(state, limits, paragraph)) return undefined
  for (const child of children)
    if (
      !addBudget(
        state,
        limits,
        paragraph,
        child.type === "text" ? child.text : undefined
      )
    )
      return undefined
  return {
    ...paragraph,
    id: expandedId(paragraph.id, iterationKey) as SemanticParagraph["id"],
    children,
  }
}

function buildTree(
  blocks: readonly SemanticParagraph[],
  limits: ResourceLimits,
  diagnostics: Diagnostic[]
): TemplateNode[] {
  const root: TemplateNode[] = []
  const containers: TemplateNode[][] = [root]
  const frames: (IfNode | EachNode)[] = []
  for (const paragraph of blocks) {
    const marker = parseBlockMarker(paragraph, limits)
    if (marker !== undefined && "code" in marker) {
      diagnostics.push(marker)
      continue
    }
    if (marker === undefined) {
      containers.at(-1)?.push({ type: "paragraph", paragraph })
      continue
    }
    if (marker.type === "if" && marker.path !== undefined) {
      const node: IfNode = {
        type: "if",
        marker: marker as IfNode["marker"],
        consequent: [],
        alternate: [],
      }
      containers.at(-1)?.push(node)
      frames.push(node)
      containers.push(node.consequent)
    } else if (marker.type === "each" && marker.path !== undefined) {
      const node: EachNode = {
        type: "each",
        marker: marker as EachNode["marker"],
        children: [],
      }
      containers.at(-1)?.push(node)
      frames.push(node)
      containers.push(node.children)
    } else if (marker.type === "else") {
      containers.pop()
      containers.push((frames.at(-1) as IfNode).alternate)
    } else {
      containers.pop()
      frames.pop()
    }
  }
  return root
}

function resolveNodes(
  nodes: readonly TemplateNode[],
  context: DataContext,
  fieldKinds: ReadonlyMap<string, TemplateFieldKind>,
  options: TemplateResolveOptions,
  limits: ResourceLimits,
  state: ExpansionState,
  output: SemanticParagraph[],
  iterationKey?: string
): void {
  for (const node of nodes) {
    if (state.stopped) return
    throwIfAborted(options.signal)
    if (node.type === "paragraph") {
      const paragraph = resolveParagraph(
        node.paragraph,
        context,
        fieldKinds,
        options,
        limits,
        state,
        iterationKey
      )
      if (paragraph !== undefined) output.push(paragraph)
      continue
    }
    const located = lookup(context, node.marker.path, limits)
    if (!located.found) {
      state.diagnostics.push(
        templateDiagnostic(
          located.code,
          located.message,
          node.marker.source,
          node.marker.node
        )
      )
      continue
    }
    if (node.type === "if") {
      if (typeof located.value !== "boolean") {
        state.diagnostics.push(
          templateDiagnostic(
            "TEMPLATE_VALUE_TYPE",
            `Condition ${node.marker.path} must be boolean`,
            node.marker.source,
            node.marker.node
          )
        )
        continue
      }
      resolveNodes(
        located.value ? node.consequent : node.alternate,
        context,
        fieldKinds,
        options,
        limits,
        state,
        output,
        iterationKey
      )
      continue
    }
    if (!Array.isArray(located.value)) {
      state.diagnostics.push(
        templateDiagnostic(
          "TEMPLATE_VALUE_TYPE",
          `Loop ${node.marker.path} must be an array`,
          node.marker.source,
          node.marker.node
        )
      )
      continue
    }
    for (let index = 0; index < located.value.length; index += 1) {
      throwIfAborted(options.signal)
      state.iterations += 1
      if (state.iterations > limits.maxLoopIterations) {
        state.diagnostics.push(
          templateDiagnostic(
            "TEMPLATE_LOOP_LIMIT",
            `Template loops exceed the cumulative ${limits.maxLoopIterations}-iteration limit`,
            node.marker.source,
            node.marker.node
          )
        )
        state.stopped = true
        return
      }
      const item = located.value[index]
      if (typeof item !== "object" || item === null || Array.isArray(item)) {
        state.diagnostics.push(
          templateDiagnostic(
            "TEMPLATE_VALUE_TYPE",
            `Loop ${node.marker.path} item ${index} must be an object`,
            node.marker.source,
            node.marker.node
          )
        )
        continue
      }
      resolveNodes(
        node.children,
        {
          root: context.root,
          current: item as Readonly<Record<string, unknown>>,
          canonicalBase: `${canonicalPath(context, node.marker.path)}[]`,
        },
        fieldKinds,
        options,
        limits,
        state,
        output,
        iterationKey === undefined ? String(index) : `${iterationKey}-${index}`
      )
    }
  }
}

function buildTableTree(
  table: SemanticTable,
  limits: ResourceLimits,
  diagnostics: Diagnostic[]
): TableTemplateNode[] {
  const root: TableTemplateNode[] = []
  const containers: TableTemplateNode[][] = [root]
  const frames: (TableIfNode | TableEachNode)[] = []
  for (const row of table.rows) {
    const marker = parseTableRowMarker(row, limits)
    if (marker !== undefined && "code" in marker) {
      diagnostics.push(marker)
      continue
    }
    if (marker === undefined) {
      containers.at(-1)?.push({ type: "row", row })
      continue
    }
    if (marker.type === "if" && marker.path !== undefined) {
      const node: TableIfNode = {
        type: "if",
        marker: marker as TableIfNode["marker"],
        consequent: [],
        alternate: [],
      }
      containers.at(-1)?.push(node)
      frames.push(node)
      containers.push(node.consequent)
    } else if (marker.type === "each" && marker.path !== undefined) {
      const node: TableEachNode = {
        type: "each",
        marker: marker as TableEachNode["marker"],
        children: [],
      }
      containers.at(-1)?.push(node)
      frames.push(node)
      containers.push(node.children)
    } else if (marker.type === "else") {
      containers.pop()
      containers.push((frames.at(-1) as TableIfNode).alternate)
    } else {
      containers.pop()
      frames.pop()
    }
  }
  return root
}

function resolveTableCell(
  cell: SemanticTableCell,
  context: DataContext,
  fieldKinds: ReadonlyMap<string, TemplateFieldKind>,
  options: TemplateResolveOptions,
  limits: ResourceLimits,
  state: ExpansionState,
  iterationKey?: string
): SemanticTableCell | undefined {
  if (!addBudget(state, limits, cell)) return undefined
  const blocks: SemanticParagraph[] = []
  resolveNodes(
    buildTree(cell.blocks, limits, state.diagnostics),
    context,
    fieldKinds,
    options,
    limits,
    state,
    blocks,
    iterationKey
  )
  return {
    ...cell,
    id: expandedId(cell.id, iterationKey) as SemanticTableCell["id"],
    blocks,
  }
}

function resolveTableRow(
  row: SemanticTableRow,
  context: DataContext,
  fieldKinds: ReadonlyMap<string, TemplateFieldKind>,
  options: TemplateResolveOptions,
  limits: ResourceLimits,
  state: ExpansionState,
  iterationKey?: string
): SemanticTableRow | undefined {
  if (!addBudget(state, limits, row)) return undefined
  const cells: SemanticTableCell[] = []
  for (const cell of row.cells) {
    const resolved = resolveTableCell(
      cell,
      context,
      fieldKinds,
      options,
      limits,
      state,
      iterationKey
    )
    if (resolved !== undefined) cells.push(resolved)
  }
  return {
    ...row,
    id: expandedId(row.id, iterationKey) as SemanticTableRow["id"],
    cells,
  }
}

function resolveTableNodes(
  nodes: readonly TableTemplateNode[],
  context: DataContext,
  fieldKinds: ReadonlyMap<string, TemplateFieldKind>,
  options: TemplateResolveOptions,
  limits: ResourceLimits,
  state: ExpansionState,
  output: SemanticTableRow[],
  iterationKey?: string
): void {
  for (const node of nodes) {
    if (state.stopped) return
    throwIfAborted(options.signal)
    if (node.type === "row") {
      const row = resolveTableRow(
        node.row,
        context,
        fieldKinds,
        options,
        limits,
        state,
        iterationKey
      )
      if (row !== undefined) output.push(row)
      continue
    }
    const located = lookup(context, node.marker.path, limits)
    if (!located.found) {
      state.diagnostics.push(
        templateDiagnostic(
          located.code,
          located.message,
          node.marker.source,
          node.marker.node
        )
      )
      continue
    }
    if (node.type === "if") {
      if (typeof located.value !== "boolean") {
        state.diagnostics.push(
          templateDiagnostic(
            "TEMPLATE_VALUE_TYPE",
            `Condition ${node.marker.path} must be boolean`,
            node.marker.source,
            node.marker.node
          )
        )
        continue
      }
      resolveTableNodes(
        located.value ? node.consequent : node.alternate,
        context,
        fieldKinds,
        options,
        limits,
        state,
        output,
        iterationKey
      )
      continue
    }
    if (!Array.isArray(located.value)) {
      state.diagnostics.push(
        templateDiagnostic(
          "TEMPLATE_VALUE_TYPE",
          `Loop ${node.marker.path} must be an array`,
          node.marker.source,
          node.marker.node
        )
      )
      continue
    }
    for (let index = 0; index < located.value.length; index += 1) {
      throwIfAborted(options.signal)
      state.iterations += 1
      if (state.iterations > limits.maxLoopIterations) {
        state.diagnostics.push(
          templateDiagnostic(
            "TEMPLATE_LOOP_LIMIT",
            `Template loops exceed the cumulative ${limits.maxLoopIterations}-iteration limit`,
            node.marker.source,
            node.marker.node
          )
        )
        state.stopped = true
        return
      }
      const item = located.value[index]
      if (typeof item !== "object" || item === null || Array.isArray(item)) {
        state.diagnostics.push(
          templateDiagnostic(
            "TEMPLATE_VALUE_TYPE",
            `Loop ${node.marker.path} item ${index} must be an object`,
            node.marker.source,
            node.marker.node
          )
        )
        continue
      }
      resolveTableNodes(
        node.children,
        {
          root: context.root,
          current: item as Readonly<Record<string, unknown>>,
          canonicalBase: `${canonicalPath(context, node.marker.path)}[]`,
        },
        fieldKinds,
        options,
        limits,
        state,
        output,
        iterationKey === undefined ? String(index) : `${iterationKey}-${index}`
      )
    }
  }
}

function resolveTable(
  table: SemanticTable,
  data: Readonly<Record<string, unknown>>,
  fieldKinds: ReadonlyMap<string, TemplateFieldKind>,
  options: TemplateResolveOptions,
  limits: ResourceLimits,
  state: ExpansionState
): SemanticTable {
  const rows: SemanticTableRow[] = []
  if (!addBudget(state, limits, table)) return { ...table, rows }
  resolveTableNodes(
    buildTableTree(table, limits, state.diagnostics),
    { root: data },
    fieldKinds,
    options,
    limits,
    state,
    rows
  )
  return { ...table, rows }
}

function resolveParagraphSequence(
  paragraphs: readonly SemanticParagraph[],
  data: Readonly<Record<string, unknown>>,
  fieldKinds: ReadonlyMap<string, TemplateFieldKind>,
  options: TemplateResolveOptions,
  limits: ResourceLimits,
  state: ExpansionState
): SemanticParagraph[] {
  const output: SemanticParagraph[] = []
  resolveNodes(
    buildTree(paragraphs, limits, state.diagnostics),
    { root: data },
    fieldKinds,
    options,
    limits,
    state,
    output
  )
  return output
}

function resolveHeaderFooter(
  definition: SemanticHeaderFooter,
  data: Readonly<Record<string, unknown>>,
  fieldKinds: ReadonlyMap<string, TemplateFieldKind>,
  options: TemplateResolveOptions,
  limits: ResourceLimits,
  state: ExpansionState
): SemanticHeaderFooter {
  if (!addBudget(state, limits, definition))
    return { ...definition, blocks: [] }
  return {
    ...definition,
    blocks: resolveParagraphSequence(
      definition.blocks,
      data,
      fieldKinds,
      options,
      limits,
      state
    ),
  }
}

/** Resolves a compiled template without evaluating arbitrary template code. */
export function resolveTemplate(
  compiled: CompiledTemplate,
  data: Readonly<Record<string, unknown>>,
  options: TemplateResolveOptions = {}
): OperationResult<ResolvedDocument> {
  const result = resolveTemplateWithUsage(compiled, data, options)
  if (!result.ok) return result
  return {
    ok: true,
    value: result.value.document,
    diagnostics: result.diagnostics,
  }
}

/** Resolves while exposing the exact deterministic expansion-budget counters. */
export function resolveTemplateWithUsage(
  compiled: CompiledTemplate,
  data: Readonly<Record<string, unknown>>,
  options: TemplateResolveOptions = {}
): OperationResult<TemplateResolutionResult> {
  throwIfAborted(options.signal)
  const limits = limitsFor(options)
  const state: ExpansionState = {
    iterations: 0,
    nodes: 0,
    textBytes: 0,
    stopped: false,
    diagnostics: [...compiled.diagnostics],
    assets: compiled.source.assets.slice(),
    imageBytes: compiled.source.assets.reduce(
      (total, asset) => total + asset.bytes.length,
      0
    ),
    imageOrdinal: 0,
  }
  if (hasErrors(state.diagnostics))
    return { ok: false, diagnostics: state.diagnostics }
  const fieldKinds = new Map(
    compiled.manifest.fields.map((field) => [field.path, field.kind])
  )
  const headers = compiled.source.headers.map((header) =>
    resolveHeaderFooter(header, data, fieldKinds, options, limits, state)
  )
  const footers = compiled.source.footers.map((footer) =>
    resolveHeaderFooter(footer, data, fieldKinds, options, limits, state)
  )
  const sections = compiled.source.sections.map((section) => {
    const blocks: SemanticBlock[] = []
    let paragraphs: SemanticParagraph[] = []
    const flushParagraphs = (): void => {
      if (paragraphs.length === 0) return
      blocks.push(
        ...resolveParagraphSequence(
          paragraphs,
          data,
          fieldKinds,
          options,
          limits,
          state
        )
      )
      paragraphs = []
    }
    for (const block of section.blocks) {
      if (block.type === "paragraph") paragraphs.push(block)
      else if (block.type === "table") {
        flushParagraphs()
        blocks.push(
          resolveTable(block, data, fieldKinds, options, limits, state)
        )
      } else {
        flushParagraphs()
        blocks.push(block)
      }
    }
    flushParagraphs()
    return { ...section, blocks }
  })
  if (hasErrors(state.diagnostics))
    return { ok: false, diagnostics: state.diagnostics }
  return {
    ok: true,
    value: {
      document: {
        ...compiled.source,
        assets: state.assets,
        headers,
        footers,
        sections,
      } as ResolvedDocument,
      expandedNodes: state.nodes,
      expandedTextBytes: state.textBytes,
    },
    diagnostics: state.diagnostics,
  }
}

export const resolve = resolveTemplate
