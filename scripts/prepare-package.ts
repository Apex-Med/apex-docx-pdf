import { cp, readFile, writeFile } from "node:fs/promises"
import { basename, join, resolve } from "node:path"

type PackageJson = Record<string, unknown> & {
  ai?: unknown
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
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
const fonts = basename(packageDirectory) === "fonts"
const umbrella = basename(packageDirectory) === "apex-docx-pdf"
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
  ai: source.ai,
  sideEffects: source.sideEffects,
  engines: source.engines,
  exports: browser
    ? { ".": entry("index"), "./worker": entry("worker") }
    : fonts
      ? { ".": entry("index"), "./assets/*": "./assets/*" }
      : { ".": entry("index") },
  main: "./index.js",
  types: "./index.d.ts",
  dependencies,
  ...(source.peerDependencies
    ? { peerDependencies: source.peerDependencies }
    : {}),
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
  ...(fonts
    ? [
        cp(
          join(packageDirectory, "assets"),
          join(packageDirectory, "dist", "assets"),
          {
            recursive: true,
          }
        ),
      ]
    : []),
  ...(umbrella
    ? [
        cp(
          join(packageDirectory, "AGENTS.md"),
          join(packageDirectory, "dist", "AGENTS.md")
        ),
        cp(
          join(packageDirectory, "llms.txt"),
          join(packageDirectory, "dist", "llms.txt")
        ),
        cp(join(packageDirectory, "ai"), join(packageDirectory, "dist", "ai"), {
          recursive: true,
        }),
      ]
    : []),
])
