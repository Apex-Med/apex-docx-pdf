import { describe, expect, test } from "bun:test"

import {
  addNode,
  buildDefaultAnswers,
  DATE_DEFAULT_TODAY,
  createEmptyForm,
  emptyRepeaterRow,
  formatLocalDateInput,
  isQuestion,
  stripHiddenAnswers,
  updateNode,
  validateAnswers,
} from "../src/index"

describe("answer validation", () => {
  test("required empty answers fail", () => {
    let form = createEmptyForm()
    const pageId = form.pages[0]!.id
    form = addNode(form, pageId, "short_text", { label: "Name" })
    form = updateNode(form, form.pages[0]!.nodes[0]!.id, { required: true })
    const result = validateAnswers(form, { name: "" })
    expect(result.ok).toBe(false)
    expect(result.errors.name).toContain("required")
  })

  test("number min/max and select options are checked", () => {
    let form = createEmptyForm()
    const pageId = form.pages[0]!.id
    form = addNode(form, pageId, "number", { label: "Age" })
    form = updateNode(form, form.pages[0]!.nodes[0]!.id, {
      validation: { min: 0, max: 120 },
    })
    form = addNode(form, pageId, "select", { label: "Ward" })
    expect(validateAnswers(form, { age: -1 }).errors.age).toContain("at least")
    expect(validateAnswers(form, { age: 200 }).errors.age).toContain("at most")
    expect(
      validateAnswers(form, { age: 40, ward: "missing" }).errors.ward
    ).toContain("invalid option")
  })

  test("other requires custom text for select and multi-select", () => {
    let form = createEmptyForm()
    const pageId = form.pages[0]!.id
    form = addNode(form, pageId, "select", { label: "Ward" })
    form = updateNode(form, form.pages[0]!.nodes[0]!.id, { allowOther: true })
    form = addNode(form, pageId, "multi_select", { label: "Flags" })
    form = updateNode(form, form.pages[0]!.nodes[1]!.id, { allowOther: true })
    expect(
      validateAnswers(form, { ward: "__other__", flags: [] }).errors.ward
    ).toContain("custom value")
    expect(
      validateAnswers(form, { ward: "Isolation", flags: ["__other__"] }).errors
        .flags
    ).toContain("custom value")
    expect(
      validateAnswers(form, { ward: "Isolation", flags: ["option_1", "Extra"] })
        .ok
    ).toBe(true)
  })

  test("cascader rejects values that are not leaves", () => {
    let form = createEmptyForm()
    const pageId = form.pages[0]!.id
    form = addNode(form, pageId, "cascader", { label: "Location" })
    const result = validateAnswers(form, { location: "group_1" })
    expect(result.errors.location).toContain("invalid option")
    expect(
      validateAnswers(form, { location: "group_1/option_1" }).ok
    ).toBe(true)
  })

  test("repeater children validate with indexed paths", () => {
    let form = createEmptyForm()
    const pageId = form.pages[0]!.id
    form = addNode(form, pageId, "repeater", { label: "Meds" })
    const repeater = form.pages[0]!.nodes[0]!
    form = addNode(form, pageId, "short_text", {
      label: "Drug",
      parentId: repeater.id,
    })
    form = updateNode(form, form.pages[0]!.nodes[0]!.id, {})
    const child = "children" in repeater ? repeater : form.pages[0]!.nodes[0]!
    const childId =
      child.kind === "repeater" && "children" in child
        ? (form.pages[0]!.nodes[0] as { children?: { id: string }[] }).children?.[0]
            ?.id
        : undefined
    expect(childId).toBeDefined()
    form = updateNode(form, childId!, { required: true })
    const result = validateAnswers(form, {
      meds: [{ drug: "" }],
    })
    expect(result.ok).toBe(false)
    expect(result.errors["meds[0].drug"]).toContain("required")
  })

  test("hidden answers are stripped and defaults match kinds", () => {
    let form = createEmptyForm()
    const pageId = form.pages[0]!.id
    form = addNode(form, pageId, "boolean", { label: "Flag" })
    form = addNode(form, pageId, "short_text", { label: "Notes" })
    form = updateNode(form, form.pages[0]!.nodes[1]!.id, {
      condition: {
        match: "all",
        rules: [{ fieldKey: "flag", op: "eq", value: "true" }],
      },
    })
    const defaults = buildDefaultAnswers(form)
    expect(defaults.flag).toBeNull()
    expect(defaults.notes).toBe("")
    const stripped = stripHiddenAnswers(form, { flag: false, notes: "x" })
    expect(stripped.notes).toBeUndefined()
  })

  test("emptyRepeaterRow uses child defaults", () => {
    let form = createEmptyForm()
    const pageId = form.pages[0]!.id
    form = addNode(form, pageId, "repeater", { label: "Rows" })
    const repeaterId = form.pages[0]!.nodes[0]!.id
    form = addNode(form, pageId, "multi_select", {
      label: "Tags",
      parentId: repeaterId,
    })
    const repeater = form.pages[0]!.nodes[0]!
    expect(repeater.kind).toBe("repeater")
    if (repeater.kind === "repeater") {
      const row = emptyRepeaterRow(repeater)
      expect(row.tags).toEqual([])
    }
  })

  test("optional default answers seed empty responses", () => {
    let form = createEmptyForm()
    const pageId = form.pages[0]!.id
    form = addNode(form, pageId, "select", { label: "Ward" })
    const id = form.pages[0]!.nodes[0]!.id
    form = updateNode(form, id, {
      options: [
        { value: "icu", label: "ICU" },
        { value: "ward_a", label: "Ward A" },
      ],
      defaultValue: "ward_a",
    })
    expect(buildDefaultAnswers(form).ward).toBe("ward_a")

    form = updateNode(form, id, { defaultValue: undefined })
    expect(form.pages[0]!.nodes[0]).not.toHaveProperty("defaultValue")
    expect(buildDefaultAnswers(form).ward).toBe("")

    form = updateNode(form, id, { defaultValue: "ward_a" })
    form = updateNode(form, id, {
      options: [{ value: "icu", label: "ICU" }],
    })
    expect(form.pages[0]!.nodes[0]).not.toHaveProperty("defaultValue")
    expect(buildDefaultAnswers(form).ward).toBe("")
  })

  test("boolean false and number zero are kept as defaults", () => {
    let form = createEmptyForm()
    const pageId = form.pages[0]!.id
    form = addNode(form, pageId, "boolean", { label: "Flag" })
    form = addNode(form, pageId, "number", { label: "Count" })
    form = updateNode(form, form.pages[0]!.nodes[0]!.id, { defaultValue: false })
    form = updateNode(form, form.pages[0]!.nodes[1]!.id, { defaultValue: 0 })
    const defaults = buildDefaultAnswers(form)
    expect(defaults.flag).toBe(false)
    expect(defaults.count).toBe(0)
  })

  test("date default today resolves to the current local date", () => {
    let form = createEmptyForm()
    const pageId = form.pages[0]!.id
    form = addNode(form, pageId, "date", { label: "Admitted" })
    const id = form.pages[0]!.nodes[0]!.id
    form = updateNode(form, id, { defaultValue: DATE_DEFAULT_TODAY })
    const dateNode = form.pages[0]!.nodes[0]
    expect(dateNode && isQuestion(dateNode) ? dateNode.defaultValue : undefined).toBe(
      DATE_DEFAULT_TODAY
    )

    const now = new Date(2026, 7, 20, 15, 4)
    expect(buildDefaultAnswers(form, now).admitted).toBe("2026-08-20")
    expect(formatLocalDateInput(now, false)).toBe("2026-08-20")

    form = updateNode(form, id, { includeTime: true })
    expect(buildDefaultAnswers(form, now).admitted).toBe("2026-08-20T15:04")

    form = updateNode(form, id, { dateRange: true })
    expect(buildDefaultAnswers(form, now).admitted).toBe(
      "2026-08-20T15:04/2026-08-20T15:04"
    )
  })

  test("required date range needs both ends", () => {
    let form = createEmptyForm()
    const pageId = form.pages[0]!.id
    form = addNode(form, pageId, "date", { label: "Stay" })
    form = updateNode(form, form.pages[0]!.nodes[0]!.id, {
      required: true,
      dateRange: true,
    })
    expect(validateAnswers(form, { stay: "2026-08-20" }).errors.stay).toContain(
      "start and end"
    )
    expect(
      validateAnswers(form, { stay: "2026-08-20/2026-08-27" }).ok
    ).toBe(true)
  })
})
