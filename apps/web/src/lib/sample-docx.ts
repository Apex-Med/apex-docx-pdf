import { strToU8, zipSync } from "fflate"

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`

const relationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Patient statement</w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">Prepared for </w:t></w:r><w:r><w:t>{{patient.</w:t></w:r><w:r><w:t>fullName:string}}</w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">Reference: </w:t></w:r><w:r><w:t>{{document.reference:string}}</w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">Balance: R </w:t></w:r><w:r><w:t>{{invoice.total:number}}</w:t></w:r></w:p>
  </w:body>
</w:document>`

export function createSampleDocx(): Uint8Array {
  return zipSync(
    {
      "[Content_Types].xml": strToU8(contentTypes),
      "_rels/.rels": strToU8(relationships),
      "word/document.xml": strToU8(document),
    },
    { level: 6 }
  )
}

export const SAMPLE_DATA = Object.freeze({
  patient: { fullName: "Amara Mokoena" },
  document: { reference: "AX-2026-001" },
  invoice: { total: 1480 },
})
