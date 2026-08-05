# Changelog

All notable changes to this prerelease project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and future releases are expected to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Phase 1 core vertical slice for a constrained DOCX profile: package validation, main-document paragraphs and text runs, typed inline value tags, deterministic layout, diagnostics, and searchable PDF output using built-in Helvetica.
- Phase 2 browser vertical slice: worker-based local compile and render flow with the reference playground.
- Phase 3 paragraph, run, and font fidelity slice: document defaults, paragraph/character default styles, `basedOn` cascades, direct formatting, supported paragraph indents/alignment/spacing, and explicit caller-supplied font configuration.
- Exact-pinned `fontkit` 2.0.4 parsing and LTR Latin shaping in `@apex-docx-pdf/fonts`, with deterministic registry hashing and face fallback.
- Searchable TrueType PDF embedding through Type0/CIDFontType2, FontDescriptor, FontFile2, CIDToGIDMap, ToUnicode, and absolute glyph positioning. The default embeds the complete immutable program with `subsetted: false`; an injectable deterministic subsetting seam carries source-to-subset mappings.
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
- Dormant TanStack Start integration through Convex React Query, TanStack Query, and router SSR query hydration, retained for possible future SaaS work without exposing cloud persistence in the current playground.
- The playground is intentionally local-only: it hides the dormant persistence component and never uploads document bytes, render data, or generated PDFs.
- Deterministic canonical-JSON/data/options hashing, direct upload response validation, a privacy notice, storage-security documentation, and focused Convex ownership/lifecycle/cache/deletion tests.
- Initial architecture, authoring, security, determinism, support-matrix, and troubleshooting documentation.

### Fixed

- PDF text baselines are converted to PDF coordinates without mirroring glyph outlines. Standard and embedded text now render upright, and y-up font offsets are normalized to y-down display-list coordinates.

### In progress

- Hardening the Phase 1–7 vertical slices with broader licensed fixtures, browser coverage, diagnostics, resource-boundary tests, and reproducibility evidence.

### Not yet complete

- Phases 8 through 10.
- Dynamic image tags; anchored/floating, cropped, rotated, or SVG images; broad image-profile/color conversion; percentage table widths, nested tables, table styles/themes, complex shading, complete Word autofit, complex-script shaping, true default font subsetting, and CFF PDF embedding.
- Continuous, odd-page, or even-page section breaks; first/even header variants; automatic numbering in headers/footers; and general Word field evaluation.
- Broad Microsoft Word fixture coverage and complete Bun/Node/browser equivalence.
- Deployment configuration or a supported hosted service.

No stable release has been cut.
