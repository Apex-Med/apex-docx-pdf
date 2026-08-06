# `@apexmed/testkit`

Deterministic, browser-safe test helpers for Apex DOCX-to-PDF packages.

## API

- `buildMinimalDocx(options)` creates an in-memory minimal DOCX OOXML ZIP. It
  accepts paragraph strings or explicit `runs` arrays for run fragmentation,
  plus page size and margin values in twips.
- `serializeLayoutTrace(trace)` produces compact canonical JSON with fixed key
  order while preserving the semantically meaningful page/event array order.
- `validatePdfStructure(bytes)` checks the PDF header, terminal EOF marker,
  finite numeric tokens, page-tree count, referenced page content objects, and
  the effective orientation of text-rendering transforms. It extracts
  searchable text from the uncompressed literal-string and embedded-font
  `Tj` operators emitted by this workspace's PDF serializer.
- `concatBytes`, `bytesToHex`, `hexToBytes`, `bytesEqual`, and async
  `sha256Hex` provide `Uint8Array` and Web Crypto helpers.

## Scope and non-goals

The package has no filesystem assumptions and uses no Node-only `fs`, `path`,
or `Buffer` APIs. Fixtures are intentionally small and deterministic.

The DOCX builder is not a general Word authoring library. It does not model
styles, relationships beyond the main document, tables, media, or arbitrary
parts. The PDF validator is not a standards-complete parser: it does not handle
compressed/object streams, encryption, incremental updates, font CMaps, or the
full family of PDF graphics and text operators. Use it only for PDFs produced
by this workspace's serializer.
