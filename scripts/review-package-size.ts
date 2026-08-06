import { readdir, readFile, stat } from "node:fs/promises"
import { join, relative } from "node:path"

const OUTPUT =
  Bun.argv.find((argument) => argument.startsWith("--output="))?.slice(9) ??
  "reports/package-size-measurements.json"
const PACKAGE_DIRECTORIES = [
  "apex-docx-pdf",
  "browser",
  "core",
  "devtools",
  "docx",
  "engine",
  "fonts",
  "images",
  "layout",
  "pdf",
  "template",
] as const

type PackResult = Readonly<{
  size: number
  unpackedSize: number
  entryCount: number
  files: readonly Readonly<{ path: string; size: number }>[]
}>

type SizeBudgets = Readonly<{
  aggregate: Readonly<{
    maxPackedBytes: number
    maxUnpackedBytes: number
  }>
  packages: Readonly<
    Record<
      string,
      Readonly<{ maxPackedBytes: number; maxUnpackedBytes: number }>
    >
  >
}>

const budgets = JSON.parse(
  await readFile("reports/package-size-budgets.json", "utf8")
) as SizeBudgets
const packages: Record<string, unknown> = {}
let aggregatePackedBytes = 0
let aggregateUnpackedBytes = 0

for (const directoryName of PACKAGE_DIRECTORIES) {
  const directory = join(process.cwd(), "packages", directoryName, "dist")
  const manifest = JSON.parse(
    await readFile(join(directory, "package.json"), "utf8")
  ) as { name: string; version: string }
  const packed = Bun.spawnSync(
    ["npm", "pack", "--dry-run", "--json", directory],
    { stdout: "pipe", stderr: "pipe" }
  )
  if (packed.exitCode !== 0) {
    throw new Error(
      `${manifest.name}: npm pack failed: ${packed.stderr.toString().trim()}`
    )
  }
  const result = (JSON.parse(packed.stdout.toString()) as PackResult[])[0]
  if (!result) throw new Error(`${manifest.name}: npm pack returned no result`)

  const sourceMapBytes = result.files
    .filter(({ path }) => path.endsWith(".map"))
    .reduce((sum, { size }) => sum + size, 0)
  const declarationBytes = result.files
    .filter(({ path }) => path.endsWith(".d.ts"))
    .reduce((sum, { size }) => sum + size, 0)
  const javascriptBytes = result.files
    .filter(({ path }) => path.endsWith(".js"))
    .reduce((sum, { size }) => sum + size, 0)
  const assetBytes = result.files
    .filter(({ path }) => path.startsWith("assets/"))
    .reduce((sum, { size }) => sum + size, 0)
  const aiBytes = result.files
    .filter(
      ({ path }) =>
        path === "AGENTS.md" || path === "llms.txt" || path.startsWith("ai/")
    )
    .reduce((sum, { size }) => sum + size, 0)
  const budget = budgets.packages[directoryName]
  if (!budget) throw new Error(`${directoryName}: missing size budget`)

  packages[manifest.name] = {
    directory: `packages/${directoryName}/dist`,
    version: manifest.version,
    packedBytes: result.size,
    unpackedBytes: result.unpackedSize,
    entryCount: result.entryCount,
    javascriptBytes,
    declarationBytes,
    sourceMapBytes,
    assetBytes,
    aiBytes,
    budget,
    remainingPackedBytes: budget.maxPackedBytes - result.size,
    remainingUnpackedBytes: budget.maxUnpackedBytes - result.unpackedSize,
  }
  aggregatePackedBytes += result.size
  aggregateUnpackedBytes += result.unpackedSize
}

const fontCatalogRoot = "packages/fonts/dist/assets/catalog"
const fontFamilies = (await readdir(fontCatalogRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()
const fontFiles = (await filesUnder(fontCatalogRoot))
  .filter((path) => path.endsWith(".ttf"))
  .map((path) => relative(fontCatalogRoot, path))
  .sort()

const result = {
  schemaVersion: 2,
  measuredAt: new Date().toISOString(),
  basis:
    "npm pack --dry-run measurements from the current publishable dist directories",
  packages,
  aggregate: {
    packedBytes: aggregatePackedBytes,
    unpackedBytes: aggregateUnpackedBytes,
    budget: budgets.aggregate,
    remainingPackedBytes:
      budgets.aggregate.maxPackedBytes - aggregatePackedBytes,
    remainingUnpackedBytes:
      budgets.aggregate.maxUnpackedBytes - aggregateUnpackedBytes,
  },
  fontCatalog: {
    families: fontFamilies,
    fontFiles,
  },
}

await Bun.write(OUTPUT, `${JSON.stringify(result, null, 2)}\n`)
console.log(JSON.stringify(result, null, 2))

async function filesUnder(path: string): Promise<string[]> {
  const info = await stat(path)
  if (info.isFile()) return [path]
  if (!info.isDirectory()) return []
  const entries = await readdir(path, { withFileTypes: true })
  return (
    await Promise.all(
      entries.map((entry) => filesUnder(join(path, entry.name)))
    )
  ).flat()
}
