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
    expect(paragraph?.children[0]?.preserveSpace).toBe(true)
    expect(paragraph?.children[1]?.preserveSpace).toBe(false)
    expect(paragraph?.children[0]?.style).toMatchObject({
      fontWeight: 700,
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

  test("bounds XML part text, node count, and nesting before parsing", () => {
    const bytes = buildOneParagraphDocx()
    expect(
      errorCodes(inspectDocx(bytes, { limits: { maxXmlTextBytes: 1 } }))
    ).toContain("DOCX_XML_TEXT_SIZE_LIMIT")
    expect(
      errorCodes(inspectDocx(bytes, { limits: { maxXmlNodes: 1 } }))
    ).toContain("DOCX_XML_NODE_LIMIT")

    const deep = buildOneParagraphDocx({
      documentXml: `<w:document xmlns:w="urn:test"><w:body><w:p><w:r><w:t><w:a><w:b>deep</w:b></w:a></w:t></w:r></w:p></w:body></w:document>`,
    })
    expect(
      errorCodes(inspectDocx(deep, { limits: { maxXmlDepth: 5 } }))
    ).toContain("DOCX_XML_DEPTH_LIMIT")
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

  test("resolves nested relationship parts from their owner and validates every internal target", () => {
    const validNested = buildOneParagraphDocx({
      extraParts: {
        "word/charts/chart1.xml": "<chart/>",
        "word/media/image.png": "image",
        "word/charts/_rels/chart1.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="urn:image" Target="../media/image.png"/></Relationships>`,
      },
    })
    expect(inspectDocx(validNested).ok).toBe(true)

    const encodedTarget = buildOneParagraphDocx({
      extraParts: {
        "word/media/my image.png": "image",
        "word/_rels/document.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="urn:image" Target="media/my%20image.png"/></Relationships>`,
      },
    })
    expect(inspectDocx(encodedTarget).ok).toBe(true)

    const missingNested = buildOneParagraphDocx({
      extraParts: {
        "word/charts/chart1.xml": "<chart/>",
        "word/charts/_rels/chart1.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="urn:image" Target="../media/missing.png"/></Relationships>`,
      },
    })
    expect(errorCodes(inspectDocx(missingNested))).toContain(
      "DOCX_MISSING_RELATIONSHIP_TARGET"
    )

    const traversal = buildOneParagraphDocx({
      extraParts: {
        "word/_rels/document.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="urn:test" Target="../../outside.xml"/></Relationships>`,
      },
    })
    expect(errorCodes(inspectDocx(traversal))).toContain(
      "DOCX_UNSAFE_RELATIONSHIP_TARGET"
    )

    const encodedTraversal = buildOneParagraphDocx({
      extraParts: {
        "word/_rels/document.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="urn:test" Target="%2e%2e/outside.xml"/></Relationships>`,
      },
    })
    expect(errorCodes(inspectDocx(encodedTraversal))).toContain(
      "DOCX_UNSAFE_RELATIONSHIP_TARGET"
    )
  })

  test("diagnoses unsupported meaningful content and honours aborts", () => {
    const table = buildOneParagraphDocx({
      documentXml: `<w:document xmlns:w="urn:test"><w:body><w:tbl><w:tr/></w:tbl></w:body></w:document>`,
    })
    expect(errorCodes(parseDocx(table))).toContain("DOCX_UNSUPPORTED_BLOCK")

    const inspectTable = inspectDocx(table, {
      unsupportedFeatures: "lenient",
    })
    expect(inspectTable.ok).toBe(true)
    expect(errorCodes(inspectTable)).toContain("DOCX_CONTENT_LOSS")
    expect(parseDocx(table, { unsupportedFeatures: "lenient" }).ok).toBe(false)

    const inline = buildOneParagraphDocx({
      documentXml: `<w:document xmlns:w="urn:test"><w:body><w:p><w:r><w:t>before</w:t><w:tab/><w:br/><w:drawing/></w:r></w:p><w:altChunk/></w:body></w:document>`,
    })
    const inlineCodes = errorCodes(parseDocx(inline))
    expect(inlineCodes).toContain("DOCX_UNSUPPORTED_INLINE")
    expect(inlineCodes).toContain("DOCX_UNSUPPORTED_BLOCK")
    expect(inlineCodes).toContain("DOCX_CONTENT_LOSS")

    const controller = new AbortController()
    controller.abort()
    expect(() =>
      parseDocx(buildOneParagraphDocx(), { signal: controller.signal })
    ).toThrow()
  })
})

const STYLES_RELATIONSHIP =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"

function withStyles(
  stylesXml: string,
  target = "config/document-styles.xml"
): Readonly<Record<string, string>> {
  return {
    "word/_rels/document.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rStyles" Type="${STYLES_RELATIONSHIP}" Target="${target}"/></Relationships>`,
    [`word/${target}`]: stylesXml,
  }
}

describe("DOCX Phase 3 style resolution", () => {
  test("keeps current defaults when the main document has no styles relationship", () => {
    const result = normaliseDocxBytes(buildOneParagraphDocx())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const style = result.value.sections[0]?.blocks[0]?.children[0]?.style
    expect(style).toMatchObject({
      fontFamily: "Calibri",
      fontWeight: 400,
      fontStyle: "normal",
      underline: false,
      color: "#000000",
    })
    expect(Number(style?.fontSize)).toBe(220)
  })

  test("applies relationship-owned default paragraph and character styles when style references are absent", () => {
    const result = normaliseDocxBytes(
      buildOneParagraphDocx({
        extraParts: withStyles(`<w:styles xmlns:w="urn:test">
          <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:pPr><w:spacing w:after="60"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>
          <w:style w:type="character" w:default="1" w:styleId="DefaultCharacter"><w:rPr><w:i/><w:color w:val="123456"/></w:rPr></w:style>
        </w:styles>`),
      })
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const paragraph = result.value.sections[0]?.blocks[0]
    expect(Number(paragraph?.properties.spacingAfter)).toBe(60)
    expect(paragraph?.children[0]?.style).toMatchObject({
      fontWeight: 700,
      fontStyle: "italic",
      color: "#123456",
    })
  })

  test("loads a relationship-owned styles part and resolves multi-level paragraph inheritance", () => {
    const bytes = buildOneParagraphDocx({
      documentXml: `<w:document xmlns:w="urn:test"><w:body><w:p><w:pPr><w:pStyle w:val="Leaf"/><w:spacing w:before="0"/></w:pPr><w:r><w:t>styled</w:t></w:r></w:p></w:body></w:document>`,
      extraParts: withStyles(`<w:styles xmlns:w="urn:test">
        <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Aptos"/><w:sz w:val="20"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80"/></w:pPr></w:pPrDefault></w:docDefaults>
        <w:style w:type="paragraph" w:styleId="Base"><w:pPr><w:jc w:val="right"/><w:spacing w:before="120"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>
        <w:style w:type="paragraph" w:styleId="Middle"><w:basedOn w:val="Base"/><w:pPr><w:keepNext/></w:pPr><w:rPr><w:i/></w:rPr></w:style>
        <w:style w:type="paragraph" w:styleId="Leaf"><w:basedOn w:val="Middle"/><w:pPr><w:jc w:val="center"/></w:pPr></w:style>
      </w:styles>`),
    })
    const result = normaliseDocxBytes(bytes)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const paragraph = result.value.sections[0]?.blocks[0]
    expect(paragraph?.properties).toMatchObject({
      alignment: "center",
      spacingBefore: 0,
      spacingAfter: 80,
      keepWithNext: true,
    })
    expect(paragraph?.children[0]?.style).toMatchObject({
      fontFamily: "Aptos",
      fontSize: 200,
      fontWeight: 700,
      fontStyle: "italic",
    })
  })

  test("applies character styles then direct run overrides, retaining explicit false and zero", () => {
    const bytes = buildOneParagraphDocx({
      documentXml: `<w:document xmlns:w="urn:test"><w:body><w:p><w:pPr><w:pStyle w:val="Body"/></w:pPr><w:r><w:rPr><w:rStyle w:val="Emphasis"/><w:rFonts w:ascii="Direct"/><w:b w:val="false"/><w:i w:val="0"/><w:u w:val="none"/><w:color w:val="00FF00"/><w:sz w:val="0"/></w:rPr><w:t>x</w:t></w:r></w:p></w:body></w:document>`,
      extraParts: withStyles(`<w:styles xmlns:w="urn:test">
        <w:style w:type="paragraph" w:styleId="Body"><w:rPr><w:rFonts w:ascii="Paragraph"/><w:b/><w:i/><w:u w:val="single"/><w:color w:val="FF0000"/><w:sz w:val="30"/></w:rPr></w:style>
        <w:style w:type="character" w:styleId="Strong"><w:rPr><w:color w:val="0000FF"/><w:b/></w:rPr></w:style>
        <w:style w:type="character" w:styleId="Emphasis"><w:basedOn w:val="Strong"/><w:rPr><w:rFonts w:ascii="Character"/></w:rPr></w:style>
      </w:styles>`),
    })
    const result = normaliseDocxBytes(bytes)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const style = result.value.sections[0]?.blocks[0]?.children[0]?.style
    expect(style).toMatchObject({
      fontFamily: "Direct",
      fontWeight: 400,
      fontStyle: "normal",
      underline: false,
      color: "#00FF00",
    })
    expect(Number(style?.fontSize)).toBe(0)
  })

  test("diagnoses cycles, missing parents, and unknown direct style references at their sources", () => {
    const cycle = parseDocx(
      buildOneParagraphDocx({
        extraParts: withStyles(
          `<w:styles xmlns:w="urn:test"><w:style w:type="paragraph" w:styleId="A"><w:basedOn w:val="B"/></w:style><w:style w:type="paragraph" w:styleId="B"><w:basedOn w:val="A"/></w:style></w:styles>`
        ),
      })
    )
    expect(errorCodes(cycle)).toContain("DOCX_STYLE_CYCLE")
    expect(
      cycle.diagnostics.find((entry) => entry.code === "DOCX_STYLE_CYCLE")
        ?.source?.part
    ).toBe("word/config/document-styles.xml")

    const missing = parseDocx(
      buildOneParagraphDocx({
        documentXml: `<w:document xmlns:w="urn:test"><w:body><w:p><w:pPr><w:pStyle w:val="Unknown"/></w:pPr><w:r><w:t>x</w:t></w:r></w:p></w:body></w:document>`,
        extraParts: withStyles(
          `<w:styles xmlns:w="urn:test"><w:style w:type="paragraph" w:styleId="Child"><w:basedOn w:val="Missing"/></w:style></w:styles>`
        ),
      })
    )
    expect(errorCodes(missing)).toContain("DOCX_MISSING_STYLE_PARENT")
    expect(errorCodes(missing)).toContain("DOCX_UNKNOWN_STYLE")
  })

  test("normalises logical and legacy indentation plus auto, exact, and atLeast line rules", () => {
    const bytes = buildOneParagraphDocx({
      documentXml: `<w:document xmlns:w="urn:test"><w:body>
        <w:p><w:pPr><w:ind w:start="720" w:left="360" w:end="240" w:right="120" w:firstLine="180" w:hanging="90"/><w:spacing w:line="360" w:lineRule="auto"/></w:pPr><w:r><w:t>a</w:t></w:r></w:p>
        <w:p><w:pPr><w:ind w:left="300" w:right="200" w:hanging="100"/><w:spacing w:line="280" w:lineRule="exact"/></w:pPr><w:r><w:t>b</w:t></w:r></w:p>
        <w:p><w:pPr><w:spacing w:line="320" w:lineRule="atLeast"/></w:pPr><w:r><w:t>c</w:t></w:r></w:p>
      </w:body></w:document>`,
    })
    const result = normaliseDocxBytes(bytes)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const blocks = result.value.sections[0]?.blocks
    expect(blocks?.[0]?.properties).toMatchObject({
      indentStart: 720,
      indentEnd: 240,
      firstLineIndent: 180,
      lineSpacing: { rule: "auto", value240ths: 360 },
    })
    expect(blocks?.[1]?.properties).toMatchObject({
      indentStart: 300,
      indentEnd: 200,
      firstLineIndent: -100,
      lineSpacing: { rule: "exact", value: 280 },
    })
    expect(blocks?.[2]?.properties.lineSpacing?.rule).toBe("atLeast")
    const thirdLineSpacing = blocks?.[2]?.properties.lineSpacing
    expect(
      thirdLineSpacing?.rule === "atLeast"
        ? Number(thirdLineSpacing.value)
        : undefined
    ).toBe(320)
    expect(
      errorCodes(result).filter((code) => code === "DOCX_INDENT_CONFLICT")
    ).toHaveLength(3)
  })

  test("fails rather than dropping meaningful unsupported style properties", () => {
    const result = parseDocx(
      buildOneParagraphDocx({
        documentXml: `<w:document xmlns:w="urn:test"><w:body><w:p><w:r><w:rPr><w:strike/></w:rPr><w:t>x</w:t></w:r></w:p></w:body></w:document>`,
      })
    )
    expect(errorCodes(result)).toContain("DOCX_UNSUPPORTED_STYLE_PROPERTY")
    expect(errorCodes(result)).toContain("DOCX_CONTENT_LOSS")
  })
})

const NUMBERING_RELATIONSHIP =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering"

function withNumbering(
  numberingXml: string,
  target = "config/lists.xml",
  otherRelationships = ""
): Readonly<Record<string, string>> {
  return {
    "word/_rels/document.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rNumbering" Type="${NUMBERING_RELATIONSHIP}" Target="${target}"/>${otherRelationships}</Relationships>`,
    [`word/${target}`]: numberingXml,
  }
}

describe("DOCX Phase 4 numbering and widow control", () => {
  test("normalises deterministic multilevel definitions, supported formats, continuation, legal numbering, and overrides", () => {
    const levels = [
      ["bullet", "•"],
      ["decimal", "%1."],
      ["lowerLetter", "%3)"],
      ["upperLetter", "%4)"],
      ["lowerRoman", "%5."],
      ["upperRoman", "%6."],
    ]
      .map(
        ([format, text], level) =>
          `<w:lvl w:ilvl="${level}"><w:start w:val="${level + 1}"/><w:numFmt w:val="${format}"/><w:lvlText w:val="${text}"/><w:suff w:val="${level === 0 ? "space" : "tab"}"/><w:lvlJc w:val="${level === 2 ? "center" : "left"}"/><w:pPr><w:ind w:start="${720 + level * 120}" w:left="1" w:hanging="360"/></w:pPr>${level === 1 ? "<w:lvlRestart w:val=\"0\"/><w:isLgl/>" : ""}</w:lvl>`
      )
      .join("")
    const bytes = buildOneParagraphDocx({
      documentXml: `<w:document xmlns:w="urn:test"><w:body>
        <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="12"/></w:numPr></w:pPr><w:r><w:t>a</w:t></w:r></w:p>
        <w:p><w:pPr><w:numPr><w:numId w:val="12"/></w:numPr></w:pPr><w:r><w:t>b</w:t></w:r></w:p>
        <w:p><w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="12"/></w:numPr></w:pPr><w:r><w:t>c</w:t></w:r></w:p>
      </w:body></w:document>`,
      extraParts: withNumbering(`<w:numbering xmlns:w="urn:test"><w:abstractNum w:abstractNumId="4">${levels}</w:abstractNum><w:num w:numId="12"><w:abstractNumId w:val="4"/><w:lvlOverride w:ilvl="1"><w:startOverride w:val="9"/></w:lvlOverride></w:num></w:numbering>`),
    })
    const result = normaliseDocxBytes(bytes)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.numberingDefinitions).toHaveLength(1)
    expect(result.value.numberingDefinitions[0]?.id).toBe("docx-num-12")
    expect(result.value.numberingDefinitions[0]?.levels.map((level) => level.format)).toEqual([
      "bullet",
      "decimal",
      "lowerLetter",
      "upperLetter",
      "lowerRoman",
      "upperRoman",
    ])
    expect(result.value.numberingDefinitions[0]?.levels[1]).toMatchObject({
      startAt: 9,
      legal: true,
      restartAfterLevel: null,
    })
    expect(Number(result.value.numberingDefinitions[0]?.levels[0]?.indentStart)).toBe(720)
    expect(Number(result.value.numberingDefinitions[0]?.levels[0]?.firstLineIndent)).toBe(-360)
    expect(result.value.sections[0]?.blocks.map((block) => block.properties.numbering)).toEqual([
      { definitionId: "docx-num-12", level: 0 },
      { definitionId: "docx-num-12", level: 0 },
      { definitionId: "docx-num-12", level: 1 },
    ])
    expect(errorCodes(result)).toContain("DOCX_INDENT_CONFLICT")
  })

  test("resolves style numbering and widow control cascades while direct numId zero removes numbering", () => {
    const styles = `<w:styles xmlns:w="urn:test"><w:docDefaults><w:pPrDefault><w:pPr><w:widowControl w:val="false"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:styleId="Base"><w:pPr><w:numPr><w:ilvl w:val="2"/><w:numId w:val="7"/></w:numPr><w:widowControl/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Leaf"><w:basedOn w:val="Base"/></w:style></w:styles>`
    const styleRelationship = `<Relationship Id="rStyles" Type="${STYLES_RELATIONSHIP}" Target="config/styles.xml"/>`
    const parts = withNumbering(
      `<w:numbering xmlns:w="urn:test"><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="2"><w:numFmt w:val="decimal"/><w:lvlText w:val="%3."/><w:pPr><w:ind w:start="500"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="7"><w:abstractNumId w:val="1"/></w:num></w:numbering>`,
      "config/lists.xml",
      styleRelationship
    )
    const bytes = buildOneParagraphDocx({
      documentXml: `<w:document xmlns:w="urn:test"><w:body>
        <w:p><w:pPr><w:pStyle w:val="Leaf"/><w:ind w:start="900"/><w:widowControl w:val="false"/></w:pPr><w:r><w:t>one</w:t></w:r></w:p>
        <w:p><w:pPr><w:pStyle w:val="Leaf"/><w:numPr><w:numId w:val="0"/></w:numPr></w:pPr><w:r><w:t>two</w:t></w:r></w:p>
        <w:p><w:r><w:t>three</w:t></w:r></w:p>
      </w:body></w:document>`,
      extraParts: { ...parts, "word/config/styles.xml": styles },
    })
    const result = normaliseDocxBytes(bytes)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const blocks = result.value.sections[0]?.blocks
    expect(blocks?.[0]?.properties).toMatchObject({
      numbering: { definitionId: "docx-num-7", level: 2 },
      widowControl: false,
      indentStart: 900,
    })
    expect(blocks?.[1]?.properties.numbering).toBeNull()
    expect(blocks?.[1]?.properties.widowControl).toBe(true)
    expect(blocks?.[2]?.properties.widowControl).toBe(false)
    expect(Number(result.value.numberingDefinitions[0]?.levels[0]?.indentStart)).toBe(500)
  })

  test("reports missing relationships, references, levels, malformed values, and unsupported formats with source locations", () => {
    const missingRelationship = parseDocx(
      buildOneParagraphDocx({
        documentXml: `<w:document xmlns:w="urn:test"><w:body><w:p><w:pPr><w:numPr><w:numId w:val="3"/></w:numPr></w:pPr></w:p></w:body></w:document>`,
      })
    )
    expect(errorCodes(missingRelationship)).toContain("DOCX_MISSING_NUMBERING_REFERENCE")
    const malformed = parseDocx(
      buildOneParagraphDocx({
        extraParts: withNumbering(`<w:numbering xmlns:w="urn:test"><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="9"><w:numFmt w:val="ordinal"/><w:lvlText w:val="%10"/></w:lvl><w:lvl w:ilvl="0"><w:numFmt w:val="ordinal"/><w:lvlText w:val="%10"/></w:lvl></w:abstractNum><w:num w:numId="2"><w:abstractNumId w:val="99"/></w:num></w:numbering>`),
      })
    )
    expect(errorCodes(malformed)).toContain("DOCX_INVALID_NUMBERING_LEVEL")
    expect(errorCodes(malformed)).toContain("DOCX_UNSUPPORTED_NUMBERING_FORMAT")
    expect(errorCodes(malformed)).toContain("DOCX_MISSING_NUMBERING_REFERENCE")
    expect(errorCodes(malformed)).toContain("DOCX_CONTENT_LOSS")
    expect(malformed.diagnostics.find((entry) => entry.code === "DOCX_UNSUPPORTED_NUMBERING_FORMAT")?.source?.part).toBe("word/config/lists.xml")
  })
})
