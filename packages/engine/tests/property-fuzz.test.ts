import { describe, expect, test } from "bun:test"
import { buildMinimalDocx, validatePdfStructure } from "@apexmed/testkit"
import fc from "fast-check"

import { createDocxPdfEngine, EngineOperationError } from "../src"

const FUZZ_SEED = 0x0a9e_2026
const RENDER_OPTIONS = {
  locale: "en-ZA",
  timeZone: "Africa/Johannesburg",
} as const

describe("seeded property and fuzz boundaries", () => {
  test("preserves a logical template across arbitrary Word run boundaries", async () => {
    const logical =
      'Patient {{patient.name | upper}} owes {{invoice.total:number | currency:"ZAR"}}.'
    const boundaries = Array.from(
      { length: logical.length - 1 },
      (_, index) => index + 1
    )
    const engine = await createDocxPdfEngine()

    await fc.assert(
      fc.asyncProperty(fc.subarray(boundaries), async (splitPoints) => {
        const runs = splitAt(logical, splitPoints)
        const compiled = await engine.compile(
          buildMinimalDocx({ paragraphs: [{ runs }] })
        )
        const rendered = await engine.render(
          compiled,
          { patient: { name: "Amara" }, invoice: { total: 1234.5 } },
          RENDER_OPTIONS
        )
        const validation = validatePdfStructure(rendered.pdf)

        expect(compiled.manifest.fields.map(({ path }) => path)).toEqual([
          "invoice.total",
          "patient.name",
        ])
        expect(validation.valid).toBe(true)
        expect(validation.text).toBe("Patient AMARA owes R\u00a01\u00a0234,50.")
      }),
      {
        seed: FUZZ_SEED,
        numRuns: 256,
        endOnFailure: true,
      }
    )
  })

  test("rejects reserved prototype segments at arbitrary path positions", async () => {
    const engine = await createDocxPdfEngine()
    const pathArbitrary = fc
      .tuple(
        fc.constantFrom("__proto__", "prototype", "constructor"),
        fc.constantFrom("", "root.", "root.safe."),
        fc.constantFrom("", ".value", ".nested.value")
      )
      .map(([reserved, prefix, suffix]) => `${prefix}${reserved}${suffix}`)

    await fc.assert(
      fc.asyncProperty(pathArbitrary, async (path) => {
        try {
          await engine.compile(
            buildMinimalDocx({ paragraphs: [`{{${path}:string}}`] })
          )
          return false
        } catch (error) {
          return (
            error instanceof EngineOperationError &&
            error.diagnostics.some(
              ({ code }) => code === "TEMPLATE_UNSAFE_PATH"
            )
          )
        }
      }),
      {
        seed: FUZZ_SEED ^ 0x5afe,
        numRuns: 128,
        endOnFailure: true,
      }
    )
  })
})

function splitAt(value: string, points: readonly number[]): string[] {
  const sorted = [...new Set(points)].sort((left, right) => left - right)
  const boundaries = [0, ...sorted, value.length]
  return boundaries.slice(1).map((end, index) => {
    const start = boundaries[index]
    if (start === undefined) throw new Error("Missing split boundary")
    return value.slice(start, end)
  })
}
