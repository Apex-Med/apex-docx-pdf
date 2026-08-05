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
- Initial architecture, authoring, security, determinism, support-matrix, and troubleshooting documentation.

### In progress

- Hardening the Phase 1–3 vertical slices with broader licensed fixtures, browser coverage, diagnostics, resource-boundary tests, and reproducibility evidence.

### Not yet complete

- Phases 4 through 10.
- Tables, conditions and loops, images, headers and footers, complex-script shaping, true default font subsetting, and CFF PDF embedding.
- A Convex adapter or integration.
- Deployment configuration or a supported hosted service.

No stable release has been cut.
