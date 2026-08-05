import { join } from "node:path"

import { chromium } from "playwright"
import { build, preview } from "vite"
import type { RuntimeCoreSuiteEvidence } from "./runtime-core-suite"

type GateResult = Readonly<
  | {
      status: "passed"
      evidence: RuntimeCoreSuiteEvidence
      performance: Readonly<{
        workerStartupToFirstRenderMs: number
      }>
    }
  | { status: "failed"; message: string }
>

const repositoryRoot = join(import.meta.dir, "..")
const configFile = join(
  repositoryRoot,
  "scripts",
  "browser-determinism",
  "vite.config.mts"
)
const host = "127.0.0.1"
const port = 4178

await build({ configFile })
const server = await preview({
  configFile,
  preview: { host, port, strictPort: true },
})
const browser = await chromium.launch({ headless: true })

try {
  const page = await browser.newPage()
  const runtimeErrors: string[] = []
  page.on("console", (message) => {
    if (message.type() === "error")
      runtimeErrors.push(`console: ${message.text()}`)
  })
  page.on("pageerror", (error) => runtimeErrors.push(`page: ${error.message}`))
  page.on("requestfailed", (request) => {
    runtimeErrors.push(
      `request: ${request.method()} ${request.url()} (${request.failure()?.errorText ?? "failed"})`
    )
  })

  const response = await page.goto(`http://${host}:${port}`, {
    waitUntil: "load",
  })
  if (!response?.ok()) {
    throw new Error(
      `Browser harness returned HTTP ${response?.status() ?? "unknown"}`
    )
  }
  await page.waitForFunction(
    () => window.__apexBrowserDeterminism !== undefined,
    undefined,
    { timeout: 30_000 }
  )
  const result = await page.evaluate(
    (): GateResult => window.__apexBrowserDeterminism as GateResult
  )
  if (result.status === "failed") throw new Error(result.message)
  if (runtimeErrors.length > 0) {
    throw new Error(`Browser runtime errors:\n${runtimeErrors.join("\n")}`)
  }
  console.log(
    `Real Chromium module worker matched the canonical Bun/Node core suite: ${JSON.stringify(result.evidence)}`
  )
  console.log(
    `Chromium worker startup-to-first-render: ${result.performance.workerStartupToFirstRenderMs.toFixed(3)} ms`
  )
} finally {
  await browser.close()
  await server.close()
}
