# Package size review

Date: 2026-08-06. `bun scripts/review-package-size.ts` regenerated `package-size-measurements.json` from `npm pack --dry-run --json` results for the current publishable `dist` directories. The generated report records package version, compressed and unpacked tarball sizes, JavaScript, declaration, source-map and asset bytes, remaining budget, and the exact bundled font catalog.

All 11 prepared packages are in lockstep at `0.1.0-next.1`:

| Package                |  Packed bytes | Packed budget | Unpacked bytes | Unpacked budget |
| ---------------------- | ------------: | ------------: | -------------: | --------------: |
| `apex-docx-pdf`        |        18,392 |        22,000 |         51,149 |          60,000 |
| `@apexmed/browser`     |        16,675 |        18,000 |         61,651 |          70,000 |
| `@apexmed/core`        |        16,207 |        17,000 |         57,242 |          65,000 |
| `@apexmed/devtools`    |        19,256 |        21,000 |         71,544 |          80,000 |
| `@apexmed/docx`        |       125,784 |       140,000 |        645,426 |         720,000 |
| `@apexmed/engine`      |        23,920 |        26,000 |         91,703 |         105,000 |
| `@apexmed/fonts`       |     2,068,174 |     2,300,000 |      4,220,948 |       4,700,000 |
| `@apexmed/images`      |        32,423 |        38,000 |        126,857 |         160,000 |
| `@apexmed/layout`      |        73,575 |        82,000 |        345,137 |         390,000 |
| `@apexmed/pdf`         |        33,057 |        40,000 |        132,387 |         165,000 |
| `@apexmed/template`    |        50,267 |        52,000 |        231,907 |         260,000 |
| **Public package set** | **2,477,730** | **2,700,000** |  **6,035,951** |   **6,600,000** |

The fonts tarball accounts for 4,103,870 asset bytes. Its generated catalog inventory contains 20 TrueType files across Bricolage Grotesque, Geist Mono, Instrument Sans, Instrument Serif, and Inter. The tarball gate separately requires catalog provenance plus each family's OFL file; the stale Noto-only web-build inventory is no longer used as package-size evidence.

`bun run packages:validate` now fails when any package or aggregate packed/unpacked size exceeds `package-size-budgets.json` or differs from the checked-in `package-size-measurements.json` evidence. It also fails if a tarball omits its repository license, README, JavaScript entry, declaration entry, or manifest; contains source, tests, fixtures, or environment files; retains a `workspace:` range; or omits font assets and their license/provenance files. The umbrella package additionally requires exact `ai` manifest metadata, `AGENTS.md`, `llms.txt`, integration context, both validated skills, their references/UI metadata, and the runnable strict template inspector, with no placeholder TODO content. After an intentional artifact change, build first and run `bun run packages:size:review` to refresh the evidence before validation.

The budgets intentionally leave bounded prerelease headroom (about 8.2% packed and 8.5% unpacked in aggregate). The umbrella budget was reviewed from 8,000/22,000 to 22,000/60,000 packed/unpacked bytes after its required agent instructions, context, two skills, references, metadata, and inspector increased the measured artifact to 18,392/51,149 bytes. Those AI files account for 32,261 unpacked bytes and retain about 15–16% umbrella-specific headroom. The engine budget was reviewed from 22,000/90,000 to 26,000/105,000 after the typed template-inspection API increased its measured artifact. The devtools budget was reviewed from 14,000/45,000 to 21,000/80,000 after the source-linked interactive layout-trace viewer increased its artifact. A reviewed change may raise a budget together with a refreshed measurement and explanation; silent artifact growth fails CI.

`bun run packages:consumer-smoke` additionally installs the tarballs into clean temporary Bun projects. The production umbrella tree measured 17,587,120 bytes across 1,024 files; the all-package declaration/import tree measured 43,900,692 bytes across 1,228 files including React and TypeScript test tooling. The runtime consumer also resolves every manifest-declared AI entrypoint and executes the shipped strict template inspector against a generated DOCX. The exact method and claim boundaries are recorded in `packed-consumer-review.md`.

This local review does not prove registry transfer size or integrity, a post-publication install without local prepublication overrides, a consumer browser bundle, npm provenance, or live Vercel deployment size.
