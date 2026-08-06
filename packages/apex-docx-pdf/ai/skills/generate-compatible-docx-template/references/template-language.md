# Template language reference

## Values

```text
{{path}}
{{path:type}}
{{path | formatter}}
{{path:type | formatter:"argument"}}
```

Paths are dotted own-property paths. Segments begin with a letter, `_`, or `$`; later characters may include digits. `__proto__`, `prototype`, and `constructor` are forbidden.

Explicit types:

- `string`: JSON string
- `number`: finite JSON number
- `boolean`: JSON boolean
- `date`: offset-bearing ISO string when formatted

Untyped values accept strings, finite numbers, and booleans. Missing values and type mismatches fail by default.

## Safe formatters

```text
{{customer.name:string | upper}}
{{customer.code:string | lower}}
{{invoice.total:number | currency:"ZAR"}}
{{invoice.issuedAt:date | date}}
{{appointment.startsAt:date | date:"dd-MM-yyyy HH:mm"}}
{{appointment.startsAt:date | date:"dd-MM-yyyy hh:mm a"}}
```

- `upper` and `lower` take no argument.
- `currency:"ISO"` takes one uppercase three-letter code and requires render locale `en-US` or `en-ZA`.
- `date` defaults to `dd-MM-yyyy`.
- A date pattern contains one year (`yy` or `yyyy`), month (`M`, `MM`, `MMM`, or `MMMM`), and day (`d` or `dd`).
- Add `H`/`HH`, optional `m`/`mm`, and optional `s`/`ss` for 24-hour time. Use `h`/`hh` with `a` for 12-hour time.
- Token case matters: `MM` is month; `mm` is minutes.
- Allowed literals are spaces and `-`, `/`, `.`, `,`, `:`.
- Formatted inputs include `Z` or a numeric offset, for example `2026-08-05T09:30:00+02:00`.

## Paragraph blocks

Every marker is the only non-whitespace content in its Word paragraph:

```text
{{#if invoice.showDetails}}
{{#each invoice.items}}
{{description:string}} — {{amount:number | currency:"ZAR"}}
{{/each}}
{{else}}
No details available
{{/if}}
```

Blocks may nest. `if` requires a boolean. `each` requires an array of objects. Inside `each`, paths resolve relative to the current item and do not fall back to root data. Open and close the block inside the same body, header, footer, or table-cell container.

## Table-row blocks

Put each marker in its own dedicated row, with no other visible content across that row's cells:

```text
row: {{#each invoice.items}}
row: {{description:string}} | {{amount:number | currency:"ZAR"}}
row: {{/each}}
```

Row blocks may nest but cannot contain or alter repeating header rows, enclose vertical merges, or cross table boundaries.

## Dynamic images

The only dynamic image syntax is:

```text
{{@image company.logo}}
```

The render value is:

```ts
{
  mimeType: "image/png" | "image/jpeg",
  bytes: Uint8Array,
  pixelWidth: number,
  pixelHeight: number,
  width: number,  // positive twips
  height: number, // positive twips
  preserveAspectRatio?: boolean,
  altText?: string,
}
```

The engine never resolves an image URL. Static relationship-owned DOCX images are not template fields and cannot be replaced by data.

## Generated contract

Compilation emits sorted manifest fields, JSON Schema Draft 2020-12, starter data, source locations, inferred syntax, and formatter references. Loop children use canonical paths such as `invoice.items[].description`. Starter arrays contain one object; date starters use `1970-01-01T00:00:00.000Z`.

Use the compiled outputs as the authoritative contract. Do not infer schema from example JSON or maintain a second incompatible field list.
