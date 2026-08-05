# Public API review

Date: 2026-08-05. Scope: current package entrypoints and `package.json` export maps. This is an API inventory, not a semver-stability promise.

## Supported application-facing surface

The narrow supported surface should be `@apex-docx-pdf/engine`: `createDocxPdfEngine`, `ENGINE_VERSION`, `EngineOperationError`, and the re-exported engine contract types. Consumers should pass hostile DOCX bytes to `inspect`/`compile`, retain the opaque compiled value, and call `render` on the same engine instance.

`@apex-docx-pdf/browser` is the supported browser transport boundary: its client plus worker protocol are public because both are exported. The worker subpath is also exported, but its direct API should be documented before external publication.

`@apex-docx-pdf/core` contains supported shared data contracts needed by engine configuration and results. The branded constructors and low-level semantic/layout records are implementation-building blocks rather than a recommended application API.

## Internal or advanced surfaces

The `docx`, `fonts`, `images`, `layout`, `pdf`, and `template` packages expose pipeline stages. They are useful for repository tests and advanced composition, but callers can bypass engine provenance checks and safety orchestration by composing them directly. Treat them as internal/experimental until their invariants, compatibility policy, and error model are documented.

`@apex-docx-pdf/testkit` is test-only. It should never be a runtime dependency of the supported engine/browser packages.

## Findings before publication

1. Every package is currently `private: true`, version `0.0.0`, and exports TypeScript source. There is no publishable artifact or declared stable package contract yet.
2. `@apex-docx-pdf/core` uses wildcard exports from nine modules. This makes low-level constructors, semantic nodes, font adapters, resource defaults, and layout representations public by accident. Replace the wildcard barrel with an explicit supported export list before a 1.0 contract.
3. `@apex-docx-pdf/fonts` and `@apex-docx-pdf/testkit` also wildcard-export implementation-oriented modules. Deep contracts such as parser/subsetter adapters should be labeled advanced or moved to explicit subpath exports.
4. `@apex-docx-pdf/docx` exports parsed OOXML model types and `normaliseDocx`, while `normaliseDocxBytes` is callable but omitted from its explicit type export block. Decide whether this package is a supported parser API or engine-private; the current boundary is ambiguous.
5. Compiled templates are structurally public but engine-instance-bound through a private `WeakSet`. Persistence or transfer across workers/processes is therefore unsupported even though the value looks serializable. Document this prominently or introduce an explicit portable compiled format.
6. `EngineOperationError.code` and diagnostic `code` are plain strings with no published taxonomy or compatibility guarantee. Consumers will branch on them; define stable categories before promising API compatibility.
7. The browser protocol is exported from the main browser entrypoint. Protocol request/response shapes will become compatibility commitments if consumers import them directly; consider a versioned `./protocol` subpath.
8. `ENGINE_VERSION` is duplicated in the web support matrix and currently says `phase.7`. A single source of truth is needed before release, but changing application/docs files is outside this hardening slice.
9. Runtime support is only declared at the root (`node >=20`) while packages target Bun/source TypeScript and browser workers. Node, browser bundler, and serverless compatibility require separate executed proof before they are advertised.

## Proposed stability labels

- Supported: engine facade and its direct input/output/configuration types.
- Supported with browser-specific versioning: browser client and worker bootstrap.
- Advanced/experimental: core contracts intentionally required for custom fonts/text shaping.
- Internal: DOCX parsing/normalisation, template compilation/resolution, layout, image preparation, PDF serialization, font adapters.
- Test-only: testkit.

No API files were changed by this review.
