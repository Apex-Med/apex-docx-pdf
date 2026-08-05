import { strToU8, zipSync, zlibSync } from "fflate"

const RELS = "http://schemas.openxmlformats.org/package/2006/relationships"
const OFFICE_REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
const IMAGE_REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"

function u32(value: number): number[] {
  return [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1)
      crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Uint8Array): number[] {
  const body = Uint8Array.from([...strToU8(type), ...data])
  return [...u32(data.length), ...body, ...u32(crc32(body))]
}

/** A generated 2x1 RGB PNG with no borrowed binary fixture data. */
export function generatedPng(): Uint8Array {
  const ihdr = Uint8Array.from([...u32(2), ...u32(1), 8, 2, 0, 0, 0])
  const scanline = Uint8Array.of(0, 220, 40, 30, 30, 90, 220)
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
    ...pngChunk("IDAT", zlibSync(scanline, { level: 9 })),
    ...pngChunk("IEND", new Uint8Array()),
  ])
}

function jpegSegment(marker: number, data: readonly number[]): number[] {
  const length = data.length + 2
  return [0xff, marker, length >>> 8, length & 255, ...data]
}

/** A generated, tiny baseline JPEG envelope accepted by the supported profile. */
export function generatedJpeg(): Uint8Array {
  return Uint8Array.from([
    0xff,
    0xd8,
    ...jpegSegment(
      0xe0,
      [0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]
    ),
    ...jpegSegment(
      0xc0,
      [8, 0, 1, 0, 2, 3, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0]
    ),
    ...jpegSegment(0xda, [3, 1, 0, 2, 0, 3, 0, 0, 63, 0]),
    1,
    2,
    3,
    0xff,
    0xd9,
  ])
}

function drawing(relationshipId: string, width = 762_000): string {
  return `<w:r><w:drawing><wp:inline><wp:extent cx="${width}" cy="381000"/><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="${relationshipId}"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
}

const paragraphProperties =
  '<w:spacing w:after="120"/><w:widowControl w:val="1"/>'
const listProperties =
  '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="7"/></w:numPr>'
const page =
  '<w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple>'
const pages =
  '<w:fldSimple w:instr=" NUMPAGES "><w:r><w:t>3</w:t></w:r></w:fldSimple>'

export function buildPhase6DocumentDocx(): Uint8Array {
  const document = `<w:document xmlns:w="urn:w" xmlns:r="urn:r" xmlns:wp="urn:wp" xmlns:a="urn:a" xmlns:pic="urn:pic"><w:body>
    <w:p><w:pPr>${paragraphProperties}</w:pPr><w:r><w:t xml:space="preserve">Before PNG </w:t></w:r>${drawing("png")}<w:r><w:t xml:space="preserve"> between JPEG </w:t></w:r>${drawing("jpeg")}<w:r><w:t> after images</w:t></w:r></w:p>
    <w:p><w:pPr>${listProperties}</w:pPr><w:r><w:t>First numbered body item</w:t></w:r></w:p>
    <w:tbl><w:tblPr><w:tblLayout w:type="fixed"/><w:tblW w:w="6000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>Table left</w:t></w:r></w:p></w:tc><w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>Table right</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
    <w:p><w:pPr>${listProperties}<w:sectPr><w:headerReference w:type="default" r:id="head"/><w:footerReference w:type="default" r:id="foot"/><w:pgSz w:w="11907" w:h="16839" w:orient="portrait"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:pPr><w:r><w:t>Second numbered body item</w:t></w:r></w:p>
    <w:p><w:pPr><w:sectPr><w:pgSz w:w="16839" w:h="11907" w:orient="landscape"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:pPr><w:r><w:t>Landscape section for {{patient.name:string}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Portrait closing section</w:t></w:r></w:p>
    <w:sectPr><w:pgSz w:w="11907" w:h="16839" w:orient="portrait"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body></w:document>`
  const contentTypes = `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`
  const documentRels = `<Relationships xmlns="${RELS}"><Relationship Id="png" Type="${IMAGE_REL}" Target="media/generated.png"/><Relationship Id="jpeg" Type="${IMAGE_REL}" Target="media/generated.jpg"/><Relationship Id="head" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="foot" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/><Relationship Id="numbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`
  const header = `<w:hdr xmlns:w="urn:w" xmlns:r="urn:r" xmlns:wp="urn:wp" xmlns:a="urn:a" xmlns:pic="urn:pic"><w:p><w:r><w:t xml:space="preserve">Header {{patient.name:string}} </w:t></w:r>${drawing("logo", 381_000)}</w:p></w:hdr>`
  const footer = `<w:ftr xmlns:w="urn:w"><w:p><w:r><w:t xml:space="preserve">Footer {{patient.name:string}} — Page </w:t></w:r>${page}<w:r><w:t xml:space="preserve"> of </w:t></w:r>${pages}</w:p></w:ftr>`
  const numbering = `<w:numbering xmlns:w="urn:w"><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:suff w:val="tab"/><w:lvlJc w:val="right"/><w:pPr><w:ind w:start="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="7"><w:abstractNumId w:val="1"/></w:num></w:numbering>`
  return zipSync(
    {
      "[Content_Types].xml": strToU8(contentTypes),
      "_rels/.rels": strToU8(
        `<Relationships xmlns="${RELS}"><Relationship Id="office" Type="${OFFICE_REL}" Target="word/document.xml"/></Relationships>`
      ),
      "word/document.xml": strToU8(document),
      "word/_rels/document.xml.rels": strToU8(documentRels),
      "word/header1.xml": strToU8(header),
      "word/_rels/header1.xml.rels": strToU8(
        `<Relationships xmlns="${RELS}"><Relationship Id="logo" Type="${IMAGE_REL}" Target="media/generated.png"/></Relationships>`
      ),
      "word/footer1.xml": strToU8(footer),
      "word/numbering.xml": strToU8(numbering),
      "word/media/generated.png": generatedPng(),
      "word/media/generated.jpg": generatedJpeg(),
    },
    { level: 6, mtime: new Date("1980-01-01T00:00:00.000Z") }
  )
}
