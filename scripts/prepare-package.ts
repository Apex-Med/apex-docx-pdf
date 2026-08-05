import { cp, readFile, writeFile } from "node:fs/promises"
import { basename, join, resolve } from "node:path"

type PackageJson = Record<string, unknown> & {
  dependencies?: Record<string, string>
  name?: string
  version?: string
}

const packageDirectory = process.cwd()
const rootDirectory = resolve(packageDirectory, "../..")
const source = JSON.parse(
  await readFile(join(packageDirectory, "package.json"), "utf8")
) as PackageJson

if (!source.name || !source.version) {
  throw new Error("The package manifest must have a name and version")
}

const workspaceVersions = new Map<string, string>()
for (const directory of [
  "browser",
  "core",
  "docx",
  "engine",
  "fonts",
  "images",
  "layout",
  "pdf",
  "template",
]) {
  const manifest = JSON.parse(
    await readFile(
      join(rootDirectory, "packages", directory, "package.json"),
      "utf8"
    )
  ) as PackageJson
  if (manifest.name && manifest.version) {
    workspaceVersions.set(manifest.name, manifest.version)
  }
}

const dependencies = Object.fromEntries(
  Object.entries(source.dependencies ?? {}).map(([name, version]) => [
    name,
    version.startsWith("workspace:")
      ? (workspaceVersions.get(name) ?? version)
      : version,
  ])
)
const browser = basename(packageDirectory) === "browser"
const entry = (file: string) => ({
  types: `./${file}.d.ts`,
  import: `./${file}.js`,
  default: `./${file}.js`,
})

const published = {
  name: source.name,
  version: source.version,
  description: source.description,
  type: "module",
  license: source.license,
  repository: source.repository,
  homepage: source.homepage,
  bugs: source.bugs,
  keywords: source.keywords,
  sideEffects: source.sideEffects,
  engines: source.engines,
  exports: browser
    ? { ".": entry("index"), "./worker": entry("worker") }
    : { ".": entry("index") },
  main: "./index.js",
  types: "./index.d.ts",
  dependencies,
  publishConfig: source.publishConfig,
}

await writeFile(
  join(packageDirectory, "dist", "package.json"),
  `${JSON.stringify(published, null, 2)}\n`
)
await Promise.all([
  cp(join(rootDirectory, "LICENSE"), join(packageDirectory, "dist", "LICENSE")),
  cp(
    join(rootDirectory, "README.md"),
    join(packageDirectory, "dist", "README.md")
  ),
])
