---
title: "ADR 0004: fontkit and deterministic TrueType subsetting"
description: "The accepted browser-safe font parsing, shaping, subsetting, and embedding boundary."
---

# ADR 0004: fontkit and deterministic TrueType subsetting

- Status: accepted, amended after the Phase 9 release audit
- Date: 2026-08-05

## Context

Phase 3 needs caller-supplied fonts to provide deterministic measurement, left-to-right Latin shaping, searchable PDF text, and visual run styling without system-font discovery. The dependency must run in Bun, supported Node.js, and modern browsers without native installation, filesystem access, network access, or a Node.js `Buffer` contract.

Font programs also carry licensing and redistribution constraints. Embedding only used glyphs would reduce output size, but a correct subsetter must rewrite the program deterministically and publish an exact source-glyph-to-subset-glyph mapping. Treating a copied complete program as a subset would make the API and licensing behavior misleading.

## Decision

Use exact-pinned `fontkit` 2.0.4 behind `@apexmed/fonts` to parse explicit caller-supplied font bytes and shape left-to-right Latin text. `FontConfiguration` is a compatibility input. The registry snapshots the supplied `Uint8Array` values, derives stable face and registry hashes, and uses deterministic family matching. It never searches the operating system, reads the filesystem, fetches the network, or requires `Buffer`.

The default fontkit path rewrites each TrueType program to the sorted, unique set of source glyph IDs used by the PDF. Fontkit includes `.notdef` and returns the output glyph IDs assigned by the rewritten program. The provider reports `subsetted: true`, returns the complete source-to-subset map, and derives the conventional six-letter PDF subset prefix deterministically from the PostScript name and glyph set. PDF serialization embeds the result through Type0/CIDFontType2, FontDescriptor, FontFile2, CIDToGIDMap, and ToUnicode objects and writes absolute positions for each shaped glyph.

Keep the adapter seam. A caller that supplies a custom parser without a matching subsetter safely retains complete immutable TrueType embedding with `subsetted: false` and identity glyph IDs. A caller may supply another deterministic subsetter only when it returns actual rewritten bytes and a complete mapping.

Callers are responsible for ensuring that a font's licence permits the intended use, embedding, storage, and distribution. The repository must not ship proprietary real-font fixtures merely to demonstrate this path.

## Consequences and limits

- Supported shaping is deliberately limited to well-formed left-to-right Latin-script text. Complex scripts and bidirectional layout remain unsupported.
- Unwrapped TrueType and OpenType/CFF programs can be identified and parsed, but PDF embedding currently supports TrueType only. CFF produces an explicit unsupported diagnostic.
- The synchronous fontkit encoder is checked for cancellation immediately before and after encoding, but cannot be interrupted inside `encode()`.
- Deterministic fake-adapter tests plus an openly licensed Noto Sans TTF integration test establish the boundary, including a real rewritten subset, substantial byte reduction, exact glyph mapping, ligature Unicode preservation, and repeat-identical output. The canonical PDFs match in Bun, Node 24, and a real Chromium worker. This does not claim broad real-font fixture coverage, production readiness, or deployment proof.
- Font bytes are hostile input and must remain explicit, validated, and covered by the same reproducibility and licensing discipline as template fixtures.
