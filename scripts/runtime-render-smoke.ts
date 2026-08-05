import { createDocxPdfEngine } from "../packages/engine/src"
import golden from "./runtime-core-suite.golden.json"
import {
  createRejectionEvidence,
  createRenderEvidence,
  createRuntimeCoreRejectionCases,
  createRuntimeCoreRenderCases,
  type RuntimeCoreSuiteEvidence,
} from "./runtime-core-suite"
import { loadOfflineFontConfiguration } from "./offline-font-configuration"

const engine = await createDocxPdfEngine({
  fonts: await loadOfflineFontConfiguration(),
})
if (engine.fontRegistryHash === undefined)
  throw new Error("Runtime core suite requires the offline font registry")

const result: Record<string, RuntimeCoreSuiteEvidence[string]> = {}
for (const testCase of createRuntimeCoreRenderCases()) {
  const compiled = await engine.compile(testCase.templateBytes)
  const rendered = await engine.render(
    compiled,
    testCase.data,
    testCase.options
  )
  result[testCase.id] = await createRenderEvidence(
    engine.fontRegistryHash,
    rendered
  )
}
for (const testCase of createRuntimeCoreRejectionCases()) {
  const compiled = await engine.compile(testCase.templateBytes)
  try {
    await engine.render(compiled, testCase.data, testCase.options)
    throw new Error(`Core suite case ${testCase.id} unexpectedly rendered`)
  } catch (error) {
    result[testCase.id] = createRejectionEvidence(error)
  }
}

if (JSON.stringify(result) !== JSON.stringify(golden)) {
  throw new Error(
    `Runtime core suite diverged from canonical evidence\nExpected: ${JSON.stringify(golden)}\nReceived: ${JSON.stringify(result)}`
  )
}

console.log(JSON.stringify(result))
