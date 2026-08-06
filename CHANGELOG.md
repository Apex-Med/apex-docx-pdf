# Changelog

All notable changes to this prerelease project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and future releases are expected to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Bounded date/time formatter patterns: `date` now defaults to `dd-MM-yyyy`, explicit tokens can reorder the date or include 24-hour/12-hour time, and the generated playground form preserves the selected time precision in the explicit render time zone.
- Engine compatibility version `0.0.0-phase.8`, forcing persisted render caches to miss across the current formatter, font-subsetting, table-rendering, and trace-output changes instead of reusing `phase.7` artifacts.
- Phase 1 core vertical slice for a constrained DOCX profile: package validation, main-document paragraphs and text runs, typed inline value tags, deterministic layout, diagnostics, and searchable PDF output using built-in Helvetica.
- Phase 2 browser vertical slice: worker-based local compile and render flow with the reference playground.
- Phase 3 paragraph, run, and font fidelity slice: document defaults, paragraph/character default styles, `basedOn` cascades, direct formatting, supported paragraph indents/alignment/spacing, and explicit caller-supplied font configuration.
- Exact-pinned `fontkit` 2.0.4 parsing and LTR Latin shaping in `@apexmed/fonts`, with deterministic registry hashing and face fallback.
- Searchable TrueType PDF embedding through Type0/CIDFontType2, FontDescriptor, FontFile2, CIDToGIDMap, ToUnicode, and absolute glyph positioning. The default fontkit path emits deterministic rewritten subsets with exact source-to-subset maps and stable PDF subset names; custom parsers without an explicit subsetter safely full-embed.
- Phase 4 engine version `0.0.0-phase.4`: whole-paragraph nested `if`/optional `else`/`each` blocks, relative object fields inside loops, safe `upper`, `lower`, `currency:"ISO"`, and `date:"d MMMM yyyy"` formatters, deterministic nested JSON Schema/starter data, and cumulative template-data and expansion limits.
- Relationship-owned DOCX numbering with concrete definitions and overrides, start/restart behavior, bullets, decimal, letter and Roman formats, multilevel/custom level text, legal numbering, style/direct `numPr` resolution, and direct `numId` 0 removal.
- Searchable source-linked list labels, list indentation and wrapping, counter continuation/restarts, `keepWithNext` chains, `keepLinesTogether`, and widow/orphan control in layout.
- Phase 5 engine version `0.0.0-phase.5`: deterministic table parsing and normalization from positive integer `tblGrid` widths, exact explicit `tblW`/`tcW` equality, fixed-grid layout, default cell margins, and source-linked table/row/cell nodes.
- Supported table borders (`none`, `single`, `double`, `dotted`, and `dashed`), clear-pattern solid RGB cell shading, exact/at-least row heights, top/center/bottom cell alignment, `gridSpan`, validated `vMerge` chains, contiguous repeating headers, and deterministic row fragmentation with `cantSplit` handling.
- Dedicated whole-row `if`/optional `else`/`each` markers for table-row expansion, with header and vertical-merge structural safeguards and the existing cumulative template budgets.
- Multi-page searchable tables and deterministic PDF geometry, including source-linked fills and strokes. Styled line output resets dash state, uses round caps for dots, applies deterministic dash patterns, and represents double borders as two strokes.
- Phase 6 engine version `0.0.0-phase.6`: static relationship-owned inline PNG/JPEG images with explicit positive dimensions, bounded decoding, stable source links, deterministic content-hash deduplication, PDF image XObjects, and PNG alpha soft masks.
- Multiple deterministic `nextPage` sections with exact portrait/landscape page geometry and per-page PDF `MediaBox` values, inherited default headers/footers, and exact edge-relative header/footer distances (720 twips when absent).
- Template values, safe formatters, and bounded paragraph blocks in reusable headers and footers, plus global decimal `PAGE` and `NUMPAGES` fields materialized after pagination from a fixed maximum-page digit reservation.
- Binary-safe testkit validation that follows classic xref offsets and declared stream lengths, checks image resources and upright transforms without scanning binary payloads as PDF syntax, and extracts searchable per-page text from workspace PDFs.
- Phase 7 engine version `0.0.0-phase.7` with browser-visible engine and font-registry hashes for deterministic cache partitioning.
- Optional Convex persistence with anonymous session ownership, generated browser upload URLs, bounded template/render metadata, indexed and paginated reads, realtime recent-render status, owned bearer-URL reads, completed-PDF cache reuse, and scheduled cascading storage deletion.
- TanStack Start integration through Convex React Query, TanStack Query, and router SSR query hydration, with retained unmounted persistence foundations.
- A local-only playground boundary: the route always disables persistence and exposes no cloud controls, even when a Convex URL exists.
- Deterministic canonical-JSON/data/options hashing, direct upload response validation, a privacy notice, storage-security documentation, and focused Convex ownership/lifecycle/cache/deletion tests.
- Initial architecture, authoring, security, determinism, support-matrix, and troubleshooting documentation.
- Phase 8 landing and documentation surfaces: Geist Mono product typography, interactive landing examples, Mintlify navigation, a responsive support matrix, community links, and SEO/PWA metadata.
- Phase 9 local hardening evidence: seeded fast-check template/path properties, fixed structural and hostile-input corpora, resource-limit and cancellation coverage, reproducible Bun benchmarks, enforced publication-tarball size budgets, automated axe checks for covered browser states, pull-request dependency review, and a formal public API review.
- Phase 10 prerelease preparation: lockstep `0.1.0-next.0` package metadata, CI-validated Changesets prerelease mode, ESM package builds with declarations and source maps, strict package validation, trusted-publishing workflow skeletons, and release/deployment runbooks.
- Initial npm publication of the `apex-docx-pdf` facade and ten `@apexmed/*` packages at `0.1.0-next.0`, with clean registry-only Bun/Node import verification, registry-signature audit, and GitHub OIDC trusted-publisher bindings for future prereleases.
- Package-shipped AI integration material: root agent instructions, compact context and `llms.txt`, validated runtime-integration and compatible-DOCX-template skills, and a runnable strict template inspector enforced through tarball and isolated-consumer checks.
- Canonical `{{@image path}}` values with explicit PNG/JPEG bytes, dimensions, deterministic resource IDs, schema/starter generation, limit enforcement, and semantic alt text.
- The `apex-docx-pdf` umbrella facade and opt-in `@apexmed/devtools` React display-list preview package.
- Interactive source-linked layout-trace overlays for page/content boxes, block and line boxes, baselines, source node IDs, page-break reasons, and overflows in the devtools template preview.
- Session-owned direct-upload intents with exact-kind registration, one-time consumption, expiry, and bounded orphan cleanup for optional Convex persistence.
- Bounded explicit left/start Word tab stops with positive integer-twip positions and no leaders; unsupported tab behavior is rejected rather than approximated.
- Exact golden PDF and trace parity across separate Bun processes, Node 24, and a real Chromium module worker.
- Current TanStack Start Nitro integration plus Bun-targeted root Build Output API configuration. The approved production deployment is live at `https://pdf-docx.apexmed.dev` with a Vercel-reported 1.16 MB Bun 1.x function and verified hosted landing/sample/K3/axe smoke.

