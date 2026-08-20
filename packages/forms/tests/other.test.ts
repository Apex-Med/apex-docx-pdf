import { describe, expect, test } from "bun:test"

import {
  commitOtherText,
  isOtherSelectedValue,
  joinMultiSelectValues,
  OTHER_OPTION_VALUE,
  otherTextFromSelectValue,
  selectValueForControl,
  splitMultiSelectValues,
} from "../src/index"

const options = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
]

describe("other choice values", () => {
  test("select maps custom text onto the Other control and back", () => {
    expect(selectValueForControl("yes", options, true)).toBe("yes")
    expect(selectValueForControl("purple", options, true)).toBe(
      OTHER_OPTION_VALUE
    )
    expect(selectValueForControl(OTHER_OPTION_VALUE, options, true)).toBe(
      OTHER_OPTION_VALUE
    )
    expect(otherTextFromSelectValue("purple", options)).toBe("purple")
    expect(otherTextFromSelectValue(OTHER_OPTION_VALUE, options)).toBe("")
    expect(otherTextFromSelectValue("yes", options)).toBe("")
    expect(isOtherSelectedValue("purple", options, true)).toBe(true)
    expect(isOtherSelectedValue("yes", options, true)).toBe(false)
    expect(commitOtherText("")).toBe(OTHER_OPTION_VALUE)
    expect(commitOtherText("custom")).toBe("custom")
  })

  test("multi-select keeps catalog values and a single other text", () => {
    expect(
      splitMultiSelectValues(["yes", OTHER_OPTION_VALUE], options)
    ).toEqual({
      known: ["yes"],
      otherSelected: true,
      otherText: "",
    })
    expect(splitMultiSelectValues(["yes", "custom"], options)).toEqual({
      known: ["yes"],
      otherSelected: true,
      otherText: "custom",
    })
    expect(joinMultiSelectValues(["yes"], true, "")).toEqual([
      "yes",
      OTHER_OPTION_VALUE,
    ])
    expect(joinMultiSelectValues(["yes"], true, "custom")).toEqual([
      "yes",
      "custom",
    ])
    expect(joinMultiSelectValues(["yes"], false, "custom")).toEqual(["yes"])
  })
})
