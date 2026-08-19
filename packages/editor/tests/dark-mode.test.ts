import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { EDITOR_CSS } from "../src/styles/editor-css"
import {
  DARK_PAGES_STORAGE_KEY,
  readDarkPagesPreference,
  writeDarkPagesPreference,
} from "../src/ui/chrome-types"
import {
  DEFAULT_TABLE_OPTIONS_WIDTH,
  DEFAULT_TAGS_SIDEBAR_WIDTH,
  EDITOR_PREFERENCES_STORAGE_KEY,
  normalizeEditorPreferences,
} from "../src/ui/editor-preferences"

describe("dark mode adaptivity", () => {
  test("editor CSS defines light tokens and .dark overrides for chrome/desk", () => {
    expect(EDITOR_CSS).toContain("--apex-desk:")
    expect(EDITOR_CSS).toContain("--apex-chrome-bg:")
    expect(EDITOR_CSS).toContain(".dark")
    expect(EDITOR_CSS).toContain("prefers-color-scheme: dark")
    expect(EDITOR_CSS).toMatch(/--apex-page-bg:\s*#ffffff/)
    expect(EDITOR_CSS).toContain("--apex-page-bg: #242426")
    expect(EDITOR_CSS).toContain("[data-apex-dark-pages]")
    expect(EDITOR_CSS).toContain("--apex-page-fg: #e8eaed")
    expect(EDITOR_CSS).toContain("--apex-desk: #1c1c1e")
    expect(EDITOR_CSS).toContain("--apex-ruler-margin:")
    expect(EDITOR_CSS).toContain("background: var(--apex-page-bg)")
    expect(EDITOR_CSS).toContain("background: var(--apex-ruler-margin)")
    expect(EDITOR_CSS).not.toMatch(
      /\.apex-editor-ruler__track\s*\{[^}]*background:\s*#ffffff/s
    )
    expect(EDITOR_CSS).not.toMatch(
      /\.apex-editor-ruler__margin\s*\{[^}]*background:\s*#e8eaed/s
    )
    expect(EDITOR_CSS).toContain('[data-color="#000000" i]')
    expect(EDITOR_CSS).toContain("[data-fill-color=")
    expect(EDITOR_CSS).toContain("@media print")
    expect(EDITOR_CSS).toContain(
      ".apex-editor-surface .ProseMirror > section[data-section]"
    )
    expect(EDITOR_CSS).toContain("background: var(--apex-chrome-bg)")
    expect(EDITOR_CSS).toContain("color: var(--apex-chrome-fg)")
  })

  test("EDITOR_CSS stays in sync with editor.css", () => {
    const raw = readFileSync(
      join(import.meta.dir, "../src/styles/editor.css"),
      "utf8"
    )
    expect(EDITOR_CSS).toBe(raw)
  })

  test("React chrome components avoid hard-coded light-only colors", () => {
    const divergence = readFileSync(
      join(import.meta.dir, "../src/ui/DivergenceOverlay.tsx"),
      "utf8"
    )
    const preview = readFileSync(
      join(import.meta.dir, "../src/ui/PrintPreview.tsx"),
      "utf8"
    )
    const editor = readFileSync(
      join(import.meta.dir, "../src/ui/Editor.tsx"),
      "utf8"
    )
    const route = readFileSync(
      join(
        import.meta.dir,
        "../../../apps/web/src/routes/_authenticated/editor.tsx"
      ),
      "utf8"
    )

    expect(divergence).toContain("apex-divergence-overlay")
    expect(divergence).not.toContain("#fff7ed")
    expect(preview).toContain("apex-print-preview")
    expect(preview).not.toContain('background: "#fff"')
    expect(editor).toContain("apex-editor-root")
    expect(editor).toContain("bg-background")
    expect(editor).toContain("data-apex-dark-pages")
    expect(editor).toContain("onToggleDarkPages")
    expect(route).toContain("bg-background")
    expect(route).toContain("text-foreground")
    expect(route).toContain("border-border")
    expect(route).not.toContain("bg-slate-100")
    expect(route).not.toContain("text-slate-900")
  })

  test("page break spacer backgrounds use CSS variables (theme-reactive)", () => {
    const breaks = readFileSync(
      join(import.meta.dir, "../src/pagination/breaks.ts"),
      "utf8"
    )
    expect(breaks).toContain("var(--apex-page-bg")
    expect(breaks).toContain("var(--apex-desk")
    expect(breaks).not.toContain("var(--apex-page-shadow")
    expect(EDITOR_CSS).toContain("var(--apex-page-shadow)")
    expect(EDITOR_CSS).toContain(".apex-page-break-spacer__gap::before")
  })

  test("section sheets do not hard-code white paper in toDOM", () => {
    const schema = readFileSync(
      join(import.meta.dir, "../src/schema/index.ts"),
      "utf8"
    )
    expect(schema).toContain("background:var(--apex-page-bg,#fff)")
    expect(schema).toContain("box-shadow:var(--apex-page-shadow)")
    expect(schema).not.toContain('"background:white"')
  })

  test("dark pages preference defaults off when storage is unavailable", () => {
    expect(readDarkPagesPreference()).toBe(false)
    expect(() => writeDarkPagesPreference(false)).not.toThrow()
    expect(DARK_PAGES_STORAGE_KEY).toBe("apex-editor-dark-pages")
  })

  test("persisted editor preferences accept only bounded known values", () => {
    expect(
      normalizeEditorPreferences({
        zoom: 125,
        rulerVisible: false,
        darkPages: false,
        pageUnit: "cm",
        tagsSidebarWidth: 360,
        tableOptionsWidth: 400,
      })
    ).toEqual({
      zoom: 125,
      rulerVisible: false,
      darkPages: false,
      pageUnit: "cm",
      tagsSidebarWidth: 360,
      tableOptionsWidth: 400,
    })
    expect(
      normalizeEditorPreferences({
        zoom: 10_000,
        rulerVisible: "yes",
        darkPages: null,
        pageUnit: "px",
        tagsSidebarWidth: 10_000,
        tableOptionsWidth: 10,
      })
    ).toEqual({})
    expect(EDITOR_PREFERENCES_STORAGE_KEY).toBe("apex-editor-preferences")
    expect(DEFAULT_TAGS_SIDEBAR_WIDTH).toBe(320)
    expect(DEFAULT_TABLE_OPTIONS_WIDTH).toBe(340)
  })
})
