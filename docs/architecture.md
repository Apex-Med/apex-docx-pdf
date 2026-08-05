# Architecture

## Product boundary

Apex DOCX PDF is not a Word clone. It is a deterministic renderer for a documented supported DOCX profile. Unsupported or materially lossy content is surfaced through source-located diagnostics rather than silently removed.

The compatibility input is the tuple of template bytes, data, registered font bytes, engine version, locale, timezone, and explicit render options. Identical tuples must produce identical layout traces and, where dependency compression permits, byte-identical PDFs.

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

## Dependency direction

```text
core
  <- docx
  <- template
  <- fonts
  <- layout
  <- pdf

engine -> docx + template + fonts + layout + pdf
browser -> engine
web -> browser + engine + ui
devtools -> core + browser
testkit -> core + public package APIs
```

Packages may depend on `core` and on the immediately preceding stage needed to do their work. Parser code cannot import template, layout, PDF, React, Convex, or Vercel. Layout consumes a resolved document and emits a page display list. PDF consumes only the display list and explicit resources.

## Shared invariants

- Layout uses integer twips. Conversion and rounding occur only through core helpers.
- Semantic and layout collections are readonly and traversed in source order.
- Every meaningful semantic and display-list node retains a stable node ID and source location.
- Expensive public operations accept `AbortSignal`.
- Resource limits are explicit, conservative, and enforced before allocation where practical.
- Diagnostics have stable codes, severity, source, and deterministic ordering.
- No engine stage reads operating-system fonts, current locale, current timezone, current time, randomness, filesystem resources, or network resources implicitly.

## Phase 1 supported slice

The first complete slice intentionally supports one ordinary DOCX main document containing paragraphs, text runs, and inline value placeholders. It emits A4 pages with deterministic geometry and a searchable PDF using an explicit initial font policy. Everything outside the slice is diagnosed as unsupported; it is not advertised as implemented.

The browser playground must exercise the same packages used by Bun and Node. A Web Worker owns compilation and rendering so the main thread remains responsive.

## Security boundary

DOCX, XML, templates, JSON, images, and fonts are hostile inputs. Package validation applies byte, entry, decompression, path, relationship, XML-depth, expansion, loop, and page limits. External relationships and entity expansion are rejected. The engine performs no network access and never executes template code.
