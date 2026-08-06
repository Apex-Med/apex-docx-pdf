# Editor-export fixture corpus

This directory is the release-gated home for legal, redistributable DOCX
fixtures authored in Microsoft Word and Google Docs. Synthetic builders under
package tests remain useful unit evidence, but they do not satisfy this corpus.

`manifest.json` is intentionally empty until a fixture has verified
redistribution rights. Never copy a customer, clinical, private, or merely
publicly downloadable document into this directory. Public download access is
not a redistribution licence.

For every fixture:

1. author only synthetic content and assets;
2. record the exact editor and version, export date, origin, SPDX licence, and
   SHA-256;
3. place the DOCX under `fixtures/docx/` and add one manifest entry;
4. record expected diagnostics, page count, searchable text, PDF hash, and
   layout-trace hash where applicable;
5. run `bun run fixtures:check` while authoring;
6. run `bun run fixtures:release` before claiming the original definition of
   done or approving an npm prerelease.

The release check requires at least one genuine Microsoft Word export, one
genuine Google Docs export, and aggregate coverage of all 15 scenarios named in
the project brief. It validates file containment, DOCX magic bytes, manifest
shape, uniqueness, provenance, redistribution permission, privacy declarations,
and exact hashes. It does not infer a licence from a URL or editor.

The supplied K3 template and publicly downloadable third-party samples may be
used as uncommitted compatibility evidence, but cannot enter this corpus unless
the owner supplies explicit redistribution permission.
