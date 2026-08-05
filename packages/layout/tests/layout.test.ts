import { describe, expect, test } from "bun:test"
import { twips, type ResolvedDocument, type TextStyle } from "@apex-docx-pdf/core"

import { createPhase1StandardFontMetrics, layoutDocument } from "../src"

const style: TextStyle = { fontFamily: "Helvetica", fontSize: twips(240), bold: false, italic: false, underline: false, color: "#000000" }
const source = { part: "word/document.xml", xmlPath: "/w:document[1]" }

function documentWith(text: string, overrides: Partial<ResolvedDocument["sections"][number]["properties"]> = {}): ResolvedDocument {
  return {
    type: "document", id: "document" as ResolvedDocument["id"], source,
    sections: [{
      type: "section", id: "section" as ResolvedDocument["sections"][number]["id"], source,
      properties: { pageWidth: twips(2_000), pageHeight: twips(1_600), margins: { top: twips(100), right: twips(100), bottom: twips(100), left: twips(100) }, ...overrides },
      blocks: [{
        type: "paragraph", id: "paragraph" as ResolvedDocument["sections"][number]["blocks"][number]["id"], source,
        properties: { alignment: "left", spacingBefore: twips(0), spacingAfter: twips(0), lineSpacing: null, keepWithNext: false, keepLinesTogether: false, pageBreakBefore: false },
        children: [{ type: "text", id: "text" as ResolvedDocument["sections"][number]["blocks"][number]["children"][number]["id"], source, text, style }],
      }],
    }],
  }
}

describe("Phase 1 layout", () => {
  test("measures standard-font text in integer twips", () => {
    const metrics = createPhase1StandardFontMetrics()
    expect(metrics.measureText("Hello", style)).toBe(twips(507))
    expect(Number.isInteger(metrics.measureText("Hello", style))).toBe(true)
  })

  test("wraps long tokens and preserves source-linked display list runs", () => {
    const result = layoutDocument(documentWith("supercalifragilisticexpialidocious", { pageWidth: twips(800), pageHeight: twips(4_000) }), { includeTrace: true })
    expect(result.displayList.pages).toHaveLength(1)
    const items = result.displayList.pages[0]?.items ?? []
    expect(items.length).toBeGreaterThan(1)
    expect(items.map((item) => item.type === "glyph-run" ? item.sourceNodeId : "")).toEqual(Array(items.length).fill("text"))
    expect(result.trace?.events.filter((event) => event.kind === "line")).toHaveLength(items.length)
  })

  test("paginates deterministically and enforces maxPages", () => {
    const properties = { pageWidth: twips(600), pageHeight: twips(700) }
    const result = layoutDocument(documentWith("one two three four five six seven eight nine ten eleven twelve", properties), { includeTrace: true })
    expect(result.displayList.pages.length).toBeGreaterThan(1)
    expect(result.trace?.events.some((event) => event.kind === "page-break")).toBe(true)
    expect(() => layoutDocument(documentWith("one two three four five six seven eight nine ten eleven twelve", properties), { maxPages: 1 })).toThrow("maximum of 1 pages")
  })

  test("honours an already-aborted signal before layout allocation", () => {
    const controller = new AbortController()
    controller.abort()
    expect(() => layoutDocument(documentWith("cancelled"), { signal: controller.signal })).toThrow()
  })
})
