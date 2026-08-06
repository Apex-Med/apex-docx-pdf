import { ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link, createFileRoute } from "@tanstack/react-router"
import { buttonVariants } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { type CSSProperties, useState } from "react"

import { ApexLogo } from "@/components/apex-logo"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import {
  DOCS_URL,
  GITHUB_NEW_ISSUE_URL,
  GITHUB_URL,
  docsPath,
} from "@/lib/site"

export const Route = createFileRoute("/")({
  component: App,
  head: () => ({
    meta: [
      {
        title: "Apex DOCX PDF — Deterministic DOCX rendering in TypeScript",
      },
      {
        name: "description",
        content:
          "Compile a documented DOCX template profile, bind typed JSON, and render deterministic searchable PDFs with a portable TypeScript engine.",
      },
      {
        property: "og:title",
        content:
          "Apex DOCX PDF — Word and Google Docs templates to deterministic PDFs",
      },
      {
        property: "og:description",
        content:
          "A bounded, inspectable DOCX-to-PDF pipeline with explicit inputs, diagnostics, and searchable output.",
      },
      {
        name: "twitter:card",
        content: "summary_large_image",
      },
    ],
  }),
})

function App() {
  return (
    <div className="min-h-svh overflow-x-clip">
      <SiteHeader />

      <main>
        <section className="relative border-b" aria-labelledby="hero-title">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
          >
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,color-mix(in_oklch,var(--brand)_18%,transparent),transparent)]" />
            <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_70%_65%_at_50%_0%,black,transparent)] bg-[size:56px_56px] opacity-40" />
          </div>

          <div className="mx-auto max-w-7xl px-4 pt-14 pb-10 sm:px-5 sm:pt-20 sm:pb-14 lg:px-8 lg:pt-24">
            <div className="mx-auto max-w-3xl text-center">
              <div
                className="landing-reveal flex flex-col items-center gap-4"
                style={{ "--reveal-delay": "0ms" } as CSSProperties}
              >
                <ApexLogo className="size-12 text-foreground sm:size-14" />
                <p className="text-sm font-semibold tracking-[0.22em] text-foreground uppercase sm:text-base">
                  Apex DOCX PDF
                </p>
              </div>

              <h1
                id="hero-title"
                className="landing-reveal mt-8 text-4xl leading-[0.96] font-semibold tracking-[-0.05em] text-balance sm:mt-10 sm:text-5xl md:text-6xl lg:text-[4.25rem]"
                style={{ "--reveal-delay": "80ms" } as CSSProperties}
              >
                Word or Google Docs.
                <br />
                Deterministic PDFs.
              </h1>

              <p
                className="landing-reveal mx-auto mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:mt-7 sm:text-lg sm:leading-8"
                style={{ "--reveal-delay": "140ms" } as CSSProperties}
              >
                Create templates in Word or Google Docs, export DOCX, bind typed
                JSON, and produce searchable PDFs in TypeScript—without
                LibreOffice, Chromium, or a conversion service.
              </p>

              <div
                className="landing-reveal mt-9 flex flex-col items-stretch justify-center gap-3 sm:mt-10 sm:flex-row sm:items-center"
                style={{ "--reveal-delay": "200ms" } as CSSProperties}
              >
                <Link
                  to="/playground"
                  className={buttonVariants({ size: "lg" })}
                >
                  Open playground
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    data-icon="inline-end"
                    strokeWidth={2}
                  />
                </Link>
                <a
                  href={DOCS_URL}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonVariants({ variant: "outline", size: "lg" })}
                >
                  Documentation
                </a>
              </div>
            </div>
          </div>

          <div
            className="landing-reveal mx-auto max-w-7xl px-4 pb-12 sm:px-5 sm:pb-16 lg:px-8 lg:pb-20"
            style={{ "--reveal-delay": "260ms" } as CSSProperties}
          >
            <ProductStage />
          </div>
        </section>

        <section id="product" className="border-b" aria-labelledby="why-title">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-5 sm:py-20 lg:px-8 lg:py-24">
            <div className="max-w-2xl">
              <p className="text-[10px] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
                Why Apex
              </p>
              <h2
                id="why-title"
                className="mt-4 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
              >
                A renderer you can put in a CI pipeline.
              </h2>
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                Layout and PDF generation are owned by the engine—not by an
                opaque office binary. Determinism is defined by an explicit,
                documented input tuple.
              </p>
            </div>

            <ul className="mt-12 grid gap-px border bg-border sm:grid-cols-2 lg:grid-cols-4">
              {reasons.map((reason, index) => (
                <li key={reason.title} className="bg-background p-6 sm:p-7">
                  <p className="font-mono text-[10px] tracking-widest text-muted-foreground">
                    0{index + 1}
                  </p>
                  <p className="mt-4 text-sm font-semibold">{reason.title}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {reason.description}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-b" aria-labelledby="profile-title">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-5 sm:py-20 lg:px-8 lg:py-24">
            <div className="max-w-2xl">
              <p className="text-[10px] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
                Implemented profile
              </p>
              <h2
                id="profile-title"
                className="mt-4 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
              >
                The document features that business templates need.
              </h2>
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                Phase 7 is implemented and locally verified within the published
                support matrix. Production deployment remains future work.
              </p>
            </div>

            <ul className="mt-12 grid gap-px border bg-border sm:grid-cols-2 lg:grid-cols-4">
              {features.map((feature) => (
                <li key={feature.title} className="bg-background p-6 sm:p-7">
                  <p className="font-mono text-[10px] tracking-[0.18em] text-brand uppercase">
                    {feature.eyebrow}
                  </p>
                  <p className="mt-4 text-sm font-semibold">{feature.title}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {feature.description}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section
          className="border-b bg-muted/30"
          aria-labelledby="pipeline-title"
        >
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-5 sm:py-20 lg:px-8 lg:py-24">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-xl">
                <p className="text-[10px] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
                  Pipeline
                </p>
                <h2
                  id="pipeline-title"
                  className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl"
                >
                  Six stages. No hidden steps.
                </h2>
              </div>
              <div className="max-w-md lg:text-right">
                <p className="text-sm leading-6 text-muted-foreground">
                  Every stage emits a typed intermediate. Pagination, fonts, and
                  drawing decisions stay inspectable in tests and traces.
                </p>
                <a
                  className="mt-3 inline-flex min-h-8 items-center text-xs font-semibold text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
                  href={docsPath("architecture")}
                  target="_blank"
                  rel="noreferrer"
                >
                  Read the architecture notes
                </a>
              </div>
            </div>

            <ol
              className="mt-12 grid list-none gap-px border bg-border p-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
              aria-label="Document rendering pipeline"
            >
              {pipelineStages.map((stage, index) => (
                <li
                  key={stage.name}
                  className="group relative flex min-h-36 flex-col justify-between bg-background p-5 transition-colors hover:bg-muted/40"
                >
                  <span className="font-mono text-[10px] tracking-widest text-muted-foreground">
                    0{index + 1}
                  </span>
                  <div>
                    <p className="text-sm font-semibold tracking-wide uppercase">
                      {stage.name}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {stage.detail}
                    </p>
                  </div>
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 bg-brand transition-transform duration-300 group-hover:scale-x-100"
                  />
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-b" aria-labelledby="api-title">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-5 sm:py-20 lg:px-8 lg:py-24">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-xl">
                <p className="text-[10px] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
                  API
                </p>
                <h2
                  id="api-title"
                  className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl"
                >
                  Compile once. Render many times.
                </h2>
              </div>
              <p className="max-w-md text-sm leading-6 text-muted-foreground lg:text-right">
                Locale, time zone, fonts, and resource limits are call-site
                arguments—not ambient environment state.
              </p>
            </div>

            <div className="mt-12 overflow-hidden border">
              <div className="grid gap-px bg-border lg:grid-cols-[0.85fr_1.15fr]">
                <ol className="list-none space-y-0 bg-background p-0">
                  {apiSteps.map((step, index) => (
                    <li
                      key={step.name}
                      className="border-b p-6 last:border-b-0 sm:p-7"
                    >
                      <div className="flex items-baseline justify-between gap-4">
                        <p className="font-mono text-[10px] tracking-widest text-muted-foreground">
                          0{index + 1}
                        </p>
                        <p className="font-mono text-[10px] tracking-widest text-brand uppercase">
                          {step.runtime}
                        </p>
                      </div>
                      <p className="mt-4 font-mono text-sm font-semibold tracking-tight">
                        {step.name}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {step.description}
                      </p>
                    </li>
                  ))}
                </ol>

                <div className="bg-muted/35">
                  <div className="flex items-center justify-between border-b px-5 py-3.5">
                    <div>
                      <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                        usage
                      </p>
                      <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                        bun add @apex-docx-pdf/engine
                      </p>
                    </div>
                    <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                      TypeScript
                    </p>
                  </div>
                  <pre className="overflow-x-auto p-5 font-mono text-[12px] leading-7 sm:p-7 sm:text-[13px] sm:leading-8">
                    <code>
                      <span className="text-muted-foreground">const</span>
                      {" engine = "}
                      <span className="text-muted-foreground">await</span>
                      {" createDocxPdfEngine({\n  fonts,\n})\n\n"}
                      <span className="text-muted-foreground">const</span>
                      {" compiled = "}
                      <span className="text-muted-foreground">await</span>
                      {" engine.compile(docxBytes)\n\n"}
                      <span className="text-muted-foreground">const</span>
                      {" result = "}
                      <span className="text-muted-foreground">await</span>
                      {
                        ' engine.render(compiled, data, {\n  locale: "en-ZA",\n  timeZone: "Africa/Johannesburg",\n})\n\n'
                      }
                      <span className="text-brand">
                        {"// result.pdf — searchable, byte-stable"}
                      </span>
                    </code>
                  </pre>
                  <p className="border-t px-5 py-3 text-xs leading-5 text-muted-foreground sm:px-7">
                    Packages are private workspaces today. The install command
                    applies after the planned prerelease publication.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          id="support"
          className="border-b"
          aria-labelledby="close-title"
        >
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-5 sm:py-20 lg:px-8 lg:py-24">
            <div className="grid gap-px border bg-border lg:grid-cols-2">
              <div className="bg-background p-8 sm:p-10 lg:p-12">
                <p className="text-[10px] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
                  Compatibility
                </p>
                <h2
                  id="close-title"
                  className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl"
                >
                  A published support matrix.
                </h2>
                <p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-base">
                  Features are marked supported only when fixtures, layout
                  traces, and PDF output agree. Unsupported Word content is
                  diagnosed with a source location—not silently omitted.
                </p>
                <Link
                  to="/support"
                  className={cn(buttonVariants({ size: "lg" }), "mt-8")}
                >
                  View support matrix
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    data-icon="inline-end"
                    strokeWidth={2}
                  />
                </Link>
              </div>

              <div className="bg-muted/40 p-8 sm:p-10 lg:p-12">
                <p className="text-[10px] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
                  Open source
                </p>
                <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
                  Apache-2.0.
                </h2>
                <p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-base">
                  Architecture decisions, tests, limitations, and the roadmap
                  are public. Bug reports, focused pull requests, and
                  adversarial redistributable fixtures are welcome.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <a
                    href={DOCS_URL}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonVariants({
                      variant: "outline",
                      size: "lg",
                    })}
                  >
                    Documentation
                  </a>
                  <a
                    href={GITHUB_URL}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonVariants({ size: "lg" })}
                  >
                    GitHub
                  </a>
                  <a
                    href={GITHUB_NEW_ISSUE_URL}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonVariants({ variant: "ghost", size: "lg" })}
                  >
                    Report an issue
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />

      <style>{`
        .landing-reveal {
          --reveal-delay: 0ms;
          animation: landing-reveal 700ms cubic-bezier(0.22, 1, 0.36, 1) both;
          animation-delay: var(--reveal-delay);
        }

        @keyframes landing-reveal {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .landing-stage-pulse {
          animation: landing-stage-pulse 4.8s ease-in-out infinite;
        }

        @keyframes landing-stage-pulse {
          0%,
          100% {
            opacity: 0.55;
          }
          50% {
            opacity: 1;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .landing-reveal,
          .landing-stage-pulse {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}</style>
    </div>
  )
}

const reasons = [
  {
    title: "No office binary",
    description:
      "Interprets a documented OOXML profile directly. Nothing shells out to Word or LibreOffice.",
  },
  {
    title: "Byte-stable output",
    description:
      "Stable object ordering, fonts, and metadata. Re-render the same inputs and get the same PDF.",
  },
  {
    title: "One pipeline",
    description:
      "A Bun-first package graph with explicit Uint8Array boundaries for Node.js and browser-worker adapters.",
  },
  {
    title: "Known limits",
    description:
      "ZIP, XML, expression, image, font, and page ceilings are explicit—and enforced.",
  },
] as const

const features = [
  {
    eyebrow: "Template",
    title: "Placeholders and schema",
    description:
      "Extract nested typed placeholders into a manifest, Draft 2020-12 JSON Schema, and deterministic starter data.",
  },
  {
    eyebrow: "Template",
    title: "Loops and conditions",
    description:
      "Nested whole-paragraph conditions, optional else branches, and bounded each loops bind typed data.",
  },
  {
    eyebrow: "Tables",
    title: "Fixed-layout tables",
    description:
      "Deterministic grids, borders, merges, repeating headers, template rows, and row fragmentation continue across pages.",
  },
  {
    eyebrow: "Numbering",
    title: "Legal numbering",
    description:
      "Relationship-owned DOCX numbering preserves deterministic multilevel list labels and counters.",
  },
  {
    eyebrow: "Typography",
    title: "Embedded fonts",
    description:
      "Caller-supplied TrueType programs are shaped and embedded without system-font discovery or network fetches.",
  },
  {
    eyebrow: "Browser",
    title: "Worker rendering",
    description:
      "The browser adapter compiles and renders in a module worker so document work stays off the UI thread.",
  },
  {
    eyebrow: "Pages",
    title: "Headers and footers",
    description:
      "Inherited default headers and footers repeat with supported template values and decimal page fields.",
  },
  {
    eyebrow: "Inspection",
    title: "Source-linked diagnostics",
    description:
      "Warnings and errors carry stable codes and, where available, DOCX source locations and node IDs.",
  },
  {
    eyebrow: "Hosting",
    title: "Vercel-friendly boundaries",
    description:
      "Browser-worker rendering and direct storage seams avoid buffering document bytes in a server function; deployment is not yet verified.",
  },
  {
    eyebrow: "Output",
    title: "Searchable PDFs",
    description:
      "Deterministic display lists become searchable PDF bytes with explicit metadata and optional layout traces.",
  },
] as const

const pipelineStages = [
  { name: "DOCX", detail: "Validate the package and relationships." },
  { name: "Parse", detail: "Build a typed semantic document." },
  { name: "Compile", detail: "Bind placeholders and control flow." },
  { name: "Resolve", detail: "Apply data with locale context." },
  { name: "Layout", detail: "Paginate with integer twips." },
  { name: "PDF", detail: "Emit searchable page content." },
] as const

const apiSteps = [
  {
    name: "createDocxPdfEngine()",
    runtime: "once",
    description:
      "Configure explicit fonts and limits. Runtime adapters pass the same bounded byte-oriented inputs into the engine.",
  },
  {
    name: "engine.compile()",
    runtime: "once / template",
    description:
      "Parse and compile the DOCX template into a reusable artifact for high-volume rendering.",
  },
  {
    name: "engine.render()",
    runtime: "per document",
    description:
      "Bind typed data with an explicit locale and time zone, then emit a searchable PDF.",
  },
] as const

function ProductStage() {
  const [sampleId, setSampleId] = useState<SampleId>("invoice")
  const sample = productSamples[sampleId]

  return (
    <div className="overflow-hidden border bg-background shadow-[0_24px_80px_-32px] shadow-foreground/25">
      <div className="flex h-10 items-center justify-between border-b bg-muted/40 px-4">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          <span className="size-2 bg-foreground/15" />
          <span className="size-2 bg-foreground/15" />
          <span className="size-2 bg-brand" />
        </div>
        <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
          playground · local worker
        </p>
        <p className="hidden font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase sm:block">
          compile → render
        </p>
      </div>

      <div className="flex flex-col justify-between gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:px-5">
        <p className="text-xs text-muted-foreground">
          Choose an example to inspect the template, data, and output together.
        </p>
        <fieldset className="grid grid-cols-3 border bg-border">
          <legend className="sr-only">Example document</legend>
          {productSampleIds.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={sampleId === id}
              onClick={() => setSampleId(id)}
              className={cn(
                "min-h-11 bg-background px-3 text-[10px] font-semibold tracking-wider uppercase transition-colors focus-visible:z-10 sm:min-h-9",
                sampleId === id
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {productSamples[id].label}
            </button>
          ))}
        </fieldset>
      </div>

      <div className="grid lg:grid-cols-[1fr_1fr_1.15fr]" aria-live="polite">
        <div className="border-b p-5 sm:p-6 lg:border-r lg:border-b-0">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
              Template
            </p>
            <p className="font-mono text-[10px] tracking-widest text-brand uppercase">
              .docx
            </p>
          </div>
          <div className="mt-6 space-y-3">
            <div className="h-2 w-2/3 bg-foreground/12" />
            <div className="h-2 w-full bg-foreground/8" />
            <div className="h-2 w-5/6 bg-foreground/8" />
            <div className="landing-stage-pulse mt-8 border border-brand/25 bg-brand/8 px-2.5 py-2 font-mono text-[11px] text-brand sm:text-xs">
              {sample.templatePrimary}
            </div>
            <div className="h-2 w-full bg-foreground/8" />
            <div className="landing-stage-pulse border border-brand/25 bg-brand/8 px-2.5 py-2 font-mono text-[11px] text-brand sm:text-xs">
              {sample.templateSecondary}
            </div>
            <div className="h-2 w-3/4 bg-foreground/8" />
          </div>
        </div>

        <div className="border-b p-5 sm:p-6 lg:border-r lg:border-b-0">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
              Data
            </p>
            <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
              JSON
            </p>
          </div>
          <pre className="mt-6 overflow-x-auto font-mono text-[11px] leading-6 text-muted-foreground sm:text-xs sm:leading-7">
            <code>{sample.data}</code>
          </pre>
        </div>

        <div className="bg-muted/35 p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
              Output
            </p>
            <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
              {sample.outputMeta}
            </p>
          </div>
          <div className="mx-auto mt-6 aspect-[1/1.414] w-full max-w-[240px] bg-white p-6 text-neutral-900 shadow-[0_18px_50px_-20px_rgba(0,0,0,0.45)] ring-1 ring-black/8">
            <div className="flex items-center justify-between">
              <div className="h-2 w-14 bg-neutral-900" />
              <p className="text-[8px] tracking-wider text-neutral-400 uppercase">
                {sample.documentType}
              </p>
            </div>
            <p className="mt-10 text-[8px] tracking-wider text-neutral-400 uppercase">
              {sample.fieldLabel}
            </p>
            <p className="mt-1.5 text-[12px] font-semibold tracking-tight">
              {sample.primaryValue}
            </p>
            <div className="mt-8 border-t border-neutral-200 pt-4">
              <div className="flex justify-between text-[9px] text-neutral-600">
                <span>{sample.lineLabel}</span>
                <span>{sample.lineValue}</span>
              </div>
              <div className="mt-3 flex justify-between text-[9px] text-neutral-600">
                <span>{sample.secondaryLineLabel}</span>
                <span>{sample.secondaryLineValue}</span>
              </div>
            </div>
            <div className="mt-5 h-px bg-neutral-900" />
            <div className="mt-4 flex justify-between text-[11px] font-semibold">
              <span>{sample.totalLabel}</span>
              <span>{sample.totalValue}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const productSamples = {
  invoice: {
    label: "Invoice",
    templatePrimary: "{{client.legalName}}",
    templateSecondary: '{{invoice.total:number | currency:"ZAR"}}',
    data: `{
  "client": { "legalName": "Mokoena & Associates" },
  "invoice": { "total": 1480 }
}`,
    outputMeta: "1 page · searchable",
    documentType: "Invoice",
    fieldLabel: "Bill to",
    primaryValue: "Mokoena & Associates",
    lineLabel: "Professional services",
    lineValue: "R 1 480.00",
    secondaryLineLabel: "Disbursements",
    secondaryLineValue: "R 0.00",
    totalLabel: "Total due",
    totalValue: "R 1 480.00",
  },
  letter: {
    label: "Letter",
    templatePrimary: "{{recipient.name:string}}",
    templateSecondary: '{{issuedAt:date | date:"dd-MM-yyyy HH:mm"}}',
    data: `{
  "recipient": { "name": "Dr N. Mokoena" },
  "issuedAt": "2026-08-05T09:30:00+02:00"
}`,
    outputMeta: "1 page · searchable",
    documentType: "Letter",
    fieldLabel: "Prepared for",
    primaryValue: "Dr N. Mokoena",
    lineLabel: "Issued",
    lineValue: "5 August 2026",
    secondaryLineLabel: "Reference",
    secondaryLineValue: "APX-1042",
    totalLabel: "Status",
    totalValue: "Final",
  },
  report: {
    label: "Report",
    templatePrimary: "{{report.title:string | upper}}",
    templateSecondary: "{{#each report.findings}} … {{/each}}",
    data: `{
  "report": {
    "title": "Site assessment",
    "findings": [{ "label": "Ventilation", "status": "Pass" }]
  }
}`,
    outputMeta: "2 pages · searchable",
    documentType: "Report",
    fieldLabel: "Assessment",
    primaryValue: "SITE ASSESSMENT",
    lineLabel: "Ventilation",
    lineValue: "Pass",
    secondaryLineLabel: "Emergency lighting",
    secondaryLineValue: "Review",
    totalLabel: "Findings",
    totalValue: "2",
  },
} as const

type SampleId = keyof typeof productSamples
const productSampleIds = Object.keys(productSamples) as SampleId[]
