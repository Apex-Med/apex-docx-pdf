import { describe, expect, test } from "bun:test"

import {
  addNode,
  answersToTagValues,
  answersToTemplateData,
  bindingDiagnostics,
  createEmptyForm,
  encodeImagePlaceholder,
  encodeMarkerPlaceholder,
  encodeValuePlaceholder,
  markerBalanceDiagnostics,
  markerPlaceholdersForTag,
  questionFromTag,
  tagsFromForm,
  updateNode,
} from "../src/index"

describe("form tag binding", () => {
  test("tagsFromForm emits value, each, image, if, and reference sub-paths", () => {
    let form = createEmptyForm()
    const pageId = form.pages[0]!.id
    form = addNode(form, pageId, "short_text", { label: "Name" })
    form = addNode(form, pageId, "number", { label: "Age" })
    form = addNode(form, pageId, "date", { label: "Born" })
    form = addNode(form, pageId, "repeater", { label: "Meds" })
    form = addNode(form, pageId, "attachment", { label: "Scan" })
    form = addNode(form, pageId, "reference", { label: "Patient" })
    const extra = form.pages[0]!.nodes[0]!
    form = updateNode(form, extra.id, {
      condition: {
        match: "all",
        rules: [{ fieldKey: "age", op: "gt", value: 0 }],
      },
    })
    const tags = tagsFromForm(form)
    expect(tags.some((tag) => tag.slug === "name" && tag.role === "value")).toBe(
      true
    )
    expect(tags.some((tag) => tag.slug === "age" && tag.kind === "number")).toBe(
      true
    )
    expect(tags.some((tag) => tag.slug === "born" && tag.kind === "date")).toBe(
      true
    )
    expect(tags.some((tag) => tag.slug === "meds" && tag.role === "each")).toBe(
      true
    )
    expect(tags.some((tag) => tag.slug === "scan" && tag.role === "image")).toBe(
      true
    )
    expect(tags.some((tag) => tag.slug === "patient.full_name")).toBe(true)
    expect(tags.some((tag) => tag.role === "if" && tag.slug === "name")).toBe(
      true
    )
  })

  test("questionFromTag infers kinds from tag seeds", () => {
    expect(questionFromTag({ slug: "count", kind: "number" }).kind).toBe(
      "number"
    )
    expect(questionFromTag({ slug: "when", kind: "date" }).kind).toBe("date")
    expect(questionFromTag({ slug: "items", role: "each" }).kind).toBe(
      "repeater"
    )
    expect(questionFromTag({ slug: "photo", role: "image" }).kind).toBe(
      "attachment"
    )
  })

  test("placeholder encoders match the engine syntax", () => {
    expect(
      encodeValuePlaceholder({
        id: "tag:name",
        label: "Name",
        slug: "name",
        kind: "string",
        role: "value",
      })
    ).toBe("{{name:string}}")
    expect(encodeMarkerPlaceholder({ type: "each", path: "meds" })).toBe(
      "{{#each meds}}"
    )
    expect(encodeMarkerPlaceholder({ type: "endIf" })).toBe("{{/if}}")
    expect(encodeImagePlaceholder("scan")).toBe("{{@image scan}}")
    expect(
      markerPlaceholdersForTag({
        id: "tag:meds",
        label: "Meds",
        slug: "meds",
        kind: "string",
        role: "each",
      })
    ).toEqual(["{{#each meds}}", "{{/each}}"])
  })

  test("bindingDiagnostics reports orphans, unused questions, and kind mismatches", () => {
    let form = createEmptyForm()
    const pageId = form.pages[0]!.id
    form = addNode(form, pageId, "short_text", { label: "Name" })
    form = addNode(form, pageId, "repeater", { label: "Meds" })
    const diagnostics = bindingDiagnostics(form, {
      valueSlugs: ["unknown_field"],
      markers: [],
      imagePaths: [],
    })
    expect(diagnostics.some((item) => item.code === "ORPHAN_TAG")).toBe(true)
    expect(diagnostics.some((item) => item.code === "UNUSED_QUESTION")).toBe(
      true
    )
    expect(diagnostics.some((item) => item.code === "UNUSED_REPEATER")).toBe(
      true
    )
  })

  test("markerBalanceDiagnostics catches unclosed and mismatched blocks", () => {
    expect(
      markerBalanceDiagnostics([{ type: "if", path: "ok" }]).some(
        (item) => item.code === "MARKER_UNCLOSED"
      )
    ).toBe(true)
    expect(
      markerBalanceDiagnostics([
        { type: "each", path: "rows" },
        { type: "endIf" },
      ]).some((item) => item.code === "MARKER_UNBALANCED")
    ).toBe(true)
    expect(
      markerBalanceDiagnostics([{ type: "else" }]).some(
        (item) => item.code === "MARKER_ELSE"
      )
    ).toBe(true)
    expect(
      markerBalanceDiagnostics([
        { type: "if", path: "ok" },
        { type: "else" },
        { type: "endIf" },
      ])
    ).toEqual([])
  })

  test("answers map to tag values and template data", () => {
    let form = createEmptyForm()
    const pageId = form.pages[0]!.id
    form = addNode(form, pageId, "short_text", { label: "Name" })
    form = addNode(form, pageId, "boolean", { label: "Alive" })
    form = addNode(form, pageId, "repeater", { label: "Meds" })
    const repeaterId = form.pages[0]!.nodes[2]!.id
    form = addNode(form, pageId, "short_text", {
      label: "Drug",
      parentId: repeaterId,
    })
    const values = answersToTagValues(form, {
      name: "Ada",
      alive: true,
      meds: [{ drug: "Kef" }],
    })
    expect(values["tag:name"]).toEqual({ kind: "string", value: "Ada" })
    expect(values["tag:alive"]).toEqual({ kind: "string", value: "Yes" })
    const data = answersToTemplateData(form, {
      name: "Ada",
      alive: true,
      meds: [{ drug: "Kef" }],
    })
    expect(data).toEqual({
      name: "Ada",
      alive: true,
      meds: [{ drug: "Kef" }],
    })
  })
})
