# External editor compatibility review

Date: 2026-08-05. This report records local compatibility observations for
documents supplied or published outside the repository. Neither input is
checked in, counted by `fixtures:release`, or represented as redistributable.

## Google Docs-exported certificate

PDF4me publishes a downloadable course-certificate sample and explicitly
describes it as a DOCX exported from Google Docs. The sample page footer states
that its content is all rights reserved, so the file was downloaded only to
`/tmp`, tested locally, and excluded from the repository fixture corpus.

- Source page:
  `https://docs.pdf4me.com/integration/n8n/generate/generate-document-single/google-docs/`
- Direct sample URL:
  `https://docs.pdf4me.com/files/n8n/generate-document-single/google-docs/google-docs-template.docx`
- Input bytes: 6,636; 9 ZIP entries; 24,676 decompressed bytes.
- Input SHA-256:
  `bdcc4a27685e94a39c630f1885653e0c492abfc9724ddaa1d2ef3a75a0c13272`.
- Offline font registry SHA-256:
  `4f13b4b38d3cee034b3997d33c93677818e7ac95fd8a7cd8d3572fadc44e37b7`.
- `inspect`: zero diagnostics.
- `compile`: zero diagnostics; fields `course`, `date`, `instructor`, and
  `name` discovered deterministically.
- `render`: zero diagnostics; one page; structurally valid PDF; searchable text
  contains all four substituted values.
- Resource usage: 16 expanded nodes, 156 expanded UTF-8 text bytes, one page.
- Repeated PDF bytes were identical.
- PDF bytes: 18,296 after deterministic TrueType subsetting.
- PDF SHA-256 with the checked-in offline font catalog:
  `69bbadbc860d93052ccddc69c68a264913851943c8aae57878eff60a2e60b4c9`.
- Layout-trace SHA-256:
  `6972be7ea16a0ec81c61924b2085677dc74f41e72c6a76c1532895fdb10b2b19`.

This proves one small external Google Docs-export compatibility observation. It
does not prove broad Google Docs compatibility, complex formatting, or a legal
right to redistribute the sample.

## User-supplied K3 discharge template

The user supplied `K3 Discharge Template.docx` and asked that its placeholders
be migrated without changing the document formatting. The migrated external
template and synthetic sample data remain in the user's Downloads directory;
they are not repository fixtures and their editor/version and redistribution
licence have not been independently established.

- Migrated template:
  `/Users/craig/Downloads/K3 Discharge Template - Apex.docx`.
- Input bytes: 2,349,330.
- Input SHA-256:
  `5cbd29ec820c34e8819857e71ef5999fe23b2baa8604839bc2362496c92df1b5`.
- Manifest: 90 required typed paths, including one repeated investigations
  collection.
- `inspect`: zero diagnostics; four required font entries and seven feature
  entries.
- `compile`: zero diagnostics.
- `render`: zero diagnostics; four pages; 240,254-byte structurally valid PDF;
  searchable synthetic content; deterministic repeated bytes.
- PDF SHA-256:
  `db2a3bcc9d447379fcb45495b9572498cdf09a6fe0b27845f4d81d930392fe70`.
- Layout-trace SHA-256:
  `b05902f68d011f570ac587a5fdf339da5a7db8bfefe44ae201f631a5d0cb34c6`.
- Evidence report:
  `/Users/craig/Downloads/K3 Discharge Template - Apex.playground.report.json`.

This is meaningful complex-document evidence for tables, styling, page fields,
fonts, and multi-page output. It cannot satisfy the open-source fixture gate
without explicit provenance and redistribution permission.

## Release boundary

The machine-checkable corpus under `fixtures/` remains intentionally empty.
`bun run fixtures:check` validates its structure without overstating coverage;
`bun run fixtures:release` fails until genuine, redistributable Microsoft Word
and Google Docs exports cover all 15 scenarios from the project brief. The
manual npm publication workflow enforces the latter command.
