export type StoredArtifactKind = "docx" | "pdf"

const PDF_MAGIC = Uint8Array.of(0x25, 0x50, 0x44, 0x46, 0x2d)
const ZIP_LOCAL_FILE_HEADER = 0x04034b50
const ZIP_CENTRAL_DIRECTORY_HEADER = 0x02014b50
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50
const MAX_ZIP_TAIL_BYTES = 65_557
const MAX_ARCHIVE_ENTRIES = 2_000
const MAX_DECOMPRESSED_BYTES = 100_000_000
const MAX_CENTRAL_DIRECTORY_BYTES = 2_000_000
const REQUIRED_DOCX_PARTS = new Set([
  "[Content_Types].xml",
  "_rels/.rels",
  "word/document.xml",
])

const decoder = new TextDecoder("utf-8", { fatal: true })

export async function validateStoredArtifactContent(
  blob: Blob,
  kind: StoredArtifactKind
): Promise<boolean> {
  return kind === "pdf"
    ? await hasPdfMagic(blob)
    : await hasDocxPackageShape(blob)
}

async function hasPdfMagic(blob: Blob): Promise<boolean> {
  if (blob.size < PDF_MAGIC.length) return false
  const prefix = new Uint8Array(
    await blob.slice(0, PDF_MAGIC.length).arrayBuffer()
  )
  return PDF_MAGIC.every((byte, index) => prefix[index] === byte)
}

async function hasDocxPackageShape(blob: Blob): Promise<boolean> {
  if (blob.size < 22) return false
  const prefix = new Uint8Array(await blob.slice(0, 4).arrayBuffer())
  if (readU32(prefix, 0) !== ZIP_LOCAL_FILE_HEADER) return false

  const tailStart = Math.max(0, blob.size - MAX_ZIP_TAIL_BYTES)
  const tail = new Uint8Array(await blob.slice(tailStart).arrayBuffer())
  const endOffset = findEndOfCentralDirectory(tail)
  if (endOffset < 0) return false

  const disk = readU16(tail, endOffset + 4)
  const directoryDisk = readU16(tail, endOffset + 6)
  const entriesOnDisk = readU16(tail, endOffset + 8)
  const totalEntries = readU16(tail, endOffset + 10)
  const directorySize = readU32(tail, endOffset + 12)
  const directoryOffset = readU32(tail, endOffset + 16)
  const commentLength = readU16(tail, endOffset + 20)
  if (
    disk !== 0 ||
    directoryDisk !== 0 ||
    entriesOnDisk === undefined ||
    totalEntries === undefined ||
    entriesOnDisk !== totalEntries ||
    totalEntries < REQUIRED_DOCX_PARTS.size ||
    totalEntries > MAX_ARCHIVE_ENTRIES ||
    directorySize === undefined ||
    directorySize > MAX_CENTRAL_DIRECTORY_BYTES ||
    directoryOffset === undefined ||
    commentLength === undefined ||
    endOffset + 22 + commentLength !== tail.length
  ) {
    return false
  }

  const absoluteEndOffset = tailStart + endOffset
  if (
    directoryOffset + directorySize !== absoluteEndOffset ||
    directoryOffset + directorySize > blob.size
  ) {
    return false
  }
  const directory = new Uint8Array(
    await blob
      .slice(directoryOffset, directoryOffset + directorySize)
      .arrayBuffer()
  )
  return validateCentralDirectory(directory, totalEntries, directoryOffset)
}

function validateCentralDirectory(
  directory: Uint8Array,
  totalEntries: number,
  directoryOffset: number
): boolean {
  const seen = new Set<string>()
  let decompressedBytes = 0
  let offset = 0

  for (let index = 0; index < totalEntries; index += 1) {
    if (
      offset + 46 > directory.length ||
      readU32(directory, offset) !== ZIP_CENTRAL_DIRECTORY_HEADER
    ) {
      return false
    }
    const flags = readU16(directory, offset + 8)
    const compressionMethod = readU16(directory, offset + 10)
    const compressedSize = readU32(directory, offset + 20)
    const uncompressedSize = readU32(directory, offset + 24)
    const nameLength = readU16(directory, offset + 28)
    const extraLength = readU16(directory, offset + 30)
    const commentLength = readU16(directory, offset + 32)
    const diskStart = readU16(directory, offset + 34)
    const localHeaderOffset = readU32(directory, offset + 42)
    if (
      flags === undefined ||
      (flags & 0x41) !== 0 ||
      (compressionMethod !== 0 && compressionMethod !== 8) ||
      compressedSize === undefined ||
      uncompressedSize === undefined ||
      nameLength === undefined ||
      extraLength === undefined ||
      commentLength === undefined ||
      diskStart !== 0 ||
      localHeaderOffset === undefined ||
      localHeaderOffset + 30 > directoryOffset ||
      compressedSize > directoryOffset - localHeaderOffset - 30
    ) {
      return false
    }
    const end = offset + 46 + nameLength + extraLength + commentLength
    if (end > directory.length) return false

    let name: string
    try {
      name = decoder.decode(
        directory.subarray(offset + 46, offset + 46 + nameLength)
      )
    } catch {
      return false
    }
    if (!isSafePartPath(name) || seen.has(name)) return false
    seen.add(name)

    decompressedBytes += uncompressedSize
    if (
      !Number.isSafeInteger(decompressedBytes) ||
      decompressedBytes > MAX_DECOMPRESSED_BYTES
    ) {
      return false
    }
    offset = end
  }

  return (
    offset === directory.length &&
    [...REQUIRED_DOCX_PARTS].every((part) => seen.has(part))
  )
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  for (let offset = bytes.length - 22; offset >= 0; offset -= 1) {
    if (readU32(bytes, offset) === ZIP_END_OF_CENTRAL_DIRECTORY) return offset
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

function readU16(bytes: Uint8Array, offset: number): number | undefined {
  const byte0 = bytes[offset]
  const byte1 = bytes[offset + 1]
  return byte0 === undefined || byte1 === undefined
    ? undefined
    : byte0 | (byte1 << 8)
}

function readU32(bytes: Uint8Array, offset: number): number | undefined {
  const byte0 = bytes[offset]
  const byte1 = bytes[offset + 1]
  const byte2 = bytes[offset + 2]
  const byte3 = bytes[offset + 3]
  return byte0 === undefined ||
    byte1 === undefined ||
    byte2 === undefined ||
    byte3 === undefined
    ? undefined
    : (byte0 | (byte1 << 8) | (byte2 << 16) | (byte3 << 24)) >>> 0
}
