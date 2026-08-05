import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/docs/getting-started")({ component: GettingStarted })

function GettingStarted() {
  return (
    <article>
      <p className="font-mono text-xs tracking-widest text-brand uppercase">Getting started</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight">Compile once. Render many.</h1>
      <p className="mt-6 text-lg leading-8 text-muted-foreground">Install the umbrella engine package and register every font explicitly before compilation or rendering.</p>
      <pre className="mt-8 overflow-x-auto border bg-foreground p-6 font-mono text-[13px] leading-6 text-background"><code>{`bun add @apex-docx-pdf/engine

const engine = await createDocxPdfEngine({
  fallbackFont: "Noto Sans",
})

const compiled = await engine.compile(templateBytes)
const result = await engine.render(compiled, data, {
  locale: "en-ZA",
  timeZone: "Africa/Johannesburg",
})`}</code></pre>
      <p className="mt-6 leading-7 text-muted-foreground">The packages are private during initial development. Publishing begins only after the API, determinism, security, fixture, and benchmark gates are met.</p>
    </article>
  )
}
