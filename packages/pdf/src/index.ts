import { throwIfAborted, twips, type Diagnostic, type NodeId, type PageDisplayList, type RenderMetadata, type Twip } from "@apex-docx-pdf/core"

export type PdfSerializeOptions = Readonly<{
  metadata?: RenderMetadata
  signal?: AbortSignal
}>

export type PdfSerializeResult = Readonly<{
  bytes: Uint8Array
  diagnostics: readonly Diagnostic[]
}>

/**
 * Deterministically serializes a Phase 1 display list as PDF 1.7. The output
 * intentionally uses only the built-in Helvetica Type 1 font and has no clock
 * or random document identifiers.
 */
export function serializePdf(displayList: PageDisplayList, options: PdfSerializeOptions = {}): PdfSerializeResult {
  throwIfAborted(options.signal)
  const diagnostics: Diagnostic[] = []
  const pageCount = displayList.pages.length
  const pageObjectStart = 5
  const objects: Uint8Array[] = []
  const pageReferences = displayList.pages.map((_, index) => `${pageObjectStart + index * 2} 0 R`).join(" ")

  objects.push(ascii("<< /Type /Catalog /Pages 2 0 R >>"))
  objects.push(ascii(`<< /Type /Pages /Count ${pageCount} /Kids [${pageReferences}] >>`))
  objects.push(ascii("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"))
  objects.push(infoObject(options.metadata, diagnostics))

  for (const [index, page] of displayList.pages.entries()) {
    throwIfAborted(options.signal)
    const content = pageContent(page, diagnostics, options.signal)
    const pageObjectNumber = pageObjectStart + index * 2
    const contentObjectNumber = pageObjectNumber + 1
    objects.push(ascii(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${point(page.width)} ${point(page.height)}] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`,
    ))
    objects.push(concat([ascii(`<< /Length ${content.length} >>\nstream\n`), content, ascii("\nendstream")]))
  }

  const header = ascii("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n")
  const writer = new ByteWriter()
  writer.write(header)
  const offsets: number[] = [0]
  for (const [index, object] of objects.entries()) {
    throwIfAborted(options.signal)
    offsets.push(writer.length)
    writer.write(ascii(`${index + 1} 0 obj\n`))
    writer.write(object)
    writer.write(ascii("\nendobj\n"))
  }
  const xrefOffset = writer.length
  writer.write(ascii(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`))
  for (const offset of offsets.slice(1)) writer.write(ascii(`${String(offset).padStart(10, "0")} 00000 n \n`))
  writer.write(ascii(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 4 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`))

  return Object.freeze({ bytes: writer.toBytes(), diagnostics: Object.freeze(diagnostics) })
}

function pageContent(
  page: PageDisplayList["pages"][number],
  diagnostics: Diagnostic[],
  signal?: AbortSignal,
): Uint8Array {
  const writer = new ByteWriter()
  for (const item of page.items) {
    throwIfAborted(signal)
    if (item.type === "glyph-run") {
      if (item.fontFamily !== "Helvetica") {
        diagnostics.push(diagnostic("pdf/font-fallback", "warning", `Phase 1 PDF renders '${item.fontFamily}' with built-in Helvetica`, item.sourceNodeId))
      }
      const encoded = encodeWinAnsi(item.text)
      if (!encoded) {
        diagnostics.push(diagnostic("pdf/text-encoding", "error", "Glyph run contains characters outside Phase 1 WinAnsi encoding and was omitted", item.sourceNodeId))
        continue
      }
      const color = parseColor(item.color)
      if (!color) {
        diagnostics.push(diagnostic("pdf/color", "error", `Unsupported color '${item.color}' in glyph run; run was omitted`, item.sourceNodeId))
        continue
      }
      writer.write(ascii("q\nBT\n"))
      writer.write(ascii(`/F1 ${point(item.fontSize)} Tf\n${color} rg\n`))
      writer.write(ascii(`1 0 0 -1 0 ${point(page.height)} cm\n${point(item.x)} ${point(item.baselineY)} Td\n(`))
      writer.write(escapePdfLiteral(encoded))
      writer.write(ascii(") Tj\nET\nQ\n"))
      continue
    }
    if (item.type === "line") {
      const color = parseColor(item.color)
      if (!color) {
        diagnostics.push(diagnostic("pdf/color", "error", "Unsupported line color; item was omitted", item.sourceNodeId))
        continue
      }
      writer.write(ascii("q\n"))
      writer.write(ascii(`${color} RG\n${point(item.width)} w\n1 0 0 -1 0 ${point(page.height)} cm\n${point(item.x1)} ${point(item.y1)} m ${point(item.x2)} ${point(item.y2)} l S\n`))
    } else {
      const stroke = item.strokeColor ? parseColor(item.strokeColor) : undefined
      const fill = item.fillColor ? parseColor(item.fillColor) : undefined
      if ((item.strokeColor && !stroke) || (item.fillColor && !fill)) {
        diagnostics.push(diagnostic("pdf/color", "error", "Unsupported rectangle color; item was omitted", item.sourceNodeId))
        continue
      }
      writer.write(ascii("q\n"))
      const { bounds } = item
      if (fill) writer.write(ascii(`${fill} rg\n`))
      if (stroke) writer.write(ascii(`${stroke} RG\n${point(item.strokeWidth ?? (20 as Twip))} w\n`))
      writer.write(ascii(`1 0 0 -1 0 ${point(page.height)} cm\n${point(bounds.x)} ${point(twips(bounds.y + bounds.height))} ${point(bounds.width)} ${point(bounds.height)} re ${fill && stroke ? "B" : fill ? "f" : "S"}\n`))
    }
    writer.write(ascii("Q\n"))
  }
  return writer.toBytes()
}

function infoObject(metadata: RenderMetadata | undefined, diagnostics: Diagnostic[]): Uint8Array {
  const entries: Array<readonly [string, string]> = [["Producer", "Apex DOCX PDF Phase 1"]]
  if (metadata?.title) entries.push(["Title", metadata.title])
  if (metadata?.author) entries.push(["Author", metadata.author])
  if (metadata?.subject) entries.push(["Subject", metadata.subject])
  if (metadata?.keywords?.length) entries.push(["Keywords", metadata.keywords.join(", ")])
  const writer = new ByteWriter()
  writer.write(ascii("<<"))
  for (const [name, value] of entries) {
    const encoded = encodeWinAnsi(value)
    if (!encoded) {
      diagnostics.push(diagnostic("pdf/metadata-encoding", "error", `Metadata field ${name} contains characters outside Phase 1 WinAnsi encoding and was omitted`))
      continue
    }
    writer.write(ascii(` /${name} (`))
    writer.write(escapePdfLiteral(encoded))
    writer.write(ascii(")"))
  }
  writer.write(ascii(" >>"))
  return writer.toBytes()
}

function point(value: Twip): string {
  const numeric = value as number
  const whole = Math.trunc(numeric / 20)
  const remainder = Math.abs(numeric % 20)
  if (remainder === 0) return String(whole)
  return `${whole}.${String(remainder * 5).padStart(2, "0").replace(/0$/u, "")}`
}

function parseColor(value: string): string | undefined {
  const match = /^#([0-9a-fA-F]{6})$/u.exec(value)
  if (!match?.[1]) return undefined
  const red = Number.parseInt(match[1].slice(0, 2), 16) / 255
  const green = Number.parseInt(match[1].slice(2, 4), 16) / 255
  const blue = Number.parseInt(match[1].slice(4, 6), 16) / 255
  return `${colorComponent(red)} ${colorComponent(green)} ${colorComponent(blue)}`
}

function colorComponent(value: number): string {
  return value.toFixed(6).replace(/0+$/u, "").replace(/\.$/u, "") || "0"
}

function encodeWinAnsi(text: string): Uint8Array | undefined {
  const bytes: number[] = []
  for (const character of text) {
    const codePoint = character.codePointAt(0)
    if (codePoint === undefined) return undefined
    if (codePoint >= 0x20 && codePoint <= 0x7e) bytes.push(codePoint)
    else if (codePoint >= 0xa0 && codePoint <= 0xff) bytes.push(codePoint)
    else {
      const mapped = WIN_ANSI.get(character)
      if (mapped === undefined) return undefined
      bytes.push(mapped)
    }
  }
  return Uint8Array.from(bytes)
}

const WIN_ANSI = new Map<string, number>([
  ["€", 0x80], ["‚", 0x82], ["ƒ", 0x83], ["„", 0x84], ["…", 0x85], ["†", 0x86], ["‡", 0x87], ["ˆ", 0x88], ["‰", 0x89], ["Š", 0x8a], ["‹", 0x8b], ["Œ", 0x8c], ["Ž", 0x8e], ["‘", 0x91], ["’", 0x92], ["“", 0x93], ["”", 0x94], ["•", 0x95], ["–", 0x96], ["—", 0x97], ["˜", 0x98], ["™", 0x99], ["š", 0x9a], ["›", 0x9b], ["œ", 0x9c], ["ž", 0x9e], ["Ÿ", 0x9f],
])

function escapePdfLiteral(bytes: Uint8Array): Uint8Array {
  const escaped: number[] = []
  for (const byte of bytes) {
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) escaped.push(0x5c)
    escaped.push(byte)
  }
  return Uint8Array.from(escaped)
}

function diagnostic(code: string, severity: Diagnostic["severity"], message: string, nodeId?: NodeId): Diagnostic {
  return { code, severity, message, ...(nodeId ? { nodeId } : {}) }
}

function ascii(value: string): Uint8Array {
  const bytes: number[] = []
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code > 0xff) throw new TypeError("PDF syntax must be Latin-1")
    bytes.push(code)
  }
  return Uint8Array.from(bytes)
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.length, 0)
  const result = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

class ByteWriter {
  private readonly chunks: Uint8Array[] = []
  private size = 0

  get length(): number { return this.size }

  write(value: Uint8Array): void {
    this.chunks.push(value)
    this.size += value.length
  }

  toBytes(): Uint8Array { return concat(this.chunks) }
}
