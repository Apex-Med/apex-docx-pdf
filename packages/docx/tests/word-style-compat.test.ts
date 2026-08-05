import { describe, expect, test } from "bun:test"

import { normaliseDocxBytes, parseDocx } from "../src"
import { buildOneParagraphDocx } from "./helpers/docx-fixture"

const STYLES_RELATIONSHIP =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"

function withStyles(stylesXml: string): Readonly<Record<string, string>> {
  return {
    "word/_rels/document.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="styles" Type="${STYLES_RELATIONSHIP}" Target="styles.xml"/></Relationships>`,
    "word/styles.xml": stylesXml,
  }
}

function codes(result: {
  readonly diagnostics: readonly { readonly code: string }[]
}): readonly string[] {
  return result.diagnostics.map((entry) => entry.code)
}

describe("Word-authored LTR style compatibility", () => {
  test("maps equivalent complex-script companions and ignores language metadata", () => {
    const result = parseDocx(
      buildOneParagraphDocx({
        documentXml: `<w:document xmlns:w="urn:test"><w:body><w:p><w:pPr><w:rPr><w:rFonts w:ascii="Inter" w:hAnsi="Inter" w:cs="Inter" w:eastAsia="Inter"/><w:b/><w:bCs/><w:i w:val="0"/><w:iCs w:val="false"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:rtl w:val="0"/><w:lang w:val="en-ZA" w:eastAsia="en-ZA" w:bidi="ar-SA"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Inter" w:hAnsi="Inter" w:cs="Inter" w:eastAsia="Inter"/><w:b/><w:bCs/><w:i w:val="0"/><w:iCs w:val="off"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:rtl w:val="false"/><w:lang w:val="en-ZA"/></w:rPr><w:t>LTR text</w:t></w:r></w:p></w:body></w:document>`,
      })
    )

    expect(result.ok).toBe(true)
    expect(result.diagnostics).toEqual([])
    if (!result.ok) return
    expect(
      result.value.document.paragraphs[0]?.runs[0]?.properties
    ).toMatchObject({
      fontFamily: "Inter",
      fontSizeHalfPoints: 20,
      fontWeight: 700,
      fontStyle: "normal",
    })
  })

  test("accepts equivalent properties in styles and preserves inherited Latin styling", () => {
    const result = parseDocx(
      buildOneParagraphDocx({
        documentXml: `<w:document xmlns:w="urn:test"><w:body><w:p><w:pPr><w:pStyle w:val="Body"/></w:pPr><w:r><w:t>Styled</w:t></w:r></w:p></w:body></w:document>`,
        extraParts: withStyles(
          `<w:styles xmlns:w="urn:test"><w:style w:type="paragraph" w:styleId="Body"><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:eastAsia="Arial"/><w:b w:val="1"/><w:bCs w:val="1"/><w:i w:val="0"/><w:iCs w:val="0"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:rtl w:val="0"/><w:lang w:val="en"/></w:rPr></w:style></w:styles>`
        ),
      })
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(
      result.value.document.paragraphs[0]?.runs[0]?.properties
    ).toMatchObject({
      fontFamily: "Arial",
      fontSizeHalfPoints: 22,
      fontWeight: 700,
      fontStyle: "normal",
    })
  })

  test("keeps true RTL and non-equivalent script styling unsupported", () => {
    const result = parseDocx(
      buildOneParagraphDocx({
        documentXml: `<w:document xmlns:w="urn:test"><w:body><w:p><w:r><w:rPr><w:rFonts w:ascii="Inter" w:hAnsi="Arial" w:cs="Tahoma" w:eastAsia="Yu Gothic"/><w:b w:val="1"/><w:bCs w:val="0"/><w:i w:val="0"/><w:iCs w:val="1"/><w:sz w:val="20"/><w:szCs w:val="22"/><w:rtl/></w:rPr><w:t>unsafe</w:t></w:r></w:p></w:body></w:document>`,
      })
    )

    expect(result.ok).toBe(false)
    expect(
      codes(result).filter((code) => code === "DOCX_UNSUPPORTED_STYLE_PROPERTY")
    ).toHaveLength(7)
    expect(codes(result)).toContain("DOCX_CONTENT_LOSS")
    expect(
      result.diagnostics.some((entry) =>
        entry.message.includes("Right-to-left run formatting")
      )
    ).toBe(true)
  })

  test("rounds Word decimal line values and accepts a recognized rule without a value", () => {
    const result = normaliseDocxBytes(
      buildOneParagraphDocx({
        documentXml: `<w:document xmlns:w="urn:test"><w:body>
          <w:p><w:pPr><w:spacing w:line="239.6" w:lineRule="auto"/></w:pPr><w:r><w:t>a</w:t></w:r></w:p>
          <w:p><w:pPr><w:spacing w:line="200.4" w:lineRule="exact"/></w:pPr><w:r><w:t>b</w:t></w:r></w:p>
          <w:p><w:pPr><w:spacing w:line="200.5" w:lineRule="atLeast"/></w:pPr><w:r><w:t>c</w:t></w:r></w:p>
          <w:p><w:pPr><w:spacing w:before="120" w:lineRule="auto"/></w:pPr><w:r><w:t>d</w:t></w:r></w:p>
        </w:body></w:document>`,
      })
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const paragraphs = result.value.sections[0]?.blocks.filter(
      (block) => block.type === "paragraph"
    )
    expect(paragraphs?.[0]?.properties.lineSpacing).toEqual({
      rule: "auto",
      value240ths: 240,
    })
    const exactSpacing = paragraphs?.[1]?.properties.lineSpacing
    expect(exactSpacing?.rule).toBe("exact")
    expect(
      exactSpacing?.rule === "exact" ? Number(exactSpacing.value) : undefined
    ).toBe(200)
    const atLeastSpacing = paragraphs?.[2]?.properties.lineSpacing
    expect(atLeastSpacing?.rule).toBe("atLeast")
    expect(
      atLeastSpacing?.rule === "atLeast"
        ? Number(atLeastSpacing.value)
        : undefined
    ).toBe(201)
    expect(paragraphs?.[3]?.properties).toMatchObject({
      spacingBefore: 120,
      lineSpacing: null,
    })
  })

  test("rejects malformed decimal line values and unsupported valueless rules", () => {
    for (const spacing of [
      '<w:spacing w:line="1.2.3" w:lineRule="auto"/>',
      '<w:spacing w:line="-0.5" w:lineRule="exact"/>',
      '<w:spacing w:lineRule="exact"/>',
      '<w:spacing w:lineRule="multiple"/>',
    ]) {
      const result = parseDocx(
        buildOneParagraphDocx({
          documentXml: `<w:document xmlns:w="urn:test"><w:body><w:p><w:pPr>${spacing}</w:pPr><w:r><w:t>x</w:t></w:r></w:p></w:body></w:document>`,
        })
      )
      expect(result.ok).toBe(false)
      expect(codes(result)).toContain("DOCX_INVALID_STYLE_VALUE")
      expect(codes(result)).toContain("DOCX_CONTENT_LOSS")
    }
  })
})
