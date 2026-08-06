import { describe, expect, test } from "bun:test"
import { documentHash } from "@apexmed/core"
import {
  serializeLayoutTrace,
  sha256Hex,
  validatePdfStructure,
} from "@apexmed/testkit"
import { strToU8, zipSync } from "fflate"

import { createDocxPdfEngine, EngineOperationError } from "../src"
import { buildPhase5TemplateTableDocx } from "./fixtures/phase5-table-docx"
import { buildPhase9GoldenDocx } from "./fixtures/phase9-golden-docx"
import { loadOfflineFontConfiguration } from "../../../scripts/offline-font-configuration"

const ZIP_TIME = new Date("1980-01-01T00:00:00.000Z")
const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
const REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
const OFFICE_REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
const RENDER_OPTIONS = {
  locale: "en-ZA",
  timeZone: "Africa/Johannesburg",
} as const

type SecurityManifest = Readonly<{
  schemaVersion: number
  provenance: Readonly<{
    license: string
    containsThirdPartyContent: boolean
    containsPersonalData: boolean
  }>
  fixtures: readonly Readonly<{
    file: string
    sha256: string
    kind: "rawDocumentXml" | "rootRelationships" | "archiveRecipes"
    expected: "reject"
    risk: string
  }>[]
}>

type ArchiveRecipes = Readonly<{
  unsafeEntryPaths: readonly string[]
  truncatedTailBytes: readonly number[]
}>

type RenderGolden = Readonly<{
  schemaVersion: number
  fixture: string
  fontCatalog: string
  fontRegistryHash: string
  pageCount: number
  searchableText: string
  pdfSha256: string
  traceSha256: string
  trace: string
}>

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

async function readFixtureText(relativePath: string): Promise<string> {
  return Bun.file(new URL(relativePath, import.meta.url)).text()
}

function orderedRelationshipXml(seed: number): string {
  const attributes = [
    `Id="rId1"`,
    `Type="${OFFICE_REL}"`,
    `Target="word/document.xml"`,
  ]
  const rotated = attributes.map(
    (_, index) => attributes[(index + seed) % attributes.length]
  )
  const gap = seed % 2 === 0 ? "\n  " : " "
  return (
    `<Relationships xmlns="${REL_NS}">${gap}` +
    `<Relationship ${rotated.join(gap)}/>${gap}</Relationships>`
  )
}

