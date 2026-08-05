# Apex DOCX PDF

A Bun-first, deterministic DOCX-template-to-PDF engine and TanStack Start reference application.

The project is being built around an explicit supported DOCX profile. It performs its own template compilation, document layout, pagination, and PDF rendering without LibreOffice, Chromium, Microsoft Word, or an external conversion API.

## Development

```bash
bun install --frozen-lockfile
bun run dev
```

The web application is available at [http://localhost:3000](http://localhost:3000).

Run the repository quality gates with:

```bash
bun run lint
bun run typecheck
bun test
bun run build
```

## Adding components

Add shadcn components from the repository root with Bun:

```bash
bunx --bun shadcn@latest add button -c apps/web
```

This will place the ui components in the `packages/ui/src/components` directory.

## Using components

To use the components in your app, import them from the `ui` package.

```tsx
import { Button } from "@workspace/ui/components/button";
```

## Architecture

The engine pipeline is deliberately staged:

```text
DOCX bytes -> validated package -> parsed OOXML -> semantic document
-> compiled template -> resolved document -> layout -> display list -> PDF bytes
```

See [docs/architecture.md](docs/architecture.md) for package boundaries, invariants, and the initial vertical-slice scope.
