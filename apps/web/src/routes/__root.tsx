import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router"

import appCss from "@workspace/ui/globals.css?url"

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Apex DOCX PDF — deterministic DOCX template rendering",
      },
      {
        name: "description",
        content:
          "Create templates in Word or Google Docs and generate deterministic searchable PDFs in TypeScript without LibreOffice or a conversion API.",
      },
      {
        name: "theme-color",
        content: "#ffffff",
      },
      {
        property: "og:title",
        content: "Apex DOCX PDF",
      },
      {
        property: "og:description",
        content:
          "Word-authored templates, typed data, and deterministic searchable PDFs from one portable TypeScript engine.",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  notFoundComponent: () => (
    <main className="container mx-auto p-4 pt-16">
      <h1>404</h1>
      <p>The requested page could not be found.</p>
    </main>
  ),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
