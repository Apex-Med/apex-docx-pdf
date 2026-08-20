---
name: integrate-apex-docx-pdf
description: Integrate the Apex DOCX PDF TypeScript package safely in Bun, Node, or browser-worker applications. Use when adding `apex-docx-pdf` or `@apexmed/browser`, wiring compile/render flows, configuring fonts, handling diagnostics and cancellation, designing deterministic caches, or debugging a consumer integration.
---

# Integrate Apex DOCX PDF

Build against the recommended facade and keep the package's bounded profile, engine ownership, and fail-closed diagnostics intact.

## Load only the needed reference

- Read [references/integration-api.md](references/integration-api.md) for concrete Bun/Node and browser-worker code.
- Read [references/security-and-determinism.md](references/security-and-determinism.md) when handling untrusted templates, persistence, caching, limits, diagnostics, or production review.
- Use the sibling `generate-compatible-docx-template` skill when the task creates or changes a `.docx` template.
- Use the sibling `bind-apex-form` skill when mapping `@apexmed/forms` answers onto template tags.

## Integration workflow

1. Inspect the consumer's runtime, package manager, existing document boundary, and data source before editing.
2. Install `apex-docx-pdf@next` with Bun. Add `@apexmed/browser@next` only for a Web Worker, `@apexmed/forms@next` for a headless questionnaire model, and `@apexmed/devtools@next` only for React diagnostics UI.
3. Create one engine per stable font/limit configuration. Supply immutable, application-owned static TrueType bytes when the template needs fonts outside the bounded Helvetica fallback.
4. Inspect the exact DOCX bytes. Surface inspection diagnostics and required font tuples before accepting the template.
5. Compile with `unsupportedFeatures: "strict"` unless the product explicitly accepts a documented fallback. Keep the returned compiled object in the same engine instance.
6. Derive simple validation from `compiled.manifest`, `compiled.jsonSchema`, and `compiled.starterData`. For a hosted questionnaire, use `@apexmed/forms` and the `bind-apex-form` skill instead of maintaining a divergent schema by hand.
7. Render with explicit `locale` and `timeZone`, immutable JSON-like data, and an `AbortSignal` when work must be cancellable.
8. Return or persist only a successful `RenderResult`. Preserve `templateHash`, `documentHash`, `ENGINE_VERSION`, font-registry hash, options, resource usage, and redacted diagnostics as appropriate for the host application.
9. Test repeat-identical output, missing/wrong data, unsupported content, cancellation, resource limits, long content, pagination, and every font/image family used by the application.

## Required contracts

- Treat a compiled template as opaque and engine-instance-bound. Never serialize or reconstruct it.
- Treat diagnostics as data. Do not swallow warnings or turn a failed operation into a partial PDF.
- Never add runtime Word/LibreOffice/Chromium conversion, external font/image fetches, OS font discovery, or uploaded embedded-font execution as an implicit fallback.
- Keep `ENGINE_VERSION` separate from the npm version when partitioning render caches.
- Use the high-level facade for hostile input. Low-level `@apexmed/*` pipeline packages can bypass engine safety orchestration.
- Keep the playground/local integration local unless the host adds its own reviewed identity, authorization, retention, and tenant boundaries.

## Completion evidence

Before declaring the integration complete:

- Run the consumer's format, lint, type, test, and build gates.
- Compile and render a representative real template under the target runtime.
- Verify the PDF header, page count, searchable/upright text, diagnostics, and deterministic repeat output.
- Exercise the browser worker in a real browser when browser support is in scope.
- Record unsupported features honestly instead of claiming general DOCX compatibility.
