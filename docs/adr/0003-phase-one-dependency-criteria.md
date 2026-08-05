---
title: "ADR 0003: Phase 1 dependency criteria"
description: "Accepted criteria for portable deterministic rendering dependencies."
---

# ADR 0003: Phase 1 dependency criteria

- Status: accepted
- Date: 2026-08-05

## Context

The engine needs ZIP decoding, namespace-aware OOXML parsing, font parsing, image decoding, and PDF writing. These dependencies can change output bytes, runtime portability, bundle size, and security posture.

## Decision

Every rendering dependency must be pure JavaScript, TypeScript, or bundled WebAssembly; work in Bun, supported Node.js, and modern browsers; avoid network and native installation; expose public APIs sufficient for deterministic adapters; and carry a compatible open-source licence.

Adapters must be local and covered by deterministic fixtures. Dependencies that introduce timestamps, random IDs, unstable traversal, runtime-specific compression, or hidden system-font lookup are rejected or normalised behind the adapter.

Phase 1 may use a deliberately small local PDF serializer to prove positioned searchable text. Before broader font/image support, record a separate ADR comparing maintained PDF and font libraries using maintenance, licensing, determinism, portability, bundle size, positioned glyph support, and API stability.
