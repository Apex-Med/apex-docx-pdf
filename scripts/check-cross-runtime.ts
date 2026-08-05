import { mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"

const repositoryRoot = join(import.meta.dir, "..")
const outputPath = join(repositoryRoot, ".tmp", "runtime-render-smoke.mjs")

await mkdir(dirname(outputPath), { recursive: true })

const build = await Bun.build({
  entrypoints: [join(import.meta.dir, "runtime-render-smoke.ts")],
  target: "node",
  format: "esm",
  minify: false,
  sourcemap: "external",
  naming: "runtime-render-smoke.mjs",
  outdir: dirname(outputPath),
})

if (!build.success) {
  throw new Error(
    `Unable to bundle the cross-runtime smoke: ${build.logs.map(String).join("\n")}`
  )
}

const bunCommand = process.execPath
const nodeCommand = "node"
const [bunFirst, bunSecond, nodeResult, bunVersion, nodeVersion] =
  await Promise.all([
    run([bunCommand, outputPath]),
    run([bunCommand, outputPath]),
    run([nodeCommand, outputPath]),
    run([bunCommand, "--version"]),
    run([nodeCommand, "--version"]),
  ])

if (bunFirst !== bunSecond) {
  throw new Error("Separate Bun processes produced different render evidence")
}
if (bunFirst !== nodeResult) {
  throw new Error(
    `Bun and Node produced different render evidence\nBun: ${bunFirst}\nNode: ${nodeResult}`
  )
}

console.log(
  `Canonical core suite matched in separate Bun processes and Node (${bunVersion}, ${nodeVersion}): ${bunFirst}`
)

async function run(command: string[]): Promise<string> {
  const process = Bun.spawn(command, {
    cwd: repositoryRoot,
    stdout: "pipe",
    stderr: "pipe",
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ])
  if (exitCode !== 0) {
    throw new Error(
      `${command.join(" ")} failed with exit code ${exitCode}: ${stderr.trim()}`
    )
  }
  return stdout.trim()
}
