import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { buildMinimalDocx } from "../packages/testkit/src/docx"

const PUBLIC_PACKAGE_DIRECTORIES = [
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
const RUNTIME_PACKAGE_NAMES = [
  "apex-docx-pdf",
  "@apex-docx-pdf/core",
  "@apex-docx-pdf/docx",
  "@apex-docx-pdf/engine",
  "@apex-docx-pdf/fonts",
  "@apex-docx-pdf/images",
  "@apex-docx-pdf/layout",
  "@apex-docx-pdf/pdf",
  "@apex-docx-pdf/template",
] as const

type PackageManifest = Readonly<{ name: string; version: string }>
type PackResult = Readonly<{
  filename: string
  name: string
  version: string
  size: number
}>

const temporaryRoot = await mkdtemp(
  join(tmpdir(), "apex-docx-pdf-packed-consumer-")
)
const tarballDirectory = join(temporaryRoot, "tarballs")
const runtimeConsumerDirectory = join(temporaryRoot, "runtime-consumer")
const apiConsumerDirectory = join(temporaryRoot, "api-consumer")

try {
  await Promise.all([
    mkdir(tarballDirectory, { recursive: true }),
    mkdir(runtimeConsumerDirectory, { recursive: true }),
    mkdir(apiConsumerDirectory, { recursive: true }),
  ])

  const dependencies: Record<string, string> = {}
  const packageVersions: Record<string, string> = {}
  let tarballBytes = 0

  for (const directoryName of PUBLIC_PACKAGE_DIRECTORIES) {
    const distributionDirectory = join(
      process.cwd(),
      "packages",
      directoryName,
      "dist"
    )
    const manifest = await readJson<PackageManifest>(
      join(distributionDirectory, "package.json")
    )
    const packed = run(
      [
        "npm",
        "pack",
        "--json",
        "--ignore-scripts",
        "--pack-destination",
        tarballDirectory,
        distributionDirectory,
      ],
      process.cwd()
    )
    const packResult = (JSON.parse(packed.stdout) as PackResult[])[0]
    if (!packResult) {
      throw new Error(`${manifest.name}: npm pack returned no tarball`)
    }
    if (
      packResult.name !== manifest.name ||
      packResult.version !== manifest.version
    ) {
      throw new Error(`${manifest.name}: tarball identity does not match dist`)
    }

    const tarballPath = join(tarballDirectory, packResult.filename)
    const actualTarballBytes = (await stat(tarballPath)).size
    if (actualTarballBytes !== packResult.size) {
      throw new Error(`${manifest.name}: tarball byte count changed after pack`)
    }
    dependencies[manifest.name] = `file:${tarballPath}`
    packageVersions[manifest.name] = manifest.version
    tarballBytes += actualTarballBytes
  }

  const tooling = {
    react: await installedVersion("apps/web/node_modules/react/package.json"),
    "@types/react": await installedVersion(
      "apps/web/node_modules/@types/react/package.json"
    ),
    typescript: await installedVersion("node_modules/typescript/package.json"),
  }
  const umbrellaTarball = dependencies["apex-docx-pdf"]
  if (!umbrellaTarball) throw new Error("The umbrella tarball is missing")
  await Bun.write(
    join(runtimeConsumerDirectory, "package.json"),
    `${JSON.stringify(
      {
        name: "apex-docx-pdf-packed-runtime-consumer-smoke",
        private: true,
        type: "module",
        dependencies: { "apex-docx-pdf": umbrellaTarball },
        overrides: dependencies,
      },
      null,
      2
    )}\n`
  )
  await Bun.write(
    join(apiConsumerDirectory, "package.json"),
    `${JSON.stringify(
      {
        name: "apex-docx-pdf-packed-consumer-smoke",
        private: true,
        type: "module",
        dependencies: {
          ...dependencies,
          react: tooling.react,
        },
        overrides: dependencies,
        devDependencies: {
          "@types/react": tooling["@types/react"],
          typescript: tooling.typescript,
        },
      },
      null,
      2
    )}\n`
  )
  await Bun.write(
    join(apiConsumerDirectory, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          allowJs: true,
          checkJs: true,
          lib: ["ES2022", "DOM", "DOM.Iterable"],
          module: "NodeNext",
          moduleResolution: "NodeNext",
          noEmit: true,
          skipLibCheck: false,
          strict: true,
          target: "ES2022",
        },
        include: ["index.mjs"],
      },
      null,
      2
    )}\n`
  )

  const fixture = buildMinimalDocx({
    paragraphs: [
      { runs: ["Hello {{customer.", "name:string}}"] },
      "Issued {{issuedAt:date | date}}",
    ],
  })
  const fixtureBase64 = Buffer.from(fixture).toString("base64")
  await Bun.write(
    join(runtimeConsumerDirectory, "index.mjs"),
    consumerSource(fixtureBase64, false)
  )
  await Bun.write(
    join(apiConsumerDirectory, "index.mjs"),
    consumerSource(fixtureBase64, true)
  )

  run(
    [
      "bun",
      "install",
      "--backend=copyfile",
      `--cache-dir=${join(temporaryRoot, "bun-cache")}`,
      "--ignore-scripts",
      "--no-progress",
      "--production",
    ],
    runtimeConsumerDirectory
  )
  await verifyPackedInstall(
    runtimeConsumerDirectory,
    RUNTIME_PACKAGE_NAMES,
    packageVersions
  )
  const runtimeBunResult = run(
    ["bun", "index.mjs"],
    runtimeConsumerDirectory
  ).stdout.trim()
  const runtimeNodeResult = run(
    ["node", "index.mjs"],
    runtimeConsumerDirectory
  ).stdout.trim()
  if (runtimeBunResult !== runtimeNodeResult) {
    throw new Error(
      `Packed runtime consumer output differs across Bun and Node:\nBun: ${runtimeBunResult}\nNode: ${runtimeNodeResult}`
    )
  }

  run(
    [
      "bun",
      "install",
      "--backend=copyfile",
      `--cache-dir=${join(temporaryRoot, "bun-cache")}`,
      "--ignore-scripts",
      "--no-progress",
    ],
    apiConsumerDirectory
  )
  await verifyPackedInstall(
    apiConsumerDirectory,
    Object.keys(packageVersions),
    packageVersions
  )
  run(
    [join(apiConsumerDirectory, "node_modules/.bin/tsc")],
    apiConsumerDirectory
  )
  const apiBunResult = run(
    ["bun", "index.mjs"],
    apiConsumerDirectory
  ).stdout.trim()
  const apiNodeResult = run(
    ["node", "index.mjs"],
    apiConsumerDirectory
  ).stdout.trim()
  if (apiBunResult !== apiNodeResult || apiBunResult !== runtimeBunResult) {
    throw new Error(
      `Packed API consumer output differs across package surface or runtime:\nRuntime: ${runtimeBunResult}\nBun API: ${apiBunResult}\nNode API: ${apiNodeResult}`
    )
  }

  const runtimeInstalled = await measureTree(
    join(runtimeConsumerDirectory, "node_modules")
  )
  const apiInstalled = await measureTree(
    join(apiConsumerDirectory, "node_modules")
  )
  console.log(
    JSON.stringify(
      {
        status: "passed",
        publicPackages: PUBLIC_PACKAGE_DIRECTORIES.length,
        tarballBytes,
        runtimeInstall: runtimeInstalled,
        allPackagesTypecheckInstall: apiInstalled,
        bunVersion: Bun.version,
        nodeVersion: run(
          ["node", "--version"],
          runtimeConsumerDirectory
        ).stdout.trim(),
        result: JSON.parse(runtimeBunResult) as unknown,
      },
      null,
      2
    )
  )
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}

function consumerSource(
  fixtureBase64: string,
  importAllPackages: boolean
): string {
  const packageImports = importAllPackages
    ? `import * as browser from "@apex-docx-pdf/browser"
