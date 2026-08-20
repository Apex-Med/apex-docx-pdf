import { readFile, stat } from "node:fs/promises"
import { join } from "node:path"

const packages = [
  "apex-docx-pdf",
  "browser",
  "core",
  "devtools",
  "docx",
  "engine",
  "fonts",
  "forms",
  "images",
  "layout",
  "pdf",
  "template",
]

const UMBRELLA_AI_METADATA = {
  schemaVersion: 1,
  instructions: "./AGENTS.md",
  context: "./ai/CONTEXT.md",
  llms: "./llms.txt",
  skills: {
    integrate: "./ai/skills/integrate-apex-docx-pdf/SKILL.md",
    generateCompatibleDocxTemplate:
      "./ai/skills/generate-compatible-docx-template/SKILL.md",
    bindApexForm: "./ai/skills/bind-apex-form/SKILL.md",
  },
} as const

const UMBRELLA_AI_FILES = [
  "AGENTS.md",
  "llms.txt",
  "ai/CONTEXT.md",
  "ai/skills/integrate-apex-docx-pdf/SKILL.md",
  "ai/skills/integrate-apex-docx-pdf/agents/openai.yaml",
  "ai/skills/integrate-apex-docx-pdf/references/integration-api.md",
  "ai/skills/integrate-apex-docx-pdf/references/security-and-determinism.md",
  "ai/skills/generate-compatible-docx-template/SKILL.md",
  "ai/skills/generate-compatible-docx-template/agents/openai.yaml",
  "ai/skills/generate-compatible-docx-template/references/template-language.md",
  "ai/skills/generate-compatible-docx-template/references/supported-docx-profile.md",
  "ai/skills/generate-compatible-docx-template/scripts/inspect-template.mjs",
  "ai/skills/bind-apex-form/SKILL.md",
  "ai/skills/bind-apex-form/agents/openai.yaml",
  "ai/skills/bind-apex-form/references/form-binding.md",
] as const

type PackResult = Readonly<{
  size: number
  unpackedSize: number
  entryCount: number
  files: readonly Readonly<{ path: string }>[]
}>

