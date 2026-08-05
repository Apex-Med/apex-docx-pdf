import { describe, expect, test } from "bun:test"
import { validatePdfStructure } from "@apex-docx-pdf/testkit"
import { strToU8, zipSync } from "fflate"

import { createDocxPdfEngine, EngineOperationError } from "../src"
import { buildPhase5TemplateTableDocx } from "./fixtures/phase5-table-docx"

const ZIP_TIME = new Date("1980-01-01T00:00:00.000Z")
const WORD_NS =
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
const REL_NS =
  "http://schemas.openxmlformats.org/package/2006/relationships"
const OFFICE_REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
const RENDER_OPTIONS = {
  locale: "en-ZA",
  timeZone: "Africa/Johannesburg",
} as const

function seededChunks(value: string, seed: number): string[] {
  const chunks: string[] = []
  let state = seed >>> 0
  let cursor = 0
  while (cursor < value.length) {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    const size = 1 + ((state >>> 0) % 9)
    chunks.push(value.slice(cursor, cursor + size))
    cursor += size
  }
  return chunks
}

function documentXml(body: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<w:document xmlns:w="${WORD_NS}"><w:body>${body}` +
    `<w:sectPr><w:pgSz w:w="11907" w:h="16839"/>` +
    `<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>` +
    `</w:sectPr></w:body></w:document>`
  )
}

function syntheticDocx(
  body: string,
  options: Readonly<{
    rootRelationships?: string
    extraParts?: Readonly<Record<string, string>>
    rawDocument?: boolean
  }> = {}
): Uint8Array {
  const relationships =
    options.rootRelationships ??
    `<Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="${OFFICE_REL}" Target="word/document.xml"/></Relationships>`
  const parts: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
        `</Types>`
    ),
    "_rels/.rels": strToU8(relationships),
    "word/document.xml": strToU8(
      options.rawDocument ? body : documentXml(body)
    ),
  }
  for (const [name, value] of Object.entries(options.extraParts ?? {})) {
    parts[name] = strToU8(value)
  }
  return zipSync(parts, { level: 6, mtime: ZIP_TIME })
}

async function expectCompileFailure(bytes: Uint8Array): Promise<void> {
  const engine = await createDocxPdfEngine()
  try {
    await engine.compile(bytes)
    throw new Error("Expected hostile synthetic DOCX to fail")
  } catch (error) {
    expect(error).toBeInstanceOf(EngineOperationError)
    expect((error as EngineOperationError).diagnostics.length).toBeGreaterThan(
      0
    )
  }
}

describe("Phase 9 deterministic hardening corpus", () => {
  test("canonical template tags survive a fixed seeded corpus of OOXML run fragmentation", async () => {
    const logical =
      'Patient {{patient.name | upper}} owes {{invoice.total:number | currency:"ZAR"}}.'
    const expectedText = "Patient AMARA owes R\u00a01\u00a0234,50."
    const data = { patient: { name: "Amara" }, invoice: { total: 1234.5 } }

    for (let seed = 1; seed <= 64; seed += 1) {
      const runs = seededChunks(logical, seed)
        .map(
          (chunk) =>
            `<w:r><w:t xml:space="preserve">${chunk}</w:t></w:r>`
        )
        .join("")
      const engine = await createDocxPdfEngine()
      const compiled = await engine.compile(syntheticDocx(`<w:p>${runs}</w:p>`))
      const rendered = await engine.render(compiled, data, RENDER_OPTIONS)
      const validation = validatePdfStructure(rendered.pdf)

      expect(compiled.diagnostics).toEqual([])
      expect(validation.valid).toBe(true)
      expect(validation.text).toBe(expectedText)
      expect(rendered.pageCount).toBe(1)
    }
  })

  test("rejects malformed XML, external/traversing relationships, unsafe archive paths, and truncated archives", async () => {
    const hostilePackages = [
      syntheticDocx(`<w:document xmlns:w="${WORD_NS}"><w:body><w:p>`, {
        rawDocument: true,
      }),
      syntheticDocx("<w:p/>", {
        rootRelationships: `<Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="${OFFICE_REL}" Target="https://example.invalid/template.xml" TargetMode="External"/></Relationships>`,
      }),
      syntheticDocx("<w:p/>", {
        rootRelationships: `<Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="${OFFICE_REL}" Target="../outside.xml"/></Relationships>`,
      }),
      syntheticDocx("<w:p/>", { extraParts: { "../escape.xml": "<x/>" } }),
    ]
    const valid = syntheticDocx("<w:p><w:r><w:t>ok</w:t></w:r></w:p>")
    hostilePackages.push(valid.slice(0, Math.max(1, valid.length - 23)))

    for (const bytes of hostilePackages) await expectCompileFailure(bytes)
  })

  test("enforces archive, JSON text, loop/table, and page ceilings at small deterministic thresholds", async () => {
    const archiveLimited = await createDocxPdfEngine({
      limits: { maxArchiveEntries: 3 },
    })
    await expect(
      archiveLimited.compile(
        syntheticDocx("<w:p/>", { extraParts: { "custom/item.xml": "<x/>" } })
      )
    ).rejects.toBeInstanceOf(EngineOperationError)

    const textLimited = await createDocxPdfEngine({
      limits: { maxJsonTextBytes: 16 },
    })
    const textTemplate = await textLimited.compile(
      syntheticDocx("<w:p><w:r><w:t>{{value:string}}</w:t></w:r></w:p>")
    )
    try {
      await textLimited.render(
        textTemplate,
        { value: "x".repeat(17) },
        RENDER_OPTIONS
      )
      throw new Error("Expected bounded JSON cloning to reject long text")
    } catch (error) {
      expect(error).toBeInstanceOf(EngineOperationError)
      expect((error as EngineOperationError).code).toBe("engine/template-data")
      expect(
        (error as EngineOperationError).diagnostics.map(({ code }) => code)
      ).toContain("ENGINE_TEMPLATE_DATA_INVALID")
    }

    const loopLimited = await createDocxPdfEngine({
      limits: { maxLoopIterations: 8 },
    })
    const invoice = await loopLimited.compile(buildPhase5TemplateTableDocx())
    await expect(
      loopLimited.render(
        invoice,
        {
          invoice: {
            items: Array.from({ length: 9 }, (_, index) => ({
              name: `Synthetic item ${index}`,
              quantity: index + 1,
            })),
          },
        },
        RENDER_OPTIONS
      )
    ).rejects.toBeInstanceOf(EngineOperationError)

    const pageLimited = await createDocxPdfEngine({ limits: { maxPages: 2 } })
    const pages = await pageLimited.compile(
      syntheticDocx(
        Array.from(
          { length: 80 },
          (_, index) =>
            `<w:p><w:r><w:t>Bounded paragraph ${index + 1} ${"content ".repeat(20)}</w:t></w:r></w:p>`
        ).join("")
      )
    )
    await expect(
      pageLimited.render(pages, {}, RENDER_OPTIONS)
    ).rejects.toThrow("maximum of 2 pages")
  })
})
