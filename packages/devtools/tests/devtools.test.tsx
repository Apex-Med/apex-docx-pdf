import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { DisplayListPreview, LayoutTraceViewer } from "../src"

describe("devtools public API", () => {
  test("exports the canonical display-list preview component", () => {
    expect(typeof DisplayListPreview).toBe("function")
    expect(typeof LayoutTraceViewer).toBe("function")
  })

  test("display-list preview hides layout-trace diagnostics unless overlays are requested", () => {
    const source = readFileSync(
      join(import.meta.dir, "../src/index.tsx"),
      "utf8"
    )
    expect(source).toContain("HIDDEN_TRACE_OVERLAYS")
    expect(source).toContain(
      "overlays={{ ...HIDDEN_TRACE_OVERLAYS, ...overlays }}"
    )
    expect(source).toContain("fontFallbacks: true")
    expect(source).toContain("...DEFAULT_TRACE_OVERLAYS,")
    expect(source).toContain("...initialOverlays")
  })

  test("glyph-run SVG preserves spaces so tag-adjacent gaps do not collapse", () => {
    const source = readFileSync(
      join(import.meta.dir, "../src/index.tsx"),
      "utf8"
    )
    expect(source).toContain('xmlSpace="preserve"')
    expect(source).toContain('whiteSpace: "pre"')
    expect(source).toContain("isWhitespaceOnlyGlyphText")
    expect(source).toContain("textLength")
  })
})
