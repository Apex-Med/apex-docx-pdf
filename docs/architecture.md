---
title: "Architecture"
description: "The staged deterministic pipeline and its package boundaries."
---

# Architecture

## Product boundary

Apex DOCX PDF is not a Word clone. It is a deterministic renderer for a documented supported DOCX profile. Unsupported or materially lossy content is surfaced through source-located diagnostics rather than silently removed.

The compatibility input is the tuple of template bytes, data, caller-supplied `FontConfiguration` and font bytes, engine version, locale, time zone, metadata, and explicit render options. Identical tuples are intended to produce identical layout traces and byte-identical PDFs. Font registration is explicit: there is no system-font discovery, filesystem lookup, or network fetch.

## Pipeline

```text
DOCX bytes
  -> validated DOCX package
  -> parsed OOXML document
  -> normalised semantic document
  -> compiled template
  -> resolved document
  -> measured and fragmented layout
  -> page display list
  -> PDF bytes
```

Each arrow is an explicit typed boundary. OOXML vocabulary ends at `@apex-docx-pdf/docx`; PDF syntax begins only inside `@apex-docx-pdf/pdf`.

## Current package graph

```text
@apex-docx-pdf/core     -> no workspace packages
@apex-docx-pdf/docx     -> core
@apex-docx-pdf/template -> core
@apex-docx-pdf/fonts    -> core + fontkit 2.0.4
@apex-docx-pdf/layout   -> core
@apex-docx-pdf/pdf      -> core
@apex-docx-pdf/engine   -> core + docx + template + fonts + layout + pdf
@apex-docx-pdf/browser  -> core + engine
@apex-docx-pdf/testkit  -> core + fflate
@workspace/ui           -> no workspace packages
web                     -> browser + core + engine + ui
@apex-docx-pdf/docs     -> no workspace packages
```

These arrows list the important internal workspace and renderer-runtime dependencies in the current package manifests. `fonts` and `testkit` are real packages. Third-party renderer runtime dependencies include exact-pinned `fontkit` 2.0.4 in `fonts`, plus the DOCX/test-fixture ZIP and XML dependencies. The application and UI packages have their own browser and React dependencies. Parser code does not import template, layout, PDF, React, Convex, or Vercel. Layout consumes a resolved document and emits a page display list. PDF consumes that display list, explicit metadata, and the explicit font-embedding provider.

## Shared invariants

- Layout uses integer twips. Conversion and rounding occur only through core helpers.
- Semantic and layout collections are readonly and traversed in source order.
- Every meaningful semantic and display-list node retains a stable node ID and source location.
- Expensive public operations accept `AbortSignal`.
- Resource limits are explicit, conservative, and enforced before allocation where practical.
- Diagnostics have stable codes, severity, source, and deterministic ordering.
- No engine stage reads operating-system fonts, current locale, current timezone, current time, randomness, filesystem resources, or network resources implicitly.

## Phase 3 supported slice

Phase 3 adds explicit font resources and a bounded paragraph/run fidelity profile. `FontConfiguration` bytes are parsed and shaped through the browser-safe `fonts` adapter for left-to-right Latin text. Registry construction is deterministic, as is face matching: exact match, 400 in the requested style, requested weight in normal style, 400 normal, then the same sequence in the configured fallback family.

DOCX styles now resolve document defaults, default paragraph and character styles, `basedOn` cascades, and direct formatting. Direct `false` values override inherited bold, italic, and underline. Supported paragraph properties include start/end and first-line/hanging indents, left/center/right/justify alignment, spacing before/after, and auto/exact/at-least line spacing.

For configured TrueType fonts, PDF output uses Type 0 and CIDFontType2 dictionaries with a FontDescriptor, FontFile2, CIDToGIDMap, and ToUnicode CMap. Glyphs are positioned absolutely from the shaped advances and offsets. The default provider embeds the complete immutable TrueType program and reports `subsetted: false`; an injectable deterministic seam can return a real subset and source-to-subset glyph mapping, but no true subsetter is supplied by default. OpenType/CFF can be parsed for registry purposes but is diagnosed as unsupported when PDF embedding is requested.

## Phase 1 supported slice

The first complete slice intentionally supported one ordinary DOCX main document containing paragraphs, text runs, and inline value placeholders. It creates one semantic section using the final body-level `sectPr` page size and margins. Missing or invalid individual page-size values fall back to A4 dimensions; the renderer does not force every document to A4. That historical slice emitted searchable PDF text through the Helvetica fallback. Phase 3 extends the current path with explicit fonts as described above.

The browser playground must exercise the same packages used by Bun and Node. A Web Worker owns compilation and rendering so the main thread remains responsive.

## Security boundary

DOCX, XML, templates, JSON, and caller-supplied font bytes are hostile inputs. Current validation applies byte, entry, decompression, path, relationship, XML-depth, expression/traversal, expansion, and page limits. Font configuration validates registrations, aliases, fallback faces, program types, metrics, glyph availability, and the PDF embedding contract. Loop tags are rejected, so the reserved loop-iteration limit is not currently exercised. External relationships and entity declarations are rejected. The engine performs no network access and never executes template code.
