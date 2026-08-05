# Roadmap

Apex DOCX PDF is prerelease software built in narrow, testable slices. This roadmap describes direction, not a delivery schedule or compatibility promise. The support matrix and tests are authoritative for current behavior.

## Current state

- **Phase 1 — Core renderer vertical slice: implemented; hardening ongoing.** The constrained profile covers validated DOCX packages, main-document paragraphs and text runs, typed inline substitutions, integer layout, diagnostics, and searchable PDF output using built-in Helvetica.
- **Phase 2 — Browser vertical slice: implemented; hardening ongoing.** The engine can compile and render locally through a browser worker in the reference playground.
- **Phase 3 — Paragraph, run, and font fidelity slice: implemented; hardening ongoing.** The renderer now resolves document/style cascades and direct formatting, lays out the supported paragraph properties, and accepts explicit TrueType font bytes for deterministic LTR Latin shaping and searchable CID-keyed PDF embedding.
- **Phase 4 — Numbering, templates, and pagination controls: implemented; hardening ongoing.** Engine version `0.0.0-phase.4` adds relationship-owned DOCX numbering, bounded whole-paragraph template blocks, safe explicit-context formatters, list layout, and keep/widow controls.
- **Phase 5 — Tables: implemented; hardening ongoing.** Engine version `0.0.0-phase.5` adds deterministic fixed-grid table geometry, supported cell and row formatting, row templates, repeated headers, fragmentation, multi-page tables, and source-linked searchable PDF output.
- **Phase 6 — Static images, sections, headers, footers, and page fields: implemented; hardening ongoing.** Engine version `0.0.0-phase.6` adds bounded inline PNG/JPEG resources, multiple `nextPage` sections, portrait/landscape pages, inherited default headers/footers, header/footer templates, and global decimal page fields.
- **Phases 7–10: not complete.** The future phase ordering below follows the original project brief; status may be refined as architecture and fixture evidence develop.

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

This does not implement dynamic image tags, fetches, external images, anchors/floating placement, crop, rotation, SVG, broad image color/profile conversion, continuous/odd/even section breaks, first/even headers, automatic numbering in headers/footers, or arbitrary fields. The implementation and focused tests are not broad Word, complete cross-runtime, or production proof.

### Phase 7 — Convex integration boundary

Define an optional Convex adapter while leaving authorization, storage, auditing, retention, and deployment policy with the host application. No Convex integration exists today.

### Phase 8 — Broader text and font hardening

Extend beyond the implemented LTR Latin boundary, add broader licensed compatibility fixtures, and evaluate a deterministic true subsetter behind the existing source-to-subset glyph mapping seam. System-font discovery remains out of scope.

### Phase 9 — Compatibility and runtime hardening

Expand redistributable Word fixtures, golden artifacts, layout-trace comparison, browser and supported-runtime verification, and resource-boundary evidence.

### Phase 10 — Release and operational readiness

Expand compatibility fixtures, golden artifacts, cross-runtime verification, packaging, release policy, and deployment documentation. No deployment configuration or supported hosted service exists today.

## Principles across every phase

- Unsupported content must produce intentional diagnostics rather than silent best-effort output.
- Parser, semantic model, layout, display list, PDF output, tests, and documentation must agree before support is claimed.
- Rendering must not depend on network access, system fonts, office binaries, ambient time, locale, or randomness.
- Fixtures must be redistributable, synthetic where possible, and free of confidential data.
