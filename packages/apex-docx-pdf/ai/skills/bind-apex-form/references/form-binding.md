# Form binding contract

## Package split

```ts
import {
  answersToTemplateData,
  bindingDiagnostics,
  createEmptyForm,
  questionFromTag,
  tagsFromForm,
} from "@apexmed/forms"
```

`@apexmed/forms` is the lockstep public package. It exports the headless `FormTemplate` model, walk/ops helpers, validation, tag binding, and `fromApexPages` / `toApexPages`. React `FormBuilder` and `FormRuntime` live in the monorepo and the shadcn registry; they are not in the npm tarball.

## Question kinds

Bindable inputs: `short_text`, `long_text`, `number`, `date`, `boolean`, `select`, `multi_select`, `autocomplete`, `cascader`, `reference`, `attachment`, `repeater`, `context`.

Layout-only (not render paths): `section`, `heading`, `text`, `image`.

Context bindings: `patient`, `clinician`, `current_user`, `ward`, `facility`, `department`, `today`. `today` maps to a `date` tag; other context values map to `string`.

## Tags

`tagsFromForm` emits `BoundTag` rows with `role` `value`, `each`, `if`, or `image`. Placeholders:

- value: `{{slug:string|number}}` or `{{slug:date | date:"dd-MM-yyyy"}}`
- each: `{{#each slug}}` / `{{/each}}`
- if: `{{#if slug}}` / optional `{{else}}` / `{{/if}}`
- image: `{{@image path}}`

`questionFromTag({ slug, kind })` is the inverse for editor-authored tags. `encodeValuePlaceholder` / `encodeMarkerPlaceholder` are the canonical strings to insert into DOCX runs.

## Answers to render data

```ts
const data = answersToTemplateData(form, answers)
await engine.render(compiled, data, {
  locale: "en-ZA",
  timeZone: "Africa/Johannesburg",
})
```

`answersToTagValues` is for the editor tag catalog (`tag:${key}`). Booleans become `"Yes"` / `"No"`. Multi-selects join labels. Repeaters become object arrays for `each`. Empty / unresolved Other sentinels are omitted.

Dates stored on the form must become offset-bearing ISO 8601 strings before the engine date formatter runs.

## Diagnostics

Pass the live document's value slugs, markers, and image paths into `bindingDiagnostics` and `markerBalanceDiagnostics`. Unmatched form keys, missing closing markers, and image paths without caller-owned bytes are errors, not hints.

## UI

Copy `form-builder` and `form-runtime` from the repository registry into the host app. Those components depend on TanStack Form, `@workspace/ui`, and `@apexmed/forms`. Do not import `@apexmed/forms/ui` from the published package.
