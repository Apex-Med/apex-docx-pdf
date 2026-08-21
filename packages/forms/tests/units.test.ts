import { describe, expect, test } from "bun:test"

import { NUMBER_UNIT_OPTIONS, NUMBER_UNIT_VALUES } from "../src/index"

describe("number units", () => {
  test("catalog covers metric, imperial, SI, and US lab units", () => {
    const values = [...NUMBER_UNIT_VALUES]
    expect(values).toContain("kg")
    expect(values).toContain("lb")
    expect(values).toContain("cm")
    expect(values).toContain("in")
    expect(values).toContain("°C")
    expect(values).toContain("°F")
    expect(values).toContain("mmol/L")
    expect(values).toContain("µmol/L")
    expect(values).toContain("mg/dL")
    expect(values).toContain("g/dL")
    expect(values).toContain("mEq/L")
    expect(values).toContain("× 10⁹/L")
    expect(values).toContain("× 10³/µL")
    expect(values).toContain("µg/kg/min")
    expect(values).toContain("mmHg")
    expect(values).toContain("kPa")
  })

  test("unit values are unique and searchable by aliases", () => {
    const labels = NUMBER_UNIT_OPTIONS.map((unit) => unit.value)
    expect(new Set(labels).size).toBe(labels.length)
    const wbc = NUMBER_UNIT_OPTIONS.find((unit) => unit.value === "× 10⁹/L")
    expect(wbc?.keywords).toContain("x 10^9/L")
    expect(wbc?.group).toBe("Blood counts")
  })
})
