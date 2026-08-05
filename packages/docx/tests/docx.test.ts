import { describe, expect, test } from "bun:test"
import { strToU8, zipSync } from "fflate"

import { inspectDocx, normaliseDocxBytes, parseDocx } from "../src"
import { buildOneParagraphDocx } from "./helpers/docx-fixture"

function errorCodes(result: {
  readonly diagnostics: readonly { readonly code: string }[]
}): string[] {
  return result.diagnostics.map((entry) => entry.code)
}

describe("DOCX Phase 1 vertical slice", () => {
  test("validates, parses prefix-agnostic WordprocessingML, and normalises deterministic core nodes", () => {
    const bytes = buildOneParagraphDocx({
      documentXml: `<?xml version="1.0" encoding="UTF-8"?>
<d:document xmlns:d="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <d:body>
    <d:p><d:pPr><d:jc d:val="center"/></d:pPr><d:r><d:rPr><d:b/><d:sz d:val="24"/></d:rPr><d:t xml:space="preserve"> Hello </d:t></d:r><d:r><d:t>world</d:t></d:r></d:p>
    <d:sectPr><d:pgSz d:w="11907" d:h="16839"/><d:pgMar d:top="1440" d:right="1440" d:bottom="1440" d:left="1440"/></d:sectPr>
  </d:body>
</d:document>`,
    })

    const parsed = parseDocx(bytes)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(
      parsed.value.document.paragraphs[0]?.runs.flatMap((run) =>
        run.texts.map((text) => text.text)
      )
    ).toEqual([" Hello ", "world"])
    expect(
      parsed.value.document.paragraphs[0]?.runs[0]?.texts[0]?.preserveSpace
    ).toBe(true)

    const normalised = normaliseDocxBytes(bytes)
    expect(normalised.ok).toBe(true)
    if (!normalised.ok) return
    const paragraph = normalised.value.sections[0]?.blocks[0]
    expect(String(paragraph?.id)).toBe("docx:paragraph:1")
    expect(paragraph?.properties.alignment).toBe("center")
    expect(paragraph?.children.map((child) => String(child.id))).toEqual([
      "docx:text:1:1",
      "docx:text:1:2",
    ])
    expect(paragraph?.children.map((child) => child.text)).toEqual([
      " Hello ",
      "world",
    ])
    expect(paragraph?.children[0]?.style).toMatchObject({
      bold: true,
      fontSize: 240,
    })
    expect(paragraph?.source).toEqual({
      part: "word/document.xml",
      xmlPath: "/d:document[1]/d:body[1]/d:p[1]",
    })
  })

  test("enforces compressed-input, entry-count, and decompressed-size resource limits", () => {
    const bytes = buildOneParagraphDocx({
      extraParts: { "customXml/item1.xml": "x".repeat(300) },
    })
    expect(
      errorCodes(inspectDocx(bytes, { limits: { maxTemplateBytes: 1 } }))
    ).toContain("DOCX_TEMPLATE_SIZE_LIMIT")
    expect(
      errorCodes(inspectDocx(bytes, { limits: { maxArchiveEntries: 3 } }))
    ).toContain("DOCX_ARCHIVE_ENTRY_LIMIT")
    expect(
      errorCodes(inspectDocx(bytes, { limits: { maxDecompressedBytes: 10 } }))
    ).toContain("DOCX_DECOMPRESSED_SIZE_LIMIT")
  })

  test("rejects forbidden XML declarations and external relationships", () => {
    const declaredEntity = buildOneParagraphDocx({
      documentXml: `<!DOCTYPE document [<!ENTITY xxe "blocked">]><w:document xmlns:w="urn:test"><w:body><w:p><w:r><w:t>&xxe;</w:t></w:r></w:p></w:body></w:document>`,
    })
    expect(errorCodes(parseDocx(declaredEntity))).toContain(
      "DOCX_FORBIDDEN_XML_DECLARATION"
    )

    const externalRelationship = buildOneParagraphDocx({
      extraParts: {
        "word/_rels/document.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="urn:test" Target="https://example.invalid/image.png" TargetMode="External"/></Relationships>`,
      },
    })
    expect(errorCodes(parseDocx(externalRelationship))).toContain(
      "DOCX_EXTERNAL_RELATIONSHIP"
    )
  })

  test("rejects unsafe ZIP paths and missing officeDocument targets", () => {
    const unsafe = zipSync({
      "[Content_Types].xml": strToU8("<Types/>"),
      "_rels/.rels": strToU8("<Relationships/>"),
      "../word/document.xml": strToU8("<document/>"),
    })
    expect(errorCodes(parseDocx(unsafe))).toContain("DOCX_UNSAFE_PART_PATH")

    const missingTarget = buildOneParagraphDocx({
      rootRelationshipsXml: `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/missing.xml"/></Relationships>`,
    })
    expect(errorCodes(parseDocx(missingTarget))).toContain(
      "DOCX_MISSING_REQUIRED_PART"
    )
  })

  test("diagnoses unsupported meaningful content and honours aborts", () => {
    const table = buildOneParagraphDocx({
      documentXml: `<w:document xmlns:w="urn:test"><w:body><w:tbl><w:tr/></w:tbl></w:body></w:document>`,
    })
    expect(errorCodes(parseDocx(table))).toContain("DOCX_UNSUPPORTED_BLOCK")

    const controller = new AbortController()
    controller.abort()
    expect(() =>
      parseDocx(buildOneParagraphDocx(), { signal: controller.signal })
    ).toThrow()
  })
})
