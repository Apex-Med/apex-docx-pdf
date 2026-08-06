import { strToU8, zipSync, zlibSync } from "fflate"

const FIXED_ZIP_TIME = new Date("1980-01-01T00:00:00.000Z")
const RELATIONSHIPS =
  "http://schemas.openxmlformats.org/package/2006/relationships"
const OFFICE_RELATIONSHIPS =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships"

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`

const relationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

const documentRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
  <Relationship Id="rHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
  <Relationship Id="rFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
  <Relationship Id="rBodyLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/apex-mark.png"/>
  <Relationship Id="rStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`

const headerRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${RELATIONSHIPS}">
  <Relationship Id="rHeaderLogo" Type="${OFFICE_RELATIONSHIPS}/image" Target="media/apex-mark.png"/>
</Relationships>`

const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="1">
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="decimal"/>
      <w:lvlText w:val="%1."/>
      <w:suff w:val="space"/>
      <w:lvlJc w:val="right"/>
      <w:pPr><w:ind w:start="360" w:hanging="240"/></w:pPr>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="7"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`

const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Helvetica" w:hAnsi="Helvetica"/></w:rPr></w:rPrDefault>
  </w:docDefaults>
</w:styles>`

function u32(value: number): number[] {
  return [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Uint8Array): number[] {
  const body = Uint8Array.from([...strToU8(type), ...data])
  return [...u32(data.length), ...body, ...u32(crc32(body))]
}

/** A generated 4x2 RGB PNG, kept deliberately tiny for stable worker rendering. */
function generatedLogoPng(): Uint8Array {
  const ihdr = Uint8Array.from([...u32(4), ...u32(2), 8, 2, 0, 0, 0])
  const scanlines = Uint8Array.of(
    0,
    23,
    50,
    77,
    23,
    50,
    77,
    49,
    130,
    206,
    49,
    130,
    206,
    0,
    49,
    130,
    206,
    49,
    130,
    206,
    23,
    50,
    77,
    23,
    50,
    77
  )
  return Uint8Array.from([
    137,
    80,
    78,
    71,
    13,
    10,
    26,
    10,
    ...pngChunk("IHDR", ihdr),
    ...pngChunk("IDAT", zlibSync(scanlines, { level: 9 })),
    ...pngChunk("IEND", new Uint8Array()),
  ])
}

function drawing(
  relationshipId: string,
  width: number,
  height: number
): string {
  return `<w:r><w:drawing><wp:inline><wp:extent cx="${width}" cy="${height}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="${relationshipId}"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
}

const pageField =
  '<w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple>'
const pageCountField =
  '<w:fldSimple w:instr=" NUMPAGES "><w:r><w:t>3</w:t></w:r></w:fldSimple>'

const header = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:p>${drawing("rHeaderLogo", 457_200, 228_600)}<w:r><w:t xml:space="preserve">  Apex care · {{patient.fullName:string}} · {{document.reference:string}}</w:t></w:r></w:p>
</w:hdr>`

const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t xml:space="preserve">{{document.reference:string}} · Page </w:t></w:r>${pageField}<w:r><w:t xml:space="preserve"> of </w:t></w:r>${pageCountField}</w:p>
</w:ftr>`

const portraitSection = `<w:sectPr>
  <w:type w:val="nextPage"/>
  <w:headerReference w:type="default" r:id="rHeader"/>
  <w:footerReference w:type="default" r:id="rFooter"/>
  <w:pgSz w:w="11907" w:h="16839" w:orient="portrait"/>
  <w:pgMar w:top="1080" w:right="900" w:bottom="1080" w:left="900" w:header="360" w:footer="420"/>
</w:sectPr>`

const inheritedLandscapeSection = `<w:sectPr>
  <w:type w:val="nextPage"/>
  <w:pgSz w:w="16839" w:h="11907" w:orient="landscape"/>
  <w:pgMar w:top="1080" w:right="900" w:bottom="1080" w:left="900" w:header="360" w:footer="420"/>
</w:sectPr>`

const inheritedPortraitSection = `<w:sectPr>
  <w:type w:val="nextPage"/>
  <w:pgSz w:w="11907" w:h="16839" w:orient="portrait"/>
  <w:pgMar w:top="1080" w:right="900" w:bottom="1080" w:left="900" w:header="360" w:footer="420"/>
</w:sectPr>`

const tableCellWidths = [3400, 800, 1500, 1900] as const

function cell(width: number, content: string, properties = ""): string {
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${properties}</w:tcPr>${content}</w:tc>`
}

function paragraph(text: string, properties = ""): string {
  return `<w:p>${properties}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
}

function markerRow(marker: string): string {
  return `<w:tr>${cell(tableCellWidths[0], paragraph(marker))}${tableCellWidths
    .slice(1)
    .map((width) => cell(width, "<w:p/>"))
    .join("")}</w:tr>`
}

const headerCellProperties =
  '<w:shd w:val="clear" w:color="auto" w:fill="17324D"/><w:vAlign w:val="center"/>'
const totalCellProperties =
  '<w:shd w:val="clear" w:color="auto" w:fill="E8F0F7"/><w:vAlign w:val="center"/>'
const rightAligned = '<w:pPr><w:jc w:val="right"/></w:pPr>'
const itemNumbering =
  '<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="7"/></w:numPr></w:pPr>'

