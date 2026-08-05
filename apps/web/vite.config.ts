import { defineConfig } from "vite"
import { loadEnv, type Plugin } from "vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { nitro } from "nitro/vite"

const publicRoutes = ["/", "/playground", "/support"] as const

function canonicalSiteFiles(siteUrl: string | undefined): Plugin {
  return {
    name: "canonical-site-files",
    apply: "build",
    generateBundle() {
      if (!siteUrl || this.environment.name !== "client") return

      const sitemap = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...publicRoutes.map(
          (route) => `  <url><loc>${new URL(route, `${siteUrl}/`)}</loc></url>`
        ),
        "</urlset>",
        "",
      ].join("\n")

      this.emitFile({ type: "asset", fileName: "sitemap.xml", source: sitemap })
      this.emitFile({
        type: "asset",
        fileName: "robots.txt",
        source: `User-agent: *\nAllow: /\n\nSitemap: ${new URL("/sitemap.xml", `${siteUrl}/`)}\n`,
      })
    },
  }
}

const config = defineConfig(({ mode }) => {
  const configuredSiteUrl = loadEnv(mode, process.cwd(), "")
    .VITE_SITE_URL?.trim()
    .replace(/\/$/u, "")
  const siteUrl =
    configuredSiteUrl && /^https?:\/\/[^\s]+$/u.test(configuredSiteUrl)
      ? configuredSiteUrl
      : undefined

  return {
    resolve: { tsconfigPaths: true },
    ssr: { noExternal: ["@apex-docx-pdf/fonts"] },
    plugins: [
      canonicalSiteFiles(siteUrl),
      devtools(),
      tailwindcss(),
      tanstackStart(),
      nitro({
        vercel: {
          functions: {
            maxDuration: 30,
            runtime: "bun1.x",
          },
        },
      }),
      viteReact(),
    ],
  }
})

export default config
