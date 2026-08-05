---
title: "ADR 0004: fontkit and full TrueType embedding"
description: "The accepted browser-safe font parsing, shaping, and embedding boundary."
---

# ADR 0004: fontkit and full TrueType embedding

- Status: accepted
- Date: 2026-08-05

## Context

Phase 3 needs caller-supplied fonts to provide deterministic measurement, left-to-right Latin shaping, searchable PDF text, and visual run styling without system-font discovery. The dependency must run in Bun, supported Node.js, and modern browsers without native installation, filesystem access, network access, or a Node.js `Buffer` contract.

Font programs also carry licensing and redistribution constraints. Embedding only used glyphs would reduce output size, but a correct subsetter must rewrite the program deterministically and publish an exact source-glyph-to-subset-glyph mapping. Treating a copied complete program as a subset would make the API and licensing behavior misleading.

## Decision

Use exact-pinned `fontkit` 2.0.4 behind `@apex-docx-pdf/fonts` to parse explicit caller-supplied font bytes and shape left-to-right Latin text. `FontConfiguration` is a compatibility input. The registry snapshots the supplied `Uint8Array` values, derives stable face and registry hashes, and uses deterministic family matching. It never searches the operating system, reads the filesystem, fetches the network, or requires `Buffer`.

The default embedding provider returns a complete immutable TrueType program with `subsetted: false` and identity source-to-output glyph IDs. PDF serialization embeds it through Type0/CIDFontType2, FontDescriptor, FontFile2, CIDToGIDMap, and ToUnicode objects and writes absolute positions for each shaped glyph.

Keep an injectable deterministic subsetting seam. A future provider may return `subsetted: true` only when it supplies actual rewritten bytes and a complete source-to-subset glyph mapping. The default implementation is not true subsetting.

Callers are responsible for ensuring that a font's licence permits the intended use, embedding, storage, and distribution. The repository must not ship proprietary real-font fixtures merely to demonstrate this path.

## Consequences and limits

- Supported shaping is deliberately limited to well-formed left-to-right Latin-script text. Complex scripts and bidirectional layout remain unsupported.
- Unwrapped TrueType and OpenType/CFF programs can be identified and parsed, but PDF embedding currently supports TrueType only. CFF produces an explicit unsupported diagnostic.
- Complete-program embedding can make PDFs substantially larger than true subsets.
- Deterministic fake-adapter tests plus an openly licensed Noto Sans TTF integration test establish the boundary, including ligature Unicode preservation and repeat-identical engine output. This does not claim broad real-font fixture coverage, production readiness, or deployment proof.
- Font bytes are hostile input and must remain explicit, validated, and covered by the same reproducibility and licensing discipline as template fixtures.
