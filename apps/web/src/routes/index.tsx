import {
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  CodeXmlIcon,
  File02Icon,
  Shield01Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link, createFileRoute } from "@tanstack/react-router"
import { Badge } from "@workspace/ui/components/badge"
import { buttonVariants } from "@workspace/ui/components/button"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { SiteHeader } from "@/components/site-header"

export const Route = createFileRoute("/")({ component: App })

function App() {
  return (
    <div className="min-h-svh overflow-x-clip">
      <SiteHeader />

      <main>
        <section className="relative border-b" aria-labelledby="hero-title">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:48px_48px] opacity-35 [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
          <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 py-20 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:py-28">
            <div className="max-w-3xl">
              <Badge className="mb-7 text-brand">Open-source TypeScript engine · Bun first</Badge>
              <h1 id="hero-title" className="text-5xl leading-[0.98] font-semibold tracking-[-0.045em] text-balance sm:text-6xl lg:text-7xl">
                Word-authored templates. Deterministic PDFs.
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
                Create templates in Word or Google Docs, populate them with typed data, and generate searchable PDFs in TypeScript—without LibreOffice, Chromium, or a conversion API.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link to="/playground" className={buttonVariants({ size: "lg" })}>
                  Try the playground
                  <HugeiconsIcon icon={ArrowRight01Icon} data-icon="inline-end" strokeWidth={2} />
                </Link>
                <Link to="/docs/getting-started" className={buttonVariants({ variant: "outline", size: "lg" })}>
                  Read the documentation
                </Link>
              </div>
              <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-sm text-muted-foreground" aria-label="Platform capabilities">
                {[
                  "Searchable text",
                  "Browser worker",
                  "Explicit support profile",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <HugeiconsIcon className="size-4 text-brand" icon={CheckmarkCircle02Icon} strokeWidth={2} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <ProductPreview />
          </div>
        </section>

        <section id="product" className="border-b bg-muted/25">
          <div className="mx-auto grid max-w-7xl gap-px border-x bg-border lg:grid-cols-4">
            {[
              ["No office binary", "The engine interprets the supported DOCX profile itself."],
              ["Compile once", "Reuse a compiled template for high-volume rendering."],
              ["Same code everywhere", "Bun, Node.js, and browser workers share one pipeline."],
              ["Honest diagnostics", "Unsupported content is visible, source-located, and actionable."],
            ].map(([title, description]) => (
              <div key={title} className="bg-background p-7">
                <p className="text-sm font-semibold">{title}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-24 lg:px-8" aria-labelledby="architecture-title">
          <div className="grid gap-12 lg:grid-cols-[0.75fr_1.25fr] lg:items-end">
            <div>
              <Badge variant="secondary">Architecture</Badge>
              <h2 id="architecture-title" className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
                Layout is the product—not a side effect.
              </h2>
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                Explicit intermediate representations make every parse, template, pagination, and drawing decision inspectable and testable.
              </p>
            </div>
            <Pipeline />
          </div>
        </section>

        <section className="border-y bg-foreground text-background">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 lg:grid-cols-2 lg:px-8">
            <div>
              <Badge className="text-background/65">Developer API</Badge>
              <h2 className="mt-5 text-3xl font-semibold tracking-tight">Inspect. Compile. Render.</h2>
              <p className="mt-4 max-w-xl leading-7 text-background/65">
                The high-level API keeps expensive compilation separate from repeat rendering and makes locale, timezone, fonts, and limits explicit.
              </p>
            </div>
            <pre className="overflow-x-auto border border-background/15 bg-background/5 p-6 font-mono text-[13px] leading-6 text-background/85" aria-label="Engine usage example"><code>{`const engine = await createDocxPdfEngine({
  fonts,
  fallbackFont: "Noto Sans",
})

const compiled = await engine.compile(docxBytes)
const result = await engine.render(compiled, data, {
  locale: "en-ZA",
  timeZone: "Africa/Johannesburg",
})

download(result.pdf)`}</code></pre>
          </div>
        </section>

        <section id="support" className="mx-auto max-w-7xl px-5 py-24 lg:px-8" aria-labelledby="feature-title">
          <div className="max-w-2xl">
            <Badge variant="secondary">Supported profile</Badge>
            <h2 id="feature-title" className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
              Broad enough for real documents. Narrow enough to trust.
            </h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              Support is shipped in measured slices. The matrix never labels a feature complete until fixtures, traces, and PDFs prove it.
            </p>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <Card key={feature.title} className="shadow-none transition-colors hover:bg-muted/30">
                <CardHeader>
                  <HugeiconsIcon className="mb-4 size-5 text-brand" icon={feature.icon} strokeWidth={1.8} />
                  <CardTitle className="text-base tracking-normal normal-case">{feature.title}</CardTitle>
                  <CardDescription>{feature.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        <section id="community" className="border-t bg-muted/30">
          <div className="mx-auto flex max-w-7xl flex-col justify-between gap-8 px-5 py-16 md:flex-row md:items-center lg:px-8">
            <div>
              <Badge variant="secondary">Built in the open</Badge>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight">See the decisions, tests, limitations, and roadmap.</h2>
              <p className="mt-2 text-muted-foreground">Apache-2.0 licensed. Contributions and adversarial fixtures welcome.</p>
            </div>
            <div className="flex gap-3">
              <Link to="/docs" className={buttonVariants({ variant: "outline" })}>Documentation</Link>
              <a href="https://github.com" target="_blank" rel="noreferrer" className={buttonVariants()}>GitHub repository</a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-6 px-5 py-9 text-sm text-muted-foreground sm:flex-row sm:items-center lg:px-8">
          <p>© 2026 Apex DOCX PDF. Determinism over guesswork.</p>
          <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Footer navigation">
            <Link to="/docs">Docs</Link>
            <a href="/#support">Support matrix</a>
            <a href="https://github.com" target="_blank" rel="noreferrer">GitHub</a>
            <Link to="/docs">Security</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}

const features = [
  { icon: SparklesIcon, title: "Typed placeholders", description: "Nested manifests, JSON Schema, starter data, strict validation, and safe resolution." },
  { icon: CodeXmlIcon, title: "Run-spanning tags", description: "Logical text mapping recognises placeholders even when Word fragments them across runs." },
  { icon: File02Icon, title: "Real pagination", description: "Integer layout units, measured line breaks, tables, sections, headers, footers, and traces." },
  { icon: Shield01Icon, title: "Untrusted-input limits", description: "ZIP, XML, expression, expansion, image, font, memory, and page limits are explicit." },
  { icon: CheckmarkCircle02Icon, title: "Deterministic output", description: "Stable ordering, metadata, rounding, font resources, display lists, and PDF objects." },
  { icon: ArrowRight01Icon, title: "Portable runtime", description: "Bun-first packages built from standard JavaScript and Web APIs for Node and browsers." },
] as const

function Pipeline() {
  return (
    <div className="grid border border-border bg-border sm:grid-cols-3 lg:grid-cols-6" aria-label="Document rendering pipeline">
      {["DOCX", "Parse", "Compile", "Resolve", "Layout", "PDF"].map((stage, index) => (
        <div key={stage} className="relative flex min-h-24 items-center justify-center bg-background px-3 text-center font-mono text-xs font-semibold tracking-widest uppercase not-last:border-b sm:not-last:border-r sm:not-last:border-b-0">
          <span className="absolute top-2 left-2 text-[9px] text-muted-foreground">0{index + 1}</span>
          {stage}
        </div>
      ))}
    </div>
  )
}

function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-2xl border bg-background p-2 shadow-2xl shadow-foreground/10">
      <div className="flex h-9 items-center justify-between border-b px-3">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          <span className="size-2 bg-foreground/20" />
          <span className="size-2 bg-foreground/20" />
          <span className="size-2 bg-brand" />
        </div>
        <span className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase">Playground · local worker</span>
      </div>
      <div className="grid min-h-[420px] md:grid-cols-[0.85fr_0.85fr_1.2fr]">
        <div className="border-b p-4 md:border-r md:border-b-0">
          <p className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase">01 Template</p>
          <div className="mt-4 space-y-2.5 text-[10px] leading-4">
            <div className="h-2 w-3/4 bg-foreground/12" />
            <div className="h-2 w-full bg-foreground/8" />
            <div className="h-2 w-5/6 bg-foreground/8" />
            <p className="mt-7 bg-brand/10 px-1.5 py-1 font-mono text-brand">{"{{patient.fullName}}"}</p>
            <div className="h-2 w-full bg-foreground/8" />
            <p className="bg-brand/10 px-1.5 py-1 font-mono text-brand">{"{{invoice.total:number}}"}</p>
          </div>
        </div>
        <div className="border-b p-4 md:border-r md:border-b-0">
          <p className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase">02 Data</p>
          <pre className="mt-4 font-mono text-[10px] leading-5 text-muted-foreground"><code>{`{
  "patient": {
    "fullName":
      "A. Mokoena"
  },
  "invoice": {
    "total": 1480
  }
}`}</code></pre>
        </div>
        <div className="bg-muted/30 p-5">
          <p className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase">03 Result · 1 page</p>
          <div className="mx-auto mt-4 aspect-[1/1.414] w-full max-w-[210px] bg-white p-5 text-neutral-900 shadow-lg ring-1 ring-black/10">
            <div className="h-2 w-12 bg-neutral-900" />
            <p className="mt-9 text-[7px] text-neutral-500 uppercase">Generated for</p>
            <p className="mt-1 text-[10px] font-semibold">A. Mokoena</p>
            <div className="mt-5 border-t border-neutral-200 pt-3">
              <div className="flex justify-between text-[7px]"><span>Professional services</span><span>R 1 480.00</span></div>
            </div>
            <div className="mt-3 h-px bg-neutral-900" />
            <div className="mt-3 flex justify-between text-[8px] font-semibold"><span>Total</span><span>R 1 480.00</span></div>
          </div>
        </div>
      </div>
    </div>
  )
}
