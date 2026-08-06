# Package size review

Date: 2026-08-06. `bun scripts/review-package-size.ts` regenerated `package-size-measurements.json` from `npm pack --dry-run --json` results for the current publishable `dist` directories. The generated report records package version, compressed and unpacked tarball sizes, JavaScript, declaration, source-map and asset bytes, remaining budget, and the exact bundled font catalog.

All 11 prepared packages are in lockstep at `0.1.0-next.0`:

| Package                   |  Packed bytes | Packed budget | Unpacked bytes | Unpacked budget |
| ------------------------- | ------------: | ------------: | -------------: | --------------: |
| `apex-docx-pdf`           |         6,981 |         8,000 |         18,024 |          22,000 |
| `@apex-docx-pdf/browser`  |        16,433 |        18,000 |         61,150 |          70,000 |
| `@apex-docx-pdf/core`     |        15,951 |        17,000 |         56,668 |          65,000 |
| `@apex-docx-pdf/devtools` |        19,003 |        21,000 |         70,988 |          80,000 |
| `@apex-docx-pdf/docx`     |       125,563 |       140,000 |        644,912 |         720,000 |
| `@apex-docx-pdf/engine`   |        23,662 |        26,000 |         91,289 |         105,000 |
| `@apex-docx-pdf/fonts`    |     2,067,916 |     2,300,000 |      4,220,410 |       4,700,000 |
| `@apex-docx-pdf/images`   |        32,165 |        38,000 |        126,301 |         160,000 |
| `@apex-docx-pdf/layout`   |        73,323 |        82,000 |        344,587 |         390,000 |
| `@apex-docx-pdf/pdf`      |        32,817 |        40,000 |        131,863 |         165,000 |
| `@apex-docx-pdf/template` |        50,022 |        52,000 |        231,369 |         260,000 |
| **Public package set**    | **2,463,836** | **2,700,000** |  **5,997,561** |   **6,600,000** |

The fonts tarball accounts for 4,103,870 asset bytes. Its generated catalog inventory contains 20 TrueType files across Bricolage Grotesque, Geist Mono, Instrument Sans, Instrument Serif, and Inter. The tarball gate separately requires catalog provenance plus each family's OFL file; the stale Noto-only web-build inventory is no longer used as package-size evidence.

`bun run packages:validate` now fails when any package or aggregate packed/unpacked size exceeds `package-size-budgets.json` or differs from the checked-in `package-size-measurements.json` evidence. It also fails if a tarball omits its repository license, README, JavaScript entry, declaration entry, or manifest; contains source, tests, fixtures, or environment files; retains a `workspace:` range; or omits font assets and their license/provenance files. After an intentional artifact change, build first and run `bun run packages:size:review` to refresh the evidence before validation.

The budgets intentionally leave bounded prerelease headroom (about 8.7% packed and 9.1% unpacked in aggregate). The engine budget was reviewed from 22,000/90,000 to 26,000/105,000 packed/unpacked bytes after the typed template-inspection API increased its measured artifact. The devtools budget was reviewed from 14,000/45,000 to 21,000/80,000 after the source-linked interactive layout-trace viewer increased its measured artifact to 19,003/70,988 bytes. The devtools ceiling retains about 9–11% package-specific headroom. A reviewed change may raise a budget together with a refreshed measurement and explanation; silent artifact growth fails CI.

`bun run packages:consumer-smoke` additionally installs the tarballs into clean temporary Bun projects. The production umbrella tree measured 17,549,787 bytes across 1,012 files; the all-package declaration/import tree measured 43,862,302 bytes across 1,216 files including React and TypeScript test tooling. The exact method and claim boundaries are recorded in `packed-consumer-review.md`.

This local review does not prove registry transfer size or integrity, a post-publication install without local prepublication overrides, a consumer browser bundle, npm provenance, or live Vercel deployment size.
