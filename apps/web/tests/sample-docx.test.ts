import { describe, expect, test } from "bun:test"
import { createDocxPdfEngine } from "@apexmed/engine"
import { strFromU8, unzipSync } from "fflate"

import { SAMPLE_DATA, createSampleDocx } from "../src/lib/sample-docx"

describe("playground sample DOCX", () => {
  test("packages the deterministic Phase 6 sample with the Phase 5 invoice table", () => {
    const first = createSampleDocx()
    const second = createSampleDocx()
    const parts = unzipSync(first)
    const contentTypes = strFromU8(
      parts["[Content_Types].xml"] ?? new Uint8Array()
    )
    const document = strFromU8(parts["word/document.xml"] ?? new Uint8Array())
    const relationships = strFromU8(
      parts["word/_rels/document.xml.rels"] ?? new Uint8Array()
    )
    const headerRelationships = strFromU8(
      parts["word/_rels/header1.xml.rels"] ?? new Uint8Array()
    )
    const header = strFromU8(parts["word/header1.xml"] ?? new Uint8Array())
    const footer = strFromU8(parts["word/footer1.xml"] ?? new Uint8Array())
    const numbering = strFromU8(parts["word/numbering.xml"] ?? new Uint8Array())
    const media = parts["word/media/apex-mark.png"] ?? new Uint8Array()

    expect(first).toEqual(second)
    expect(Object.keys(parts).sort()).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "word/_rels/document.xml.rels",
      "word/_rels/header1.xml.rels",
      "word/document.xml",
      "word/footer1.xml",
      "word/header1.xml",
      "word/media/apex-mark.png",
      "word/numbering.xml",
      "word/styles.xml",
    ])
    expect(contentTypes).toContain(
      '<Default Extension="png" ContentType="image/png"/>'
    )
    expect(contentTypes).toContain('PartName="/word/header1.xml"')
    expect(contentTypes).toContain('PartName="/word/footer1.xml"')
    expect(document).toContain('<w:tblW w:w="7600" w:type="dxa"/>')
    expect(document).toContain('<w:tblLayout w:type="fixed"/>')
    expect(document).toContain('<w:tblGrid>\n        <w:gridCol w:w="3400"/>')
    expect(document).toContain("<w:tblCellMar>")
    expect(document).toContain("<w:tblBorders>")
    expect(document).toContain("<w:tblHeader/>")
    expect(document).toContain("{{#each invoice.items}}")
    expect(document).toContain("{{/each}}")
    expect(document).toContain('{{amount:number | currency:"ZAR"}}')
    expect(document).toContain('<w:numId w:val="7"/>')
    expect(document.match(/<w:sectPr>/gu)).toHaveLength(3)
    expect(document.match(/<w:type w:val="nextPage"\/>/gu)).toHaveLength(3)
    expect(document).toContain(
      '<w:pgSz w:w="16839" w:h="11907" w:orient="landscape"/>'
    )
    expect(
      document.match(
        /<w:pgMar w:top="1080" w:right="900" w:bottom="1080" w:left="900" w:header="360" w:footer="420"\/>/gu
      )
    ).toHaveLength(3)
    expect(document).toContain(
      '<wp:inline><wp:extent cx="914400" cy="457200"/>'
    )
    expect(document).toContain('<a:graphicFrameLocks noChangeAspect="1"/>')
    expect(document).not.toContain("<wp:anchor")
    expect(document).not.toContain("{{image")
    expect(document).not.toContain("<w:vMerge")
    expect(relationships).toContain('Target="numbering.xml"')
    expect(relationships).toContain('Target="header1.xml"')
    expect(relationships).toContain('Target="footer1.xml"')
    expect(relationships).toContain('Target="media/apex-mark.png"')
    expect(headerRelationships).toContain('Target="media/apex-mark.png"')
    expect(header).toContain("{{patient.fullName:string}}")
    expect(header).toContain("{{document.reference:string}}")
    expect(footer).toContain('<w:fldSimple w:instr=" PAGE ">')
    expect(footer).toContain('<w:fldSimple w:instr=" NUMPAGES ">')
    expect(media.byteLength).toBe(79)
    expect([...media.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    expect(numbering).toContain('<w:numFmt w:val="decimal"/>')
    expect(SAMPLE_DATA.invoice.items).toHaveLength(2)
  })

  test("compiles and renders the synchronized invoice sample", async () => {
    const engine = await createDocxPdfEngine()
    const compiled = await engine.compile(createSampleDocx())
    const table = compiled.source.sections[0]?.blocks.find(
      (block) => block.type === "table"
    )

    expect(compiled.version).toBe("0.0.0-phase.8")
    expect(compiled.diagnostics).toEqual([])
    expect(
      compiled.source.assets.map((asset) => [
        asset.packagePath,
        asset.mimeType,
        asset.pixelWidth,
        asset.pixelHeight,
        asset.bytes.length,
      ])
    ).toEqual([["word/media/apex-mark.png", "image/png", 4, 2, 79]])
    expect(
      compiled.source.sections.map((section) => [
        section.properties.orientation,
        Number(section.properties.pageWidth),
        Number(section.properties.pageHeight),
        Number(section.properties.headerDistance),
        Number(section.properties.footerDistance),
      ])
    ).toEqual([
      ["portrait", 11920, 16840, 360, 420],
      ["landscape", 16840, 11920, 360, 420],
      ["portrait", 11920, 16840, 360, 420],
    ])
    expect(
      compiled.source.sections.map((section) => [
        section.defaultHeaderId,
        section.defaultFooterId,
      ])
    ).toEqual([
      ["docx:header:word/header1.xml", "docx:footer:word/footer1.xml"],
      ["docx:header:word/header1.xml", "docx:footer:word/footer1.xml"],
      ["docx:header:word/header1.xml", "docx:footer:word/footer1.xml"],
    ])
    expect(compiled.manifest.fields.map((field) => field.path)).toEqual([
      "document.reference",
      "invoice.dueDate",
      "invoice.issuedDate",
      "invoice.items",
      "invoice.items[].amount",
      "invoice.items[].description",
      "invoice.items[].quantity",
      "invoice.items[].unitPrice",
      "invoice.title",
      "invoice.total",
      "patient.fullName",
    ])
    expect(
      compiled.manifest.fields.find(
        (field) => field.path === "invoice.issuedDate"
      )?.formatters
    ).toEqual([{ name: "date", arguments: ["dd-MM-yyyy HH:mm"] }])
    expect(
      compiled.manifest.fields.find((field) => field.path === "invoice.dueDate")
        ?.formatters
    ).toEqual([{ name: "date", arguments: ["dd-MM-yyyy"] }])
    expect(table?.type).toBe("table")
    if (table?.type !== "table") throw new Error("Expected a sample table")
    expect(table.layout).toBe("fixed")
    expect(Number(table.width)).toBe(7600)
    expect(table.columnWidths.map(Number)).toEqual([3400, 800, 1500, 1900])
    expect(table.repeatHeaderRowCount).toBe(1)
    expect(table.rows).toHaveLength(5)
    expect({
      top: Number(table.cellPadding.top),
      right: Number(table.cellPadding.right),
      bottom: Number(table.cellPadding.bottom),
      left: Number(table.cellPadding.left),
    }).toEqual({ top: 100, right: 120, bottom: 100, left: 120 })

    const rendered = await engine.render(compiled, SAMPLE_DATA, {
      locale: "en-ZA",
      timeZone: "Africa/Johannesburg",
      includeLayoutTrace: true,
    })
    const pdfSource = new TextDecoder("latin1").decode(rendered.pdf)
    const mediaBoxes = [...pdfSource.matchAll(/\/MediaBox \[([^\]]+)\]/gu)].map(
      (match) => match[1]
    )
    const imageMatrices = [
      ...pdfSource.matchAll(
        /q\n([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm\n\/Im\d+ Do/gu
      ),
    ]

    expect(rendered.pageCount).toBe(3)
    expect(rendered.pdf.byteLength).toBeGreaterThan(0)
    expect(rendered.diagnostics).toEqual([])
    expect(pdfSource).toContain("(Issued: ) Tj")
    expect(pdfSource).toContain("(05-08-2026 09:30) Tj")
    expect(mediaBoxes).toEqual(["0 0 596 842", "0 0 842 596", "0 0 596 842"])
    expect(pdfSource.match(/\/Subtype \/Image\b/gu)).toHaveLength(1)
    expect(pdfSource.match(/\/XObject\b/gu)?.length).toBeGreaterThanOrEqual(4)
    expect(imageMatrices.length).toBeGreaterThanOrEqual(4)
    expect(
      imageMatrices.every((match) =>
        match.slice(1).every((value) => Number(value) >= 0)
      )
    ).toBe(true)
  })
})