### Fixed

- Prerelease publication no longer conflates the exhaustive licensed Word/Google compatibility corpus with package safety. The `next` workflow retains the complete deterministic CI, package, security, and isolated-consumer gates; `fixtures:release` remains mandatory for stable-release and broad cross-editor claims. Changesets now produces GitHub-linked package changelogs, and the release validator supports both pending and consumed prerelease Changesets.
- Currency and English date text no longer depend on host ICU locale data. Canonical `en-US` and `en-ZA` profiles now produce identical symbols, grouping, decimal separators, minor-unit precision, month names, and day periods across supported Bun, Node, and browser runtimes; unsupported formatter locales fail explicitly.
- PDF text baselines are converted to PDF coordinates without mirroring glyph outlines. Standard and embedded text now render upright, and y-up font offsets are normalized to y-down display-list coordinates.
- Static CSS/OpenType font weights from 100 through 900 now remain distinct through alias resolution, nearest-weight matching, layout, browser specimens, and PDF embedding. The bundled Inter and Bricolage Grotesque catalogs include real Medium (500) and SemiBold (600) programs instead of collapsing those requests to Regular or Bold.
- PDF table-cell shading now uses the display-list rectangle origin under the page coordinate transform, so fills align with their intended cells instead of being displaced downward by one fill height.
- Phase 8 public-site closeout: named the local DOCX picker for assistive technology, removed redundant Mintlify MDX level-one headings and the ambiguous `/docs` catch-all match while preserving deep-link redirects, emitted route-specific canonical/Open Graph URLs, and generated absolute production robots/sitemap URLs from `VITE_SITE_URL`.

### In progress

- Completing external Phase 9 proof with broader licensed Microsoft Word and Google Docs-exported fixtures.
- Proving npm provenance on the next GitHub OIDC-published prerelease; the one-time direct bootstrap publication was intentionally created without a local provenance claim.

### Not yet complete

- Non-canonical image tags; image URL fetching; anchored/floating, cropped, rotated, or SVG images; tagged-PDF accessibility metadata; broad image-profile/color conversion; percentage table widths, nested tables, table styles/themes, complex shading, complete Word autofit, complex-script shaping, variable-font axis instantiation, and CFF PDF embedding remain unsupported.
- Continuous, odd-page, or even-page section breaks; first/even header variants; automatic numbering in headers/footers; and general Word field evaluation.
- Broad licensed Microsoft Word and Google Docs-exported fixture coverage.
- A persistent, authenticated hosted service. The current hosted playground is deliberately local-only, and the npm package set remains prerelease software.

No stable release has been cut.