import * as core from "@apex-docx-pdf/core"
import * as devtools from "@apex-docx-pdf/devtools"
import * as docx from "@apex-docx-pdf/docx"
import * as enginePackage from "@apex-docx-pdf/engine"
import * as fonts from "@apex-docx-pdf/fonts"
import * as images from "@apex-docx-pdf/images"
import * as layout from "@apex-docx-pdf/layout"
import * as pdf from "@apex-docx-pdf/pdf"
import * as template from "@apex-docx-pdf/template"

const modules = { browser, core, devtools, docx, enginePackage, fonts, images, layout, pdf, template }
for (const [name, module] of Object.entries(modules)) {
  if (Object.keys(module).length === 0) throw new Error(name + " has no public exports")
}
`
    : ""

  return `${packageImports}import { createDocxPdfEngine } from "apex-docx-pdf"

const templateBytes = decodeBase64(${JSON.stringify(fixtureBase64)})
const engine = await createDocxPdfEngine()
const inspection = await engine.inspect(templateBytes)
if (!inspection.documentModelAvailable || inspection.diagnostics.some(({ severity }) => severity === "error")) {
  throw new Error("The packed consumer could not inspect the fixture")
}
const compiled = await engine.compile(templateBytes)
const paths = compiled.manifest.fields.map(({ path }) => path)
if (JSON.stringify(paths) !== JSON.stringify(["customer.name", "issuedAt"])) {
  throw new Error("The packed manifest is incorrect: " + JSON.stringify(paths))
}
const renderOptions = { locale: "en-ZA", timeZone: "Africa/Johannesburg", includeLayoutTrace: true }
const data = { customer: { name: "Ada Lovelace" }, issuedAt: "2026-08-05T09:30:00+02:00" }
const first = await engine.render(compiled, data, renderOptions)
const second = await engine.render(compiled, data, renderOptions)
if (first.pageCount !== 1 || first.diagnostics.some(({ severity }) => severity === "error")) {
  throw new Error("The packed consumer render failed")
}
if (first.pdf.length !== second.pdf.length || first.pdf.some((byte, index) => byte !== second.pdf[index])) {
  throw new Error("The packed consumer render is not repeat-identical")
}
if (new TextDecoder().decode(first.pdf.subarray(0, 5)) !== "%PDF-") {
  throw new Error("The packed consumer did not produce a PDF")
}
if (first.resourceUsage.templateBytes !== templateBytes.byteLength || !first.layoutTrace) {
  throw new Error("The packed consumer result omitted resource usage or its requested trace")
}

