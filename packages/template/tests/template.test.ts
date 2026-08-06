import { describe, expect, test } from "bun:test"
import {
  nodeId,
  twips,
  type SemanticDocument,
  type SemanticHeaderFooter,
  type SemanticImage,
  type SemanticInline,
  type SemanticParagraph,
  type SemanticTable,
  type SemanticText,
} from "@apexmed/core"

import { compileTemplate, resolveTemplate } from "../src"

const style = {
  fontFamily: "Aptos",
  fontSize: twips(220),
  fontWeight: 400,
  fontStyle: "normal",
  underline: false,
  color: "000000",
} as const

function inlineText(inline: SemanticInline): string {
  return inline.type === "text" ? inline.text : ""
}

function text(
  value: string,
  index: number,
  partialStyle: Partial<SemanticText["style"]> = {}
): SemanticText {
  return {
    type: "text",
    id: nodeId(`run-${index}`),
    source: {
      part: "word/document.xml",
      xmlPath: `/w:document/w:body/w:p[1]/w:r[${index + 1}]/w:t[1]`,
    },
    text: value,
    style: { ...style, ...partialStyle },
  }
}

function documentWithRuns(runs: readonly string[]): SemanticDocument {
  return {
    type: "document",
    id: nodeId("document"),
    source: { part: "word/document.xml", xmlPath: "/w:document" },
    assets: [],
    headers: [],
    footers: [],
    numberingDefinitions: [],
    sections: [
      {
        type: "section",
        id: nodeId("section"),
        source: { part: "word/document.xml", xmlPath: "/w:document/w:body" },
        properties: {
          pageWidth: twips(11906),
          pageHeight: twips(16838),
          orientation: "portrait",
          headerDistance: twips(720),
          footerDistance: twips(720),
          margins: {
            top: twips(1440),
            right: twips(1440),
            bottom: twips(1440),
            left: twips(1440),
          },
        },
        defaultHeaderId: null,
        defaultFooterId: null,
        blocks: [
          {
            type: "paragraph",
            id: nodeId("paragraph"),
            source: {
              part: "word/document.xml",
              xmlPath: "/w:document/w:body/w:p[1]",
            },
            properties: {
              alignment: "left",
              spacingBefore: twips(0),
              spacingAfter: twips(0),
              lineSpacing: null,
              indentStart: twips(0),
              indentEnd: twips(0),
              firstLineIndent: twips(0),
              keepWithNext: false,
              keepLinesTogether: false,
              widowControl: true,
              pageBreakBefore: false,
              numbering: null,
            },
            children: runs.map((run, index) =>
              text(run, index, index === 1 ? { fontWeight: 700 } : {})
            ),
          },
        ],
      },
    ],
  }
}

function documentWithParagraphs(
  paragraphs: readonly (string | readonly string[])[]
): SemanticDocument {
  const source = documentWithRuns([""])
  const section = source.sections[0]
  if (section === undefined) throw new Error("fixture must contain a section")
  const prototype = section.blocks[0]
  if (prototype === undefined)
    throw new Error("fixture must contain a paragraph")
  return {
    ...source,
    sections: [
      {
        ...section,
        blocks: paragraphs.map((value, paragraphIndex) => {
          const runs = typeof value === "string" ? [value] : value
          return {
            ...prototype,
            id: nodeId(`paragraph-${paragraphIndex}`),
            source: {
              part: "word/document.xml",
              xmlPath: `/w:document/w:body/w:p[${paragraphIndex + 1}]`,
            },
            children: runs.map((run, runIndex) => ({
              ...text(run, runIndex),
              id: nodeId(`paragraph-${paragraphIndex}-run-${runIndex}`),
              source: {
                part: "word/document.xml",
                xmlPath: `/w:document/w:body/w:p[${paragraphIndex + 1}]/w:r[${runIndex + 1}]/w:t[1]`,
              },
            })),
          }
        }),
      },
    ],
  }
}

function documentWithTable(
  rows: readonly (readonly (string | readonly string[])[])[]
): SemanticDocument {
  const source = documentWithRuns([""])
  const section = source.sections[0]
  const prototype = section?.blocks[0]
  if (section === undefined || prototype?.type !== "paragraph")
    throw new Error("fixture must contain a prototype paragraph")
  const paragraph = (
    value: string | readonly string[],
    rowIndex: number,
    cellIndex: number
  ): SemanticParagraph => {
    const runs = typeof value === "string" ? [value] : value
    return {
      ...prototype,
      id: nodeId(`table-row-${rowIndex}-cell-${cellIndex}-paragraph-0`),
      source: {
        part: "word/document.xml",
        xmlPath: `/w:document/w:body/w:tbl[1]/w:tr[${rowIndex + 1}]/w:tc[${cellIndex + 1}]/w:p[1]`,
      },
      children: runs.map((run, runIndex) => ({
        ...text(run, runIndex),
        id: nodeId(
          `table-row-${rowIndex}-cell-${cellIndex}-paragraph-0-run-${runIndex}`
        ),
      })),
    }
  }
  const table: SemanticTable = {
    type: "table",
    id: nodeId("table-0"),
    source: {
      part: "word/document.xml",
      xmlPath: "/w:document/w:body/w:tbl[1]",
    },
    width: twips(4000),
    preferredWidth: twips(4000),
    layout: "fixed",
    columnWidths: [twips(2000), twips(2000)],
    borders: {
      top: null,
      right: null,
      bottom: null,
      left: null,
      insideHorizontal: null,
      insideVertical: null,
    },
    cellPadding: {
      top: twips(50),
      right: twips(50),
      bottom: twips(50),
      left: twips(50),
    },
    repeatHeaderRowCount: 0,
    rows: rows.map((cells, rowIndex) => ({
      type: "tableRow",
      id: nodeId(`table-row-${rowIndex}`),
      source: {
        part: "word/document.xml",
        xmlPath: `/w:document/w:body/w:tbl[1]/w:tr[${rowIndex + 1}]`,
      },
      repeatAsHeader: false,
      allowBreakAcrossPages: true,
      height: null,
      cells: cells.map((value, cellIndex) => ({
        type: "tableCell",
        id: nodeId(`table-row-${rowIndex}-cell-${cellIndex}`),
        source: {
          part: "word/document.xml",
          xmlPath: `/w:document/w:body/w:tbl[1]/w:tr[${rowIndex + 1}]/w:tc[${cellIndex + 1}]`,
        },
        columnIndex: cellIndex,
        width: twips(2000),
        preferredWidth: twips(2000),
        columnSpan: 1,
        verticalMerge: "none",
        verticalAlignment: "top",
        fillColor: null,
        borders: { top: null, right: null, bottom: null, left: null },
        blocks: [paragraph(value, rowIndex, cellIndex)],
      })),
    })),
  }
  return {
    ...source,
    sections: [{ ...section, blocks: [table] }],
  }
}

