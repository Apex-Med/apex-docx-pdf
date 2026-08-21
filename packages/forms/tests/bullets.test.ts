import { describe, expect, test } from "bun:test"

import { continueBulletList, normalizeBulletMarkers } from "../src/index"

describe("long-text bullets", () => {
  test("normalizeBulletMarkers turns dash prefixes into bullets", () => {
    expect(normalizeBulletMarkers("- One\n- Two")).toBe("• One\n• Two")
    expect(normalizeBulletMarkers("  - Indented")).toBe("  • Indented")
    expect(normalizeBulletMarkers("not- a list")).toBe("not- a list")
  })

  test("continueBulletList inserts the next bullet on Enter", () => {
    const value = "• First"
    const next = continueBulletList(value, value.length, value.length)
    expect(next?.value).toBe("• First\n• ")
    expect(next?.selectionStart).toBe("• First\n• ".length)
  })

  test("continueBulletList ends the list from an empty bullet", () => {
    const value = "• First\n• "
    const caret = value.length
    const next = continueBulletList(value, caret, caret)
    expect(next?.value).toBe("• First\n")
    expect(next?.selectionStart).toBe("• First\n".length)
  })

  test("continueBulletList ignores non-bullet lines and ranges", () => {
    expect(continueBulletList("plain", 5, 5)).toBeNull()
    expect(continueBulletList("• First", 0, 3)).toBeNull()
  })
})
