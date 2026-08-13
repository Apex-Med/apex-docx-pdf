import { describe, expect, test } from "bun:test"

import { normaliseDocxBytes, parseDocx } from "../src"
import { buildOneParagraphDocx } from "./helpers/docx-fixture"

describe("bounded Word text profile", () => {
  test("normalises explicit tabs, manual breaks, highlight, and script alignment", () => {
    const result = normaliseDocxBytes(
      buildOneParagraphDocx({
        documentXml: `<w:document xmlns:w="urn:test"><w:body><w:p>
          <w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/><w:tab w:val="start" w:pos="1440" w:leader="none"/></w:tabs></w:pPr>
          <w:r><w:rPr><w:highlight w:val="yellow"/><w:vertAlign w:val="superscript"/></w:rPr><w:t>A</w:t><w:tab/><w:br/><w:t>B</w:t><w:br w:type="page"/><w:t>C</w:t></w:r>
        </w:p></w:body></w:document>`,
      })
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const paragraph = result.value.sections[0]?.blocks[0]
    if (paragraph?.type !== "paragraph") throw new Error("Expected paragraph")
    expect(
      paragraph.properties.tabStops?.map((stop) => Number(stop.position))
    ).toEqual([720, 1440])
    expect(paragraph.children.map((child) => child.type)).toEqual([
      "text",
      "tab",
      "break",
      "text",
      "break",
      "text",
    ])
    expect(paragraph.children[2]).toMatchObject({ type: "break", kind: "line" })
    expect(paragraph.children[4]).toMatchObject({ type: "break", kind: "page" })
    const text = paragraph.children[0]
    expect(text?.type === "text" ? text.style : undefined).toMatchObject({
      highlightColor: "#FFFF00",
      verticalAlignment: "superscript",
    })
  })

  test("rejects unsupported tab and break variants at their source elements", () => {
    for (const body of [
      `<w:p><w:pPr><w:tabs><w:tab w:val="center" w:pos="720"/></w:tabs></w:pPr><w:r><w:tab/></w:r></w:p>`,
      `<w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="720" w:leader="dot"/></w:tabs></w:pPr><w:r><w:tab/></w:r></w:p>`,
      `<w:p><w:r><w:br w:clear="all"/></w:r></w:p>`,
      `<w:p><w:r><w:tab/></w:r></w:p>`,
      `<w:tbl><w:tblPr><w:tblW w:type="dxa" w:w="1000"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="1000"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:type="dxa" w:w="1000"/></w:tcPr><w:p><w:r><w:br w:type="page"/></w:r></w:p></w:tc></w:tr></w:tbl>`,
    ]) {
      const result = parseDocx(
        buildOneParagraphDocx({
          documentXml: `<w:document xmlns:w="urn:test"><w:body>${body}</w:body></w:document>`,
        })
      )
      expect(result.ok).toBe(false)
      expect(
        result.diagnostics.some((entry) => entry.code === "DOCX_CONTENT_LOSS")
      ).toBe(true)
      expect(
        result.diagnostics.some(
          (entry) =>
            (entry.source?.part === "word/document.xml" &&
              entry.source.xmlPath.includes("/w:tab[")) ||
            entry.source?.xmlPath.includes("/w:br[")
        )
      ).toBe(true)
    }
  })

  test("accepts column breaks in body paragraphs", () => {
    const result = normaliseDocxBytes(
      buildOneParagraphDocx({
        documentXml: `<w:document xmlns:w="urn:test"><w:body><w:p><w:r><w:br w:type="column"/><w:t>After</w:t></w:r></w:p></w:body></w:document>`,
      })
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const paragraph = result.value.sections[0]?.blocks[0]
    expect(paragraph?.type).toBe("paragraph")
    if (paragraph?.type !== "paragraph") return
    expect(paragraph.children.some((c) => c.type === "break" && c.kind === "column")).toBe(
      true
    )
  })

  test("rejects unknown highlight and vertical alignment values", () => {
    const result = parseDocx(
      buildOneParagraphDocx({
        documentXml: `<w:document xmlns:w="urn:test"><w:body><w:p><w:r><w:rPr><w:highlight w:val="default"/><w:vertAlign w:val="raised"/></w:rPr><w:t>x</w:t></w:r></w:p></w:body></w:document>`,
      })
    )
    expect(result.ok).toBe(false)
    expect(
      result.diagnostics.filter(
        (entry) => entry.code === "DOCX_INVALID_STYLE_VALUE"
      )
    ).toHaveLength(2)
  })
})
