import { readFile } from "node:fs/promises"

const PUBLIC_PACKAGES = [
  ["apex-docx-pdf", "apex-docx-pdf"],
  ["browser", "@apex-docx-pdf/browser"],
  ["core", "@apex-docx-pdf/core"],
  ["devtools", "@apex-docx-pdf/devtools"],
  ["docx", "@apex-docx-pdf/docx"],
  ["engine", "@apex-docx-pdf/engine"],
  ["fonts", "@apex-docx-pdf/fonts"],
  ["images", "@apex-docx-pdf/images"],
  ["layout", "@apex-docx-pdf/layout"],
  ["pdf", "@apex-docx-pdf/pdf"],
  ["template", "@apex-docx-pdf/template"],
] as const

type ChangesetsConfig = Readonly<{
  access: string
  baseBranch: string
  fixed: readonly (readonly string[])[]
  ignore: readonly string[]
}>

type PrereleaseState = Readonly<{
  mode: string
  tag: string
  initialVersions: Readonly<Record<string, string>>
  changesets: readonly string[]
}>

const config = await readJson<ChangesetsConfig>(".changeset/config.json")
const prerelease = await readJson<PrereleaseState>(".changeset/pre.json")
const expectedNames = PUBLIC_PACKAGES.map(([, name]) => name).sort()
const fixedNames = [...(config.fixed[0] ?? [])].sort()

if (config.fixed.length !== 1 || !sameStrings(fixedNames, expectedNames)) {
  throw new Error(
    "Changesets fixed group must contain the complete public package set"
  )
}
if (config.access !== "public" || config.baseBranch !== "main") {
  throw new Error("Changesets must target public packages from the main branch")
}
if (expectedNames.some((name) => config.ignore.includes(name))) {
  throw new Error("A public package is incorrectly ignored by Changesets")
}
if (prerelease.mode !== "pre" || prerelease.tag !== "next") {
  throw new Error("Changesets must remain in next prerelease mode")
}

let lockstepVersion: string | undefined
for (const [directory, expectedName] of PUBLIC_PACKAGES) {
  const manifest = await readJson<{ name: string; version: string }>(
    `packages/${directory}/package.json`
  )
  if (manifest.name !== expectedName) {
    throw new Error(`${directory}: expected package name ${expectedName}`)
  }
  if (!/^0\.\d+\.\d+-next\.\d+$/u.test(manifest.version)) {
    throw new Error(
      `${manifest.name}: invalid next prerelease version ${manifest.version}`
    )
  }
  lockstepVersion ??= manifest.version
  if (manifest.version !== lockstepVersion) {
    throw new Error(
      `${manifest.name}: public package versions are not lockstep`
    )
  }
  if (!prerelease.initialVersions[manifest.name]) {
    throw new Error(`${manifest.name}: missing Changesets initial version`)
  }
}

const initialChangesetPath = ".changeset/initial-prerelease-packaging.md"
if (await Bun.file(initialChangesetPath).exists()) {
  const source = await readFile(initialChangesetPath, "utf8")
  const frontmatter = source.match(/^---\n([\s\S]*?)\n---(?:\n|$)/u)?.[1]
  if (!frontmatter) {
    throw new Error("Initial prerelease Changeset has no frontmatter")
  }
  const releases = new Map(
    frontmatter.split("\n").map((line) => {
      const match = line.match(/^"([^"]+)": (patch|minor|major)$/u)
      if (!match) throw new Error(`Invalid initial prerelease release: ${line}`)
      return [match[1], match[2]] as const
    })
  )
  if (
    releases.size !== expectedNames.length ||
    expectedNames.some((name) => releases.get(name) !== "patch")
  ) {
    throw new Error(
      "Initial prerelease Changeset must patch the complete public package set"
    )
  }
  if (prerelease.changesets.length !== 0) {
    throw new Error(
      "Pending initial Changeset must not also be marked consumed"
    )
  }
  for (const [, name] of PUBLIC_PACKAGES) {
    if (prerelease.initialVersions[name] !== lockstepVersion) {
      throw new Error(
        `${name}: initial prerelease version does not match package version`
      )
    }
  }
}

console.log(
  `Release configuration valid: ${PUBLIC_PACKAGES.length} public packages at ${lockstepVersion}, Changesets next mode, complete fixed group`
)

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T
}

function sameStrings(
  left: readonly string[],
  right: readonly string[]
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
}