console.log(JSON.stringify({
  engineVersion: engine.version,
  fields: paths,
  pageCount: first.pageCount,
  pdfBytes: first.pdf.byteLength,
  pdfSha256: await sha256(first.pdf),
  templateHash: first.templateHash,
  documentHash: first.documentHash,
}))

/** @param {string} value */
function decodeBase64(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
  const clean = value.replace(/=+$/u, "")
  const bytes = []
  let bits = 0
  let bitCount = 0
  for (const character of clean) {
    const digit = alphabet.indexOf(character)
    if (digit < 0) throw new Error("Invalid embedded base64")
    bits = bits * 64 + digit
    bitCount += 6
    if (bitCount >= 8) {
      bitCount -= 8
      bytes.push((bits >>> bitCount) & 255)
      bits &= (1 << bitCount) - 1
    }
  }
  return Uint8Array.from(bytes)
}

/** @param {Uint8Array} bytes */
async function sha256(bytes) {
  const owned = new Uint8Array(bytes.byteLength)
  owned.set(bytes)
  const digest = await crypto.subtle.digest("SHA-256", owned.buffer)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}
`
}

async function installedVersion(path: string): Promise<string> {
  return (await readJson<PackageManifest>(path)).version
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T
}

async function verifyPackedInstall(
  consumerDirectory: string,
  names: readonly string[],
  expectedVersions: Readonly<Record<string, string>>
): Promise<void> {
  const lockfilePath = join(consumerDirectory, "bun.lock")
  if (await Bun.file(lockfilePath).exists()) {
    const lockfile = await readFile(lockfilePath, "utf8")
    if (lockfile.includes("workspace:") || lockfile.includes(process.cwd())) {
      throw new Error(
        "The isolated consumer lockfile resolved a workspace instead of tarballs"
      )
    }
  }
  for (const name of names) {
    const expectedVersion = expectedVersions[name]
    if (!expectedVersion)
      throw new Error(`${name}: expected version is missing`)
    const installedDirectory = join(consumerDirectory, "node_modules", name)
    const resolvedDirectory = await realpath(installedDirectory)
    if (resolvedDirectory.startsWith(process.cwd())) {
      throw new Error(`${name}: installed package resolved into the workspace`)
    }
    const installed = await readJson<PackageManifest>(
      join(installedDirectory, "package.json")
    )
    if (installed.name !== name || installed.version !== expectedVersion) {
      throw new Error(`${name}: installed package identity is incorrect`)
    }
  }
}

function run(
  command: readonly string[],
  cwd: string
): Readonly<{ stdout: string; stderr: string }> {
  const result = Bun.spawnSync([...command], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  })
  const stdout = result.stdout.toString()
  const stderr = result.stderr.toString()
  if (result.exitCode !== 0) {
    throw new Error(
      `${command.join(" ")} failed with exit code ${result.exitCode}\n${stdout}\n${stderr}`
    )
  }
  return { stdout, stderr }
}

async function measureTree(
  path: string
): Promise<Readonly<{ bytes: number; files: number }>> {
  const information = await lstat(path)
  if (information.isSymbolicLink()) return { bytes: 0, files: 0 }
  if (information.isFile()) return { bytes: information.size, files: 1 }
  if (!information.isDirectory()) return { bytes: 0, files: 0 }
  let bytes = 0
  let files = 0
  for (const entry of await readdir(path)) {
    const measured = await measureTree(join(path, entry))
    bytes += measured.bytes
    files += measured.files
  }
  return { bytes, files }
}
