import { describe, expect, test } from "bun:test"

import {
  flattenChoiceOptions,
  parseFlatOptions,
  parseOptionTree,
  serializeOptionTree,
} from "../src/model/options"

describe("form options", () => {
  test("parseFlatOptions slugifies labels", () => {
    expect(parseFlatOptions("Yes\nNo")).toEqual([
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ])
  })

  test("parseOptionTree nests indented lines and round-trips labels", () => {
    const tree = parseOptionTree(
      "Cardiology\n  Ward A\n  Ward B\nICU\n  Ward C"
    )
    expect(tree).toEqual([
      {
        value: "cardiology",
        label: "Cardiology",
        children: [
          { value: "cardiology/ward_a", label: "Ward A" },
          { value: "cardiology/ward_b", label: "Ward B" },
        ],
      },
      {
        value: "icu",
        label: "ICU",
        children: [{ value: "icu/ward_c", label: "Ward C" }],
      },
    ])
    expect(serializeOptionTree(tree)).toBe(
      "Cardiology\n  Ward A\n  Ward B\nICU\n  Ward C"
    )
  })

  test("flattenChoiceOptions keeps leaf values and path labels", () => {
    const tree = parseOptionTree("Facility\n  Ward A")
    expect(flattenChoiceOptions(tree)).toEqual([
      { value: "facility/ward_a", label: "Facility / Ward A" },
    ])
  })
})
