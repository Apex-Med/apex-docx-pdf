import { describe, expect, test } from "bun:test"
import { createBlankDocument } from "@apexmed/core"
import { TextSelection } from "prosemirror-state"
import { CellSelection } from "prosemirror-tables"

import {
  applyCommandToSemantic,
  createEditorStateFromDocument,
  insertTable,
  selectedTableCellPositions,
  selectedTableCellGrid,
  setCellHorizontalAlignment,
  setCellBorderStyle,
  setCellShading,
  setSelectedCellBorderStyle,
  setTableBorderStyle,
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

function cellPositions(
  state: ReturnType<typeof createEditorStateFromDocument>
): number[] {
  const positions: number[] = []
  state.doc.descendants((node, pos) => {
    if (node.type.name === "table_cell" || node.type.name === "table_header") {
      positions.push(pos)
    }
  })
  return positions
}

function selectCellRange(
  state: ReturnType<typeof createEditorStateFromDocument>,
  fromIndex: number,
  toIndex: number
) {
  const positions = cellPositions(state)
  const from = positions[fromIndex]
  const to = positions[toIndex]
  if (from === undefined || to === undefined) {
    throw new Error("missing cells")
  }
  return state.apply(
    state.tr.setSelection(CellSelection.create(state.doc, from, to))
  )
}

describe("individual cell borders", () => {
  test("selected cell grid follows caret, row, column, and rectangle selections", () => {
    let state = createEditorStateFromDocument(createBlankDocument())
    state = applyCommandToSemantic(state, insertTable(2, 2)).state

    expect(selectedTableCellGrid(placeInFirstCell(state))).toEqual({
      rows: 1,
      columns: 1,
      cellCount: 1,
    })
    expect(selectedTableCellGrid(selectCellRange(state, 0, 1))).toEqual({
      rows: 1,
      columns: 2,
      cellCount: 2,
    })
    expect(selectedTableCellGrid(selectCellRange(state, 0, 2))).toEqual({
      rows: 2,
      columns: 1,
      cellCount: 2,
    })
    expect(selectedTableCellGrid(selectCellRange(state, 0, 3))).toEqual({
      rows: 2,
      columns: 2,
      cellCount: 4,
    })
  })

  test("selected-cell border targets paint only selection boundaries and middles", () => {
    let state = createEditorStateFromDocument(createBlankDocument())
    state = applyCommandToSemantic(state, insertTable(2, 2)).state
    state = selectCellRange(state, 0, 3)
    const positions = selectedTableCellPositions(state)

    state = applyCommandToSemantic(
      state,
      setSelectedCellBorderStyle("top", "double", "#aa0000", 20, positions)
    ).state
    state = applyCommandToSemantic(
      state,
      setSelectedCellBorderStyle(
        "insideVertical",
        "dashed",
        "#0000aa",
        18,
        positions
      )
    ).state

    const attrs: Array<Record<string, unknown>> = []
    state.doc.descendants((node) => {
      if (node.type.name === "table_cell") attrs.push({ ...node.attrs })
    })
    expect(attrs[0]?.borderTop).toMatchObject({ style: "double" })
    expect(attrs[1]?.borderTop).toMatchObject({ style: "double" })
    expect(attrs[2]?.borderTop).not.toMatchObject({ style: "double" })
    expect(attrs[3]?.borderTop).not.toMatchObject({ style: "double" })
    expect(attrs[0]?.borderRight).toMatchObject({ style: "dashed" })
    expect(attrs[1]?.borderLeft).toMatchObject({ style: "dashed" })
    expect(attrs[2]?.borderRight).toMatchObject({ style: "dashed" })
    expect(attrs[3]?.borderLeft).toMatchObject({ style: "dashed" })
    expect(attrs[0]?.borderLeft).not.toMatchObject({ style: "dashed" })
    expect(attrs[1]?.borderRight).not.toMatchObject({ style: "dashed" })
  })

  test("a caret border edit changes only the current cell", () => {
    let state = createEditorStateFromDocument(createBlankDocument())
    state = applyCommandToSemantic(state, insertTable(1, 2)).state
    state = placeInFirstCell(state)
    const positions = selectedTableCellPositions(state)
    state = applyCommandToSemantic(
      state,
      setSelectedCellBorderStyle("right", "single", "#123456", 16, positions)
    ).state

    const rightBorders: unknown[] = []
    state.doc.descendants((node) => {
      if (node.type.name === "table_cell") {
        rightBorders.push(node.attrs.borderRight)
      }
    })
    expect(rightBorders[0]).toMatchObject({ color: "#123456" })
    expect(rightBorders[1]).not.toMatchObject({ color: "#123456" })
  })

  test("cell horizontal alignment updates every paragraph in captured cells", () => {
    let state = createEditorStateFromDocument(createBlankDocument())
    state = applyCommandToSemantic(state, insertTable(1, 2)).state
    state = selectCellRange(state, 0, 1)
    const positions = selectedTableCellPositions(state)

    const result = applyCommandToSemantic(
      state,
      setCellHorizontalAlignment("right", positions)
    )

    expect(result.applied).toBe(true)
    const alignments: unknown[] = []
    result.state.doc.descendants((node, _pos, parent) => {
      if (
        node.type.name === "paragraph" &&
        (parent?.type.name === "table_cell" ||
          parent?.type.name === "table_header")
      ) {
        alignments.push(node.attrs.alignment)
      }
    })
    expect(alignments).toEqual(["right", "right"])
  })

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
    const cell = editorSchema.nodes.table_cell?.create(
      {
        borderTop: { style: "single", color: "#00ff00", width: 20 },
        borderLeft: { style: "none", color: "#000", width: 0 },
        fillColor: "#eeeeee",
      },
      editorSchema.nodes.paragraph?.createAndFill()!
    )
    expect(cell).toBeDefined()
    if (!cell) return
    const dom = cell.type.spec.toDOM?.(cell)
    expect(JSON.stringify(dom)).toContain("border-top:")
    expect(JSON.stringify(dom)).toContain("#00ff00")
    expect(JSON.stringify(dom)).toContain("border-left:none")
    expect(JSON.stringify(dom)).toContain("background-color:#eeeeee")
    expect(JSON.stringify(dom)).toContain("data-fill-color")
    expect(JSON.stringify(dom)).toContain("#eeeeee")
  })

  test("cell toDOM maps Word center alignment and authored width", () => {
    const { editorSchema } =
      require("../src/schema") as typeof import("../src/schema")
    const cell = editorSchema.nodes.table_cell?.create(
      {
        verticalAlignment: "center",
        width: 2085,
      },
      editorSchema.nodes.paragraph?.createAndFill()!
    )
    expect(cell).toBeDefined()
    if (!cell) return
    const serialized = JSON.stringify(cell.type.spec.toDOM?.(cell))
    expect(serialized).toContain("vertical-align:middle")
    expect(serialized).not.toContain("vertical-align:center")
    expect(serialized).toContain("width:104.25pt")
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
    const empty = editorSchema.nodes.table_cell?.create(
      null,
      editorSchema.nodes.paragraph?.createAndFill()!
    )
    expect(empty).toBeDefined()
    if (!empty) return
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
                rows: block.rows.map((row) => ({
                  ...row,
                  cells: row.cells.map((cell) => ({
                    ...cell,
                    borders: {
                      top: null,
                      right: null,
                      bottom: null,
                      left: null,
                    },
                  })),
                })),
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

  test("insertTable paints a default grid on cells and table borders", () => {
    const state = createEditorStateFromDocument(createBlankDocument())
    const inserted = applyCommandToSemantic(state, insertTable(2, 2))
    expect(inserted.applied).toBe(true)

    let cellCount = 0
    inserted.state.doc.descendants((node) => {
      if (node.type.name !== "table_cell") return
      cellCount += 1
      expect(node.attrs.borderTop).toMatchObject({
        style: "single",
        color: "#000000",
        width: 15,
      })
      expect(node.attrs.borderRight).toMatchObject({ style: "single" })
      const serialized = JSON.stringify(node.type.spec.toDOM?.(node))
      expect(serialized).toContain("border-top:")
      expect(serialized).toContain("solid")
      expect(serialized).not.toContain("border-top:none")
    })
    expect(cellCount).toBe(4)

    const semantic = toSemanticDocument(inserted.state.doc)
    const table = semantic.sections[0]?.blocks.find(
      (block) => block.type === "table"
    )
    expect(table?.type).toBe("table")
    if (table?.type !== "table") return
    expect(table.borders.top).toMatchObject({
      style: "single",
      color: "#000000",
    })
    expect(table.borders.insideVertical).toMatchObject({ style: "single" })
  })

  test("setTableBorderStyle applies to every cell and table-level edges", () => {
    let state = createEditorStateFromDocument(createBlankDocument())
    state = applyCommandToSemantic(state, insertTable(2, 2)).state
    state = placeInFirstCell(state)

    const dashed = applyCommandToSemantic(
      state,
      setTableBorderStyle("all", "dashed", "#336699", 20)
    )
    expect(dashed.applied).toBe(true)

    let cellCount = 0
    dashed.state.doc.descendants((node) => {
      if (node.type.name === "table") {
        expect(node.attrs.borders).toMatchObject({
          top: { style: "dashed", color: "#336699" },
          insideHorizontal: { style: "dashed" },
          insideVertical: { style: "dashed" },
        })
      }
      if (node.type.name !== "table_cell") return
      cellCount += 1
      expect(node.attrs.borderTop).toMatchObject({
        style: "dashed",
        color: "#336699",
        width: 20,
      })
      expect(node.attrs.borderLeft).toMatchObject({ style: "dashed" })
      expect(JSON.stringify(node.type.spec.toDOM?.(node))).toContain("dashed")
    })
    expect(cellCount).toBe(4)

    state = placeInFirstCell(dashed.state)
    const cleared = applyCommandToSemantic(
      state,
      setTableBorderStyle("all", "none")
    )
    expect(cleared.applied).toBe(true)
    cleared.state.doc.descendants((node) => {
      if (node.type.name === "table") {
        expect(node.attrs.borders).toMatchObject({
          top: null,
          insideHorizontal: null,
          insideVertical: null,
        })
      }
      if (node.type.name === "table_cell") {
        expect(node.attrs.borderTop).toBeNull()
        expect(node.attrs.borderRight).toBeNull()
      }
    })
  })

  test("setCellBorderStyle applies to every cell in a CellSelection", () => {
    let state = createEditorStateFromDocument(createBlankDocument())
    state = applyCommandToSemantic(state, insertTable(2, 2)).state
    state = selectCellRange(state, 0, 3)

    const dashed = applyCommandToSemantic(
      state,
      setCellBorderStyle("all", "dashed", "#003366", 20)
    )
    expect(dashed.applied).toBe(true)

    const styles: unknown[] = []
    dashed.state.doc.descendants((node) => {
      if (node.type.name === "table_cell") {
        styles.push(node.attrs.borderTop)
        expect(node.attrs.borderTop).toMatchObject({
          style: "dashed",
          color: "#003366",
          width: 20,
        })
        expect(node.attrs.borderLeft).toMatchObject({ style: "dashed" })
      }
    })
    expect(styles).toHaveLength(4)
  })

  test("setTableBorderStyle with a partial CellSelection only changes those cells", () => {
    let state = createEditorStateFromDocument(createBlankDocument())
    state = applyCommandToSemantic(state, insertTable(2, 2)).state
    state = selectCellRange(state, 0, 1)

    const dotted = applyCommandToSemantic(
      state,
      setTableBorderStyle("all", "dotted", "#990000", 18)
    )
    expect(dotted.applied).toBe(true)

    const styles: unknown[] = []
    dotted.state.doc.descendants((node) => {
      if (node.type.name === "table_cell") {
        styles.push(node.attrs.borderTop?.style)
      }
    })
    expect(styles).toEqual(["dotted", "dotted", "single", "single"])
  })

  test("setTableBorderStyle uses captured cell positions after the selection collapses", () => {
    let state = createEditorStateFromDocument(createBlankDocument())
    state = applyCommandToSemantic(state, insertTable(2, 2)).state
    state = selectCellRange(state, 0, 3)
    const positions = selectedTableCellPositions(state)
    expect(positions).toHaveLength(4)

    state = placeInFirstCell(state)
    const dashed = applyCommandToSemantic(
      state,
      setTableBorderStyle("all", "dashed", "#003366", 20, positions)
    )
    expect(dashed.applied).toBe(true)

    const styles: unknown[] = []
    dashed.state.doc.descendants((node) => {
      if (node.type.name === "table_cell") {
        styles.push(node.attrs.borderTop?.style)
      }
    })
    expect(styles).toEqual(["dashed", "dashed", "dashed", "dashed"])
  })

  test("setCellBorderStyle applies via selection.ranges on a CellSelection", () => {
    let state = createEditorStateFromDocument(createBlankDocument())
    state = applyCommandToSemantic(state, insertTable(2, 2)).state
    state = selectCellRange(state, 0, 3)
    expect(state.selection.ranges.length).toBe(4)
    expect(selectedTableCellPositions(state)).toHaveLength(4)

    const dotted = applyCommandToSemantic(
      state,
      setCellBorderStyle("all", "dotted", "#111111", 18)
    )
    expect(dotted.applied).toBe(true)

    const styles: unknown[] = []
    dotted.state.doc.descendants((node) => {
      if (node.type.name === "table_cell") {
        styles.push(node.attrs.borderTop?.style)
      }
    })
    expect(styles).toEqual(["dotted", "dotted", "dotted", "dotted"])
  })
})
