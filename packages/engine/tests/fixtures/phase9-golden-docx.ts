import { strToU8, zipSync } from "fflate"

const ZIP_TIME = new Date("1980-01-01T00:00:00.000Z")

/** Original synthetic fixture. It contains no third-party document content. */
export function buildPhase9GoldenDocx(): Uint8Array {
  return zipSync(
    {
      "[Content_Types].xml": strToU8(
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
          `<Default Extension="xml" ContentType="application/xml"/>` +
          `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
          `</Types>`
      ),
      "_rels/.rels": strToU8(
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
          `</Relationships>`
      ),
      "word/document.xml": strToU8(
        `<?xml version="1.0" encoding="UTF-8"?>` +
          `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
          `<w:p><w:r><w:t>Golden {{subject:string}}</w:t></w:r></w:p>` +
          `<w:p><w:r><w:t>Deterministic trace evidence.</w:t></w:r></w:p>` +
          `<w:sectPr><w:pgSz w:w="6120" w:h="7920"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr>` +
          `</w:body></w:document>`
      ),
    },
    { level: 6, mtime: ZIP_TIME }
  )
}