function resolvedTable(result: ReturnType<typeof resolveTemplate>) {
  if (!result.ok) throw new Error("Expected resolution to succeed")
  const block = result.value.sections[0]?.blocks[0]
  if (block?.type !== "table") throw new Error("Expected a resolved table")
  return block
}

function tableTexts(result: ReturnType<typeof resolveTemplate>): string[][][] {
  return resolvedTable(result).rows.map((row) =>
    row.cells.map((cell) =>
      cell.blocks.map((paragraph) =>
        paragraph.children.map(inlineText).join("")
      )
    )
  )
}

function resolvedParagraphs(
  result: ReturnType<typeof resolveTemplate>
): string[] {
  if (!result.ok) throw new Error("Expected resolution to succeed")
  return (
    result.value.sections[0]?.blocks
      .filter((block) => block.type === "paragraph")
      .map((block) => block.children.map(inlineText).join("")) ?? []
  )
}

function resolvedText(result: ReturnType<typeof resolveTemplate>): string {
  if (!result.ok) throw new Error("Expected resolution to succeed")
  return (() => {
    const block = result.value.sections[0]?.blocks[0]
    return block?.type === "paragraph"
      ? block.children.map(inlineText).join("")
      : ""
  })()
}

describe("template compilation", () => {
  test("recognizes one logical tag fragmented over semantic text runs", async () => {
    const source = documentWithRuns([
      "Hello {{pat",
      "ient.full",
      "Name:string}}.",
    ])
    const compiled = await compileTemplate(source)

    expect(compiled.diagnostics).toEqual([])
    expect(compiled.templateHash).toMatch(/^[a-f0-9]{64}$/u)
    expect(compiled.placeholderNodes[nodeId("run-0")]).toBe("patient.fullName")
    expect(compiled.manifest.fields).toEqual([
      expect.objectContaining({
        path: "patient.fullName",
        kind: "string",
        required: true,
      }),
    ])
    const section = source.sections[0]
    if (section === undefined) throw new Error("fixture must contain a section")
    const block = section.blocks[0]
    if (block?.type !== "paragraph")
      throw new Error("fixture section must contain a block")
    const child = block.children[0]
    if (child === undefined)
      throw new Error("fixture block must contain a child")
    expect(compiled.manifest.fields[0]?.sourceLocations).toEqual([child.source])
    expect(compiled.jsonSchema).toEqual({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        patient: {
          type: "object",
          properties: { fullName: { type: "string" } },
          required: ["fullName"],
          additionalProperties: false,
        },
      },
      required: ["patient"],
      additionalProperties: false,
    })
    expect(compiled.starterData).toEqual({ patient: { fullName: "" } })
  })

  test("uses the style and source location of the tag's first character for replacement", async () => {
    const source = documentWithRuns([
      "Hello {{pat",
      "ient.full",
      "Name:string}}.",
    ])
    const compiled = await compileTemplate(source)
    const result = resolveTemplate(compiled, {
      patient: { fullName: "Ada Lovelace" },
    })

    expect(resolvedText(result)).toBe("Hello Ada Lovelace.")
    if (!result.ok) throw new Error("Expected resolution to succeed")
    const firstBlock = result.value.sections[0]?.blocks[0]
    const children = firstBlock?.type === "paragraph" ? firstBlock.children : []
    const value = children.find(
      (child): child is SemanticText =>
        child.type === "text" && child.text === "Ada Lovelace"
    )
    expect(value?.style.fontWeight).toBe(400)
    expect(value?.source).toEqual(
      source.sections[0]?.blocks[0]?.type === "paragraph"
        ? source.sections[0].blocks[0].children[0]?.source
        : undefined
    )
  })

  test("produces a sorted nested schema and deterministic starter data", async () => {
    const compiled = await compileTemplate(
      documentWithRuns([
        "{{visit.date:date}} {{patient.active:boolean}} {{patient.age:number}}",
      ])
    )
    expect(compiled.manifest.fields.map((field) => field.path)).toEqual([
      "patient.active",
      "patient.age",
      "visit.date",
    ])
    expect(compiled.starterData).toEqual({
      patient: { active: false, age: 0 },
      visit: { date: "1970-01-01T00:00:00.000Z" },
    })
  })

  test("rejects malformed, block, image, unsafe, and expression-limited tags", async () => {
    const compiled = await compileTemplate(
      documentWithRuns([
        "{{#each patients}} {{/each}} {{image patient.photo}} {{constructor.name}} {{patient.name",
      ]),
      { limits: { maxExpressionDepth: 1 } }
    )
    expect(compiled.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "TEMPLATE_BLOCK_MARKER_PLACEMENT",
      "TEMPLATE_BLOCK_MARKER_PLACEMENT",
      "TEMPLATE_UNSUPPORTED_IMAGE_TAG",
      "TEMPLATE_UNSAFE_PATH",
      "TEMPLATE_MALFORMED_TAG",
      "TEMPLATE_CONTENT_LOSS",
    ])
  })

  test("diagnoses type and ancestor-path conflicts deterministically", async () => {
    const compiled = await compileTemplate(
      documentWithRuns([
        "{{patient:string}} {{patient.name:string}} {{age:number}} {{age:boolean}}",
      ])
    )
    expect(compiled.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "TEMPLATE_TYPE_CONFLICT",
      "TEMPLATE_PATH_CONFLICT",
    ])
  })
})

