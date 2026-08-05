import { GithubIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link } from "@tanstack/react-router"
import { buttonVariants } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

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
          className="flex min-h-11 items-center gap-3 focus-visible:outline-none"
          aria-label="Apex DOCX PDF home"
        >
          <span className="grid size-8 place-items-center bg-foreground text-xs font-bold text-background">
            AX
          </span>
          <span className="text-sm font-semibold tracking-tight">Apex DOCX PDF</span>
          <span className="hidden border-l pl-3 font-mono text-[10px] tracking-widest text-muted-foreground uppercase sm:inline">
            deterministic renderer
          </span>
        </Link>

        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex" aria-label="Main navigation">
          <a className="transition-colors hover:text-foreground" href="/#product">
            Product
          </a>
          <Link className="transition-colors hover:text-foreground" to="/playground">
            Playground
          </Link>
          <Link className="transition-colors hover:text-foreground" to="/docs">
            Documentation
          </Link>
          <a className="transition-colors hover:text-foreground" href="/#support">
            Support matrix
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <a
            className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            aria-label="Open GitHub"
          >
            <HugeiconsIcon icon={GithubIcon} strokeWidth={1.8} />
          </a>
          <Link
            to="/playground"
            className={buttonVariants({ size: "sm" })}
          >
            Try the playground
          </Link>
        </div>
      </div>
    </header>
  )
}
