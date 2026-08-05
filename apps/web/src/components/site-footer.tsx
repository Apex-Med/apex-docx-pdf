import { Link } from "@tanstack/react-router"

import { DOCS_URL, GITHUB_URL } from "@/lib/site"

const communityLinks = [
  { label: "GitHub", href: GITHUB_URL },
  { label: "Contributing", href: `${GITHUB_URL}/blob/main/CONTRIBUTING.md` },
  { label: "Issues", href: `${GITHUB_URL}/issues` },
  { label: "Roadmap", href: `${GITHUB_URL}/blob/main/ROADMAP.md` },
  { label: "Changelog", href: `${GITHUB_URL}/blob/main/CHANGELOG.md` },
  { label: "License", href: `${GITHUB_URL}/blob/main/LICENSE` },
  { label: "Security", href: `${GITHUB_URL}/blob/main/SECURITY.md` },
] as const

const linkStyles =
  "flex flex-wrap gap-x-5 gap-y-2 [&_a]:min-h-8 [&_a]:underline-offset-4 [&_a]:transition-colors [&_a]:hover:text-foreground [&_a]:hover:underline"

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 text-sm text-muted-foreground sm:px-5 sm:py-9 lg:grid-cols-[1fr_auto] lg:px-8">
        <div>
          <p className="font-medium text-foreground">Apex DOCX PDF</p>
          <p className="mt-2 max-w-sm leading-6">
            Open-source, deterministic DOCX template rendering for TypeScript.
          </p>
          <p className="mt-4 text-xs">© 2026 · Apache-2.0 · prerelease</p>
        </div>
        <div className="flex flex-col gap-4 lg:items-end">
          <nav
            className={`${linkStyles} lg:justify-end`}
            aria-label="Product navigation"
          >
            <a href={DOCS_URL} target="_blank" rel="noreferrer">
              Documentation
            </a>
            <Link to="/support">Support matrix</Link>
            <Link to="/playground">Playground</Link>
          </nav>
          <nav
            className={`${linkStyles} lg:max-w-2xl lg:justify-end`}
            aria-label="Community navigation"
          >
            {communityLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noreferrer"
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  )
}
