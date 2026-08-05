import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { defineConfig } from "vite"

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url))

export default defineConfig({
  root: import.meta.dirname,
  publicDir: false,
  resolve: {
    alias: {
      "@": join(repositoryRoot, "apps", "web", "src"),
    },
  },
  build: {
    outDir: join(repositoryRoot, ".tmp", "browser-determinism"),
    emptyOutDir: true,
  },
})
