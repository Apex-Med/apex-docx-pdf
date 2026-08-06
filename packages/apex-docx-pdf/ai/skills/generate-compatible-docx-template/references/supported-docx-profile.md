# Supported DOCX authoring profile

## Supported layout primitives

- Main-document paragraphs and text runs in source order
- Document defaults, paragraph/character styles, `basedOn`, direct formatting, indents, alignment, supported spacing, keep controls, widow/orphan control, and page-break-before
- Word numbering definitions/overrides for bullets, decimal, letters, Roman numerals, multilevel/custom labels, legal numbering, starts, restarts, indentation, and wrapping
- Fixed-grid tables with supported margins, borders, solid clear-pattern shading, row heights, vertical alignment, horizontal spans, validated vertical merges, contiguous repeating headers, and bounded row fragmentation
- Internal inline PNG/JPEG images with explicit positive DrawingML extents
- `nextPage` portrait or landscape sections with explicit coherent page geometry
- Inherited default headers/footers with exact distances and supported template paragraphs
- Decimal Word `PAGE` and `NUMPAGES` fields
- Manual line breaks and body paragraph page breaks within the documented limits
- Explicit positive left/start tab stops without leaders
- Word highlight palette plus baseline/superscript/subscript text

## Fixed-grid table rules

- Author a positive integer-twip `tblGrid`; its sum is the table width.
- If `tblW` is explicit, make it equal the grid sum.
- A cell width is the sum of its `gridSpan` columns. If `tcW` is explicit, make it equal that sum.
- Treat `fixed` and `autofit` as the same fixed geometry; content-driven Word autofit is not implemented.
- Use `none`, `single`, `double`, `dotted`, or `dashed` borders with explicit RGB/width/spacing.
- Use only clear-pattern solid six-digit RGB shading.
- Keep vertical-merge continuation spans equal to their restart, empty of visible content, and inside one header/body region.
- Use contiguous leading rows for repetition. Do not put row-block markers around repeating headers or vertical merges.

## Fonts

Inspect required family, static weight, and style tuples. The consumer must register application-owned TrueType bytes and a 400-normal fallback family. Complex scripts/bidi, CFF PDF embedding, variable-axis instantiation, OS font discovery, and font fetching are unsupported. Preserve font licenses and provenance.

## Images and page furniture

Use internal inline PNG/JPEG relationships. Avoid anchors/floating placement, crop, rotation, SVG, unsupported PNG/JPEG profiles, EXIF orientation other than 1, ICC conversion, and CMYK/YCCK. Dynamic images use the canonical tag and complete caller-owned bytes/dimensions.

Only `nextPage` section breaks are supported. First/even headers and footers, continuous/odd/even section breaks, automatic header/footer list numbering, and arbitrary fields are unsupported. Keep header/footer distance plus content height within the corresponding body margin.

## Unsupported layout features

Stop instead of approximating:

- percentage table widths, nested tables, table styles/themes, complex shading, or complete autofit;
- floating/cropped/rotated/SVG or broadly converted images;
- continuous, odd-page, or even-page sections and first/even headers/footers;
- automatic header/footer numbering or arbitrary Word fields;
- default tabs, non-left tabs, leaders, or missing explicit stops;
- complex scripts, bidi, CFF, or variable-font axes;
- tracked changes, unresolved comments, external relationships, macros, OLE/embedded objects, ActiveX, attached packages/executables/templates, custom UI, web extensions, or alternative-format chunks.

## Review evidence

Inspect and strictly compile the exact saved bytes. Review the required fonts/features, manifest, schema, starter data, source locations, and every diagnostic. Render representative, empty, long, and boundary data. Check searchable upright text, page geometry, numbering, table pagination and repeated headers, images, headers/footers, page fields, and deterministic repeat output. Retain the template hash, engine version, font/image provenance, locale, time zone, render options, redacted diagnostics, and optional layout trace.
