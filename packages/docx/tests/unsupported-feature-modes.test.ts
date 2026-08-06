import { describe, expect, test } from "bun:test"

import { normaliseDocxBytes, parseDocx } from "../src"
import { buildOneParagraphDocx } from "./helpers/docx-fixture"

function documentWith(runContent: string): Uint8Array {
  return buildOneParagraphDocx({
    documentXml: `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>before</w:t>${runContent}<w:t>after</w:t></w:r></w:p>
    <w:sectPr><w:pgSz w:w="11907" w:h="16839"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>`,
  })
}

function documentBodyWith(
  bodyContent: string,
  sectionContent = ""
): Uint8Array {
  return buildOneParagraphDocx({
    documentXml: `<?xml version="1.0" encoding="UTF-8"?>
<w:document
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"
  xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
  <w:body>
    ${bodyContent}
    <w:sectPr>${sectionContent}<w:pgSz w:w="11907" w:h="16839"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>`,
  })
}

function fallback(result: {
  diagnostics: readonly {
    code: string
    severity: string
    details?: Readonly<Record<string, unknown>>
  }[]
}) {
  return result.diagnostics.find(
    ({ code }) => code === "DOCX_UNSUPPORTED_FEATURE_FALLBACK"
  )
}

describe("unsupported-feature modes", () => {
  test("strict rejects a Word pagination hint that compatible and lenient ignore with a structured warning", () => {
    const bytes = documentWith("<w:lastRenderedPageBreak/>")

    const strict = parseDocx(bytes, { unsupportedFeatures: "strict" })
    expect(strict.ok).toBe(false)
    expect(strict.diagnostics.map(({ code }) => code)).toContain(
      "DOCX_CONTENT_LOSS"
    )

    for (const mode of ["compatible", "lenient"] as const) {
      const result = normaliseDocxBytes(bytes, { unsupportedFeatures: mode })
      expect(result.ok).toBe(true)
      expect(fallback(result)).toMatchObject({
        severity: "warning",
        details: {
          mode,
          feature: "lastRenderedPageBreak",
          fallback: "ignore-pagination-hint",
        },
      })
      expect(result.diagnostics.map(({ code }) => code)).not.toContain(
        "DOCX_CONTENT_LOSS"
      )
    }
  })

  test("only lenient permits the documented empty soft-hyphen replacement", () => {
    const bytes = documentWith("<w:softHyphen/>")

    for (const mode of ["strict", "compatible"] as const) {
      const result = parseDocx(bytes, { unsupportedFeatures: mode })
      expect(result.ok).toBe(false)
      expect(result.diagnostics.map(({ code }) => code)).toContain(
        "DOCX_CONTENT_LOSS"
      )
    }

    const lenient = normaliseDocxBytes(bytes, {
      unsupportedFeatures: "lenient",
    })
    expect(lenient.ok).toBe(true)
    expect(fallback(lenient)).toMatchObject({
      severity: "warning",
      details: {
        mode: "lenient",
        feature: "softHyphen",
        fallback: "empty-inline",
      },
    })
    if (!lenient.ok) return
    const paragraph = lenient.value.sections[0]?.blocks[0]
    expect(paragraph?.type).toBe("paragraph")
    if (paragraph?.type !== "paragraph") return
    expect(
      paragraph.children
        .filter((inline) => inline.type === "text")
        .map(({ text }) => text)
    ).toEqual(["before", "after"])
  })

  test("lenient still rejects unclassified meaningful content", () => {
    const result = parseDocx(documentWith('<w:sym w:char="F0B7"/>'), {
      unsupportedFeatures: "lenient",
    })
    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "DOCX_UNSUPPORTED_INLINE",
          severity: "error",
          details: { mode: "lenient", fallback: "none" },
        }),
        expect.objectContaining({
          code: "DOCX_CONTENT_LOSS",
          severity: "error",
        }),
      ])
    )
  })

  test("classifies each named unsupported content family with source-located fail-closed diagnostics", () => {
    const cases = [
      {
        feature: "textBoxes",
        body: "<w:p><w:r><w:pict><v:shape><v:textbox><w:txbxContent><w:p><w:r><w:t>Box</w:t></w:r></w:p></w:txbxContent></v:textbox></v:shape></w:pict></w:r></w:p>",
      },
      {
        feature: "wordArt",
        body: '<w:p><w:r><w:pict><v:shape><v:textpath string="Art"/></v:shape></w:pict></w:r></w:p>',
      },
      {
        feature: "smartArt",
        body: "<w:p><w:r><w:drawing><wp:inline><a:graphic><a:graphicData><dgm:relIds/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>",
      },
      {
        feature: "charts",
        body: "<w:p><w:r><w:drawing><wp:inline><a:graphic><a:graphicData><c:chart/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>",
      },
      {
        feature: "equations",
        body: "<w:p><m:oMath><m:r><m:t>x</m:t></m:r></m:oMath></w:p>",
      },
      {
        feature: "embeddedObjects",
        body: "<w:p><w:r><w:object><o:OLEObject/></w:object></w:r></w:p>",
      },
      {
        feature: "trackedChanges",
        body: "<w:p><w:ins><w:r><w:t>changed</w:t></w:r></w:ins></w:p>",
      },
      {
        feature: "comments",
        body: '<w:p><w:commentRangeStart w:id="0"/><w:r><w:t>commented</w:t></w:r><w:commentRangeEnd w:id="0"/></w:p>',
      },
      {
        feature: "footnotes",
        body: '<w:p><w:r><w:footnoteReference w:id="1"/></w:r></w:p>',
      },
      {
        feature: "endnotes",
        body: '<w:p><w:r><w:endnoteReference w:id="1"/></w:r></w:p>',
      },
    ] as const

    for (const fixture of cases) {
      const result = parseDocx(documentBodyWith(fixture.body), {
        unsupportedFeatures: "lenient",
      })
      expect(result.ok, fixture.feature).toBe(false)
      expect(result.diagnostics, fixture.feature).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: expect.stringMatching(/^DOCX_UNSUPPORTED_/u),
            severity: "error",
            source: expect.objectContaining({
              part: "word/document.xml",
              xmlPath: expect.stringContaining("/w:"),
            }),
            details: {
              mode: "lenient",
              fallback: "none",
              feature: fixture.feature,
            },
          }),
          expect.objectContaining({
            code: "DOCX_CONTENT_LOSS",
            severity: "error",
          }),
        ])
      )
    }
  })

  test("rejects true multi-column sections without rejecting the explicit one-column form", () => {
    const multiColumn = parseDocx(
      documentBodyWith(
        "<w:p><w:r><w:t>Columns</w:t></w:r></w:p>",
        '<w:cols w:num="2"/>'
      ),
      { unsupportedFeatures: "lenient" }
    )
    expect(multiColumn.ok).toBe(false)
    expect(multiColumn.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "DOCX_UNSUPPORTED_STYLE_PROPERTY",
          severity: "error",
          source: {
            part: "word/document.xml",
            xmlPath: "/w:document[1]/w:body[1]/w:sectPr[1]/w:cols[1]",
          },
          details: {
            mode: "lenient",
            fallback: "none",
            feature: "multiColumnSections",
          },
        }),
      ])
    )

    const oneColumn = normaliseDocxBytes(
      documentBodyWith(
        "<w:p><w:r><w:t>One column</w:t></w:r></w:p>",
        '<w:cols w:num="1"/>'
      )
    )
    expect(oneColumn.ok).toBe(true)
    expect(oneColumn.diagnostics).toEqual([])
  })
})
