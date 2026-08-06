# Production deployment review

Date: 2026-08-06. This records the approved Vercel production deployment and
hosted browser smoke. It is not an npm, Mintlify, Convex, production-identity,
or broad Microsoft Word compatibility claim.

## Deployment identity

- Vercel team/project: `apex-f42a7d7e/apex-docx-pdf`.
- Deployment ID: `dpl_CiFTQhuN4gUuULNtGywHVXL44q9x`.
- Immutable URL:
  `https://apex-docx-8hvemhkox-apex-f42a7d7e.vercel.app`.
- Canonical origin: `https://pdf-docx.apexmed.dev`.
- Additional verified alias: `https://docx-pdf.apexmed.dev`.
- Git source: commit `14dcdbf7962104234cee61c775f80bdf571f358e` on
  `codex/release-apex-docx-pdf`.
- Vercel reported the deployment `Ready`, the domain verified and configured
  correctly, and one 1.16 MB `__server` function in `iad1`.
- The remote build used Nitro's Vercel preset and emitted `runtime: bun1.x`
  with a 30-second maximum duration through Build Output API v3.
- `VITE_SITE_URL` is configured for canonical metadata. `VITE_CONVEX_URL` and
  `VITE_DOCS_URL` are intentionally absent: the playground is local-only and
  `/docs` shows the Mintlify configuration-required handoff.

The production candidate was deployed with domain assignment skipped, checked
through its immutable URL, and only then promoted. The canonical origin and its
`/playground`, `/docs`, and `/sitemap.xml` routes returned successfully after
promotion.

## Hosted browser evidence

Fresh headless Chromium sessions exercised the canonical origin. The landing
page rendered in Geist Mono with no browser errors and zero automated WCAG 2 A
or AA axe violations. The hosted playground exposed no cloud-persistence
controls and made the local-only boundary visible.

The generated sample rendered three upright pages. The migrated external K3
template at `/Users/craig/Downloads/K3 Discharge Template - Apex.docx` then
compiled and rendered four upright pages with 90 typed paths, zero render
diagnostics, and a 187.1 KB searchable PDF in the observed browser run. The
original pre-migration K3 file was also checked and correctly rejected because
its old placeholders are outside the canonical template language.

The final client-only playground load produced no React hydration error, page
error, or console error. Axe reported zero WCAG 2 A/AA violations for the
populated K3 state; four color-contrast checks were inconclusive because the
elements were partially obscured, not reported as violations.

## Boundaries

The observations above prove this exact deployed artifact and browser session.
They do not establish cold/warm latency distributions, peak function memory,
multi-region behavior, a browser matrix, production persistence/authentication,
Mintlify hosting, npm provenance, or a redistributable editor fixture corpus.
Vercel's deployment metadata binds the promoted artifact to the Git source
listed above; the follow-up evidence-only commit does not change application
runtime bytes.
