# Apex DOCX PDF

A Bun-first, deterministic DOCX-template-to-PDF engine and TanStack Start reference application.

The project is being built around an explicit supported DOCX profile. It performs its own template compilation, document layout, pagination, and PDF rendering without LibreOffice, Chromium, Microsoft Word, or an external conversion API.

Phase 6 is implemented and hardening under engine version `0.0.0-phase.6`. It adds bounded package-owned inline PNG/JPEG images, multiple `nextPage` sections, portrait/landscape page geometry, inherited default headers and footers, reusable header/footer template values, and decimal `PAGE`/`NUMPAGES` fields to the earlier template, numbering, table, paragraph, and explicit-font slices. PDF output remains deterministic, searchable, source-linked, and upright; repeated image bytes are deduplicated into stable XObjects, with PNG alpha emitted as an `/SMask`. Font parsing and LTR Latin shaping use exact-pinned `fontkit` 2.0.4, and the default PDF path embeds complete font programs rather than claiming true subsetting.

The Phase 6 image profile is deliberately static: images must be internal DOCX relationships with explicit positive DrawingML dimensions. The renderer performs no image fetch and does not support dynamic image tags, anchors/floating placement, crop, rotation, SVG, or broad color-profile conversion. Continuous/odd/even section breaks, first/even headers, automatic header/footer numbering, complex scripts, CFF embedding, true default font subsetting, complete Word autofit, Convex integration, deployment, and broad Word/cross-runtime/production claims remain outside the current boundary.

## Development

```bash
bun install --frozen-lockfile
bun run dev
```

The web application is available at [http://localhost:3000](http://localhost:3000).

Documentation is authored and previewed with Mintlify from `docs/`:

```bash
bun run docs:dev
```

The Mintlify preview runs at [http://localhost:3001](http://localhost:3001). Set `VITE_DOCS_URL` to the deployed Mintlify URL when building the web application.

Run the repository quality gates with:

```bash
bun run lint
bun run typecheck
bun test
bun run docs:check
bun run build
```

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