type SizeBudgets = Readonly<{
  schemaVersion: number
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

type SizeMeasurements = Readonly<{
  schemaVersion: number
  packages: Readonly<
    Record<
      string,
      Readonly<{
        directory: string
        version: string
        packedBytes: number
        unpackedBytes: number
        entryCount: number
      }>
    >
  >
  aggregate: Readonly<{
    packedBytes: number
    unpackedBytes: number
  }>
}>

const budgets = JSON.parse(
  await readFile("reports/package-size-budgets.json", "utf8")
) as SizeBudgets
const measurements = JSON.parse(
  await readFile("reports/package-size-measurements.json", "utf8")
) as SizeMeasurements
if (budgets.schemaVersion !== 1) {
  throw new Error("Unsupported package-size budget schema")
}
if (measurements.schemaVersion !== 2) {
  throw new Error("Unsupported package-size measurement schema")
}

let aggregatePackedBytes = 0
let aggregateUnpackedBytes = 0

for (const name of packages) {
  // ATTW removes the temporary tarball using the directory argument as its
  // base. A relative nested path makes that cleanup resolve the path twice.
  const directory = `${process.cwd()}/packages/${name}/dist`
  const manifestText = await readFile(join(directory, "package.json"), "utf8")
  const manifest = JSON.parse(manifestText) as {
    ai?: unknown
    name: string
    version: string
  }
  if (manifestText.includes("workspace:")) {
    throw new Error(`${name}: publication manifest contains a workspace range`)
  }
  for (const required of ["LICENSE", "README.md", "index.js", "index.d.ts"]) {
    if (!(await exists(join(directory, required)))) {
      throw new Error(`${name}: publication artifact is missing ${required}`)
    }
  }
  if (name === "fonts") {
    for (const required of [
      "assets/catalog/PROVENANCE.md",
      "assets/catalog/bricolage-grotesque/OFL.txt",
      "assets/catalog/geist/OFL.txt",
      "assets/catalog/geist-mono/OFL.txt",
      "assets/catalog/instrument-sans/OFL.txt",
      "assets/catalog/instrument-serif/OFL.txt",
      "assets/catalog/inter/OFL.txt",
    ]) {
      if (!(await exists(join(directory, required)))) {
        throw new Error(`fonts: publication artifact is missing ${required}`)
      }
    }
  }
  if (name === "apex-docx-pdf") {
    if (JSON.stringify(manifest.ai) !== JSON.stringify(UMBRELLA_AI_METADATA)) {
      throw new Error(
        "apex-docx-pdf: publication manifest has incorrect AI metadata"
      )
    }
    for (const required of UMBRELLA_AI_FILES) {
      if (!(await exists(join(directory, required)))) {
        throw new Error(
          `apex-docx-pdf: publication artifact is missing ${required}`
        )
      }
      const contents = await readFile(join(directory, required), "utf8")
      if (contents.includes("TODO")) {
        throw new Error(
          `apex-docx-pdf: published AI artifact contains TODO: ${required}`
        )
      }
    }
  } else if (manifest.ai !== undefined) {
    throw new Error(
      `${name}: only the umbrella package may publish AI metadata`
    )
  }

  for (const command of [
    ["bunx", "publint", "run", directory, "--strict", "--pack", "false"],
    ["bunx", "attw", "--pack", directory, "--profile", "esm-only"],
  ]) {
    console.log(`\n${command.join(" ")}`)
    const result = Bun.spawnSync(command, {
      stdout: "inherit",
      stderr: "inherit",
    })
    if (result.exitCode !== 0) {
      throw new Error(
        `${name}: ${command[1]} failed with exit code ${result.exitCode}`
      )
    }
  }

  const packCommand = ["npm", "pack", "--dry-run", "--json", directory]
  console.log(`\n${packCommand.join(" ")}`)
  const packed = Bun.spawnSync(packCommand, { stdout: "pipe", stderr: "pipe" })
  if (packed.exitCode !== 0) {
    throw new Error(
      `${name}: npm pack failed with exit code ${packed.exitCode}: ${packed.stderr.toString().trim()}`
    )
  }
  const result = (JSON.parse(packed.stdout.toString()) as PackResult[])[0]
  if (!result) throw new Error(`${name}: npm pack returned no artifact result`)
  const packedPaths = new Set(result.files.map(({ path }) => path))
  for (const required of [
    "LICENSE",
    "README.md",
    "index.js",
    "index.d.ts",
    "package.json",
  ]) {
    if (!packedPaths.has(required)) {
      throw new Error(`${name}: npm tarball would omit ${required}`)
    }
  }
  if (name === "apex-docx-pdf") {
    for (const required of UMBRELLA_AI_FILES) {
      if (!packedPaths.has(required)) {
        throw new Error(`apex-docx-pdf: npm tarball would omit ${required}`)
      }
    }
  }
  const forbidden = [...packedPaths].filter(
    (path) =>
      path.startsWith("src/") ||
      path.startsWith("tests/") ||
      path.startsWith("fixtures/") ||
      path.includes(".env")
  )
  if (forbidden.length > 0) {
    throw new Error(
      `${name}: npm tarball contains forbidden files: ${forbidden.join(", ")}`
    )
  }
  if (
    name === "fonts" &&
    ![...packedPaths].some((path) => path.endsWith(".ttf"))
  ) {
    throw new Error("fonts: npm tarball would omit the bundled font assets")
  }

  const budget = budgets.packages[name]
  if (!budget) throw new Error(`${name}: package-size budget is missing`)
  const measurement = measurements.packages[manifest.name]
  if (
    measurement === undefined ||
    measurement.directory !== `packages/${name}/dist` ||
    measurement.version !== manifest.version ||
    measurement.packedBytes !== result.size ||
    measurement.unpackedBytes !== result.unpackedSize ||
    measurement.entryCount !== result.entryCount
  ) {
    throw new Error(
      `${name}: checked-in package-size evidence is stale; run bun run packages:size:review after building`
    )
  }
  enforceBudget(name, "packed", result.size, budget.maxPackedBytes)
  enforceBudget(name, "unpacked", result.unpackedSize, budget.maxUnpackedBytes)
  aggregatePackedBytes += result.size
  aggregateUnpackedBytes += result.unpackedSize
  console.log(
    `${name}: ${result.size} packed bytes, ${result.unpackedSize} unpacked bytes, ${result.entryCount} files`
  )
}

enforceBudget(
  "public package set",
  "packed",
  aggregatePackedBytes,
  budgets.aggregate.maxPackedBytes
)
enforceBudget(
  "public package set",
  "unpacked",
  aggregateUnpackedBytes,
  budgets.aggregate.maxUnpackedBytes
)
if (
  measurements.aggregate.packedBytes !== aggregatePackedBytes ||
  measurements.aggregate.unpackedBytes !== aggregateUnpackedBytes
) {
  throw new Error(
    "Checked-in aggregate package-size evidence is stale; run bun run packages:size:review after building"
  )
}
console.log(
  `\nPublic package set: ${aggregatePackedBytes} packed bytes, ${aggregateUnpackedBytes} unpacked bytes; all artifact and size-budget checks passed`
)

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
    throw error
  }
}

function enforceBudget(
  subject: string,
  measurement: string,
  actual: number,
  maximum: number
): void {
  if (actual > maximum) {
    throw new Error(
      `${subject}: ${measurement} size ${actual} exceeds budget ${maximum}`
    )
  }
}
