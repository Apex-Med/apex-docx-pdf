# Property and fuzz review

Date: 2026-08-05. The repository uses deterministic seeds so any failure can be reproduced exactly in Bun and CI.

## Reproducible property gate

`bun run test:fuzz` runs `fast-check` 4.9.0 against the engine boundary:

- 256 generated DOCX run-fragmentation layouts split one logical typed/ formatted template at arbitrary character positions, then compile and render it and require the same manifest and searchable PDF text;
- 128 generated placements of `__proto__`, `prototype`, and `constructor` require source-located unsafe-path rejection instead of traversal.

The checked seed is `0x0a9e2026`; the reserved-path property uses that seed XOR `0x5afe`. Fast-check reports the seed, counterexample, and shrink path on failure.

## Existing hostile and structural corpus

The primary Bun suite additionally covers fixed-seed XML attribute/whitespace variants, long unbroken text and page-break opportunities, nested list/table/template limits, fixed-table width and row-height variation, malformed relationship/archive structures, active content, XML declarations/entities, image decoder boundaries, and exact golden PDF/layout-trace output. The redistributable security corpus records hashes and provenance in `packages/engine/tests/fixtures/security/manifest.json`.

## Boundaries

This is bounded generative coverage, not an unbounded mutation fuzzer or a proof against every hostile ZIP, XML, font, image, or OOXML construction. Future hardening should add long-running archive/XML/image mutation jobs with persisted minimized counterexamples and resource telemetry; those jobs must remain separate from the deterministic release gate.
