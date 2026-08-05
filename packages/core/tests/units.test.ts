import { describe, expect, test } from "bun:test"

import { pointsToTwips, twips, twipsToPoints } from "../src/units"

describe("layout units", () => {
  test("rounds point conversion once at the boundary", () => {
    expect(pointsToTwips(12)).toBe(twips(240))
    expect(pointsToTwips(12.025)).toBe(twips(241))
    expect(twipsToPoints(twips(241))).toBe(12.05)
  })

  test("rejects non-integer internal units", () => {
    expect(() => twips(1.5)).toThrow("safe integers")
  })
})
