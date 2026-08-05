import { strToU8, zipSync } from "../packages/engine/node_modules/fflate"

import { createDocxPdfEngine } from "../packages/engine/src"
import { buildPhase5TemplateTableDocx } from "../packages/engine/tests/fixtures/phase5-table-docx"

const SMOKE = Bun.argv.includes("--smoke")
const OUTPUT =
  Bun.argv.find((argument) => argument.startsWith("--output="))?.slice(9) ??
  "benchmarks/results/latest.json"
const ITERATIONS = SMOKE ? 1 : 5
const ZIP_TIME = new Date("1980-01-01T00:00:00.000Z")
const RENDER_OPTIONS = {
  locale: "en-ZA",
  timeZone: "Africa/Johannesburg",
} as const

type Sample = Readonly<{
  name: string
  iterations: number
  samplesMs: readonly number[]
  medianMs: number
  minMs: number
  maxMs: number
  outputBytes?: number
  pages?: number
}>

function percentile50(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

async function measure(
  name: string,
  iterations: number,
  operation: () => Promise<Readonly<{ outputBytes?: number; pages?: number }>>
): Promise<Sample> {
  const samples: number[] = []
  let output: Readonly<{ outputBytes?: number; pages?: number }> = {}
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const started = performance.now()
    output = await operation()
    samples.push(performance.now() - started)
  }
  return {
    name,
    iterations,
    samplesMs: samples.map((value) => Number(value.toFixed(3))),
    medianMs: Number(percentile50(samples).toFixed(3)),
    minMs: Number(Math.min(...samples).toFixed(3)),
    maxMs: Number(Math.max(...samples).toFixed(3)),
    ...output,
  }
}

function pagesDocx(pageCount: number): Uint8Array {
  const body = Array.from(
    { length: pageCount },
    (_, index) =>
      `<w:p>${index > 0 ? "<w:pPr><w:pageBreakBefore/></w:pPr>" : ""}` +
      `<w:r><w:t>Synthetic page ${index + 1}: {{title:string}}</w:t></w:r></w:p>`
  ).join("")
  return zipSync(
    {
      "[Content_Types].xml": strToU8(
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`
      ),
      "_rels/.rels": strToU8(
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
      ),
      "word/document.xml": strToU8(
        `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11907" w:h="16839"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`
      ),
    },
    { level: 6, mtime: ZIP_TIME }
  )
}

async function notoSansRegular(): Promise<Uint8Array> {
  const path = await Bun.resolve(
    "notosans-fontface/fonts/NotoSans-Regular.ttf",
    `${import.meta.dir}/../packages/engine`
  )
  return new Uint8Array(await Bun.file(path).arrayBuffer())
}

const samples: Sample[] = []
const onePage = pagesDocx(1)
samples.push(
  await measure("cold-engine-create", ITERATIONS, async () => {
    await createDocxPdfEngine()
    return {}
  })
)

const fontBytes = await notoSansRegular()
samples.push(
  await measure("cold-font-engine-create", ITERATIONS, async () => {
    await createDocxPdfEngine({
      fonts: {
        faces: [
          {
            family: "Noto Sans",
            weight: 400,
            style: "normal",
            bytes: fontBytes,
          },
        ],
        aliases: [{ from: "Calibri", to: "Noto Sans" }],
        fallbackFamily: "Noto Sans",
      },
    })
    return {}
  })
)

const engine = await createDocxPdfEngine()
samples.push(
  await measure("compile-one-page", ITERATIONS, async () => {
    const compiled = await engine.compile(onePage)
    return { outputBytes: JSON.stringify(compiled.manifest).length }
  })
)
const compiledOnePage = await engine.compile(onePage)
samples.push(
  await measure("repeated-render-one-page", SMOKE ? 2 : 20, async () => {
    const rendered = await engine.render(
      compiledOnePage,
      { title: "Apex deterministic benchmark" },
      RENDER_OPTIONS
    )
    return { outputBytes: rendered.pdf.length, pages: rendered.pageCount }
  })
)

for (const pageCount of SMOKE ? [1, 5] : [1, 20, 100]) {
  const source = pagesDocx(pageCount)
  samples.push(
    await measure(`compile-render-${pageCount}-page`, ITERATIONS, async () => {
      const compiled = await engine.compile(source)
      const rendered = await engine.render(
        compiled,
        { title: "Scalable synthetic case" },
        RENDER_OPTIONS
      )
      return { outputBytes: rendered.pdf.length, pages: rendered.pageCount }
    })
  )
}

const invoiceEngine = await createDocxPdfEngine({ limits: { maxPages: 1000 } })
const invoiceTemplate = await invoiceEngine.compile(
  buildPhase5TemplateTableDocx()
)
for (const invoiceRows of SMOKE ? [1, 50] : [1, 1000]) {
  samples.push(
    await measure(
      `render-invoice-${invoiceRows}-${invoiceRows === 1 ? "row" : "rows"}`,
      ITERATIONS,
      async () => {
        const rendered = await invoiceEngine.render(
          invoiceTemplate,
          {
            invoice: {
              items: Array.from({ length: invoiceRows }, (_, index) => ({
                name: `Synthetic licensed-free line ${index + 1}`,
                quantity: (index % 12) + 1,
              })),
            },
          },
          RENDER_OPTIONS
        )
        return { outputBytes: rendered.pdf.length, pages: rendered.pageCount }
      }
    )
  )
}

const peakRss = process.resourceUsage().maxRSS

const result = {
  schemaVersion: 1,
  measuredAt: new Date().toISOString(),
  runtime: `Bun ${Bun.version}`,
  platform: `${process.platform}-${process.arch}`,
  mode: SMOKE ? "smoke" : "full",
  note: "Observational baseline only; no regression budget is asserted.",
  processPeakRssBytes: peakRss * (process.platform === "darwin" ? 1 : 1024),
  samples,
}
await Bun.write(OUTPUT, `${JSON.stringify(result, null, 2)}\n`)
console.log(JSON.stringify(result, null, 2))
