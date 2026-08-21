---
name: bind-apex-form
description: Bind Apex DOCX template tags to the public @apexmed/forms headless model, convert answers into render data, and choose registry UI versus the npm package. Use when adding FormBuilder/FormRuntime, creating FormTemplate questions from tags, mapping answers into engine.render, or diagnosing unmatched placeholders.
---

# Bind an Apex form to a DOCX template

Keep layout in the DOCX. Keep questions, visibility, and validation in `@apexmed/forms`. Do not invent a second schema beside `tagsFromForm` and the compiled template manifest.

## Load only the needed reference

- Read [references/form-binding.md](references/form-binding.md) for the model, tag mapping, and answer-to-render conversion.
- Use `integrate-apex-docx-pdf` for `createDocxPdfEngine` / browser-worker wiring.
- Use `generate-compatible-docx-template` when the `.docx` itself must change.

## Workflow

1. Install `apex-docx-pdf@next` and `@apexmed/forms@next`. The published forms package is headless: model, binding, and the Apex adapter only.
2. Inspect and strictly compile the exact DOCX. Treat `compiled.manifest` as the layout contract.
3. Build or load a `FormTemplate`. Derive questions from tags with `questionFromTag` / `tagsFromForm` rather than hand-copying slugs.
4. Run `bindingDiagnostics` and `markerBalanceDiagnostics` on the form plus the document's value slugs, image paths, and block markers. Fix unmatched keys before rendering.
5. Collect `FormAnswers`, then call `answersToTemplateData(form, answers)` (or `answersToTagValues` when the editor tag catalog is the consumer). Pass that object to `engine.render` with explicit `locale` and `timeZone`.
6. Ship builder/runtime UI from the workspace shadcn registry (`form-builder`, `form-runtime`), not from a published `@apexmed/forms/ui` export. The npm tarball does not include React UI.

## Required contracts

- Question keys must match template paths. Repeaters bind `each` markers; conditions bind `if` markers; attachments and images still need caller-owned bytes.
- `@apexmed/forms` does not parse DOCX, layout pages, or emit PDF. It only prepares data for the engine.
- Do not persist real personal, clinical, or secret answers in fixtures, logs, or skill output.

## Completion evidence

- Diagnostics contain no binding errors for the intended tags.
- `engine.render` accepts the mapped data without missing-path failures.
- Repeat-identical PDF bytes for identical answers, locale, time zone, and template hash.
