import { describe, expect, test } from "bun:test"
import { createBlankDocument } from "@apexmed/core"
import { TextSelection } from "prosemirror-state"

import {
  applyCommandToSemantic,
  createEditorStateFromDocument,
  insertTable,
  setCellBorderStyle,
  setCellShading,
  toSemanticDocument,
} from "../src/index"

function placeInFirstCell(
  state: ReturnType<typeof createEditorStateFromDocument>
) {
  let cellPos: number | null = null
  state.doc.descendants((node, pos) => {
    if (cellPos !== null) return false
    if (node.type.name === "table_cell" || node.type.name === "table_header") {
      cellPos = pos + 1
      return false
    }
    return true
  })
  if (cellPos === null) throw new Error("no cell")
  return state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, cellPos + 1))
  )
}

describe("individual cell borders", () => {
  test("setCellBorderStyle writes per-side border attrs on the cell", () => {
    let state = createEditorStateFromDocument(createBlankDocument())
    state = applyCommandToSemantic(state, insertTable(2, 2)).state
    state = placeInFirstCell(state)

    const top = applyCommandToSemantic(
      state,
      setCellBorderStyle("top", "double", "#ff0000", 20)
    )
    expect(top.applied).toBe(true)

    let borderTop: unknown
    top.state.doc.descendants((node) => {
      if (node.type.name === "table_cell" && borderTop === undefined) {
        borderTop = node.attrs.borderTop
      }
    })
    expect(borderTop).toEqual({
      style: "double",
      color: "#ff0000",
      width: 20,
    })

    // Round-trip through semantic bridge preserves borders
    const semantic = toSemanticDocument(top.state.doc)
    const table = semantic.sections[0]?.blocks.find((b) => b.type === "table")
    expect(table?.type).toBe("table")
    if (table?.type !== "table") return
    const cell = table.rows[0]?.cells[0]
    expect(cell?.borders.top).toMatchObject({
      style: "double",
      color: "#ff0000",
      width: 20,
    })
  })

  test("setCellBorderStyle all sides and none clear borders", () => {
    let state = createEditorStateFromDocument(createBlankDocument())
    state = applyCommandToSemantic(state, insertTable(1, 1)).state
    state = placeInFirstCell(state)

    state = applyCommandToSemantic(
      state,
      setCellBorderStyle("all", "dashed", "#000000", 15)
    ).state

    let cellAttrs: Record<string, unknown> | null = null
    state.doc.descendants((node) => {
      if (node.type.name === "table_cell" && !cellAttrs) {
        cellAttrs = { ...node.attrs }
      }
    })
    const capturedAttrs = cellAttrs as Record<string, unknown> | null
    expect(capturedAttrs?.borderTop).toMatchObject({ style: "dashed" })
    expect(capturedAttrs?.borderLeft).toMatchObject({ style: "dashed" })

    state = placeInFirstCell(state)
    state = applyCommandToSemantic(
      state,
      setCellBorderStyle("all", "none")
    ).state
    state.doc.descendants((node) => {
      if (node.type.name === "table_cell") {
        expect(node.attrs.borderTop).toBeNull()
        expect(node.attrs.borderRight).toBeNull()
      }
    })
  })

  test("cell toDOM emits per-side border CSS", () => {
    const { editorSchema } =
      require("../src/schema") as typeof import("../src/schema")
    const cell = editorSchema.nodes.table_cell!.create(
      {
        borderTop: { style: "single", color: "#00ff00", width: 20 },
        borderLeft: { style: "none", color: "#000", width: 0 },
        fillColor: "#eeeeee",
      },
      editorSchema.nodes.paragraph!.createAndFill()!
    )
    const dom = cell.type.spec.toDOM?.(cell)
    expect(JSON.stringify(dom)).toContain("border-top:")
    expect(JSON.stringify(dom)).toContain("#00ff00")
    expect(JSON.stringify(dom)).toContain("border-left:none")
    expect(JSON.stringify(dom)).toContain("background-color:#eeeeee")
  })

  test("cell toDOM preserves table span and authored column-width metadata", () => {
    const { editorSchema } =
      require("../src/schema") as typeof import("../src/schema")
    const tableCell = editorSchema.nodes.table_cell
    const paragraph = editorSchema.nodes.paragraph?.createAndFill()
    expect(tableCell).toBeDefined()
    expect(paragraph).toBeDefined()
    if (!tableCell || !paragraph) return
    const cell = tableCell.create(
      {
        colspan: 2,
        rowspan: 3,
        colwidth: [120, 180],
      },
      paragraph
    )
    const dom = cell.type.spec.toDOM?.(cell)
    expect(dom).toEqual(
      expect.arrayContaining([
        "td",
        expect.objectContaining({
          colspan: "2",
          rowspan: "3",
          "data-colwidth": "120,180",
        }),
      ])
    )
  })

  test("default cells are borderless and inherit authored table borders", () => {
    const { editorSchema } =
      require("../src/schema") as typeof import("../src/schema")
    const empty = editorSchema.nodes.table_cell!.create(
      null,
      editorSchema.nodes.paragraph!.createAndFill()!
    )
    expect(JSON.stringify(empty.type.spec.toDOM?.(empty))).toContain(
      "border-top:none"
    )

    let state = createEditorStateFromDocument(createBlankDocument())
    state = applyCommandToSemantic(state, insertTable(2, 2)).state
    const semantic = toSemanticDocument(state.doc)
    const tableBorder = {
      style: "single" as const,
      color: "#123456",
      width: 20 as never,
      space: 0 as never,
    }
    const documentWithBorders = {
      ...semantic,
      sections: semantic.sections.map((section) => ({
        ...section,
        blocks: section.blocks.map((block) =>
          block.type === "table"
            ? {
                ...block,
                borders: {
                  top: tableBorder,
                  right: tableBorder,
                  bottom: tableBorder,
                  left: tableBorder,
                  insideHorizontal: tableBorder,
                  insideVertical: tableBorder,
                },
              }
            : block
        ),
      })),
    }
    const bordered = createEditorStateFromDocument(documentWithBorders)
    bordered.doc.descendants((node) => {
      if (node.type.name === "table_cell") {
        expect(node.attrs.borderTop).toMatchObject({ color: "#123456" })
        expect(node.attrs.borderLeft).toMatchObject({ color: "#123456" })
      }
    })
  })

  test("context menu lists border actions", () => {
    const { tableContextMenuItems } =
      require("../src/plugins/table-context-menu") as typeof import("../src/plugins/table-context-menu")
    const ids = tableContextMenuItems().map((i) => i.id)
    expect(ids).toContain("border-all")
    expect(ids).toContain("border-top")
    expect(ids).toContain("border-left")
    expect(ids).toContain("border-none")
  })

  test("setCellShading works alongside borders", () => {
    let state = createEditorStateFromDocument(createBlankDocument())
    state = applyCommandToSemantic(state, insertTable(1, 1)).state
    state = placeInFirstCell(state)
    const shaded = applyCommandToSemantic(state, setCellShading("#fde68a"))
    expect(shaded.applied).toBe(true)
  })
})
