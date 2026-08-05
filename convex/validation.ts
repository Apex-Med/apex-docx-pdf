import type { PaginationOptions } from "convex/server"
import { v } from "convex/values"

export const diagnosticsSummaryValidator = v.object({
  errorCount: v.number(),
  warningCount: v.number(),
  infoCount: v.number(),
  codes: v.array(v.string()),
})

export const templateValidator = v.object({
  _id: v.id("templates"),
  _creationTime: v.number(),
  sessionId: v.string(),
  name: v.string(),
  originalFileStorageId: v.optional(v.id("_storage")),
  sourceHash: v.string(),
  engineVersion: v.string(),
  manifestJson: v.string(),
  jsonSchemaJson: v.string(),
  starterDataJson: v.string(),
  status: v.union(
    v.literal("ready"),
    v.literal("invalid"),
    v.literal("deleting")
  ),
  diagnosticsSummary: diagnosticsSummaryValidator,
  createdAt: v.number(),
  updatedAt: v.number(),
})

export const renderValidator = v.object({
  _id: v.id("renders"),
  _creationTime: v.number(),
  sessionId: v.string(),
  templateId: v.id("templates"),
  templateHash: v.string(),
  fontRegistryHash: v.string(),
  dataHash: v.string(),
  optionsHash: v.string(),
  cacheKey: v.string(),
  pdfStorageId: v.optional(v.id("_storage")),
  pageCount: v.optional(v.number()),
  status: v.union(
    v.literal("queued"),
    v.literal("rendering"),
    v.literal("complete"),
    v.literal("failed"),
    v.literal("cancelled"),
    v.literal("deleting")
  ),
  diagnosticsSummary: diagnosticsSummaryValidator,
  createdAt: v.number(),
  completedAt: v.optional(v.number()),
})

export type DiagnosticsSummary = {
  errorCount: number
  warningCount: number
  infoCount: number
  codes: string[]
}

const textEncoder = new TextEncoder()
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const DIAGNOSTIC_CODE_PATTERN = /^[A-Za-z][A-Za-z0-9_./-]{0,127}$/

export function assertSessionId(sessionId: string): void {
  if (
    sessionId.length === 0 ||
    sessionId.length > 128 ||
    sessionId.trim() !== sessionId
  ) {
    throw new Error("Invalid session ID")
  }
}

export function assertName(name: string): void {
  if (name.length === 0 || name.length > 160 || name.trim() !== name) {
    throw new Error("Template name must be 1 to 160 trimmed characters")
  }
}

export function assertHash(label: string, hash: string): void {
  if (!SHA256_PATTERN.test(hash)) {
    throw new Error(`${label} must be a lowercase SHA-256 hash`)
  }
}

export function assertEngineVersion(engineVersion: string): void {
  if (
    engineVersion.length === 0 ||
    engineVersion.length > 80 ||
    engineVersion.trim() !== engineVersion
  ) {
    throw new Error("Invalid engine version")
  }
}

export function assertDiagnosticsSummary(summary: DiagnosticsSummary): void {
  for (const count of [
    summary.errorCount,
    summary.warningCount,
    summary.infoCount,
  ]) {
    if (!Number.isSafeInteger(count) || count < 0 || count > 100_000) {
      throw new Error("Invalid diagnostic count")
    }
  }
  if (summary.codes.length > 64) {
    throw new Error("Too many diagnostic codes")
  }
  const uniqueCodes = new Set(summary.codes)
  if (
    uniqueCodes.size !== summary.codes.length ||
    summary.codes.some((code) => !DIAGNOSTIC_CODE_PATTERN.test(code))
  ) {
    throw new Error("Diagnostic summaries may contain only unique stable codes")
  }
}

export function assertJsonMetadata(
  label: string,
  json: string,
  maximumBytes: number
): void {
  if (textEncoder.encode(json).byteLength > maximumBytes) {
    throw new Error(`${label} exceeds its byte limit`)
  }
  let root: unknown
  try {
    root = JSON.parse(json)
  } catch {
    throw new Error(`${label} must be valid JSON`)
  }

  const stack: Array<{ value: unknown; depth: number }> = [
    { value: root, depth: 0 },
  ]
  let nodes = 0
  while (stack.length > 0) {
    const item = stack.pop()
    if (!item) break
    nodes += 1
    if (nodes > 20_000 || item.depth > 64) {
      throw new Error(`${label} exceeds its structural limits`)
    }
    if (Array.isArray(item.value)) {
      if (item.value.length > 5_000) {
        throw new Error(`${label} contains an oversized array`)
      }
      for (const value of item.value) {
        stack.push({ value, depth: item.depth + 1 })
      }
    } else if (item.value !== null && typeof item.value === "object") {
      const entries = Object.entries(item.value)
      if (entries.length > 5_000) {
        throw new Error(`${label} contains an oversized object`)
      }
      for (const [key, value] of entries) {
        if (key.length > 256) {
          throw new Error(`${label} contains an oversized key`)
        }
        stack.push({ value, depth: item.depth + 1 })
      }
    }
  }
}

export function assertPaginationOptions(options: PaginationOptions): void {
  if (
    !Number.isSafeInteger(options.numItems) ||
    options.numItems < 1 ||
    options.numItems > 100
  ) {
    throw new Error("Pagination size must be between 1 and 100")
  }
  if (options.cursor !== null && options.cursor.length > 2_048) {
    throw new Error("Pagination cursor is too long")
  }
}

export function assertBoundedLimit(limit: number, maximum = 100): void {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > maximum) {
    throw new Error(`Limit must be between 1 and ${maximum}`)
  }
}

export function assertPageCount(pageCount: number): void {
  if (
    !Number.isSafeInteger(pageCount) ||
    pageCount < 1 ||
    pageCount > 100_000
  ) {
    throw new Error("Invalid page count")
  }
}
