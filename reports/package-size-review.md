# Package size review

Date: 2026-08-21. `bun scripts/review-package-size.ts` regenerated `package-size-measurements.json` from `npm pack --dry-run --json` results for the current publishable `dist` directories. The generated report records package version, compressed and unpacked tarball sizes, JavaScript, declaration, source-map and asset bytes, remaining budget, and the exact bundled font catalog.

All 12 prepared packages are in lockstep at `0.1.0-next.2`:

| Package                |  Packed bytes | Packed budget | Unpacked bytes | Unpacked budget |
| ---------------------- | ------------: | ------------: | -------------: | --------------: |
| `apex-docx-pdf`        |        20,689 |        24,000 |         58,114 |          65,000 |
| `@apexmed/browser`     |        16,767 |        18,000 |         61,993 |          70,000 |
| `@apexmed/core`        |        25,780 |        28,000 |         97,098 |         110,000 |
| `@apexmed/devtools`    |        19,918 |        21,000 |         74,708 |          80,000 |
| `@apexmed/docx`        |       179,776 |       200,000 |        903,887 |       1,000,000 |
| `@apexmed/engine`      |        25,434 |        28,000 |         98,579 |         110,000 |
| `@apexmed/fonts`       |     5,526,395 |     5,800,000 |     11,218,226 |      11,500,000 |
| `@apexmed/forms`       |        65,185 |        75,000 |        301,121 |         340,000 |
| `@apexmed/images`      |        51,438 |        58,000 |        214,076 |         240,000 |
| `@apexmed/layout`      |        91,853 |       105,000 |        431,522 |         480,000 |
| `@apexmed/pdf`         |        34,761 |        40,000 |        140,151 |         165,000 |
| `@apexmed/template`    |        50,720 |        52,000 |        234,576 |         260,000 |
| **Public package set** | **6,108,716** | **6,700,000** | **13,834,051** |  **15,500,000** |

The fonts tarball accounts for 11,063,599 asset bytes. Its generated catalog inventory contains the six-family static TrueType catalog across Bricolage Grotesque, Geist, Geist Mono, Instrument Sans, Instrument Serif, and Inter. The tarball gate separately requires catalog provenance plus each family's OFL file.

`bun run packages:validate` now fails when any package or aggregate packed/unpacked size exceeds `package-size-budgets.json`, or when unpacked size and entry count differ from the checked-in `package-size-measurements.json` evidence. Gzip packed bytes are recorded locally but are not compared exactly, because `npm pack` compression varies across Node/npm versions. It also fails if a tarball omits its repository license, README, JavaScript entry, declaration entry, or manifest; contains source, tests, fixtures, or environment files; retains a `workspace:` range; or omits font assets and their license/provenance files. The umbrella package additionally requires exact `ai` manifest metadata, `AGENTS.md`, `llms.txt`, integration context, three validated skills, their references/UI metadata, and the runnable strict template inspector, with no placeholder TODO content. After an intentional artifact change, build first and run `bun run packages:size:review` to refresh the evidence before validation.

The budgets intentionally leave bounded prerelease headroom (about 8.8% packed and 10.7% unpacked in aggregate). This review raised several package ceilings so `@apexmed/forms`, the six-family font catalog, and the third umbrella skill stay inside CI: umbrella 24,000/65,000, core 28,000/110,000, docx 200,000/1,000,000, engine 28,000/110,000, forms 75,000/340,000, images 58,000/240,000, and layout 105,000/480,000. A reviewed change may raise a budget together with a refreshed measurement and explanation; silent artifact growth fails CI.

`bun run packages:consumer-smoke` additionally installs the tarballs into clean temporary Bun projects. The production umbrella tree measured 25,093,377 bytes across 1,079 files; the all-package declaration/import tree measured 51,710,792 bytes across 1,289 files including React and TypeScript test tooling. The runtime consumer also resolves every manifest-declared AI entrypoint and executes the shipped strict template inspector against a generated DOCX. The exact method and claim boundaries are recorded in `packed-consumer-review.md`.

This local review does not prove registry transfer size or integrity, a post-publication install without local prepublication overrides, a consumer browser bundle, npm provenance, or live Vercel deployment size.
