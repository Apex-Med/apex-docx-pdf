import { describe, expect, test } from "bun:test"
import { strToU8, zipSync } from "fflate"

import { EngineOperationError, createDocxPdfEngine } from "../src"

function docx(runContent: string): Uint8Array {
  return zipSync(
    {
      "[Content_Types].xml": strToU8(`
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`),
      "_rels/.rels": strToU8(`
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`),
      "word/document.xml": strToU8(`
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>before</w:t>${runContent}<w:t>after</w:t></w:r></w:p></w:body>
</w:document>`),
    },
    { level: 6, mtime: new Date("1980-01-01T00:00:00.000Z") }
  )
}

describe("engine unsupported-feature modes", () => {
  test("compile accepts only the fallbacks enabled by the selected mode", async () => {
    const engine = await createDocxPdfEngine()
    const paginationHint = docx("<w:lastRenderedPageBreak/>")
    const softHyphen = docx("<w:softHyphen/>")

    await expect(engine.compile(paginationHint)).rejects.toMatchObject({
      code: "engine/docx-content-loss",
    })

    const compatible = await engine.compile(paginationHint, {
      unsupportedFeatures: "compatible",
    })
    expect(compatible.diagnostics).toEqual([
      expect.objectContaining({
        code: "DOCX_UNSUPPORTED_FEATURE_FALLBACK",
        severity: "warning",
        details: expect.objectContaining({ mode: "compatible" }),
      }),
    ])

    await expect(
      engine.compile(softHyphen, { unsupportedFeatures: "compatible" })
    ).rejects.toBeInstanceOf(EngineOperationError)

    const lenient = await engine.compile(softHyphen, {
      unsupportedFeatures: "lenient",
    })
    expect(lenient.diagnostics).toEqual([
      expect.objectContaining({
        code: "DOCX_UNSUPPORTED_FEATURE_FALLBACK",
        severity: "warning",
        details: {
          mode: "lenient",
          feature: "softHyphen",
          fallback: "empty-inline",
        },
      }),
    ])
  })

  test("lenient cannot bypass invalid DOCX structure", async () => {
    const engine = await createDocxPdfEngine()
    const invalidTable = docx("</w:r></w:p><w:tbl><w:tr/></w:tbl><w:p><w:r>")
    await expect(
      engine.compile(invalidTable, { unsupportedFeatures: "lenient" })
    ).rejects.toMatchObject({
      name: "EngineOperationError",
      code: "engine/docx-content-loss",
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: "DOCX_INVALID_TABLE",
          severity: "error",
        }),
      ]),
    })
  })
})
