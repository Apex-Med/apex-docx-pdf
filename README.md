# Apex DOCX PDF

A Bun-first, deterministic DOCX-template-to-PDF engine and TanStack Start reference application.

The project is being built around an explicit supported DOCX profile. It performs its own template compilation, document layout, pagination, and PDF rendering without LibreOffice, Chromium, Microsoft Word, or an external conversion API.

The implemented Phase 3 slice adds DOCX style cascades, supported paragraph formatting, and explicit caller-supplied TrueType fonts. Font parsing and LTR Latin shaping use exact-pinned `fontkit` 2.0.4; PDF output embeds complete font programs by default and does not claim true subsetting. The local worker reference bundles four openly licensed Noto Sans faces as explicit application assets. Tables, images, headers, footers, complex scripts, and deployment remain outside the current supported boundary.

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
