# Apex DOCX PDF

A Bun-first, deterministic DOCX-template-to-PDF engine and TanStack Start reference application.

The project is being built around an explicit supported DOCX profile. It performs its own template compilation, document layout, pagination, and PDF rendering without LibreOffice, Chromium, Microsoft Word, or an external conversion API.

Phases 1–8 are implemented under engine version `0.0.0-phase.7`, with local Phase 9 hardening evidence and Phase 10 prerelease preparation checked in. The renderer supports the bounded Phase 6 DOCX profile—inline PNG/JPEG images, multiple `nextPage` sections, portrait/landscape geometry, inherited default headers and footers, and decimal `PAGE`/`NUMPAGES` fields—plus canonical `{{@image path}}` values backed by caller-owned bytes and dimensions. The playground is local-first: rendering stays in the browser, while an optional collapsed Convex panel remains off until the user explicitly enables persistence and chooses Save. PDF output is deterministic, searchable, source-linked, and upright; repeated image bytes are deduplicated into stable XObjects, with PNG alpha emitted as an `/SMask`.

The image profile remains deliberately bounded. Static images must be internal DOCX relationships with explicit positive DrawingML dimensions; dynamic images must use canonical `{{@image path}}` tags and resolve to explicit PNG/JPEG bytes, pixel dimensions, and physical twip bounds before layout. The renderer performs no image fetch and does not support anchors/floating placement, crop, rotation, SVG, or broad color-profile conversion. Dynamic alt text is retained in the semantic document, but the current PDF is untagged. Explicit left/start Word tab stops are supported only at positive integer-twip positions with no leader; default and non-left tab behavior is rejected. Continuous/odd/even section breaks, first/even headers, automatic header/footer numbering, complex scripts, CFF embedding, true default font subsetting, complete Word autofit, production identity/authorization, deployment, and broad Word/Google-export/production claims remain outside the current boundary.

The current source tree contains the `apex-docx-pdf` umbrella and public `@apex-docx-pdf/*` packages at `0.1.0-next.0`. In this repository, run `bun install --frozen-lockfile` and consume them through the Bun workspace. After the approval-gated npm prerelease is published, consumers will be able to install the umbrella with `bun add apex-docx-pdf@next` or use fixed-version advanced packages directly. No npm publication is claimed yet; browser-worker bindings and React devtools remain opt-in.

## Development

```bash
bun install --frozen-lockfile
bun run dev
bun run convex:dev
```

Run the two development commands in separate terminals. `bun run dev` starts the Turbo application tasks; `bun run convex:dev` starts the local Convex backend. For an unlinked backend, use `CONVEX_AGENT_MODE=anonymous bun run convex:dev`. Persistence remains opt-in in the playground and no document bytes leave the browser until the user explicitly enables it and saves.

The web application is available at [http://localhost:3000](http://localhost:3000).

Documentation is authored and previewed with Mintlify from `docs/`:

```bash
bun run docs:dev
```

The Mintlify preview runs at [http://localhost:3001](http://localhost:3001). The web application links Documentation directly to Mintlify—set `VITE_DOCS_URL` to the deployed docs URL when building for production (defaults to `http://localhost:3001`).

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
