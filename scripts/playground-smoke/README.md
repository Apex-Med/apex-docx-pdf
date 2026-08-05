# Playground application smoke

This smoke launches the real Vite application in local-only mode and drives its
landing page and playground with headless Playwright Chromium. It covers the
sample DOCX compile/render flow, the PDF viewer and download, form/JSON state,
stale-result invalidation, invalid JSON, reset actions, mobile tabs, keyboard
semantics, and browser runtime errors without Convex or any live deployment.

Install the locked dependencies and Chromium once:

```sh
bun install --frozen-lockfile
bunx playwright install chromium
```

Run the smoke:

```sh
bun run test:playground-smoke
```

This complements, and does not replace, `bun run test:browser-determinism`,
which independently requires exact real-worker agreement with the checked-in
Bun/Node golden.
