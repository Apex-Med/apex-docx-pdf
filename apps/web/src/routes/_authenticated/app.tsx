import { ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link, createFileRoute } from "@tanstack/react-router"
import { buttonVariants } from "@workspace/ui/components/button"

import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"

export const Route = createFileRoute("/_authenticated/app")({
  component: WorkspacePage,
  head: () => ({
    meta: [
      {
        title: "Workspace — Apex DOCX PDF",
      },
      {
        name: "description",
        content: "Open the authenticated Apex DOCX PDF workspace.",
      },
    ],
  }),
})

function WorkspacePage() {
  return (
    <div className="min-h-svh overflow-x-clip">
      <SiteHeader />
      <main className="mx-auto flex min-h-[calc(100svh-8rem)] w-full max-w-3xl flex-col justify-center px-4 py-16 sm:px-5 lg:px-8">
        <p className="text-[10px] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
          Workspace
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
          Continue in the editor
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
          You are signed in. Open the paginated DOCX editor to author, preview,
          and export searchable PDFs.
        </p>
        <div className="mt-8">
          <Link to="/editor" className={buttonVariants({ size: "lg" })}>
            Open editor
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              data-icon="inline-end"
              strokeWidth={2}
            />
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
