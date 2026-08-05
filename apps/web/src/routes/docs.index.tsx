import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/docs/")({ component: DocsOverview })

function DocsOverview() {
  return (
    <article className="prose-docs">
      <p className="font-mono text-xs tracking-widest text-brand uppercase">Overview</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight">A deterministic renderer for a supported DOCX profile.</h1>
      <p className="mt-6 text-lg leading-8 text-muted-foreground">
        Apex DOCX PDF lets non-technical authors use Microsoft Word or Google Docs as their template editor while developers keep rendering local, typed, inspectable, and portable.
      </p>
      <h2 className="mt-12 text-2xl font-semibold">The contract</h2>
      <p className="mt-4 leading-7 text-muted-foreground">
        Given the same supported template, data, font bytes, engine version, locale, timezone, and options, the engine produces the same layout. Unsupported meaningful content is reported rather than silently discarded.
      </p>
      <div className="mt-8 border bg-muted/30 p-6 font-mono text-sm leading-7">
        DOCX → Parse → Compile → Resolve → Layout → PDF
      </div>
      <h2 className="mt-12 text-2xl font-semibold">Current status</h2>
      <p className="mt-4 leading-7 text-muted-foreground">
        The project is in an early prerelease phase. The support matrix is deliberately conservative while the vertical slice, security limits, and deterministic fixtures are established.
      </p>
    </article>
  )
}
