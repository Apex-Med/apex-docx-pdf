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

Each arrow is an explicit typed boundary. OOXML vocabulary ends at `@apexmed/docx`; PDF syntax begins only inside `@apexmed/pdf`.

## Current package graph

```text
@apexmed/core     -> no workspace packages
@apexmed/docx     -> core
@apexmed/template -> core
@apexmed/fonts    -> core + fontkit 2.0.4
@apexmed/images   -> core + fflate
@apexmed/layout   -> core
@apexmed/pdf      -> core + images
@apexmed/engine   -> core + docx + template + fonts + images + layout + pdf
@apexmed/browser  -> core + engine
@apexmed/devtools -> core + React peer
apex-docx-pdf           -> core + engine
@apexmed/testkit  -> core + fflate
@workspace/ui           -> no workspace packages
web                     -> browser + core + devtools + engine + ui + Convex/TanStack adapters
@apexmed/docs     -> no workspace packages
```

These arrows list the important internal workspace and renderer-runtime dependencies in the current package manifests. `fonts`, `images`, and `testkit` are real packages. Third-party renderer runtime dependencies include exact-pinned `fontkit` 2.0.4 in `fonts`, `fflate` in `images`, plus the DOCX/test-fixture ZIP and XML dependencies. The application and UI packages have their own browser and React dependencies. Parser code does not import template, layout, PDF, React, Convex, or Vercel. Layout consumes a resolved document and emits a page display list. PDF consumes that display list, explicit metadata, and explicit font/image providers.

## Shared invariants

- Layout uses integer twips. Conversion and rounding occur only through core helpers.
- Semantic and layout collections are readonly and traversed in source order.
- Every meaningful semantic and display-list node retains a stable node ID and source location.
- Expensive public operations accept `AbortSignal`.
- Resource limits are explicit, conservative, and enforced before allocation where practical.
- Render resource usage reports only deterministic document-derived counters: compressed template bytes, validated archive entries and decompressed bytes, semantic nodes and UTF-8 text bytes charged to expansion budgets, and final pages. It never samples ambient process memory or runtime state.
- Diagnostics have stable codes, severity, source, and deterministic ordering.
- No engine stage reads operating-system fonts, current locale, current timezone, current time, randomness, filesystem resources, or network resources implicitly.

When requested, layout emits a deterministic discriminated trace alongside the display list. It records page/content boxes; paragraph blocks and line boxes; source-linked glyph-run bounds and baselines; table page boxes and row fragments with offsets, full row heights, and repeated-header identity; page-break reasons; keep-rule moves, widow/orphan adjustments, and degradations; overflow; avoided clipping; font fallback; and layout-specific unsupported approximations. Fail-closed layout errors that throw before a `LayoutDocument` exists cannot honestly return a trace event. Parser/template unsupported-feature diagnostics remain compilation diagnostics rather than being duplicated as layout decisions.

## Phase 7 application adapter

Engine compatibility version `0.0.0-phase.8` exposes its version and the explicit font registry hash to the browser protocol so the application can construct a cache identity from `engineVersion + templateHash + fontRegistryHash + dataHash + renderOptionsHash`. Hashing and cache lookup remain outside compilation, layout, and PDF serialization. This compatibility generation supersedes `phase.7` because the current hardening and formatter work can change compiled metadata, layout decisions, font resources, or rendered PDF bytes; existing persisted render entries must therefore miss rather than cross the boundary.

The optional root `convex/` backend belongs to the reference application, not the renderer package graph. It stores bounded session-owned metadata and Convex storage IDs, issues generated direct-upload URLs, exposes indexed/paginated/realtime reads, and schedules bounded deletion. The web router uses Convex React Query with TanStack Query and the TanStack Router SSR integration when a public Convex URL is available. Without that URL, the same worker renderer remains available and persistence is absent.

Anonymous `convex-helpers` session IDs are a demonstration ownership seam, not identity proof. Every public backend read/write compares that session with the stored owner, but production hosts must replace principal establishment with verified identity and define tenant, sharing, audit, retention, rate, and malware policies. Generated storage URLs are bearer URLs and are created only after an owned record read.

## Phase 6 supported slice

Engine version `0.0.0-phase.6` carries static images, multiple sections, default headers/footers, and decimal page fields through the same typed stages. Static image assets are internal relationship-owned DOCX parts with declared PNG/JPEG content, matching signatures and raster dimensions, immutable package bytes, stable IDs, and source locations. Placements require exactly one inline DrawingML image and an explicit positive EMU extent. Canonical dynamic `{{@image path}}` values add deterministic assets from explicit caller-owned bytes, pixel dimensions, and physical twip bounds during resolution. Aspect metadata is preserved and bounded before layout. There is no resource fetch.