describe("template resolution", () => {
  test("fails strictly on missing and incorrectly typed values", async () => {
    const compiled = await compileTemplate(
      documentWithRuns(["{{patient.age:number}} {{patient.name:string}}"])
    )
    const result = resolveTemplate(compiled, { patient: { age: "7" } })

    expect(result.ok).toBe(false)
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "TEMPLATE_VALUE_TYPE",
      "TEMPLATE_VALUE_MISSING",
    ])
  })

  test("applies the compiled field type to every occurrence of an untyped path", async () => {
    const compiled = await compileTemplate(
      documentWithParagraphs(["{{amount}}", "{{amount:number}}"])
    )

    expect(compiled.diagnostics).toEqual([])
    expect(compiled.manifest.fields[0]?.kind).toBe("number")
    expect(resolveTemplate(compiled, { amount: "7" }).diagnostics).toEqual([
      expect.objectContaining({ code: "TEMPLATE_VALUE_TYPE" }),
      expect.objectContaining({ code: "TEMPLATE_VALUE_TYPE" }),
    ])
    expect(
      resolvedParagraphs(resolveTemplate(compiled, { amount: 7 }))
    ).toEqual(["7", "7"])
  })

  test("can permissively warn and replace missing or wrong values with empty text", async () => {
    const compiled = await compileTemplate(
      documentWithRuns(["{{patient.age:number}}/{{patient.name:string}}"])
    )
    const result = resolveTemplate(
      compiled,
      { patient: { age: "7" } },
      { permissive: true }
    )

    expect(result.ok).toBe(true)
    expect(resolvedText(result)).toBe("/")
    expect(result.diagnostics.map((diagnostic) => diagnostic.severity)).toEqual(
      ["warning", "warning"]
    )
  })

  test("does not read inherited properties while traversing data", async () => {
    const compiled = await compileTemplate(
      documentWithRuns(["{{patient.fullName:string}}"])
    )
    const inherited = Object.create({ fullName: "Not allowed" }) as {
      fullName?: string
    }
    const result = resolveTemplate(compiled, { patient: inherited })

    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]?.code).toBe("TEMPLATE_VALUE_MISSING")
  })

  test("enforces expanded text and abort limits", async () => {
    const compiled = await compileTemplate(
      documentWithRuns(["{{patient.fullName:string}}"])
    )
    const limited = resolveTemplate(
      compiled,
      { patient: { fullName: "abc" } },
      { limits: { maxExpandedTextBytes: 2 } }
    )
    expect(limited.ok).toBe(false)
    expect(limited.diagnostics.at(-1)?.code).toBe(
      "TEMPLATE_EXPANDED_TEXT_LIMIT"
    )

    const controller = new AbortController()
    controller.abort()
    await expect(
      compileTemplate(compiled.source, { signal: controller.signal })
    ).rejects.toThrow()
    expect(() =>
      resolveTemplate(compiled, {}, { signal: controller.signal })
    ).toThrow()
  })

  test("resolves arbitrary deterministic tag fragmentation", async () => {
    const logical = "Before {{patient.fullName:string}} after"
    for (let seed = 0; seed < 80; seed += 1) {
      const runs: string[] = []
      let cursor = 0
      let state = seed + 1
      while (cursor < logical.length) {
        state = (state * 1_103_515_245 + 12_345) & 0x7fffffff
        const size = 1 + (state % 7)
        runs.push(logical.slice(cursor, cursor + size))
        cursor += size
      }
      const compiled = await compileTemplate(documentWithRuns(runs))
      expect(compiled.diagnostics).toEqual([])
      expect(
        resolvedText(
          resolveTemplate(compiled, { patient: { fullName: "Ada" } })
        )
      ).toBe("Before Ada after")
    }
  })
})

describe("Phase 4 formatters", () => {
  test("infers types, records formatter references, and resolves fragmented tags deterministically", async () => {
    const compiled = await compileTemplate(
      documentWithRuns([
        "{{customer.na",
        'me | upper}} {{total:number | currency:"USD"}} {{issued:date | date:"d MMMM yyyy"}}',
      ])
    )

    expect(compiled.diagnostics).toEqual([])
    expect(
      compiled.manifest.fields.map(({ path, kind, formatters }) => ({
        path,
        kind,
        formatters,
      }))
    ).toEqual([
      {
        path: "customer.name",
        kind: "string",
        formatters: [{ name: "upper", arguments: [] }],
      },
      {
        path: "issued",
        kind: "date",
        formatters: [{ name: "date", arguments: ["d MMMM yyyy"] }],
      },
      {
        path: "total",
        kind: "number",
        formatters: [{ name: "currency", arguments: ["USD"] }],
      },
    ])
    const data = {
      customer: { name: "Ada" },
      total: 1234.5,
      issued: "2024-01-02T23:30:00.000Z",
    }
    const options = { locale: "en-US", timeZone: "Africa/Johannesburg" }
    const first = resolveTemplate(compiled, data, options)
    const second = resolveTemplate(compiled, data, options)
    expect(resolvedText(first)).toBe("ADA $1,234.50 3 January 2024")
    expect(second).toEqual(first)
  })

  test("defaults to day-month-year and supports explicit date and time patterns", async () => {
    const compiled = await compileTemplate(
      documentWithRuns([
        "{{defaulted:date | date}}|",
        '{{numeric:date | date:"yyyy/MM/dd"}}|',
        '{{long:date | date:"d MMMM yyyy"}}|',
        '{{twentyFour:date | date:"dd-MM-yyyy HH:mm:ss"}}|',
        '{{twelve:date | date:"dd-MM-yyyy hh:mm a"}}|',
        '{{compact:date | date:"M/d/yyyy H:m:s"}}',
      ])
    )

    expect(compiled.diagnostics).toEqual([])
    expect(
      compiled.manifest.fields.find((field) => field.path === "defaulted")
        ?.formatters
    ).toEqual([{ name: "date", arguments: ["dd-MM-yyyy"] }])

    const value = "2024-01-02T23:04:05.000Z"
    const data = {
      compact: value,
      defaulted: value,
      numeric: value,
      long: value,
      twentyFour: value,
      twelve: value,
    }
    const options = { locale: "en-US", timeZone: "Africa/Johannesburg" }
    const first = resolveTemplate(compiled, data, options)
    const second = resolveTemplate(compiled, data, options)

    expect(resolvedText(first)).toBe(
      "03-01-2024|2024/01/03|3 January 2024|03-01-2024 01:04:05|03-01-2024 01:04 AM|1/3/2024 1:4:5"
    )
    expect(second).toEqual(first)
  })

  test("formats supported currency locales without ambient ICU separators", async () => {
    const compiled = await compileTemplate(
      documentWithRuns(['{{amount:number | currency:"ZAR"}}'])
    )

    expect(
      resolvedText(
        resolveTemplate(compiled, { amount: 1234.5 }, { locale: "en-ZA" })
      )
    ).toBe("R\u00a01\u00a0234,50")
    expect(
      resolvedText(
        resolveTemplate(compiled, { amount: -1234.5 }, { locale: "en-US" })
      )
    ).toBe("-ZAR\u00a01,234.50")
    expect(
      resolveTemplate(compiled, { amount: 1 }, { locale: "fr-FR" })
        .diagnostics[0]
    ).toMatchObject({
      code: "TEMPLATE_FORMATTER_CONTEXT",
      message:
        "The currency formatter supports only the canonical en-US and en-ZA locale profiles",
    })
    expect(
      resolveTemplate(
        compiled,
        { amount: Number.MAX_VALUE },
        { locale: "en-ZA" }
      ).diagnostics[0]
    ).toMatchObject({
      code: "TEMPLATE_VALUE_TYPE",
      message:
        "The currency formatter requires a finite value within the safe integer magnitude",
    })
  })

  test("rejects unknown, wrong-arity, incompatible, malformed, and executable-looking formatter expressions", async () => {
    const cases = [
      ["{{name | title}}", "TEMPLATE_UNKNOWN_FORMATTER"],
      ['{{name | upper:"x"}}', "TEMPLATE_FORMATTER_ARGUMENT"],
      ['{{name:string | currency:"USD"}}', "TEMPLATE_FORMATTER_TYPE"],
      ['{{amount | currency:"usd"}}', "TEMPLATE_FORMATTER_ARGUMENT"],
      ['{{date | date:"yyyy"}}', "TEMPLATE_FORMATTER_ARGUMENT"],
      ['{{date | date:"dd-mm-yyyy"}}', "TEMPLATE_FORMATTER_ARGUMENT"],
      ['{{date | date:"dd-MM-yyyy mm"}}', "TEMPLATE_FORMATTER_ARGUMENT"],
      ['{{date | date:"dd-MM-yyyy HH:mm a"}}', "TEMPLATE_FORMATTER_ARGUMENT"],
      ['{{date | date:"dd-MM-yyyy hh:mm"}}', "TEMPLATE_FORMATTER_ARGUMENT"],
      ['{{date | date:"dd-QQ-yyyy"}}', "TEMPLATE_FORMATTER_ARGUMENT"],
      ['{{amount | currency:"USD}}', "TEMPLATE_MALFORMED_QUOTE"],
      ["{{name.toString() | upper}}", "TEMPLATE_INVALID_EXPRESSION"],
    ] as const
    for (const [tag, code] of cases) {
      const compiled = await compileTemplate(documentWithRuns([tag]))
      expect(compiled.diagnostics[0]?.code).toBe(code)
      expect(compiled.diagnostics[0]?.source).toBeDefined()
    }
  })

  test("requires explicit locale and time zone and validates ISO date-time inputs", async () => {
    const currency = await compileTemplate(
      documentWithRuns(["{{amount | currency:'ZAR'}}"])
    )
    expect(resolveTemplate(currency, { amount: 10 }).diagnostics[0]?.code).toBe(
      "TEMPLATE_FORMATTER_CONTEXT"
    )
    const date = await compileTemplate(
      documentWithRuns(["{{when | date:'d MMMM yyyy'}}"])
    )
    expect(
      resolveTemplate(
        date,
        { when: "2024-01-02" },
        { locale: "en-US", timeZone: "UTC" }
      ).diagnostics[0]?.code
    ).toBe("TEMPLATE_VALUE_TYPE")
    expect(
      resolveTemplate(
        date,
        { when: "2024-01-02T00:00:00Z" },
        { locale: "fr-FR", timeZone: "UTC" }
      ).diagnostics[0]
    ).toMatchObject({
      code: "TEMPLATE_FORMATTER_CONTEXT",
      message:
        "The date formatter supports only the canonical en-US and en-ZA locale profiles",
    })
  })
})

