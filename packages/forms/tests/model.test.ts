import { describe, expect, test } from "bun:test"

import {
  addNode,
  addPage,
  createEmptyForm,
  DATE_DEFAULT_TODAY,
  defaultNodeForKind,
  duplicateNode,
  FORM_LAYOUT_KINDS,
  FORM_LAYOUT_KIND_DESCRIPTIONS,
  FORM_QUESTION_KINDS,
  FORM_QUESTION_KIND_DESCRIPTIONS,
  moveNode,
  movePage,
  nodeWithKind,
  removeNode,
  removePage,
  slugifyKey,
  uniqueKey,
  updateNode,
  updatePage,
} from "../src/index"
import { collectKeys, findNode } from "../src/model/walk"

describe("form keys", () => {
  test("slugifyKey produces a valid path segment", () => {
    expect(slugifyKey("Author name")).toBe("author_name")
    expect(slugifyKey("  Invoice # 42 ")).toBe("invoice_42")
    expect(slugifyKey("")).toBe("field")
    expect(slugifyKey("123 go")).toBe("field_123_go")
    expect(slugifyKey("constructor")).toBe("constructor_field")
  })

  test("uniqueKey suffixes collisions", () => {
    expect(uniqueKey("author_name", ["author_name"])).toBe("author_name_2")
    expect(uniqueKey("author_name", ["author_name", "author_name_2"])).toBe(
      "author_name_3"
    )
  })
})

