import { describe, expect, test } from "bun:test"

import { DisplayListPreview, LayoutTraceViewer } from "../src"

describe("devtools public API", () => {
  test("exports the canonical display-list preview component", () => {
    expect(typeof DisplayListPreview).toBe("function")
    expect(typeof LayoutTraceViewer).toBe("function")
  })
})
