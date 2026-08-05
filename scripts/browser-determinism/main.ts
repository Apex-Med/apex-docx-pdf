import { BrowserRendererClient } from "../../packages/browser/src"
import {
  createRejectionEvidence,
  createRenderEvidence,
  createRuntimeCoreRejectionCases,
  createRuntimeCoreRenderCases,
  type RuntimeCoreSuiteEvidence,
} from "../runtime-core-suite"
import golden from "../runtime-core-suite.golden.json"

type BrowserPerformance = Readonly<{
  workerStartupToFirstRenderMs: number
}>

declare global {
  interface Window {
    __apexBrowserDeterminism?: Readonly<
      | {
          status: "passed"
          evidence: RuntimeCoreSuiteEvidence
          performance: BrowserPerformance
        }
      | { status: "failed"; message: string }
    >
  }
}

void run()

async function run(): Promise<void> {
  const status = document.querySelector("#status")
  const workerStartedAt = performance.now()
  const worker = new Worker(
    new URL("../../apps/web/src/workers/render.worker.ts", import.meta.url),
    { type: "module" }
  )
  const client = new BrowserRendererClient(worker)
  try {
    let firstRenderCompletedAt: number | undefined
    const evidence: Record<string, RuntimeCoreSuiteEvidence[string]> = {}
    for (const testCase of createRuntimeCoreRenderCases()) {
      const compiled = await client.compile(testCase.templateBytes)
      const rendered = await client.render(
        compiled.templateHash,
        testCase.data,
        testCase.options
      )
      evidence[testCase.id] = await createRenderEvidence(
        compiled.fontRegistryHash,
        rendered
      )
      firstRenderCompletedAt ??= performance.now()
    }
    for (const testCase of createRuntimeCoreRejectionCases()) {
      const compiled = await client.compile(testCase.templateBytes)
      try {
        await client.render(
          compiled.templateHash,
          testCase.data,
          testCase.options
        )
        throw new Error(`Core suite case ${testCase.id} unexpectedly rendered`)
      } catch (error) {
        evidence[testCase.id] = createRejectionEvidence(error)
      }
    }
    if (JSON.stringify(evidence) !== JSON.stringify(golden)) {
      throw new Error(
        `Browser worker diverged from canonical core-suite evidence\nExpected: ${JSON.stringify(golden)}\nReceived: ${JSON.stringify(evidence)}`
      )
    }
    window.__apexBrowserDeterminism = {
      status: "passed",
      evidence,
      performance: {
        workerStartupToFirstRenderMs: Number(
          (
            (firstRenderCompletedAt ?? performance.now()) - workerStartedAt
          ).toFixed(3)
        ),
      },
    }
    if (status) status.textContent = "Browser determinism gate passed"
  } catch (error) {
    const message =
      error instanceof Error ? (error.stack ?? error.message) : String(error)
    window.__apexBrowserDeterminism = { status: "failed", message }
    if (status) status.textContent = message
    console.error(message)
  } finally {
    client.dispose()
  }
}
