import type {
  Diagnostic,
  OperationResult,
  SemanticDocument,
} from "@apexmed/core"

import { parseValidatedDocx } from "./parse"
import { normaliseDocx } from "./normalise"
import type {
  DocxInspection,
  DocxParseOptions,
  ParsedDocxResult,
} from "./types"
import { validateDocxPackage } from "./zip"

export type NormalisedDocxResult = Readonly<{
  document: SemanticDocument
  archiveEntries: number
  decompressedBytes: number
}>

export type {
  DocxInspection,
  DocxParseOptions,
  ParsedDocxDocument,
  ParsedDocxHeaderFooter,
  ParsedDocxImage,
  ParsedDocxImageAsset,
  ParsedDocxFontAsset,
  ParsedDocxInline,
  ParsedDocxPageField,
  ParsedDocxSection,
  ParsedDocxBlock,
  ParsedDocxParagraph,
  ParsedDocxHorizontalRule,
  ParsedDocxRun,
  ParsedDocxTable,
  ParsedDocxTableBorder,
  ParsedDocxTableBorders,
  ParsedDocxTableCell,
  ParsedDocxTableCellBorders,
  ParsedDocxTableRow,
  ParsedDocxText,
} from "./types"
export { normaliseDocx } from "./normalise"
export { serializeDocx } from "./write/serialize"

/** Validates the hostile-input boundary without interpreting WordprocessingML. */
export function inspectDocx(
  bytes: Uint8Array,
  options: DocxParseOptions = {}
): OperationResult<DocxInspection> {
  const pkg = validateDocxPackage(bytes, options)
  if (!pkg.ok) {
    return pkg
  }
  const parsed = parseValidatedDocx(pkg.value, options)
  if (!parsed.ok) {
    return { ok: false, diagnostics: parsed.diagnostics }
  }
  return {
    ok: true,
    value: {
      documentPart: parsed.value.documentPart,
      archiveEntries: pkg.value.archiveEntries,
      decompressedBytes: pkg.value.decompressedBytes,
      diagnostics: parsed.diagnostics,
    },
    diagnostics: parsed.diagnostics,
  }
}

/** Parses the supported DOCX profile into this package's explicit OOXML model. */
export function parseDocx(
  bytes: Uint8Array,
  options: DocxParseOptions = {}
): OperationResult<ParsedDocxResult> {
  const pkg = validateDocxPackage(bytes, options)
  if (!pkg.ok) {
    return pkg
  }
  const parsed = parseValidatedDocx(pkg.value, options)
  if (!parsed.ok) {
    return { ok: false, diagnostics: parsed.diagnostics }
  }
  const diagnostics: readonly Diagnostic[] = parsed.diagnostics
  if (diagnostics.some((entry) => entry.severity === "error")) {
    return { ok: false, diagnostics }
  }
  return {
    ok: true,
    value: { document: parsed.value, diagnostics },
    diagnostics,
  }
}

/** The Phase 1 integration boundary: hostile DOCX bytes to core semantic nodes. */
export function normaliseDocxBytes(
  bytes: Uint8Array,
  options: DocxParseOptions = {}
): OperationResult<SemanticDocument> {
  const result = normaliseDocxBytesWithUsage(bytes, options)
  if (!result.ok) return result
  return {
    ok: true,
    value: result.value.document,
    diagnostics: result.diagnostics,
  }
}

/** Normalises once while retaining deterministic validated-package counters. */
export function normaliseDocxBytesWithUsage(
  bytes: Uint8Array,
  options: DocxParseOptions = {}
): OperationResult<NormalisedDocxResult> {
  const pkg = validateDocxPackage(bytes, options)
  if (!pkg.ok) return pkg
  const parsed = parseValidatedDocx(pkg.value, options)
  if (!parsed.ok) {
    return parsed
  }
  const diagnostics: readonly Diagnostic[] = parsed.diagnostics
  if (diagnostics.some((entry) => entry.severity === "error")) {
    return { ok: false, diagnostics }
  }
  const normalised = normaliseDocx(parsed.value)
  if (!normalised.ok) {
    return normalised
  }
  return {
    ok: true,
    value: {
      document: normalised.value,
      archiveEntries: pkg.value.archiveEntries,
      decompressedBytes: pkg.value.decompressedBytes,
    },
    diagnostics: [...diagnostics, ...normalised.diagnostics],
  }
}
