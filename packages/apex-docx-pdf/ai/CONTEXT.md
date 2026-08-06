# Apex DOCX PDF integration context

Use this file as the compact package contract for an agent working in a consuming codebase. Read the linked skill when the task needs procedural detail.

## Identity and scope

- Install the prerelease with `bun add apex-docx-pdf@next`.
- Import application APIs from `apex-docx-pdf`.
- The npm version comes from this package's `package.json`. The exported `ENGINE_VERSION` is a separate render/cache compatibility identifier.
- The engine performs its own DOCX parsing, templating, layout, pagination, and PDF serialization. It does not call Word, LibreOffice, Chromium, a font CDN, an image URL, or a conversion service.
- The current output is deterministic, searchable PDF for the documented bounded profile. It is not a general Word renderer.

## Minimal server or local integration

```ts
import { EngineOperationError, createDocxPdfEngine } from "apex-docx-pdf"

const engine = await createDocxPdfEngine()
const templateBytes = new Uint8Array(
  await Bun.file("template.docx").arrayBuffer()
)

const inspection = await engine.inspect(templateBytes)
if (!inspection.documentModelAvailable) {
  throw new Error("The DOCX could not be inspected")
}

const compiled = await engine.compile(templateBytes, {
  unsupportedFeatures: "strict",
})

const result = await engine.render(compiled, data, {
  locale: "en-ZA",
  timeZone: "Africa/Johannesburg",
  includeLayoutTrace: true,
})

await Bun.write("output.pdf", result.pdf)
```

Catch `EngineOperationError` at the application boundary and retain its structured `code` and `diagnostics`. Never replace a failed render with a partial PDF.

## Lifecycle invariants

- Compile hostile or user-supplied bytes before trusting template data.
- A compiled template is opaque and belongs to the exact engine instance that created it. Do not serialize it, transfer it to another worker/process, or reconstruct it.
- Cache by the exact template hash, engine version, font-registry hash, canonical data, and render options. Bump or invalidate cache state when any compatibility input changes.
- Every render requires explicit `locale` and IANA `timeZone` values. Supported deterministic locale profiles are currently `en-US` and `en-ZA`.
- Treat diagnostics as part of the result contract. An output file alone does not prove that every source feature was represented.

## Template data contract

- Values use typed dotted paths: `{{customer.name:string}}`.
- Supported value types are `string`, `number`, `boolean`, and `date`.
- Safe formatters are `upper`, `lower`, `currency:"ISO"`, and bounded `date` patterns.
- `date` defaults to `dd-MM-yyyy`; time tokens are explicit and require an offset-bearing ISO 8601 input.
- Conditions and loops occupy whole paragraphs or dedicated whole table rows. Loop items must be objects and inner paths are relative to the current item.
- Dynamic images use only `{{@image path}}` and caller-owned PNG/JPEG bytes plus pixel and twip dimensions. URLs are never resolved.
- Compilation exposes `manifest`, deterministic JSON Schema Draft 2020-12, `starterData`, source locations, and diagnostics. Use those outputs rather than maintaining a second hand-written schema.

## Runtime selection

- Bun/Node: use `createDocxPdfEngine()` from `apex-docx-pdf`.
- Browser: run `installRendererWorker()` from `@apexmed/browser/worker` inside a module worker and control it with `BrowserRendererClient` from `@apexmed/browser`.
- React debugging UI: use `@apexmed/devtools` only when a source-linked display-list or layout-trace view is useful.
- Low-level packages such as `@apexmed/docx`, `@apexmed/layout`, and `@apexmed/pdf` are advanced prerelease surfaces. They can bypass high-level safety orchestration.

## Fonts and media

- The application owns font acquisition, licensing, version pinning, and exact bytes.
- Register static TrueType faces for every weight/style tuple promised by the application. Variable-axis instantiation and CFF PDF embedding are unsupported.
- Without an explicit font configuration, only the bounded Helvetica/WinAnsi compatibility path is available.
- Static template images must be internal inline PNG/JPEG relationships with explicit positive dimensions.
- Do not fetch fonts or images during rendering, discover OS fonts, or execute uploaded embedded fonts.

## Security boundary

The DOCX parser fails closed for unsafe ZIP paths, external relationships, XML hazards, macros/VBA, OLE or embedded packages, ActiveX, attached templates/toolbars, custom UI, web extensions, alternative-format chunks, executable attachments, and ambiguous unsupported content. `compatible` and `lenient` modes permit only explicitly documented deterministic fallbacks; they never relax package security or accept silent content loss.

Diagnostics have a stable structural shape (`code`, `severity`, `message`, and optional source/details), but the prerelease does not promise a stable taxonomy for every code. The host owns redaction and must not expose sensitive source text or values through logs or API responses.

## Shipped skills

- Read `ai/skills/integrate-apex-docx-pdf/SKILL.md` for an integration workflow, browser split, error handling, and verification.
- Read `ai/skills/generate-compatible-docx-template/SKILL.md` for the authoring grammar, supported Word layout profile, and template validation workflow.
