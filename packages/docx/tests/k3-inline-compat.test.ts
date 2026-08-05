import { describe, expect, test } from "bun:test"

import { inspectDocx, normaliseDocxBytes, parseDocx } from "../src"
import { buildOneParagraphDocx } from "./helpers/docx-fixture"

const section = `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>`

function documentWith(body: string): Uint8Array {
  return buildOneParagraphDocx({
    documentXml: `<w:document xmlns:w="urn:test" xmlns:v="urn:vml" xmlns:o="urn:office"><w:body>${body}${section}</w:body></w:document>`,
  })
}

function codes(result: { diagnostics: readonly { code: string }[] }): string[] {
  return result.diagnostics.map((entry) => entry.code)
}

describe("K3 bounded paragraph and inline compatibility", () => {
  test("accepts only explicit no-op paragraph borders and clear auto shading", () => {
    const safe = documentWith(`<w:p><w:pPr>
      <w:pBdr><w:top w:space="0" w:sz="0" w:val="nil"/><w:left w:val="none"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:between w:val="nil"/></w:pBdr>
      <w:shd w:val="clear" w:fill="auto" w:color="auto"/>
    </w:pPr><w:r><w:t>K3</w:t></w:r></w:p>`)
    expect(parseDocx(safe).ok).toBe(true)

    const visualBorder = documentWith(
      `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="8" w:color="000000"/></w:pBdr></w:pPr><w:r><w:t>K3</w:t></w:r></w:p>`
    )
    expect(codes(parseDocx(visualBorder))).toContain(
      "DOCX_UNSUPPORTED_STYLE_PROPERTY"
    )
    expect(codes(parseDocx(visualBorder))).toContain("DOCX_CONTENT_LOSS")

    const visualShading = documentWith(
      `<w:p><w:pPr><w:shd w:val="clear" w:fill="EFEFEF"/></w:pPr><w:r><w:t>K3</w:t></w:r></w:p>`
    )
    expect(codes(parseDocx(visualShading))).toContain(
      "DOCX_UNSUPPORTED_STYLE_PROPERTY"
    )
    expect(codes(parseDocx(visualShading))).toContain("DOCX_CONTENT_LOSS")
  })

  test("preserves 18-half-point run alignment while paragraph-mark rPr stays non-visual", () => {
    const bytes =
      documentWith(`<w:p><w:pPr><w:rPr><w:vertAlign w:val="subscript"/></w:rPr></w:pPr>
      <w:r><w:rPr><w:sz w:val="18"/><w:vertAlign w:val="superscript"/></w:rPr><w:t>2</w:t></w:r>
      <w:r><w:rPr><w:sz w:val="18"/><w:vertAlign w:val="baseline"/></w:rPr><w:t>O</w:t></w:r>
    </w:p>`)
    const parsed = parseDocx(bytes)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(
      parsed.value.document.paragraphs[0]?.runs[0]?.properties
    ).toMatchObject({
      fontSizeHalfPoints: 18,
      verticalAlignment: "superscript",
    })
    expect(
      parsed.value.document.paragraphs[0]?.runs[1]?.properties
    ).toMatchObject({ fontSizeHalfPoints: 18, verticalAlignment: "baseline" })

    const semantic = normaliseDocxBytes(bytes)
    expect(semantic.ok).toBe(true)
    if (!semantic.ok) return
    const paragraph = semantic.value.sections[0]?.blocks[0]
    expect(paragraph?.type).toBe("paragraph")
    if (paragraph?.type !== "paragraph") return
    expect(paragraph.children[0]?.type).toBe("text")
    expect(
      paragraph.children[0]?.type === "text" && paragraph.children[0].style
    ).toMatchObject({ fontSize: 180, verticalAlignment: "superscript" })
    expect(
      paragraph.children[1]?.type === "text" && paragraph.children[1].style
    ).toMatchObject({ fontSize: 180, verticalAlignment: "baseline" })
  })

  test("recognizes only the exact isolated K3 Word VML horizontal rule", () => {
    const pict = `<w:pict><v:rect style="width:0.0pt;height:1.5pt" o:hr="t" o:hrstd="t" o:hralign="center" fillcolor="#A0A0A0" stroked="f"/></w:pict>`
    const exact = documentWith(
      `<w:p><w:pPr><w:spacing w:before="200"/></w:pPr><w:r>${pict}</w:r><w:r><w:rPr/></w:r></w:p>`
    )
    const parsed = parseDocx(exact)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.document.blocks[0]).toMatchObject({
      type: "docx-horizontal-rule",
      heightTwips: 30,
      color: "A0A0A0",
      source: {
        part: "word/document.xml",
        xmlPath: "/w:document[1]/w:body[1]/w:p[1]/w:r[1]/w:pict[1]",
      },
    })
    const semantic = normaliseDocxBytes(exact)
    expect(semantic.ok).toBe(true)
    if (semantic.ok)
      expect(semantic.value.sections[0]?.blocks[0]).toMatchObject({
        type: "horizontalRule",
        height: 30,
        color: "#A0A0A0",
        properties: { spacingBefore: 200 },
      })

    for (const unsupported of [
      pict.replace("height:1.5pt", "height:2.0pt"),
      pict.replace('o:hralign="center"', 'o:hralign="left"'),
      `<w:pict><v:line/></w:pict>`,
    ]) {
      const result = parseDocx(
        documentWith(`<w:p><w:r>${unsupported}</w:r></w:p>`)
      )
      expect(codes(result)).toContain("DOCX_UNSUPPORTED_INLINE")
      expect(codes(result)).toContain("DOCX_CONTENT_LOSS")
    }

    const mixed = parseDocx(
      documentWith(`<w:p><w:r>${pict}<w:t>meaningful</w:t></w:r></w:p>`)
    )
    expect(codes(mixed)).toContain("DOCX_UNSUPPORTED_INLINE")
  })

  test("retains cancellation and XML resource limits for K3-shaped content", () => {
    const bytes = documentWith(
      `<w:p><w:pPr><w:shd w:val="clear" w:fill="auto"/></w:pPr><w:r><w:rPr><w:sz w:val="18"/><w:vertAlign w:val="subscript"/></w:rPr><w:t>2</w:t></w:r></w:p>`
    )
    const controller = new AbortController()
    controller.abort()
    expect(() => inspectDocx(bytes, { signal: controller.signal })).toThrow()
    expect(codes(inspectDocx(bytes, { limits: { maxXmlNodes: 2 } }))).toContain(
      "DOCX_XML_NODE_LIMIT"
    )
  })
})
