# Packed consumer review

Date: 2026-08-06. `bun run packages:consumer-smoke` packs the 11 current
publication directories into real tarballs, then exercises two temporary
projects outside the repository. Both installs use a fresh temporary Bun cache,
disable dependency scripts, resolve every internal package to its tarball, and
reject any package or lockfile path that points back into the workspace.

## Runtime consumer

The first project declares only `apex-docx-pdf` and installs production
dependencies. Prepublication `overrides` bind the umbrella package's exact
internal versions to the corresponding local tarballs; after publication those
same versions will resolve through the registry instead. The installed runtime
tree measured 17,587,120 bytes across 1,024 files on this macOS arm64 machine.
That includes the engine's transitive runtime dependencies and the complete
offline font catalog.

The consumer imports only the umbrella API, inspects and compiles a generated
DOCX containing a run-fragmented string field and default-formatted date field,
renders it twice, and requires an exact byte match. The same installed project
then runs under Bun 1.3.14 and Node v24.15.0 and must produce identical output:

| Observation      |                                                             Result |
| ---------------- | -----------------------------------------------------------------: |
| Engine version   |                                                    `0.0.0-phase.8` |
| Fields           |                                        `customer.name`, `issuedAt` |
| Pages            |                                                                  1 |
| PDF bytes        |                                                                923 |
| PDF SHA-256      | `ffd7ec74d47ddf17fd0182a6f7da07824af6b52d32a75dfeaac64cac649eaf4c` |
| Template SHA-256 | `5cd48ab27b575a538e749c857537920db7effc7a55be0f2c5550d9b62302a45d` |

The smoke also requires a valid PDF header, no error diagnostics, deterministic
resource usage, and the requested layout trace.

The installed umbrella manifest must expose its versioned `ai` discovery
object. The consumer resolves the agent instructions, compact context,
`llms.txt`, both `SKILL.md` entrypoints, and the strict template-inspection
script from those tarball files. It then executes that shipped script against
the generated DOCX and requires the same engine version and manifest paths.

## Complete public package surface

The second project installs all 11 tarballs plus React, React declarations, and
TypeScript. It type-checks a strict JavaScript consumer with `skipLibCheck:
false`, imports every public package, and repeats the Bun/Node render. This tree
measured 43,900,692 bytes across 1,228 files, but it is deliberately not a
runtime-footprint claim because it includes React and TypeScript validation
tooling.

The local tarball set measured 2,477,730 compressed bytes. This evidence proves
candidate-tarball installation, public declaration consumption, package
exports, runtime loading, and one exact cross-runtime render on the recorded
machine. It does not prove other operating systems, a consumer browser bundle,
hosted Vercel execution, or provenance for the one-time direct bootstrap
release.

## Registry-only follow-up

After publishing `0.1.0-next.0`, a separate empty npm consumer installed
`apex-docx-pdf@next`, `@apexmed/browser@next`, and
`@apexmed/devtools@next` plus React with no local paths or overrides. The
resulting graph loaded all 11 public packages under Bun 1.3.14 and Node
v24.15.0. `npm audit signatures` verified all 36 installed registry signatures
and reported zero vulnerabilities. The exact package integrities and bootstrap
provenance boundary are recorded in `npm-publication-review.md`.
