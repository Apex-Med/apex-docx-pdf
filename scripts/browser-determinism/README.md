# Browser determinism gate

This harness builds only the compact runtime core-suite page and the production web render worker. It launches headless Chromium, compiles and renders through `BrowserRendererClient`, and requires exact agreement with the same checked-in canonical evidence used by Bun and Node 24. The suite covers:

- plain template substitution and formatting;
- template-table row expansion across pages;
- static PNG/JPEG rendering with sections, headers, and footers; and
- stable rejection code and diagnostic-code evidence for missing required data.

Every successful case records:

- PDF bytes (SHA-256)
- canonical layout-trace SHA-256
- offline font-registry SHA-256
- searchable text
- page count

It also fails on browser console errors, page errors, failed requests, invalid PDF structure, or worker/protocol failures.

Install the exact locked dependencies and Chromium once:

```sh
bun install --frozen-lockfile
bunx playwright install chromium
```

Run the gate:

```sh
bun run test:browser-determinism
```

Run the Bun/Node 24 half of the same core suite with:

```sh
bun run test:cross-runtime
```

CI uses `bunx playwright install --with-deps chromium` before running both gates. The suite and browser worker deliberately use the same checked-in offline font catalog; no operating-system font lookup or network font fetch is allowed. This is focused release evidence for the implemented cases above, not broad Word-format, browser-matrix, operating-system, or hosted-production proof.
