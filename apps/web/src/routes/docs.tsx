import { Outlet, createFileRoute, redirect } from "@tanstack/react-router"

import { EXTERNAL_DOCS_CONFIGURED, docsPath } from "@/lib/site"

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
  component: Outlet,
  head: () => ({
    meta: [
      { title: "Documentation — Apex DOCX PDF" },
      {
        name: "description",
        content: "Open the canonical Mintlify documentation for Apex DOCX PDF.",
      },
      ...(!EXTERNAL_DOCS_CONFIGURED
        ? [{ name: "robots", content: "noindex, nofollow" }]
        : []),
    ],
  }),
})
