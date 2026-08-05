import { Link, Outlet, createFileRoute } from "@tanstack/react-router"
import { Badge } from "@workspace/ui/components/badge"

import { SiteHeader } from "@/components/site-header"

export const Route = createFileRoute("/docs")({ component: DocsLayout })

const docsNavigation = [
  ["Overview", "/docs"],
  ["Getting started", "/docs/getting-started"],
  ["Template language", "/docs/template-language"],
  ["Supported features", "/docs/supported-features"],
] as const

function DocsLayout() {
  return (
    <div className="min-h-svh">
      <SiteHeader />
      <div className="mx-auto grid max-w-7xl lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="border-r px-5 py-10 lg:min-h-[calc(100svh-4rem)] lg:px-8">
          <Badge variant="secondary">Documentation</Badge>
          <nav className="mt-6 flex gap-2 overflow-x-auto text-sm lg:flex-col" aria-label="Documentation sections">
            {docsNavigation.map(([label, to]) => (
              <Link
                key={to}
                to={to}
                activeOptions={{ exact: to === "/docs" }}
                className="min-h-10 shrink-0 border-l-2 border-transparent px-3 py-2 text-muted-foreground transition-colors hover:text-foreground [&.active]:border-brand [&.active]:bg-muted/50 [&.active]:text-foreground"
              >
                {label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 px-5 py-12 lg:px-14 lg:py-16">
          <div className="max-w-3xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
