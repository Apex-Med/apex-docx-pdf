import {
  DEFAULT_RESOURCE_LIMITS,
  documentHash,
  hasErrors,
  throwIfAborted,
  type Diagnostic,
  type DocxPdfEngine,
  type DocumentHash,
  type EngineOptions,
  type RenderOptions,
  type RenderResult,
  type ResourceLimits,
  type DocumentFeatureInspection,
  type RequiredFontInspection,
  type FontConfiguration,
  type SemanticBlock,
  type SemanticDocument,
  type SemanticInline,
  type SemanticParagraph,
  type SourceLocation,
  type TemplateInspectionResult,
} from "@apexmed/core"
import { normaliseDocxBytes, normaliseDocxBytesWithUsage } from "@apexmed/docx"
import { createFontRegistry, type ManagedFontRegistry } from "@apexmed/fonts"
import {
  ImagePreparationError,
  prepareImageAssetsAsync,
  type ImagePreparationProvider,
} from "@apexmed/images"
import { layoutDocument } from "@apexmed/layout"
import { serializePdf } from "@apexmed/pdf"
import { compileTemplate, resolveTemplateWithUsage } from "@apexmed/template"

// Cache compatibility identifier. Bump whenever compilation or rendered bytes
// can change, independently of the npm package version.
export const ENGINE_VERSION = "0.0.0-phase.8"

export class EngineOperationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly diagnostics: readonly Diagnostic[]
  ) {
    super(message)
    this.name = "EngineOperationError"
  }
}

