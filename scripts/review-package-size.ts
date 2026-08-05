import { readdir, stat } from "node:fs/promises"
import { join, relative } from "node:path"
import { gzipSync } from "bun"

const OUTPUT =
  Bun.argv.find((argument) => argument.startsWith("--output="))?.slice(9) ??
  "reports/package-size-measurements.json"
const ROOTS = ["packages", "apps/web/dist"] as const

type FileMeasurement = Readonly<{
  path: string
  bytes: number
  gzipBytes: number
}>

async function filesUnder(path: string): Promise<string[]> {
  try {
    const info = await stat(path)
    if (info.isFile()) return [path]
    if (!info.isDirectory()) return []
    const entries = await readdir(path, { withFileTypes: true })
    const nested = await Promise.all(
      entries.map((entry) => filesUnder(join(path, entry.name)))
    )
    return nested.flat()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw error
  }
}

const allFiles = (await Promise.all(ROOTS.map(filesUnder))).flat()
const relevant = allFiles.filter(
  (path) =>
    path.startsWith("apps/web/dist/") ||
    /packages\/[^/]+\/src\/.*\.tsx?$/u.test(path)
)
const measurements: FileMeasurement[] = []
for (const path of relevant) {
  const bytes = new Uint8Array(await Bun.file(path).arrayBuffer())
  measurements.push({
    path: relative(".", path),
    bytes: bytes.length,
    gzipBytes: gzipSync(bytes).length,
  })
}
measurements.sort((left, right) => right.bytes - left.bytes)

const summarize = (prefix: string) => {
  const matching = measurements.filter(({ path }) => path.startsWith(prefix))
  return {
    files: matching.length,
    bytes: matching.reduce((sum, item) => sum + item.bytes, 0),
    gzipBytes: matching.reduce((sum, item) => sum + item.gzipBytes, 0),
  }
}
const packageNames = [
  ...new Set(
    measurements
      .filter(({ path }) => path.startsWith("packages/"))
      .map(({ path }) => path.split("/").slice(0, 2).join("/"))
  ),
].sort()
const result = {
  schemaVersion: 1,
  measuredAt: new Date().toISOString(),
  basis: "raw and per-file gzip bytes from current local source/build artifacts",
  caveat:
    "Per-file gzip totals are an inventory aid, not a bundled transfer-size prediction.",
  roots: Object.fromEntries(ROOTS.map((root) => [root, summarize(root)])),
  packages: Object.fromEntries(
    packageNames.map((name) => [name, summarize(`${name}/`)])
  ),
  largestFiles: measurements.slice(0, 20),
}
await Bun.write(OUTPUT, `${JSON.stringify(result, null, 2)}\n`)
console.log(JSON.stringify(result, null, 2))
