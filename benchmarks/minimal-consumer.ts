import { createDocxPdfEngine } from "../packages/apex-docx-pdf/src"

export async function renderDocx(
  docx: Uint8Array,
  data: Readonly<Record<string, unknown>>
): Promise<Uint8Array> {
  const engine = await createDocxPdfEngine()
  const template = await engine.compile(docx)
  const rendered = await engine.render(template, data, {
    locale: "en-ZA",
    timeZone: "Africa/Johannesburg",
  })
  return rendered.pdf
}
