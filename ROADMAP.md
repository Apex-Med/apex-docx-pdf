# Roadmap

Apex DOCX PDF is prerelease software built in narrow, testable slices. This roadmap describes direction, not a delivery schedule or compatibility promise. The support matrix and tests are authoritative for current behavior.

## Current state

- **Phase 1 — Core renderer vertical slice: implemented; hardening ongoing.** The constrained profile covers validated DOCX packages, main-document paragraphs and text runs, typed inline substitutions, integer layout, diagnostics, and searchable PDF output using built-in Helvetica.
- **Phase 2 — Browser vertical slice: implemented; hardening ongoing.** The engine can compile and render locally through a browser worker in the reference playground.
- **Phase 3 — Paragraph, run, and font fidelity slice: implemented; hardening ongoing.** The renderer now resolves document/style cascades and direct formatting, lays out the supported paragraph properties, and accepts explicit TrueType font bytes for deterministic LTR Latin shaping and searchable CID-keyed PDF embedding.
- **Phase 4 — Numbering, templates, and pagination controls: implemented; hardening ongoing.** Engine version `0.0.0-phase.4` adds relationship-owned DOCX numbering, bounded whole-paragraph template blocks, safe explicit-context formatters, list layout, and keep/widow controls.
- **Phase 5 — Tables: implemented; hardening ongoing.** Engine version `0.0.0-phase.5` adds deterministic fixed-grid table geometry, supported cell and row formatting, row templates, repeated headers, fragmentation, multi-page tables, and source-linked searchable PDF output.
- **Phase 6 — Static images, sections, headers, footers, and page fields: implemented; hardening ongoing.** Engine version `0.0.0-phase.6` adds bounded inline PNG/JPEG resources, multiple `nextPage` sections, portrait/landscape pages, inherited default headers/footers, header/footer templates, and global decimal page fields.
- **Phase 7 — Convex integration: implemented; hardening ongoing.** Engine version `0.0.0-phase.7` partitions render caches by engine/template/font/data/options hashes, while the optional app adapter adds anonymous session isolation, direct DOCX/PDF uploads, metadata, realtime render history, and bounded storage cleanup.
- **Phase 8 — Landing page and documentation: implemented and browser-verified locally.** The landing page, Mintlify docs, responsive support matrix, interactive examples, community links, and SEO/PWA metadata are present.
- **Phase 9 — Hardening: local evidence implemented; external proof pending.** Fixed-seed hostile-input tests, resource-limit coverage, Bun benchmarks, package-size measurements, public API review, browser accessibility checks, exact Bun/Node 24/Chromium golden parity, and a Nitro production preview are complete. Broader licensed Microsoft Word and Google Docs-exported fixtures and live Vercel verification remain open.
- **Phase 10 — Release preparation: implemented; publication pending.** Changesets, lockstep prerelease versions, publishable ESM artifacts, package validation, provenance workflow skeletons, and release documentation are ready. The first npm `next` publication remains approval-gated.

## Phase status and planned phases

### Phase 3 — Paragraph, run, and registered-font fidelity

Implemented slice: `docDefaults`, default paragraph/character styles, `basedOn` cascades, direct formatting with explicit false, supported paragraph indents/alignment/spacing, deterministic font matching, and complete TrueType embedding. Font shaping is limited to LTR Latin. General tab-stop layout, complex scripts, CFF PDF embedding, and true default subsetting remain unsupported. This status does not claim broad real-font fixture coverage.

### Phase 4 — Numbering, templates, and pagination controls

Implemented; hardening ongoing. This phase includes safe formatters; nested whole-paragraph `if`/optional `else`/`each`; canonical loop manifest paths; deterministic nested schema/starter data; cumulative loop/node/text budgets plus traversal/expression bounds; relationship-owned numbering; list labels and counters; `keepWithNext`, `keepLinesTogether`, and widow/orphan control. It does not add tables or images, and it does not establish broad Word-fixture, cross-runtime, or deployment proof.

### Phase 5 — Tables

