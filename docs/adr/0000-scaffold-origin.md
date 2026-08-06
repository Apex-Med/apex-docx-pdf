---
title: "ADR 0000: Preserve the generated application scaffold"
description: "Records the shadcn TanStack Start monorepo origin and the generated conventions that remain authoritative."
---

# ADR 0000: Preserve the generated application scaffold

- Status: accepted
- Date: 2026-08-05

## Context

The project brief required the initial application to be generated in an empty
directory with:

```bash
bunx --bun shadcn@latest init --preset b1oVyCeI --template start --monorepo --pointer
```

The user confirmed that the scaffold command had already been run before the
engine work began. The original interactive terminal transcript is not a
repository artifact, so this ADR records the supplied provenance without
pretending to reconstruct historical command output.

The initial repository history and current configuration retain the expected
generated shape: a TanStack Start application, Bun workspaces, Turborepo, the
shared `packages/ui` workspace, the `base-sera` shadcn style, Hugeicons, shared
aliases, Tailwind styles, pointer-cursor rules, and the generated build setup.

## Decision

Treat the generated scaffold and its conventions as the application baseline.
Add document-engine packages and product routes around that baseline; do not
replace it with a handwritten starter or silently reinitialize the live
repository.

Future shadcn components must be added from the repository root with the Bun
CLI and the application configuration:

```bash
bunx --bun shadcn@latest add <component> -c apps/web
```

## Consequences

The repository can substantiate the preserved generated structure and the
user-supplied command provenance, but it does not claim an independently
captured bootstrap transcript. Reproducing a fresh scaffold for comparison must
happen only in a disposable directory and must never overwrite the live tree.
