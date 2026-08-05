import { strToU8, zipSync } from "fflate"

const WORD_NAMESPACE =
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
const PACKAGE_RELATIONSHIPS =
  "http://schemas.openxmlformats.org/package/2006/relationships"
const OFFICE_DOCUMENT_RELATIONSHIP =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
const NUMBERING_RELATIONSHIP =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering"
const FIXED_ZIP_TIME = new Date("1980-01-01T00:00:00.000Z")

export function buildPhase5FormattingTableDocx(): Uint8Array {
  const fragmentedText = Array.from(
    { length: 72 },
    (_, index) => `fragment-${String(index + 1).padStart(2, "0")}`
  ).join(" ")

  return buildDocx(`
    <w:p><w:r><w:t>Before table</w:t></w:r></w:p>
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="4000" w:type="dxa"/>
        <w:tblLayout w:type="fixed"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="8" w:space="1" w:color="102030"/>
          <w:right w:val="double" w:sz="12" w:color="405060"/>
          <w:bottom w:val="dotted" w:sz="8" w:color="708090"/>
          <w:left w:val="dashed" w:sz="8" w:color="A0B0C0"/>
          <w:insideH w:val="single" w:sz="4" w:color="112233"/>
          <w:insideV w:val="single" w:sz="4" w:color="445566"/>
        </w:tblBorders>
        <w:tblCellMar>
          <w:top w:w="80" w:type="dxa"/>
          <w:end w:w="100" w:type="dxa"/>
          <w:bottom w:w="80" w:type="dxa"/>
          <w:start w:w="100" w:type="dxa"/>
        </w:tblCellMar>
      </w:tblPr>
      <w:tblGrid><w:gridCol w:w="1600"/><w:gridCol w:w="2400"/></w:tblGrid>
      <w:tr>
        <w:trPr><w:tblHeader/><w:trHeight w:val="640" w:hRule="exact"/></w:trPr>
        <w:tc>
          <w:tcPr>
            <w:tcW w:w="4000" w:type="dxa"/>
            <w:gridSpan w:val="2"/>
            <w:shd w:val="clear" w:color="auto" w:fill="DDEEFF"/>
            <w:vAlign w:val="center"/>
          </w:tcPr>
          <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>TABLE HEADER</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
      <w:tr>
        <w:trPr><w:trHeight w:val="420" w:hRule="atLeast"/></w:trPr>
        <w:tc>
          <w:tcPr><w:vMerge w:val="restart"/><w:vAlign w:val="top"/><w:shd w:val="clear" w:fill="FFF4CC"/></w:tcPr>
          <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="7"/></w:numPr></w:pPr><w:r><w:t>Cell list</w:t></w:r></w:p>
        </w:tc>
        <w:tc><w:tcPr><w:vAlign w:val="bottom"/></w:tcPr><w:p><w:r><w:t>Row 1 right</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:trPr><w:trHeight w:val="520" w:hRule="exact"/></w:trPr>
        <w:tc><w:tcPr><w:vMerge/><w:vAlign w:val="top"/></w:tcPr><w:p/></w:tc>
        <w:tc><w:tcPr><w:vAlign w:val="center"/></w:tcPr><w:p><w:r><w:t>Row 2 right</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t xml:space="preserve">${fragmentedText}</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Fragment tail</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
    <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="7"/></w:numPr></w:pPr><w:r><w:t>After table</w:t></w:r></w:p>
    <w:sectPr>
      <w:pgSz w:w="4800" w:h="7000"/>
      <w:pgMar w:top="500" w:right="400" w:bottom="500" w:left="400"/>
    </w:sectPr>
  `)
}

