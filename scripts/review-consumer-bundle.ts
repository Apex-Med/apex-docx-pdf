import { gzipSync } from "node:zlib"
import { join } from "node:path"

const repositoryRoot = join(import.meta.dir, "..")
const entrypoint = join(repositoryRoot, "benchmarks", "minimal-consumer.ts")
const outputPath = join(
  repositoryRoot,
  "reports",
  "minimal-consumer-bundle.json"
)

const build = await Bun.build({
  entrypoints: [entrypoint],
  target: "bun",
  format: "esm",
  minify: true,
  sourcemap: "none",
  write: false,
})

if (!build.success || build.outputs.length !== 1) {
  const messages = build.logs.map((message) => message.message).join("\n")
  throw new Error(`Minimal consumer bundle failed:\n${messages}`)
}

const output = build.outputs[0]
if (!output) {
  throw new Error("Minimal consumer bundle produced no output")
}
const bytes = new Uint8Array(await output.arrayBuffer())
const result = {
  schemaVersion: 1,
  measuredAt: new Date().toISOString(),
  runtime: `Bun ${Bun.version}`,
  platform: `${process.platform}-${process.arch}`,
  entrypoint: "benchmarks/minimal-consumer.ts",
  target: "bun",
  format: "esm",
  minified: true,
  sourceMap: false,
  basis:
    "Local workspace source resolution; this is not an npm install or registry transfer measurement.",
  rawBytes: bytes.byteLength,
  gzipBytes: gzipSync(bytes, { level: 9, mtime: 0 }).byteLength,
}

await Bun.write(outputPath, `${JSON.stringify(result, null, 2)}\n`)
console.log(JSON.stringify(result, null, 2))