The default resource envelope permits at most 100 distinct embedded image parts, 20,000,000 total image bytes, 100,000 pixels on either side, and 100,000,000 pixels per image. Image preparation additionally bounds chunks/markers at 10,000 and decoded PNG working data at 400,000,000 bytes. The PNG path verifies signature, chunk order, CRCs, exact end, legal non-interlaced grayscale/RGB/indexed/grayscale-alpha/RGBA bit-depth combinations, palettes/transparency, exact scanline size, and filters. It normalizes colors to 8-bit `DeviceGray` or `DeviceRGB` and alpha to an 8-bit plane. The JPEG path admits well-formed 8-bit baseline or bounded progressive frames with one or three components, validates scans and EXIF orientation 1, and requires an unambiguous JFIF/Adobe RGB-or-YCbCr transform. ICC profiles, CMYK/YCCK, ambiguous transforms, APNG, interlaced PNG, and unsupported compressed metadata are rejected.

Preparation hashes exact source bytes and collision-checks candidates before reuse. PDF planning sorts asset IDs, validates prepared planes, collision-checks complete prepared content, and emits one reusable image XObject per unique prepared image. JPEG source bytes use `/DCTDecode`; normalized PNG planes use `/FlateDecode`; alpha adds a same-sized 8-bit grayscale XObject referenced by `/SMask`. Each page declares only the image XObjects it uses, while every placement retains its source node and uses a positive deterministic matrix. PDF text remains searchable and upright beside images.

Paragraph-level `sectPr` closes a section and starts the next section on a new page; the final body-level `sectPr` closes the document. Page width/height and orientation must agree, and each page's integer-twip geometry becomes its own PDF `MediaBox`, including mixed portrait/landscape documents. Only `nextPage` is supported. Default header/footer references resolve through internal owner-relative relationships and inherit across later sections until replaced. Distances are exact page-edge offsets: header top and footer bottom, defaulting to 720 twips when absent; content that crosses the corresponding body margin is rejected.

Header/footer parts contain supported paragraphs and may use static images, value tags, safe formatters, and bounded whole-paragraph blocks. Their resolved definitions are reused across sections/pages. Automatic paragraph numbering in headers/footers is unsupported. Simple fields and complete complex fields support global decimal `PAGE`/`NUMPAGES` only. Layout first reserves the width of `String(maxPages).length` widest decimal digits, paginates the complete document, then materializes current/total values without repagination; this two-pass reservation also applies in headers and footers.

The exact unsupported boundary includes non-canonical image tags, external image relationships/fetches, anchors/floating placement, crop, rotation, SVG, broad image color/profile conversion, tagged-PDF accessibility metadata, continuous/odd/even section breaks, even-page header variants, automatic header/footer numbering, and arbitrary fields. Section-scoped first-page header/footer variants are selected by `w:titlePg`. Synchronous PNG inflate is bounded and cancellation is checked immediately before and after it, but the synchronous inflate call itself cannot be interrupted mid-execution. Focused implementation tests do not prove broad Microsoft Word compatibility, complete Bun/Node/browser equivalence, or production readiness.

## Phase 5 supported slice

Engine version `0.0.0-phase.5` carries tables through parsed OOXML, the readonly semantic model, template compilation/resolution, integer-twip measurement and fragmentation, source-linked display-list items, and PDF serialization. A positive-integer `tblGrid` is required and authoritative: the table width is the grid sum, cell widths are sums of spanned columns, and explicit integer-twip `tblW`/`tcW` values must equal those derived widths. Auto widths resolve to the same grid geometry. The parsed `fixed`/`autofit` declaration does not introduce Word's content-driven sizing algorithm.

The semantic table retains column widths, table borders, table-level cell margins, rows, cells, source locations, spans, vertical merges, fill, alignment, row heights, break behavior, and contiguous leading header count. Missing cell margins default to 0 twips top/bottom and 115 twips start/end. The supported presentation profile is limited to `none`, `single`, `double`, `dotted`, and `dashed` borders; clear-pattern automatic-foreground solid RGB shading; exact/at-least heights; and top/center/bottom vertical alignment. `gridSpan` and `vMerge` chains are validated against the grid, visible-content ownership, and header/body boundary.

Template compilation recognizes dedicated structural table rows whose sole visible content is one `if`, optional `else`, `each`, or closing marker. Table-row blocks share the existing item-relative path semantics and cumulative expansion limits. They cannot contain or alter repeating headers, enclose vertical merges, cross table boundaries, or cross with paragraph blocks inside a cell.

Layout prepares grid geometry once, repeats contiguous leading headers without reshaping or advancing their numbering, and fragments rows deterministically across pages. A fitting `cantSplit` row moves intact to a fresh page; one too tall for a fresh page is fragmented with a warning so pagination makes progress. Fills, text, borders, row fragments, and trace events retain source node links. PDF table text remains searchable and upright. Border lines use explicit/reset dash state; dots use round caps, dashes use deterministic arrays, and double borders emit paired offset strokes.

