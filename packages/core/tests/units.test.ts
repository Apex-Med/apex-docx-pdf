import { describe, expect, test } from "bun:test"
import { DEFAULT_RESOURCE_LIMITS } from "../src/resources"

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

describe("resource limits", () => {
  test("bounds raster area consistently with image preparation", () => {
    expect(DEFAULT_RESOURCE_LIMITS.maxImagePixels).toBe(100_000_000)
    expect(DEFAULT_RESOURCE_LIMITS.maxDecodedImageBytes).toBe(400_000_000)
  })
})