describe("Phase 4 paragraph blocks", () => {
  test("resolves nested if/else and each blocks with relative item lookup", async () => {
    const compiled = await compileTemplate(
      documentWithParagraphs([
        "{{#if invoice.show}}",
        "Invoice",
        "{{#each invoice.items}}",
        ["{{descr", "iption | upper}}"],
        "{{#if featured}}",
        "Featured",
        "{{else}}",
        "Regular",
        "{{/if}}",
        "{{#each modifiers}}",
        "- {{name}}",
        "{{/each}}",
        "{{/each}}",
        "{{else}}",
        "Hidden",
        "{{/if}}",
      ])
    )
    expect(compiled.diagnostics).toEqual([])
    expect(compiled.manifest.fields.map((field) => field.path)).toEqual([
      "invoice.items",
      "invoice.items[].description",
      "invoice.items[].featured",
      "invoice.items[].modifiers",
      "invoice.items[].modifiers[].name",
      "invoice.show",
    ])
    expect(
      compiled.manifest.fields.find((field) => field.path === "invoice.show")
        ?.kind
    ).toBe("boolean")

    const result = resolveTemplate(compiled, {
      invoice: {
        show: true,
        items: [
          {
            description: "consult",
            featured: true,
            modifiers: [{ name: "urgent" }, { name: "remote" }],
          },
          {
            description: "medicine",
            featured: false,
            modifiers: [],
          },
        ],
      },
    })
    expect(resolvedParagraphs(result)).toEqual([
      "Invoice",
      "CONSULT",
      "Featured",
      "- urgent",
      "- remote",
      "MEDICINE",
      "Regular",
    ])
    if (!result.ok) throw new Error("Expected resolution to succeed")
    const ids = result.value.sections[0]?.blocks.flatMap((block) =>
      block.type === "paragraph"
        ? [block.id, ...block.children.map((child) => child.id)]
        : [block.id]
    )
    expect(new Set(ids).size).toBe(ids?.length ?? 0)
  })

  test("selects else and expands empty arrays to no body paragraphs", async () => {
    const compiled = await compileTemplate(
      documentWithParagraphs([
        "{{#if visible}}",
        "Shown",
        "{{else}}",
        "Hidden",
        "{{/if}}",
        "{{#each rows}}",
        "{{value}}",
        "{{/each}}",
      ])
    )
    expect(
      resolvedParagraphs(
        resolveTemplate(compiled, { visible: false, rows: [] })
      )
    ).toEqual(["Hidden"])
  })

  test("fails strictly for missing or incorrectly typed block values", async () => {
    const conditions = await compileTemplate(
      documentWithParagraphs(["{{#if visible}}", "Shown", "{{/if}}"])
    )
    expect(resolveTemplate(conditions, {}).diagnostics[0]?.code).toBe(
      "TEMPLATE_VALUE_MISSING"
    )
    expect(
      resolveTemplate(conditions, { visible: "yes" }).diagnostics[0]?.code
    ).toBe("TEMPLATE_VALUE_TYPE")

    const loops = await compileTemplate(
      documentWithParagraphs(["{{#each rows}}", "Row", "{{/each}}"])
    )
    expect(resolveTemplate(loops, { rows: {} }).diagnostics[0]?.code).toBe(
      "TEMPLATE_VALUE_TYPE"
    )
    expect(
      resolveTemplate(loops, { rows: ["not-an-object"] }).diagnostics[0]?.code
    ).toBe("TEMPLATE_VALUE_TYPE")
  })

  test("emits nested array schema and deterministic one-item starter data", async () => {
    const compiled = await compileTemplate(
      documentWithParagraphs([
        "{{#each invoice.items}}",
        "{{description:string}}",
        "{{#each modifiers}}",
        "{{name | lower}}",
        "{{/each}}",
        "{{/each}}",
      ])
    )
    expect(compiled.starterData).toEqual({
      invoice: {
        items: [{ description: "", modifiers: [{ name: "" }] }],
      },
    })
    expect(compiled.jsonSchema).toEqual({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        invoice: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  description: { type: "string" },
                  modifiers: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: { name: { type: "string" } },
                      required: ["name"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["description", "modifiers"],
                additionalProperties: false,
              },
            },
          },
          required: ["items"],
          additionalProperties: false,
        },
      },
      required: ["invoice"],
      additionalProperties: false,
    })
  })

  test("validates placement, balance, nesting, unsafe paths, and unsupported images", async () => {
    const cases = [
      [["prefix {{#if ok}}", "{{/if}}"], "TEMPLATE_BLOCK_MARKER_PLACEMENT"],
      [["{{else}}"], "TEMPLATE_UNBALANCED_BLOCK"],
      [["{{#if ok}}", "{{/each}}"], "TEMPLATE_UNBALANCED_BLOCK"],
      [
        ["{{#if ok}}", "{{else}}", "{{else}}", "{{/if}}"],
        "TEMPLATE_DUPLICATE_ELSE",
      ],
      [["{{#each constructor.rows}}", "{{/each}}"], "TEMPLATE_UNSAFE_PATH"],
      [["{{#if ok}}"], "TEMPLATE_UNCLOSED_BLOCK"],
      [["{{#while ok}}"], "TEMPLATE_MALFORMED_BLOCK"],
      [["{{image photo}}"], "TEMPLATE_UNSUPPORTED_IMAGE_TAG"],
    ] as const
    for (const [paragraphs, code] of cases) {
      const compiled = await compileTemplate(documentWithParagraphs(paragraphs))
      expect(compiled.diagnostics.some((item) => item.code === code)).toBe(true)
    }
  })

  test("enforces cumulative loop, node, text, traversal, and abort limits", async () => {
    const compiled = await compileTemplate(
      documentWithParagraphs(["{{#each rows}}", "{{value}}", "{{/each}}"])
    )
    const data = { rows: [{ value: "ab" }, { value: "cd" }] }
    expect(
      resolveTemplate(compiled, data, {
        limits: { maxLoopIterations: 1 },
      }).diagnostics.at(-1)?.code
    ).toBe("TEMPLATE_LOOP_LIMIT")
    expect(
      resolveTemplate(compiled, data, {
        limits: { maxExpandedNodes: 3 },
      }).diagnostics.at(-1)?.code
    ).toBe("TEMPLATE_EXPANDED_NODE_LIMIT")
    expect(
      resolveTemplate(compiled, data, {
        limits: { maxExpandedTextBytes: 3 },
      }).diagnostics.at(-1)?.code
    ).toBe("TEMPLATE_EXPANDED_TEXT_LIMIT")
    expect(
      resolveTemplate(compiled, data, {
        limits: { maxObjectTraversalDepth: 0 },
      }).diagnostics[0]?.code
    ).toBe("TEMPLATE_TRAVERSAL_LIMIT")
    expect(
      resolveTemplate(compiled, data, {
        limits: { maxExpressionDepth: 0 },
      }).diagnostics[0]?.code
    ).toBe("TEMPLATE_EXPRESSION_LIMIT")

    const controller = new AbortController()
    controller.abort()
    expect(() =>
      resolveTemplate(compiled, data, { signal: controller.signal })
    ).toThrow()
  })
})

