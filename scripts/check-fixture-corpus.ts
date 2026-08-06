import { readFile } from "node:fs/promises"
import { isAbsolute, normalize, relative, resolve, sep } from "node:path"

const REQUIRED_EDITORS = ["microsoft-word", "google-docs"] as const
const REQUIRED_SCENARIOS = [
  "one-page-business-letter",
  "multi-page-legal-agreement",
  "nested-legal-numbering",
  "invoice-repeating-rows",
  "multi-page-table",
  "repeating-table-headers",
  "logo-and-footer",
  "page-x-of-y",
  "signature-table",
  "fragmented-tags",
  "missing-font-handling",
  "multiple-sections",
  "unsupported-features",
  "malformed-packages",
  "security-attacks",
] as const
const FIXTURE_ROOT = resolve(import.meta.dir, "..", "fixtures")
const RELEASE = Bun.argv.includes("--release")

type Editor = (typeof REQUIRED_EDITORS)[number] | "synthetic"
type Scenario = (typeof REQUIRED_SCENARIOS)[number]
type Fixture = Readonly<{
  id: string
  file: string
  sha256: string
  authoring: Readonly<{
    editor: Editor
    version: string
    exportedAt: string
    exportFormat: string
  }>
  license: Readonly<{
    spdx: string
    sourceUrl: string
    redistributionAllowed: boolean
    notice?: string
  }>
  containsPersonalData: boolean
  scenarios: readonly Scenario[]
  expectedOutcome: "render" | "compile-rejection" | "inspect-rejection"
  expected: Readonly<{
    diagnosticCodes: readonly string[]
    pageCount?: number
    searchableTextIncludes?: readonly string[]
    pdfSha256?: string
    layoutTraceSha256?: string
  }>
}>
type Manifest = Readonly<{
  schemaVersion: number
  corpusId: string
  fixtures: readonly Fixture[]
}>

const manifest = JSON.parse(
  await readFile(resolve(FIXTURE_ROOT, "manifest.json"), "utf8")
) as Manifest
const errors: string[] = []
if (manifest.schemaVersion !== 1) errors.push("schemaVersion must equal 1")
if (typeof manifest.corpusId !== "string" || manifest.corpusId.length === 0) {
  errors.push("corpusId must be a non-empty string")
}
if (!Array.isArray(manifest.fixtures)) errors.push("fixtures must be an array")

const ids = new Set<string>()
const files = new Set<string>()
const editors = new Set<Editor>()
const scenarios = new Set<Scenario>()

