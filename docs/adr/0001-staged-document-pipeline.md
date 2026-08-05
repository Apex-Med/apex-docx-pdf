---
title: "ADR 0001: Staged document pipeline"
description: "Accepted decision for distinct readonly pipeline types."
---

# ADR 0001: Staged document pipeline

- Status: accepted
- Date: 2026-08-05

## Decision

Use distinct, readonly types for validated DOCX packages, parsed OOXML, semantic documents, compiled templates, resolved documents, layout documents, page display lists, and render results.

Package dependencies follow the pipeline direction. `@apex-docx-pdf/core` owns public cross-stage contracts but has no DOCX, PDF, React, Convex, or Vercel dependencies.

## Consequences

Each stage can be golden-tested independently and invalid intermediate states are harder to represent. The additional adapters are deliberate: they prevent OOXML concerns from leaking into layout and prevent the PDF implementation from becoming the pagination engine.