export async function createDocxPdfEngine(
  options: EngineOptions = {}
): Promise<DocxPdfEngine> {
  const limits: ResourceLimits = Object.freeze({
    ...DEFAULT_RESOURCE_LIMITS,
    ...options.limits,
  })
  if (options.textShaper !== undefined && options.fonts === undefined) {
    throw new TypeError(
      "A custom textShaper requires an explicit font configuration"
    )
  }
  const fontRegistry = options.fonts
    ? await createFontRegistry(options.fonts)
    : undefined
  const compiledTemplates = new WeakSet<object>()
  const compiledFontRegistries = new WeakMap<object, ManagedFontRegistry>()
  const staticImages = new WeakMap<object, ImagePreparationProvider>()
  const packageUsage = new WeakMap<
    object,
    Readonly<{
      templateBytes: number
      archiveEntries: number
      decompressedBytes: number
    }>
  >()

  const engine: DocxPdfEngine = {
    version: ENGINE_VERSION,
    ...(fontRegistry ? { fontRegistryHash: fontRegistry.registryHash } : {}),
    async inspect(templateBytes, inspectOptions = {}) {
      await yieldToAbort(inspectOptions.signal)
      const result = normaliseDocxBytes(templateBytes, {
        limits,
        signal: inspectOptions.signal,
        unsupportedFeatures: "lenient",
      })
      return inspectSemanticDocument(
        result.ok ? result.value : undefined,
        result.diagnostics
      )
    },

    async compile(templateBytes, compileOptions = {}) {
      await yieldToAbort(compileOptions.signal)
      const templateHash = await sha256(templateBytes, compileOptions.signal)
      const normalised = normaliseDocxBytesWithUsage(templateBytes, {
        limits,
        signal: compileOptions.signal,
        unsupportedFeatures: compileOptions.unsupportedFeatures,
      })
      if (!normalised.ok) {
        throwForContentLossDiagnostics(normalised.diagnostics)
        throw new EngineOperationError(
          "engine/docx",
          "The DOCX template could not be compiled",
          normalised.diagnostics
        )
      }
      throwForUnacceptableTemplateDiagnostics(normalised.diagnostics)
      let images: ImagePreparationProvider
      try {
        images = await prepareImageAssetsAsync(
          normalised.value.document.assets,
          {
            limits: {
              maxBytes: limits.maxImageBytes,
              maxDimensionPixels: limits.maxImageDimensionPixels,
              maxPixels: limits.maxImagePixels,
              maxDecodedBytes: limits.maxDecodedImageBytes,
            },
            signal: compileOptions.signal,
          }
        )
      } catch (error) {
        if (!(error instanceof ImagePreparationError)) throw error
        const diagnostic: Diagnostic = Object.freeze({
          code: error.code,
          severity: "error",
          message: error.message,
          details: { assetId: error.assetId },
        })
        throw new EngineOperationError(
          "engine/image",
          "An embedded image could not be prepared safely",
          Object.freeze([...normalised.diagnostics, diagnostic])
        )
      }
      const compiled = await compileTemplate(normalised.value.document, {
        limits,
        signal: compileOptions.signal,
        templateHash,
        version: ENGINE_VERSION,
      })
      const diagnostics = [...normalised.diagnostics, ...compiled.diagnostics]
      throwForUnacceptableTemplateDiagnostics(diagnostics)
      const result = deepFreeze({
        ...compiled,
        diagnostics,
      })
      compiledTemplates.add(result)
      const embeddedFontConfiguration = fontConfigurationForDocument(
        normalised.value.document,
        options.fonts
      )
      const compiledFontRegistry =
        embeddedFontConfiguration === options.fonts
          ? fontRegistry
          : embeddedFontConfiguration
            ? await createFontRegistry(embeddedFontConfiguration)
            : undefined
      if (compiledFontRegistry) {
        compiledFontRegistries.set(result, compiledFontRegistry)
      }
      staticImages.set(result, images)
      packageUsage.set(
        result,
        Object.freeze({
          templateBytes: templateBytes.byteLength,
          archiveEntries: normalised.value.archiveEntries,
          decompressedBytes: normalised.value.decompressedBytes,
        })
      )
      return result
    },

    async preview(compiled, previewOptions = {}) {
      await yieldToAbort(previewOptions.signal)
      if (!compiledTemplates.has(compiled)) {
        throw new EngineOperationError(
          "engine/compiled-template",
          "The compiled template was not created by this engine instance",
          []
        )
      }
      throwForUnacceptableTemplateDiagnostics(compiled.diagnostics)
      const commonLayoutOptions = {
        maxPages: limits.maxPages,
        signal: previewOptions.signal,
        includeTrace: true,
      }
      const compiledFontRegistry = compiledFontRegistries.get(compiled)
      const compiledTextShaper = options.textShaper ?? compiledFontRegistry
      const layout =
        compiledFontRegistry && compiledTextShaper
          ? layoutDocument(compiled.source, {
              ...commonLayoutOptions,
              fonts: compiledFontRegistry,
              shaper: compiledTextShaper,
            })
          : layoutDocument(compiled.source, commonLayoutOptions)
      if (hasErrors(layout.diagnostics)) {
        throw new EngineOperationError(
          "engine/preview",
          "The template preview could not be laid out without content loss",
          layout.diagnostics
        )
      }
      if (!layout.trace) {
        throw new EngineOperationError(
          "engine/preview-trace",
          "The template preview did not produce its required layout trace",
          layout.diagnostics
        )
      }
      return Object.freeze({
        displayList: layout.displayList,
        placeholderNodes: compiled.placeholderNodes,
        layoutTrace: layout.trace,
        diagnostics: layout.diagnostics,
      })
    },

    async render(compiled, data, renderOptions) {
      validateRenderOptions(renderOptions)
      throwIfAborted(renderOptions.signal)
      if (!compiledTemplates.has(compiled)) {
        throw new EngineOperationError(
          "engine/compiled-template",
          "The compiled template was not created by this engine instance",
          []
        )
      }
      throwForUnacceptableTemplateDiagnostics(compiled.diagnostics)
      const safeData = cloneBoundedJsonData(data, limits)
      const startedAt = now()
      const resolveStartedAt = now()
      const resolved = resolveTemplateWithUsage(compiled, safeData, {
        limits,
        signal: renderOptions.signal,
        locale: renderOptions.locale,
        timeZone: renderOptions.timeZone,
      })
      const resolvedAt = now()
      if (!resolved.ok) {
        throw new EngineOperationError(
          "engine/template-data",
          "Template data did not satisfy the compiled manifest",
          resolved.diagnostics
        )
      }

      let renderImages = staticImages.get(compiled)
      try {
        const dynamicAssets = resolved.value.document.assets.slice(
          compiled.source.assets.length
        )
        if (dynamicAssets.length > 0) {
          const dynamicImages = await prepareImageAssetsAsync(dynamicAssets, {
            limits: {
              maxBytes: limits.maxImageBytes,
              maxDimensionPixels: limits.maxImageDimensionPixels,
              maxPixels: limits.maxImagePixels,
              maxDecodedBytes: limits.maxDecodedImageBytes,
            },
            signal: renderOptions.signal,
          })
          const staticProvider = renderImages
          renderImages = Object.freeze({
            get(assetId: string) {
              return dynamicImages.get(assetId) ?? staticProvider?.get(assetId)
            },
          })
        }
      } catch (error) {
        if (!(error instanceof ImagePreparationError)) throw error
        const asset = resolved.value.document.assets.find(
          (candidate) => candidate.id === error.assetId
        )
        const diagnostic: Diagnostic = Object.freeze({
          code: error.code,
          severity: "error",
          message: error.message,
          ...(asset === undefined ? {} : { source: asset.source }),
          details: { assetId: error.assetId },
        })
        throw new EngineOperationError(
          "engine/image",
          "A resolved image could not be prepared safely",
          Object.freeze([...resolved.diagnostics, diagnostic])
        )
      }

      const layoutStartedAt = now()
      const commonLayoutOptions = {
        maxPages: limits.maxPages,
        signal: renderOptions.signal,
        includeTrace: renderOptions.includeLayoutTrace,
      }
      const compiledFontRegistry = compiledFontRegistries.get(compiled)
      const compiledTextShaper = options.textShaper ?? compiledFontRegistry
      const layout =
        compiledFontRegistry && compiledTextShaper
          ? layoutDocument(resolved.value.document, {
              ...commonLayoutOptions,
              fonts: compiledFontRegistry,
              shaper: compiledTextShaper,
            })
          : layoutDocument(resolved.value.document, commonLayoutOptions)
      const layoutAt = now()
      const preSerializationDiagnostics = Object.freeze([
        ...resolved.diagnostics,
        ...layout.diagnostics,
      ])
      if (hasErrors(preSerializationDiagnostics)) {
        throw new EngineOperationError(
          "engine/render",
          "Rendering would omit or corrupt supported document content",
          preSerializationDiagnostics
        )
      }
      const pdfStartedAt = now()
      const pdf = serializePdf(layout.displayList, {
        metadata: renderOptions.metadata,
        signal: renderOptions.signal,
        images: renderImages,
        ...(compiledFontRegistry ? { fonts: compiledFontRegistry } : {}),
      })
      const completedAt = now()
      const diagnostics = Object.freeze([
        ...preSerializationDiagnostics,
        ...pdf.diagnostics,
      ])
      if (hasErrors(diagnostics)) {
        throw new EngineOperationError(
          "engine/render",
          "Rendering would omit or corrupt supported document content",
          diagnostics
        )
      }
      const result: RenderResult = {
        pdf: pdf.bytes,
        pageCount: layout.displayList.pages.length,
        documentHash: await sha256(pdf.bytes, renderOptions.signal),
        templateHash: compiled.templateHash,
        diagnostics,
        timings: {
          resolveMs: resolvedAt - resolveStartedAt,
          layoutMs: layoutAt - layoutStartedAt,
          pdfMs: completedAt - pdfStartedAt,
          totalMs: completedAt - startedAt,
        },
        resourceUsage: Object.freeze({
          ...(packageUsage.get(compiled) ??
            (() => {
              throw new EngineOperationError(
                "engine/compiled-template",
                "The compiled template has no package resource accounting",
                []
              )
            })()),
          expandedNodes: resolved.value.expandedNodes,
          expandedTextBytes: resolved.value.expandedTextBytes,
          pages: layout.displayList.pages.length,
        }),
        ...(layout.trace ? { layoutTrace: layout.trace } : {}),
      }
      return Object.freeze(result)
    },
  }
  return Object.freeze(engine)
}

