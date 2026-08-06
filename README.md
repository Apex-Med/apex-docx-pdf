# Apex DOCX PDF

A Bun-first, deterministic DOCX-template-to-PDF engine and TanStack Start reference application.

The project is being built around an explicit supported DOCX profile. It performs its own template compilation, document layout, pagination, and PDF rendering without LibreOffice, Chromium, Microsoft Word, or an external conversion API.

Phases 1–8 are implemented under engine compatibility version `0.0.0-phase.8`, with local Phase 9 hardening evidence and Phase 10 prerelease preparation checked in. The renderer supports the bounded Phase 6 DOCX profile—inline PNG/JPEG images, multiple `nextPage` sections, portrait/landscape geometry, inherited default headers and footers, and decimal `PAGE`/`NUMPAGES` fields—plus canonical `{{@image path}}` values backed by caller-owned bytes and dimensions. The public playground is local-only: documents and data stay in the browser and cloud persistence is not exposed. PDF output is deterministic, searchable, source-linked, and upright; repeated image bytes are deduplicated into stable XObjects, with PNG alpha emitted as an `/SMask`.

The image profile remains deliberately bounded. Static images must be internal DOCX relationships with explicit positive DrawingML dimensions; dynamic images must use canonical `{{@image path}}` tags and resolve to explicit PNG/JPEG bytes, pixel dimensions, and physical twip bounds before layout. The renderer performs no image fetch and does not support anchors/floating placement, crop, rotation, SVG, or broad color-profile conversion. Dynamic alt text is retained in the semantic document, but the current PDF is untagged. Explicit left/start Word tab stops are supported only at positive integer-twip positions with no leader; default and non-left tab behavior is rejected. Configured TrueType fonts are deterministically subsetted with exact source-to-subset glyph maps. Continuous/odd/even section breaks, first/even headers, automatic header/footer numbering, complex scripts, CFF embedding, variable-font axis instantiation, complete Word autofit, production identity/authorization, and broad Word/Google-export/production-readiness claims remain outside the current boundary.

The local-only reference playground is deployed at [pdf-docx.apexmed.dev](https://pdf-docx.apexmed.dev), with [docx-pdf.apexmed.dev](https://docx-pdf.apexmed.dev) as an additional verified alias. That hosted browser surface is verified; it is not a persistent SaaS or production-identity claim.

The current source tree contains the `apex-docx-pdf` umbrella and public `@apexmed/*` packages at `0.1.0-next.0`. In this repository, run `bun install --frozen-lockfile` and consume them through the Bun workspace. `bun run packages:consumer-smoke` also proves that the prepared tarballs install in isolated Bun projects, type-check through their published declarations, and render identically under Bun and Node. After the approval-gated npm prerelease is published, consumers will be able to install the umbrella with `bun add apex-docx-pdf@next` or use fixed-version advanced packages directly. No npm publication is claimed yet; browser-worker bindings and React devtools remain opt-in.

## Development

```bash
bun install --frozen-lockfile
bun run dev
```

`bun run dev` starts the Turbo application tasks. Convex foundations remain in the repository for possible future SaaS work, but the current playground does not expose cloud persistence and does not require a Convex process.

The web application is available at [http://localhost:3000](http://localhost:3000).

Documentation is authored and previewed with Mintlify from `docs/`:

```bash
bun run docs:dev
```

The Mintlify preview runs at [http://localhost:3001](http://localhost:3001). In development the web application links Documentation there. Set `VITE_DOCS_URL` to the deployed Mintlify origin for production; without it, `/docs` deliberately shows a configuration-required handoff.

Run the repository quality gates with:

```bash
bun run lint
bun run typecheck
bun test
bun run docs:check
bun run build
```

The root typecheck includes the generated Convex functions as well as every Turbo workspace.

Linting uses exact-pinned Biome 2.5.7 with warnings treated as failures. Prettier remains the formatter so Tailwind class ordering stays consistent with the scaffold.

## Adding components

Add shadcn components from the repository root with Bun:

```bash
bunx --bun shadcn@latest add button -c apps/web
```

This will place the ui components in the `packages/ui/src/components` directory.

## Using components

To use the components in your app, import them from the `ui` package.

```tsx
import { Button } from "@workspace/ui/components/button"
```

## Architecture

The engine pipeline is deliberately staged:

```text
DOCX bytes -> validated package -> parsed OOXML -> semantic document
-> compiled template -> resolved document -> layout -> display list -> PDF bytes
```

See [docs/architecture.md](docs/architecture.md) for package boundaries, invariants, and the current supported slices.

Authoring and compatibility details live in the [template language](docs/template-language.mdx), [authoring guide](docs/authoring.mdx), and [support matrix](docs/supported-features.mdx).
