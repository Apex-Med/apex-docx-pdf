import { describe, expect, test } from "bun:test"
import { strFromU8, unzipSync } from "fflate"

import { buildMinimalDocx } from "../src"

describe("minimal DOCX fixtures", () => {
  test("builds byte-identical OOXML with fragmented and escaped runs", () => {
    const options = {
      paragraphs: [{ runs: [" Hel", "lo & <DOCX>"] }, "Second paragraph"],
      pageSize: { width: 2_000, height: 3_000 },
      margins: { top: 100, right: 200, bottom: 300, left: 400 },
    } as const
    const first = buildMinimalDocx(options)
    const second = buildMinimalDocx(options)
    expect(first).toEqual(second)

    const parts = unzipSync(first)
    expect(Object.keys(parts).sort()).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "word/document.xml",
    ])
    const documentPart = parts["word/document.xml"]
    if (documentPart === undefined)
      throw new Error("fixture must contain word/document.xml")
    const document = strFromU8(documentPart)
    expect(document.match(/<w:p>/gu)).toHaveLength(2)
    expect(document.match(/<w:r>/gu)).toHaveLength(3)
    expect(document).toContain('xml:space="preserve"> Hel')
    expect(document).toContain("lo &amp; &lt;DOCX&gt;")
    expect(document).toContain('<w:pgSz w:w="2000" w:h="3000"/>')
    expect(document).toContain(
      '<w:pgMar w:top="100" w:right="200" w:bottom="300" w:left="400"/>'
    )
  })

  test("rejects invalid page geometry", () => {
    expect(() =>
      buildMinimalDocx({ pageSize: { width: -1, height: 1 } })
    ).toThrow("width")
    expect(() =>
      buildMinimalDocx({ pageSize: { width: 1, height: 0 } })
    ).toThrow("height")
  })
})
