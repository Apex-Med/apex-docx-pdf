import { createFileRoute, redirect } from "@tanstack/react-router"
import { buttonVariants } from "@workspace/ui/components/button"

import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { EXTERNAL_DOCS_CONFIGURED, GITHUB_URL, docsPath } from "@/lib/site"

export const Route = createFileRoute("/docs")({
  beforeLoad: ({ location }) => {
    if (EXTERNAL_DOCS_CONFIGURED) {
      const docsSubpath = location.pathname.replace(/^\/docs\/?/u, "")
      throw redirect({
        href: docsPath(docsSubpath),
        reloadDocument: true,
      })
    }
  },
  component: DocsConfigurationRequired,
  head: () => ({
    meta: [
      { title: "Documentation — Apex DOCX PDF" },
      {
        name: "description",
        content: "Open the canonical Mintlify documentation for Apex DOCX PDF.",
      },
    ],
  }),
})

export function DocsConfigurationRequired() {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto grid min-h-[calc(100svh-8rem)] max-w-3xl place-items-center px-4 py-16 sm:px-5 lg:px-8">
        <section className="w-full border p-6 sm:p-10">
          <p className="text-[10px] font-semibold tracking-widest text-brand uppercase">
            Mintlify documentation
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            Configure the documentation origin
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
            This web build has no canonical Mintlify origin configured. Set
            <code> VITE_DOCS_URL</code> to the Mintlify site origin so
            <code> /docs</code> and its deep links leave the product app and
            open the real documentation site. This route intentionally does not
            imitate the documentation UI.
          </p>
          <a
            className={`${buttonVariants({ variant: "outline" })} mt-7`}
            href={`${GITHUB_URL}/tree/main/docs`}
            target="_blank"
            rel="noreferrer"
          >
            Browse documentation source
          </a>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
