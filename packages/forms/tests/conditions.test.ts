import { describe, expect, test } from "bun:test"

import {
  addNode,
  createEmptyForm,
  isConditionSatisfied,
  isNodeVisible,
  isRuleSatisfied,
  updateNode,
  visibleInputQuestions,
} from "../src/index"

describe("form conditions", () => {
  test("eq / neq / in / not_in compare string answers", () => {
    const answers = { kind: "referral" }
    expect(
      isRuleSatisfied({ fieldKey: "kind", op: "eq", value: "referral" }, answers)
    ).toBe(true)
    expect(
      isRuleSatisfied({ fieldKey: "kind", op: "neq", value: "admission" }, answers)
    ).toBe(true)
    expect(
      isRuleSatisfied(
        { fieldKey: "kind", op: "in", value: ["referral", "discharge"] },
        answers
      )
    ).toBe(true)
    expect(
      isRuleSatisfied(
        { fieldKey: "kind", op: "not_in", value: ["admission"] },
        answers
      )
    ).toBe(true)
  })

  test("is_set / is_empty / gt / lt cover empty and numeric answers", () => {
    expect(isRuleSatisfied({ fieldKey: "n", op: "is_empty" }, {})).toBe(true)
    expect(
      isRuleSatisfied({ fieldKey: "n", op: "is_empty" }, { n: "__other__" })
    ).toBe(true)
    expect(isRuleSatisfied({ fieldKey: "n", op: "is_set" }, { n: 3 })).toBe(true)
    expect(
      isRuleSatisfied({ fieldKey: "n", op: "gt", value: 2 }, { n: 3 })
    ).toBe(true)
    expect(
      isRuleSatisfied({ fieldKey: "n", op: "lt", value: 10 }, { n: 3 })
    ).toBe(true)
  })

  test("all/any groups short-circuit correctly", () => {
    const answers = { a: "yes", b: "no" }
    expect(
      isConditionSatisfied(
        {
          match: "all",
          rules: [
            { fieldKey: "a", op: "eq", value: "yes" },
            { fieldKey: "b", op: "eq", value: "yes" },
          ],
        },
        answers
      )
    ).toBe(false)
    expect(
      isConditionSatisfied(
        {
          match: "any",
          rules: [
            { fieldKey: "a", op: "eq", value: "yes" },
            { fieldKey: "b", op: "eq", value: "yes" },
          ],
        },
        answers
      )
    ).toBe(true)
  })

  test("hidden questions are omitted from visibleInputQuestions", () => {
    let form = createEmptyForm()
    const pageId = form.pages[0]!.id
    form = addNode(form, pageId, "select", { label: "Show extra" })
    form = addNode(form, pageId, "short_text", { label: "Extra" })
    const extraId = form.pages[0]!.nodes[1]!.id
    form = updateNode(form, extraId, {
      condition: {
        match: "all",
        rules: [{ fieldKey: "show_extra", op: "eq", value: "yes" }],
      },
    })
    const extra = form.pages[0]!.nodes[1]!
    expect(isNodeVisible(extra, {})).toBe(false)
    expect(visibleInputQuestions(form, {}).map((q) => q.key)).toEqual([
      "show_extra",
    ])
    expect(
      visibleInputQuestions(form, { show_extra: "yes" }).map((q) => q.key)
    ).toEqual(["show_extra", "extra"])
  })
})
