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
})