describe("Phase 5 table templates", () => {
  test("compiles and resolves fragmented formatted tags in table cells", async () => {
    const source = documentWithTable([
      [["Patient: {{pat", "ient.name | upper}}"], "{{visit.count:number}}"],
    ])
    const compiled = await compileTemplate(source)

    expect(compiled.diagnostics).toEqual([])
    expect(compiled.manifest.fields.map((field) => field.path)).toEqual([
      "patient.name",
      "visit.count",
    ])
    const result = resolveTemplate(compiled, {
      patient: { name: "Ada" },
      visit: { count: 3 },
    })
    expect(tableTexts(result)).toEqual([[["Patient: ADA"], ["3"]]])
    expect(resolvedTable(result).columnWidths).toEqual([
      twips(2000),
      twips(2000),
    ])
  })

  test("removes marker rows and repeats a multi-row range with canonical item paths", async () => {
    const source = documentWithTable([
      ["Heading", "Value"],
      ["{{#each invoice.items}}", ""],
      [["{{product.na", "me | upper}}"], "{{quantity:number}}"],
      ["Code", "{{product.code}}"],
      ["{{/each}}", ""],
    ])
    const compiled = await compileTemplate(source)

    expect(compiled.diagnostics).toEqual([])
    expect(compiled.manifest.fields.map((field) => field.path)).toEqual([
      "invoice.items",
      "invoice.items[].product.code",
      "invoice.items[].product.name",
      "invoice.items[].quantity",
    ])
    expect(compiled.starterData).toEqual({
      invoice: {
        items: [{ product: { code: "", name: "" }, quantity: 0 }],
      },
    })

    const data = {
      invoice: {
        items: [
          { product: { name: "consult", code: "C1" }, quantity: 1 },
          { product: { name: "medicine", code: "M2" }, quantity: 2 },
        ],
      },
    }
    const first = resolveTemplate(compiled, data)
    const second = resolveTemplate(compiled, data)
    expect(tableTexts(first)).toEqual([
      [["Heading"], ["Value"]],
      [["CONSULT"], ["1"]],
      [["Code"], ["C1"]],
      [["MEDICINE"], ["2"]],
      [["Code"], ["M2"]],
    ])
    expect(second).toEqual(first)

    const table = resolvedTable(first)
    const ids = table.rows.flatMap((row) => [
      row.id,
      ...row.cells.flatMap((cell) => [
        cell.id,
        ...cell.blocks.flatMap((paragraph) => [
          paragraph.id,
          ...paragraph.children.map((child) => child.id),
        ]),
      ]),
    ])
    expect(new Set(ids).size).toBe(ids.length)
    expect(table.rows[1]?.id).toContain("~each-0")
    expect(table.rows[3]?.id).toContain("~each-1")
  })

  test("expands zero items to zero body rows and supports nested row loops and conditions", async () => {
    const simple = await compileTemplate(
      documentWithTable([
        ["Header"],
        ["{{#each rows}}"],
        ["{{value}}"],
        ["{{/each}}"],
      ])
    )
    expect(tableTexts(resolveTemplate(simple, { rows: [] }))).toEqual([
      [["Header"]],
    ])

    const nested = await compileTemplate(
      documentWithTable([
        ["{{#each groups}}"],
        ["{{#if visible}}"],
        ["{{name}}"],
        ["{{#each items}}"],
        ["- {{label}}"],
        ["{{/each}}"],
        ["{{/if}}"],
        ["{{/each}}"],
      ])
    )
    expect(nested.diagnostics).toEqual([])
    expect(nested.manifest.fields.map((field) => field.path)).toEqual([
      "groups",
      "groups[].items",
      "groups[].items[].label",
      "groups[].name",
      "groups[].visible",
    ])
    expect(
      tableTexts(
        resolveTemplate(nested, {
          groups: [
            {
              visible: true,
              name: "A",
              items: [{ label: "one" }, { label: "two" }],
            },
            { visible: false, name: "B", items: [] },
          ],
        })
      )
    ).toEqual([[["A"]], [["- one"]], [["- two"]]])
  })

  test("rejects mixed marker rows, cross-cell blocks, unsafe row geometry, and table images", async () => {
    const mixed = await compileTemplate(
      documentWithTable([["{{#each rows}}", "visible"]])
    )
    expect(mixed.diagnostics[0]?.code).toBe("TEMPLATE_TABLE_ROW_MARKER_CONTENT")

    const crossCell = await compileTemplate(
      documentWithTable([["{{#if shown}}", "{{/if}}"]])
    )
    expect(
      crossCell.diagnostics.some(
        (diagnostic) => diagnostic.code === "TEMPLATE_TABLE_ROW_MARKER_CONTENT"
      )
    ).toBe(true)

    const mergedSource = documentWithTable([
      ["{{#each rows}}"],
      ["{{value}}"],
      ["{{/each}}"],
    ])
    const mergedTable = mergedSource.sections[0]?.blocks[0]
    const mergedSection = mergedSource.sections[0]
    if (mergedTable?.type !== "table" || mergedSection === undefined)
      throw new Error("Expected table")
    const merged = await compileTemplate({
      ...mergedSource,
      sections: [
        {
          ...mergedSection,
          blocks: [
            {
              ...mergedTable,
              rows: mergedTable.rows.map((row, index) =>
                index === 1
                  ? {
                      ...row,
                      cells: row.cells.map((cell) => ({
                        ...cell,
                        verticalMerge: "restart" as const,
                      })),
                    }
                  : row
              ),
            },
          ],
        },
      ],
    })
    expect(merged.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "TEMPLATE_TABLE_LOOP_VERTICAL_MERGE"
    )

    const headerSource = documentWithTable([
      ["{{#each rows}}"],
      ["{{value}}"],
      ["{{/each}}"],
    ])
    const headerTable = headerSource.sections[0]?.blocks[0]
    const headerSection = headerSource.sections[0]
    if (headerTable?.type !== "table" || headerSection === undefined)
      throw new Error("Expected table")
    const header = await compileTemplate({
      ...headerSource,
      sections: [
        {
          ...headerSection,
          blocks: [
            {
              ...headerTable,
              repeatHeaderRowCount: 1,
              rows: headerTable.rows.map((row, index) => ({
                ...row,
                repeatAsHeader: index === 0,
              })),
            },
          ],
        },
      ],
    })
    expect(header.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "TEMPLATE_TABLE_LOOP_HEADER"
    )

    const conditionalSource = documentWithTable([
      ["{{#if shown}}"],
      ["shown"],
      ["{{else}}"],
      ["hidden"],
      ["{{/if}}"],
    ])
    const conditionalTable = conditionalSource.sections[0]?.blocks[0]
    const conditionalSection = conditionalSource.sections[0]
    if (conditionalTable?.type !== "table" || conditionalSection === undefined)
      throw new Error("Expected table")
    const conditional = await compileTemplate({
      ...conditionalSource,
      sections: [
        {
          ...conditionalSection,
          blocks: [
            {
              ...conditionalTable,
              repeatHeaderRowCount: 2,
              rows: conditionalTable.rows.map((row, index) => ({
                ...row,
                repeatAsHeader: index < 2,
                cells: row.cells.map((cell) => ({
                  ...cell,
                  verticalMerge:
                    index === 3 ? ("restart" as const) : cell.verticalMerge,
                })),
              })),
            },
          ],
        },
      ],
    })
    expect(
      conditional.diagnostics.map((diagnostic) => diagnostic.code)
    ).toEqual(
      expect.arrayContaining([
        "TEMPLATE_TABLE_LOOP_HEADER",
        "TEMPLATE_TABLE_LOOP_VERTICAL_MERGE",
      ])
    )

    const image = await compileTemplate(
      documentWithTable([["{{image patient.photo}}"]])
    )
    expect(image.diagnostics[0]?.code).toBe("TEMPLATE_UNSUPPORTED_IMAGE_TAG")

    const nestedSource = documentWithTable([["outer"]])
    const outerTable = nestedSource.sections[0]?.blocks[0]
    const nestedSection = nestedSource.sections[0]
    if (outerTable?.type !== "table" || nestedSection === undefined)
      throw new Error("Expected table")
    const nestedDocument = {
      ...nestedSource,
      sections: [
        {
          ...nestedSection,
          blocks: [
            {
              ...outerTable,
              rows: outerTable.rows.map((row) => ({
                ...row,
                cells: row.cells.map((cell) => ({
                  ...cell,
                  blocks: [
                    outerTable,
                  ] as unknown as SemanticTable["rows"][number]["cells"][number]["blocks"],
                })),
              })),
            },
          ],
        },
      ],
    }
    const nestedTable = await compileTemplate(nestedDocument)
    expect(nestedTable.diagnostics[0]).toEqual(
      expect.objectContaining({
        code: "TEMPLATE_UNSUPPORTED_NESTED_TABLE",
        message: expect.stringContaining("content loss"),
      })
    )
  })

  test("enforces table-loop cancellation and expansion limits", async () => {
    const compiled = await compileTemplate(
      documentWithTable([["{{#each rows}}"], ["{{value}}"], ["{{/each}}"]])
    )
    const data = { rows: [{ value: "a" }, { value: "b" }] }
    expect(
      resolveTemplate(compiled, data, {
        limits: { maxLoopIterations: 1 },
      }).diagnostics.at(-1)?.code
    ).toBe("TEMPLATE_LOOP_LIMIT")
    expect(
      resolveTemplate(compiled, data, {
        limits: { maxExpandedNodes: 2 },
      }).diagnostics.at(-1)?.code
    ).toBe("TEMPLATE_EXPANDED_NODE_LIMIT")

    const controller = new AbortController()
    controller.abort()
    expect(() =>
      resolveTemplate(compiled, data, { signal: controller.signal })
    ).toThrow()
  })
})

