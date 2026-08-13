# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

TypeScript developers and product teams that generate business documents from DOCX templates authored in Microsoft Word or Google Docs. They use the web application and its playground to evaluate compatibility, inspect generated template contracts and diagnostics, bind representative JSON data, and verify PDF output before integrating the engine.

## Product Purpose

Apex DOCX PDF turns a deliberately bounded DOCX template profile and typed data into deterministic, searchable PDFs. The web application explains the engine, documents its exact compatibility boundary, and provides a browser-based workspace for compiling templates, diagnosing unsupported content, and rendering representative documents. Success means users can determine whether a template is supported and produce repeatable output without relying on an office installation or an external conversion service.

## Positioning

Apex owns the full document pipeline: DOCX package validation, OOXML parsing, template compilation, data binding, layout, pagination, and PDF generation. It does not shell out to Microsoft Word or LibreOffice, drive Chromium as a print renderer, or delegate conversion to an external API. Unsupported or materially lossy content is surfaced through explicit, source-linked diagnostics instead of being silently discarded.

## Operating Context

Users author templates in Microsoft Word or Google Docs, export them as DOCX, and integrate the TypeScript engine into browser or server workflows. The local-first playground accepts a DOCX and JSON data, exposes the compiled manifest, schema, diagnostics, and rendered PDF, and keeps document processing in the browser by default. Documentation and the support matrix are part of the compatibility contract rather than marketing approximations.

## Capabilities and Constraints

- The renderer supports an explicit, bounded DOCX profile; common Word behavior is not implicitly supported.
- Deterministic output depends on explicit template bytes, data, engine version, locale, IANA time zone, font bytes and configuration, image bytes and dimensions, metadata, limits, and render options.
- Output PDFs are searchable and source content remains traceable through stable diagnostics where source locations are available.
- Browser rendering runs through a worker so document work stays off the interface thread.
- Browser-local document processing is the default product boundary. Cloud persistence and production identity or authorization must not be implied unless separately implemented and verified.
- Product copy must distinguish implemented local or prerelease evidence from verified production readiness.
- The supported image, font, layout, section, field, table, numbering, and template-language profiles remain intentionally bounded and are defined by the support documentation and executable fixtures.

## Brand Commitments

The product name is **Apex DOCX PDF**. Its voice is precise, technical, candid about limits, and evidence-led. Claims must preserve the distinction between supported behavior, known exclusions, prerelease status, and deployment or production proof.

## Evidence on Hand

- The repository README documents the implemented pipeline, compatibility version, package boundaries, supported profile, and known exclusions.
- `docs/` contains the authoring guide, template language, deterministic-input contract, troubleshooting guidance, and support matrix.
- `apps/web/src/routes/playground.tsx` and its workspace components provide the browser-based template inspection and rendering workflow.
- `apps/web/src/routes/support.tsx` exposes the compatibility matrix in the application.
- Automated fixtures and tests across the engine, DOCX, layout, PDF, fonts, images, browser, and web packages provide implementation evidence.
- No testimonials, customer logos, production-scale benchmarks, or broad Word-compatibility proof are established and must not be fabricated.

## Product Principles

1. Make the compatibility boundary explicit and testable.
2. Prefer deterministic, inspectable behavior over ambient platform behavior.
3. Diagnose unsupported or lossy input instead of silently degrading it.
4. Keep document bytes and rendering local by default.
5. Make every readiness claim match the evidence actually available.

## Accessibility & Inclusion

The web application must remain keyboard-operable, semantically structured, and usable with assistive technology across its documentation, support matrix, playground, and editor workflows.