const INSPECTION_SOURCE_LIMIT = 20
const INSPECTION_ENTRY_LIMIT = 200
const FEATURE_ORDER = [
  "section",
  "header",
  "footer",
  "paragraph",
  "table",
  "image",
  "pageField",
  "numberedParagraph",
  "horizontalRule",
  "lineBreak",
  "pageBreak",
  "tab",
] as const

type InspectionAccumulator = {
  count: number
  sources: SourceLocation[]
}

function inspectSemanticDocument(
  document: SemanticDocument | undefined,
  diagnostics: readonly Diagnostic[]
): TemplateInspectionResult {
  const fonts = new Map<string, InspectionAccumulator>()
  const features = new Map<string, InspectionAccumulator>()
  const add = (
    target: Map<string, InspectionAccumulator>,
    key: string,
    source: SourceLocation
  ): void => {
    const entry = target.get(key) ?? { count: 0, sources: [] }
    entry.count += 1
    if (entry.sources.length < INSPECTION_SOURCE_LIMIT)
      entry.sources.push(source)
    target.set(key, entry)
  }
  const addInline = (inline: SemanticInline): void => {
    if (inline.type === "text" || inline.type === "pageField") {
      const style = inline.style
      add(
        fonts,
        `${style.fontFamily}\u0000${style.fontWeight}\u0000${style.fontStyle}`,
        inline.source
      )
    }
    if (inline.type === "image") add(features, "image", inline.source)
    if (inline.type === "pageField") add(features, "pageField", inline.source)
    if (inline.type === "break") {
      add(
        features,
        inline.kind === "page" ? "pageBreak" : "lineBreak",
        inline.source
      )
    }
    if (inline.type === "tab") add(features, "tab", inline.source)
  }
  const addParagraph = (paragraph: SemanticParagraph): void => {
    add(features, "paragraph", paragraph.source)
    if (paragraph.properties.numbering) {
      add(features, "numberedParagraph", paragraph.source)
    }
    for (const inline of paragraph.children) addInline(inline)
  }
  const addBlock = (block: SemanticBlock): void => {
    if (block.type === "paragraph") {
      addParagraph(block)
      return
    }
    if (block.type === "horizontalRule") {
      add(features, "horizontalRule", block.source)
      return
    }
    add(features, "table", block.source)
    for (const row of block.rows) {
      for (const cell of row.cells) {
        for (const paragraph of cell.blocks) addParagraph(paragraph)
      }
    }
  }

  if (document) {
    for (const header of document.headers) {
      add(features, "header", header.source)
      for (const block of header.blocks) addBlock(block)
    }
    for (const footer of document.footers) {
      add(features, "footer", footer.source)
      for (const block of footer.blocks) addBlock(block)
    }
    for (const section of document.sections) {
      add(features, "section", section.source)
      for (const block of section.blocks) addBlock(block)
    }
  }

  for (const diagnostic of diagnostics) {
    if (!diagnostic.source || !diagnostic.code.startsWith("DOCX_UNSUPPORTED")) {
      continue
    }
    const feature = diagnostic.details?.feature
    const suffix = typeof feature === "string" ? feature : diagnostic.code
    add(features, `unsupported:${suffix}`, diagnostic.source)
  }

  const allRequiredFonts: RequiredFontInspection[] = [...fonts.entries()]
    .map(([key, entry]) => {
      const [family = "", weight = "400", style = "normal"] =
        key.split("\u0000")
      return Object.freeze({
        family,
        weight: Number(weight) as 400 | 700,
        style: style as "normal" | "italic",
        instanceCount: entry.count,
        sources: Object.freeze(entry.sources),
        sourcesTruncated: entry.count > entry.sources.length,
      })
    })
    .sort(
      (left, right) =>
        compareInspectionText(left.family, right.family) ||
        left.weight - right.weight ||
        compareInspectionText(left.style, right.style)
    )

  const orderedKinds = [
    ...FEATURE_ORDER.filter((kind) => features.has(kind)),
    ...[...features.keys()]
      .filter(
        (kind) =>
          !FEATURE_ORDER.includes(kind as (typeof FEATURE_ORDER)[number])
      )
      .sort(compareInspectionText),
  ]
  const allInspectedFeatures: DocumentFeatureInspection[] = orderedKinds.map(
    (kind) => {
      const entry = features.get(kind)
      if (!entry) throw new Error(`Missing inspection accumulator for ${kind}`)
      return Object.freeze({
        kind,
        support: kind.startsWith("unsupported:")
          ? "unsupported"
          : "implemented",
        instanceCount: entry.count,
        sources: Object.freeze(entry.sources),
        sourcesTruncated: entry.count > entry.sources.length,
      })
    }
  )

  return Object.freeze({
    documentModelAvailable: document !== undefined,
    requiredFonts: Object.freeze(
      allRequiredFonts.slice(0, INSPECTION_ENTRY_LIMIT)
    ),
    requiredFontEntryCount: allRequiredFonts.length,
    requiredFontsTruncated: allRequiredFonts.length > INSPECTION_ENTRY_LIMIT,
    features: Object.freeze(
      allInspectedFeatures.slice(0, INSPECTION_ENTRY_LIMIT)
    ),
    featureEntryCount: allInspectedFeatures.length,
    featuresTruncated: allInspectedFeatures.length > INSPECTION_ENTRY_LIMIT,
    diagnostics: Object.freeze([...diagnostics]),
    sourceLimitPerEntry: INSPECTION_SOURCE_LIMIT,
    entryLimit: INSPECTION_ENTRY_LIMIT,
  })
}

