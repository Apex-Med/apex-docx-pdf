# Security and determinism

## Fail-closed input handling

Pass the exact untrusted bytes to the high-level engine. Do not unzip or rewrite the document into a less constrained intermediate unless that transformation has an equally strict security review. The parser rejects unsafe paths, external relationships, XML hazards, active content, embedded executables/packages, macros, OLE, ActiveX, attached templates/toolbars, custom UI, web extensions, and alternative-format chunks.

`unsupportedFeatures: "strict"` is the default. `compatible` permits only the documented ignored `lastRenderedPageBreak` hint. `lenient` additionally permits the documented empty soft-hyphen replacement. Neither mode relaxes security, structural validity, resource limits, image validation, or ambiguous content-loss errors.

## Deterministic state

Partition a render cache with all of these inputs:

- exact template bytes or `templateHash`;
- `ENGINE_VERSION`;
- exact package/application version where operationally useful;
- font registry hash and font bytes;
- canonical template data;
- locale, time zone, metadata, trace option, and reviewed resource limits.

Do not cache a compiled object across an engine instance, worker, process, or deployment. Recompile from bytes after any ownership boundary changes.

The package does not export a cache-key canonicalizer. The host must use a reviewed canonical JSON encoding that sorts object keys, preserves array order and JSON value types, rejects unsupported/cyclic values, and frames distinct inputs without concatenation collisions.

## Persistence and privacy

The package has no authentication or tenant model. If the host persists templates, data, PDFs, diagnostics, or traces, it must add its own identity, authorization, retention, deletion, rate-limit, and audit policies. Keep real personal, clinical, financial, and secret values out of examples, logs, screenshots, issue reports, and test fixtures.

Diagnostics contain `code`, `severity`, `message`, and optional source/details. Treat code values as prerelease diagnostics rather than a complete stable taxonomy. Redaction is host-owned: do not echo document values, source text, filesystem paths, or layout traces into public API errors.

## Verification

Use representative and adversarial data. Require repeat-identical PDF bytes for identical compatibility inputs, no error diagnostics, bounded resource usage, correct page count, searchable/upright text, and expected template/document hashes. Test long values, empty arrays, maximum expected rows, missing fields, wrong types, cancellation, malformed archives, unsupported Word features, and every configured font/image profile.
