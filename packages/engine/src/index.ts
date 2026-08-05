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
} from "@apex-docx-pdf/core"
import { inspectDocx, normaliseDocxBytes } from "@apex-docx-pdf/docx"
import { createFontRegistry } from "@apex-docx-pdf/fonts"
import { layoutDocument } from "@apex-docx-pdf/layout"
import { serializePdf } from "@apex-docx-pdf/pdf"
import { compileTemplate, resolveTemplate } from "@apex-docx-pdf/template"

export const ENGINE_VERSION = "0.0.0-phase.3"

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
  const textShaper = options.textShaper ?? fontRegistry
  const compiledTemplates = new WeakSet<object>()

  const engine: DocxPdfEngine = {
    async inspect(templateBytes, inspectOptions = {}) {
      await yieldToAbort(inspectOptions.signal)
      const result = inspectDocx(templateBytes, {
        limits,
        signal: inspectOptions.signal,
      })
      return result.diagnostics
    },

    async compile(templateBytes, compileOptions = {}) {
      await yieldToAbort(compileOptions.signal)
      const templateHash = await sha256(templateBytes, compileOptions.signal)
      const normalised = normaliseDocxBytes(templateBytes, {
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
      const compiled = await compileTemplate(normalised.value, {
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
      return result
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
      const resolved = resolveTemplate(compiled, safeData, {
        limits,
        signal: renderOptions.signal,
      })
      const resolvedAt = now()
      if (!resolved.ok) {
        throw new EngineOperationError(
          "engine/template-data",
          "Template data did not satisfy the compiled manifest",
          resolved.diagnostics
        )
      }

      const layoutStartedAt = now()
      const commonLayoutOptions = {
        maxPages: limits.maxPages,
        signal: renderOptions.signal,
        includeTrace: renderOptions.includeLayoutTrace,
      }
      const layout =
        fontRegistry && textShaper
          ? layoutDocument(resolved.value, {
              ...commonLayoutOptions,
              fonts: fontRegistry,
              shaper: textShaper,
            })
          : layoutDocument(resolved.value, commonLayoutOptions)
      const layoutAt = now()
      const pdfStartedAt = now()
      const pdf = serializePdf(layout.displayList, {
        metadata: renderOptions.metadata,
        signal: renderOptions.signal,
        ...(fontRegistry ? { fonts: fontRegistry } : {}),
      })
      const completedAt = now()
      const diagnostics = Object.freeze([
        ...resolved.diagnostics,
        ...layout.diagnostics,
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
        ...(layout.trace ? { layoutTrace: layout.trace } : {}),
      }
      return Object.freeze(result)
    },
  }
  return Object.freeze(engine)
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
        value: cloneJsonValue(descriptor.value, depth + 1, limits, state),
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

export type {
  CompiledTemplate,
  Diagnostic,
  DocxPdfEngine,
  RenderOptions,
  RenderResult,
} from "@apex-docx-pdf/core"
