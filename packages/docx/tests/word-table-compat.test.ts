import { describe, expect, test } from "bun:test"

import { normaliseDocxBytes, parseDocx, serializeDocx } from "../src"
import { buildOneParagraphDocx } from "./helpers/docx-fixture"

const STYLES_RELATIONSHIP =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"

function withStyles(stylesXml: string): Readonly<Record<string, string>> {
  return {
    "word/_rels/document.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="styles" Type="${STYLES_RELATIONSHIP}" Target="styles.xml"/></Relationships>`,
    "word/styles.xml": stylesXml,
  }
}

function codes(result: {
  readonly diagnostics: readonly { readonly code: string }[]
}): readonly string[] {
  return result.diagnostics.map((entry) => entry.code)
}

function paddingValues(
  padding:
    | Readonly<{ top: number; right: number; bottom: number; left: number }>
    | null
    | undefined
) {
  return padding === null || padding === undefined
    ? null
    : {
        top: Number(padding.top),
        right: Number(padding.right),
        bottom: Number(padding.bottom),
        left: Number(padding.left),
      }
}

function tableDocument(
  properties: string,
  grid: string,
  cells: string
): string {
  return `<w:document xmlns:w="urn:test"><w:body><w:tbl><w:tblPr>${properties}</w:tblPr><w:tblGrid>${grid}</w:tblGrid><w:tr><w:trPr><w:trHeight w:val="200.5" w:hRule="atLeast"/></w:trPr>${cells}</w:tr></w:tbl></w:body></w:document>`
}

const COMPLETE_MARGIN = `<w:tcMar><w:top w:w="72.4" w:type="dxa"/><w:left w:w="72.4" w:type="dxa"/><w:bottom w:w="72.4" w:type="dxa"/><w:right w:w="72.4" w:type="dxa"/></w:tcMar>`

