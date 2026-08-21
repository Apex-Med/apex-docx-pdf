import { describe, expect, test } from "bun:test"
import {
  createBlankDocument,
  nodeId,
  twips,
  type SemanticDocument,
  type SemanticTable,
  type TextStyle,
} from "@apexmed/core"

import { fromSemanticDocument, toSemanticDocument } from "../src/model/bridge"
import { editorSchema } from "../src/schema"

const baseStyle: TextStyle = {
  fontFamily: "Calibri",
  fontSize: twips(220),
  fontWeight: 400,
  fontStyle: "normal",
  underline: false,
  color: "#000000",
}

function shapeForCompare(document: SemanticDocument) {
  return document.sections.map((section) =>
    section.blocks.map((block) => {
      if (block.type === "paragraph") {
        return {
          type: "paragraph",
          text: block.children
            .filter((c) => c.type === "text")
            .map((c) => (c.type === "text" ? c.text : ""))
            .join(""),
          alignment: block.properties.alignment,
          styles: block.children
            .filter((c) => c.type === "text")
            .map((c) =>
              c.type === "text"
                ? {
                    fontWeight: c.style.fontWeight,
                    underline: c.style.underline,
                    color: c.style.color,
                  }
                : null
            ),
        }
      }
      if (block.type === "table") {
        return {
          type: "table",
          rows: block.rows.map((row) =>
            row.cells.map((cell) => ({
              columnIndex: cell.columnIndex,
              columnSpan: cell.columnSpan,
              verticalMerge: cell.verticalMerge,
              text: cell.blocks
                .flatMap((p) =>
                  p.children
                    .filter((c) => c.type === "text")
                    .map((c) => (c.type === "text" ? c.text : ""))
                )
                .join(""),
            }))
          ),
        }
      }
      return { type: block.type }
    })
  )
}

