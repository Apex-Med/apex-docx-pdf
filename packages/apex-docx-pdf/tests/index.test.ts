import { describe, expect, test } from "bun:test"

import { ENGINE_VERSION, createDocxPdfEngine } from "../src"

describe("umbrella public API", () => {
  test("exports the engine factory and compatibility version", () => {
    expect(typeof createDocxPdfEngine).toBe("function")
    expect(ENGINE_VERSION).toMatch(/^0\.0\.0-phase\.\d+$/u)
  })
})
