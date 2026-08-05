# Roadmap

Apex DOCX PDF is prerelease software built in narrow, testable slices. This roadmap describes direction, not a delivery schedule or compatibility promise. The support matrix and tests are authoritative for current behavior.

## Current state

- **Phase 1 — Core renderer vertical slice: implemented; hardening ongoing.** The constrained profile covers validated DOCX packages, main-document paragraphs and text runs, typed inline substitutions, integer layout, diagnostics, and searchable PDF output using built-in Helvetica.
- **Phase 2 — Browser vertical slice: implemented; hardening ongoing.** The engine can compile and render locally through a browser worker in the reference playground.
- **Phase 3 — Paragraph, run, and font fidelity slice: implemented; hardening ongoing.** The renderer now resolves document/style cascades and direct formatting, lays out the supported paragraph properties, and accepts explicit TrueType font bytes for deterministic LTR Latin shaping and searchable CID-keyed PDF embedding.
- **Phases 4–10: not complete.** Work below remains planned and may be reordered as architecture and fixture evidence develop.

## Phase status and planned phases

### Phase 3 — Paragraph, run, and registered-font fidelity

Implemented slice: `docDefaults`, default paragraph/character styles, `basedOn` cascades, direct formatting with explicit false, supported paragraph indents/alignment/spacing, deterministic font matching, and complete TrueType embedding. Font shaping is limited to LTR Latin. Tabs, keep-with-next, widow/orphan controls, complex scripts, CFF PDF embedding, and true default subsetting remain unsupported. This status does not claim broad real-font fixture coverage.

### Phase 4 — Tables

Add table parsing, normalization, measurement, fragmentation, layout traces, and PDF display-list support.

### Phase 5 — Template blocks

Add bounded conditional and loop constructs without arbitrary code evaluation, with explicit expansion limits and diagnostics.

### Phase 6 — Images

Define safe image resources and image-template tags, including decoding, size limits, layout, and deterministic PDF handling.

### Phase 7 — Broader text and font hardening

Extend beyond the implemented LTR Latin boundary, add broader licensed compatibility fixtures, and evaluate a deterministic true subsetter behind the existing source-to-subset glyph mapping seam. System-font discovery remains out of scope.

### Phase 8 — Headers, footers, and broader sections

Model and render headers, footers, page variants, and broader section behavior without bypassing the staged document pipeline.

### Phase 9 — Integration boundary

Define an optional application adapter, potentially including Convex, while leaving authorization, storage, auditing, and retention policy with the host application. No Convex integration exists today.

### Phase 10 — Release and operational readiness

Expand compatibility fixtures, golden artifacts, cross-runtime verification, packaging, release policy, and deployment documentation. No deployment configuration or supported hosted service exists today.

## Principles across every phase

- Unsupported content must produce intentional diagnostics rather than silent best-effort output.
- Parser, semantic model, layout, display list, PDF output, tests, and documentation must agree before support is claimed.
- Rendering must not depend on network access, system fonts, office binaries, ambient time, locale, or randomness.
- Fixtures must be redistributable, synthetic where possible, and free of confidential data.
