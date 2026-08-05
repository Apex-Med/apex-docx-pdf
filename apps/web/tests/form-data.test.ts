import { describe, expect, test } from "bun:test"

import {
  addArrayItem,
  concretePath,
  getPath,
  removeArrayItem,
  setPath,
} from "../src/lib/form-data"

describe("form data paths", () => {
  test("reads and immutably updates existing dotted paths", () => {
    const data = { invoice: { reference: "A-1" }, untouched: { value: true } }
    const next = setPath(data, "invoice.reference", "A-2")

    expect(getPath(next, "invoice.reference")).toBe("A-2")
    expect(data.invoice.reference).toBe("A-1")
    expect(next).not.toBe(data)
    expect(next.untouched).toBe(data.untouched)
  })

  test("resolves canonical nested arrays to concrete indexed paths", () => {
    expect(concretePath("invoice.items[].modifiers[].name", [1, 2])).toBe(
      "invoice.items[1].modifiers[2].name"
    )
    expect(concretePath("invoice.items[].name", [])).toBeUndefined()
    expect(concretePath("invoice.items[].name", [0, 1])).toBeUndefined()
  })

  test("updates nested arrays without mutating siblings", () => {
    const data = {
      invoice: {
        items: [
          { description: "One", modifiers: [{ name: "old" }] },
          { description: "Two", modifiers: [] },
        ],
      },
    }
    const next = setPath(data, "invoice.items[0].modifiers[0].name", "new")

    expect(getPath(next, "invoice.items[0].modifiers[0].name")).toBe("new")
    expect(data.invoice.items[0]?.modifiers[0]?.name).toBe("old")
    expect(next.invoice).not.toBe(data.invoice)
    expect((next.invoice as typeof data.invoice).items[1]).toBe(
      data.invoice.items[1]
    )
  })

  test("adds and removes top-level and nested array rows", () => {
    const data = { invoice: { items: [{ modifiers: [] }] } }
    const added = addArrayItem(data, "invoice.items[0].modifiers", {
      name: "Urgent",
    })
    const removed = removeArrayItem(added, "invoice.items", 0)

    expect(getPath(added, "invoice.items[0].modifiers[0].name")).toBe("Urgent")
    expect(getPath(removed, "invoice.items")).toEqual([])
    expect(data.invoice.items[0]?.modifiers).toEqual([])
  })

  test("supports empty or malformed array values without throwing", () => {
    const data = { invoice: { items: "not-an-array" } }
    const next = addArrayItem(data, "invoice.items", { description: "New" })

    expect(getPath(next, "invoice.items")).toEqual([{ description: "New" }])
    expect(removeArrayItem(data, "invoice.items", 0)).toBe(data)
  })

  test("rejects invalid and prototype-sensitive paths", () => {
    const data = { safe: true }
    expect(getPath(data, "items[]")).toBeUndefined()
    expect(setPath(data, "__proto__.polluted", true)).toBe(data)
    expect(addArrayItem(data, "items[-1]", {})).toBe(data)
    expect(removeArrayItem(data, "items", -1)).toBe(data)
    expect(concretePath("items[].prototype.name", [0])).toBeUndefined()
  })
})
