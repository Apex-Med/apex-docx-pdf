import { describe, expect, test } from "bun:test"

import { createEmptyForm, addNode } from "../src/index"
import {
  boardFromPage,
  CANVAS_COLUMN,
  dropLocation,
  dropLocationFromOver,
  kindFromPaletteId,
  moveBoardItem,
  PALETTE_COLUMN,
  paletteDragId,
  parentDropId,
  pickDropCollision,
} from "../src/ui/form-builder-board"

const paletteIds = [paletteDragId("short_text"), paletteDragId("number")]

describe("form builder board", () => {
  test("kindFromPaletteId reads toolbox ids", () => {
    expect(kindFromPaletteId(paletteDragId("cascader"))).toBe("cascader")
    expect(kindFromPaletteId("node_1")).toBeNull()
  })

  test("dragging a palette item onto the canvas inserts a live placeholder", () => {
    const form = createEmptyForm()
    const board = boardFromPage(form.pages[0], paletteIds)
    const next = moveBoardItem(
      board,
      paletteDragId("short_text"),
      CANVAS_COLUMN
    )
    expect(next.palette).toEqual([paletteDragId("number")])
    expect(next.canvas).toEqual([paletteDragId("short_text")])
    expect(dropLocation(next, paletteDragId("short_text"))).toEqual({
      index: 0,
      parentId: null,
    })
  })

  test("placeholder slots in before the hovered card", () => {
    let form = createEmptyForm()
    const pageId = form.pages[0]!.id
    form = addNode(form, pageId, "number", { label: "Age" })
    const ageId = form.pages[0]!.nodes[0]!.id
    const board = boardFromPage(form.pages[0], paletteIds)
    const next = moveBoardItem(board, paletteDragId("short_text"), ageId)
    expect(next.canvas).toEqual([paletteDragId("short_text"), ageId])
    expect(dropLocation(next, paletteDragId("short_text"))?.index).toBe(0)
  })

  test("cards reorder within the canvas column", () => {
    let form = createEmptyForm()
    const pageId = form.pages[0]!.id
    form = addNode(form, pageId, "short_text", { label: "Name" })
    form = addNode(form, pageId, "number", { label: "Age" })
    const [name, age] = form.pages[0]!.nodes
    const board = boardFromPage(form.pages[0], paletteIds)
    const next = moveBoardItem(board, name!.id, age!.id)
    expect(next.canvas).toEqual([age!.id, name!.id])
  })

  test("existing questions can drop into a repeater column", () => {
    let form = createEmptyForm()
    const pageId = form.pages[0]!.id
    form = addNode(form, pageId, "repeater", { label: "Meds" })
    form = addNode(form, pageId, "short_text", { label: "Drug" })
    const repeaterId = form.pages[0]!.nodes[0]!.id
    const drugId = form.pages[0]!.nodes[1]!.id
    const next = moveBoardItem(
      boardFromPage(form.pages[0], paletteIds),
      drugId,
      parentDropId(repeaterId)
    )
    expect(next.canvas).toEqual([repeaterId])
    expect(next.nested[repeaterId]).toEqual([drugId])
    expect(dropLocation(next, drugId)).toEqual({
      index: 0,
      parentId: repeaterId,
    })
  })

  test("palette items can drop into a repeater column", () => {
    let form = createEmptyForm()
    const pageId = form.pages[0]!.id
    form = addNode(form, pageId, "repeater", { label: "Meds" })
    const repeaterId = form.pages[0]!.nodes[0]!.id
    const board = boardFromPage(form.pages[0], paletteIds)
    const next = moveBoardItem(
      board,
      paletteDragId("short_text"),
      parentDropId(repeaterId)
    )
    expect(next.nested[repeaterId]).toEqual([paletteDragId("short_text")])
    expect(dropLocation(next, paletteDragId("short_text"))).toEqual({
      index: 0,
      parentId: repeaterId,
    })
  })

  test("hovering the same column is a no-op when the item is already last", () => {
    const form = createEmptyForm()
    const board = boardFromPage(form.pages[0], paletteIds)
    const placed = moveBoardItem(
      board,
      paletteDragId("short_text"),
      CANVAS_COLUMN
    )
    const again = moveBoardItem(
      placed,
      paletteDragId("short_text"),
      CANVAS_COLUMN
    )
    expect(again).toBe(placed)
  })

  test("existing questions cannot be dropped onto the palette", () => {
    let form = createEmptyForm()
    const pageId = form.pages[0]!.id
    form = addNode(form, pageId, "short_text", { label: "Name" })
    const nameId = form.pages[0]!.nodes[0]!.id
    const board = boardFromPage(form.pages[0], paletteIds)
    const next = moveBoardItem(board, nameId, PALETTE_COLUMN)
    expect(next).toBe(board)
  })

  test("nested droppables win over the wrapping repeater card", () => {
    const repeaterId = "rep_1"
    expect(
      pickDropCollision(
        [parentDropId(repeaterId), repeaterId, CANVAS_COLUMN],
        "q_1"
      )
    ).toBe(parentDropId(repeaterId))
  })

  test("nested children win over the repeater droppable so they can reorder", () => {
    const repeaterId = "rep_1"
    const first = "q_1"
    const second = "q_2"
    const board = {
      palette: paletteIds,
      canvas: [repeaterId],
      nested: { [repeaterId]: [first, second] },
    }
    expect(
      pickDropCollision(
        [parentDropId(repeaterId), first, second, repeaterId, CANVAS_COLUMN],
        second,
        board
      )
    ).toBe(first)
  })

  test("questions reorder inside a repeater", () => {
    let form = createEmptyForm()
    const pageId = form.pages[0]!.id
    form = addNode(form, pageId, "repeater", { label: "Meds" })
    const repeaterId = form.pages[0]!.nodes[0]!.id
    form = addNode(form, pageId, "short_text", {
      label: "Drug",
      parentId: repeaterId,
    })
    form = addNode(form, pageId, "number", {
      label: "Dose",
      parentId: repeaterId,
    })
    const repeater = form.pages[0]!.nodes[0]!
    const children =
      repeater.kind === "repeater" ? (repeater.children ?? []) : []
    const [drug, dose] = children
    const board = boardFromPage(form.pages[0], paletteIds)
    const next = moveBoardItem(board, dose!.id, drug!.id)
    expect(next.nested[repeaterId]).toEqual([dose!.id, drug!.id])
  })

  test("a repeater does not collide with its own nested droppable", () => {
    const repeaterId = "rep_1"
    expect(
      pickDropCollision([parentDropId(repeaterId), CANVAS_COLUMN], repeaterId)
    ).toBe(CANVAS_COLUMN)
  })

  test("hovering the wrapping repeater card does not bounce a nested item out", () => {
    let form = createEmptyForm()
    const pageId = form.pages[0]!.id
    form = addNode(form, pageId, "repeater", { label: "Meds" })
    const repeaterId = form.pages[0]!.nodes[0]!.id
    form = addNode(form, pageId, "short_text", { label: "Drug" })
    const drugId = form.pages[0]!.nodes[1]!.id
    const nested = moveBoardItem(
      boardFromPage(form.pages[0], paletteIds),
      drugId,
      parentDropId(repeaterId)
    )
    expect(nested.nested[repeaterId]).toEqual([drugId])
    const bounced = moveBoardItem(nested, drugId, repeaterId)
    expect(bounced).toBe(nested)
  })

  test("dropLocationFromOver finds an insert slot without moving the palette item", () => {
    let form = createEmptyForm()
    const pageId = form.pages[0]!.id
    form = addNode(form, pageId, "number", { label: "Age" })
    const ageId = form.pages[0]!.nodes[0]!.id
    const board = boardFromPage(form.pages[0], paletteIds)
    expect(dropLocationFromOver(board, ageId)).toEqual({
      index: 0,
      parentId: null,
    })
    expect(dropLocationFromOver(board, CANVAS_COLUMN)).toEqual({
      index: 1,
      parentId: null,
    })
    expect(board.palette).toEqual(paletteIds)
    expect(board.canvas).toEqual([ageId])
  })

  test("dropLocationFromOver targets a nested repeater column", () => {
    let form = createEmptyForm()
    const pageId = form.pages[0]!.id
    form = addNode(form, pageId, "repeater", { label: "Meds" })
    const repeaterId = form.pages[0]!.nodes[0]!.id
    const board = boardFromPage(form.pages[0], paletteIds)
    expect(dropLocationFromOver(board, parentDropId(repeaterId))).toEqual({
      index: 0,
      parentId: repeaterId,
    })
  })
})