describe("model bridge", () => {
  test("round-trips a blank document both directions", () => {
    const blank = createBlankDocument()
    const pm = fromSemanticDocument(blank)
    expect(pm.type.name).toBe("doc")
    const back = toSemanticDocument(pm, {
      styles: blank.styles,
      assets: blank.assets,
    })
    expect(shapeForCompare(back)).toEqual(shapeForCompare(blank))
  })

  test("round-trips marks ↔ resolved text style", () => {
    const blank = createBlankDocument()
    const paragraph = blank.sections[0]!.blocks[0]!
    if (paragraph.type !== "paragraph") throw new Error("expected paragraph")
    const styled: SemanticDocument = {
      ...blank,
      sections: [
        {
          ...blank.sections[0]!,
          blocks: [
            {
              ...paragraph,
              children: [
                {
                  type: "text",
                  id: nodeId("t1"),
                  source: paragraph.source,
                  text: "Bold red",
                  style: {
                    ...baseStyle,
                    fontWeight: 700,
                    underline: true,
                    color: "#FF0000",
                  },
                },
              ],
            },
          ],
        },
      ],
    }
    const pm = fromSemanticDocument(styled)
    const text = pm.descendants.bind(pm)
    let sawMark = false
    text((node) => {
      if (node.isText) {
        const mark = editorSchema.marks.textStyle!.isInSet(node.marks)
        expect(mark).toBeTruthy()
        expect(mark?.attrs.fontWeight).toBe(700)
        expect(mark?.attrs.underline).toBe(true)
        expect(mark?.attrs.color).toBe("#FF0000")
        sawMark = true
      }
    })
    expect(sawMark).toBe(true)

    const back = toSemanticDocument(pm)
    const outText = (
      back.sections[0]!.blocks[0] as Extract<
        SemanticDocument["sections"][0]["blocks"][0],
        { type: "paragraph" }
      >
    ).children[0]
    expect(outText?.type).toBe("text")
    if (outText?.type !== "text") return
    expect(outText.style.fontWeight).toBe(700)
    expect(outText.style.underline).toBe(true)
    expect(outText.style.color).toBe("#FF0000")
  })

  test("round-trips vMerge restart/continue ↔ rowspan", () => {
    const blank = createBlankDocument()
    const source = blank.source
    const emptyPara = (
      id: string,
      text = ""
    ): Extract<
      SemanticDocument["sections"][0]["blocks"][0],
      { type: "paragraph" }
    > => ({
      type: "paragraph",
      id: nodeId(id),
      source,
      properties: {
        alignment: "left",
        spacingBefore: twips(0),
        spacingAfter: twips(0),
        lineSpacing: null,
        indentStart: twips(0),
        indentEnd: twips(0),
        firstLineIndent: twips(0),
        keepWithNext: false,
        keepLinesTogether: false,
        widowControl: true,
        pageBreakBefore: false,
        numbering: null,
        tabStops: [],
      },
      children: [
        {
          type: "text",
          id: nodeId(`${id}-t`),
          source,
          text,
          style: baseStyle,
        },
      ],
    })

    const table: SemanticTable = {
      type: "table",
      id: nodeId("tbl1"),
      source,
      width: twips(5760),
      preferredWidth: twips(5760),
      layout: "fixed",
      columnWidths: [twips(1800), twips(3960)],
      borders: {
        top: null,
        right: null,
        bottom: null,
        left: null,
        insideHorizontal: null,
        insideVertical: null,
      },
      cellPadding: {
        top: twips(0),
        right: twips(108),
        bottom: twips(0),
        left: twips(108),
      },
      repeatHeaderRowCount: 0,
      rows: [
        {
          type: "tableRow",
          id: nodeId("r1"),
          source,
          repeatAsHeader: false,
          allowBreakAcrossPages: true,
          height: null,
          cells: [
            {
              type: "tableCell",
              id: nodeId("c1"),
              source,
              columnIndex: 0,
              width: twips(1800),
              preferredWidth: twips(1800),
              columnSpan: 1,
              verticalMerge: "restart",
              verticalAlignment: "top",
              fillColor: null,
              borders: { top: null, right: null, bottom: null, left: null },
              blocks: [emptyPara("p1", "Merged")],
            },
            {
              type: "tableCell",
              id: nodeId("c2"),
              source,
              columnIndex: 1,
              width: twips(3960),
              preferredWidth: twips(3960),
              columnSpan: 1,
              verticalMerge: "none",
              verticalAlignment: "top",
              fillColor: null,
              borders: { top: null, right: null, bottom: null, left: null },
              cellPadding: {
                top: twips(10),
                right: twips(20),
                bottom: twips(30),
                left: twips(40),
              },
              blocks: [emptyPara("p2", "A")],
            },
          ],
        },
        {
          type: "tableRow",
          id: nodeId("r2"),
          source,
          repeatAsHeader: false,
          allowBreakAcrossPages: true,
          height: null,
          cells: [
            {
              type: "tableCell",
              id: nodeId("c3"),
              source,
              columnIndex: 0,
              width: twips(1800),
              preferredWidth: twips(1800),
              columnSpan: 1,
              verticalMerge: "continue",
              verticalAlignment: "top",
              fillColor: null,
              borders: { top: null, right: null, bottom: null, left: null },
              blocks: [emptyPara("p3", "")],
            },
            {
              type: "tableCell",
              id: nodeId("c4"),
              source,
              columnIndex: 1,
              width: twips(3960),
              preferredWidth: twips(3960),
              columnSpan: 1,
              verticalMerge: "none",
              verticalAlignment: "top",
              fillColor: null,
              borders: { top: null, right: null, bottom: null, left: null },
              blocks: [emptyPara("p4", "B")],
            },
          ],
        },
      ],
    }

    const document: SemanticDocument = {
      ...blank,
      sections: [
        {
          ...blank.sections[0]!,
          blocks: [table],
        },
      ],
    }

    const pm = fromSemanticDocument(document)
    let restartRowspan = 0
    let directCellPadding: unknown = null
    let firstColumnWidth: unknown = null
    pm.descendants((node) => {
      if (node.type.name === "table_cell") {
        if (Number(node.attrs.rowspan) > 1) {
          restartRowspan = Number(node.attrs.rowspan)
        }
        if (node.attrs.nodeId === "c2")
          directCellPadding = node.attrs.cellPadding
        if (node.attrs.nodeId === "c1") firstColumnWidth = node.attrs.colwidth
      }
    })
    expect(restartRowspan).toBe(2)
    expect(firstColumnWidth).toEqual([120])
    expect(directCellPadding).toEqual({
      top: 10,
      right: 20,
      bottom: 30,
      left: 40,
    })

    const back = toSemanticDocument(pm)
    const backTable = back.sections[0]!.blocks[0]
    expect(backTable?.type).toBe("table")
    if (backTable?.type !== "table") return
    expect(backTable.rows[0]?.cells[0]?.verticalMerge).toBe("restart")
    expect(backTable.rows[1]?.cells[0]?.verticalMerge).toBe("continue")
    expect(
      backTable.rows.map((row) =>
        row.cells.map((cell) => ({
          columnIndex: cell.columnIndex,
          width: cell.width,
        }))
      )
    ).toEqual([
      [
        { columnIndex: 0, width: twips(1800) },
        { columnIndex: 1, width: twips(3960) },
      ],
      [
        { columnIndex: 0, width: twips(1800) },
        { columnIndex: 1, width: twips(3960) },
      ],
    ])
    expect(
      backTable.rows[1]?.cells[1]?.blocks[0]?.children.find(
        (child) => child.type === "text"
      )
    ).toMatchObject({ type: "text", text: "B" })
    expect(backTable.rows[0]?.cells[1]?.cellPadding).toEqual({
      top: twips(10),
      right: twips(20),
      bottom: twips(30),
      left: twips(40),
    })
  })

  test("fromSemantic paints authored bullet glyphs on table-cell paragraphs", () => {
    const blank = createBlankDocument()
    const source = blank.source
    const listed: Extract<
      SemanticDocument["sections"][0]["blocks"][0],
      { type: "paragraph" }
    > = {
      type: "paragraph",
      id: nodeId("listed"),
      source,
      properties: {
        alignment: "left",
        spacingBefore: twips(0),
        spacingAfter: twips(0),
        lineSpacing: null,
        indentStart: twips(720),
        indentEnd: twips(0),
        firstLineIndent: twips(-360),
        keepWithNext: false,
        keepLinesTogether: false,
        widowControl: true,
        pageBreakBefore: false,
        numbering: { definitionId: "n1", level: 0 },
        tabStops: [],
      },
      children: [
        {
          type: "text",
          id: nodeId("listed-t"),
          source,
          text: "Assessment",
          style: baseStyle,
        },
      ],
    }
    const table: SemanticTable = {
      type: "table",
      id: nodeId("tbl-list"),
      source,
      width: twips(2880),
      preferredWidth: twips(2880),
      layout: "fixed",
      alignment: "left",
      columnWidths: [twips(2880)],
      borders: {
        top: null,
        right: null,
        bottom: null,
        left: null,
        insideHorizontal: null,
        insideVertical: null,
      },
      cellPadding: {
        top: twips(0),
        right: twips(108),
        bottom: twips(0),
        left: twips(108),
      },
      repeatHeaderRowCount: 0,
      rows: [
        {
          type: "tableRow",
          id: nodeId("r-list"),
          source,
          repeatAsHeader: false,
          allowBreakAcrossPages: true,
          height: { rule: "atLeast", value: twips(344) },
          cells: [
            {
              type: "tableCell",
              id: nodeId("c-list"),
              source,
              columnIndex: 0,
              width: twips(2880),
              preferredWidth: twips(2880),
              columnSpan: 1,
              verticalMerge: "none",
              verticalAlignment: "center",
              fillColor: null,
              borders: { top: null, right: null, bottom: null, left: null },
              blocks: [listed],
            },
          ],
        },
      ],
    }
    const document: SemanticDocument = {
      ...blank,
      numberingDefinitions: [
        {
          id: "n1",
          levels: [
            {
              level: 0,
              startAt: 1,
              format: "bullet",
              levelText: "●",
              suffix: "tab",
              alignment: "left",
              indentStart: twips(720),
              firstLineIndent: twips(-360),
              restartAfterLevel: null,
              legal: false,
            },
          ],
        },
      ],
      sections: blank.sections.map((section) => ({
        ...section,
        blocks: [table],
      })),
    }
    const pm = fromSemanticDocument(document)
    let numberingLabel: unknown
    let markerDom: unknown
    let hanging: unknown
    let cellDom: unknown
    let rowDom: unknown
    pm.descendants((node) => {
      if (node.type.name === "paragraph" && numberingLabel === undefined) {
        numberingLabel = node.attrs.numberingLabel
        markerDom = node.type.spec.toDOM?.(node)
        hanging = node.attrs.firstLineIndent
      }
      if (node.type.name === "table_cell" && cellDom === undefined) {
        cellDom = node.type.spec.toDOM?.(node)
      }
      if (node.type.name === "table_row" && rowDom === undefined) {
        rowDom = node.type.spec.toDOM?.(node)
      }
    })
    expect(numberingLabel).toBe("●")
    expect(hanging).toBe(twips(-360))
    expect(JSON.stringify(markerDom)).toContain("data-list-marker")
    expect(JSON.stringify(markerDom)).toContain("●")
    expect(JSON.stringify(markerDom)).toContain("--apex-list-hanging:18pt")
    expect(JSON.stringify(cellDom)).toContain("vertical-align:middle")
    expect(JSON.stringify(cellDom)).toContain("width:144pt")
    expect(JSON.stringify(rowDom)).toContain("--apex-row-height:17.2pt")
  })
})
