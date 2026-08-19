---
name: generate-compatible-docx-template
description: Create, edit, migrate, or audit `.docx` templates that compile and render with Apex DOCX PDF. Use when an agent must preserve Word formatting while adding placeholders, typed values, date/time or currency formatters, paragraph/table-row loops and conditions, fixed-grid tables, numbering, headers/footers, page fields, or static/dynamic images, and when validating a template against the package's bounded DOCX profile.
---

# Generate a compatible DOCX template

Author the DOCX as the layout artifact, keep all template logic inside the canonical bounded grammar, and validate the exact bytes with the shipped inspector before delivery.

## Read the relevant reference

- Always read [references/template-language.md](references/template-language.md) before adding placeholders or render data.
- Read [references/supported-docx-profile.md](references/supported-docx-profile.md) before creating or changing tables, numbering, fonts, images, sections, headers, footers, page fields, or pagination behavior.

## Workflow

1. Preserve the original file. Work on a copy and keep all existing styles, numbering definitions, table geometry, sections, headers, footers, and media unless the task explicitly changes them.
2. Inspect the actual DOCX package and the consuming data contract. Do not guess placeholder names from visible sample text or surrounding prose.
3. Remove or resolve tracked changes, comments, external links, active content, embedded packages, and unsupported constructs. Keep collaboration history in a separate source document.
4. Define semantic dotted paths and matching JSON values. Prefer explicit types and one canonical name for every field.
5. Insert value tags without changing surrounding run/paragraph styling. Put every block marker in its own paragraph or dedicated whole table row.
6. Build layout only from supported primitives: intentional page geometry, supported paragraphs/runs/styles, Word numbering, fixed-grid tables, internal inline PNG/JPEG images, `nextPage` sections, default headers/footers, and decimal `PAGE`/`NUMPAGES` fields.
7. Run the shipped inspector on the exact saved file:

   ```bash
   bun node_modules/apex-docx-pdf/ai/skills/generate-compatible-docx-template/scripts/inspect-template.mjs template.docx
   ```

8. Require `documentModelAvailable: true`, `compilation.ok: true`, no error diagnostics, the intended manifest paths/types/formatters, and a generated schema/starter-data shape matching the consumer. The inspector output is also the canonical template-hash and engine-version evidence.
9. Render representative, empty, long, and boundary data with explicit `locale`, `timeZone`, and exact font configuration. Review the searchable PDF, pagination, diagnostics, and optional layout trace.
10. Deliver the `.docx`, representative synthetic data, required font/image inventory with licenses, inspector output or summary, and explicit unsupported-feature notes. For dynamic images, use a TypeScript fixture containing `Uint8Array`, or document the JSON byte-array hydration step; do not pretend `Uint8Array` is literal JSON.

## Canonical authoring rules

- Use `{{path:type}}` for values and only the documented safe formatters.
- Use `{{#if path}}`, optional `{{else}}`, and `{{#each path}}` as whole-paragraph or dedicated whole-row markers. Close them in the same container.
- Inside `each`, use paths relative to the current object. Every item must be an object.
- Use `{{@image path}}` for dynamic images. Supply complete caller-owned PNG/JPEG bytes, pixel dimensions, and positive twip bounds; never author image URLs.
- Configure numbering in Word instead of typing list labels into data.
- Make `tblGrid` positive and authoritative. Match explicit table/cell widths exactly to the grid and spans.
- Use inline images, `nextPage` sections, default headers/footers, and decimal Word page fields only.
- Keep dates offset-bearing and format them with an explicit render locale/time zone. Bare `date` displays `dd-MM-yyyy`.

## Preserve formatting when editing

Do not rebuild a supplied template from scratch merely to change placeholders. Modify the smallest OOXML/Word structure that preserves the original styling. A visible string can be split across several Word runs; use a DOCX-aware tool and verify the saved package rather than assuming one text node per placeholder. Keep tags free of non-text inline barriers such as images and page fields.

For a new template, prefer a real Word-authored or DOCX-library-generated file with explicit geometry. Do not claim Microsoft Word or Google Docs parity from synthetic OOXML alone.

## Stop conditions

- Stop and report the exact unsupported feature when the requested visual depends on floating/cropped/rotated/SVG images, nested or percentage-width tables, table styles/themes, complex shading, automatic autofit, continuous/odd/even sections, even-page headers, arbitrary fields, default/non-left/leader tabs, complex scripts/bidi, CFF, or variable-font axes. First-page headers and footers are supported with `w:titlePg`.
- Stop rather than weakening strict compilation, deleting meaningful source content, approximating ambiguous layout, or inventing a data contract.
- Never use real sensitive data in fixtures, inspector output, screenshots, or delivered examples.

## Delivery checklist

- Exact compatible `.docx` file
- Synthetic representative data matching the compiled schema, with an explicit image-byte hydration convention when needed
- Manifest/schema/starter-data review
- No compile or render error diagnostics
- Required font tuples and licensed font/image sources
- Representative and boundary PDF review
- Template hash, engine version, render locale/time zone, and known limitations
