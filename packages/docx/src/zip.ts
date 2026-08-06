import { DEFAULT_RESOURCE_LIMITS, throwIfAborted } from "@apexmed/core"
import { unzipSync } from "fflate"

import { diagnostic, source } from "./diagnostics"
import { activeContentDiagnostics } from "./security"
import type { DocxParseOptions } from "./types"

type CentralDirectoryEntry = Readonly<{
  name: string
  uncompressedSize: number
}>

export type ValidatedDocxPackage = Readonly<{
  parts: ReadonlyMap<string, Uint8Array>
  archiveEntries: number
  decompressedBytes: number
}>

const decoder = new TextDecoder("utf-8", { fatal: true })
const ZIP_LOCAL_FILE_HEADER = 0x04034b50
const ZIP_CENTRAL_DIRECTORY_HEADER = 0x02014b50
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50

function readU16(bytes: Uint8Array, offset: number): number | undefined {
  const byte0 = bytes[offset]
  const byte1 = bytes[offset + 1]
  if (byte0 === undefined || byte1 === undefined) {
    return undefined
  }
  return byte0 | (byte1 << 8)
}

function readU32(bytes: Uint8Array, offset: number): number | undefined {
  const byte0 = bytes[offset]
  const byte1 = bytes[offset + 1]
  const byte2 = bytes[offset + 2]
  const byte3 = bytes[offset + 3]
  if (
    byte0 === undefined ||
    byte1 === undefined ||
    byte2 === undefined ||
    byte3 === undefined
  ) {
    return undefined
  }
  return (byte0 | (byte1 << 8) | (byte2 << 16) | (byte3 << 24)) >>> 0
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const minimumOffset = Math.max(0, bytes.length - 65_557)
  for (let offset = bytes.length - 22; offset >= minimumOffset; offset -= 1) {
    if (readU32(bytes, offset) === ZIP_END_OF_CENTRAL_DIRECTORY) {
      return offset
    }
  }
  return -1
}

function isSafePartPath(name: string): boolean {
  if (
    name.length === 0 ||
    name.startsWith("/") ||
    name.includes("\\") ||
    name.includes("\0")
  ) {
    return false
  }
  const path = name.endsWith("/") ? name.slice(0, -1) : name
  return (
    path.length > 0 &&
    path
      .split("/")
      .every(
        (segment) => segment.length > 0 && segment !== "." && segment !== ".."
      )
  )
}

function readCentralDirectory(
  bytes: Uint8Array,
  options: DocxParseOptions
): CentralDirectoryEntry[] | readonly ReturnType<typeof diagnostic>[] {
  const errors: ReturnType<typeof diagnostic>[] = []
  if (bytes.length < 4 || readU32(bytes, 0) !== ZIP_LOCAL_FILE_HEADER) {
    return [
      diagnostic(
        "DOCX_INVALID_ZIP_MAGIC",
        "A DOCX must begin with a ZIP local-file header."
      ),
    ]
  }

  const endOffset = findEndOfCentralDirectory(bytes)
  if (endOffset < 0) {
    return [
      diagnostic(
        "DOCX_INVALID_ZIP",
        "The ZIP end-of-central-directory record is missing."
      ),
    ]
  }

  const disk = readU16(bytes, endOffset + 4)
  const directoryDisk = readU16(bytes, endOffset + 6)
  const entriesOnDisk = readU16(bytes, endOffset + 8)
  const totalEntries = readU16(bytes, endOffset + 10)
  const directorySize = readU32(bytes, endOffset + 12)
  const directoryOffset = readU32(bytes, endOffset + 16)
  if (
    disk === undefined ||
    directoryDisk === undefined ||
    entriesOnDisk === undefined ||
    totalEntries === undefined ||
    directorySize === undefined ||
    directoryOffset === undefined ||
    disk !== 0 ||
    directoryDisk !== 0 ||
    entriesOnDisk !== totalEntries ||
    totalEntries === 0xffff ||
    directorySize === 0xffffffff ||
    directoryOffset === 0xffffffff
  ) {
    return [
      diagnostic(
        "DOCX_UNSUPPORTED_ZIP",
        "Multi-volume and ZIP64 DOCX archives are not supported."
      ),
    ]
  }

  const maxEntries =
    options.limits?.maxArchiveEntries ??
    DEFAULT_RESOURCE_LIMITS.maxArchiveEntries
  if (totalEntries > maxEntries) {
    return [
      diagnostic(
        "DOCX_ARCHIVE_ENTRY_LIMIT",
        `The archive has ${totalEntries} entries, exceeding the limit of ${maxEntries}.`
      ),
    ]
  }
  if (directoryOffset + directorySize > endOffset) {
    return [
      diagnostic(
        "DOCX_INVALID_ZIP",
        "The central directory points outside the ZIP archive."
      ),
    ]
  }

  const entries: CentralDirectoryEntry[] = []
  const seen = new Set<string>()
  let decompressedBytes = 0
  let offset = directoryOffset
  for (let index = 0; index < totalEntries; index += 1) {
    throwIfAborted(options.signal)
    if (
      offset + 46 > bytes.length ||
      readU32(bytes, offset) !== ZIP_CENTRAL_DIRECTORY_HEADER
    ) {
      return [
        diagnostic(
          "DOCX_INVALID_ZIP",
          "The central directory contains an invalid entry header."
        ),
      ]
    }
    const uncompressedSize = readU32(bytes, offset + 24)
    const nameLength = readU16(bytes, offset + 28)
    const extraLength = readU16(bytes, offset + 30)
    const commentLength = readU16(bytes, offset + 32)
    if (
      uncompressedSize === undefined ||
      nameLength === undefined ||
      extraLength === undefined ||
      commentLength === undefined
    ) {
      return [
        diagnostic(
          "DOCX_INVALID_ZIP",
          "The central directory contains a truncated entry header."
        ),
      ]
    }
    const end = offset + 46 + nameLength + extraLength + commentLength
    if (end > bytes.length) {
      return [
        diagnostic(
          "DOCX_INVALID_ZIP",
          "A central-directory entry extends beyond the archive."
        ),
      ]
    }

    let name: string
    try {
      name = decoder.decode(
        bytes.subarray(offset + 46, offset + 46 + nameLength)
      )
    } catch {
      return [
        diagnostic(
          "DOCX_INVALID_PART_PATH",
          "A ZIP entry name is not valid UTF-8."
        ),
      ]
    }
    if (!isSafePartPath(name)) {
      errors.push(
        diagnostic(
          "DOCX_UNSAFE_PART_PATH",
          `The ZIP entry path '${name}' is unsafe.`,
          "error",
          source(name || "<empty>", "/")
        )
      )
    } else if (seen.has(name)) {
      errors.push(
        diagnostic(
          "DOCX_DUPLICATE_PART",
          `The ZIP contains duplicate part '${name}'.`,
          "error",
          source(name, "/")
        )
      )
    }
    seen.add(name)

    decompressedBytes += uncompressedSize
    if (!Number.isSafeInteger(decompressedBytes)) {
      return [
        diagnostic(
          "DOCX_DECOMPRESSED_SIZE_LIMIT",
          "The archive decompressed size is not a safe integer."
        ),
      ]
    }
    offset = end
    entries.push({ name, uncompressedSize })
  }

  const maxDecompressedBytes =
    options.limits?.maxDecompressedBytes ??
    DEFAULT_RESOURCE_LIMITS.maxDecompressedBytes
  if (decompressedBytes > maxDecompressedBytes) {
    errors.push(
      diagnostic(
        "DOCX_DECOMPRESSED_SIZE_LIMIT",
        `The archive expands to ${decompressedBytes} bytes, exceeding the limit of ${maxDecompressedBytes}.`
      )
    )
  }
  return errors.length > 0 ? errors : entries
}

