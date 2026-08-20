import { describe, expect, test } from "bun:test"

import {
  addNode,
  createEmptyForm,
  fromApexPages,
  toApexPages,
  toApexPlaceholderPaths,
  updateNode,
  type ApexFormPage,
} from "../src/index"

const admissionPages: ApexFormPage[] = [
  {
    key: "details",
    title: "Admission details",
    fields: [
      {
        key: "ward",
        label: "Ward",
        type: "reference",
        required: true,
        referenceType: "ward",
      },
      {
        key: "date_of_admission",
        label: "Date of admission",
        type: "date",
        required: true,
        includeTime: true,
      },
      {
        key: "reason",
        label: "Reason",
        type: "textarea",
        required: false,
      },
      {
        key: "has_allergies",
        label: "Allergies?",
        type: "yes_no",
        required: true,
      },
      {
        key: "allergy_notes",
        label: "Allergy notes",
        type: "text",
        required: false,
        visibility: { fieldKey: "has_allergies", op: "eq", value: "true" },
      },
      {
        key: "medications",
        label: "Medications",
        type: "repeater",
        required: false,
        columns: 2,
        fields: [
          {
            key: "drug",
            label: "Drug",
            type: "text",
            required: true,
          },
          {
            key: "dose",
            label: "Dose",
            type: "text",
            required: false,
          },
        ],
      },
    ],
  },
]

describe("Apex adapter", () => {
  test("round-trips Apex seed-style pages", () => {
    const imported = fromApexPages(admissionPages, "Admission")
    expect(imported.diagnostics).toEqual([])
    const exported = toApexPages(imported.value)
    expect(exported.value).toHaveLength(1)
    const fields = exported.value[0]!.fields
    expect(fields.map((field) => field.key)).toEqual([
      "ward",
      "date_of_admission",
      "reason",
      "has_allergies",
      "allergy_notes",
      "medications",
    ])
    const allergies = fields.find((field) => field.key === "has_allergies")
    expect(allergies?.type).toBe("yes_no")
    const notes = fields.find((field) => field.key === "allergy_notes")
    expect(notes?.visibility).toEqual({
      fieldKey: "has_allergies",
      op: "eq",
      value: "true",
    })
    const meds = fields.find((field) => field.key === "medications")
    expect(meds?.fields?.map((child) => child.key)).toEqual(["drug", "dose"])
  })

  test("toApexPlaceholderPaths matches Apex catalog suffixes", () => {
    const imported = fromApexPages(admissionPages).value
    const paths = toApexPlaceholderPaths(imported)
    expect(paths).toContain("ward__text")
    expect(paths).toContain("ward.name")
    expect(paths).toContain("medications")
    expect(paths).toContain("medications[].drug")
    expect(paths).toContain("date_of_admission")
  })

  test("unrepresentable constructs emit diagnostics", () => {
    let form = createEmptyForm()
    const pageId = form.pages[0]!.id
    form = addNode(form, pageId, "text", { label: "Intro" })
    form = addNode(form, pageId, "repeater", { label: "Outer" })
    const outerId = form.pages[0]!.nodes[1]!.id
    form = addNode(form, pageId, "repeater", {
      label: "Inner",
      parentId: outerId,
    })
    form = addNode(form, pageId, "short_text", { label: "Notes" })
    form = updateNode(form, form.pages[0]!.nodes[2]!.id, {
      condition: {
        match: "any",
        rules: [
          { fieldKey: "a", op: "is_set" },
          { fieldKey: "b", op: "gt", value: 1 },
        ],
      },
    })
    const result = toApexPages(form)
    expect(result.diagnostics.some((item) => item.code === "UNREPRESENTABLE_LAYOUT")).toBe(
      true
    )
    expect(result.diagnostics.some((item) => item.code === "NESTED_REPEATER")).toBe(
      true
    )
    expect(
      result.diagnostics.some((item) => item.code === "UNREPRESENTABLE_CONDITION")
    ).toBe(true)
  })

  test("cascader options flatten for Apex with a warning", () => {
    let form = createEmptyForm()
    const pageId = form.pages[0]!.id
    form = addNode(form, pageId, "cascader", { label: "Location" })
    const result = toApexPages(form)
    expect(result.diagnostics.some((item) => item.code === "NESTED_OPTIONS_FLATTENED")).toBe(
      true
    )
    expect(result.value[0]?.fields[0]?.type).toBe("select")
    expect(result.value[0]?.fields[0]?.options).toEqual(["Group 1 / Option 1"])
  })

  test("number units round-trip through Apex", () => {
    let form = createEmptyForm()
    const pageId = form.pages[0]!.id
    form = addNode(form, pageId, "number", { label: "Sodium" })
    const id = form.pages[0]!.nodes[0]!.id
    form = updateNode(form, id, { unit: "mmol/L" })
    const pages = toApexPages(form).value
    expect(pages[0]?.fields[0]?.unit).toBe("mmol/L")
    const restored = fromApexPages(pages).value
    const node = restored.pages[0]?.nodes[0]
    expect(node?.kind).toBe("number")
    if (node?.kind !== "number") throw new Error("expected number")
    expect(node.unit).toBe("mmol/L")
  })

  test("date range and quick selection round-trip through Apex", () => {
    let form = createEmptyForm()
    const pageId = form.pages[0]!.id
    form = addNode(form, pageId, "date", { label: "Stay" })
    const id = form.pages[0]!.nodes[0]!.id
    form = updateNode(form, id, {
      dateRange: true,
      quickDateSelection: true,
      includeTime: true,
    })
    const pages = toApexPages(form).value
    expect(pages[0]?.fields[0]?.dateRange).toBe(true)
    expect(pages[0]?.fields[0]?.quickDateSelection).toBe(true)
    const restored = fromApexPages(pages).value
    const node = restored.pages[0]?.nodes[0]
    expect(node?.kind).toBe("date")
    if (node?.kind !== "date") throw new Error("expected date")
    expect(node.dateRange).toBe(true)
    expect(node.quickDateSelection).toBe(true)
    expect(node.includeTime).toBe(true)
  })
})
