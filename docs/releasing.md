# Prerelease policy and release runbook

Apex DOCX PDF remains prerelease software. The npm packages use a shared `0.x` version and the `next` prerelease tag (for example, `0.1.0-next.0`). The renderer's `ENGINE_VERSION` is a separate cache-compatibility identifier and must change only when render compatibility changes. Neither identifier may be advanced to `1.0.0` without a separately reviewed stable-release decision.

## Package set

The public, fixed-version package set is `core`, `docx`, `fonts`, `images`, `layout`, `pdf`, `template`, `engine`, `browser`, `devtools`, and `forms` under the `@apexmed` scope, plus the unscoped `apex-docx-pdf` umbrella. The reference web app, docs, UI workspace, `editor`, and `testkit` stay private. Fixed Changesets versions keep internal dependencies coherent while the public API is still evolving.

The unscoped umbrella deliberately exports the engine factory, operation error, compatibility version, and public core contracts. It depends on `core` and `engine` only: browser-worker, form-model, and React devtools code remain opt-in subpackages. The private monorepo root is not publishable.

`@apexmed/forms` publishes the headless questionnaire model, tag binding, and Apex adapter. FormBuilder and FormRuntime stay in the workspace plus shadcn registry; they are not part of the npm tarball. `@apexmed/devtools` exposes the React display-list preview used by the reference playground. React remains a peer dependency of devtools, and the engine/core/layout package graph does not depend on forms or devtools.

## Build and package contract

Workspace manifests continue to export TypeScript source so Bun tests, Vite, and editor typechecking retain the current local-resolution behavior. `bun run build` uses the shared `tsup.config.ts` to create ESM bundles, declarations, declaration maps where supported by the toolchain, JavaScript source maps, and tree-shaken output. The preparation script writes a publication-only manifest into each `dist` directory, replaces `workspace:*` ranges with the exact lockstep prerelease version, and copies the repository license and README. Only `dist` is packed or published.

Run `bun run packages:check` to build and then validate every publication directory with Publint, Are the Types Wrong, and `npm pack --dry-run`. Validation also enforces packed/unpacked size budgets, unpacked-size evidence, and required license, README, declaration, manifest, and font provenance/OFL assets. For the umbrella it additionally requires the manifest-declared agent instructions, context, `llms.txt`, all three skills and references, UI metadata, and template-inspection script. `npm pack` is used only to create or inspect artifacts; dependency installation remains Bun-only. Run `bun run packages:size:review` after a build to regenerate the checked-in measurement report.

Run `bun run packages:consumer-smoke` after the build to pack all 12 artifacts and install them into isolated temporary Bun consumers. The gate rejects workspace resolution, type-checks the complete public declaration surface, imports every public package, resolves the umbrella's manifest-declared AI files, executes the shipped strict template inspector, and requires one repeat-identical render under both Bun and Node. Local `overrides` bind the exact internal versions to the candidate tarballs so the gate tests the current build rather than the already-published registry version. Repeat a registry-only install after every publication.

Run `bun run fixtures:check` to validate any checked-in editor exports and their provenance. `bun run fixtures:release` remains the gate for complete cross-editor compatibility claims and any stable release: it fails until the corpus contains licensed, redistributable Microsoft Word and Google Docs exports covering all 15 fixture scenarios in the project brief. A publicly downloadable sample, private template, or synthetic OOXML builder does not satisfy that gate. The `next` prerelease workflow deliberately relies on the full deterministic CI, package, consumer, and security suites instead; prerelease documentation must not imply that the complete editor corpus has passed.

## Version workflow

1. Add one focused Changeset for every consumer-visible change. Use `patch` by default during `0.x`; use `minor` for a deliberate new public capability or breaking prerelease API change.
2. Keep `.changeset/pre.json` in `pre` mode with the `next` tag. Versioned prerelease Changesets live in `.changeset/pre/`. If prerelease mode is ever exited deliberately, run `bunx changeset pre enter next` before producing another prerelease version. Never run a normal Changesets version pass for this package set while prerelease policy is active. `bun run release:validate` checks this mode, the complete fixed group, lockstep versions, and the initial prerelease Changeset in ordinary CI as well as the publish workflow.
3. Merge the generated version PR only after CI and the package checklist pass.
4. Review the packed file lists, exact internal dependency versions, licenses, package sizes, declarations, source maps, and changelogs.
5. Verify npm scope ownership and confirm each package's GitHub Actions trusted publisher still names `craig-bredenkamp/apex-docx-pdf`, `publish-next.yml`, the protected `npm` environment, and publish-only permission.
6. Require an environment approval, dispatch the workflow with the exact confirmation value, and inspect the `next` artifacts after publication. Publication is never implied by a green build or version PR.

## Trusted publishing and provenance

The publication workflow uses GitHub's OIDC token (`id-token: write`) and npm provenance. It must not store or pass a long-lived npm token. The protected `npm` GitHub environment requires maintainer approval and restricts deployment to `main`. All 12 npm packages are bound to the exact repository, `publish-next.yml` filename, `npm` environment, and publish-only permission. A first publication of a new name in the set (currently `@apexmed/forms`) may need a one-time authenticated bootstrap before that trusted-publisher mapping exists.

The publish workflow is manual, rejects any confirmation other than `publish-next`, runs the full quality gate, verifies Changesets is in `pre` mode with tag `next`, and publishes with the `next` dist-tag. A maintainer must inspect the workflow diff immediately before every use. Do not use it for a stable version or advance `latest` deliberately without a separately approved stable release.

The first-ever `0.1.0-next.0` versions were bootstrapped directly with 2FA and `--provenance=false`. The `0.1.0-next.1` OIDC workflow was subsequently dispatched and approved, but GitHub cancelled the job with zero steps started during a major Actions outage; the explicitly approved fallback was therefore published from the authenticated local npm CLI with `--provenance=false`. Both versions were installed and signature-audited from the public registry. npm created the mandatory initial `latest` metadata key alongside `next` and rejected removing it; explicit `next` publications must not advance that key. The direct versions have registry signatures but no first-party provenance attestation. A future trusted-publisher release is still expected to prove automatic npm provenance.

## Release checklist

- [ ] The release contains only reviewed changes and a Changeset; all public packages remain on one `0.x.y-next.n` version.
- [ ] `bun install --frozen-lockfile`, format, lint, typecheck, tests, docs, build, Publint, ATTW, pack dry-runs, and the isolated packed-consumer smoke pass from a clean checkout.
- [ ] Packed manifests contain no `workspace:` ranges, private package references, source-only exports, credentials, fixtures, app code, or unexpected large files.
- [ ] Public API and compatibility changes are documented; `ENGINE_VERSION` and cache migration implications were reviewed separately.
- [ ] npm trusted-publisher mappings and the protected `npm` environment are exact; no long-lived CI npm token is configured.
- [ ] The release is approved specifically for publication, uses the `next` tag, is not `1.0.0`, and does not advance `latest`.
- [ ] After publishing, install each package from `next` in an empty Bun and Node consumer, exercise the browser worker build, audit registry signatures and provenance, and record package URLs and integrity values.
- [ ] Roll-forward is prepared. npm versions are immutable; use deprecation for a bad release and publish a corrected prerelease rather than attempting replacement.