function deterministicTableBody(seed: number): string {
  const firstWidth = 900 + ((seed * 137) % 1700)
  const secondWidth = 4000 - firstWidth
  const rows = 8 + (seed % 9)
  const bodyRows = Array.from({ length: rows }, (_, row) => {
    const height = 280 + ((seed * 31 + row * 47) % 260)
    const words = 2 + ((seed + row) % 12)
    const text = Array.from(
      { length: words },
      (_, word) => `s${seed}r${row}w${word}`
    ).join(" ")
    return (
      `<w:tr><w:trPr><w:trHeight w:val="${height}" w:hRule="atLeast"/></w:trPr>` +
      `<w:tc><w:tcPr><w:tcW w:w="${firstWidth}" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:tc>` +
      `<w:tc><w:tcPr><w:tcW w:w="${secondWidth}" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>${row + 1}</w:t></w:r></w:p></w:tc></w:tr>`
    )
  }).join("")
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="4000" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr>` +
    `<w:tblGrid><w:gridCol w:w="${firstWidth}"/><w:gridCol w:w="${secondWidth}"/></w:tblGrid>` +
    bodyRows +
    `</w:tbl>`
  )
}

describe("Phase 9 deterministic hardening corpus", () => {
  test("canonical template tags survive a fixed seeded corpus of OOXML run fragmentation", async () => {
    const logical =
      'Patient {{patient.name | upper}} owes {{invoice.total:number | currency:"ZAR"}}.'
    const expectedText = "Patient AMARA owes R\u00a01\u00a0234,50."
    const data = { patient: { name: "Amara" }, invoice: { total: 1234.5 } }

    for (let seed = 1; seed <= 64; seed += 1) {
      const runs = seededChunks(logical, seed)
        .map((chunk) => `<w:r><w:t xml:space="preserve">${chunk}</w:t></w:r>`)
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

  test("executes the redistributable synthetic security corpus and its provenance manifest", async () => {
    const manifest = JSON.parse(
      await readFixtureText("./fixtures/security/manifest.json")
    ) as SecurityManifest
    expect(manifest.schemaVersion).toBe(1)
    expect(manifest.provenance).toMatchObject({
      license: "Apache-2.0",
      containsThirdPartyContent: false,
      containsPersonalData: false,
    })
    expect(manifest.fixtures.map(({ risk }) => risk)).toEqual([
      "malformed XML",
      "external entity declaration",
      "external relationship",
      "relationship traversal",
      "ambiguous package root",
      "unsafe entry paths and truncated archives",
    ])

    for (const fixture of manifest.fixtures) {
      expect(fixture.expected).toBe("reject")
      const fixtureText = await readFixtureText(
        `./fixtures/security/${fixture.file}`
      )
      expect(await sha256Hex(new TextEncoder().encode(fixtureText))).toBe(
        fixture.sha256
      )
      if (fixture.kind === "rawDocumentXml") {
        await expectCompileFailure(
          syntheticDocx(fixtureText, { rawDocument: true })
        )
      } else if (fixture.kind === "rootRelationships") {
        await expectCompileFailure(
          syntheticDocx("<w:p/>", {
            rootRelationships: fixtureText,
          })
        )
      } else {
        const recipes = JSON.parse(fixtureText) as ArchiveRecipes
        for (const path of recipes.unsafeEntryPaths) {
          await expectCompileFailure(
            syntheticDocx("<w:p/>", { extraParts: { [path]: "<x/>" } })
          )
        }
        const valid = syntheticDocx("<w:p><w:r><w:t>ok</w:t></w:r></w:p>")
        for (const count of recipes.truncatedTailBytes) {
          await expectCompileFailure(valid.slice(0, valid.length - count))
        }
      }
    }
  })

  test("keeps semantic output stable across deterministic XML attribute ordering and whitespace variants", async () => {
    const engine = await createDocxPdfEngine()
    let expectedPdf: Uint8Array | undefined
    let expectedTrace: string | undefined
    for (let seed = 0; seed < 12; seed += 1) {
      const whitespace = seed % 2 === 0 ? "\n    " : " "
      const body =
        `${whitespace}<w:p>${whitespace}<w:r><w:t xml:space="preserve">Ordering invariant</w:t></w:r>${whitespace}</w:p>` +
        `${whitespace}<w:p><w:r><w:t>Second paragraph</w:t></w:r></w:p>`
      const compiled = await engine.compile(
        syntheticDocx(body, {
          rootRelationships: orderedRelationshipXml(seed),
        })
      )
      const rendered = await engine.render(
        compiled,
        {},
        {
          ...RENDER_OPTIONS,
          includeLayoutTrace: true,
        }
      )
      const trace = serializeLayoutTrace(
        rendered.layoutTrace ??
          (() => {
            throw new Error("trace missing")
          })()
      )
      if (expectedPdf === undefined) {
        expectedPdf = rendered.pdf
        expectedTrace = trace
      } else {
        if (expectedTrace === undefined) {
          throw new Error("expected trace missing")
        }
        expect(rendered.pdf).toEqual(expectedPdf)
        expect(trace).toBe(expectedTrace)
      }
    }
  })

  test("renders deterministic long-string and page-break opportunity boundaries", async () => {
    const engine = await createDocxPdfEngine({ limits: { maxPages: 64 } })
    const lengths = [0, 1, 31, 64, 255, 1024, 4096]
    const compiled = await engine.compile(
      syntheticDocx(
        `<w:p><w:r><w:t>{{value:string}}</w:t></w:r></w:p>` +
          Array.from(
            { length: 18 },
            (_, index) =>
              `<w:p><w:pPr>${index % 3 === 0 ? "<w:pageBreakBefore/>" : ""}${index % 4 === 0 ? "<w:keepNext/>" : ""}</w:pPr><w:r><w:t>Break opportunity ${index + 1}</w:t></w:r></w:p>`
          ).join("")
      )
    )
    for (const length of lengths) {
      const value =
        length % 2 === 0
          ? "x".repeat(length)
          : Array.from({ length }, (_, index) =>
              index % 8 === 7 ? " " : "x"
            ).join("")
      const options = { ...RENDER_OPTIONS, includeLayoutTrace: true } as const
      const first = await engine.render(compiled, { value }, options)
      const second = await engine.render(compiled, { value }, options)
      expect(first.pdf).toEqual(second.pdf)
      expect(first.layoutTrace).toEqual(second.layoutTrace)
      expect(validatePdfStructure(first.pdf).valid).toBe(true)
    }
  })

  test("keeps seeded fixed-table geometry and fragmentation deterministic", async () => {
    for (let seed = 1; seed <= 16; seed += 1) {
      const engine = await createDocxPdfEngine()
      const compiled = await engine.compile(
        syntheticDocx(deterministicTableBody(seed))
      )
      const options = { ...RENDER_OPTIONS, includeLayoutTrace: true } as const
      const first = await engine.render(compiled, {}, options)
      const second = await engine.render(compiled, {}, options)
      expect(first.pdf).toEqual(second.pdf)
      expect(first.layoutTrace).toEqual(second.layoutTrace)
      expect(first.pageCount).toBeGreaterThan(0)
      expect(validatePdfStructure(first.pdf).valid).toBe(true)
    }
  })

  test("matches the stored deterministic PDF hash and complete layout-trace golden", async () => {
    const golden = JSON.parse(
      await readFixtureText("./goldens/phase9-render.golden.json")
    ) as RenderGolden
    const engine = await createDocxPdfEngine({
      fonts: await loadOfflineFontConfiguration(),
    })
    const compiled = await engine.compile(buildPhase9GoldenDocx())
    const rendered = await engine.render(
      compiled,
      { subject: "Apex" },
      { ...RENDER_OPTIONS, includeLayoutTrace: true }
    )
    const validation = validatePdfStructure(rendered.pdf)
    const trace = serializeLayoutTrace(
      rendered.layoutTrace ??
        (() => {
          throw new Error("trace missing")
        })()
    )

    expect(golden.schemaVersion).toBe(1)
    expect(golden.fixture).toBe("phase9-golden-docx")
    expect(golden.fontCatalog).toBe("apex-offline-ttf/v1")
    expect(engine.fontRegistryHash).toBe(documentHash(golden.fontRegistryHash))
    expect(rendered.pageCount).toBe(golden.pageCount)
    expect(validation.text).toBe(golden.searchableText)
    expect(await sha256Hex(rendered.pdf)).toBe(golden.pdfSha256)
    expect(await sha256Hex(new TextEncoder().encode(trace))).toBe(
      golden.traceSha256
    )
    expect(trace).toBe(golden.trace)
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
    await expect(pageLimited.render(pages, {}, RENDER_OPTIONS)).rejects.toThrow(
      "maximum of 2 pages"
    )
  })
})
