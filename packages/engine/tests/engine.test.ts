import { describe, expect, test } from "bun:test"
import { strToU8, zipSync } from "fflate"

import { EngineOperationError, createDocxPdfEngine } from "../src"

function sampleDocx(): Uint8Array {
  return zipSync(
    {
      "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?>
        <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
          <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
          <Default Extension="xml" ContentType="application/xml"/>
          <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
        </Types>`),
      "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
        </Relationships>`),
      "word/document.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?>
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:body>
            <w:p><w:r><w:t xml:space="preserve">Prepared for </w:t></w:r><w:r><w:t>{{patient.</w:t></w:r><w:r><w:t>fullName:string}}</w:t></w:r></w:p>
          </w:body>
        </w:document>`),
    },
    { level: 6 }
  )
}

describe("engine vertical slice", () => {
  test("compiles DOCX bytes and produces repeat-identical searchable PDFs", async () => {
    const engine = await createDocxPdfEngine()
    const compiled = await engine.compile(sampleDocx())

    expect(compiled.manifest.fields.map((field) => field.path)).toEqual([
      "patient.fullName",
    ])
    expect(compiled.starterData).toEqual({ patient: { fullName: "" } })

    const options = {
      locale: "en-ZA",
      timeZone: "Africa/Johannesburg",
      metadata: { title: "Deterministic example" },
      includeLayoutTrace: true,
    } as const
    const first = await engine.render(
      compiled,
      { patient: { fullName: "Amara Mokoena" } },
      options
    )
    const second = await engine.render(
      compiled,
      { patient: { fullName: "Amara Mokoena" } },
      options
    )

    expect(first.pageCount).toBe(1)
    expect(first.pdf).toEqual(second.pdf)
    expect(first.documentHash).toBe(second.documentHash)
    const pdfSource = new TextDecoder("latin1").decode(first.pdf)
    expect(pdfSource).toContain("(Prepared for ) Tj")
    expect(pdfSource).toContain("(Amara Mokoena) Tj")
    expect(pdfSource).not.toContain("{{patient.fullName:string}}")
    expect(first.layoutTrace?.pages).toHaveLength(1)
  })

  test("fails strict rendering when required data is missing", async () => {
    const engine = await createDocxPdfEngine()
    const compiled = await engine.compile(sampleDocx())

    try {
      await engine.render(compiled, {}, {
        locale: "en-ZA",
        timeZone: "Africa/Johannesburg",
      })
      throw new Error("Expected render to fail")
    } catch (error) {
      expect(error).toBeInstanceOf(EngineOperationError)
      expect((error as EngineOperationError).code).toBe("engine/template-data")
      expect((error as EngineOperationError).diagnostics[0]?.code).toBe(
        "TEMPLATE_VALUE_MISSING"
      )
    }
  })
})
