# Prerelease policy and release runbook

Apex DOCX PDF remains prerelease software. The npm packages use a shared `0.x` version and the `next` prerelease tag (for example, `0.1.0-next.0`). The renderer's `ENGINE_VERSION` is a separate cache-compatibility identifier and must change only when render compatibility changes. Neither identifier may be advanced to `1.0.0` without a separately reviewed stable-release decision.

## Package set

The public, fixed-version package set is `core`, `docx`, `fonts`, `images`, `layout`, `pdf`, `template`, `engine`, `browser`, and `devtools` under the `@apex-docx-pdf` scope, plus the unscoped `apex-docx-pdf` umbrella. The reference web app, docs, UI workspace, and `testkit` stay private. Fixed Changesets versions keep internal dependencies coherent while the public API is still evolving.

The unscoped umbrella deliberately exports the engine factory, operation error, compatibility version, and public core contracts. It depends on `core` and `engine` only: browser-worker and React devtools code remain opt-in subpackages. The private monorepo root is not publishable.

`@apex-docx-pdf/devtools` exposes the React display-list preview used by the reference playground. React remains a peer dependency, and the engine/core/layout package graph does not depend on devtools.

## Build and package contract

Workspace manifests continue to export TypeScript source so Bun tests, Vite, and editor typechecking retain the current local-resolution behavior. `bun run build` uses the shared `tsup.config.ts` to create ESM bundles, declarations, declaration maps where supported by the toolchain, JavaScript source maps, and tree-shaken output. The preparation script writes a publication-only manifest into each `dist` directory, replaces `workspace:*` ranges with the exact lockstep prerelease version, and copies the repository license and README. Only `dist` is packed or published.

Run `bun run packages:check` to build and then validate every publication directory with Publint, Are the Types Wrong, and `npm pack --dry-run`. Validation also enforces packed/unpacked size budgets and required license, README, declaration, manifest, and font provenance/OFL assets. `npm pack` is used only to inspect the artifact; dependency installation remains Bun-only. Run `bun run packages:size:review` after a build to regenerate the checked-in measurement report.

## Version workflow

1. Add one focused Changeset for every consumer-visible change. Use `patch` by default during `0.x`; use `minor` for a deliberate new public capability or breaking prerelease API change.
2. Keep `.changeset/pre.json` in `pre` mode with the `next` tag. If prerelease mode is ever exited deliberately, run `bunx changeset pre enter next` before producing another prerelease version. Never run a normal Changesets version pass for this package set while prerelease policy is active. `bun run release:validate` checks this mode, the complete fixed group, lockstep versions, and the initial prerelease Changeset in ordinary CI as well as the publish workflow.
3. Merge the generated version PR only after CI and the package checklist pass.
4. Review the packed file lists, exact internal dependency versions, licenses, package sizes, declarations, source maps, and changelogs.
5. Verify npm scope ownership and configure each package's GitHub Actions trusted publisher for this repository, the `publish-next.yml` workflow, and the protected `npm` environment.
6. Require an environment approval, dispatch the workflow with the exact confirmation value, and inspect the `next` artifacts after publication. Publication is never implied by a green build or version PR.

## Trusted publishing and provenance

The publication skeleton uses GitHub's OIDC token (`id-token: write`) and npm provenance. It must not store or pass a long-lived npm token. The `npm` GitHub environment should require maintainers' approval and restrict the deployment branch to `main`. npm trusted-publisher settings must match the repository owner/name, workflow filename, and environment exactly.

The publish workflow is manual, rejects any confirmation other than `publish-next`, runs the full quality gate, verifies Changesets is in `pre` mode with tag `next`, and publishes with the `next` dist-tag. A maintainer must inspect the workflow diff immediately before first use. Do not use it for `latest`, stable versions, or a first publication until npm scope/package ownership has been independently confirmed.

## Release checklist

- [ ] The release contains only reviewed changes and a Changeset; all public packages remain on one `0.x.y-next.n` version.
- [ ] `bun install --frozen-lockfile`, format, lint, typecheck, tests, docs, build, Publint, ATTW, and pack dry-runs pass from a clean checkout.
- [ ] Packed manifests contain no `workspace:` ranges, private package references, source-only exports, credentials, fixtures, app code, or unexpected large files.
- [ ] Public API and compatibility changes are documented; `ENGINE_VERSION` and cache migration implications were reviewed separately.
- [ ] npm trusted-publisher mappings and the protected `npm` environment are exact; no long-lived npm token is configured.
- [ ] The release is approved specifically for publication, uses the `next` tag, and is not `1.0.0` or tagged `latest`.
- [ ] After publishing, install each package from `next` in an empty Bun and Node consumer, exercise the browser worker build, verify provenance on npm, and record package URLs and integrity values.
- [ ] Roll-forward is prepared. npm versions are immutable; use deprecation for a bad release and publish a corrected prerelease rather than attempting replacement.
