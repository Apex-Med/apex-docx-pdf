import { describe, expect, test } from "bun:test"
import { strToU8, zipSync, zlibSync } from "fflate"
import type {
  SemanticBlock,
  SemanticInline,
  SemanticParagraph,
  SemanticText,
} from "@apexmed/core"

import {
  inspectDocx,
  normaliseDocxBytes,
  parseDocx,
  serializeDocx,
} from "../src"
import { buildOneParagraphDocx } from "./helpers/docx-fixture"

function errorCodes(result: {
  readonly diagnostics: readonly { readonly code: string }[]
}): string[] {
  return result.diagnostics.map((entry) => entry.code)
}

function paragraphBlock(
  block: SemanticBlock | undefined
): SemanticParagraph | undefined {
  return block?.type === "paragraph" ? block : undefined
}

function paragraphBlocks(
  blocks: readonly SemanticBlock[] | undefined
): readonly SemanticParagraph[] {
  return (
    blocks?.filter(
      (block): block is SemanticParagraph => block.type === "paragraph"
    ) ?? []
  )
}

function textInline(
  inline: SemanticInline | undefined
): SemanticText | undefined {
  return inline?.type === "text" ? inline : undefined
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
    const paragraph = paragraphBlock(normalised.value.sections[0]?.blocks[0])
    expect(String(paragraph?.id)).toBe("docx:paragraph:1")
    expect(paragraph?.properties.alignment).toBe("center")
    expect(paragraph?.children.map((child) => String(child.id))).toEqual([
      "docx:text:1:1",
      "docx:text:1:2",
    ])
    expect(
      paragraph?.children
        .filter((child) => child.type === "text")
        .map((child) => child.text)
    ).toEqual([" Hello ", "world"])
    expect(textInline(paragraph?.children[0])?.preserveSpace).toBe(true)
    expect(textInline(paragraph?.children[1])?.preserveSpace).toBe(false)
    expect(textInline(paragraph?.children[0])?.style).toMatchObject({
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
    expect(errorCodes(parseDocx(table))).toContain("DOCX_INVALID_TABLE")

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
    const style =
      paragraphBlock(result.value.sections[0]?.blocks[0]) === undefined
        ? undefined
        : textInline(
            paragraphBlock(result.value.sections[0]?.blocks[0])?.children[0]
          )?.style
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
    const paragraph = paragraphBlock(result.value.sections[0]?.blocks[0])
    expect(Number(paragraph?.properties.spacingAfter)).toBe(60)
    expect(textInline(paragraph?.children[0])?.style).toMatchObject({
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
    const paragraph = paragraphBlock(result.value.sections[0]?.blocks[0])
    expect(paragraph?.properties).toMatchObject({
      alignment: "center",
      spacingBefore: 0,
      spacingAfter: 80,
      keepWithNext: true,
    })
    expect(textInline(paragraph?.children[0])?.style).toMatchObject({
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
    const style =
      paragraphBlock(result.value.sections[0]?.blocks[0]) === undefined
        ? undefined
        : textInline(
            paragraphBlock(result.value.sections[0]?.blocks[0])?.children[0]
          )?.style
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
    const blocks = paragraphBlocks(result.value.sections[0]?.blocks)
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
        documentXml: `<w:document xmlns:w="urn:test"><w:body><w:p><w:r><w:rPr><w:smallCaps/></w:rPr><w:t>x</w:t></w:r></w:p></w:body></w:document>`,
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
          `<w:lvl w:ilvl="${level}"><w:start w:val="${level + 1}"/><w:numFmt w:val="${format}"/><w:lvlText w:val="${text}"/><w:suff w:val="${level === 0 ? "space" : "tab"}"/><w:lvlJc w:val="${level === 2 ? "center" : "left"}"/><w:pPr><w:ind w:start="${720 + level * 120}" w:left="1" w:hanging="360"/></w:pPr>${level === 1 ? '<w:lvlRestart w:val="0"/><w:isLgl/>' : ""}</w:lvl>`
      )
      .join("")
    const bytes = buildOneParagraphDocx({
      documentXml: `<w:document xmlns:w="urn:test"><w:body>
        <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="12"/></w:numPr></w:pPr><w:r><w:t>a</w:t></w:r></w:p>
        <w:p><w:pPr><w:numPr><w:numId w:val="12"/></w:numPr></w:pPr><w:r><w:t>b</w:t></w:r></w:p>
        <w:p><w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="12"/></w:numPr></w:pPr><w:r><w:t>c</w:t></w:r></w:p>
      </w:body></w:document>`,
      extraParts: withNumbering(
        `<w:numbering xmlns:w="urn:test"><w:abstractNum w:abstractNumId="4">${levels}</w:abstractNum><w:num w:numId="12"><w:abstractNumId w:val="4"/><w:lvlOverride w:ilvl="1"><w:startOverride w:val="9"/></w:lvlOverride></w:num></w:numbering>`
      ),
    })
    const result = normaliseDocxBytes(bytes)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.numberingDefinitions).toHaveLength(1)
    expect(result.value.numberingDefinitions[0]?.id).toBe("docx-num-12")
    expect(
      result.value.numberingDefinitions[0]?.levels.map((level) => level.format)
    ).toEqual([
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
    expect(
      Number(result.value.numberingDefinitions[0]?.levels[0]?.indentStart)
    ).toBe(720)
    expect(
      Number(result.value.numberingDefinitions[0]?.levels[0]?.firstLineIndent)
    ).toBe(-360)
    expect(
      paragraphBlocks(result.value.sections[0]?.blocks).map(
        (block) => block.properties.numbering
      )
    ).toEqual([
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
    const blocks = paragraphBlocks(result.value.sections[0]?.blocks)
    expect(blocks?.[0]?.properties).toMatchObject({
      numbering: { definitionId: "docx-num-7", level: 2 },
      widowControl: false,
      indentStart: 900,
    })
    expect(blocks?.[1]?.properties.numbering).toBeNull()
    expect(blocks?.[1]?.properties.widowControl).toBe(true)
    expect(blocks?.[2]?.properties.widowControl).toBe(false)
    expect(
      Number(result.value.numberingDefinitions[0]?.levels[0]?.indentStart)
    ).toBe(500)
  })

  test("reports missing relationships, references, levels, malformed values, and unsupported formats with source locations", () => {
    const missingRelationship = parseDocx(
      buildOneParagraphDocx({
        documentXml: `<w:document xmlns:w="urn:test"><w:body><w:p><w:pPr><w:numPr><w:numId w:val="3"/></w:numPr></w:pPr></w:p></w:body></w:document>`,
      })
    )
    expect(errorCodes(missingRelationship)).toContain(
      "DOCX_MISSING_NUMBERING_RELATIONSHIP"
    )
    const malformed = parseDocx(
      buildOneParagraphDocx({
        extraParts: withNumbering(
          `<w:numbering xmlns:w="urn:test"><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="9"><w:numFmt w:val="ordinal"/><w:lvlText w:val="%10"/></w:lvl><w:lvl w:ilvl="0"><w:numFmt w:val="ordinal"/><w:lvlText w:val="%10"/></w:lvl></w:abstractNum><w:num w:numId="2"><w:abstractNumId w:val="99"/></w:num></w:numbering>`
        ),
      })
    )
    expect(errorCodes(malformed)).toContain("DOCX_INVALID_NUMBERING_LEVEL")
    expect(errorCodes(malformed)).toContain("DOCX_UNSUPPORTED_NUMBERING_FORMAT")
    expect(errorCodes(malformed)).toContain("DOCX_MISSING_NUMBERING_REFERENCE")
    expect(errorCodes(malformed)).toContain("DOCX_CONTENT_LOSS")
    expect(
      malformed.diagnostics.find(
        (entry) => entry.code === "DOCX_UNSUPPORTED_NUMBERING_FORMAT"
      )?.source?.part
    ).toBe("word/config/lists.xml")

    const zeroStart = normaliseDocxBytes(
      buildOneParagraphDocx({
        extraParts: withNumbering(
          `<w:numbering xmlns:w="urn:test"><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:start w:val="0"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="2"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="0"/></w:lvlOverride></w:num></w:numbering>`
        ),
      })
    )
    expect(zeroStart.ok).toBe(true)
    if (!zeroStart.ok) return
    expect(zeroStart.value.numberingDefinitions[0]?.levels[0]?.startAt).toBe(0)
  })
})

describe("DOCX Phase 5 semantic tables", () => {
  test("normalises grid widths, borders, padding, merges, headers, and row pagination metadata", () => {
    const result = normaliseDocxBytes(
      buildOneParagraphDocx({
        documentXml: `<w:document xmlns:w="urn:test"><w:body>
          <w:tbl>
            <w:tblPr>
              <w:tblW w:w="4500" w:type="dxa"/><w:tblLayout w:type="fixed"/>
              <w:tblBorders>
                <w:top w:val="single" w:sz="8" w:space="1" w:color="112233"/>
                <w:right w:val="double" w:sz="12" w:color="445566"/>
                <w:bottom w:val="dotted" w:sz="4"/><w:left w:val="dashed" w:sz="6"/>
                <w:insideH w:val="none"/><w:insideV w:val="single" w:sz="2"/>
              </w:tblBorders>
              <w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:end w:w="120" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:start w:w="140" w:type="dxa"/></w:tblCellMar>
            </w:tblPr>
            <w:tblGrid><w:gridCol w:w="1000"/><w:gridCol w:w="2000"/><w:gridCol w:w="1500"/></w:tblGrid>
            <w:tr><w:trPr><w:tblHeader/><w:trHeight w:val="480" w:hRule="exact"/></w:trPr>
              <w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/><w:gridSpan w:val="2"/><w:shd w:val="clear" w:color="auto" w:fill="ABCDEF"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:r><w:t>Header</w:t></w:r></w:p></w:tc>
              <w:tc><w:tcPr><w:tcW w:w="1500" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>Value</w:t></w:r></w:p></w:tc>
            </w:tr>
            <w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="360" w:hRule="atLeast"/></w:trPr>
              <w:tc><w:tcPr><w:gridSpan w:val="2"/><w:vMerge w:val="restart"/></w:tcPr><w:p><w:r><w:t>Body start</w:t></w:r></w:p></w:tc>
              <w:tc><w:p><w:r><w:t>Body</w:t></w:r></w:p></w:tc>
            </w:tr>
            <w:tr>
              <w:tc><w:tcPr><w:gridSpan w:val="2"/><w:vMerge/></w:tcPr><w:p><w:r><w:t>continued</w:t></w:r></w:p></w:tc>
              <w:tc><w:p><w:r><w:t>Tail</w:t></w:r></w:p></w:tc>
            </w:tr>
          </w:tbl>
        </w:body></w:document>`,
      })
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const table = result.value.sections[0]?.blocks[0]
    expect(table?.type).toBe("table")
    if (table?.type !== "table") return
    expect(Number(table.width)).toBe(4500)
    expect(table.layout).toBe("fixed")
    expect(Number(table.preferredWidth)).toBe(4500)
    expect(table.columnWidths.map(Number)).toEqual([1000, 2000, 1500])
    expect({
      top: Number(table.cellPadding.top),
      right: Number(table.cellPadding.right),
      bottom: Number(table.cellPadding.bottom),
      left: Number(table.cellPadding.left),
    }).toEqual({
      top: 80,
      right: 120,
      bottom: 100,
      left: 140,
    })
    expect({
      ...table.borders.top,
      width: Number(table.borders.top?.width),
      space: Number(table.borders.top?.space),
    }).toMatchObject({
      style: "single",
      color: "#112233",
      width: 20,
      space: 20,
    })
    expect(Number(table.borders.right?.width)).toBe(30)
    expect(table.repeatHeaderRowCount).toBe(1)
    expect(table.rows.map((row) => row.repeatAsHeader)).toEqual([
      true,
      false,
      false,
    ])
    expect(table.rows.map((row) => row.allowBreakAcrossPages)).toEqual([
      true,
      false,
      true,
    ])
    expect(table.rows.map((row) => row.height?.rule)).toEqual([
      "exact",
      "atLeast",
      undefined,
    ])
    expect(
      table.rows.map((row) =>
        row.height === null ? null : Number(row.height.value)
      )
    ).toEqual([480, 360, null])
    expect(table.rows[0]?.cells[0]).toMatchObject({
      columnIndex: 0,
      width: 3000,
      columnSpan: 2,
      verticalMerge: "none",
      verticalAlignment: "center",
      fillColor: "#ABCDEF",
    })
    expect(Number(table.rows[0]?.cells[0]?.preferredWidth)).toBe(3000)
    expect(table.rows[1]?.cells[0]?.verticalMerge).toBe("restart")
    expect(table.rows[2]?.cells[0]?.verticalMerge).toBe("continue")
    expect(
      textInline(table.rows[0]?.cells[0]?.blocks[0]?.children[0])?.text
    ).toBe("Header")
    expect(table.rows[0]?.source.xmlPath).toContain("/w:tbl[1]/w:tr[1]")
  })

  test("uses the grid sum for auto width and retains the parsed block order", () => {
    const result = parseDocx(
      buildOneParagraphDocx({
        documentXml: `<w:document xmlns:w="urn:test"><w:body>
          <w:p><w:r><w:t>Before</w:t></w:r></w:p>
          <w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid><w:gridCol w:w="900"/></w:tblGrid><w:tr><w:tc><w:p/></w:tc></w:tr></w:tbl>
          <w:p><w:r><w:t>After</w:t></w:r></w:p>
        </w:body></w:document>`,
      })
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.document.blocks.map((block) => block.type)).toEqual([
      "docx-paragraph",
      "docx-table",
      "docx-paragraph",
    ])
    const table = result.value.document.blocks[1]
    expect(table?.type).toBe("docx-table")
    if (table?.type === "docx-table") {
      expect(table.width).toBe(900)
      expect(table.cellPadding).toEqual({
        top: 0,
        right: 115,
        bottom: 0,
        left: 115,
      })
    }
    expect(result.value.document.paragraphs).toHaveLength(2)
  })

  test("rejects malformed, unsupported, and ambiguous table constructs without silent loss", () => {
    const result = parseDocx(
      buildOneParagraphDocx({
        documentXml: `<w:document xmlns:w="urn:test"><w:body>
          <w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblStyle w:val="Fancy"/></w:tblPr>
            <w:tblGrid><w:gridCol w:w="1000"/></w:tblGrid>
            <w:tr><w:trPr><w:trHeight w:val="12" w:hRule="auto"/></w:trPr><w:tc><w:tcPr><w:gridSpan w:val="0"/><w:vMerge/><w:shd w:val="pct20" w:themeFill="accent1"/><w:vAlign w:val="both"/></w:tcPr><w:p/></w:tc></w:tr>
            <w:tr><w:trPr><w:tblHeader/></w:trPr><w:tc><w:p/></w:tc></w:tr>
          </w:tbl>
        </w:body></w:document>`,
      })
    )
    expect(result.ok).toBe(false)
    expect(errorCodes(result)).toContain("DOCX_UNSUPPORTED_TABLE_PROPERTY")
    expect(errorCodes(result)).toContain("DOCX_INVALID_TABLE_VALUE")
    expect(errorCodes(result)).toContain("DOCX_AMBIGUOUS_TABLE")
    expect(errorCodes(result)).toContain("DOCX_CONTENT_LOSS")
    expect(
      result.diagnostics.find((entry) => entry.code === "DOCX_AMBIGUOUS_TABLE")
        ?.source?.xmlPath
    ).toContain("w:vMerge")

    const missingGrid = parseDocx(
      buildOneParagraphDocx({
        documentXml: `<w:document xmlns:w="urn:test"><w:body><w:tbl><w:tr><w:tc><w:p/></w:tc></w:tr></w:tbl></w:body></w:document>`,
      })
    )
    expect(errorCodes(missingGrid)).toContain("DOCX_INVALID_TABLE")
    expect(errorCodes(missingGrid)).toContain("DOCX_CONTENT_LOSS")

    const mismatchedWidth = parseDocx(
      buildOneParagraphDocx({
        documentXml: `<w:document xmlns:w="urn:test"><w:body><w:tbl><w:tblPr><w:tblW w:w="1200" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="1000"/></w:tblGrid><w:tr><w:tc><w:p/></w:tc></w:tr></w:tbl></w:body></w:document>`,
      })
    )
    expect(errorCodes(mismatchedWidth)).toContain("DOCX_AMBIGUOUS_TABLE")
    expect(errorCodes(mismatchedWidth)).toContain("DOCX_CONTENT_LOSS")

    const headerBodyMerge = parseDocx(
      buildOneParagraphDocx({
        documentXml: `<w:document xmlns:w="urn:test"><w:body><w:tbl><w:tblGrid><w:gridCol w:w="1000"/></w:tblGrid><w:tr><w:trPr><w:tblHeader/></w:trPr><w:tc><w:tcPr><w:vMerge w:val="restart"/></w:tcPr><w:p/></w:tc></w:tr><w:tr><w:tc><w:tcPr><w:vMerge/></w:tcPr><w:p/></w:tc></w:tr></w:tbl></w:body></w:document>`,
      })
    )
    expect(errorCodes(headerBodyMerge)).toContain("DOCX_AMBIGUOUS_TABLE")
    expect(
      headerBodyMerge.diagnostics.find(
        (entry) =>
          entry.code === "DOCX_AMBIGUOUS_TABLE" &&
          entry.message.includes("repeating-header")
      )?.source?.xmlPath
    ).toContain("w:vMerge")

    const unsupportedSolidShading = parseDocx(
      buildOneParagraphDocx({
        documentXml: `<w:document xmlns:w="urn:test"><w:body><w:tbl><w:tblGrid><w:gridCol w:w="1000"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:shd w:val="solid" w:color="00FF00" w:fill="FF0000"/></w:tcPr><w:p/></w:tc></w:tr></w:tbl></w:body></w:document>`,
      })
    )
    expect(errorCodes(unsupportedSolidShading)).toContain(
      "DOCX_UNSUPPORTED_TABLE_PROPERTY"
    )

    const malformedLegacyMargin = parseDocx(
      buildOneParagraphDocx({
        documentXml: `<w:document xmlns:w="urn:test"><w:body><w:tbl><w:tblPr><w:tblCellMar><w:right w:w="bad" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="1000"/></w:tblGrid><w:tr><w:tc><w:p/></w:tc></w:tr></w:tbl></w:body></w:document>`,
      })
    )
    expect(
      malformedLegacyMargin.diagnostics.find(
        (entry) => entry.code === "DOCX_INVALID_TABLE_VALUE"
      )?.source?.xmlPath
    ).toContain("w:right")
  })
})

function testCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1)
      crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = strToU8(type)
  const result = new Uint8Array(data.length + 12)
  const view = new DataView(result.buffer)
  view.setUint32(0, data.length)
  result.set(typeBytes, 4)
  result.set(data, 8)
  const crcInput = new Uint8Array(typeBytes.length + data.length)
  crcInput.set(typeBytes)
  crcInput.set(data, typeBytes.length)
  view.setUint32(result.length - 4, testCrc32(crcInput))
  return result
}

function testPng3x2(): Uint8Array {
  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, 3)
  view.setUint32(4, 2)
  header[8] = 8
  header[9] = 0
  const chunks = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlibSync(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]))),
    pngChunk("IEND", new Uint8Array()),
  ]
  const result = new Uint8Array(
    chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  )
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

