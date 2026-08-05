import { createFileRoute } from "@tanstack/react-router"
import { Badge } from "@workspace/ui/components/badge"
import { buttonVariants } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { useState } from "react"

import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { DOCS_URL, docsPath } from "@/lib/site"
import {
  ENGINE_VERSION,
  type SupportStatus,
  supportMatrix,
  supportStatusLabel,
} from "@/lib/support-matrix"

export const Route = createFileRoute("/support")({
  component: SupportMatrixPage,
  head: () => ({
    meta: [
      {
        title: "Support matrix — Apex DOCX PDF",
      },
      {
        name: "description",
        content:
          "Compatibility matrix for the Apex DOCX PDF renderer: supported features, known limits, and explicit exclusions.",
      },
    ],
  }),
})

const filters = [
  { id: "all", label: "All" },
  { id: "supported", label: "Supported" },
  { id: "limited", label: "Limited" },
  { id: "unsupported", label: "Unsupported" },
  { id: "planned", label: "Planned" },
] as const

type FilterId = (typeof filters)[number]["id"]

function SupportMatrixPage() {
  const [filter, setFilter] = useState<FilterId>("all")

  const rows =
    filter === "all"
      ? supportMatrix
      : supportMatrix.filter((row) =>
          filter === "supported"
            ? row.status === "supported" || row.status === "testkit"
            : row.status === filter
        )

  const counts = {
    supported: supportMatrix.filter(
      (row) => row.status === "supported" || row.status === "testkit"
    ).length,
    limited: supportMatrix.filter((row) => row.status === "limited").length,
    unsupported: supportMatrix.filter((row) => row.status === "unsupported")
      .length,
    planned: supportMatrix.filter((row) => row.status === "planned").length,
  }

  return (
    <div className="min-h-svh overflow-x-clip">
      <SiteHeader />

      <main>
        <section className="relative border-b" aria-labelledby="support-title">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [mask-image:linear-gradient(to_bottom,black,transparent_80%)] bg-[size:48px_48px] opacity-30" />
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-5 sm:py-16 lg:px-8 lg:py-20">
            <Badge className="text-brand">Engine {ENGINE_VERSION}</Badge>
            <h1
              id="support-title"
              className="mt-5 max-w-3xl text-3xl font-semibold tracking-[-0.03em] text-balance sm:text-4xl md:text-5xl"
            >
              Support matrix
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              Apex renders a documented DOCX profile. Features common in Word
              are not assumed to be supported. A row is marked complete only
              when parser, layout, fixtures, and PDF output agree.
            </p>

            <dl className="mt-10 grid grid-cols-2 gap-px border bg-border sm:grid-cols-4">
              {(
                [
                  ["Supported", counts.supported],
                  ["Limited", counts.limited],
                  ["Unsupported", counts.unsupported],
                  ["Planned", counts.planned],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="bg-background px-4 py-5 sm:px-5">
                  <dt className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
                    {label}
                  </dt>
                  <dd className="mt-2 text-2xl font-semibold tracking-tight">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section
          className="mx-auto max-w-7xl px-4 py-10 sm:px-5 sm:py-12 lg:px-8"
          aria-labelledby="matrix-heading"
        >
          <div className="flex flex-col justify-between gap-6 border-b pb-8 sm:flex-row sm:items-end">
            <div>
              <h2
                id="matrix-heading"
                className="text-xl font-semibold tracking-tight sm:text-2xl"
              >
                Compatibility coverage
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                Use this matrix when designing templates. Treat diagnostics as
                part of the rendering contract—a successful PDF does not imply
                full Word fidelity.
              </p>
            </div>
            <a
              href={docsPath("supported-features")}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Full documentation
            </a>
          </div>

          <fieldset className="mt-6 border-0 p-0">
            <legend className="sr-only">Filter by status</legend>
            <div className="flex flex-wrap gap-2">
              {filters.map((item) => {
                const active = filter === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFilter(item.id)}
                    className={cn(
                      "min-h-11 border px-3 text-[11px] font-semibold tracking-widest uppercase transition-colors sm:min-h-10",
                      active
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-background text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                    )}
                  >
                    {item.label}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <p className="sr-only" aria-live="polite">
            Showing {rows.length} of {supportMatrix.length} support entries.
          </p>

          <div className="mt-8 hidden overflow-x-auto border md:block">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <caption className="sr-only">
                Apex DOCX PDF support matrix for engine {ENGINE_VERSION}
              </caption>
              <thead className="border-b bg-muted/40">
                <tr>
                  <th
                    scope="col"
                    className="px-4 py-3 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase sm:px-5"
                  >
                    Area
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase sm:px-5"
                  >
                    Status
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase sm:px-5"
                  >
                    Behavior
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.area}
                    className="border-b border-border/80 last:border-b-0"
                  >
                    <th
                      scope="row"
                      className="px-4 py-4 align-top font-medium text-foreground sm:px-5"
                    >
                      {row.area}
                    </th>
                    <td className="px-4 py-4 align-top whitespace-nowrap sm:px-5">
                      <StatusPill status={row.status} />
                    </td>
                    <td className="px-4 py-4 align-top leading-6 text-muted-foreground sm:px-5">
                      {row.behavior}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="mt-8 grid list-none gap-3 p-0 md:hidden">
            {rows.map((row) => (
              <li key={row.area} className="border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h3 className="max-w-[16rem] text-sm leading-6 font-semibold">
                    {row.area}
                  </h3>
                  <StatusPill status={row.status} />
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {row.behavior}
                </p>
              </li>
            ))}
          </ul>

          <aside className="mt-8 border bg-muted/25 p-5 sm:p-6">
            <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
              Evidence boundary
            </p>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
              Phase 7 implementation and focused tests establish this slice.
              They do not establish broad Microsoft Word fixture compatibility,
              complete Bun/Node/browser equivalence, production readiness, or
              full font and image-profile coverage. For authoring guidance and
              security constraints, see the documentation at{" "}
              <a
                className="text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
                href={DOCS_URL}
                target="_blank"
                rel="noreferrer"
              >
                {DOCS_URL.replace(/^https?:\/\//, "")}
              </a>
              .
            </p>
          </aside>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}

function StatusPill({ status }: { status: SupportStatus }) {
  return (
    <span
      className={cn(
        "inline-flex border px-2 py-1 text-[10px] font-semibold tracking-wider uppercase",
        status === "supported" || status === "testkit"
          ? "border-brand/30 bg-brand/10 text-brand"
          : status === "limited"
            ? "border-foreground/15 bg-muted text-foreground"
            : status === "planned"
              ? "border-border bg-background text-muted-foreground"
              : "border-border bg-background text-muted-foreground"
      )}
    >
      {supportStatusLabel[status]}
    </span>
  )
}
