import { defineConfig } from "tsup"

const isBrowserPackage = process.cwd().endsWith("/packages/browser")

export default defineConfig({
  entry: isBrowserPackage
    ? { index: "src/index.ts", worker: "src/worker.ts" }
    : { index: "src/index.ts" },
  format: ["esm"],
  target: "es2022",
  platform: "neutral",
  dts: {
    compilerOptions: {
      declarationMap: true,
      ignoreDeprecations: "6.0",
    },
  },
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  minify: false,
  bundle: true,
  outDir: "dist",
})