export function buildPhase5TemplateTableDocx(): Uint8Array {
  return buildDocx(`
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="4000" w:type="dxa"/>
        <w:tblLayout w:type="fixed"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="8" w:color="222222"/>
          <w:right w:val="single" w:sz="8" w:color="222222"/>
          <w:bottom w:val="single" w:sz="8" w:color="222222"/>
          <w:left w:val="single" w:sz="8" w:color="222222"/>
          <w:insideH w:val="single" w:sz="4" w:color="777777"/>
          <w:insideV w:val="single" w:sz="4" w:color="777777"/>
        </w:tblBorders>
        <w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:end w:w="80" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:start w:w="80" w:type="dxa"/></w:tblCellMar>
      </w:tblPr>
      <w:tblGrid><w:gridCol w:w="2800"/><w:gridCol w:w="1200"/></w:tblGrid>
      <w:tr>
        <w:trPr><w:tblHeader/><w:trHeight w:val="420" w:hRule="exact"/></w:trPr>
        <w:tc><w:tcPr><w:shd w:val="clear" w:fill="E8EEF8"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:r><w:t>ITEM</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:shd w:val="clear" w:fill="E8EEF8"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:r><w:t>QTY</w:t></w:r></w:p></w:tc>
      </w:tr>
      ${markerRow("{{#each invoice.items}}")}
      <w:tr>
        <w:trPr><w:trHeight w:val="440" w:hRule="atLeast"/></w:trPr>
        <w:tc><w:tcPr><w:vAlign w:val="top"/></w:tcPr><w:p><w:r><w:t>{{name:string}}</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:vAlign w:val="bottom"/></w:tcPr><w:p><w:r><w:t>{{quantity:number}}</w:t></w:r></w:p></w:tc>
      </w:tr>
      ${markerRow("{{/each}}")}
    </w:tbl>
    <w:p><w:r><w:t>Template tail</w:t></w:r></w:p>
    <w:sectPr>
      <w:pgSz w:w="4800" w:h="3600"/>
      <w:pgMar w:top="300" w:right="400" w:bottom="300" w:left="400"/>
    </w:sectPr>
  `)
}

function markerRow(marker: string): string {
  return `<w:tr><w:tc><w:p><w:r><w:t>${marker}</w:t></w:r></w:p></w:tc><w:tc><w:p/></w:tc></w:tr>`
}

function buildDocx(body: string): Uint8Array {
  const documentXml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<w:document xmlns:w="${WORD_NAMESPACE}"><w:body>${body}</w:body></w:document>`
  const numberingXml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<w:numbering xmlns:w="${WORD_NAMESPACE}">` +
    `<w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0">` +
    `<w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/>` +
    `<w:suff w:val="tab"/><w:lvlJc w:val="right"/>` +
    `<w:pPr><w:ind w:start="360" w:hanging="180"/></w:pPr>` +
    `</w:lvl></w:abstractNum><w:num w:numId="7"><w:abstractNumId w:val="1"/></w:num>` +
    `</w:numbering>`

  return zipSync(
    {
      "[Content_Types].xml": strToU8(
        `<?xml version="1.0" encoding="UTF-8"?>` +
          `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
          `<Default Extension="xml" ContentType="application/xml"/>` +
          `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
          `<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>` +
          `</Types>`
      ),
      "_rels/.rels": strToU8(
        `<?xml version="1.0" encoding="UTF-8"?>` +
          `<Relationships xmlns="${PACKAGE_RELATIONSHIPS}">` +
          `<Relationship Id="rId1" Type="${OFFICE_DOCUMENT_RELATIONSHIP}" Target="word/document.xml"/>` +
          `</Relationships>`
      ),
      "word/_rels/document.xml.rels": strToU8(
        `<?xml version="1.0" encoding="UTF-8"?>` +
          `<Relationships xmlns="${PACKAGE_RELATIONSHIPS}">` +
          `<Relationship Id="rNumbering" Type="${NUMBERING_RELATIONSHIP}" Target="numbering.xml"/>` +
          `</Relationships>`
      ),
      "word/document.xml": strToU8(documentXml),
      "word/numbering.xml": strToU8(numberingXml),
    },
    { level: 6, mtime: FIXED_ZIP_TIME }
  )
}
