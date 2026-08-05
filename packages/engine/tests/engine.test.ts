import { describe, expect, test } from "bun:test"
import { strToU8, zipSync } from "fflate"

import { EngineOperationError, createDocxPdfEngine } from "../src"

function sampleDocx(
  body = `<w:p><w:r><w:t xml:space="preserve">Prepared for </w:t></w:r><w:r><w:t>{{patient.</w:t></w:r><w:r><w:t>fullName:string}}</w:t></w:r></w:p>`
): Uint8Array {
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
            ${body}
          </w:body>
        </w:document>`),
    },
    { level: 6 }
  )
}

async function notoSansRegular(): Promise<Uint8Array> {
  const fontPath = await Bun.resolve(
    "notosans-fontface/fonts/NotoSans-Regular.ttf",
    import.meta.dir
  )
  return new Uint8Array(await Bun.file(fontPath).arrayBuffer())
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
    expect(first.resourceUsage).toBeUndefined()
    const pdfSource = new TextDecoder("latin1").decode(first.pdf)
    expect(pdfSource).toContain("(Prepared for ) Tj")
    expect(pdfSource).toContain("(Amara Mokoena) Tj")
    expect(pdfSource).not.toContain("{{patient.fullName:string}}")
    expect(first.layoutTrace?.pages).toHaveLength(1)
  })

  test("renders deterministic searchable Type0 text with a registered TrueType font", async () => {
    const engine = await createDocxPdfEngine({
      fonts: {
        faces: [
          {
            family: "Noto Sans",
            weight: 400,
            style: "normal",
            bytes: await notoSansRegular(),
          },
        ],
        aliases: [{ from: "Calibri", to: "Noto Sans" }],
        fallbackFamily: "Noto Sans",
      },
    })
    const compiled = await engine.compile(sampleDocx())
    const options = {
      locale: "en-ZA",
      timeZone: "Africa/Johannesburg",
    } as const
    const data = { patient: { fullName: "office café €" } }
    const first = await engine.render(compiled, data, options)
    const second = await engine.render(compiled, data, options)
    const pdfSource = new TextDecoder("latin1").decode(first.pdf)

    expect(first.pdf).toEqual(second.pdf)
    expect(first.documentHash).toBe(second.documentHash)
    expect(first.diagnostics.some(({ severity }) => severity === "error")).toBe(
      false
    )
    expect(pdfSource).toContain("/Subtype /Type0")
    expect(pdfSource).toContain("/Subtype /CIDFontType2")
    expect(pdfSource).toContain("/FontFile2")
    expect(pdfSource).toContain("/ToUnicode")
    expect(pdfSource).toContain("/NotoSans-Regular")
    expect(pdfSource).toContain("<006600660069>")
  })

  test("publishes a deeply immutable compiled template", async () => {
    const engine = await createDocxPdfEngine()
    const compiled = await engine.compile(sampleDocx())
    const options = {
      locale: "en-ZA",
      timeZone: "Africa/Johannesburg",
    } as const
    const beforeMutation = await engine.render(
      compiled,
      { patient: { fullName: "Amara" } },
      options
    )

    expect(Object.isFrozen(compiled)).toBe(true)
    expect(Object.isFrozen(compiled.source.sections)).toBe(true)
    expect(
      Object.isFrozen(compiled.source.sections[0]?.blocks[0]?.children)
    ).toBe(true)
    expect(Object.isFrozen(compiled.manifest.fields[0]?.formatters)).toBe(true)
    expect(Object.isFrozen(compiled.starterData.patient)).toBe(true)
    const section = compiled.source.sections[0]
    if (section === undefined) throw new Error("fixture must contain a section")
    const block = section.blocks[0]
    if (block === undefined)
      throw new Error("fixture section must contain a block")
    const child = block.children[0]
    if (child === undefined)
      throw new Error("fixture block must contain a child")
    expect(() => {
      ;(child as { text: string }).text = "mutated"
    }).toThrow()
    expect(compiled.source.sections[0]?.blocks[0]?.children[0]?.text).toBe(
      "Prepared for "
    )
    const afterMutation = await engine.render(
      compiled,
      { patient: { fullName: "Amara" } },
      options
    )
    expect(afterMutation.documentHash).toBe(beforeMutation.documentHash)
  })

  test("hashes rendered output rather than unused caller input", async () => {
    const engine = await createDocxPdfEngine()
    const compiled = await engine.compile(sampleDocx())
    const options = {
      locale: "en-ZA",
      timeZone: "Africa/Johannesburg",
    } as const

    const first = await engine.render(
      compiled,
      { patient: { fullName: "Amara" }, unused: "first" },
      options
    )
    const sameOutput = await engine.render(
      compiled,
      { patient: { fullName: "Amara" }, unused: "second" },
      options
    )
    const changedOutput = await engine.render(
      compiled,
      { patient: { fullName: "Thabo" }, unused: "first" },
      options
    )

    expect(first.pdf).toEqual(sameOutput.pdf)
    expect(first.documentHash).toBe(sameOutput.documentHash)
    expect(first.documentHash).not.toBe(changedOutput.documentHash)
  })

  test("rejects non-JSON and unbounded template data before resolution", async () => {
    const engine = await createDocxPdfEngine({
      limits: { maxObjectTraversalDepth: 2, maxJsonArrayItems: 2 },
    })
    const compiled = await engine.compile(sampleDocx())
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle
    class CustomData {
      value = "no"
    }
    const sparseArray: unknown[] = []
    sparseArray.length = 2
    sparseArray[1] = "sparse"
    const invalidValues: unknown[] = [
      { patient: undefined },
      { patient: new Date() },
      { patient: new Map() },
      { patient: new CustomData() },
      { patient: Number.NaN },
      { patient: Number.POSITIVE_INFINITY },
      { patient: 1n },
      { patient: () => "no" },
      { patient: Symbol("no") },
      { patient: sparseArray },
      { patient: [1, 2, 3] },
      { patient: { nested: { too: { deep: true } } } },
      cycle,
    ]

    for (const data of invalidValues) {
      const rejection = engine.render(
        compiled,
        data as Readonly<Record<string, unknown>>,
        { locale: "en-ZA", timeZone: "Africa/Johannesburg" }
      )
      await expect(rejection).rejects.toMatchObject({
        name: "EngineOperationError",
        code: "engine/template-data",
        diagnostics: [{ code: "ENGINE_TEMPLATE_DATA_INVALID" }],
      })
    }
  })

  test("does not invoke accessors and surfaces hostile proxies stably", async () => {
    const engine = await createDocxPdfEngine()
    const compiled = await engine.compile(sampleDocx())
    let getterCalls = 0
    const accessorData = {}
    Object.defineProperty(accessorData, "patient", {
      enumerable: true,
      get() {
        getterCalls += 1
        return { fullName: "unsafe" }
      },
    })
    const hostileProxy = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("proxy trap must not escape")
        },
      }
    )

    for (const data of [accessorData, hostileProxy]) {
      await expect(
        engine.render(compiled, data, {
          locale: "en-ZA",
          timeZone: "Africa/Johannesburg",
        })
      ).rejects.toMatchObject({
        name: "EngineOperationError",
        code: "engine/template-data",
        diagnostics: [{ code: "ENGINE_TEMPLATE_DATA_INVALID" }],
      })
    }
    expect(getterCalls).toBe(0)
  })

  test("refuses template errors and downgraded content-loss diagnostics", async () => {
    const engine = await createDocxPdfEngine()
    await expect(
      engine.compile(
        sampleDocx(
          `<w:p><w:r><w:t>{{value:string}} {{value:number}}</w:t></w:r></w:p>`
        )
      )
    ).rejects.toMatchObject({
      name: "EngineOperationError",
      code: "engine/template",
    })

    try {
      await engine.compile(
        sampleDocx(
          `<w:p><w:r><w:t>Supported text</w:t></w:r></w:p><w:tbl><w:tr/></w:tbl>`
        ),
        { unsupportedFeatures: "lenient" }
      )
      throw new Error("Expected compile to fail")
    } catch (error) {
      expect(error).toBeInstanceOf(EngineOperationError)
      expect((error as EngineOperationError).code).toBe(
        "engine/docx-content-loss"
      )
      expect(
        (error as EngineOperationError).diagnostics.map(({ code }) => code)
      ).toContain("DOCX_UNSUPPORTED_BLOCK")
    }
  })

  test("binds compiled templates to the engine instance that created them", async () => {
    const engine = await createDocxPdfEngine()
    const compiled = await engine.compile(sampleDocx())
    const reconstructed = { ...compiled }
    const otherEngine = await createDocxPdfEngine()

    await expect(
      engine.render(
        reconstructed,
        { patient: { fullName: "Amara" } },
        { locale: "en-ZA", timeZone: "Africa/Johannesburg" }
      )
    ).rejects.toMatchObject({
      name: "EngineOperationError",
      code: "engine/compiled-template",
    })
    await expect(
      otherEngine.render(
        compiled,
        { patient: { fullName: "Amara" } },
        { locale: "en-ZA", timeZone: "Africa/Johannesburg" }
      )
    ).rejects.toMatchObject({
      name: "EngineOperationError",
      code: "engine/compiled-template",
    })
  })

  test("fails strict rendering when required data is missing", async () => {
    const engine = await createDocxPdfEngine()
    const compiled = await engine.compile(sampleDocx())

    try {
      await engine.render(
        compiled,
        {},
        {
          locale: "en-ZA",
          timeZone: "Africa/Johannesburg",
        }
      )
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
