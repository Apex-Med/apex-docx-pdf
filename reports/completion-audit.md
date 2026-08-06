# Project-brief completion audit

Date: 2026-08-06. Scope: current release worktree plus the approved Vercel
deployment. This is an evidence map, not an npm-publication, persistent-SaaS,
production-identity, or broad editor-compatibility claim.

## Outcome

The repository now implements the requested Bun-first vertical product as a
bounded prerelease: staged DOCX parsing and normalization, typed template
compilation, deterministic layout/pagination, true TrueType subsetting,
searchable PDF output, source-linked layout traces, a browser worker, a polished
local-only playground, unmounted hardened Convex foundations, a landing page,
Mintlify documentation source, open-source packaging, CI, fuzz/property
coverage, benchmarks, release tooling, and a verified Vercel deployment.

The original definition of done remains intentionally **not complete** for the
licensed editor corpus and registry-release requirements:

1. `bun run fixtures:release` fails until legally redistributable Microsoft
   Word and Google Docs exports cover all 15 named fixture scenarios. The local
   machine has no Microsoft Word installation, and creating a Google Doc would
   write to an external account. Neither provenance nor permission is inferred.
2. The approved Vercel deployment and hosted browser smoke are complete.
   Convex remains intentionally undeployed for the local-only playground,
   Mintlify has no canonical hosted origin yet, and npm publication cannot
   proceed until item 1 passes.

The manual npm publication workflow enforces the fixture release gate, so the
repository cannot silently publish the current evidence as a completed editor
compatibility promise.

## Repository structure

```text
apps/
  web/                    TanStack Start reference application
convex/                   optional persistence functions and schema
packages/
  apex-docx-pdf/          recommended umbrella package
  browser/                worker protocol/client
  core/                   public contracts, semantic and layout IRs
  devtools/               display-list and trace viewer
  docx/                   hostile package validation and OOXML normalization
  engine/                 inspect/compile/preview/render orchestration
  fonts/                  registry, shaping, deterministic subsetting, catalog
  images/                 bounded PNG/JPEG preparation
  layout/                 measurement, pagination, display list, trace
  pdf/                    deterministic PDF serializer
  template/               compiler, schema/starter data, safe resolver
  testkit/                fixture builders and PDF/trace assertions
  ui/                     shared shadcn workspace
docs/                     Mintlify source and ADRs
fixtures/                 licensed editor-export release gate
benchmarks/               Bun engine and consumer-bundle measurements
reports/                  API, security, accessibility, performance evidence
scripts/                  cross-runtime, browser, smoke, release/package gates
tests/                    cross-package and Convex integration tests
```

The generated TanStack/shadcn scaffold provenance and preserved conventions are
recorded in `docs/adr/0000-scaffold-origin.md`. Package direction and the staged
IR architecture are recorded in `docs/architecture.md` and ADR 0001. Integer
layout units, dependency selection, and fontkit/subsetting decisions are ADRs
0002–0004.

## Engine and public API

The recommended consumer surface is `apex-docx-pdf`; browser integrations use
`@apex-docx-pdf/browser`, and React trace tooling is opt-in through
`@apex-docx-pdf/devtools`.

```ts
const engine = await createDocxPdfEngine({ fonts })
const inspection = await engine.inspect(docxBytes)
const compiled = await engine.compile(docxBytes)
const preview = await engine.preview(compiled)
const result = await engine.render(compiled, data, {
  locale: "en-ZA",
  timeZone: "Africa/Johannesburg",
  includeLayoutTrace: true,
})
```

`inspect` reports required fonts, supported/unsupported features, counts,
source samples, and diagnostics. `compile` produces a reusable engine-owned
template with a canonical manifest, nested JSON Schema, starter data, hashes,
and diagnostics. `preview` returns engine-owned template geometry and mappings.
`render` returns PDF bytes, hashes, page count, deterministic document-derived
resource usage, stage timings, diagnostics, and an optional trace.

Template syntax supports typed dotted values, safe closed formatters, bounded
date/time patterns (default `dd-MM-yyyy`), whole-paragraph conditions and loops,
dedicated repeating table rows, and explicit dynamic image values. It never
evaluates JavaScript or performs file/network access.

## Layout, fonts, PDF, and trace