for (const [index, fixture] of (manifest.fixtures ?? []).entries()) {
  const label = `fixtures[${index}]`
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(fixture.id)) {
    errors.push(`${label}.id must be a lowercase kebab-case identifier`)
  }
  if (ids.has(fixture.id)) errors.push(`${label}.id is duplicated`)
  ids.add(fixture.id)
  if (!/^docx\/[a-zA-Z0-9._-]+\.docx$/u.test(fixture.file)) {
    errors.push(`${label}.file must be a direct docx/*.docx path`)
  }
  if (files.has(fixture.file)) errors.push(`${label}.file is duplicated`)
  files.add(fixture.file)
  if (!/^[a-f0-9]{64}$/u.test(fixture.sha256)) {
    errors.push(`${label}.sha256 must be a lowercase SHA-256`)
  }

  const fixturePath = resolve(FIXTURE_ROOT, normalize(fixture.file))
  const relativePath = relative(FIXTURE_ROOT, fixturePath)
  if (
    isAbsolute(relativePath) ||
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`)
  ) {
    errors.push(`${label}.file escapes the fixture directory`)
  } else if (!(await Bun.file(fixturePath).exists())) {
    errors.push(`${label}.file does not exist: ${fixture.file}`)
  } else {
    const bytes = new Uint8Array(await Bun.file(fixturePath).arrayBuffer())
    if (
      bytes[0] !== 0x50 ||
      bytes[1] !== 0x4b ||
      bytes[2] !== 0x03 ||
      bytes[3] !== 0x04
    ) {
      errors.push(`${label}.file does not begin with DOCX ZIP magic bytes`)
    }
    if ((await sha256Hex(bytes)) !== fixture.sha256) {
      errors.push(`${label}.sha256 does not match ${fixture.file}`)
    }
  }

  if (
    !REQUIRED_EDITORS.includes(fixture.authoring.editor as never) &&
    fixture.authoring.editor !== "synthetic"
  ) {
    errors.push(`${label}.authoring.editor is unsupported`)
  }
  editors.add(fixture.authoring.editor)
  if (!fixture.authoring.version || fixture.authoring.exportFormat !== "docx") {
    errors.push(
      `${label}.authoring must record a version and docx export format`
    )
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(fixture.authoring.exportedAt)) {
    errors.push(`${label}.authoring.exportedAt must be YYYY-MM-DD`)
  }
  if (
    !fixture.license.spdx ||
    !isHttpUrl(fixture.license.sourceUrl) ||
    fixture.license.redistributionAllowed !== true
  ) {
    errors.push(
      `${label}.license must record SPDX, an HTTP(S) origin, and explicit redistribution permission`
    )
  }
  if (fixture.containsPersonalData !== false) {
    errors.push(`${label}.containsPersonalData must be false`)
  }
  if (!Array.isArray(fixture.scenarios) || fixture.scenarios.length === 0) {
    errors.push(`${label}.scenarios must contain at least one scenario`)
  }
  for (const scenario of fixture.scenarios ?? []) {
    if (!REQUIRED_SCENARIOS.includes(scenario)) {
      errors.push(`${label}.scenarios contains unknown scenario '${scenario}'`)
    }
    scenarios.add(scenario)
  }
  if (new Set(fixture.scenarios).size !== fixture.scenarios.length) {
    errors.push(`${label}.scenarios contains duplicates`)
  }
  if (
    !["render", "compile-rejection", "inspect-rejection"].includes(
      fixture.expectedOutcome
    )
  ) {
    errors.push(`${label}.expectedOutcome is unsupported`)
  }
  if (!Array.isArray(fixture.expected?.diagnosticCodes)) {
    errors.push(`${label}.expected.diagnosticCodes must be an array`)
  }
  if (
    fixture.expectedOutcome === "render" &&
    (fixture.expected.pageCount === undefined ||
      fixture.expected.pageCount < 1 ||
      !Number.isInteger(fixture.expected.pageCount))
  ) {
    errors.push(`${label}.expected.pageCount is required for render fixtures`)
  }
}

const missingEditors = REQUIRED_EDITORS.filter((editor) => !editors.has(editor))
const missingScenarios = REQUIRED_SCENARIOS.filter(
  (scenario) => !scenarios.has(scenario)
)
if (RELEASE) {
  if (missingEditors.length > 0) {
    errors.push(
      `release corpus is missing editor exports: ${missingEditors.join(", ")}`
    )
  }
  if (missingScenarios.length > 0) {
    errors.push(
      `release corpus is missing scenarios: ${missingScenarios.join(", ")}`
    )
  }
}

if (errors.length > 0) {
  throw new Error(`Fixture corpus validation failed:\n- ${errors.join("\n- ")}`)
}

console.log(
  `Fixture corpus valid: ${manifest.fixtures.length} files, ${editors.size}/${REQUIRED_EDITORS.length} required editors, ${scenarios.size}/${REQUIRED_SCENARIOS.length} scenarios${RELEASE ? ", release-complete" : ""}`
)
if (!RELEASE && (missingEditors.length > 0 || missingScenarios.length > 0)) {
  console.log(
    `Release evidence pending: editors [${missingEditors.join(", ")}], scenarios [${missingScenarios.join(", ")}]`
  )
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:"
  } catch {
    return false
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")
}
