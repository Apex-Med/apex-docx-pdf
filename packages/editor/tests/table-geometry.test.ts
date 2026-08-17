import { describe, expect, test } from "bun:test"
import {
  createBlankDocument,
  nodeId,
  twips,
  type SemanticDocument,
} from "@apexmed/core"

import { fromSemanticDocument } from "../src/model/bridge"
import {
  authoredColumnWidthCss,
  authoredTableStyle,
} from "../src/schema/table-geometry"

describe("authored table geometry", () => {
  test("table style keeps Word cell padding and grid width", () => {
    const style = authoredTableStyle({
      width: 8940,
      alignment: "left",
      indentStart: 0,
      layout: "fixed",
      cellPadding: { top: 0, right: 115, bottom: 0, left: 115 },
    })
    expect(style).toContain("width:447pt")
    expect(style).toContain("--apex-cell-pad-left:5.75pt")
    expect(style).toContain("--apex-cell-pad-right:5.75pt")
    expect(style).not.toContain("width:100%")
  })

  test("centered tables use auto side margins", () => {
    const style = authoredTableStyle({
      width: 9026,
      alignment: "center",
      indentStart: 0,
      layout: "fixed",
      cellPadding: { top: 0, right: 108, bottom: 0, left: 108 },
    })
    expect(style).toContain("margin-left:auto")
    expect(style).toContain("margin-right:auto")
  })

  test("column widths convert from twips to CSS points", () => {
    expect(authoredTableStyle({ width: 8940, layout: "fixed" })).toContain(
      "width:447pt"
    )
    const style = authoredTableStyle({
      width: 8940,
      alignment: "left",
      indentStart: 0,
      layout: "fixed",
      cellPadding: { top: 0, right: 115, bottom: 0, left: 115 },
      columnWidths: [2400, 6540],
    })
    expect(style).toContain("width:447pt")
    expect(style).toContain("--apex-cell-pad-left:5.75pt")
  })

  test("responsive table modes map to Fill, Hug, and Fixed CSS without changing legacy grids", () => {
    const columns = [
      {
        mode: "hug" as const,
        width: twips(2000),
        minWidth: null,
        maxWidth: null,
        allowMultiline: true,
      },
      {
        mode: "fill" as const,
        width: twips(4000),
        minWidth: null,
        maxWidth: null,
        allowMultiline: true,
      },
    ]
    expect(
      authoredTableStyle({
        width: 6000,
        columnWidths: [2000, 4000],
        tableSizing: { mode: "fill", width: twips(6000), columns },
      })
    ).toContain("width:100%")
    expect(
      authoredTableStyle({
        width: 6000,
        columnWidths: [2000, 4000],
        tableSizing: {
          mode: "hug",
          width: twips(6000),
          columns: columns.map((column) => ({ ...column, mode: "hug" })),
        },
      })
    ).toContain("width:max-content")
    expect(authoredTableStyle({ width: 6000 })).toContain("width:300pt")
    expect(
      authoredTableStyle({
        width: 6000,
        columnWidths: [2000, 4000],
        tableSizing: { mode: "fill", width: twips(6000), columns },
      })
    ).toContain("table-layout:fixed")
    expect(
      authoredTableStyle({
        width: 6000,
        columnWidths: [2000, 4000],
        tableSizing: {
          mode: "hug",
          width: twips(6000),
          columns: columns.map((column) => ({ ...column, mode: "hug" })),
        },
      })
    ).toContain("table-layout:auto")
  })

  test("Fill columns stay auto so fixed table layout can share leftover space equally", () => {
    const hug = {
      mode: "hug" as const,
      width: twips(1800),
      minWidth: null,
      maxWidth: null,
      allowMultiline: true,
    }
    const fill = {
      mode: "fill" as const,
      width: twips(2400),
      minWidth: null,
      maxWidth: null,
      allowMultiline: true,
    }
    expect(authoredColumnWidthCss(hug, hug.width)).toBe("1%")
    expect(authoredColumnWidthCss(hug, hug.width, 131)).toBe("131px")
    expect(authoredColumnWidthCss(fill, fill.width)).toBe("auto")
    expect(
      authoredColumnWidthCss({ ...fill, width: twips(4800) }, twips(4800))
    ).toBe("auto")
    expect(
      authoredColumnWidthCss(
        { ...fill, mode: "fixed", width: twips(1600) },
        twips(2400)
      )
    ).toBe("80pt")
  })

  test("spanned header cells keep left/right paragraph alignment", () => {
    const blank = createBlankDocument()
    const source = blank.source
    const para = (id: string, text: string, alignment: "left" | "right") => ({
      type: "paragraph" as const,
      id: nodeId(id),
      source,
      properties: {
        alignment,
        spacingBefore: twips(0),
        spacingAfter: twips(0),
        lineSpacing: { rule: "auto" as const, value240ths: 240 },
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
          type: "text" as const,
          id: nodeId(`${id}-t`),
          source,
          text,
          style: {
            fontFamily: "Calibri",
            fontSize: twips(220),
            fontWeight: 400 as const,
            fontStyle: "normal" as const,
            underline: false,
            color: "#000000",
          },
        },
      ],
    })
    const document = {
      ...blank,
      sections: blank.sections.map((section) => ({
        ...section,
        blocks: [
          {
            type: "table" as const,
            id: nodeId("tbl-header"),
            source,
            width: twips(8940),
            preferredWidth: twips(8940),
            layout: "fixed" as const,
            alignment: "left" as const,
            columnWidths: [twips(2085), twips(2385), twips(2070), twips(2400)],
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
              right: twips(115),
              bottom: twips(0),
              left: twips(115),
            },
            repeatHeaderRowCount: 0,
            rows: [
              {
                type: "tableRow" as const,
                id: nodeId("r0"),
                source,
                repeatAsHeader: false,
                allowBreakAcrossPages: true,
                height: { rule: "atLeast" as const, value: twips(424) },
                cells: [
                  {
                    type: "tableCell" as const,
                    id: nodeId("c0"),
                    source,
                    columnIndex: 0,
                    width: twips(4470),
                    preferredWidth: null,
                    columnSpan: 2,
                    verticalMerge: "none" as const,
                    verticalAlignment: "top" as const,
                    fillColor: null,
                    borders: {
                      top: null,
                      right: null,
                      bottom: null,
                      left: null,
                    },
                    blocks: [para("p-left", "ADMISSION", "left")],
                  },
                  {
                    type: "tableCell" as const,
                    id: nodeId("c1"),
                    source,
                    columnIndex: 2,
                    width: twips(4470),
                    preferredWidth: null,
                    columnSpan: 2,
                    verticalMerge: "none" as const,
                    verticalAlignment: "top" as const,
                    fillColor: null,
                    borders: {
                      top: null,
                      right: null,
                      bottom: null,
                      left: null,
                    },
                    blocks: [para("p-right", "12 Aug 2026", "right")],
                  },
                ],
              },
            ],
          },
        ],
      })),
    }
    const pm = fromSemanticDocument(document as SemanticDocument)
    const aligns: string[] = []
    const colspans: number[] = []
    pm.descendants((node) => {
      if (node.type.name === "paragraph") {
        aligns.push(String(node.attrs.alignment))
      }
      if (node.type.name === "table_cell") {
        colspans.push(Number(node.attrs.colspan))
      }
    })
    expect(aligns).toEqual(["left", "right"])
    expect(colspans).toEqual([2, 2])
    let markerDom = ""
    let admissionDom = ""
    pm.descendants((node) => {
      if (node.type.name !== "paragraph") return true
      const spec = JSON.stringify(node.type.spec.toDOM?.(node))
      if (node.attrs.alignment === "right") markerDom = spec
      if (node.attrs.alignment === "left") admissionDom = spec
      return true
    })
    expect(markerDom).toContain("text-align:right")
    expect(admissionDom).toContain("line-height:normal")
    expect(admissionDom).not.toContain("line-height:1;")
  })

  test("auto line spacing 1.15 stays a CSS ratio", () => {
    const blank = createBlankDocument()
    const paragraph = blank.sections[0]?.blocks[0]
    if (paragraph?.type !== "paragraph") throw new Error("expected paragraph")
    const document = {
      ...blank,
      sections: blank.sections.map((section) => ({
        ...section,
        blocks: [
          {
            ...paragraph,
            properties: {
              ...paragraph.properties,
              lineSpacing: { rule: "auto" as const, value240ths: 276 },
            },
          },
        ],
      })),
    }
    const pm = fromSemanticDocument(document as SemanticDocument)
    let spec = ""
    pm.descendants((node) => {
      if (node.type.name !== "paragraph") return true
      spec = JSON.stringify(node.type.spec.toDOM?.(node))
      return false
    })
    expect(spec).toContain("line-height:1.15")
  })
})
