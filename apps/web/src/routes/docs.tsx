import { ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { createFileRoute } from "@tanstack/react-router"
import { Badge } from "@workspace/ui/components/badge"
import { buttonVariants } from "@workspace/ui/components/button"

import { SiteHeader } from "@/components/site-header"

export const Route = createFileRoute("/docs")({ component: DocsLayout })

function DocsLayout() {
  const documentationUrl =
    import.meta.env.VITE_DOCS_URL ?? "http://localhost:3001"

  return (
    <div className="min-h-svh">
      <SiteHeader />
      <main className="mx-auto grid min-h-[calc(100svh-4rem)] max-w-7xl place-items-center px-5 py-16 lg:px-8">
        <div className="max-w-2xl border bg-background p-8 shadow-xl shadow-foreground/5 sm:p-12">
          <Badge className="text-brand">Mintlify documentation</Badge>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight">
            The documentation lives in its own Mintlify workspace.
          </h1>
          <p className="mt-5 text-base leading-7 text-muted-foreground">
            Run the docs locally with{" "}
            <code className="bg-muted px-1.5 py-1 font-mono text-sm text-foreground">
              bun run docs:dev
            </code>
            , or configure{" "}
            <code className="bg-muted px-1.5 py-1 font-mono text-sm text-foreground">
              VITE_DOCS_URL
            </code>{" "}
            with the deployed Mintlify URL.
          </p>
          <a
            className={`${buttonVariants({ size: "lg" })} mt-8`}
            href={documentationUrl}
          >
            Open Mintlify documentation
            <HugeiconsIcon icon={ArrowRight01Icon} data-icon="inline-end" />
          </a>
          <p className="mt-4 font-mono text-[10px] leading-5 text-muted-foreground uppercase">
            Current target · {documentationUrl}
          </p>
        </div>
      </main>
    </div>
  )
}
