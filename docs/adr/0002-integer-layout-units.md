---
title: "ADR 0002: Integer twips for layout"
description: "Accepted decision to keep layout geometry in integer twips."
---

# ADR 0002: Integer twips for layout

- Status: accepted
- Date: 2026-08-05

## Decision

All semantic geometry, measurement, fragmentation, and display-list positions use integer twips. Point conversion rounds once at the boundary using `Math.round`; PDF point conversion happens only in the PDF adapter.

## Consequences

Layout avoids accumulated floating-point drift and emits stable JSON traces. Font measurement adapters must quantise results to twips before returning them to layout.
