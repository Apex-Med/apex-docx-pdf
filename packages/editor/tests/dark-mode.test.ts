import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { EDITOR_CSS } from "../src/styles/editor-css"

describe("dark mode adaptivity", () => {
  test("editor CSS defines light tokens and .dark overrides for chrome/desk", () => {
    expect(EDITOR_CSS).toContain("--apex-desk:")
    expect(EDITOR_CSS).toContain("--apex-chrome-bg:")
    expect(EDITOR_CSS).toContain(".dark")
    expect(EDITOR_CSS).toContain("prefers-color-scheme: dark")
    // Paper stays white for print fidelity
    expect(EDITOR_CSS).toMatch(/--apex-page-bg:\s*#ffffff/)
    // Dark desk is not the light gray
    expect(EDITOR_CSS).toContain("--apex-desk: #1c1c1e")
    // Context menu and ribbon use chrome tokens
    expect(EDITOR_CSS).toContain("background: var(--apex-chrome-bg)")
    expect(EDITOR_CSS).toContain("color: var(--apex-chrome-fg)")
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
      join(import.meta.dir, "../../../apps/web/src/routes/editor.tsx"),
      "utf8"
    )

    expect(divergence).toContain("apex-divergence-overlay")
    expect(divergence).not.toContain("#fff7ed")
    expect(preview).toContain("apex-print-preview")
    expect(preview).not.toContain('background: "#fff"')
    expect(editor).toContain("apex-editor-root")
    expect(editor).toContain("bg-background")
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
})
