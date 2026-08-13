import { describe, expect, test } from "bun:test"
import {
  twips,
  type GlyphRun,
  type ResolvedBlock,
  type ResolvedDocument,
  type ResolvedParagraph,
  type TextStyle,
} from "@apexmed/core"

import { layoutDocument } from "../src"

const source = { part: "word/document.xml", xmlPath: "/w:document[1]" }
const style: TextStyle = {
  fontFamily: "Helvetica",
  fontSize: twips(240),
  fontWeight: 400,
  fontStyle: "normal",
  underline: false,
  color: "#000000",
}
const paragraphProperties: ResolvedParagraph["properties"] = {
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
}

function documentWith(blocks: readonly ResolvedBlock[]): ResolvedDocument {
  return {
    type: "document",
    id: "document" as ResolvedDocument["id"],
    source,
    assets: [],
    headers: [],
    footers: [],
    numberingDefinitions: [],
    sections: [
      {
        type: "section",
        id: "section" as ResolvedDocument["sections"][number]["id"],
        source,
        properties: {
          pageWidth: twips(2_000),
          pageHeight: twips(1_600),
          orientation: "portrait",
          headerDistance: twips(720),
          footerDistance: twips(720),
          margins: {
            top: twips(100),
            right: twips(100),
            bottom: twips(100),
            left: twips(100),
          },
        },
        defaultHeaderId: null,
        defaultFooterId: null,
        blocks,
      },
    ],
  }
}

describe("hyperlink layout", () => {
  test("propagates href onto glyph runs and returns LinkBox entries", () => {
    const paragraph: ResolvedParagraph = {
      type: "paragraph",
      id: "paragraph" as ResolvedParagraph["id"],
      source,
      properties: paragraphProperties,
      children: [
        {
          type: "text",
          id: "plain" as never,
          source,
          text: "See ",
          style,
        },
        {
          type: "text",
          id: "link" as never,
          source,
          text: "docs",
          style: { ...style, underline: true, color: "#0563C1" },
          href: "https://example.com/docs",
        },
        {
          type: "text",
          id: "tail" as never,
          source,
          text: ".",
          style,
        },
      ],
    }

    const result = layoutDocument(documentWith([paragraph]))
    const runs = result.displayList.pages[0]?.items.filter(
      (item): item is GlyphRun => item.type === "glyph-run"
    )
    expect(runs?.map((run) => ({ text: run.text, href: run.href }))).toEqual([
      { text: "See ", href: undefined },
      { text: "docs", href: "https://example.com/docs" },
      { text: ".", href: undefined },
    ])

    const linked = runs?.find((run) => run.text === "docs")
    expect(linked).toBeDefined()
    if (!linked) return

    const ascent = twips(Math.round((linked.fontSize * 4) / 5))
    expect(result.links).toEqual([
      {
        href: "https://example.com/docs",
        x: linked.x,
        y: twips(linked.baselineY - ascent),
        width: linked.width,
        height: linked.fontSize,
        pageIndex: 0,
      },
    ])
  })

  test("omits links when no runs carry href", () => {
    const paragraph: ResolvedParagraph = {
      type: "paragraph",
      id: "paragraph" as ResolvedParagraph["id"],
      source,
      properties: paragraphProperties,
      children: [
        {
          type: "text",
          id: "plain" as never,
          source,
          text: "plain",
          style,
        },
      ],
    }
    const result = layoutDocument(documentWith([paragraph]))
    expect(result.links).toBeUndefined()
  })
})
