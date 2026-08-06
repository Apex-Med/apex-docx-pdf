import { describe, expect, test } from "bun:test"
import { validatePdfStructure } from "@apexmed/testkit"
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate"
import { loadOfflineFontConfiguration } from "../../../scripts/offline-font-configuration"

import {
  ENGINE_VERSION,
  EngineOperationError,
  createDocxPdfEngine,
} from "../src"
import {
  buildPhase5FormattingTableDocx,
  buildPhase5TemplateTableDocx,
} from "./fixtures/phase5-table-docx"
import {
  buildPhase6DocumentDocx,
  generatedPng,
} from "./fixtures/phase6-document-docx"

function sampleDocx(
  body = `<w:p><w:r><w:t xml:space="preserve">Prepared for </w:t></w:r><w:r><w:t>{{patient.</w:t></w:r><w:r><w:t>fullName:string}}</w:t></w:r></w:p>`,
  extraParts: Readonly<Record<string, string>> = {}
): Uint8Array {
  const parts: Record<string, Uint8Array> = {
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
  }
  for (const [name, value] of Object.entries(extraParts)) {
    parts[name] = strToU8(value)
  }
  return zipSync(parts, { level: 6 })
}

async function notoSansRegular(): Promise<Uint8Array> {
  const fontPath = await Bun.resolve(
    "notosans-fontface/fonts/NotoSans-Regular.ttf",
    import.meta.dir
  )
  return new Uint8Array(await Bun.file(fontPath).arrayBuffer())
}

