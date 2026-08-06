#!/usr/bin/env bun

import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { EngineOperationError, createDocxPdfEngine } from "apex-docx-pdf"

const input = process.argv[2]
if (!input || process.argv.length > 3) {
  console.error("Usage: bun inspect-template.mjs <template.docx>")
  process.exit(2)
}

const absolutePath = resolve(input)
const file = await readFile(absolutePath)
const templateBytes = new Uint8Array(
  file.buffer,
  file.byteOffset,
  file.byteLength
)
const engine = await createDocxPdfEngine()
const inspection = await engine.inspect(templateBytes)

let compilation
try {
  const compiled = await engine.compile(templateBytes, {
    unsupportedFeatures: "strict",
  })
  compilation = {
    ok: true,
    version: compiled.version,
    templateHash: compiled.templateHash,
    manifest: compiled.manifest,
    jsonSchema: compiled.jsonSchema,
    starterData: compiled.starterData,
    diagnostics: compiled.diagnostics,
  }
} catch (error) {
  if (!(error instanceof EngineOperationError)) throw error
  compilation = {
    ok: false,
    code: error.code,
    message: error.message,
    diagnostics: error.diagnostics,
  }
}

console.log(
  JSON.stringify(
    {
      file: absolutePath,
      engineVersion: engine.version,
      inspection,
      compilation,
    },
    null,
    2
  )
)

if (
  !inspection.documentModelAvailable ||
  inspection.diagnostics.some(({ severity }) => severity === "error") ||
  !compilation.ok
) {
  process.exitCode = 1
}
