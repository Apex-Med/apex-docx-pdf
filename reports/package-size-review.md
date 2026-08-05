# Package size review

Date: 2026-08-05. `bun scripts/review-package-size.ts` regenerated `package-size-measurements.json` from `npm pack --dry-run --json` results for the current publishable `dist` directories. The generated report records package version, compressed and unpacked tarball sizes, JavaScript, declaration, source-map and asset bytes, remaining budget, and the exact bundled font catalog.

All 11 prepared packages are in lockstep at `0.1.0-next.0`:

| Package                   |  Packed bytes | Packed budget | Unpacked bytes | Unpacked budget |
| ------------------------- | ------------: | ------------: | -------------: | --------------: |
| `apex-docx-pdf`           |         6,853 |         8,000 |         17,709 |          22,000 |
| `@apex-docx-pdf/browser`  |        16,246 |        18,000 |         60,414 |          70,000 |
| `@apex-docx-pdf/core`     |        15,465 |        17,000 |         54,487 |          65,000 |
| `@apex-docx-pdf/devtools` |        11,578 |        14,000 |         36,653 |          45,000 |
| `@apex-docx-pdf/docx`     |       122,934 |       140,000 |        630,307 |         720,000 |
| `@apex-docx-pdf/engine`   |        22,750 |        26,000 |         87,450 |         105,000 |
| `@apex-docx-pdf/fonts`    |     2,066,224 |     2,300,000 |      4,213,354 |       4,700,000 |
| `@apex-docx-pdf/images`   |        32,023 |        38,000 |        125,986 |         160,000 |
| `@apex-docx-pdf/layout`   |        70,425 |        82,000 |        326,056 |         390,000 |
| `@apex-docx-pdf/pdf`      |        32,687 |        40,000 |        131,548 |         165,000 |
| `@apex-docx-pdf/template` |        44,230 |        52,000 |        205,469 |         260,000 |
| **Public package set**    | **2,441,415** | **2,700,000** |  **5,889,433** |   **6,600,000** |

The fonts tarball accounts for 4,103,870 asset bytes. Its generated catalog inventory contains 20 TrueType files across Bricolage Grotesque, Geist Mono, Instrument Sans, Instrument Serif, and Inter. The tarball gate separately requires catalog provenance plus each family's OFL file; the stale Noto-only web-build inventory is no longer used as package-size evidence.

`bun run packages:validate` now fails when any package or aggregate packed/unpacked size exceeds `package-size-budgets.json`. It also fails if a tarball omits its repository license, README, JavaScript entry, declaration entry, or manifest; contains source, tests, fixtures, or environment files; retains a `workspace:` range; or omits font assets and their license/provenance files.

The budgets intentionally leave bounded prerelease headroom (about 9.6% packed and 10.8% unpacked in aggregate). The engine budget was reviewed from 22,000/90,000 to 26,000/105,000 packed/unpacked bytes after the typed template-inspection API increased its measured artifact to 22,750/87,450 bytes. A reviewed change may raise a budget together with a refreshed measurement and explanation; silent artifact growth fails CI.

This local review does not prove registry transfer size, installed dependency-tree size, a minimal external consumer bundle, npm publication, or live Vercel deployment size.
