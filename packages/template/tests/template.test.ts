import { describe, expect, test } from "bun:test"
import {
  nodeId,
  twips,
  type SemanticDocument,
  type SemanticText,
} from "@apex-docx-pdf/core"

import { compileTemplate, resolveTemplate } from "../src"

const style = {
  fontFamily: "Aptos",
  fontSize: twips(220),
  fontWeight: 400,
  fontStyle: "normal",
  underline: false,
  color: "000000",
} as const

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
    numberingDefinitions: [],
    sections: [
      {
        type: "section",
        id: nodeId("section"),
        source: { part: "word/document.xml", xmlPath: "/w:document/w:body" },
        properties: {
          pageWidth: twips(11906),
          pageHeight: twips(16838),
          margins: {
            top: twips(1440),
            right: twips(1440),
            bottom: twips(1440),
            left: twips(1440),
          },
        },
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

function resolvedText(result: ReturnType<typeof resolveTemplate>): string {
  if (!result.ok) throw new Error("Expected resolution to succeed")
  return (
    result.value.sections[0]?.blocks[0]?.children
      .map((child) => child.text)
      .join("") ?? ""
  )
}

describe("Phase 1 template compilation", () => {
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
    if (block === undefined)
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
    const children = result.value.sections[0]?.blocks[0]?.children ?? []
    const value = children.find((child) => child.text === "Ada Lovelace")
    expect(value?.style.fontWeight).toBe(400)
    expect(value?.source).toEqual(
      source.sections[0]?.blocks[0]?.children[0]?.source
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
      "TEMPLATE_UNSUPPORTED_BLOCK_TAG",
      "TEMPLATE_UNSUPPORTED_BLOCK_TAG",
      "TEMPLATE_UNSUPPORTED_IMAGE_TAG",
      "TEMPLATE_UNSAFE_PATH",
      "TEMPLATE_MALFORMED_TAG",
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

describe("Phase 1 template resolution", () => {
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