const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    <w:p><w:pPr><w:spacing w:after="120"/></w:pPr><w:r><w:rPr><w:sz w:val="32"/></w:rPr><w:t>{{invoice.title:string | upper}}</w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">Invoice: </w:t></w:r><w:r><w:t>{{document.reference:string}}</w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">Prepared for: </w:t></w:r><w:r><w:t>{{patient.fullName:string}}</w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">Issued: {{invoice.issuedDate:date | date:"dd-MM-yyyy HH:mm"}}  ·  Due: {{invoice.dueDate:date | date}}</w:t></w:r></w:p>
    <w:p><w:r><w:t/></w:r></w:p>
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="7600" w:type="dxa"/>
        <w:tblLayout w:type="fixed"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="8" w:color="17324D"/>
          <w:right w:val="single" w:sz="8" w:color="17324D"/>
          <w:bottom w:val="double" w:sz="12" w:color="17324D"/>
          <w:left w:val="single" w:sz="8" w:color="17324D"/>
          <w:insideH w:val="single" w:sz="4" w:color="AFC1D2"/>
          <w:insideV w:val="single" w:sz="4" w:color="AFC1D2"/>
        </w:tblBorders>
        <w:tblCellMar>
          <w:top w:w="100" w:type="dxa"/>
          <w:end w:w="120" w:type="dxa"/>
          <w:bottom w:w="100" w:type="dxa"/>
          <w:start w:w="120" w:type="dxa"/>
        </w:tblCellMar>
      </w:tblPr>
      <w:tblGrid>
        <w:gridCol w:w="3400"/>
        <w:gridCol w:w="800"/>
        <w:gridCol w:w="1500"/>
        <w:gridCol w:w="1900"/>
      </w:tblGrid>
      <w:tr>
        <w:trPr><w:tblHeader/><w:trHeight w:val="520" w:hRule="atLeast"/></w:trPr>
        ${cell(3400, paragraph("SERVICE"), headerCellProperties)}
        ${cell(800, paragraph("QTY", rightAligned), headerCellProperties)}
        ${cell(1500, paragraph("UNIT", rightAligned), headerCellProperties)}
        ${cell(1900, paragraph("AMOUNT", rightAligned), headerCellProperties)}
      </w:tr>
      ${markerRow("{{#each invoice.items}}")}
      <w:tr>
        <w:trPr><w:trHeight w:val="480" w:hRule="atLeast"/></w:trPr>
        ${cell(3400, paragraph("{{description:string}}", itemNumbering), '<w:vAlign w:val="top"/>')}
        ${cell(800, paragraph("{{quantity:number}}", rightAligned), '<w:vAlign w:val="top"/>')}
        ${cell(1500, paragraph('{{unitPrice:number | currency:"ZAR"}}', rightAligned), '<w:vAlign w:val="top"/>')}
        ${cell(1900, paragraph('{{amount:number | currency:"ZAR"}}', rightAligned), '<w:vAlign w:val="top"/>')}
      </w:tr>
      ${markerRow("{{/each}}")}
      <w:tr>
        <w:trPr><w:cantSplit/><w:trHeight w:val="520" w:hRule="atLeast"/></w:trPr>
        ${cell(3400, paragraph("TOTAL"), totalCellProperties)}
        ${cell(800, "<w:p/>", totalCellProperties)}
        ${cell(1500, "<w:p/>", totalCellProperties)}
        ${cell(1900, paragraph('{{invoice.total:number | currency:"ZAR"}}', rightAligned), totalCellProperties)}
      </w:tr>
    </w:tbl>
    <w:p><w:pPr><w:spacing w:before="160"/>${portraitSection}</w:pPr><w:r><w:t>Line items use real DOCX numbering and deterministic fixed-grid geometry.</w:t></w:r></w:p>
    <w:p><w:pPr><w:spacing w:after="180"/></w:pPr><w:r><w:rPr><w:sz w:val="28"/></w:rPr><w:t>Landscape care summary</w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">A generated static PNG is embedded inline: </w:t></w:r>${drawing("rBodyLogo", 914_400, 457_200)}</w:p>
    <w:p><w:pPr>${inheritedLandscapeSection}</w:pPr><w:r><w:t>This next-page landscape section inherits the default header and footer.</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:sz w:val="28"/></w:rPr><w:t>Portrait follow-up</w:t></w:r></w:p>
    <w:p><w:r><w:t>The final portrait section keeps the same global Page X of Y footer.</w:t></w:r></w:p>
    ${inheritedPortraitSection}
  </w:body>
</w:document>`

export function createSampleDocx(): Uint8Array {
  return zipSync(
    {
      "[Content_Types].xml": strToU8(contentTypes),
      "_rels/.rels": strToU8(relationships),
      "word/document.xml": strToU8(document),
      "word/_rels/document.xml.rels": strToU8(documentRelationships),
      "word/header1.xml": strToU8(header),
      "word/_rels/header1.xml.rels": strToU8(headerRelationships),
      "word/footer1.xml": strToU8(footer),
      "word/numbering.xml": strToU8(numbering),
      "word/styles.xml": strToU8(styles),
      "word/media/apex-mark.png": generatedLogoPng(),
    },
    { level: 6, mtime: FIXED_ZIP_TIME }
  )
}

export const SAMPLE_DATA = Object.freeze({
  patient: { fullName: "Amara Mokoena" },
  document: { reference: "AX-2026-001" },
  invoice: {
    title: "veterinary care invoice",
    issuedDate: "2026-08-05T09:30:00.000+02:00",
    dueDate: "2026-08-19T00:00:00.000+02:00",
    items: [
      {
        description: "Clinical consultation",
        quantity: 1,
        unitPrice: 1250,
        amount: 1250,
      },
      {
        description: "Dispensed medication",
        quantity: 2,
        unitPrice: 115.25,
        amount: 230.5,
      },
    ],
    total: 1480.5,
  },
})
