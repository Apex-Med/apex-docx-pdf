import { GithubIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link } from "@tanstack/react-router"
import { buttonVariants } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { ApexLogo } from "@/components/apex-logo"
import { ModeToggle } from "@/components/mode-toggle"

type SiteHeaderProps = Readonly<{
  compact?: boolean
}>

export function SiteHeader({ compact = false }: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-background/92 backdrop-blur-xl">
      <div
        className={cn(
          "mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8",
          compact && "max-w-none"
        )}
      >
        <Link
          to="/"
          className="flex min-h-11 items-center gap-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Apex DOCX PDF home"
        >
          <ApexLogo className="size-7 text-foreground" />
          <span className="text-sm font-semibold tracking-tight">
            Apex DOCX PDF
          </span>
          <span className="hidden border-l pl-3 font-mono text-[10px] tracking-widest text-muted-foreground uppercase sm:inline">
            deterministic renderer
          </span>
        </Link>

        <nav
          className="hidden items-center gap-7 text-sm text-muted-foreground md:flex"
          aria-label="Main navigation"
        >
          <a
            className="transition-colors hover:text-foreground"
            href="/#product"
          >
            Product
          </a>
          <Link
            className="transition-colors hover:text-foreground"
            to="/playground"
          >
            Playground
          </Link>
          <Link className="transition-colors hover:text-foreground" to="/docs">
            Documentation
          </Link>
          <a
            className="transition-colors hover:text-foreground"
            href="/#support"
          >
            Support matrix
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <details className="relative md:hidden">
            <summary className="flex min-h-11 list-none items-center px-3 text-xs font-semibold tracking-widest uppercase [&::-webkit-details-marker]:hidden">
              Menu
            </summary>
            <nav
              className="absolute top-[calc(100%+0.65rem)] right-0 z-50 flex w-64 flex-col border bg-background p-2 shadow-xl"
              aria-label="Mobile navigation"
            >
              <a
                className="min-h-11 px-3 py-3 text-sm hover:bg-muted"
                href="/#product"
              >
                Product
              </a>
              <Link
                className="min-h-11 px-3 py-3 text-sm hover:bg-muted"
                to="/playground"
              >
                Playground
              </Link>
              <Link
                className="min-h-11 px-3 py-3 text-sm hover:bg-muted"
                to="/docs"
              >
                Documentation
              </Link>
              <a
                className="min-h-11 px-3 py-3 text-sm hover:bg-muted"
                href="/#support"
              >
                Support matrix
              </a>
              <a
                className="min-h-11 px-3 py-3 text-sm hover:bg-muted"
                href="https://github.com"
                target="_blank"
                rel="noreferrer"
              >
                GitHub
              </a>
            </nav>
          </details>
          <ModeToggle />
          <a
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon-sm" }),
              "hidden sm:inline-flex"
            )}
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            aria-label="Open GitHub"
          >
            <HugeiconsIcon icon={GithubIcon} strokeWidth={1.8} />
          </a>
          <Link
            to="/playground"
            className={cn(
              buttonVariants({ size: "sm" }),
              "hidden sm:inline-flex"
            )}
          >
            Try the playground
          </Link>
        </div>
      </div>
    </header>
  )
}
