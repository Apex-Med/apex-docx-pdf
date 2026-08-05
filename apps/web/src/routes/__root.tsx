import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router"

import appCss from "@workspace/ui/globals.css?url"

import { ThemeProvider, themeInitScript } from "@/components/theme-provider"
import type { RouterContext } from "@/lib/router-context"

const title = "Apex DOCX PDF — DOCX templates to searchable PDFs"
const description =
  "Author DOCX templates, bind typed data, and render deterministic searchable PDFs in TypeScript—without an office binary or conversion service."
const configuredSiteUrl = import.meta.env.VITE_SITE_URL?.trim().replace(
  /\/$/u,
  ""
)
const siteUrl =
  configuredSiteUrl && /^https?:\/\/[^\s]+$/u.test(configuredSiteUrl)
    ? configuredSiteUrl
    : undefined
const socialImage = siteUrl ? `${siteUrl}/og-image.png` : "/og-image.png"

export const Route = createRootRouteWithContext<RouterContext>()({
  head: ({ matches }) => {
    const pathname = matches.at(-1)?.pathname ?? "/"
    const canonicalUrl = siteUrl
      ? new URL(pathname, `${siteUrl}/`).toString()
      : undefined

    return {
      meta: [
        {
          charSet: "utf-8",
        },
        {
          name: "viewport",
          content: "width=device-width, initial-scale=1",
        },
        {
          title,
        },
        {
          name: "description",
          content: description,
        },
        {
          name: "color-scheme",
          content: "light dark",
        },
        {
          name: "theme-color",
          content: "#f7f7f5",
        },
        {
          property: "og:title",
          content: title,
        },
        {
          property: "og:description",
          content: description,
        },
        {
          property: "og:type",
          content: "website",
        },
        {
          property: "og:url",
          content: canonicalUrl ?? pathname,
        },
        {
          property: "og:image",
          content: socialImage,
        },
        {
          property: "og:image:width",
          content: "1200",
        },
        {
          property: "og:image:height",
          content: "630",
        },
        {
          name: "twitter:card",
          content: "summary_large_image",
        },
        {
          name: "twitter:title",
          content: title,
        },
        {
          name: "twitter:description",
          content: description,
        },
        {
          name: "twitter:image",
          content: socialImage,
        },
      ],
      links: [
        {
          rel: "stylesheet",
          href: appCss,
        },
        {
          rel: "icon",
          href: "/icon.svg",
          type: "image/svg+xml",
        },
        {
          rel: "manifest",
          href: "/manifest.json",
        },
        ...(canonicalUrl ? [{ rel: "canonical", href: canonicalUrl }] : []),
      ],
    }
  },
  notFoundComponent: () => (
    <main className="mx-auto flex min-h-svh max-w-lg flex-col justify-center px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        The requested page could not be found.
      </p>
    </main>
  ),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="overscroll-none" suppressHydrationWarning>
      <head>
        <HeadContent />
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: this static, source-controlled script contains no user input and must run before hydration. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="overscroll-none">
        <ThemeProvider defaultTheme="system" storageKey="apex-ui-theme">
          {children}
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  )
}