function compareInspectionText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function validateRenderOptions(options: RenderOptions): void {
  if (!options.locale) {
    throw new TypeError("render options must include an explicit locale")
  }
  if (!options.timeZone) {
    throw new TypeError("render options must include an explicit timeZone")
  }
}

async function yieldToAbort(signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal)
  await Promise.resolve()
  throwIfAborted(signal)
}

async function sha256(
  bytes: Uint8Array,
  signal?: AbortSignal
): Promise<DocumentHash> {
  throwIfAborted(signal)
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer)
  throwIfAborted(signal)
  const value = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
  return documentHash(value)
}

const CONTENT_LOSS_DOCX_DIAGNOSTICS = new Set([
  "DOCX_CONTENT_LOSS",
  "DOCX_UNSUPPORTED_BLOCK",
  "DOCX_UNSUPPORTED_INLINE",
])

function throwForUnacceptableTemplateDiagnostics(
  diagnostics: readonly Diagnostic[]
): void {
  const contentLoss = hasContentLossDiagnostics(diagnostics)
  if (!contentLoss && !hasErrors(diagnostics)) return
  throw new EngineOperationError(
    contentLoss ? "engine/docx-content-loss" : "engine/template",
    contentLoss
      ? "The DOCX template contains content that the engine would omit"
      : "The template contains error diagnostics and cannot be used",
    diagnostics
  )
}

