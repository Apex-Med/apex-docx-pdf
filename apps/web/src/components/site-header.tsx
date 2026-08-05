import {
  Cancel01Icon,
  GithubIcon,
  Menu01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link } from "@tanstack/react-router"
import { buttonVariants } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { useEffect, useId, useRef, useState } from "react"

import { ApexLogo } from "@/components/apex-logo"
import { ModeToggle } from "@/components/mode-toggle"
import { DOCS_URL, GITHUB_URL } from "@/lib/site"

type SiteHeaderProps = Readonly<{
  compact?: boolean
}>

const mobileNavItems = [
  {
    to: "/",
    hash: "product",
    label: "Product",
    link: true as const,
  },
  { to: "/playground", label: "Playground", link: true as const },
  {
    href: DOCS_URL,
    label: "Documentation",
    external: true as const,
  },
  { to: "/support", label: "Support matrix", link: true as const },
  {
    href: GITHUB_URL,
    label: "GitHub",
    external: true as const,
  },
] as const

export function SiteHeader({ compact = false }: SiteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuId = useId()
  const menuRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!menuOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false)
        menuButtonRef.current?.focus()
        return
      }

      if (event.key !== "Tab") return
      const focusable = Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      ).filter((element) => element.offsetParent !== null)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }

    document.addEventListener("keydown", onKeyDown)
    document.addEventListener("pointerdown", onPointerDown)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.removeEventListener("pointerdown", onPointerDown)
    }
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return
    menuRef.current?.querySelector<HTMLElement>("nav a")?.focus()
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [menuOpen])

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-background/92 backdrop-blur-xl">
      <div
        className={cn(
          "mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-5 lg:px-8",
          compact && "max-w-none"
        )}
      >
        <Link
          to="/"
          className="flex min-h-11 min-w-0 items-center gap-2.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:gap-3"
          aria-label="Apex DOCX PDF home"
          onClick={() => setMenuOpen(false)}
        >
          <ApexLogo className="size-7 shrink-0 text-foreground" />
          <span className="truncate text-sm font-semibold tracking-tight">
            Apex DOCX PDF
          </span>
          <span className="hidden border-l pl-3 font-mono text-[10px] tracking-widest text-muted-foreground uppercase lg:inline">
            DOCX → PDF
          </span>
        </Link>

        <nav
          className="hidden items-center gap-7 text-sm text-muted-foreground md:flex"
          aria-label="Main navigation"
        >
          <Link
            className="transition-colors hover:text-foreground"
            to="/"
            hash="product"
          >
            Product
          </Link>
          <Link
            className="transition-colors hover:text-foreground"
            to="/playground"
          >
            Playground
          </Link>
          <a
            className="transition-colors hover:text-foreground"
            href={DOCS_URL}
            target="_blank"
            rel="noreferrer"
          >
            Documentation
          </a>
          <Link
            className="transition-colors hover:text-foreground"
            to="/support"
          >
            Support matrix
          </Link>
        </nav>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <div className="relative md:hidden" ref={menuRef}>
            <button
              ref={menuButtonRef}
              type="button"
              className="inline-flex size-11 items-center justify-center text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls={menuId}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <HugeiconsIcon
                icon={menuOpen ? Cancel01Icon : Menu01Icon}
                strokeWidth={1.8}
                className="size-5"
              />
            </button>
            {menuOpen ? (
              <nav
                id={menuId}
                className="fixed inset-x-0 top-14 z-50 max-h-[calc(100svh-3.5rem)] overflow-y-auto border-b bg-background shadow-xl sm:absolute sm:inset-x-auto sm:top-[calc(100%+0.5rem)] sm:right-0 sm:max-h-none sm:w-72 sm:border sm:shadow-xl"
                aria-label="Mobile navigation"
              >
                <div className="flex flex-col p-2 sm:p-2">
                  {mobileNavItems.map((item) =>
                    "link" in item ? (
                      <Link
                        key={item.label}
                        className="min-h-12 px-4 py-3 text-sm transition-colors hover:bg-muted focus-visible:bg-muted"
                        to={item.to}
                        hash={"hash" in item ? item.hash : undefined}
                        onClick={() => setMenuOpen(false)}
                      >
                        {item.label}
                      </Link>
                    ) : (
                      <a
                        key={item.label}
                        className="min-h-12 px-4 py-3 text-sm transition-colors hover:bg-muted focus-visible:bg-muted"
                        href={item.href}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => setMenuOpen(false)}
                      >
                        {item.label}
                      </a>
                    )
                  )}
                  <div className="mt-1 border-t p-2 sm:hidden">
                    <Link
                      to="/playground"
                      className={cn(buttonVariants(), "w-full")}
                      onClick={() => setMenuOpen(false)}
                    >
                      Open playground
                    </Link>
                  </div>
                </div>
              </nav>
            ) : null}
          </div>
          <ModeToggle />
          <a
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon-sm" }),
              "hidden sm:inline-flex"
            )}
            href={GITHUB_URL}
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
            Open playground
          </Link>
        </div>
      </div>
      {menuOpen ? (
        <button
          type="button"
          className="fixed inset-0 top-14 z-40 bg-foreground/20 backdrop-blur-[1px] md:hidden"
          aria-label="Dismiss menu"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}
    </header>
  )
}