describe("Word-authored table compatibility", () => {
  test("preserves authored table indentation through normalisation and round-trip serialization", () => {
    const result = normaliseDocxBytes(
      buildOneParagraphDocx({
        documentXml: tableDocument(
          `<w:tblW w:w="1000" w:type="dxa"/><w:jc w:val="left"/><w:tblInd w:w="43.2" w:type="dxa"/>`,
          `<w:gridCol w:w="1000"/>`,
          `<w:tc><w:p><w:r><w:t>Indented</w:t></w:r></w:p></w:tc>`
        ),
      })
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const table = result.value.sections[0]?.blocks[0]
    expect(table?.type).toBe("table")
    if (table?.type !== "table") return
    expect(Number(table.indentStart)).toBe(43)
    expect(table.alignment ?? "left").toBe("left")

    const roundTrip = normaliseDocxBytes(serializeDocx(result.value))
    expect(roundTrip.ok).toBe(true)
    if (!roundTrip.ok) return
    const roundTripTable = roundTrip.value.sections[0]?.blocks[0]
    expect(roundTripTable?.type).toBe("table")
    if (roundTripTable?.type !== "table") return
    expect(Number(roundTripTable.indentStart)).toBe(43)
    expect(roundTripTable.alignment ?? "left").toBe("left")
  })

  test("preserves center and right table justification through normalisation and round-trip serialization", () => {
    const centered = normaliseDocxBytes(
      buildOneParagraphDocx({
        documentXml: tableDocument(
          `<w:tblW w:w="1000" w:type="dxa"/><w:jc w:val="center"/>`,
          `<w:gridCol w:w="1000"/>`,
          `<w:tc><w:p><w:r><w:t>Centered</w:t></w:r></w:p></w:tc>`
        ),
      })
    )
    expect(centered.ok).toBe(true)
    expect(centered.diagnostics).toEqual([])
    if (!centered.ok) return
    const centeredTable = centered.value.sections[0]?.blocks[0]
    expect(centeredTable?.type).toBe("table")
    if (centeredTable?.type !== "table") return
    expect(centeredTable.alignment).toBe("center")

    const centeredRoundTrip = normaliseDocxBytes(serializeDocx(centered.value))
    expect(centeredRoundTrip.ok).toBe(true)
    if (!centeredRoundTrip.ok) return
    const centeredOut = centeredRoundTrip.value.sections[0]?.blocks[0]
    expect(centeredOut?.type).toBe("table")
    if (centeredOut?.type !== "table") return
    expect(centeredOut.alignment).toBe("center")

    const right = normaliseDocxBytes(
      buildOneParagraphDocx({
        documentXml: tableDocument(
          `<w:tblW w:w="1000" w:type="dxa"/><w:jc w:val="end"/>`,
          `<w:gridCol w:w="1000"/>`,
          `<w:tc><w:p><w:r><w:t>Right</w:t></w:r></w:p></w:tc>`
        ),
      })
    )
    expect(right.ok).toBe(true)
    expect(right.diagnostics).toEqual([])
    if (!right.ok) return
    const rightTable = right.value.sections[0]?.blocks[0]
    expect(rightTable?.type).toBe("table")
    if (rightTable?.type !== "table") return
    expect(rightTable.alignment).toBe("right")

    const rightRoundTrip = normaliseDocxBytes(serializeDocx(right.value))
    expect(rightRoundTrip.ok).toBe(true)
    if (!rightRoundTrip.ok) return
    const rightOut = rightRoundTrip.value.sections[0]?.blocks[0]
    expect(rightOut?.type).toBe("table")
    if (rightOut?.type !== "table") return
    expect(rightOut.alignment).toBe("right")
  })

  test("keeps unknown table justification fail-closed", () => {
    const result = parseDocx(
      buildOneParagraphDocx({
        documentXml: tableDocument(
          `<w:tblW w:w="1000" w:type="dxa"/><w:jc w:val="both"/>`,
          `<w:gridCol w:w="1000"/>`,
          `<w:tc><w:p/></w:tc>`
        ),
      })
    )
    expect(result.ok).toBe(false)
    expect(codes(result)).toContain("DOCX_UNSUPPORTED_TABLE_PROPERTY")
    expect(
      result.diagnostics.some((entry) =>
        entry.message.includes("Table alignment 'both'")
      )
    ).toBe(true)
  })

  test("maps inert styles, left alignment, look metadata, fractional measures, per-cell margins, and direct shading", () => {
    const grid = `<w:gridCol w:w="333.46"/><w:gridCol w:w="333.46"/><w:gridCol w:w="333.46"/><w:tblGridChange w:id="7"><w:tblGrid><w:gridCol w:w="333.46"/><w:gridCol w:w="333.46"/><w:gridCol w:w="333.46"/></w:tblGrid></w:tblGridChange>`
    const cell = (fill: string, border = "") =>
      `<w:tc><w:tcPr>${COMPLETE_MARGIN}${border}<w:shd w:val="clear" w:fill="${fill}"/></w:tcPr><w:p><w:r><w:t>x</w:t></w:r></w:p></w:tc>`
    const result = normaliseDocxBytes(
      buildOneParagraphDocx({
        documentXml: tableDocument(
          `<w:tblStyle w:val="DirectTable"/><w:tblW w:w="1000.38" w:type="dxa"/><w:jc w:val="left"/><w:tblLook w:val="0600"/>`,
          grid,
          `${cell("auto", '<w:tcBorders><w:top w:val="none"/></w:tcBorders>')}${cell("EFEFEF")}${cell("auto")}`
        ),
        extraParts: withStyles(
          `<w:styles xmlns:w="urn:test"><w:style w:type="table" w:styleId="TableNormal"><w:tblPr><w:tblCellMar><w:top w:w="100.0" w:type="dxa"/><w:left w:w="100.0" w:type="dxa"/><w:bottom w:w="100.0" w:type="dxa"/><w:right w:w="100.0" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style><w:style w:type="table" w:styleId="DirectTable"><w:basedOn w:val="TableNormal"/><w:tblPr><w:tblStyleRowBandSize w:val="1"/><w:tblCellMar/></w:tblPr><w:tblStylePr w:type="firstRow"><w:tcPr/></w:tblStylePr></w:style></w:styles>`
        ),
      })
    )

    expect(result.ok).toBe(true)
    expect(result.diagnostics).toEqual([])
    if (!result.ok) return
    const table = result.value.sections[0]?.blocks[0]
    expect(table?.type).toBe("table")
    if (table?.type !== "table") return
    expect(Number(table.width)).toBe(1000)
    expect(table.columnWidths.map(Number)).toEqual([334, 333, 333])
    expect(
      Object.fromEntries(
        Object.entries(table.cellPadding).map(([key, value]) => [
          key,
          Number(value),
        ])
      )
    ).toEqual({
      top: 0,
      right: 115,
      bottom: 0,
      left: 115,
    })
    expect(
      table.rows[0]?.cells.map((cell) =>
        cell.cellPadding === null || cell.cellPadding === undefined
          ? null
          : Object.fromEntries(
              Object.entries(cell.cellPadding).map(([key, value]) => [
                key,
                Number(value),
              ])
            )
      )
    ).toEqual([
      { top: 72, right: 72, bottom: 72, left: 72 },
      { top: 72, right: 72, bottom: 72, left: 72 },
      { top: 72, right: 72, bottom: 72, left: 72 },
    ])
    expect(Number(table.rows[0]?.height?.value)).toBe(201)
    expect(table.rows[0]?.cells.map((cell) => cell.fillColor)).toEqual([
      null,
      "#EFEFEF",
      null,
    ])
  })

  test("keeps non-no-op styles, alignment, revisions, margins, borders, and theme shading fail-closed", () => {
    const result = parseDocx(
      buildOneParagraphDocx({
        documentXml: tableDocument(
          `<w:tblStyle w:val="VisualTable"/><w:tblW w:w="1000" w:type="dxa"/><w:jc w:val="center"/><w:tblLook w:val="0600"/>`,
          `<w:gridCol w:w="500"/><w:gridCol w:w="500"/><w:tblGridChange w:id="1"><w:tblGrid><w:gridCol w:w="400"/><w:gridCol w:w="600"/></w:tblGrid></w:tblGridChange>`,
          `<w:tc><w:tcPr>${COMPLETE_MARGIN}<w:tcBorders><w:top w:val="single" w:sz="8" w:color="000000"/></w:tcBorders><w:shd w:val="clear" w:fill="EFEFEF" w:themeFill="accent1"/></w:tcPr><w:p/></w:tc><w:tc><w:tcPr><w:tcMar><w:top w:w="80" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar></w:tcPr><w:p/></w:tc>`
        ),
        extraParts: withStyles(
          `<w:styles xmlns:w="urn:test"><w:style w:type="table" w:styleId="VisualTable"><w:tblStylePr w:type="firstRow"><w:tcPr><w:shd w:val="clear" w:fill="FFFFFF"/></w:tcPr></w:tblStylePr></w:style></w:styles>`
        ),
      })
    )

    expect(result.ok).toBe(false)
    expect(codes(result)).toContain("DOCX_UNSUPPORTED_TABLE_PROPERTY")
    expect(codes(result)).toContain("DOCX_CONTENT_LOSS")
    for (const fragment of [
      "visual formatting outside",
      "tblLook cannot",
      "tblGridChange",
      "Theme cell shading",
    ]) {
      expect(
        result.diagnostics.some((entry) => entry.message.includes(fragment))
      ).toBe(true)
    }
  })

  test("preserves distinct complete margins on each cell without approximation", () => {
    const margin = (value: number) =>
      `<w:tcMar><w:top w:w="${value}" w:type="dxa"/><w:left w:w="${value + 1}" w:type="dxa"/><w:bottom w:w="${value + 2}" w:type="dxa"/><w:right w:w="${value + 3}" w:type="dxa"/></w:tcMar>`
    const cell = (value: number) =>
      `<w:tc><w:tcPr>${margin(value)}</w:tcPr><w:p/></w:tc>`
    const result = normaliseDocxBytes(
      buildOneParagraphDocx({
        documentXml: tableDocument(
          `<w:tblCellMar><w:top w:w="10" w:type="dxa"/><w:left w:w="11" w:type="dxa"/><w:bottom w:w="12" w:type="dxa"/><w:right w:w="13" w:type="dxa"/></w:tblCellMar>`,
          `<w:gridCol w:w="500"/><w:gridCol w:w="500"/>`,
          `${cell(20)}${cell(30)}`
        ),
      })
    )

    expect(result.ok).toBe(true)
    expect(result.diagnostics.map((entry) => entry.code)).not.toContain(
      "DOCX_TABLE_CELL_PADDING_APPROXIMATED"
    )
    if (!result.ok) return
    const table = result.value.sections[0]?.blocks[0]
    expect(table?.type).toBe("table")
    if (table?.type !== "table") return
    expect(
      table.rows[0]?.cells.map((cell) => paddingValues(cell.cellPadding))
    ).toEqual([
      { top: 20, right: 23, bottom: 22, left: 21 },
      { top: 30, right: 33, bottom: 32, left: 31 },
    ])
    expect(paddingValues(table.cellPadding)).toEqual({
      top: 10,
      right: 13,
      bottom: 12,
      left: 11,
    })

    const roundTrip = normaliseDocxBytes(serializeDocx(result.value))
    expect(roundTrip.ok).toBe(true)
    if (!roundTrip.ok) return
    const roundTripTable = roundTrip.value.sections[0]?.blocks[0]
    expect(roundTripTable?.type).toBe("table")
    if (roundTripTable?.type !== "table") return
    expect(
      roundTripTable.rows[0]?.cells.map((cell) =>
        paddingValues(cell.cellPadding)
      )
    ).toEqual([
      { top: 20, right: 23, bottom: 22, left: 21 },
      { top: 30, right: 33, bottom: 32, left: 31 },
    ])
  })

  test("rejects malformed fractional measures", () => {
    const result = parseDocx(
      buildOneParagraphDocx({
        documentXml: tableDocument(
          `<w:tblW w:w="1.2.3" w:type="dxa"/>`,
          `<w:gridCol w:w="-20.5"/>`,
          `<w:tc><w:p/></w:tc>`
        ),
      })
    )
    expect(result.ok).toBe(false)
    expect(codes(result)).toContain("DOCX_INVALID_TABLE_VALUE")
    expect(codes(result)).toContain("DOCX_INVALID_TABLE")
  })

  test("preserves K3-shaped direct cell borders and explicit none overrides", () => {
    const side = (
      name: string,
      color: string,
      size: number,
      value = "single"
    ) =>
      `<w:${name} w:val="${value}" w:sz="${size}" w:space="0" w:color="${color}"/>`
    const borders = (value: string) => `<w:tcBorders>${value}</w:tcBorders>`
    const cell = (label: string, direct = "") =>
      `<w:tc><w:tcPr>${direct}</w:tcPr><w:p><w:r><w:t>${label}</w:t></w:r></w:p></w:tc>`
    const result = normaliseDocxBytes(
      buildOneParagraphDocx({
        documentXml: `<w:document xmlns:w="urn:test"><w:body><w:tbl><w:tblPr><w:tblW w:w="2000" w:type="dxa"/><w:tblBorders>${side("top", "111111", 4)}${side("right", "111111", 4)}${side("bottom", "111111", 4)}${side("left", "111111", 4)}${side("insideH", "111111", 4)}${side("insideV", "111111", 4)}</w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="1000"/><w:gridCol w:w="1000"/></w:tblGrid><w:tr>${cell("Header A", borders(`${side("top", "000000", 12)}${side("bottom", "000000", 12)}`))}${cell("Header B", borders(`${side("top", "000000", 12)}${side("bottom", "000000", 12)}`))}</w:tr></w:tbl><w:tbl><w:tblPr><w:tblW w:w="2000" w:type="dxa"/><w:tblBorders>${side("top", "111111", 4)}${side("right", "111111", 4)}${side("bottom", "111111", 4)}${side("left", "111111", 4)}${side("insideV", "111111", 4)}</w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="1000"/><w:gridCol w:w="1000"/></w:tblGrid><w:tr>${cell("Laboratory", borders(`${side("top", "999999", 8)}${side("right", "999999", 8)}${side("bottom", "999999", 8)}${side("left", "999999", 8)}`))}${cell("No top", borders(side("top", "000000", 0, "nil")))}</w:tr></w:tbl></w:body></w:document>`,
      })
    )

    expect(result.ok).toBe(true)
    expect(result.diagnostics).toEqual([])
    if (!result.ok) return
    const table = result.value.sections[0]?.blocks[0]
    expect(table?.type).toBe("table")
    if (table?.type !== "table") return
    expect(table.rows[0]?.cells[0]?.borders).toMatchObject({
      top: { style: "single", color: "#000000", width: 30 },
      bottom: { style: "single", color: "#000000", width: 30 },
    })
    const laboratory = result.value.sections[0]?.blocks[1]
    expect(laboratory?.type).toBe("table")
    if (laboratory?.type !== "table") return
    expect(laboratory.rows[0]?.cells[0]?.borders).toMatchObject({
      top: { style: "single", color: "#999999", width: 20 },
      right: { style: "single", color: "#999999", width: 20 },
      bottom: { style: "single", color: "#999999", width: 20 },
      left: { style: "single", color: "#999999", width: 20 },
    })
    expect(laboratory.rows[0]?.cells[1]?.borders.top?.style).toBe("none")
  })

  test("warns and resolves when adjacent direct borders conflict", () => {
    const result = parseDocx(
      buildOneParagraphDocx({
        documentXml: tableDocument(
          `<w:tblW w:w="1000" w:type="dxa"/>`,
          `<w:gridCol w:w="500"/><w:gridCol w:w="500"/>`,
          `<w:tc><w:tcPr><w:tcBorders><w:right w:val="single" w:sz="8" w:color="000000"/></w:tcBorders></w:tcPr><w:p/></w:tc><w:tc><w:tcPr><w:tcBorders><w:left w:val="dashed" w:sz="8" w:color="000000"/></w:tcBorders></w:tcPr><w:p/></w:tc>`
        ),
      })
    )

    expect(result.ok).toBe(true)
    expect(
      result.diagnostics.some((entry) =>
        entry.message.includes("Adjacent direct cell borders conflict")
      )
    ).toBe(true)
  })
})
