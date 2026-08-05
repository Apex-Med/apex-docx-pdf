# Performance review

Date: 2026-08-05. This is a reproducible local snapshot, not a performance guarantee or regression budget. Measurements were taken on an Apple M5 Pro Mac with 24 GiB RAM, macOS 27.0 (build 26A5388g), and Bun 1.3.14 (`darwin-arm64`). Timing and memory results should only be compared with runs made on equivalent hardware, runtime, fixtures, and commands.

## Coverage and boundaries

The checked-in benchmark data is generated, licensed-free test input. The one-row and 1,000-row cases use the repository's synthetic table fixture. The page-scale cases generate deliberately simple OOXML paragraphs and explicit page breaks. They exercise compile/render scaling but are **not** semantic Microsoft Word or Google Docs fixtures and must not be described as a real customer invoice, agreement, or report.

| Requested case                | Local evidence                                             |                                                                           Result | Claim boundary                                                                                      |
| ----------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------: | --------------------------------------------------------------------------------------------------- |
| 1-page invoice                | Synthetic table fixture with one generated row             |                                                   0.431 ms median render; 1 page | Local synthetic invoice only                                                                        |
| 20-page agreement             | Generic 20-page generated OOXML proxy                      |                                                 2.610 ms median compile + render | Page-scale proxy, not an agreement fixture                                                          |
| 100-page report               | Generic 100-page generated OOXML proxy                     |                                                 8.526 ms median compile + render | Page-scale proxy, not a report fixture                                                              |
| 1,000-row invoice             | Synthetic table fixture with 1,000 generated rows          |                                            3,785.860 ms median render; 256 pages | Local synthetic stress case                                                                         |
| Browser worker startup        | Real headless Chromium module worker and checked-in golden | 168.900–207.900 ms, worker construction through first completed compile + render | Three local observations; includes fixture compilation and rendering, not just worker boot          |
| Peak memory                   | Entire full Bun benchmark process                          |                                     337,379,328 bytes (about 321.8 MiB) peak RSS | Whole-suite high-water mark, not per-case attribution                                               |
| Package size                  | Prepared local publication tarballs                        |                         2,441,415 packed / 5,889,433 unpacked bytes in aggregate | Local `npm pack --dry-run`; not registry transfer or installed dependency size                      |
| Minimal consumer bundle       | Minified Bun ESM bundle resolving current workspace source |                                               1,075,624 raw / 276,049 gzip bytes | Not an npm-installed consumer or browser bundle                                                     |
| Vercel Bun Function execution | Not run                                                    |                                                                          Pending | Live execution is approval-gated; there is no latency, memory, cold-start, or deployment-size claim |

## Bun benchmark results

`bun benchmarks/engine.bench.ts --output=benchmarks/results/bun-local-full.json` recorded five iterations per full case, except the repeated-render case, which uses 20. Medians are observational and no pass/fail budget is attached.

| Sample                                        |       Median |          Min |          Max |                     Output |
| --------------------------------------------- | -----------: | -----------: | -----------: | -------------------------: |
| Cold engine creation                          |     0.003 ms |     0.001 ms |     0.086 ms |                          — |
| Cold font-backed engine creation              |     1.122 ms |     0.886 ms |    34.418 ms |                          — |
| Compile one generated page                    |     0.684 ms |     0.637 ms |     7.782 ms |     220-byte manifest JSON |
| Repeated render of compiled one-page template |     0.204 ms |     0.131 ms |     3.272 ms |       822-byte, 1-page PDF |
| Compile + render one generated page           |     0.748 ms |     0.558 ms |     0.995 ms |       817-byte, 1-page PDF |
| Compile + render 20 generated pages           |     2.610 ms |     2.419 ms |     4.962 ms |    8,179-byte, 20-page PDF |
| Compile + render 100 generated pages          |     8.526 ms |     7.100 ms |    10.401 ms |  39,434-byte, 100-page PDF |
| Render synthetic one-row invoice              |     0.431 ms |     0.292 ms |     2.394 ms |     2,246-byte, 1-page PDF |
| Render synthetic 1,000-row invoice            | 3,785.860 ms | 3,518.784 ms | 3,858.300 ms | 957,899-byte, 256-page PDF |

The raw samples and process peak RSS are in `benchmarks/results/bun-local-full.json`. Peak RSS comes from `process.resourceUsage()` and is normalized to bytes by platform. Because every case runs in the same process, this value cannot identify which case caused the high-water mark.

## Browser worker observation

`bun run test:browser-determinism` built the production render worker, launched headless Chromium, and required exact PDF, layout-trace, searchable-text, page-count, and font-registry agreement with the checked-in Bun/Node golden. Three settled local runs observed 168.900 ms, 174.000 ms, and 207.900 ms between constructing the module worker and receiving its first completed golden compile/render response. The timer deliberately covers a user-visible startup-to-first-render interval; it is not a worker initialization microbenchmark and three samples do not establish a latency distribution.

## Distribution measurements

`bun run packages:size:review` produces `reports/package-size-measurements.json`; the package-by-package table and enforced prerelease budgets are documented in `reports/package-size-review.md`. The 11-package aggregate is 2,441,415 packed bytes and 5,889,433 unpacked bytes. Fonts account for 4,103,870 asset bytes before tarball compression.

`bun run performance:consumer-bundle` produces `reports/minimal-consumer-bundle.json`. It bundles `benchmarks/minimal-consumer.ts` as minified ESM for Bun and reports deterministic raw and level-9 gzip byte counts. This closes the local source-bundle visibility gap only. A clean temporary project installing packed or published tarballs remains a separate measurement.

## Evidence still pending

- Licensed Microsoft Word and Google Docs-exported fixtures for the named invoice, agreement, and report cases. None were fabricated for this review.
- Per-case isolated peak RSS and repeat-run confidence intervals.
- A clean external install measurement from packed or published packages.
- Live Vercel Bun Function execution, including cold/warm duration, peak memory, and deployed artifact size. This requires narrow approval immediately before any live Vercel action.

## Reproduction

```sh
bun benchmarks/engine.bench.ts --output=benchmarks/results/bun-local-full.json
bun run test:browser-determinism
bun run packages:size:review
bun run performance:consumer-bundle
bun run typecheck
```