function throwForContentLossDiagnostics(
  diagnostics: readonly Diagnostic[]
): void {
  if (!hasContentLossDiagnostics(diagnostics)) return
  throw new EngineOperationError(
    "engine/docx-content-loss",
    "The DOCX template contains content that the engine would omit",
    diagnostics
  )
}

function hasContentLossDiagnostics(
  diagnostics: readonly Diagnostic[]
): boolean {
  return diagnostics.some((diagnostic) =>
    CONTENT_LOSS_DOCX_DIAGNOSTICS.has(diagnostic.code)
  )
}

class InvalidJsonDataError extends Error {
  constructor(readonly reason: string) {
    super(reason)
  }
}

function cloneBoundedJsonData(
  data: Readonly<Record<string, unknown>>,
  limits: ResourceLimits
): Readonly<Record<string, unknown>> {
  try {
    const state = {
      nodes: 0,
      textBytes: 0,
      imageCount: 0,
      imageBytes: 0,
      visiting: new WeakSet<object>(),
    }
    const cloned = cloneJsonValue(data, 0, limits, state)
    if (!isRecord(cloned)) {
      throw new InvalidJsonDataError("the root value is not a plain object")
    }
    return deepFreeze(cloned)
  } catch (error) {
    const reason =
      error instanceof InvalidJsonDataError
        ? error.reason
        : "the value could not be inspected safely"
    const diagnostic: Diagnostic = {
      code: "ENGINE_TEMPLATE_DATA_INVALID",
      severity: "error",
      message: "Template data must be a bounded plain JSON object",
      details: { reason },
    }
    throw new EngineOperationError(
      "engine/template-data",
      "Template data is not valid JSON input",
      Object.freeze([Object.freeze(diagnostic)])
    )
  }
}