function hasRequiredParts(
  parts: ReadonlyMap<string, Uint8Array>
): ReturnType<typeof diagnostic>[] {
  const diagnostics: ReturnType<typeof diagnostic>[] = []
  for (const part of ["[Content_Types].xml", "_rels/.rels"]) {
    if (!parts.has(part)) {
      diagnostics.push(
        diagnostic(
          "DOCX_MISSING_REQUIRED_PART",
          `The DOCX package is missing required part '${part}'.`,
          "error",
          source(part, "/")
        )
      )
    }
  }
  return diagnostics
}

export function validateDocxPackage(
  bytes: Uint8Array,
  options: DocxParseOptions = {}
):
  | { ok: true; value: ValidatedDocxPackage }
  | { ok: false; diagnostics: readonly ReturnType<typeof diagnostic>[] } {
  throwIfAborted(options.signal)
  const maxTemplateBytes =
    options.limits?.maxTemplateBytes ?? DEFAULT_RESOURCE_LIMITS.maxTemplateBytes
  if (bytes.byteLength > maxTemplateBytes) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          "DOCX_TEMPLATE_SIZE_LIMIT",
          `The DOCX is ${bytes.byteLength} bytes, exceeding the limit of ${maxTemplateBytes}.`
        ),
      ],
    }
  }

  const entriesOrDiagnostics = readCentralDirectory(bytes, options)
  const firstEntryOrDiagnostic = entriesOrDiagnostics[0]
  if (
    firstEntryOrDiagnostic === undefined ||
    "code" in firstEntryOrDiagnostic
  ) {
    return {
      ok: false,
      diagnostics: entriesOrDiagnostics as readonly ReturnType<
        typeof diagnostic
      >[],
    }
  }
  const entries = entriesOrDiagnostics as CentralDirectoryEntry[]

  let unzipped: Record<string, Uint8Array>
  try {
    unzipped = unzipSync(bytes)
  } catch {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          "DOCX_INVALID_ZIP",
          "The ZIP archive cannot be decompressed."
        ),
      ],
    }
  }
  throwIfAborted(options.signal)

  const parts = new Map<string, Uint8Array>()
  let actualDecompressedBytes = 0
  for (const entry of entries) {
    const part = unzipped[entry.name]
    if (part === undefined || part.byteLength !== entry.uncompressedSize) {
      return {
        ok: false,
        diagnostics: [
          diagnostic(
            "DOCX_INVALID_ZIP",
            `The decompressed part '${entry.name}' does not match its ZIP metadata.`
          ),
        ],
      }
    }
    actualDecompressedBytes += part.byteLength
    parts.set(entry.name, part)
  }

  const requiredPartDiagnostics = hasRequiredParts(parts)
  if (requiredPartDiagnostics.length > 0) {
    return { ok: false, diagnostics: requiredPartDiagnostics }
  }
  const securityDiagnostics = activeContentDiagnostics(parts, options)
  if (securityDiagnostics.length > 0) {
    return { ok: false, diagnostics: securityDiagnostics }
  }
  return {
    ok: true,
    value: {
      parts,
      archiveEntries: entries.length,
      decompressedBytes: actualDecompressedBytes,
    },
  }
}
