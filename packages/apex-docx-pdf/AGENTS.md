# Apex DOCX PDF agent instructions

This package ships agent-readable integration and template-authoring guidance.

1. Read `ai/CONTEXT.md` before changing an integration.
2. Use `ai/skills/integrate-apex-docx-pdf/SKILL.md` when adding or debugging the runtime package.
3. Use `ai/skills/generate-compatible-docx-template/SKILL.md` when creating, editing, migrating, or auditing a `.docx` template.

Treat the supported DOCX profile, diagnostics, explicit locale/time-zone inputs, caller-owned font/image bytes, and compiled-template engine ownership as hard contracts. Do not infer support from Microsoft Word behavior or silently discard unsupported content.

Prefer the unscoped `apex-docx-pdf` facade for application code. Use `@apexmed/browser` only for the Web Worker boundary and treat the lower-level `@apexmed/*` pipeline packages as advanced prerelease surfaces.
