---
title: "Architecture"
description: "The staged deterministic pipeline and its package boundaries."
---

# Architecture

## Product boundary

Apex DOCX PDF is not a Word clone. It is a deterministic renderer for a documented supported DOCX profile. Unsupported or materially lossy content is surfaced through source-located diagnostics rather than silently removed.

The compatibility input is the tuple of template bytes, bounded JSON data, caller-supplied `FontConfiguration` and font bytes, engine version, locale, time zone, metadata, limits, and explicit render options. Identical tuples are intended to produce identical layout traces and byte-identical PDFs. Font registration and formatter context are explicit: there is no system-font discovery, filesystem lookup, network fetch, ambient locale/time zone, or clock input.

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
@apex-docx-pdf/images   -> core + fflate
@apex-docx-pdf/layout   -> core
@apex-docx-pdf/pdf      -> core + images
@apex-docx-pdf/engine   -> core + docx + template + fonts + images + layout + pdf
@apex-docx-pdf/browser  -> core + engine
@apex-docx-pdf/testkit  -> core + fflate
@workspace/ui           -> no workspace packages
web                     -> browser + core + engine + ui
@apex-docx-pdf/docs     -> no workspace packages
```

These arrows list the important internal workspace and renderer-runtime dependencies in the current package manifests. `fonts`, `images`, and `testkit` are real packages. Third-party renderer runtime dependencies include exact-pinned `fontkit` 2.0.4 in `fonts`, `fflate` in `images`, plus the DOCX/test-fixture ZIP and XML dependencies. The application and UI packages have their own browser and React dependencies. Parser code does not import template, layout, PDF, React, Convex, or Vercel. Layout consumes a resolved document and emits a page display list. PDF consumes that display list, explicit metadata, and explicit font/image providers.

## Shared invariants

- Layout uses integer twips. Conversion and rounding occur only through core helpers.
- Semantic and layout collections are readonly and traversed in source order.
- Every meaningful semantic and display-list node retains a stable node ID and source location.
- Expensive public operations accept `AbortSignal`.
- Resource limits are explicit, conservative, and enforced before allocation where practical.
- Diagnostics have stable codes, severity, source, and deterministic ordering.
- No engine stage reads operating-system fonts, current locale, current timezone, current time, randomness, filesystem resources, or network resources implicitly.

## Phase 6 supported slice

Engine version `0.0.0-phase.6` carries static images, multiple sections, default headers/footers, and decimal page fields through the same typed stages. Image assets are internal relationship-owned DOCX parts with declared PNG/JPEG content, matching signatures and raster dimensions, immutable package bytes, stable IDs, and source locations. Placements require exactly one inline DrawingML image and an explicit positive EMU extent. Aspect-lock metadata is preserved and a locked extent must agree with the intrinsic ratio within the bounded tolerance. There is no resource fetch.

The default resource envelope permits at most 100 distinct embedded image parts, 20,000,000 total image bytes, 100,000 pixels on either side, and 100,000,000 pixels per image. Image preparation additionally bounds chunks/markers at 10,000 and decoded PNG working data at 400,000,000 bytes. The PNG path verifies signature, chunk order, CRCs, exact end, legal non-interlaced grayscale/RGB/indexed/grayscale-alpha/RGBA bit-depth combinations, palettes/transparency, exact scanline size, and filters. It normalizes colors to 8-bit `DeviceGray` or `DeviceRGB` and alpha to an 8-bit plane. The JPEG path admits well-formed 8-bit baseline or bounded progressive frames with one or three components, validates scans and EXIF orientation 1, and requires an unambiguous JFIF/Adobe RGB-or-YCbCr transform. ICC profiles, CMYK/YCCK, ambiguous transforms, APNG, interlaced PNG, and unsupported compressed metadata are rejected.

Preparation hashes exact source bytes and collision-checks candidates before reuse. PDF planning sorts asset IDs, validates prepared planes, collision-checks complete prepared content, and emits one reusable image XObject per unique prepared image. JPEG source bytes use `/DCTDecode`; normalized PNG planes use `/FlateDecode`; alpha adds a same-sized 8-bit grayscale XObject referenced by `/SMask`. Each page declares only the image XObjects it uses, while every placement retains its source node and uses a positive deterministic matrix. PDF text remains searchable and upright beside images.

Paragraph-level `sectPr` closes a section and starts the next section on a new page; the final body-level `sectPr` closes the document. Page width/height and orientation must agree, and each page's integer-twip geometry becomes its own PDF `MediaBox`, including mixed portrait/landscape documents. Only `nextPage` is supported. Default header/footer references resolve through internal owner-relative relationships and inherit across later sections until replaced. Distances are exact page-edge offsets: header top and footer bottom, defaulting to 720 twips when absent; content that crosses the corresponding body margin is rejected.

Header/footer parts contain supported paragraphs and may use static images, value tags, safe formatters, and bounded whole-paragraph blocks. Their resolved definitions are reused across sections/pages. Automatic paragraph numbering in headers/footers is unsupported. Simple fields and complete complex fields support global decimal `PAGE`/`NUMPAGES` only. Layout first reserves the width of `String(maxPages).length` widest decimal digits, paginates the complete document, then materializes current/total values without repagination; this two-pass reservation also applies in headers and footers.

The exact unsupported boundary includes dynamic image tags, external image relationships/fetches, anchors/floating placement, crop, rotation, SVG, broad image color/profile conversion, continuous/odd/even section breaks, first/even header variants, automatic header/footer numbering, and arbitrary fields. Synchronous PNG inflate is bounded and cancellation is checked immediately before and after it, but the synchronous inflate call itself cannot be interrupted mid-execution. Focused implementation tests do not prove broad Microsoft Word compatibility, complete Bun/Node/browser equivalence, or production readiness.

## Phase 5 supported slice

Engine version `0.0.0-phase.5` carries tables through parsed OOXML, the readonly semantic model, template compilation/resolution, integer-twip measurement and fragmentation, source-linked display-list items, and PDF serialization. A positive-integer `tblGrid` is required and authoritative: the table width is the grid sum, cell widths are sums of spanned columns, and explicit integer-twip `tblW`/`tcW` values must equal those derived widths. Auto widths resolve to the same grid geometry. The parsed `fixed`/`autofit` declaration does not introduce Word's content-driven sizing algorithm.

The semantic table retains column widths, table borders, table-level cell margins, rows, cells, source locations, spans, vertical merges, fill, alignment, row heights, break behavior, and contiguous leading header count. Missing cell margins default to 0 twips top/bottom and 115 twips start/end. The supported presentation profile is limited to `none`, `single`, `double`, `dotted`, and `dashed` borders; clear-pattern automatic-foreground solid RGB shading; exact/at-least heights; and top/center/bottom vertical alignment. `gridSpan` and `vMerge` chains are validated against the grid, visible-content ownership, and header/body boundary.

Template compilation recognizes dedicated structural table rows whose sole visible content is one `if`, optional `else`, `each`, or closing marker. Table-row blocks share the existing item-relative path semantics and cumulative expansion limits. They cannot contain or alter repeating headers, enclose vertical merges, cross table boundaries, or cross with paragraph blocks inside a cell.

Layout prepares grid geometry once, repeats contiguous leading headers without reshaping or advancing their numbering, and fragments rows deterministically across pages. A fitting `cantSplit` row moves intact to a fresh page; one too tall for a fresh page is fragmented with a warning so pagination makes progress. Fills, text, borders, row fragments, and trace events retain source node links. PDF table text remains searchable and upright. Border lines use explicit/reset dash state; dots use round caps, dashes use deterministic arrays, and double borders emit paired offset strokes.

The exact unsupported boundary includes percentage widths, nested tables, table styles/themes and conditional style regions, complex/pattern/theme shading, and complete Word autofit. Static images can appear in supported table-cell paragraphs, subject to the Phase 6 image and table bounds. Focused tests do not prove broad Microsoft Word fixture compatibility, complete Bun/Node/browser equivalence, or production readiness.

## Phase 4 supported slice

Engine version `0.0.0-phase.4` compiles inline values, safe formatter references, and nested whole-paragraph `if`/optional `else`/`each` blocks. Loop values are arrays of objects. Within a loop, paths resolve relative to the current item and compile to canonical manifest paths such as `invoice.items[].description`. Compilation derives deterministic nested JSON Schema and one-item starter arrays. Resolution applies cumulative iteration, expanded-node, and expanded-text budgets plus expression-depth and object-traversal bounds.

The formatter set is closed: `upper`, `lower`, `currency:"ISO"`, and `date:"d MMMM yyyy"`. Currency formatting requires caller-supplied locale. Date formatting requires caller-supplied locale and time zone plus an offset-bearing ISO 8601 date-time. The implementation uses explicit `Intl` context and no ambient locale, time zone, or clock.

DOCX numbering is resolved through the main document's internal numbering relationship. The semantic model retains concrete numbering definitions and overrides, level starts and restarts, supported number formats, custom multilevel text, legal-numbering behavior, and style/direct `numPr`; direct `numId` 0 removes inherited numbering. Layout owns counter continuation and restart state and emits searchable, source-linked labels with list indentation and wrapping. It also honors `keepWithNext` chains, `keepLinesTogether`, and widow/orphan control.

General tab stops remain unavailable; a numbering suffix tab is normalized into deterministic list spacing rather than tab-stop layout. Dynamic image tags remain unsupported; Phase 6 static images are document content rather than template-created resources.

## Phase 3 supported slice

Phase 3 adds explicit font resources and a bounded paragraph/run fidelity profile. `FontConfiguration` bytes are parsed and shaped through the browser-safe `fonts` adapter for left-to-right Latin text. Registry construction is deterministic, as is face matching: exact match, 400 in the requested style, requested weight in normal style, 400 normal, then the same sequence in the configured fallback family.

DOCX styles now resolve document defaults, default paragraph and character styles, `basedOn` cascades, and direct formatting. Direct `false` values override inherited bold, italic, and underline. Supported paragraph properties include start/end and first-line/hanging indents, left/center/right/justify alignment, spacing before/after, and auto/exact/at-least line spacing.

For configured TrueType fonts, PDF output uses Type 0 and CIDFontType2 dictionaries with a FontDescriptor, FontFile2, CIDToGIDMap, and ToUnicode CMap. Glyphs are positioned absolutely from the shaped advances and offsets. The default provider embeds the complete immutable TrueType program and reports `subsetted: false`; an injectable deterministic seam can return a real subset and source-to-subset glyph mapping, but no true subsetter is supplied by default. OpenType/CFF can be parsed for registry purposes but is diagnosed as unsupported when PDF embedding is requested.

## Earlier supported slices

The first complete slice intentionally supported one ordinary DOCX main document containing paragraphs, text runs, and inline value placeholders. It created one semantic section using the final body-level `sectPr` page size and margins. Missing individual page-size values fall back to A4 dimensions; the renderer does not force every document to A4. That historical slice emitted searchable PDF text through the Helvetica fallback. Phase 3 extended the path with explicit fonts, and Phase 6 extended section handling as described above.

The browser playground must exercise the same packages used by Bun and Node. A Web Worker owns compilation and rendering so the main thread remains responsive.

## Security boundary

DOCX, XML, templates, JSON, caller-supplied font bytes, and embedded image bytes are hostile inputs. Current validation applies byte, entry, decompression, path, relationship, XML, JSON, image count/bytes/dimensions/pixels/profile/decoded work, table-grid/merge/structure, expression/traversal, cumulative loop/expansion, and page limits. Loop items must be plain JSON objects. Font configuration validates registrations, aliases, fallback faces, program types, metrics, glyph availability, and the PDF embedding contract. External relationships and entity declarations are rejected. Unsupported or ambiguous image, section, field, or table structures produce source-located diagnostics rather than heuristic recovery. The engine performs no network access and never executes template code.
