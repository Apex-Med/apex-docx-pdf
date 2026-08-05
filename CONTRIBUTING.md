# Contributing to Apex DOCX PDF

Thank you for helping improve Apex DOCX PDF. The project is an early prerelease: Phases 1–7 are implemented, but their hardening is ongoing and the broader DOCX profile is not complete.

## Before you start

- Search existing issues before opening a new one.
- Use the bug, feature, or support-matrix issue form so maintainers receive enough context.
- Keep pull requests focused. Discuss broad architecture changes before investing in an implementation.
- Do not describe a planned feature as supported until its parser, semantic model, layout, PDF output, diagnostics, fixtures, and documentation agree.

All participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Security vulnerabilities must follow [SECURITY.md](SECURITY.md), not the public issue tracker.

## Toolchain

This is a Bun-first monorepo. Use exactly **Bun 1.3.14**, as pinned by `packageManager` and CI. Node.js 20 or newer may be needed by tooling, but npm, pnpm, and Yarn must not be used to install dependencies or update the lockfile.

```bash
bun --version
bun install --frozen-lockfile
```

Use `bunx --bun` when a one-off package runner is required.

## Development workflow

1. Fork the repository and create a focused branch.
2. Install with the frozen lockfile.
3. Add or update focused tests with the implementation.
4. Run formatting and the complete local quality gate.
5. Explain user-visible behavior, compatibility impact, and limitations in the pull request.

To format supported files, run `bun run format`. Before submitting, run every check CI expects, including the Mintlify documentation check:

Biome 2.5.7 owns linting and treats warnings as failures. Prettier remains the formatter; do not use Biome's formatter or reintroduce ESLint configuration.

```bash
bun run format:check
bun run lint
bun run typecheck
bun test
bun run docs:check
bun run build
```

Do not omit `bun run docs:check` when a change appears code-only. Cross-links and compatibility statements can still be affected.

## Determinism and runtime boundaries

Rendering behavior must depend on explicit inputs. Engine code and tests must not rely on:

- system-installed fonts or font discovery;
- network access or remote conversion services;
- the ambient clock, randomness, locale, or time zone;
- LibreOffice, Microsoft Word, Chromium, or another office binary.

If a capability needs a new input, make that input explicit and include it in the compatibility and reproducibility design before implementation.

Phase 4 formatters may use only caller-supplied locale and time-zone context. Do not add formatters or template helpers that consult ambient locale, time zone, clock state, filesystem, or network services. Keep loop, expanded-node, and expanded-text budgets cumulative, and keep expression-depth and object-traversal bounds deterministic.

Phase 5 tables use the declared positive-integer `tblGrid` column widths as their fixed geometry. An explicit `tblW` must equal the grid sum, and an explicit `tcW` must equal the sum of the cell's spanned columns. Preserve source locations through table/row/cell layout and PDF items; keep table-row template markers dedicated to rows; and retain deterministic fragmentation, `cantSplit` diagnostics, contiguous header repetition, and styled-stroke behavior. Do not broaden this into percentage widths, nested tables, Word table styles/themes, complex shading, or complete Word autofit without an explicit new compatibility and security design.

Phase 6 images are static, package-owned inline PNG/JPEG resources with explicit positive DrawingML extents. Preserve the exact MIME/signature/profile checks, immutable bytes, count/byte/dimension/pixel/decoded-work bounds, cancellation checkpoints, source links, deterministic exact-byte deduplication, and alpha `/SMask` behavior. Do not add fetches, dynamic image tags, external relationships, anchors/floating placement, crop, rotation, SVG, ICC conversion, or other image-profile expansion without a reviewed threat and compatibility model. Synchronous PNG inflate cannot observe cancellation while the inflate call itself is executing; cancellation is checked immediately before and after it and throughout surrounding bounded work.

Phase 6 sections support multiple `nextPage` sections, explicit portrait/landscape geometry, inherited default headers/footers, exact edge-relative distances, header/footer template values, and global decimal `PAGE`/`NUMPAGES` fields. Keep the maximum-page digit reservation and post-pagination materialization deterministic. Do not imply support for continuous/odd/even breaks, first/even header variants, automatic header/footer numbering, or arbitrary Word fields.

Caller-supplied font bytes are an explicit compatibility input. Keep font processing browser-safe and deterministic: no filesystem access, system discovery, network fetches, or `Buffer`-only APIs. Do not describe the default complete-program embedding path as true subsetting.

## Fixtures, privacy, and licensing

Test fixtures are part of the contribution. Only submit a DOCX, font, image, PDF, or other asset when you have the right to redistribute it under terms compatible with this repository.

- Prefer minimal, synthetic fixtures created specifically for the test.
- Remove personal, patient, customer, financial, credential, and other confidential data. Do not submit production documents, even if they appear anonymized.
- Record the fixture's origin and license in the test or adjacent fixture documentation.
- Do not add assets copied from Microsoft Word installations, operating systems, proprietary templates, or unlicensed font collections.
- Keep fixtures deterministic and independent of system fonts and network access.

Maintainers may ask for a private reproducer when a document cannot safely or legally be published. Do not attach sensitive material to a public issue.

## Pull requests

A pull request should include:

- the problem and the chosen scope;
- tests that fail without the change and pass with it, where practical;
- any compatibility, security, resource-limit, or determinism impact;
- documentation updates for changed public behavior;
- confirmation that the full quality gate passed.

By submitting a contribution, you agree that it is licensed under the repository's Apache License 2.0 and that you have the right to make the contribution.