describe("engine vertical slice", () => {
  test("inspects template-specific fonts and bounded semantic feature sources deterministically", async () => {
    const runs = Array.from(
      { length: 25 },
      (_, index) =>
        `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:i/></w:rPr><w:t>Run ${index}</w:t></w:r>`
    ).join("")
    const bytes = sampleDocx(
      `<w:p>${runs}<w:r><w:lastRenderedPageBreak/></w:r></w:p>`
    )
    const engine = await createDocxPdfEngine()

    const first = await engine.inspect(bytes)
    const second = await engine.inspect(bytes)

    expect(first).toEqual(second)
    expect(first.documentModelAvailable).toBe(true)
    expect(first.sourceLimitPerEntry).toBe(20)
    expect(first.requiredFonts).toEqual([
      expect.objectContaining({
        family: "Arial",
        weight: 700,
        style: "italic",
        instanceCount: 25,
        sourcesTruncated: true,
      }),
    ])
    expect(first.requiredFonts[0]?.sources).toHaveLength(20)
    expect(first.features).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "paragraph",
          support: "implemented",
          instanceCount: 1,
        }),
        expect.objectContaining({
          kind: "unsupported:lastRenderedPageBreak",
          support: "unsupported",
          instanceCount: 1,
        }),
      ])
    )
    expect(first.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "DOCX_UNSUPPORTED_FEATURE_FALLBACK",
          severity: "warning",
        }),
      ])
    )
  })

  test("renders bounded dynamic PNG values deterministically without URL resolution", async () => {
    const engine = await createDocxPdfEngine()
    const compiled = await engine.compile(
      sampleDocx(`<w:p><w:r><w:t>Logo {{@image companyLogo}}</w:t></w:r></w:p>`)
    )
    expect(compiled.manifest.fields).toEqual([
      expect.objectContaining({ path: "companyLogo", kind: "image" }),
    ])
    const companyLogo = {
      mimeType: "image/png",
      bytes: generatedPng(),
      pixelWidth: 2,
      pixelHeight: 1,
      width: 1440,
      height: 1440,
      preserveAspectRatio: true,
      altText: "Apex company logo",
    } as const
    const options = {
      locale: "en-ZA",
      timeZone: "Africa/Johannesburg",
    } as const
    const first = await engine.render(compiled, { companyLogo }, options)
    const second = await engine.render(compiled, { companyLogo }, options)
    expect(first.pdf).toEqual(second.pdf)
    expect(first.documentHash).toBe(second.documentHash)
    expect(validatePdfStructure(first.pdf).valid).toBe(true)
    const source = new TextDecoder("latin1").decode(first.pdf)
    expect(source.match(/\/Subtype \/Image\b/gu)).toHaveLength(1)

    try {
      await engine.render(
        compiled,
        {
          companyLogo: {
            ...companyLogo,
            bytes: Uint8Array.of(1, 2, 3),
          },
        },
        options
      )
      throw new Error("expected invalid PNG bytes to fail")
    } catch (error) {
      expect(error).toBeInstanceOf(EngineOperationError)
      expect((error as EngineOperationError).code).toBe("engine/image")
      expect(
        (error as EngineOperationError).diagnostics.map(({ code }) => code)
      ).toContain("images/png-signature")
    }

    try {
      await engine.render(
        compiled,
        { companyLogo: "https://example.invalid/logo.png" },
        options
      )
      throw new Error("expected URL image input to fail")
    } catch (error) {
      expect(error).toBeInstanceOf(EngineOperationError)
      expect((error as EngineOperationError).code).toBe("engine/template-data")
      expect(
        (error as EngineOperationError).diagnostics.map(({ code }) => code)
      ).toContain("TEMPLATE_IMAGE_VALUE_TYPE")
    }
  })

  test("renders the deterministic Phase 6 DOCX image, section, header, footer, field, table, and numbering story", async () => {
    const engine = await createDocxPdfEngine()
    const compiled = await engine.compile(buildPhase6DocumentDocx())
    const options = {
      locale: "en-ZA",
      timeZone: "Africa/Johannesburg",
      includeLayoutTrace: true,
    } as const
    const data = { patient: { name: "Amara Mokoena" } }
    const first = await engine.render(compiled, data, options)
    const second = await engine.render(compiled, data, options)
    const preview = await engine.preview(compiled)
    const repeatedPreview = await engine.preview(compiled)
    const validation = validatePdfStructure(first.pdf)
    const pdfSource = new TextDecoder("latin1").decode(first.pdf)

    expect(ENGINE_VERSION).toBe("0.0.0-phase.8")
    expect(compiled.version).toBe(ENGINE_VERSION)
    expect(compiled.source.assets).toHaveLength(2)
    expect(
      compiled.source.sections.map(({ properties }) => properties.orientation)
    ).toEqual(["portrait", "landscape", "portrait"])
    expect(
      compiled.source.sections.map(({ defaultHeaderId, defaultFooterId }) => [
        defaultHeaderId,
        defaultFooterId,
      ])
    ).toEqual([
      ["docx:header:word/header1.xml", "docx:footer:word/footer1.xml"],
      ["docx:header:word/header1.xml", "docx:footer:word/footer1.xml"],
      ["docx:header:word/header1.xml", "docx:footer:word/footer1.xml"],
    ])
    expect(first.pdf).toEqual(second.pdf)
    expect(first.documentHash).toBe(second.documentHash)
    expect(first.templateHash).toBe(compiled.templateHash)
    expect(first.resourceUsage).toEqual({
      templateBytes: 3237,
      archiveEntries: 10,
      decompressedBytes: 5448,
      expandedNodes: 37,
      expandedTextBytes: 222,
      pages: 3,
    })
    expect(first.resourceUsage).toEqual(second.resourceUsage)
    expect(first.pageCount).toBe(3)
    expect(preview).toEqual(repeatedPreview)
    expect(preview.displayList.pages).toHaveLength(3)
    expect(preview.layoutTrace.pages).toHaveLength(3)
    expect(preview.layoutTrace.events.some(({ kind }) => kind === "line")).toBe(
      true
    )
    expect(
      preview.displayList.pages
        .flatMap(({ items }) => items)
        .filter((item) => item.type === "glyph-run")
        .map(({ text }) => text)
        .join("")
    ).toContain("{{patient.name:string}}")
    expect(Object.values(preview.placeholderNodes)).toContain("patient.name")
    expect(
      preview.displayList.pages
        .flatMap(({ items }) => items)
        .some(
          (item) =>
            item.type === "glyph-run" &&
            preview.placeholderNodes[item.sourceNodeId] === "patient.name"
        )
    ).toBe(true)
    expect(validation.valid).toBe(true)
    expect(validation.errors).toEqual([])
    expect(validation.pageCount).toBe(3)
    expect(validation.pageTexts).toHaveLength(3)
    expect(
      validation.pageTexts.every(
        (text) =>
          text.includes("Header Amara Mokoena") &&
          text.includes("Footer Amara Mokoena")
      )
    ).toBe(true)
    expect(validation.pageTexts[0]).toContain("Page 1 of 3")
    expect(validation.pageTexts[1]).toContain("Page 2 of 3")
    expect(validation.pageTexts[2]).toContain("Page 3 of 3")
    expect(validation.text).toContain("Before PNG  between JPEG  after images")
    expect(validation.text).toContain("Table leftTable right")
    expect(validation.text).toContain("1.First numbered body item")
    expect(validation.text).toContain("2.Second numbered body item")
    expect(validation.text).not.toContain("{{")
    expect(pdfSource.match(/\/Subtype \/Image\b/gu)).toHaveLength(2)
    expect(pdfSource.match(/\/XObject\b/gu)?.length).toBeGreaterThanOrEqual(3)
    const mediaBoxes = [...pdfSource.matchAll(/\/MediaBox \[([^\]]+)\]/gu)].map(
      (match) => match[1]
    )
    expect(mediaBoxes).toEqual([
      "0 0 595.35 841.95",
      "0 0 841.95 595.35",
      "0 0 595.35 841.95",
    ])
    const imageMatrices = [
      ...pdfSource.matchAll(
        /q\n([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm\n\/Im\d+ Do/gu
      ),
    ]
    expect(imageMatrices.length).toBeGreaterThanOrEqual(4)
    expect(
      imageMatrices.every((match) =>
        match.slice(1).every((value) => Number(value) >= 0)
      )
    ).toBe(true)

    expect(Object.isFrozen(compiled)).toBe(true)
    expect(Object.isFrozen(compiled.source.assets)).toBe(true)
    expect(Object.isFrozen(compiled.source.assets[0]?.bytes)).toBe(true)
    expect(Object.hasOwn(compiled, "images")).toBe(false)
    const firstByte = compiled.source.assets[0]?.bytes[0]
    expect(() => {
      ;(compiled.source.assets[0]?.bytes as number[])[0] = 0
    }).toThrow()
    expect(compiled.source.assets[0]?.bytes[0]).toBe(firstByte)
  })

  test("fails Phase 6 image and section inputs safely and keeps limits and cancellation effective", async () => {
    const valid = buildPhase6DocumentDocx()
    const damagedParts = unzipSync(valid)
    const damagedPng = Uint8Array.from(generatedPng())
    damagedPng[damagedPng.length - 5] =
      (damagedPng[damagedPng.length - 5] ?? 0) ^ 1
    damagedParts["word/media/generated.png"] = damagedPng
    const damagedDocx = zipSync(damagedParts, {
      level: 6,
      mtime: new Date("1980-01-01T00:00:00.000Z"),
    })
    const engine = await createDocxPdfEngine()
    try {
      await engine.compile(damagedDocx)
      throw new Error("Expected the damaged PNG to fail compilation")
    } catch (error) {
      expect(error).toBeInstanceOf(EngineOperationError)
      expect((error as EngineOperationError).code).toBe(
        "engine/docx-content-loss"
      )
      expect(
        (error as EngineOperationError).diagnostics.map(({ code }) => code)
      ).toContain("DOCX_UNSUPPORTED_IMAGE_PROFILE")
    }

    const malformedParts = unzipSync(valid)
    const documentPart = malformedParts["word/document.xml"]
    if (!documentPart) throw new Error("fixture must contain document.xml")
    malformedParts["word/document.xml"] = strToU8(
      strFromU8(documentPart).replace(
        'w:w="16839" w:h="11907" w:orient="landscape"',
        'w:w="11907" w:h="16839" w:orient="landscape"'
      )
    )
    const malformedSection = zipSync(malformedParts, {
      level: 6,
      mtime: new Date("1980-01-01T00:00:00.000Z"),
    })
    await expect(engine.compile(malformedSection)).rejects.toBeInstanceOf(
      EngineOperationError
    )

    const limitedEngine = await createDocxPdfEngine({ limits: { maxPages: 2 } })
    const limited = await limitedEngine.compile(valid)
    await expect(
      limitedEngine.render(
        limited,
        { patient: { name: "Amara" } },
        { locale: "en-ZA", timeZone: "Africa/Johannesburg" }
      )
    ).rejects.toThrow("Layout exceeded the configured maximum of 2 pages")

    const decodedImageLimitedEngine = await createDocxPdfEngine({
      limits: { maxDecodedImageBytes: 1 },
    })
    try {
      await decodedImageLimitedEngine.compile(valid)
      throw new Error("Expected decoded image limits to fail compilation")
    } catch (error) {
      expect(error).toBeInstanceOf(EngineOperationError)
      expect((error as EngineOperationError).code).toBe("engine/image")
      expect(
        (error as EngineOperationError).diagnostics.map(({ code }) => code)
      ).toContain("images/limit")
    }

    const controller = new AbortController()
    controller.abort()
    await expect(
      engine.compile(valid, { signal: controller.signal })
    ).rejects.toThrow()
  })

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
    expect(first.resourceUsage).toEqual({
      templateBytes: 956,
      archiveEntries: 3,
      decompressedBytes: 1114,
      expandedNodes: 3,
      expandedTextBytes: 26,
      pages: 1,
    })
    expect(first.resourceUsage).toEqual(second.resourceUsage)
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
    expect(pdfSource).toMatch(/\/BaseFont \/[A-Z]{6}\+NotoSans-Regular/u)
    expect(pdfSource).toContain("<006600660069>")
  })

  test("embeds distinct static Medium and SemiBold programs selected by DOCX family aliases", async () => {
    const engine = await createDocxPdfEngine({
      fonts: await loadOfflineFontConfiguration(),
    })
    const compiled = await engine.compile(
      sampleDocx(`<w:p>
        <w:r><w:rPr><w:rFonts w:ascii="Inter Medium" w:hAnsi="Inter Medium"/></w:rPr><w:t>Medium face</w:t></w:r>
        <w:r><w:rPr><w:rFonts w:ascii="Inter SemiBold" w:hAnsi="Inter SemiBold"/></w:rPr><w:t>Semibold face</w:t></w:r>
        <w:r><w:rPr><w:rFonts w:ascii="Bricolage Grotesque SemiBold" w:hAnsi="Bricolage Grotesque SemiBold"/></w:rPr><w:t>Bricolage face</w:t></w:r>
      </w:p>`)
    )

    const preview = await engine.preview(compiled)
    const runs = preview.displayList.pages.flatMap(({ items }) =>
      items.filter(
        (item) => item.type === "glyph-run" && item.fontSource === "embedded"
      )
    )
    expect(runs.map(({ fontWeight }) => fontWeight)).toEqual([500, 600, 600])
    expect(new Set(runs.map((run) => run.faceId)).size).toBe(3)

    const rendered = await engine.render(
      compiled,
      {},
      { locale: "en-ZA", timeZone: "Africa/Johannesburg" }
    )
    const pdfSource = new TextDecoder("latin1").decode(rendered.pdf)
    expect(validatePdfStructure(rendered.pdf).valid).toBe(true)
    expect(pdfSource).toMatch(/\/[A-Z]{6}\+Inter-Medium/u)
    expect(pdfSource).toMatch(/\/[A-Z]{6}\+Inter-SemiBold/u)
    expect(pdfSource).toMatch(/\/[A-Z]{6}\+BricolageGrotesque-SemiBold/u)
    expect(pdfSource.match(/\/Subtype \/Type0/gu)).toHaveLength(3)
  })

  test("renders conditional repeated paragraphs and explicit-context formatters end to end", async () => {
    const engine = await createDocxPdfEngine()
    const compiled = await engine.compile(
      sampleDocx(`
        <w:p><w:r><w:t>{{#if invoice.show}}</w:t></w:r></w:p>
        <w:p><w:r><w:t xml:space="preserve">{{invoice.title | upper}} — </w:t></w:r></w:p>
        <w:p><w:r><w:t>{{#each invoice.items}}</w:t></w:r></w:p>
        <w:p><w:r><w:t xml:space="preserve">Line {{name}}: {{amount:number | currency:"ZAR"}}</w:t></w:r></w:p>
        <w:p><w:r><w:t>{{/each}}</w:t></w:r></w:p>
        <w:p><w:r><w:t>{{else}}</w:t></w:r></w:p>
        <w:p><w:r><w:t>Hidden</w:t></w:r></w:p>
        <w:p><w:r><w:t>{{/if}}</w:t></w:r></w:p>
      `)
    )
    expect(compiled.manifest.fields.map(({ path }) => path)).toEqual([
      "invoice.items",
      "invoice.items[].amount",
      "invoice.items[].name",
      "invoice.show",
      "invoice.title",
    ])
    const input = {
      invoice: {
        show: true,
        title: "statement",
        items: [
          { name: "Consultation", amount: 1250 },
          { name: "Medicine", amount: 230.5 },
        ],
      },
    }
    const options = {
      locale: "en-ZA",
      timeZone: "Africa/Johannesburg",
    } as const
    const first = await engine.render(compiled, input, options)
    const second = await engine.render(compiled, input, options)
    const validation = validatePdfStructure(first.pdf)

    expect(first.pdf).toEqual(second.pdf)
    expect(validation.valid).toBe(true)
    expect(validation.text).toContain("STATEMENT")
    expect(validation.text).toContain("Line Consultation:")
    expect(validation.text).toContain("Line Medicine:")
    expect(validation.text).not.toContain("Hidden")
    expect(validation.text).not.toContain("{{")
  })

  test("renders default and time-inclusive date patterns into searchable PDF text", async () => {
    const engine = await createDocxPdfEngine()
    const compiled = await engine.compile(
      sampleDocx(`
        <w:p><w:r><w:t xml:space="preserve">Default {{when:date | date}} Timed {{when:date | date:"dd-MM-yyyy HH:mm"}}</w:t></w:r></w:p>
      `)
    )
    const input = { when: "2024-01-02T23:30:00.000Z" }
    const options = {
      locale: "en-ZA",
      timeZone: "Africa/Johannesburg",
    } as const

    const first = await engine.render(compiled, input, options)
    const second = await engine.render(compiled, input, options)
    const validation = validatePdfStructure(first.pdf)

    expect(first.pdf).toEqual(second.pdf)
    expect(validation.valid).toBe(true)
    expect(validation.text).toContain(
      "Default 03-01-2024 Timed 03-01-2024 01:30"
    )
  })

  test("continues searchable list numbering across repeated template paragraphs", async () => {
    const engine = await createDocxPdfEngine()
    const compiled = await engine.compile(
      sampleDocx(
        `
          <w:p><w:r><w:t>{{#each items}}</w:t></w:r></w:p>
          <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="7"/></w:numPr></w:pPr><w:r><w:t>{{name:string}}</w:t></w:r></w:p>
          <w:p><w:r><w:t>{{/each}}</w:t></w:r></w:p>
        `,
        {
          "word/_rels/document.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`,
          "word/numbering.xml": `<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:suff w:val="tab"/><w:lvlJc w:val="right"/><w:pPr><w:ind w:start="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="7"><w:abstractNumId w:val="1"/></w:num></w:numbering>`,
        }
      )
    )
    const rendered = await engine.render(
      compiled,
      { items: [{ name: "Alpha" }, { name: "Beta" }] },
      { locale: "en-ZA", timeZone: "Africa/Johannesburg" }
    )
    const validation = validatePdfStructure(rendered.pdf)

    expect(validation.valid).toBe(true)
    expect(validation.pageCount).toBe(1)
    expect(validation.text).toBe("1.Alpha2.Beta")
    expect(
      rendered.diagnostics.some(({ severity }) => severity === "error")
    ).toBe(false)
    expect(
      rendered.diagnostics.some(({ code }) => code.includes("numbering"))
    ).toBe(false)
  })

  test("renders a real fixed-grid DOCX table with formatting, merges, fragmentation, and continuous numbering", async () => {
    const engine = await createDocxPdfEngine()
    const compiled = await engine.compile(buildPhase5FormattingTableDocx())
    const section = compiled.source.sections[0]
    const table = section?.blocks.find((block) => block.type === "table")
    if (!section || table?.type !== "table")
      throw new Error("Expected the fixture table to compile")

    expect(ENGINE_VERSION).toBe("0.0.0-phase.8")
    expect(compiled.version).toBe(ENGINE_VERSION)
    expect(Number(section.properties.pageWidth)).toBeLessThan(
      Number(section.properties.pageHeight)
    )
    expect(table.layout).toBe("fixed")
    expect(table.columnWidths.map(Number)).toEqual([1600, 2400])
    expect({
      top: Number(table.cellPadding.top),
      right: Number(table.cellPadding.right),
      bottom: Number(table.cellPadding.bottom),
      left: Number(table.cellPadding.left),
    }).toEqual({ top: 80, right: 100, bottom: 80, left: 100 })
    expect(table.borders).toMatchObject({
      top: { style: "single", color: "#102030", width: 20, space: 20 },
      right: { style: "double", color: "#405060", width: 30 },
      bottom: { style: "dotted", color: "#708090" },
      left: { style: "dashed", color: "#A0B0C0" },
    })
    expect(table.repeatHeaderRowCount).toBe(1)
    expect(table.rows[0]).toMatchObject({
      repeatAsHeader: true,
      height: { rule: "exact", value: 640 },
      cells: [
        {
          columnSpan: 2,
          width: 4000,
          fillColor: "#DDEEFF",
          verticalAlignment: "center",
        },
      ],
    })
    expect(table.rows[1]?.cells[0]).toMatchObject({
      verticalMerge: "restart",
      fillColor: "#FFF4CC",
      verticalAlignment: "top",
    })
    expect(table.rows[1]?.cells[1]?.verticalAlignment).toBe("bottom")
    expect(table.rows[2]).toMatchObject({
      height: { rule: "exact", value: 520 },
      cells: [{ verticalMerge: "continue" }, { verticalAlignment: "center" }],
    })

    expect(Object.isFrozen(table)).toBe(true)
    expect(Object.isFrozen(table.columnWidths)).toBe(true)
    expect(Object.isFrozen(table.borders)).toBe(true)
    expect(Object.isFrozen(table.cellPadding)).toBe(true)
    expect(Object.isFrozen(table.rows)).toBe(true)
    expect(Object.isFrozen(table.rows[0]?.cells)).toBe(true)
    expect(Object.isFrozen(table.rows[0]?.cells[0]?.blocks)).toBe(true)
    expect(Object.isFrozen(table.rows[0]?.cells[0]?.blocks[0]?.children)).toBe(
      true
    )
    expect(() => {
      ;(table.rows[0]?.cells[0] as { fillColor: string | null }).fillColor =
        "#000000"
    }).toThrow()
    expect(table.rows[0]?.cells[0]?.fillColor).toBe("#DDEEFF")

    const options = {
      locale: "en-ZA",
      timeZone: "Africa/Johannesburg",
      includeLayoutTrace: true,
    } as const
    const first = await engine.render(compiled, {}, options)
    const second = await engine.render(compiled, {}, options)
    const validation = validatePdfStructure(first.pdf)

    expect(first.pdf).toEqual(second.pdf)
    expect(first.documentHash).toBe(second.documentHash)
    expect(first.pageCount).toBeGreaterThan(1)
    expect(validation.valid).toBe(true)
    expect(validation.pageCount).toBe(first.pageCount)
    expect(validation.errors.some((error) => error.includes("mirrored"))).toBe(
      false
    )
    expect(
      first.layoutTrace?.events.some(
        (event) => event.kind === "table-row-fragment"
      )
    ).toBe(true)
    expect(
      validation.pageTexts.every((text) => text.includes("TABLE HEADER"))
    ).toBe(true)
    expect(validation.text.indexOf("1.Cell list")).toBeLessThan(
      validation.text.indexOf("Row 1 right")
    )
    expect(validation.text.indexOf("Row 1 right")).toBeLessThan(
      validation.text.indexOf("Row 2 right")
    )
    expect(validation.text.indexOf("2.After table")).toBeGreaterThan(
      validation.text.indexOf("Fragment tail")
    )
  })

  test("repeats dedicated template marker rows as row-major searchable table data", async () => {
    const engine = await createDocxPdfEngine()
    const compiled = await engine.compile(buildPhase5TemplateTableDocx())
    const table = compiled.source.sections[0]?.blocks[0]
    if (table?.type !== "table")
      throw new Error("Expected the template fixture table to compile")

    expect(compiled.manifest.fields.map(({ path }) => path)).toEqual([
      "invoice.items",
      "invoice.items[].name",
      "invoice.items[].quantity",
    ])
    const items = Array.from({ length: 18 }, (_, index) => ({
      name: `Item ${String(index + 1).padStart(2, "0")}`,
      quantity: index + 1,
    }))
    const options = {
      locale: "en-ZA",
      timeZone: "Africa/Johannesburg",
      includeLayoutTrace: true,
    } as const
    const first = await engine.render(compiled, { invoice: { items } }, options)
    const second = await engine.render(
      compiled,
      { invoice: { items } },
      options
    )
    const validation = validatePdfStructure(first.pdf)

    expect(first.pageCount).toBeGreaterThan(1)
    expect(first.pdf).toEqual(second.pdf)
    expect(first.documentHash).toBe(second.documentHash)
    expect(validation.valid).toBe(true)
    expect(validation.pageTexts.every((text) => text.includes("ITEMQTY"))).toBe(
      true
    )
    expect(validation.text).not.toContain("{{")
    expect(validation.text).not.toContain("#each")
    let previousOffset = -1
    for (const [index, item] of items.entries()) {
      const rowText = `${item.name}${item.quantity}`
      const offset = validation.text.indexOf(rowText)
      expect(offset).toBeGreaterThan(previousOffset)
      previousOffset = offset
      expect(validation.text.match(new RegExp(item.name, "gu"))).toHaveLength(1)
      expect(index).toBeLessThan(items.length)
    }
    expect(validation.text.indexOf("Template tail")).toBeGreaterThan(
      previousOffset
    )
  })

  test("keeps table rendering bounded by maxPages and abort signals", async () => {
    const limitedEngine = await createDocxPdfEngine({
      limits: { maxPages: 1 },
    })
    const limited = await limitedEngine.compile(
      buildPhase5FormattingTableDocx()
    )
    await expect(
      limitedEngine.render(
        limited,
        {},
        {
          locale: "en-ZA",
          timeZone: "Africa/Johannesburg",
        }
      )
    ).rejects.toThrow("Layout exceeded the configured maximum of 1 pages")

    const engine = await createDocxPdfEngine()
    const compiled = await engine.compile(buildPhase5FormattingTableDocx())
    const controller = new AbortController()
    controller.abort()
    await expect(
      engine.render(
        compiled,
        {},
        {
          locale: "en-ZA",
          timeZone: "Africa/Johannesburg",
          signal: controller.signal,
        }
      )
    ).rejects.toThrow()
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
    expect(Object.isFrozen(compiled.manifest.fields[0]?.formatters)).toBe(true)
    expect(Object.isFrozen(compiled.starterData.patient)).toBe(true)
    const section = compiled.source.sections[0]
    if (section === undefined) throw new Error("fixture must contain a section")
    const block = section.blocks[0]
    if (block === undefined)
      throw new Error("fixture section must contain a block")
    if (block.type !== "paragraph")
      throw new Error("fixture block must contain a paragraph")
    expect(Object.isFrozen(block.children)).toBe(true)
    const child = block.children[0]
    if (child === undefined)
      throw new Error("fixture block must contain a child")
    expect(() => {
      ;(child as { text: string }).text = "mutated"
    }).toThrow()
    expect(child.type).toBe("text")
    if (child.type !== "text")
      throw new Error("fixture child must contain text")
    expect(child.text).toBe("Prepared for ")
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
      ).toContain("DOCX_INVALID_TABLE")
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