The exact unsupported boundary includes percentage widths, nested tables, table styles/themes and conditional style regions, complex/pattern/theme shading, and complete Word autofit. Static images can appear in supported table-cell paragraphs, subject to the Phase 6 image and table bounds. Focused tests do not prove broad Microsoft Word fixture compatibility, complete Bun/Node/browser equivalence, or production readiness.

## Phase 4 supported slice

Engine version `0.0.0-phase.4` compiles inline values, safe formatter references, and nested whole-paragraph `if`/optional `else`/`each` blocks. Loop values are arrays of objects. Within a loop, paths resolve relative to the current item and compile to canonical manifest paths such as `invoice.items[].description`. Compilation derives deterministic nested JSON Schema and one-item starter arrays. Resolution applies cumulative iteration, expanded-node, and expanded-text budgets plus expression-depth and object-traversal bounds.

The formatter set is closed: `upper`, `lower`, `currency:"ISO"`, and bounded date/time patterns. Bare `date` normalizes to `dd-MM-yyyy`; explicit patterns may reorder year/month/day and optionally include deterministic 24-hour or 12-hour time tokens. Currency and date formatting accept only the canonical engine-owned `en-US` and `en-ZA` profiles. Currency symbols, grouping, decimal separators, minor-unit precision, English month names, and day periods do not depend on runtime ICU locale data. Date formatting additionally requires a caller-supplied IANA time zone and an offset-bearing ISO 8601 date-time. No formatter reads ambient locale, time zone, or clock state.

DOCX numbering is resolved through the main document's internal numbering relationship. The semantic model retains concrete numbering definitions and overrides, level starts and restarts, supported number formats, custom multilevel text, legal-numbering behavior, and style/direct `numPr`; direct `numId` 0 removes inherited numbering. Layout owns counter continuation and restart state and emits searchable, source-linked labels with list indentation and wrapping. It also honors `keepWithNext` chains, `keepLinesTogether`, and widow/orphan control.

General tab stops remain unavailable; a numbering suffix tab is normalized into deterministic list spacing rather than tab-stop layout. Canonical dynamic image tags are supported through explicit bytes and dimensions; Phase 6 static images remain package-owned document content.

## Phase 3 supported slice

Phase 3 adds explicit font resources and a bounded paragraph/run fidelity profile. `FontConfiguration` bytes are parsed and shaped through the browser-safe `fonts` adapter for left-to-right Latin text. Registry construction is deterministic. Static CSS/OpenType weights 100–900 are matched by requested style and CSS nearest-weight order, then normal style, then the same sequence in the configured fallback family. Named aliases may select a pinned weight. Variable-font axis instantiation is outside the current contract; each promised weight/style tuple must provide a real static font program.

DOCX styles now resolve document defaults, default paragraph and character styles, `basedOn` cascades, and direct formatting. Direct `false` values override inherited bold, italic, and underline. Supported paragraph properties include start/end and first-line/hanging indents, left/center/right/justify alignment, spacing before/after, and auto/exact/at-least line spacing.

For configured TrueType fonts, PDF output uses Type 0 and CIDFontType2 dictionaries with a FontDescriptor, FontFile2, CIDToGIDMap, and ToUnicode CMap. Glyphs are positioned absolutely from the shaped advances and offsets. The default fontkit provider emits a deterministic rewritten TrueType subset with a complete source-to-subset glyph map and PDF subset name. Custom parser adapters without a compatible explicit subsetter retain complete immutable embedding rather than claiming false subsetting. OpenType/CFF can be parsed for registry purposes but is diagnosed as unsupported when PDF embedding is requested. The synchronous fontkit encode call is bounded by the font bytes/glyph set and cancellation checks around the call, but cannot be interrupted mid-encode.

## Earlier supported slices

The first complete slice intentionally supported one ordinary DOCX main document containing paragraphs, text runs, and inline value placeholders. It created one semantic section using the final body-level `sectPr` page size and margins. Missing individual page-size values fall back to A4 dimensions; the renderer does not force every document to A4. That historical slice emitted searchable PDF text through the Helvetica fallback. Phase 3 extended the path with explicit fonts, and Phase 6 extended section handling as described above.

The browser playground must exercise the same packages used by Bun and Node. A Web Worker owns compilation and rendering so the main thread remains responsive.

## Security boundary

DOCX, XML, templates, JSON, caller-supplied font bytes, and embedded image bytes are hostile inputs. Current validation applies byte, entry, decompression, path, relationship, XML, JSON, image count/bytes/dimensions/pixels/profile/decoded work, table-grid/merge/structure, expression/traversal, cumulative loop/expansion, and page limits. Loop items must be plain JSON objects. Font configuration validates registrations, aliases, fallback faces, program types, metrics, glyph availability, and the PDF embedding contract. External relationships and entity declarations are rejected. Unsupported or ambiguous image, section, field, or table structures produce source-located diagnostics rather than heuristic recovery. The engine performs no network access and never executes template code.
