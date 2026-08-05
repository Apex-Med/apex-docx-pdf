import { strToU8, zipSync } from "fflate"

const OFFICE_DOCUMENT_RELATIONSHIP =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"

export type OneParagraphDocxFixtureOptions = Readonly<{
  documentXml?: string
  rootRelationshipsXml?: string
  extraParts?: Readonly<Record<string, string | Uint8Array>>
}>

/** A legal, tiny DOCX package assembled entirely in memory for deterministic tests. */
export function buildOneParagraphDocx(
  options: OneParagraphDocxFixtureOptions = {}
): Uint8Array {
  const documentXml =
    options.documentXml ??
    `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Hello DOCX</w:t></w:r></w:p>
    <w:sectPr><w:pgSz w:w="11907" w:h="16839"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>`
  const rootRelationshipsXml =
    options.rootRelationshipsXml ??
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="${OFFICE_DOCUMENT_RELATIONSHIP}" Target="word/document.xml"/>
</Relationships>`
  const parts: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`),
    "_rels/.rels": strToU8(rootRelationshipsXml),
    "word/document.xml": strToU8(documentXml),
  }
  for (const [name, value] of Object.entries(options.extraParts ?? {})) {
    parts[name] = typeof value === "string" ? strToU8(value) : value
  }
  return zipSync(parts, {
    level: 6,
    mtime: new Date("1980-01-01T00:00:00.000Z"),
  })
}
