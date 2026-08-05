import { strToU8, zipSync } from "fflate"

const WORD_NAMESPACE =
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
const OFFICE_DOCUMENT_RELATIONSHIP =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"

export type MinimalDocxParagraph =
  | string
  | Readonly<{
      /** Each entry becomes a separate w:r, allowing deterministic run fragmentation. */
      runs: readonly string[]
    }>

export type MinimalDocxOptions = Readonly<{
  paragraphs?: readonly MinimalDocxParagraph[]
  pageSize?: Readonly<{ width: number; height: number }>
  margins?: Readonly<{
    top: number
    right: number
    bottom: number
    left: number
  }>
}>

/** Builds a deterministic, minimal OOXML ZIP suitable for parser/layout tests. */
export function buildMinimalDocx(options: MinimalDocxOptions = {}): Uint8Array {
  const paragraphs = options.paragraphs ?? ["Hello DOCX"]
  const pageSize = options.pageSize ?? { width: 11_906, height: 16_838 }
  const margins = options.margins ?? {
    top: 1_440,
    right: 1_440,
    bottom: 1_440,
    left: 1_440,
  }
  for (const [name, value] of Object.entries(pageSize)) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new RangeError(`${name} must be a positive integer twip value`)
    }
  }
  for (const [name, value] of Object.entries(margins)) {
    if (!Number.isInteger(value) || value < 0) {
      throw new RangeError(`${name} must be a non-negative integer twip value`)
    }
  }

  const paragraphXml = paragraphs
    .map((paragraph) => {
      const runs = typeof paragraph === "string" ? [paragraph] : paragraph.runs
      return `<w:p>${runs.map(runXml).join("")}</w:p>`
    })
    .join("")
  const documentXml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<w:document xmlns:w="${WORD_NAMESPACE}"><w:body>${paragraphXml}` +
    `<w:sectPr><w:pgSz w:w="${pageSize.width}" w:h="${pageSize.height}"/>` +
    `<w:pgMar w:top="${margins.top}" w:right="${margins.right}" ` +
    `w:bottom="${margins.bottom}" w:left="${margins.left}"/></w:sectPr>` +
    `</w:body></w:document>`

  return zipSync(
    {
      "[Content_Types].xml": strToU8(
        `<?xml version="1.0" encoding="UTF-8"?>` +
          `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
          `<Default Extension="xml" ContentType="application/xml"/>` +
          `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
          `</Types>`
      ),
      "_rels/.rels": strToU8(
        `<?xml version="1.0" encoding="UTF-8"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="${OFFICE_DOCUMENT_RELATIONSHIP}" Target="word/document.xml"/>` +
          `</Relationships>`
      ),
      "word/document.xml": strToU8(documentXml),
    },
    { level: 6, mtime: new Date("1980-01-01T00:00:00.000Z") }
  )
}

function runXml(text: string): string {
  const preserve = /^\s|\s$/u.test(text) ? ` xml:space="preserve"` : ""
  return `<w:r><w:t${preserve}>${escapeXml(text)}</w:t></w:r>`
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}