function image(id: string): SemanticImage {
  return {
    type: "image",
    id: nodeId(id),
    source: {
      part: "word/document.xml",
      xmlPath: `/w:document/w:body/w:p[1]/w:r[${id}]`,
    },
    assetId: "asset-1",
    width: twips(720),
    height: twips(360),
    aspect: {
      pixelWidth: 200,
      pixelHeight: 100,
      intrinsicRatio: 2,
      preserve: true,
    },
  }
}

function pageField(id: string, field: "PAGE" | "NUMPAGES"): SemanticInline {
  return {
    type: "pageField",
    id: nodeId(id),
    source: {
      part: "word/footer1.xml",
      xmlPath: `/w:ftr/w:p[1]/w:fldSimple[${id}]`,
    },
    field,
    displayText: field === "PAGE" ? "1" : "2",
    format: "decimal",
    style,
  }
}

function documentWithInlines(
  inlines: readonly SemanticInline[]
): SemanticDocument {
  const source = documentWithRuns([""])
  const section = source.sections[0]
  const paragraph = section?.blocks[0]
  if (section === undefined || paragraph?.type !== "paragraph")
    throw new Error("fixture must contain a paragraph")
  return {
    ...source,
    sections: [{ ...section, blocks: [{ ...paragraph, children: inlines }] }],
  }
}