- Integer twips and centralized rounding are used through semantic layout.
- Paragraphs implement indentation, spacing, explicit left tabs, manual breaks,
  keep rules, widow/orphan handling, legal numbering, and multi-page flow.
- Fixed-grid tables implement widths, borders, direct shading, cell padding,
  merges, repeated headers, row fragmentation, and `cantSplit` behavior.
- Bounded static/dynamic PNG and JPEG images retain explicit dimensions.
- `nextPage` sections, portrait/landscape pages, default headers/footers, and
  decimal `PAGE`/`NUMPAGES` fields are supported.
- Registered static TrueType faces use real fontkit metrics and LTR Latin
  shaping. The default path produces deterministic rewritten subsets with exact
  source-to-subset glyph maps; custom parsers without an explicit subsetter
  safely full-embed. CFF PDF embedding and variable-axis instantiation remain
  unsupported.
- PDF output is upright, searchable, structurally validated, and byte-identical
  for the same compatibility inputs.
- Trace events explicitly cover block/line/glyph geometry and baselines,
  tables/row fragments, keep decisions, page breaks, overflow, avoided
  clipping, font fallback, and layout-specific approximations. Devtools exposes
  independent overlays for each category.

## Reference application walkthrough

1. `/` presents the bounded compatibility promise, pipeline, code example,
   support summary, documentation/community links, and responsive product
   preview in Geist Mono.
2. `/playground` starts local-only. A user can load the deterministic sample or
   upload/replace/remove a DOCX through an accessible picker or drop zone.
3. Compilation happens in a module worker using the same engine and offline
   five-family font catalog as Bun/Node.
4. Engine preview, fields, required fonts, document features, diagnostics,
   preview page count, JSON Schema, and starter data become visible.
5. Form and CodeMirror JSON editors stay synchronized. Nested arrays, images,
   booleans, numbers, strings, dates, and date-times validate through Ajv.
6. Date controls serialize in the configured IANA time zone and show the output
   pattern; time precision follows the compiled formatter contract.
7. Explicit Render prevents work on every keystroke. Stale output clears on
   edits, work can be cancelled, and coarse worker milestones are truthful.
8. Results show per-stage timings, page count, byte size, local diagnostics,
   searchable PDF preview, thumbnails, zoom/search/selection, and download.
9. Optional Convex persistence appears only when configured, remains off until
   enabled, uses session ownership, direct storage uploads, byte/package
   validation, cache metadata, realtime history, and bounded deletion/cleanup.
   It is demo isolation, not production authentication.

## Security and resource controls

The hostile boundary validates ZIP magic/paths/duplicates/relationships,
archive entries and decompression, XML declarations/entities/depth/nodes/text,
active content, images, JSON shape and traversal, template expansion, tables,
fonts, pages, and cancellation. VBA, OLE, ActiveX, attached executables,
external relationships, alternative-format chunks, and unsafe prototype paths
fail closed.

Named source-located unsupported diagnostics now cover text boxes, WordArt,
SmartArt, charts, equations, embedded objects, tracked changes, comments,
footnotes, endnotes, and multi-column sections. Strict/compatible/lenient modes
relax only explicitly documented safe fallbacks.

Convex registration reads stored bytes in an action, repeats ownership/intent/
metadata checks atomically, verifies exact PDF magic or bounded DOCX ZIP/package
shape, and consumes each intent once. It does not replace complete semantic
engine validation or malware scanning, and Convex may materialize more of a Blob
than requested slices.

See `SECURITY.md`, `docs/security.mdx`, `docs/convex.mdx`, and the resource-limit
section of `docs/architecture.md` for the precise trust boundary.

## Local verification and measurements

The root `bun run ci` gate includes:

```text
Prettier -> Biome -> TypeScript -> Bun tests -> seeded fuzz/property gate
-> separate Bun/Node 24 evidence -> Chromium worker evidence
-> real application Chromium/axe smoke -> Mintlify validation/links
-> editor-fixture manifest check -> release config -> builds -> package checks
-> isolated packed-consumer install, declarations, imports, and Bun/Node render
```

The current full gate passes locally. Its Bun test stage reports 308 passing,
0 failing, and 2,894 assertions across 36 files; the separate seeded fuzz,
Bun/Node cross-runtime, real Chromium worker, playground/axe, documentation,
build, and package-artifact stages also pass.