type JsonCloneState = {
  nodes: number
  textBytes: number
  imageCount: number
  imageBytes: number
  visiting: WeakSet<object>
}

function cloneJsonValue(
  value: unknown,
  depth: number,
  limits: ResourceLimits,
  state: JsonCloneState
): unknown {
  state.nodes += 1
  if (state.nodes > limits.maxJsonNodes) {
    throw new InvalidJsonDataError("the value exceeds the node limit")
  }
  if (value === null || typeof value === "boolean") return value
  if (typeof value === "string") {
    state.textBytes += new TextEncoder().encode(value).byteLength
    if (state.textBytes > limits.maxJsonTextBytes) {
      throw new InvalidJsonDataError("the value exceeds the text byte limit")
    }
    return value
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new InvalidJsonDataError("the value contains a non-finite number")
    }
    return value
  }
  if (typeof value !== "object") {
    throw new InvalidJsonDataError(
      `the value contains unsupported ${typeof value}`
    )
  }
  if (depth > limits.maxObjectTraversalDepth) {
    throw new InvalidJsonDataError(
      "the value exceeds the traversal depth limit"
    )
  }
  if (state.visiting.has(value)) {
    throw new InvalidJsonDataError("the value contains a cycle")
  }
  state.visiting.add(value)
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        throw new InvalidJsonDataError("the value contains a non-plain array")
      }
      const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length")
      if (!lengthDescriptor || !("value" in lengthDescriptor)) {
        throw new InvalidJsonDataError("an array length could not be inspected")
      }
      const length = lengthDescriptor.value
      if (!Number.isSafeInteger(length) || length < 0) {
        throw new InvalidJsonDataError("an array has an invalid length")
      }
      if (length > limits.maxJsonArrayItems) {
        throw new InvalidJsonDataError("an array exceeds the item limit")
      }
      const keys = Reflect.ownKeys(value)
      if (
        keys.some(
          (key) =>
            typeof key !== "string" ||
            (key !== "length" && !/^(0|[1-9]\d*)$/u.test(key))
        )
      ) {
        throw new InvalidJsonDataError(
          "an array contains unsupported properties"
        )
      }
      if (keys.length !== length + 1) {
        throw new InvalidJsonDataError(
          "an array contains unsupported properties"
        )
      }
      const cloned: unknown[] = []
      for (let index = 0; index < length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
        if (!descriptor) {
          throw new InvalidJsonDataError("the value contains a sparse array")
        }
        if (!("value" in descriptor) || !descriptor.enumerable) {
          throw new InvalidJsonDataError("the value contains an accessor")
        }
        cloned.push(cloneJsonValue(descriptor.value, depth + 1, limits, state))
      }
      return cloned
    }

    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new InvalidJsonDataError("the value contains a non-plain object")
    }
    const bytesDescriptor = Object.getOwnPropertyDescriptor(value, "bytes")
    const byteValue =
      bytesDescriptor && "value" in bytesDescriptor
        ? bytesDescriptor.value
        : undefined
    if (byteValue instanceof Uint8Array) {
      if (
        Object.getPrototypeOf(byteValue) !== Uint8Array.prototype ||
        !bytesDescriptor?.enumerable
      ) {
        throw new InvalidJsonDataError(
          "an image byte buffer is not a plain Uint8Array"
        )
      }
      state.imageCount += 1
      state.imageBytes += byteValue.byteLength
      if (state.imageCount > limits.maxImageCount) {
        throw new InvalidJsonDataError("dynamic images exceed the count limit")
      }
      if (
        byteValue.byteLength > limits.maxImageBytes ||
        state.imageBytes > limits.maxImageBytes
      ) {
        throw new InvalidJsonDataError("dynamic images exceed the byte limit")
      }
    }
    const cloned = Object.create(null) as Record<string, unknown>
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") {
        throw new InvalidJsonDataError("the value contains a symbol property")
      }
      state.textBytes += new TextEncoder().encode(key).byteLength
      if (state.textBytes > limits.maxJsonTextBytes) {
        throw new InvalidJsonDataError("the value exceeds the text byte limit")
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        throw new InvalidJsonDataError("the value contains an accessor")
      }
      Object.defineProperty(cloned, key, {
        value:
          key === "bytes" && byteValue instanceof Uint8Array
            ? Array.from(byteValue)
            : cloneJsonValue(descriptor.value, depth + 1, limits, state),
        enumerable: true,
        configurable: true,
        writable: true,
      })
    }
    return cloned
  } finally {
    state.visiting.delete(value)
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (typeof value !== "object" || value === null || seen.has(value))
    return value
  seen.add(value)
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor && "value" in descriptor) deepFreeze(descriptor.value, seen)
  }
  return Object.freeze(value)
}

