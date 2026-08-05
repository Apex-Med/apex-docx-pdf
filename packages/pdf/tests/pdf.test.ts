import { describe, expect, test } from "bun:test"
import { twips, type PageDisplayList } from "@apex-docx-pdf/core"

import { serializePdf } from "../src"

const displayList: PageDisplayList = {
  pages: [{
    pageNumber: 1, width: twips(11_906), height: twips(16_838),
    contentBounds: { x: twips(1_440), y: twips(1_440), width: twips(9_026), height: twips(13_958) },
    items: [{ type: "glyph-run", sourceNodeId: "text" as never, text: "Hello (PDF)\\", fontFamily: "Helvetica", fontSize: twips(240), color: "#000000", x: twips(1_440), baselineY: twips(1_680), width: twips(1_000) }],
  }],
}

describe("Phase 1 PDF serializer", () => {
  test("emits a searchable, structured PDF with escaped literal text", () => {
    const result = serializePdf(displayList, { metadata: { title: "Deterministic" } })
    const text = new TextDecoder("latin1").decode(result.bytes)
    expect(text).toStartWith("%PDF-1.7")
    expect(text).toContain("/Type /Catalog")
    expect(text).toContain("/BaseFont /Helvetica")
    expect(text).toContain("(Hello \\(PDF\\)\\\\) Tj")
    expect(text).toContain("xref\n0 7")
    expect(result.diagnostics).toEqual([])
  })

  test("is byte-identical on repeat", () => {
    expect(serializePdf(displayList).bytes).toEqual(serializePdf(displayList).bytes)
  })

  test("serializes each display-list page", () => {
    const multipage: PageDisplayList = { ...displayList, pages: [...displayList.pages, { ...displayList.pages[0]!, pageNumber: 2 }] }
    const text = new TextDecoder("latin1").decode(serializePdf(multipage).bytes)
    expect(text).toContain("/Count 2")
    expect((text.match(/\/Type \/Page /gu) ?? [])).toHaveLength(2)
  })

  test("diagnoses text outside WinAnsi rather than encoding it incorrectly", () => {
    const glyph = displayList.pages[0]?.items[0]
    if (!glyph || glyph.type !== "glyph-run") throw new Error("fixture must begin with a glyph run")
    const unsupported: PageDisplayList = { ...displayList, pages: [{ ...displayList.pages[0]!, items: [{ ...glyph, text: "漢" }] }] }
    const result = serializePdf(unsupported)
    expect(result.diagnostics[0]?.code).toBe("pdf/text-encoding")
  })

  test("honours an already-aborted signal", () => {
    const controller = new AbortController()
    controller.abort()
    expect(() => serializePdf(displayList, { signal: controller.signal })).toThrow()
  })
})
