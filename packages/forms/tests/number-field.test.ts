import { describe, expect, test } from "bun:test"

import {
  normalizeDecimalInput,
  parseDecimalInput,
} from "@workspace/ui/components/number-field"

describe("decimal number input", () => {
  test("converts commas to a single period", () => {
    expect(normalizeDecimalInput("1,5")).toBe("1.5")
    expect(normalizeDecimalInput("1,")).toBe("1.")
    expect(normalizeDecimalInput(",5")).toBe(".5")
    expect(normalizeDecimalInput("-1,25")).toBe("-1.25")
  })

  test("keeps only the first decimal separator", () => {
    expect(normalizeDecimalInput("1.2.3")).toBe("1.23")
    expect(normalizeDecimalInput("1,2,3")).toBe("1.23")
    expect(normalizeDecimalInput("1.,2")).toBe("1.2")
    expect(normalizeDecimalInput("1.5,")).toBe("1.5")
  })

  test("strips non-numeric characters and extra minuses", () => {
    expect(normalizeDecimalInput("12a3")).toBe("123")
    expect(normalizeDecimalInput("--4")).toBe("-4")
    expect(normalizeDecimalInput("4-2")).toBe("42")
    expect(normalizeDecimalInput(" 1 000,5 ")).toBe("1000.5")
  })

  test("parses complete values and keeps incomplete drafts empty", () => {
    expect(parseDecimalInput("1.5")).toBe(1.5)
    expect(parseDecimalInput("1.")).toBe(1)
    expect(parseDecimalInput(".5")).toBe(0.5)
    expect(parseDecimalInput("")).toBeNull()
    expect(parseDecimalInput("-")).toBeNull()
    expect(parseDecimalInput(".")).toBeNull()
    expect(parseDecimalInput("-.")).toBeNull()
  })
})
