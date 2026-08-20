import { describe, expect, test } from "bun:test"
import { twips } from "@apexmed/core"
import { layoutDocument } from "@apexmed/layout"
import { serializePdf } from "@apexmed/pdf"

import {
  fontRegistryForExport,
  resetExportFontRegistryCacheForTests,
} from "../src/fonts/export-registry"

const source = { part: "word/document.xml", xmlPath: "/w:document[1]" }

function textRun(
  id: string,
  text: string,
  family: string,
  weight: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900
) {
  return {
    type: "text" as const,
    id: id as never,
    source,
    text,
    style: {
      fontFamily: family,
      fontSize: twips(240),
      fontWeight: weight,
      fontStyle: "normal" as const,
      underline: false as const,
      color: "#000000",
    },
  }
}

function documentWith(runs: ReturnType<typeof textRun>[]) {
  return {
    type: "document" as const,
    id: "document" as never,
    source,
    assets: [],
    headers: [],
    footers: [],
    numberingDefinitions: [],
    sections: [
      {
        type: "section" as const,
        id: "section" as never,
        source,
        properties: {
          pageWidth: twips(5_000),
          pageHeight: twips(8_000),
          orientation: "portrait" as const,
          headerDistance: twips(720),
          footerDistance: twips(720),
          margins: {
            top: twips(200),
            right: twips(200),
            bottom: twips(200),
            left: twips(200),
          },
        },
        defaultHeaderId: null,
        defaultFooterId: null,
        blocks: [
          {
            type: "paragraph" as const,
            id: "paragraph" as never,
            source,
            properties: {
              alignment: "left" as const,
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
            },
            children: runs,
          },
        ],
      },
    ],
  }
}

describe("export font registry catalog weights", () => {
  test("embeds every requested published weight as its own static face", async () => {
    resetExportFontRegistryCacheForTests()
    const document = documentWith([
      textRun("t1", "Thin", "Inter", 100),
      textRun("t2", "Medium", "Inter", 500),
      textRun("t3", "Black", "Inter", 900),
      textRun("t4", "GeistLight", "Geist", 200),
      textRun("t5", "GeistBold", "Geist", 700),
      textRun("t6", "Brico", "Bricolage Grotesque", 800),
      textRun("t7", "Instrument", "Instrument Sans", 600),
    ])

    const fonts = await fontRegistryForExport(document)
    expect(fonts).toBeTruthy()

    const expected = [
      ["Inter", 100, "Inter-Thin"],
      ["Inter", 500, "Inter-Medium"],
      ["Inter", 900, "Inter-Black"],
      ["Geist", 200, "Geist-ExtraLight"],
      ["Geist", 700, "Geist-Bold"],
      ["Bricolage Grotesque", 800, "BricolageGrotesque-14ptExtraBold"],
      ["Instrument Sans", 600, "InstrumentSans-SemiBold"],
    ] as const

    for (const [family, weight, postscriptName] of expected) {
      const match = fonts!.matchFace({
        family,
        weight,
        style: "normal",
      })
      expect(match.kind).toBe("exact")
      expect(fonts!.face(match.faceId)).toMatchObject({
        weight,
        postscriptName,
      })
    }

    const layout = layoutDocument(document, {
      fonts: fonts!,
      shaper: fonts!,
      includeTrace: false,
    })
    const pdf = serializePdf(layout.displayList, { fonts: fonts! })
    const text = Buffer.from(pdf.bytes).toString("latin1")
    for (const [, , postscriptName] of expected) {
      expect(text).toContain(postscriptName)
    }
    expect(
      layout.diagnostics.filter((entry) =>
        String(entry.code).includes("font-match-fallback")
      )
    ).toEqual([])
  })
})