describe("form node ops", () => {
  test("createEmptyForm starts with one empty page", () => {
    const form = createEmptyForm("Clinic form")
    expect(form.name).toBe("Clinic form")
    expect(form.pages).toHaveLength(1)
    expect(form.pages[0]?.nodes).toEqual([])
  })

  test("addNode assigns unique keys across pages and nested repeaters", () => {
    let form = createEmptyForm()
    const pageId = form.pages[0]!.id
    form = addNode(form, pageId, "short_text", { label: "Name" })
    form = addNode(form, pageId, "short_text", { label: "Name" })
    form = addNode(form, pageId, "repeater", { label: "Medications" })
    const repeater = form.pages[0]!.nodes.find((node) => node.kind === "repeater")
    expect(repeater).toBeDefined()
    form = addNode(form, pageId, "short_text", {
      label: "Name",
      parentId: repeater!.id,
    })
    const keys = collectKeys(form)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys.filter((key) => key.startsWith("name")).length).toBe(3)
  })

  test("autocomplete and cascader start with choice options", () => {
    const taken: string[] = []
    const autocomplete = defaultNodeForKind("autocomplete", "Drug", taken)
    const cascader = defaultNodeForKind("cascader", "Location", taken)
    expect(autocomplete.kind).toBe("autocomplete")
    expect("options" in autocomplete && autocomplete.options?.length).toBe(1)
    expect(cascader.kind).toBe("cascader")
    if (cascader.kind === "cascader") {
      expect(cascader.options?.[0]?.children?.length).toBe(1)
    }
  })

  test("duplicateNode clones nested repeater children with new ids", () => {
    let form = createEmptyForm()
    const pageId = form.pages[0]!.id
    form = addNode(form, pageId, "repeater", { label: "Items" })
    const repeater = form.pages[0]!.nodes[0]!
    form = addNode(form, pageId, "number", {
      label: "Dose",
      parentId: repeater.id,
    })
    form = duplicateNode(form, repeater.id)
    expect(form.pages[0]!.nodes).toHaveLength(2)
    const copy = form.pages[0]!.nodes[1]
    expect(copy?.kind).toBe("repeater")
    expect(copy?.id).not.toBe(repeater.id)
    expect(copy?.key).not.toBe(repeater.key)
    if (copy && "children" in copy) {
      expect(copy.children?.[0]?.id).not.toBe(
        "children" in repeater ? repeater.children?.[0]?.id : copy.children?.[0]?.id
      )
    }
  })

  test("moveNode relocates a question into a repeater", () => {
    let form = createEmptyForm()
    const pageId = form.pages[0]!.id
    form = addNode(form, pageId, "short_text", { label: "Drug" })
    form = addNode(form, pageId, "repeater", { label: "Meds" })
    const drug = form.pages[0]!.nodes[0]!
    const repeater = form.pages[0]!.nodes[1]!
    form = moveNode(form, drug.id, { pageId, index: 0, parentId: repeater.id })
    expect(form.pages[0]!.nodes).toHaveLength(1)
    const located = findNode(form, drug.id)
    expect(located?.location.parentId).toBe(repeater.id)
  })

  test("pages can be added, renamed, reordered, and removed", () => {
    let form = createEmptyForm()
    form = addPage(form, "Exam")
    expect(form.pages).toHaveLength(2)
    const second = form.pages[1]!
    form = updatePage(form, second.id, { title: "Examination" })
    expect(form.pages[1]?.title).toBe("Examination")
    form = movePage(form, second.id, 0)
    expect(form.pages[0]?.id).toBe(second.id)
    form = removePage(form, form.pages[0]!.id)
    expect(form.pages).toHaveLength(1)
    form = removePage(form, form.pages[0]!.id)
    expect(form.pages).toHaveLength(1)
  })

  test("updateNode keeps keys unique when renaming", () => {
    let form = createEmptyForm()
    const pageId = form.pages[0]!.id
    form = addNode(form, pageId, "short_text", { label: "A" })
    form = addNode(form, pageId, "short_text", { label: "B" })
    const first = form.pages[0]!.nodes[0]!
    const second = form.pages[0]!.nodes[1]!
    form = updateNode(form, second.id, { key: first.key })
    expect(form.pages[0]!.nodes[1]?.key).toBe(`${first.key}_2`)
  })

  test("defaultNodeForKind seeds reference and attachment extras", () => {
    const reference = defaultNodeForKind("reference", "Patient", [])
    expect(reference.kind).toBe("reference")
    if ("reference" in reference) {
      expect(reference.reference?.source).toBe("patient")
    }
    const attachment = defaultNodeForKind("attachment", "Scan", [])
    expect(attachment.kind).toBe("attachment")
    if ("attachment" in attachment) {
      expect(attachment.attachment?.accept).toEqual([
        "image/png",
        "image/jpeg",
        "image/heic",
        "application/pdf",
        ".docx",
      ])
    }
  })

  test("removeNode deletes nested children", () => {
    let form = createEmptyForm()
    const pageId = form.pages[0]!.id
    form = addNode(form, pageId, "repeater", { label: "Rows" })
    const repeater = form.pages[0]!.nodes[0]!
    form = addNode(form, pageId, "short_text", {
      label: "Cell",
      parentId: repeater.id,
    })
    const childId = findNode(form, repeater.id)
    const nestedId =
      childId && "children" in childId.node
        ? childId.node.children?.[0]?.id
        : undefined
    expect(nestedId).toBeDefined()
    form = removeNode(form, nestedId!)
    const after = findNode(form, nestedId!)
    expect(after).toBeNull()
    expect(findNode(form, repeater.id)).not.toBeNull()
  })

  test("changing kind keeps identity and compatible extras", () => {
    let form = createEmptyForm()
    const pageId = form.pages[0]!.id
    form = addNode(form, pageId, "select", { label: "Status" })
    const id = form.pages[0]!.nodes[0]!.id
    form = updateNode(form, id, {
      required: true,
      description: "Visit status",
      allowOther: true,
      options: [
        { value: "open", label: "Open" },
        { value: "closed", label: "Closed" },
      ],
      condition: {
        match: "all",
        rules: [{ fieldKey: "other", op: "is_set" }],
      },
    })
    form = updateNode(form, id, { kind: "multi_select" })
    const next = form.pages[0]!.nodes[0]!
    expect(next.id).toBe(id)
    expect(next.key).toBe("status")
    expect(next.label).toBe("Status")
    expect(next.kind).toBe("multi_select")
    if (next.kind !== "multi_select") throw new Error("expected multi_select")
    expect(next.required).toBe(true)
    expect(next.description).toBe("Visit status")
    expect(next.allowOther).toBe(true)
    expect(next.options).toEqual([
      { value: "open", label: "Open" },
      { value: "closed", label: "Closed" },
    ])
    expect(next.condition?.rules).toHaveLength(1)
  })

  test("cascader converts to flat choice options and back keeps a tree", () => {
    const cascader = nodeWithKind(
      {
        id: "n1",
        key: "place",
        label: "Place",
        kind: "cascader",
        required: false,
        options: [
          {
            value: "za",
            label: "South Africa",
            children: [{ value: "za/cpt", label: "Cape Town" }],
          },
        ],
      },
      "select"
    )
    expect(cascader.kind).toBe("select")
    if (cascader.kind !== "select") throw new Error("expected select")
    expect(cascader.options).toEqual([
      { value: "za/cpt", label: "South Africa / Cape Town" },
    ])
    const restored = nodeWithKind(cascader, "cascader")
    expect(restored.kind).toBe("cascader")
    if (restored.kind !== "cascader") throw new Error("expected cascader")
    expect(restored.options).toEqual(cascader.options)
  })

  test("leaving a repeater hoists nested questions", () => {
    let form = createEmptyForm()
    const pageId = form.pages[0]!.id
    form = addNode(form, pageId, "repeater", { label: "Meds" })
    const repeaterId = form.pages[0]!.nodes[0]!.id
    form = addNode(form, pageId, "short_text", {
      label: "Name",
      parentId: repeaterId,
    })
    const childId = findNode(form, repeaterId)
    const nestedId =
      childId && "children" in childId.node
        ? childId.node.children?.[0]?.id
        : undefined
    expect(nestedId).toBeDefined()
    form = updateNode(form, repeaterId, { kind: "short_text" })
    const nodes = form.pages[0]!.nodes
    expect(nodes.map((node) => node.kind)).toEqual(["short_text", "short_text"])
    expect(nodes[0]?.id).toBe(repeaterId)
    expect(nodes[0]?.label).toBe("Meds")
    expect(nodes[1]?.id).toBe(nestedId)
    expect(findNode(form, nestedId!)?.location.parentId).toBeNull()
  })

  test("number validation is kept only for number questions", () => {
    const numbered = nodeWithKind(
      {
        id: "n2",
        key: "dose",
        label: "Dose",
        kind: "short_text",
        required: true,
        validation: { min: 1, max: 10 },
      },
      "number"
    )
    expect(numbered.kind).toBe("number")
    if (numbered.kind !== "number") throw new Error("expected number")
    expect(numbered.required).toBe(true)
    expect(numbered.validation).toEqual({ min: 1, max: 10 })
    const withUnit = nodeWithKind(
      { ...numbered, unit: "mmol/L" },
      "number"
    )
    expect(withUnit.kind).toBe("number")
    if (withUnit.kind !== "number") throw new Error("expected number")
    expect(withUnit.unit).toBe("mmol/L")
    const text = nodeWithKind(withUnit, "short_text")
    expect(text.kind).toBe("short_text")
    if (text.kind !== "short_text") throw new Error("expected short_text")
    expect(text.validation).toBeUndefined()
    expect(text.options).toBeUndefined()
  })

  test("choice defaults convert between select and multi-select", () => {
    const select = nodeWithKind(
      {
        id: "n3",
        key: "ward",
        label: "Ward",
        kind: "select",
        required: false,
        options: [
          { value: "icu", label: "ICU" },
          { value: "ward_a", label: "Ward A" },
        ],
        defaultValue: "ward_a",
      },
      "multi_select"
    )
    expect(select.kind).toBe("multi_select")
    if (select.kind !== "multi_select") throw new Error("expected multi_select")
    expect(select.defaultValue).toEqual(["ward_a"])
    const restored = nodeWithKind(select, "select")
    expect(restored.kind).toBe("select")
    if (restored.kind !== "select") throw new Error("expected select")
    expect(restored.defaultValue).toBe("ward_a")
  })

  test("today date defaults are dropped when leaving the date kind", () => {
    const text = nodeWithKind(
      {
        id: "n4",
        key: "admitted",
        label: "Admitted",
        kind: "date",
        required: false,
        defaultValue: DATE_DEFAULT_TODAY,
      },
      "short_text"
    )
    expect(text.kind).toBe("short_text")
    if (text.kind !== "short_text") throw new Error("expected short_text")
    expect(text.defaultValue).toBeUndefined()
  })
})

describe("kind copy", () => {
  test("every question and layout kind has a usage description", () => {
    for (const kind of FORM_QUESTION_KINDS) {
      expect(FORM_QUESTION_KIND_DESCRIPTIONS[kind].length).toBeGreaterThan(20)
    }
    for (const kind of FORM_LAYOUT_KINDS) {
      expect(FORM_LAYOUT_KIND_DESCRIPTIONS[kind].length).toBeGreaterThan(20)
    }
  })
})