Implemented; hardening ongoing. The supported profile requires a positive integer-twip `tblGrid`, uses its column sum as fixed geometry, and requires explicit `tblW`/`tcW` values to equal the applicable grid sum. It includes default/explicit cell margins, bounded borders and solid shading, row heights and vertical alignment, `gridSpan`, validated `vMerge`, dedicated table-row template markers, contiguous repeating headers, deterministic fragmentation and `cantSplit` fallback diagnostics, multi-page layout traces, searchable text, source links, and deterministic PDF strokes.

This does not implement percentage widths, nested tables, table styles/themes, complex shading, or complete Word autofit. Focused tests do not establish broad Word-fixture coverage, complete Bun/Node/browser equivalence, or production readiness.

### Phase 6 — Static images, sections, headers, footers, and page fields

Implemented; hardening ongoing. Static PNG/JPEG images must be internal relationship-owned package parts and use inline DrawingML with explicit positive dimensions. The supported bounded decoders retain immutable source bytes, validate signatures and exact raster dimensions, enforce count/byte/side/pixel/decoded-work limits, preserve source links, deduplicate exact bytes deterministically, and emit PDF XObjects with a grayscale `/SMask` for PNG alpha. Images can participate in supported paragraph/table/header/footer layout where the existing structure and limits allow them.

Multiple sections use deterministic `nextPage` breaks with explicit portrait/landscape geometry and matching PDF `MediaBox` values. Default header/footer references inherit until replaced; their content uses exact edge-relative distances (720-twip defaults), can contain bounded template values/formatters/blocks, and is reused across pages. Decimal `PAGE`/`NUMPAGES` fields are globally materialized after pagination from space reserved for the configured maximum-page digit count.

Canonical `{{@image path}}` values now resolve explicit PNG/JPEG bytes, pixel dimensions, and physical twip bounds into deterministic inline resources. This does not implement non-canonical image tags, fetches, external images, anchors/floating placement, crop, rotation, SVG, broad image color/profile conversion, tagged-PDF accessibility metadata, continuous/odd/even section breaks, first/even headers, automatic numbering in headers/footers, or arbitrary fields. The implementation and focused tests are not broad Word, complete browser-runtime, or production proof.

### Phase 7 — Convex integration boundary

Implemented; hardening ongoing. The optional adapter uses `convex-helpers` anonymous browser sessions, direct generated upload URLs, session-owned template/render metadata, deterministic cache keys, cursor-paginated history, realtime status, bearer-URL-on-owned-read access, and scheduled bounded deletion of database rows plus stored DOCX/PDF objects. Persistence is off by default. Anonymous isolation is explicitly a demo boundary, not production authentication; Clerk/WorkOS identity, retention, auditing, rate limits, and deployment policy remain host responsibilities.

### Phase 8 — Landing page and documentation

Implemented and locally browser-verified at 1440 × 900 and 390 × 844. The polished Geist Mono landing page includes interactive examples, architecture and API explanations, a responsive support matrix, GitHub/community links, SEO/PWA metadata, and direct Mintlify documentation routing. Local verification covers the landing page, playground, support matrix, `/docs` plus representative Mintlify deep links, keyboard-operated navigation and tabs, the visible five-family font specimens, overflow, console errors, configured-origin canonical/robots/sitemap output, and path-preserving documentation redirects. Live hosted-origin verification remains part of the external Phase 9 boundary.

### Phase 9 — Hardening

Local hardening evidence is implemented: security fixtures, a fixed-seed fragmentation corpus, resource-limit and cancellation tests, real-browser rendering and accessibility checks, exact golden PDF/trace parity across separate Bun processes, Node 24, and a real Chromium module worker, Bun benchmarks, enforced publication-tarball size budgets, and a formal public API review. Broader licensed Microsoft Word and Google Docs-exported fixtures and live Vercel verification remain open.

### Phase 10 — Release preparation

Preparation is implemented: Changesets, publishable ESM package builds, prerelease versioning, trusted-publishing provenance configuration, release documentation, contribution materials, and a reconciled roadmap. The initial npm prerelease and post-publication verification remain credential- and approval-gated.

## Principles across every phase

- Unsupported content must produce intentional diagnostics rather than silent best-effort output.
- Parser, semantic model, layout, display list, PDF output, tests, and documentation must agree before support is claimed.
- Rendering must not depend on network access, system fonts, office binaries, ambient time, locale, or randomness.
- Fixtures must be redistributable, synthetic where possible, and free of confidential data.