const PNG_3X2 = testPng3x2()
const JPEG_3X2 = new Uint8Array([
  0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 2, 0, 3, 1, 1, 0x11, 0, 0xff, 0xda, 0, 8,
  1, 1, 0, 0, 0x3f, 0, 0, 0xff, 0xd9,
])
const PHASE6_CONTENT_TYPES = `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`

describe("DOCX Phase 6 images, sections, headers, footers, and page fields", () => {
  test("selects a supported AlternateContent fallback instead of rejecting an unsupported choice", () => {
    const bytes = buildOneParagraphDocx({
      documentXml: `<w:document xmlns:w="urn:w" xmlns:r="urn:r" xmlns:wp="urn:wp" xmlns:a="urn:a" xmlns:pic="urn:pic" xmlns:mc="urn:mc" xmlns:wpg="urn:wpg" xmlns:wps="urn:wps"><w:body><w:p><w:r>
        <mc:AlternateContent>
          <mc:Choice Requires="wpg"><w:drawing><wp:inline><wp:extent cx="1905" cy="1270"/><a:graphic><a:graphicData><wpg:wgp><wps:wsp><wps:txbx><w:txbxContent><w:p/></w:txbxContent></wps:txbx></wps:wsp></wpg:wgp></a:graphicData></a:graphic></wp:inline></w:drawing></mc:Choice>
          <mc:Fallback><w:drawing><wp:inline><wp:extent cx="1905" cy="1270"/><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="imgPng"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></mc:Fallback>
        </mc:AlternateContent>
      </w:r></w:p><w:sectPr/></w:body></w:document>`,
      extraParts: {
        "[Content_Types].xml": PHASE6_CONTENT_TYPES,
        "word/_rels/document.xml.rels": `<Relationships xmlns="urn:rels"><Relationship Id="imgPng" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/picture.png"/></Relationships>`,
        "word/media/picture.png": PNG_3X2,
      },
    })

    const result = normaliseDocxBytes(bytes)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const paragraph = paragraphBlock(result.value.sections[0]?.blocks[0])
    const images =
      paragraph?.children.filter((inline) => inline.type === "image") ?? []
    expect(images).toHaveLength(1)
    expect(result.value.assets[0]?.packagePath).toBe("word/media/picture.png")
    expect(images[0]?.source.xmlPath).toContain(
      "mc:AlternateContent[1]/mc:Fallback[1]/w:drawing[1]"
    )
  })

  test("materializes a bounded empty rectangle Choice as an SVG image", () => {
    const bytes = buildOneParagraphDocx({
      documentXml: `<w:document xmlns:w="urn:w" xmlns:r="urn:r" xmlns:wp="urn:wp" xmlns:a="urn:a" xmlns:pic="urn:pic" xmlns:mc="urn:mc" xmlns:wpg="urn:wpg" xmlns:wps="urn:wps"><w:body><w:p><w:r>
        <mc:AlternateContent>
          <mc:Choice Requires="wpg"><w:drawing><wp:inline><wp:extent cx="127000" cy="63500"/><a:graphic><a:graphicData><wps:wsp><wps:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="6350"><a:solidFill><a:srgbClr val="000000"/></a:solidFill><a:prstDash val="solid"/><a:round/></a:ln></wps:spPr><wps:txbx><w:txbxContent><w:p/></w:txbxContent></wps:txbx><wps:bodyPr/></wps:wsp></a:graphicData></a:graphic></wp:inline></w:drawing></mc:Choice>
          <mc:Fallback><w:drawing><wp:inline><wp:extent cx="127000" cy="63500"/><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="imgPng"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></mc:Fallback>
        </mc:AlternateContent>
      </w:r></w:p><w:sectPr/></w:body></w:document>`,
      extraParts: {
        "[Content_Types].xml": PHASE6_CONTENT_TYPES,
        "word/_rels/document.xml.rels": `<Relationships xmlns="urn:rels"><Relationship Id="imgPng" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/picture.png"/></Relationships>`,
        "word/media/picture.png": PNG_3X2,
      },
    })

    const result = normaliseDocxBytes(bytes)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.assets).toHaveLength(1)
    expect(result.value.assets[0]).toMatchObject({
      mimeType: "image/svg+xml",
      pixelWidth: 200,
      pixelHeight: 100,
      rasterFallback: {
        pixelWidth: 27,
        pixelHeight: 13,
      },
    })
    const svg = new TextDecoder().decode(
      Uint8Array.from(result.value.assets[0]?.bytes ?? [])
    )
    expect(svg).toContain('<rect fill="#FFFFFF" stroke="#000000"')
    const paragraph = paragraphBlock(result.value.sections[0]?.blocks[0])
    const image = paragraph?.children.find((inline) => inline.type === "image")
    expect(image).toMatchObject({ width: 200, height: 100 })
    expect(image?.source.xmlPath).toContain(
      "mc:AlternateContent[1]/mc:Choice[1]/w:drawing[1]"
    )
  })

  test("normalises relationship-owned PNG and JPEG inline images with stable assets, dimensions, and aspect metadata", () => {
    const bytes = buildOneParagraphDocx({
      documentXml: `<w:document xmlns:w="urn:w" xmlns:r="urn:r" xmlns:wp="urn:wp" xmlns:a="urn:a" xmlns:pic="urn:pic"><w:body><w:p>
        <w:r><w:drawing><wp:inline><wp:extent cx="1905" cy="1270"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="imgPng"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>
        <w:r><w:drawing><wp:inline><wp:extent cx="3810" cy="2540"/><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="imgJpeg"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>
      </w:p><w:sectPr/></w:body></w:document>`,
      extraParts: {
        "[Content_Types].xml": PHASE6_CONTENT_TYPES,
        "word/_rels/document.xml.rels": `<Relationships xmlns="urn:rels"><Relationship Id="imgPng" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/picture.png"/><Relationship Id="imgJpeg" Type="http://purl.oclc.org/ooxml/officeDocument/relationships/image" Target="media/picture.jpg"/></Relationships>`,
        "word/media/picture.png": PNG_3X2,
        "word/media/picture.jpg": JPEG_3X2,
      },
    })
    const result = normaliseDocxBytes(bytes)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(
      result.value.assets.map((asset) => [
        asset.packagePath,
        asset.mimeType,
        asset.pixelWidth,
        asset.pixelHeight,
      ])
    ).toEqual([
      ["word/media/picture.png", "image/png", 3, 2],
      ["word/media/picture.jpg", "image/jpeg", 3, 2],
    ])
    expect(Object.isFrozen(result.value.assets[0]?.bytes)).toBe(true)
    const paragraph = paragraphBlock(result.value.sections[0]?.blocks[0])
    const images =
      paragraph?.children.filter((inline) => inline.type === "image") ?? []
    expect(
      images.map((image) => [
        Number(image.width),
        Number(image.height),
        image.aspect.intrinsicRatio,
        image.aspect.preserve,
      ])
    ).toEqual([
      [3, 2, 1.5, true],
      [6, 4, 1.5, false],
    ])
    expect(images[0]?.source.part).toBe("word/document.xml")
    expect(String(images[0]?.id)).toBe("docx:text:1:1")
  })

  test("preserves ordered blocks across portrait and landscape section boundaries with inherited default header and footer", () => {
    const bytes = buildOneParagraphDocx({
      documentXml: `<w:document xmlns:w="urn:w" xmlns:r="urn:r"><w:body>
        <w:p><w:pPr><w:sectPr><w:headerReference w:type="default" r:id="head"/><w:footerReference w:type="default" r:id="foot"/><w:pgSz w:w="11907" w:h="16839" w:orient="portrait"/><w:pgMar w:top="100" w:right="200" w:bottom="300" w:left="400" w:header="321" w:footer="654"/></w:sectPr></w:pPr><w:r><w:t>First</w:t></w:r></w:p>
        <w:p><w:r><w:t>Second</w:t></w:r></w:p>
        <w:sectPr><w:pgSz w:w="16839" w:h="11907" w:orient="landscape"/><w:pgMar w:top="500" w:right="600" w:bottom="700" w:left="800"/></w:sectPr>
      </w:body></w:document>`,
      extraParts: {
        "[Content_Types].xml": PHASE6_CONTENT_TYPES,
        "word/_rels/document.xml.rels": `<Relationships xmlns="urn:rels"><Relationship Id="head" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="foot" Type="http://purl.oclc.org/ooxml/officeDocument/relationships/footer" Target="footer1.xml"/></Relationships>`,
        "word/header1.xml": `<w:hdr xmlns:w="urn:w"><w:p><w:r><w:t>Header</w:t></w:r></w:p></w:hdr>`,
        "word/footer1.xml": `<w:ftr xmlns:w="urn:w"><w:p><w:r><w:t>Page </w:t></w:r><w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple><w:r><w:t> of </w:t></w:r><w:fldSimple w:instr=" NUMPAGES "><w:r><w:t>2</w:t></w:r></w:fldSimple></w:p></w:ftr>`,
      },
    })
    const result = normaliseDocxBytes(bytes)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(
      result.value.sections.map((section) => [
        section.properties.orientation,
        Number(section.properties.pageWidth),
        section.blocks.length,
      ])
    ).toEqual([
      ["portrait", 11920, 1],
      ["landscape", 16840, 1],
    ])
    expect([
      Number(result.value.sections[0]?.properties.headerDistance),
      Number(result.value.sections[0]?.properties.footerDistance),
      Number(result.value.sections[1]?.properties.headerDistance),
      Number(result.value.sections[1]?.properties.footerDistance),
    ]).toEqual([321, 654, 720, 720])
    expect(
      result.value.sections.map((section) => [
        section.defaultHeaderId,
        section.defaultFooterId,
      ])
    ).toEqual([
      ["docx:header:word/header1.xml", "docx:footer:word/footer1.xml"],
      ["docx:header:word/header1.xml", "docx:footer:word/footer1.xml"],
    ])
    expect(result.value.headers[0]?.source.part).toBe("word/header1.xml")
    const footerBlock = result.value.footers[0]?.blocks[0]
    expect(
      footerBlock?.type === "paragraph"
        ? footerBlock.children.map((inline) =>
            inline.type === "pageField"
              ? inline.field
              : inline.type === "text"
                ? inline.text
                : "image"
          )
        : []
    ).toEqual(["Page ", "PAGE", " of ", "NUMPAGES"])
  })

  test("imports and round-trips different first-page headers and footers", () => {
    const bytes = buildOneParagraphDocx({
      documentXml: `<w:document xmlns:w="urn:w" xmlns:r="urn:r"><w:body>
        <w:p><w:r><w:t>Body</w:t></w:r></w:p>
        <w:sectPr><w:headerReference w:type="default" r:id="head"/><w:headerReference w:type="first" r:id="firstHead"/><w:footerReference w:type="default" r:id="foot"/><w:footerReference w:type="first" r:id="firstFoot"/><w:titlePg/></w:sectPr>
      </w:body></w:document>`,
      extraParts: {
        "[Content_Types].xml": PHASE6_CONTENT_TYPES,
        "word/_rels/document.xml.rels": `<Relationships xmlns="urn:rels"><Relationship Id="head" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="firstHead" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header2.xml"/><Relationship Id="foot" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/><Relationship Id="firstFoot" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer2.xml"/></Relationships>`,
        "word/header1.xml": `<w:hdr xmlns:w="urn:w"><w:p><w:r><w:t>Default header</w:t></w:r></w:p></w:hdr>`,
        "word/header2.xml": `<w:hdr xmlns:w="urn:w"><w:p><w:r><w:t>First header</w:t></w:r></w:p></w:hdr>`,
        "word/footer1.xml": `<w:ftr xmlns:w="urn:w"><w:p><w:r><w:t>Default footer</w:t></w:r></w:p></w:ftr>`,
        "word/footer2.xml": `<w:ftr xmlns:w="urn:w"><w:p><w:r><w:t>First footer</w:t></w:r></w:p></w:ftr>`,
      },
    })
    const imported = normaliseDocxBytes(bytes)
    expect(imported.ok).toBe(true)
    if (!imported.ok) return
    const section = imported.value.sections[0]
    expect(section?.properties.differentFirstPage).toBe(true)
    expect(section?.firstPageHeaderId).toBe("docx:header:word/header2.xml")
    expect(section?.firstPageFooterId).toBe("docx:footer:word/footer2.xml")

    const roundTripped = normaliseDocxBytes(serializeDocx(imported.value))
    expect(roundTripped.ok).toBe(true)
    if (!roundTripped.ok) return
    expect(roundTripped.value.sections[0]?.properties.differentFirstPage).toBe(
      true
    )
    expect(
      roundTripped.value.headers.map((entry) => {
        const block = entry.blocks[0]
        return block?.type === "paragraph"
          ? block.children
              .filter((inline) => inline.type === "text")
              .map((inline) => (inline.type === "text" ? inline.text : ""))
              .join("")
          : ""
      })
    ).toEqual(["Default header", "First header"])
    expect(
      roundTripped.value.footers.map((entry) => {
        const block = entry.blocks[0]
        return block?.type === "paragraph"
          ? block.children
              .filter((inline) => inline.type === "text")
              .map((inline) => (inline.type === "text" ? inline.text : ""))
              .join("")
          : ""
      })
    ).toEqual(["Default footer", "First footer"])
  })

  test("imports and round-trips tables in headers", () => {
    const bytes = buildOneParagraphDocx({
      documentXml: `<w:document xmlns:w="urn:w" xmlns:r="urn:r"><w:body><w:p><w:r><w:t>Body</w:t></w:r></w:p><w:sectPr><w:headerReference w:type="default" r:id="head"/></w:sectPr></w:body></w:document>`,
      extraParts: {
        "[Content_Types].xml": PHASE6_CONTENT_TYPES,
        "word/_rels/document.xml.rels": `<Relationships xmlns="urn:rels"><Relationship Id="head" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/></Relationships>`,
        "word/header1.xml": `<w:hdr xmlns:w="urn:w"><w:tbl><w:tblPr><w:tblW w:w="4000" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>Left</w:t></w:r></w:p></w:tc><w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>Right</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:hdr>`,
      },
    })
    const imported = normaliseDocxBytes(bytes)
    expect(imported.ok).toBe(true)
    if (!imported.ok) return
    const importedTable = imported.value.headers[0]?.blocks[0]
    expect(importedTable?.type).toBe("table")
    if (importedTable?.type !== "table") return
    expect(
      importedTable.rows[0]?.cells.map((cell) =>
        cell.blocks[0]?.children
          .filter((inline) => inline.type === "text")
          .map((inline) => (inline.type === "text" ? inline.text : ""))
          .join("")
      )
    ).toEqual(["Left", "Right"])

    const roundTripped = normaliseDocxBytes(serializeDocx(imported.value))
    expect(roundTripped.ok).toBe(true)
    if (!roundTripped.ok) return
    expect(roundTripped.value.headers[0]?.blocks[0]?.type).toBe("table")
  })

  test("parses PAGE and NUMPAGES complex fields and rejects malformed, external, missing, and anchored drawings without silent loss", () => {
    const complex = buildOneParagraphDocx({
      documentXml: `<w:document xmlns:w="urn:w"><w:body><w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>7</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r><w:r><w:t> / </w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText>NUMPAGES</w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>9</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p><w:sectPr/></w:body></w:document>`,
    })
    const parsed = normaliseDocxBytes(complex)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      const paragraph = paragraphBlock(parsed.value.sections[0]?.blocks[0])
      expect(
        paragraph?.children.map((inline) =>
          inline.type === "pageField"
            ? `${inline.field}:${inline.displayText}`
            : inline.type === "text"
              ? inline.text
              : "image"
        )
      ).toEqual(["PAGE:7", " / ", "NUMPAGES:9"])
    }

    const anchored = inspectDocx(
      buildOneParagraphDocx({
        documentXml: `<w:document xmlns:w="urn:w" xmlns:wp="urn:wp"><w:body><w:p><w:r><w:drawing><wp:anchor/></w:drawing></w:r></w:p><w:sectPr/></w:body></w:document>`,
      })
    )
    expect(errorCodes(anchored)).toEqual(
      expect.arrayContaining([
        "DOCX_UNSUPPORTED_FLOATING_IMAGE",
        "DOCX_CONTENT_LOSS",
      ])
    )

    const missing = inspectDocx(
      buildOneParagraphDocx({
        documentXml: `<w:document xmlns:w="urn:w" xmlns:r="urn:r" xmlns:wp="urn:wp" xmlns:a="urn:a" xmlns:pic="urn:pic"><w:body><w:p><w:r><w:drawing><wp:inline><wp:extent cx="635" cy="635"/><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="missing"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p><w:sectPr/></w:body></w:document>`,
      })
    )
    expect(errorCodes(missing)).toEqual(
      expect.arrayContaining([
        "DOCX_MISSING_IMAGE_RELATIONSHIP",
        "DOCX_CONTENT_LOSS",
      ])
    )

    const malformed = inspectDocx(
      buildOneParagraphDocx({
        documentXml: `<w:document xmlns:w="urn:w" xmlns:wp="urn:wp"><w:body><w:p><w:r><w:drawing><wp:inline/></w:drawing></w:r></w:p><w:sectPr/></w:body></w:document>`,
      })
    )
    expect(errorCodes(malformed)).toEqual(
      expect.arrayContaining(["DOCX_MALFORMED_DRAWING", "DOCX_CONTENT_LOSS"])
    )

    const external = inspectDocx(
      buildOneParagraphDocx({
        extraParts: {
          "word/_rels/document.xml.rels": `<Relationships xmlns="urn:rels"><Relationship Id="externalImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="https://example.invalid/image.png" TargetMode="External"/></Relationships>`,
        },
      })
    )
    expect(errorCodes(external)).toContain("DOCX_EXTERNAL_RELATIONSHIP")
  })

  test("accepts strict officeDocument roots and requires one root document relationship across both dialects", () => {
    const strict = parseDocx(
      buildOneParagraphDocx({
        rootRelationshipsXml: `<Relationships xmlns="urn:rels"><Relationship Id="strict" Type="http://purl.oclc.org/ooxml/officeDocument/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
      })
    )
    expect(strict.ok).toBe(true)
    const ambiguous = parseDocx(
      buildOneParagraphDocx({
        rootRelationshipsXml: `<Relationships xmlns="urn:rels"><Relationship Id="transitional" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="strict" Type="http://purl.oclc.org/ooxml/officeDocument/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
      })
    )
    expect(errorCodes(ambiguous)).toContain(
      "DOCX_MISSING_OFFICE_DOCUMENT_RELATIONSHIP"
    )
  })

  test("enforces pixel area and the downstream image profile with source-linked content loss", () => {
    const imageDocument = `<w:document xmlns:w="urn:w" xmlns:r="urn:r" xmlns:wp="urn:wp" xmlns:a="urn:a" xmlns:pic="urn:pic"><w:body><w:p><w:r><w:drawing><wp:inline><wp:extent cx="1905" cy="1270"/><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="image"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p><w:sectPr/></w:body></w:document>`
    const imageRelationships = `<Relationships xmlns="urn:rels"><Relationship Id="image" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/picture.png"/></Relationships>`
    const areaLimited = inspectDocx(
      buildOneParagraphDocx({
        documentXml: imageDocument,
        extraParts: {
          "[Content_Types].xml": PHASE6_CONTENT_TYPES,
          "word/_rels/document.xml.rels": imageRelationships,
          "word/media/picture.png": PNG_3X2,
        },
      }),
      { limits: { maxImagePixels: 5 } }
    )
    expect(errorCodes(areaLimited)).toEqual(
      expect.arrayContaining([
        "DOCX_IMAGE_DIMENSION_LIMIT",
        "DOCX_CONTENT_LOSS",
      ])
    )

    const corruptPng = PNG_3X2.slice()
    corruptPng[corruptPng.length - 1] =
      (corruptPng[corruptPng.length - 1] ?? 0) ^ 1
    const profileRejected = inspectDocx(
      buildOneParagraphDocx({
        documentXml: imageDocument,
        extraParts: {
          "[Content_Types].xml": PHASE6_CONTENT_TYPES,
          "word/_rels/document.xml.rels": imageRelationships,
          "word/media/picture.png": corruptPng,
        },
      })
    )
    expect(errorCodes(profileRejected)).toEqual(
      expect.arrayContaining([
        "DOCX_UNSUPPORTED_IMAGE_PROFILE",
        "DOCX_CONTENT_LOSS",
      ])
    )
    expect(
      profileRejected.diagnostics.find(
        (entry) => entry.code === "DOCX_UNSUPPORTED_IMAGE_PROFILE"
      )?.source?.part
    ).toBe("word/media/picture.png")
  })

  test("rejects unsupported section breaks and requires one final body sectPr", () => {
    for (const sectionType of ["continuous", "oddPage", "evenPage"]) {
      const result = parseDocx(
        buildOneParagraphDocx({
          documentXml: `<w:document xmlns:w="urn:w"><w:body><w:p/><w:sectPr><w:type w:val="${sectionType}"/></w:sectPr></w:body></w:document>`,
        })
      )
      expect(errorCodes(result)).toEqual(
        expect.arrayContaining([
          "DOCX_UNSUPPORTED_SECTION_BREAK",
          "DOCX_CONTENT_LOSS",
        ])
      )
    }
    const duplicate = parseDocx(
      buildOneParagraphDocx({
        documentXml: `<w:document xmlns:w="urn:w"><w:body><w:p/><w:sectPr/><w:sectPr/></w:body></w:document>`,
      })
    )
    expect(errorCodes(duplicate)).toContain("DOCX_INVALID_SECTION_STRUCTURE")
    const nonFinal = parseDocx(
      buildOneParagraphDocx({
        documentXml: `<w:document xmlns:w="urn:w"><w:body><w:sectPr/><w:p/></w:body></w:document>`,
      })
    )
    expect(errorCodes(nonFinal)).toContain("DOCX_INVALID_SECTION_STRUCTURE")
  })

  test("validates complete field sequences and only decimal or no-op switches", () => {
    const supported = normaliseDocxBytes(
      buildOneParagraphDocx({
        documentXml: `<w:document xmlns:w="urn:w"><w:body><w:p><w:fldSimple w:instr="PAGE \\* Arabic \\* MERGEFORMAT"><w:r><w:t>3</w:t></w:r></w:fldSimple></w:p><w:sectPr/></w:body></w:document>`,
      })
    )
    expect(supported.ok).toBe(true)
    const roman = parseDocx(
      buildOneParagraphDocx({
        documentXml: `<w:document xmlns:w="urn:w"><w:body><w:p><w:fldSimple w:instr="NUMPAGES \\* ROMAN"><w:r><w:t>III</w:t></w:r></w:fldSimple></w:p><w:sectPr/></w:body></w:document>`,
      })
    )
    expect(errorCodes(roman)).toContain("DOCX_UNSUPPORTED_STYLE_PROPERTY")
    const missingSeparator = parseDocx(
      buildOneParagraphDocx({
        documentXml: `<w:document xmlns:w="urn:w"><w:body><w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText>PAGE</w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p><w:sectPr/></w:body></w:document>`,
      })
    )
    expect(errorCodes(missingSeparator)).toContain("DOCX_INVALID_STYLE_VALUE")
    const duplicateSeparator = parseDocx(
      buildOneParagraphDocx({
        documentXml: `<w:document xmlns:w="urn:w"><w:body><w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText>PAGE</w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p><w:sectPr/></w:body></w:document>`,
      })
    )
    expect(errorCodes(duplicateSeparator)).toContain("DOCX_INVALID_STYLE_VALUE")
  })

  test("rejects locked aspect mismatches and deeply freezes the semantic image graph", () => {
    const mismatch = inspectDocx(
      buildOneParagraphDocx({
        documentXml: `<w:document xmlns:w="urn:w" xmlns:r="urn:r" xmlns:wp="urn:wp" xmlns:a="urn:a" xmlns:pic="urn:pic"><w:body><w:p><w:r><w:drawing><wp:inline><wp:extent cx="1905" cy="1905"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="image"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p><w:sectPr/></w:body></w:document>`,
        extraParts: {
          "[Content_Types].xml": PHASE6_CONTENT_TYPES,
          "word/_rels/document.xml.rels": `<Relationships xmlns="urn:rels"><Relationship Id="image" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/picture.png"/></Relationships>`,
          "word/media/picture.png": PNG_3X2,
        },
      })
    )
    expect(errorCodes(mismatch)).toEqual(
      expect.arrayContaining([
        "DOCX_IMAGE_ASPECT_MISMATCH",
        "DOCX_CONTENT_LOSS",
      ])
    )

    const immutable = normaliseDocxBytes(
      buildOneParagraphDocx({
        documentXml: `<w:document xmlns:w="urn:w" xmlns:r="urn:r" xmlns:wp="urn:wp" xmlns:a="urn:a" xmlns:pic="urn:pic"><w:body><w:p><w:r><w:drawing><wp:inline><wp:extent cx="1905" cy="1270"/><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="image"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p><w:sectPr/></w:body></w:document>`,
        extraParts: {
          "[Content_Types].xml": PHASE6_CONTENT_TYPES,
          "word/_rels/document.xml.rels": `<Relationships xmlns="urn:rels"><Relationship Id="image" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/picture.png"/></Relationships>`,
          "word/media/picture.png": PNG_3X2,
        },
      })
    )
    expect(immutable.ok).toBe(true)
    if (!immutable.ok) return
    const image = paragraphBlock(immutable.value.sections[0]?.blocks[0])
      ?.children[0]
    expect([
      Object.isFrozen(immutable.value),
      Object.isFrozen(immutable.value.assets),
      Object.isFrozen(immutable.value.assets[0]),
      Object.isFrozen(immutable.value.assets[0]?.bytes),
      Object.isFrozen(immutable.value.sections),
      image?.type === "image" && Object.isFrozen(image.aspect),
    ]).toEqual([true, true, true, true, true, true])
  })
})
