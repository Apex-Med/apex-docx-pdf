import {
  DEFAULT_RESOURCE_LIMITS,
  documentHash,
  hasErrors,
  throwIfAborted,
  type CompiledTemplate,
  type Diagnostic,
  type DocxPdfEngine,
  type DocumentHash,
  type EngineOptions,
  type RenderOptions,
  type RenderResult,
  type ResourceLimits,
} from "@apex-docx-pdf/core"
import { inspectDocx, normaliseDocxBytes } from "@apex-docx-pdf/docx"
import { layoutDocument } from "@apex-docx-pdf/layout"
import { serializePdf } from "@apex-docx-pdf/pdf"
import { compileTemplate, resolveTemplate } from "@apex-docx-pdf/template"

export const ENGINE_VERSION = "0.0.0-phase.1"

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
        throw new EngineOperationError(
          "engine/docx",
          "The DOCX template could not be compiled",
          normalised.diagnostics
        )
      }
      const compiled = await compileTemplate(normalised.value, {
        limits,
        signal: compileOptions.signal,
        templateHash,
        version: ENGINE_VERSION,
      })
      return Object.freeze({
        ...compiled,
        diagnostics: Object.freeze([
          ...normalised.diagnostics,
          ...compiled.diagnostics,
        ]),
      })
    },

    async render(compiled, data, renderOptions) {
      validateRenderOptions(renderOptions)
      throwIfAborted(renderOptions.signal)
      const startedAt = now()
      const resolveStartedAt = now()
      const resolved = resolveTemplate(compiled, data, {
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
      const layout = layoutDocument(resolved.value, {
        maxPages: limits.maxPages,
        signal: renderOptions.signal,
        includeTrace: renderOptions.includeLayoutTrace,
      })
      const layoutAt = now()
      const pdfStartedAt = now()
      const pdf = serializePdf(layout.displayList, {
        metadata: renderOptions.metadata,
        signal: renderOptions.signal,
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
      const hashInput = canonicalJson({
        engineVersion: ENGINE_VERSION,
        templateHash: compiled.templateHash,
        data,
        locale: renderOptions.locale,
        timeZone: renderOptions.timeZone,
        metadata: renderOptions.metadata ?? null,
      })
      const result: RenderResult = {
        pdf: pdf.bytes,
        pageCount: layout.displayList.pages.length,
        documentHash: await sha256(
          new TextEncoder().encode(hashInput),
          renderOptions.signal
        ),
        templateHash: compiled.templateHash,
        diagnostics,
        timings: {
          resolveMs: resolvedAt - resolveStartedAt,
          layoutMs: layoutAt - layoutStartedAt,
          pdfMs: completedAt - pdfStartedAt,
          totalMs: completedAt - startedAt,
        },
        resourceUsage: {
          templateBytes: 0,
          archiveEntries: 0,
          decompressedBytes: 0,
          expandedNodes: countResolvedNodes(resolved.value),
          expandedTextBytes: countResolvedTextBytes(resolved.value),
          pages: layout.displayList.pages.length,
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

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  const record = value as Readonly<Record<string, unknown>>
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`
}

function countResolvedNodes(
  document: CompiledTemplate["source"]
): number {
  return document.sections.reduce(
    (sectionTotal, section) =>
      sectionTotal +
      section.blocks.reduce(
        (blockTotal, block) => blockTotal + 1 + block.children.length,
        0
      ),
    1 + document.sections.length
  )
}

function countResolvedTextBytes(
  document: CompiledTemplate["source"]
): number {
  const encoder = new TextEncoder()
  return document.sections.reduce(
    (sectionTotal, section) =>
      sectionTotal +
      section.blocks.reduce(
        (blockTotal, block) =>
          blockTotal +
          block.children.reduce(
            (textTotal, child) => textTotal + encoder.encode(child.text).byteLength,
            0
          ),
        0
      ),
    0
  )
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
