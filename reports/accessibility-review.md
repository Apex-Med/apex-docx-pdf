# Accessibility review

Date: 2026-08-05. This is an automated and keyboard-focused local review of the reference application, not a claim of WCAG conformance or a substitute for testing with assistive technologies.

## Automated coverage

`bun run test:playground-smoke` launches the real TanStack Start application in Chromium and runs `@axe-core/playwright` 4.12.1 against WCAG 2 A/AA, WCAG 2.1 A/AA, and WCAG 2.2 AA rules. The checked states are:

- the light-theme landing page at 1440 × 1000;
- the light-theme desktop playground after the sample template has compiled and its three-page PDF is visible;
- the dark-theme mobile playground at 390 × 844 after keyboard navigation across the responsive panels;
- the populated light-theme playground at a 320 × 800 CSS-pixel reflow viewport, including native date/date-time controls, their explicit format/time-zone descriptions, responsive panel navigation, and a root horizontal-overflow assertion.

The current gate reports zero automated violations in those states. It also treats console errors, page errors, failed requests, and unexpected external requests as failures.

## Keyboard and state coverage

The same Chromium flow verifies visible focusable controls, an accessible upload path, form/JSON synchronization, invalid-data alerts, stale-result removal, cancellation and template removal, PDF download, and roving mobile tabs using ArrowRight, End, and Home. Scrollable engine-preview and PDF-viewer regions are keyboard focusable.

The automated 320 CSS-pixel case is equivalent to the layout width of a 1280-pixel desktop viewport at 400% zoom and is stricter than the 200% reflow width. An additional in-app browser review at 375 × 812 independently confirmed that the playground has no root-level horizontal overflow, the three responsive panels remain operable, and the generated sample form exposes native `date` and `datetime-local` controls. The visible format descriptions match the template metadata (`dd-MM-yyyy` and `dd-MM-yyyy HH:mm`) and name the explicit `Africa/Johannesburg` time zone. Editing a generated field removes the stale PDF and announces that another render is needed.

The first automated pass identified and the implementation corrected:

- insufficient light-theme muted and brand text contrast;
- an unnamed PDF zoom combobox;
- decorative PDF raster and thumbnail images exposed without presentational semantics;
- scrollable preview and PDF regions that were not keyboard focusable.

## Boundaries

Automated axe checks cannot prove screen-reader usability, speech-input behavior, cognitive accessibility, reflow beyond the covered viewports, motion comfort beyond the existing reduced-motion rules, or every dynamic PDF-viewer state. A manual audit with VoiceOver, a complete keyboard-only sequence, actual browser zoom, and representative persisted/error states remains required before claiming formal conformance.