function headerFooter(
  type: "header" | "footer",
  id: string,
  blocks: readonly SemanticParagraph[]
): SemanticHeaderFooter {
  return {
    type,
    id,
    source: {
      part: `word/${type}1.xml`,
      xmlPath: type === "header" ? "/w:hdr" : "/w:ftr",
    },
    blocks,
  }
}

describe("Phase 6 static inlines and header/footer templates", () => {
  test("preserves text-image-text and PAGE/NUMPAGES in exact inline order", async () => {
    const source = documentWithInlines([
      text("Hello ", 0),
      image("logo"),
      text(" {{name:string}} p", 1),
      pageField("page", "PAGE"),
      text("/", 2),
      pageField("pages", "NUMPAGES"),
    ])
    const compiled = await compileTemplate(source)
    const result = resolveTemplate(compiled, { name: "Ada" })

    expect(compiled.diagnostics).toEqual([])
    if (!result.ok) throw new Error("Expected resolution to succeed")
    const block = result.value.sections[0]?.blocks[0]
    if (block?.type !== "paragraph") throw new Error("Expected paragraph")
    expect(
      block.children.map((child) =>
        child.type === "text"
          ? `text:${child.text}`
          : child.type === "image"
            ? `image:${child.assetId}`
            : child.type === "pageField"
              ? `field:${child.field}`
              : child.type === "break"
                ? `break:${child.kind}`
                : "tab"
      )
    ).toEqual([
      "text:Hello ",
      "image:asset-1",
      "text: ",
      "text:Ada",
      "text: p",
      "field:PAGE",
      "text:/",
      "field:NUMPAGES",
    ])
  })

  test("treats images and page fields as hard tag and block-marker barriers", async () => {
    for (const barrier of [image("barrier"), pageField("barrier", "PAGE")]) {
      const compiled = await compileTemplate(
        documentWithInlines([text("{{na", 0), barrier, text("me}}", 1)])
      )
      expect(compiled.diagnostics.map((item) => item.code)).toContain(
        "TEMPLATE_INLINE_BARRIER"
      )
      expect(compiled.manifest.fields).toEqual([])
    }

    const block = await compileTemplate(
      documentWithInlines([text("{{#if shown}}", 0), image("block-barrier")])
    )
    expect(block.diagnostics.map((item) => item.code)).toContain(
      "TEMPLATE_BLOCK_MARKER_PLACEMENT"
    )

    const tableSource = documentWithTable([["{{#if shown}}", ""]])
    const tableSection = tableSource.sections[0]
    const table = tableSection?.blocks[0]
    const row = table?.type === "table" ? table.rows[0] : undefined
    const markerCell = row?.cells[0]
    const imageCell = row?.cells[1]
    const imageParagraph = imageCell?.blocks[0]
    if (
      tableSection === undefined ||
      table?.type !== "table" ||
      row === undefined ||
      markerCell === undefined ||
      imageCell === undefined ||
      imageParagraph === undefined
    )
      throw new Error("fixture must contain a two-cell table row")
    const tableWithImage: SemanticDocument = {
      ...tableSource,
      sections: [
        {
          ...tableSection,
          blocks: [
            {
              ...table,
              rows: [
                {
                  ...row,
                  cells: [
                    markerCell,
                    {
                      ...imageCell,
                      blocks: [
                        { ...imageParagraph, children: [image("row-image")] },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }
    expect(
      (await compileTemplate(tableWithImage)).diagnostics.map(
        (item) => item.code
      )
    ).toContain("TEMPLATE_TABLE_ROW_MARKER_CONTENT")
  })

  test("clones repeated static inlines with deterministic occurrence IDs without mutation", async () => {
    const source = documentWithParagraphs([
      "{{#each rows}}",
      "value",
      "{{/each}}",
    ])
    const section = source.sections[0]
    const repeated = section?.blocks[1]
    if (section === undefined || repeated?.type !== "paragraph")
      throw new Error("fixture must contain repeated paragraph")
    const staticImage = image("repeat-logo")
    const staticField = pageField("repeat-page", "PAGE")
    const templated: SemanticDocument = {
      ...source,
      sections: [
        {
          ...section,
          blocks: [
            section.blocks[0] as SemanticParagraph,
            { ...repeated, children: [staticImage, staticField] },
            section.blocks[2] as SemanticParagraph,
          ],
        },
      ],
    }
    const before = JSON.stringify(templated)
    const compiled = await compileTemplate(templated)
    const first = resolveTemplate(compiled, { rows: [{}, {}] })
    const second = resolveTemplate(compiled, { rows: [{}, {}] })

    if (!first.ok || !second.ok) throw new Error("Expected successful repeats")
    const ids = first.value.sections[0]?.blocks.flatMap((block) =>
      block.type === "paragraph" ? block.children.map((child) => child.id) : []
    )
    expect(ids).toEqual([
      nodeId("repeat-logo~each-0"),
      nodeId("repeat-page~each-0"),
      nodeId("repeat-logo~each-1"),
      nodeId("repeat-page~each-1"),
    ])
    expect(second).toEqual(first)
    expect(JSON.stringify(templated)).toBe(before)
    expect(first.value.sections[0]?.blocks[0]).not.toBe(repeated)
    expect(
      first.value.sections[0]?.blocks[0]?.type === "paragraph"
        ? first.value.sections[0].blocks[0].children[0]
        : undefined
    ).not.toBe(staticImage)
  })

  test("counts static non-text inlines as nodes but never as expanded text bytes", async () => {
    const compiled = await compileTemplate(
      documentWithInlines([
        image("budget-image"),
        pageField("budget-page", "PAGE"),
      ])
    )
    expect(
      resolveTemplate(compiled, {}, { limits: { maxExpandedTextBytes: 0 } }).ok
    ).toBe(true)
    expect(
      resolveTemplate(
        compiled,
        {},
        { limits: { maxExpandedNodes: 2 } }
      ).diagnostics.at(-1)?.code
    ).toBe("TEMPLATE_EXPANDED_NODE_LIMIT")
  })

  test("compiles and resolves reusable header/footer values, formatters, blocks, and fields", async () => {
    const prototypes = documentWithParagraphs([
      "{{#if showHeader}}",
      "Patient {{patient.name | upper}}",
      "{{/if}}",
      "Page ",
    ])
    const section = prototypes.sections[0]
    if (section === undefined) throw new Error("fixture must contain a section")
    const paragraphs = section.blocks as readonly SemanticParagraph[]
    const header = headerFooter("header", "header-1", paragraphs.slice(0, 3))
    const footerParagraph = paragraphs[3]
    if (footerParagraph === undefined) throw new Error("fixture footer missing")
    const footer = headerFooter("footer", "footer-1", [
      {
        ...footerParagraph,
        children: [text("Page ", 0), pageField("footer-page", "PAGE")],
      },
    ])
    const source: SemanticDocument = {
      ...prototypes,
      headers: [header],
      footers: [footer],
      sections: [
        {
          ...section,
          defaultHeaderId: header.id,
          defaultFooterId: footer.id,
          blocks: [],
        },
        {
          ...section,
          id: nodeId("section-2"),
          defaultHeaderId: header.id,
          defaultFooterId: footer.id,
          blocks: [],
        },
      ],
    }
    const compiled = await compileTemplate(source)
    expect(compiled.manifest.fields.map((field) => field.path)).toEqual([
      "patient.name",
      "showHeader",
    ])
    const result = resolveTemplate(compiled, {
      showHeader: true,
      patient: { name: "Ada" },
    })
    if (!result.ok) throw new Error("Expected header/footer resolution")
    expect(result.value.headers).toHaveLength(1)
    expect(
      result.value.headers[0]?.blocks.map((block) =>
        block.children.map(inlineText).join("")
      )
    ).toEqual(["Patient ADA"])
    expect(
      result.value.footers[0]?.blocks[0]?.children.map((child) => child.type)
    ).toEqual(["text", "pageField"])
    expect(result.value.sections.map((item) => item.defaultHeaderId)).toEqual([
      "header-1",
      "header-1",
    ])

    const strict = resolveTemplate(compiled, { showHeader: true, patient: {} })
    expect(strict.ok).toBe(false)
    const permissive = resolveTemplate(
      compiled,
      { showHeader: true, patient: {} },
      { permissive: true }
    )
    expect(permissive.ok).toBe(true)
    expect(permissive.diagnostics[0]?.severity).toBe("warning")
  })

  test("diagnoses header/footer cross-container blocks while compiling canonical dynamic images", async () => {
    const source = documentWithParagraphs(["Body"])
    const section = source.sections[0]
    const paragraph = section?.blocks[0]
    if (section === undefined || paragraph?.type !== "paragraph")
      throw new Error("fixture must contain paragraph")
    const header = headerFooter("header", "header-bad", [
      { ...paragraph, children: [text("{{#if shown}}", 0)] },
    ])
    const compiled = await compileTemplate({
      ...source,
      headers: [header],
      footers: [
        headerFooter("footer", "footer-image", [
          { ...paragraph, children: [text("{{@image patient.photo}}", 1)] },
        ]),
      ],
    })
    expect(compiled.diagnostics.map((item) => item.code)).toEqual([
      "TEMPLATE_CROSS_CONTAINER_BLOCK",
    ])
    expect(compiled.manifest.fields).toEqual([
      expect.objectContaining({ path: "patient.photo", kind: "image" }),
      expect.objectContaining({ path: "shown", kind: "boolean" }),
    ])
  })

  test("resolves canonical dynamic image values into deterministic assets and inline placements", async () => {
    const compiled = await compileTemplate(
      documentWithRuns(["Before {{@image companyLogo}} after"])
    )
    expect(compiled.diagnostics).toEqual([])
    expect(compiled.manifest.fields[0]).toEqual(
      expect.objectContaining({ path: "companyLogo", kind: "image" })
    )
    expect(compiled.jsonSchema).toEqual(
      expect.objectContaining({
        properties: expect.objectContaining({
          companyLogo: expect.objectContaining({
            type: "object",
            required: [
              "mimeType",
              "bytes",
              "pixelWidth",
              "pixelHeight",
              "width",
              "height",
            ],
            additionalProperties: false,
          }),
        }),
      })
    )
    expect(compiled.starterData).toEqual({
      companyLogo: {
        mimeType: "image/png",
        bytes: [],
        pixelWidth: 1,
        pixelHeight: 1,
        width: 1,
        height: 1,
        preserveAspectRatio: true,
        altText: "",
      },
    })
    const value = {
      mimeType: "image/png",
      bytes: Uint8Array.of(1, 2, 3),
      pixelWidth: 200,
      pixelHeight: 100,
      width: 1000,
      height: 1000,
      altText: "Company logo",
    } as const
    const first = resolveTemplate(compiled, { companyLogo: value })
    const second = resolveTemplate(compiled, { companyLogo: value })
    expect(first).toEqual(second)
    expect(first.ok).toBe(true)
    if (!first.ok) throw new Error("image fixture must resolve")
    expect(first.value.assets).toEqual([
      expect.objectContaining({
        id: expect.stringContaining("template-image:"),
        bytes: [1, 2, 3],
        pixelWidth: 200,
        pixelHeight: 100,
      }),
    ])
    const block = first.value.sections[0]?.blocks[0]
    if (block?.type !== "paragraph") throw new Error("expected paragraph")
    expect(block.children.map((child) => child.type)).toEqual([
      "text",
      "image",
      "text",
    ])
    expect(block.children[1]).toEqual(
      expect.objectContaining({
        type: "image",
        width: 1000,
        height: 500,
        altText: "Company logo",
        aspect: expect.objectContaining({ preserve: true }),
      })
    )
  })

  test("honors cancellation while compiling header/footer templates", async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      compileTemplate(documentWithRuns(["Body"]), {
        signal: controller.signal,
      })
    ).rejects.toThrow()
  })
})
