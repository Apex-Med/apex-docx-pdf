# Public API review

Date: 2026-08-05. Scope: current source entrypoints, prepared `dist` manifests, and package validation. This is an API inventory, not a semver-stability or npm-publication promise.

## Supported application-facing surface

The narrow application facade is the `apex-docx-pdf` umbrella package. It re-exports the core contracts plus `createDocxPdfEngine`, `ENGINE_VERSION`, and `EngineOperationError` from `@apexmed/engine`. Consumers should pass hostile DOCX bytes to `inspect`/`compile`, retain the opaque compiled value, and call `preview`/`render` on the same engine instance.

`@apexmed/browser` is the supported browser transport boundary. Its client and worker bootstrap are public, and the prepared package exposes both `.` and `./worker` entrypoints.

`@apexmed/core` contains shared data contracts needed by engine configuration and results. Its branded constructors and low-level semantic/layout records remain implementation-building blocks rather than the recommended application entrypoint.

`@apexmed/devtools` is an opt-in React peer package. Its public `DisplayListPreview` renders the engine's canonical display list and source mappings; `LayoutTraceViewer` adds independently toggleable page/content boxes, block/line boxes, baselines, source-node labels, page-break reasons, and overflow overlays. Neither component approximates DOCX layout or loads fonts for the host.

## Internal or advanced surfaces

The `docx`, `fonts`, `images`, `layout`, `pdf`, and `template` packages expose pipeline stages. They support repository tests and advanced composition, but callers can bypass engine provenance checks and safety orchestration by composing them directly. Treat them as advanced/experimental until their invariants, compatibility policy, and error model are documented.

`@apexmed/testkit` remains private and test-only. It is not included in the public validation set and should never be a runtime dependency of the engine, browser, umbrella, or devtools packages.

## Current release-preparation evidence

1. The 11 public packages—`apex-docx-pdf`, browser, core, devtools, docx, engine, fonts, images, layout, pdf, and template—are in lockstep at `0.1.0-next.0`. Source workspace manifests point to TypeScript entrypoints for local development; each build prepares a separate ESM `dist` manifest with JavaScript, declarations, declaration maps/source maps where applicable, license, and README files.
2. `bun run packages:validate` passes for all 11 prepared packages. The gate runs strict Publint, `@arethetypeswrong/cli` with the ESM-only profile, and `npm pack --dry-run`. The reported CommonJS-to-ESM condition is intentionally ignored by that ESM-only profile; CommonJS is not a supported entry mode.
3. The root CI gate executes the checked-in PDF/layout-trace golden in separate Bun processes and Node 24, then matches the same evidence in a real Chromium module worker. This is concrete parity for the golden profile, not a promise of every Node/browser version or every supported document.
4. No npm package or `next` dist-tag publication was performed or verified. Local tarballs now pass isolated Bun installation, declaration/import, and Bun/Node render checks; the first registry publication, provenance confirmation, and post-publication registry install remain approval-gated work.
5. The umbrella currently re-exports the complete core barrel. This is convenient for the prerelease but also makes low-level constructors, semantic nodes, font adapters, resource defaults, and layout representations reachable. Replace or document that broad barrel before promising a stable 1.0 surface.
6. `@apexmed/fonts` likewise exposes implementation-oriented adapter contracts. Label parser/subsetter seams as advanced or move them to explicit subpaths before stable compatibility is promised.
7. `@apexmed/docx` exports parsed OOXML model types and normalization functions. Decide whether it is a supported parser API or engine-private before 1.0; the prerelease classifies it as advanced/experimental.
8. Compiled templates are structurally visible but engine-instance-bound through an internal `WeakSet`. Persistence or transfer across engine instances, workers, or processes is unsupported even though the value looks serializable.
9. `EngineOperationError.code` and diagnostic `code` are strings without a published compatibility taxonomy. Consumers may inspect them during the prerelease, but stable branching categories are not promised.
10. Browser request/response protocol types are reachable through the browser package. If they are intended for direct consumers, version and document the protocol explicitly before stable release.
11. Release package version and compiled engine format version remain deliberately distinct. The web support matrix now re-exports `ENGINE_VERSION` from the engine package rather than duplicating its value.
12. `TemplatePreviewResult` and `BrowserTemplatePreview` now carry the deterministic layout trace required by the developer overlay. This is intentional prerelease API growth; the trace remains diagnostic evidence and must not be treated as a stable serialized template format.

## Proposed stability labels

- Recommended prerelease facade: `apex-docx-pdf` and its direct engine/core contracts.
- Supported with browser-specific versioning: browser client and worker bootstrap.
- Opt-in peer UI: `@apexmed/devtools`.
- Advanced/experimental: core low-level contracts and the docx/fonts/images/layout/pdf/template stages.
- Private test-only: testkit.

No source API implementation was changed by this review.
