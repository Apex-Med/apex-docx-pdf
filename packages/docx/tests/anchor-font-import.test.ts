import { describe, expect, test } from "bun:test"
import { serializeDocx } from "../src"
import { normaliseDocxBytes, parseDocx } from "../src"
import { buildOneParagraphDocx } from "./helpers/docx-fixture"

const RELS = "http://schemas.openxmlformats.org/package/2006/relationships"
const DOCX_REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships"

function embeddedFontFixture(): Uint8Array {
  const fontFaces = Array.from({ length: 12 }, (_, index) => {
    const number = String(index + 1).padStart(2, "0")
    return {
      family: `RMSH Fixture Face ${number}`,
      relationshipId: `font${number}`,
      target: `fonts/face${number}.odttf`,
      bytes: Uint8Array.from([0, 1, 0, 0, index + 1, 0xaa, 0x55]),
    }
  })
  const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body><w:p><w:r><w:drawing><wp:anchor layoutInCell="1" behindDoc="0"><wp:positionH relativeFrom="column"><wp:posOffset>1270</wp:posOffset></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>1905</wp:posOffset></wp:positionV><wp:extent cx="6350" cy="5080"/><wp:wrapSquare/><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="image1"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r></w:p><w:sectPr/></w:body>
</w:document>`
  const fontTableXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${fontFaces.map((face) => `<w:font w:name="${face.family}"><w:embedRegular r:id="${face.relationshipId}"/></w:font>`).join("")}</w:fonts>`
  return buildOneParagraphDocx({
    documentXml,
    extraParts: {
      "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="svg" ContentType="image/svg+xml"/><Default Extension="odttf" ContentType="application/x-font-ttf"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/></Types>`,
      "word/_rels/document.xml.rels": `<Relationships xmlns="${RELS}"><Relationship Id="image1" Type="${DOCX_REL}/image" Target="media/crest.svg"/><Relationship Id="fontTable" Type="${DOCX_REL}/fontTable" Target="fontTable.xml"/></Relationships>`,
      "word/media/crest.svg": `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="8"><rect width="10" height="8" fill="#1d4ed8"/></svg>`,
      "word/fontTable.xml": fontTableXml,
      "word/_rels/fontTable.xml.rels": `<Relationships xmlns="${RELS}">${fontFaces.map((face) => `<Relationship Id="${face.relationshipId}" Type="${DOCX_REL}/font" Target="${face.target}"/>`).join("")}</Relationships>`,
      ...Object.fromEntries(
        fontFaces.map((face) => [`word/${face.target}`, face.bytes])
      ),
    },
  })
}

describe("anchored image and embedded-font import", () => {
  test("normalises a supported DrawingML anchor and preserves all embedded font faces", () => {
    const bytes = embeddedFontFixture()
    const parsed = parseDocx(bytes)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    expect(parsed.value.document.fontAssets).toHaveLength(12)
    expect(
      parsed.value.document.fontAssets.map((asset) => asset.family)
    ).toEqual(
      Array.from(
        { length: 12 },
        (_, index) => `RMSH Fixture Face ${String(index + 1).padStart(2, "0")}`
      )
    )
    expect(parsed.value.document.fontAssets[11]?.bytes).toEqual([
      0, 1, 0, 0, 12, 0xaa, 0x55,
    ])

    const normalised = normaliseDocxBytes(bytes)
    expect(normalised.ok).toBe(true)
    if (!normalised.ok) return
    const fontAssets = normalised.value.fontAssets ?? []
    expect(fontAssets).toHaveLength(12)
    expect(fontAssets[0]).toMatchObject({
      family: "RMSH Fixture Face 01",
      weight: 400,
      style: "normal",
      packagePath: "word/fonts/face01.odttf",
    })
    const firstBlock = normalised.value.sections[0]?.blocks[0]
    expect(firstBlock?.type).toBe("paragraph")
    if (firstBlock?.type !== "paragraph") return
    const image = firstBlock.children.find((inline) => inline.type === "image")
    expect(image).toMatchObject({
      type: "image",
      width: 10,
      height: 8,
      placement: {
        type: "anchor",
        offsetX: 2,
        offsetY: 3,
        horizontalRelative: "column",
        verticalRelative: "paragraph",
        wrap: "square",
      },
    })

    const reparsed = normaliseDocxBytes(serializeDocx(normalised.value))
    expect(reparsed.ok).toBe(true)
    if (!reparsed.ok) return
    const reparsedBlock = reparsed.value.sections[0]?.blocks[0]
    expect(reparsedBlock?.type).toBe("paragraph")
    if (reparsedBlock?.type !== "paragraph") return
    expect(
      reparsedBlock.children.find((inline) => inline.type === "image")
        ?.placement
    ).toMatchObject({ type: "anchor", offsetX: 2, offsetY: 3 })
  })
})
