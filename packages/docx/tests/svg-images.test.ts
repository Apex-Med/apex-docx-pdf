import { describe, expect, test } from "bun:test"
import {
  createBlankDocument,
  nodeId,
  twips,
  type SemanticDocument,
  type SemanticImageAsset,
  type SemanticParagraph,
} from "@apexmed/core"
import { minimalPng } from "@apexmed/images"

import { normaliseDocxBytes, serializeDocx } from "../src"
import { buildOneParagraphDocx } from "./helpers/docx-fixture"

function testPng(width: number, height: number): Uint8Array {
  return minimalPng(width, height)
}

const PNG_3X2 = testPng(3, 2)
const SVG_MARKUP = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3 2"><rect width="3" height="2" fill="#c82828"/></svg>`

describe("DOCX SVG (asvg:svgBlip)", () => {
  test("parses svgBlip and prefers SVG asset with PNG rasterFallback", () => {
    const contentTypes = `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="svg" ContentType="image/svg+xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
    const bytes = buildOneParagraphDocx({
      documentXml: `<w:document xmlns:w="urn:w" xmlns:r="urn:r" xmlns:wp="urn:wp" xmlns:a="urn:a" xmlns:pic="urn:pic" xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main"><w:body><w:p>
        <w:r><w:drawing><wp:inline><wp:extent cx="1905" cy="1270"/><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="imgPng"><a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"><asvg:svgBlip r:embed="imgSvg"/></a:ext></a:extLst></a:blip></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>
      </w:p><w:sectPr/></w:body></w:document>`,
      extraParts: {
        "[Content_Types].xml": contentTypes,
        "word/_rels/document.xml.rels": `<Relationships xmlns="urn:rels"><Relationship Id="imgPng" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/picture.png"/><Relationship Id="imgSvg" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/picture.svg"/></Relationships>`,
        "word/media/picture.png": PNG_3X2,
        "word/media/picture.svg": SVG_MARKUP,
      },
    })
    const result = normaliseDocxBytes(bytes)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.assets).toHaveLength(1)
    const asset = result.value.assets[0]!
    expect(asset.mimeType).toBe("image/svg+xml")
    expect(asset.packagePath).toBe("word/media/picture.svg")
    expect(asset.rasterFallback?.packagePath).toBe("word/media/picture.png")
    expect(asset.rasterFallback?.pixelWidth).toBe(3)
    expect(asset.rasterFallback?.pixelHeight).toBe(2)
  })

  test("serializeDocx emits svgBlip + PNG fallback for SVG assets", () => {
    const png = testPng(2, 1)
    const asset: SemanticImageAsset = {
      type: "imageAsset",
      id: "logo",
      source: { part: "editor", xmlPath: "/media/logo" },
      packagePath: "word/media/logo.svg",
      mimeType: "image/svg+xml",
      bytes: Array.from(new TextEncoder().encode(SVG_MARKUP)),
      pixelWidth: 3,
      pixelHeight: 2,
      rasterFallback: {
        bytes: Array.from(png),
        pixelWidth: 2,
        pixelHeight: 1,
        packagePath: "word/media/logo.png",
      },
    }
    const blank = createBlankDocument()
    const firstParagraph = blank.sections[0]!.blocks[0] as SemanticParagraph
    const document: SemanticDocument = {
      ...blank,
      assets: [asset],
      sections: [
        {
          ...blank.sections[0]!,
          blocks: [
            {
              ...firstParagraph,
              children: [
                {
                  type: "image",
                  id: nodeId("img1"),
                  source: {
                    part: "word/document.xml",
                    xmlPath: "/w:document/w:body/w:p[1]/w:r[1]/w:drawing",
                  },
                  assetId: "logo",
                  width: twips(3),
                  height: twips(2),
                  aspect: {
                    pixelWidth: 3,
                    pixelHeight: 2,
                    intrinsicRatio: 1.5,
                    preserve: true,
                  },
                },
              ],
            },
          ],
        },
      ],
    }
    const bytes = serializeDocx(document)
    const roundTrip = normaliseDocxBytes(bytes)
    expect(roundTrip.ok).toBe(true)
    if (!roundTrip.ok) return
    expect(roundTrip.value.assets[0]?.mimeType).toBe("image/svg+xml")
    expect(roundTrip.value.assets[0]?.rasterFallback).toBeDefined()
    expect(roundTrip.value.assets[0]?.packagePath).toContain(".svg")
  })
})