function now(): number {
  return globalThis.performance?.now() ?? Date.now()
}

function fontConfigurationForDocument(
  document: SemanticDocument,
  base: FontConfiguration | undefined
): FontConfiguration | undefined {
  const embedded = document.fontAssets ?? []
  if (embedded.length === 0) return base
  const key = (family: string, weight: number, style: string) =>
    `${family.trim().toLowerCase()}\u0000${weight}\u0000${style}`
  const embeddedKeys = new Set(
    embedded.map((asset) => key(asset.family, asset.weight, asset.style))
  )
  const faces = [
    ...embedded.map((asset) => ({
      family: asset.family,
      weight: asset.weight,
      style: asset.style,
      bytes: Uint8Array.from(asset.bytes),
    })),
    ...(base?.faces ?? []).filter(
      (face) => !embeddedKeys.has(key(face.family, face.weight, face.style))
    ),
  ]
  const requestedFallback = base?.fallbackFamily
  const fallbackFamily =
    (requestedFallback &&
    faces.some(
      (face) =>
        face.family.trim().toLowerCase() ===
          requestedFallback.trim().toLowerCase() &&
        face.weight === 400 &&
        face.style === "normal"
    )
      ? requestedFallback
      : embedded.find(
          (asset) => asset.weight === 400 && asset.style === "normal"
        )?.family) ?? embedded[0]?.family
  if (!fallbackFamily) return base
  return Object.freeze({
    faces: Object.freeze(faces),
    fallbackFamily,
    ...(base?.aliases ? { aliases: base.aliases } : {}),
  })
}

export type {
  CompiledTemplate,
  Diagnostic,
  DocxPdfEngine,
  RenderOptions,
  RenderResult,
  TemplateImageValue,
} from "@apexmed/core"