The playground smoke includes a populated 320 × 800 CSS-pixel reflow state:
responsive panel navigation, generated native date/date-time controls and their
explicit format/time-zone descriptions remain available without root
horizontal overflow, axe violations, console/page errors, failed requests, or
unexpected external requests.

The packed-consumer gate installs the production umbrella graph outside the
workspace, imports and type-checks all 11 public tarballs in a second project,
and requires the same repeat-identical PDF under Bun and Node. The measured
runtime tree is 17,549,787 bytes across 1,012 files; full evidence and its
prepublication boundaries are in `reports/packed-consumer-review.md`.
Package validation re-packs every publication directory and rejects stale
checked-in size evidence as well as budget overruns, so the current measurement
JSON cannot silently describe an older artifact set.

The latest benchmark snapshot is in `reports/performance-review.md`. The local
synthetic observations cover cold engine/font creation, compilation, repeated
rendering, 1/20/100-page scaling, a one-row invoice, a 1,000-row invoice,
Chromium worker startup-to-first-render, whole-process peak RSS, package
tarballs, and a minimal consumer bundle. These are observational local numbers,
not hosted-function measurements or regression budgets.

External non-redistributed evidence is recorded in
`reports/editor-compatibility-review.md`: the user-supplied complex four-page K3
template and one public Google Docs-exported certificate both inspect, compile,
and render with zero diagnostics, valid searchable PDFs, and repeat-identical
bytes. They do not satisfy the licensed corpus gate.

## Supported-profile limits

Important exclusions are explicit rather than approximated:

- complex scripts, bidirectional layout, and variable-font axes;
- CFF PDF embedding;
- floating/anchored, cropped, rotated, or SVG images and broad color management;
- percentage/nested/theme-driven tables and complete Word autofit;
- continuous/odd/even section breaks and first/even page furniture;
- arbitrary Word fields, text boxes, charts, equations, tracked changes,
  comments, notes, and other named unsupported content;
- tagged-PDF accessibility metadata;
- production identity/tenant authorization;
- broad Word/Google Docs pagination equivalence.

The complete live matrix is `docs/supported-features.mdx`; authoring guidance is
in `docs/authoring.mdx` and `docs/template-language.mdx`.

## Development, deployment, and publication commands

Local development:

```bash
bun install --frozen-lockfile
bun run dev
bun run convex:dev       # optional, only for future persistence development
bun run docs:dev         # Mintlify on port 3001
bun run ci
```

The approved Vercel sequence is complete. Deployment
`dpl_BjmLgUdLkgK91JBRY438VN2qWfgC` was built with Bun 1.x, checked at its
immutable URL, promoted, and verified at `https://pdf-docx.apexmed.dev`.
Landing, sample, migrated K3, local-only, browser-error, and axe observations
are recorded in `reports/deployment-review.md`. Mintlify deployment remains a
separate future action; Convex was intentionally not configured.

Publication remains approval-gated. The manual `publish-next.yml` workflow
requires `publish-next`, the protected `npm` environment, OIDC trusted
publishing, the full CI gate, `fixtures:release`, lockstep prerelease validation,
and the `next` tag. No `latest`, `1.0.0`, or npm publication is claimed.

## Prioritized remaining roadmap

1. With explicit authority, create synthetic Apache-licensed documents in real
   Microsoft Word and Google Docs, export them to DOCX, populate
   `fixtures/manifest.json`, and close all 15 scenarios.
2. Deploy the canonical Mintlify origin when selected, then set
   `VITE_DOCS_URL`; separately measure hosted Bun cold/warm latency, peak memory,
   and multi-region behavior if those operational claims become useful.
3. Add production authentication and tenant authorization before treating
   Convex persistence as SaaS infrastructure.
4. Run manual VoiceOver, keyboard-only, zoom/reflow, and persisted/error-state
   accessibility reviews before claiming conformance.
5. After publication approval, repeat the consumer install from the registry
   with recorded integrity/provenance; add more browser engines, isolated
   per-case memory, and broader licensed font/image fixtures.
6. Decide or narrow advanced package/API stability before a 1.0 promise.

The Vercel, DNS, and GitHub configuration recorded here was performed under the
user's explicit approval. This audit does not authorize future external changes
or bypass the failing licensed-fixture publication gate.
