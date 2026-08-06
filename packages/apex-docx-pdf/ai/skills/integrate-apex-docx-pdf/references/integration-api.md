# Integration API

## Bun or Node

```ts
import { EngineOperationError, createDocxPdfEngine } from "apex-docx-pdf"

const engine = await createDocxPdfEngine({
  // Add application-owned fonts and reviewed limit overrides here.
})

try {
  const inspection = await engine.inspect(templateBytes)
  if (!inspection.documentModelAvailable) {
    throw new Error("The template has no safe semantic document model")
  }

  const compiled = await engine.compile(templateBytes, {
    unsupportedFeatures: "strict",
  })

  const rendered = await engine.render(compiled, data, {
    locale: "en-ZA",
    timeZone: "Africa/Johannesburg",
    metadata: { title: "Generated document" },
    includeLayoutTrace: true,
    signal,
  })

  await Bun.write("output.pdf", rendered.pdf)
} catch (error) {
  if (error instanceof EngineOperationError) {
    reportStructuredFailure(error.code, error.diagnostics)
  }
  throw error
}
```

`inspect()` reports whether a semantic document model is available, required font family/weight/style tuples, discovered feature kinds, and bounded source locations. `compile()` returns the template hash, manifest, JSON Schema Draft 2020-12, starter data, diagnostics, and an opaque engine-owned compiled value. `render()` returns PDF bytes, page count, document/template hashes, diagnostics, timings, deterministic resource usage, and an optional layout trace.

`signal` belongs inside server `inspect`, `compile`, `preview`, and `render` options. Browser cancellation uses the separate request-options argument shown below. Import the exported `DEFAULT_RESOURCE_LIMITS` and `ResourceLimits` types when reviewing overrides; do not invent a second unbounded limit model.

Render options always require `locale` and `timeZone`. The deterministic locale profiles currently accepted by formatters are `en-US` and `en-ZA`. Date values used by the formatter must be offset-bearing ISO 8601 strings.

## Explicit font configuration

```ts
const fonts = {
  faces: [
    {
      family: "Example Sans",
      weight: 400,
      style: "normal",
      bytes: exampleSansRegularBytes,
    },
    {
      family: "Example Sans",
      weight: 700,
      style: "normal",
      bytes: exampleSansBoldBytes,
    },
  ],
  aliases: [{ from: "Arial", to: "Example Sans" }],
  fallbackFamily: "Example Sans",
} as const

const engine = await createDocxPdfEngine({ fonts })
```

Register real static TrueType programs for every supported tuple. Do not register one variable file as several weights, discover OS fonts, or fetch a font during rendering. Retain font license and provenance evidence.

## Browser worker

```ts
// render.worker.ts
import { installRendererWorker } from "@apexmed/browser/worker"

installRendererWorker(undefined, loadApplicationOwnedEngineOptions())
```

```ts
import { BrowserRendererClient } from "@apexmed/browser"

const worker = new Worker(new URL("./render.worker.ts", import.meta.url), {
  type: "module",
})
const renderer = new BrowserRendererClient(worker)

const compiled = await renderer.compile(templateBytes, { signal })
const rendered = await renderer.render(
  compiled.templateHash,
  data,
  {
    locale: "en-ZA",
    timeZone: "Africa/Johannesburg",
  },
  { signal }
)

renderer.dispose()
```

Keep object URL creation/revocation and worker disposal in the host application lifecycle. A worker retains compiled templates only for its own lifetime.
