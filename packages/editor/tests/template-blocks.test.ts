import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  createBlankDocument,
  nodeId,
  twips,
  type SemanticDocument,
  type SemanticParagraph,
  type SemanticText,
  type TextStyle,
} from "@apexmed/core"

import {
  applyCommandToSemantic,
  createEditorStateFromDocument,
  encodeTemplateImage,
  encodeTemplateMarker,
  fromSemanticDocument,
  insertTemplateImage,
  insertTemplateMarker,
  toSemanticDocument,
  wrapTemplateRegion,
} from "../src/index"
import { createEditorPlugins } from "../src/plugins/create-plugins"

const style: TextStyle = {
  fontFamily: "Calibri",
  fontSize: twips(220),
  fontWeight: 400,
  fontStyle: "normal",
  underline: false,
  color: "#000000",
}

function paragraph(
  text: string,
  extras: Partial<SemanticDocument> = {}
): SemanticDocument {
  const blank = createBlankDocument()
  const run: SemanticText = {
    type: "text",
    id: nodeId("run-1"),
    source: { part: "editor", xmlPath: "/w:t[1]" },
    text,
    style,
  }
  const para: SemanticParagraph = {
    ...(blank.sections[0]!.blocks[0] as SemanticParagraph),
    children: [run],
  }
  return {
    ...blank,
    ...extras,
    sections: [
      {
        ...blank.sections[0]!,
        blocks: [para],
      },
    ],
  }
}

function paragraphTexts(document: SemanticDocument): string[] {
  return document.sections[0]!.blocks.flatMap((block) => {
    if (block.type !== "paragraph") return []
    return [
      block.children
        .filter((child) => child.type === "text")
        .map((child) => (child.type === "text" ? child.text : ""))
        .join(""),
    ]
  })
}

describe("template block markers", () => {
  test("standalone if/each paragraphs become template_marker nodes", () => {
    const source = paragraph("{{#if shown}}")
    const pm = fromSemanticDocument(source)
    let found = false
    pm.descendants((node) => {
      if (node.type.name === "template_marker") {
        found = true
        expect(node.attrs.marker).toBe("if")
        expect(node.attrs.path).toBe("shown")
      }
    })
    expect(found).toBe(true)
    const back = toSemanticDocument(pm, { styles: source.styles })
    expect(paragraphTexts(back)).toEqual(["{{#if shown}}"])
  })

  test("inline image placeholders become template_image nodes", () => {
    const source = paragraph("Logo {{@image company_logo}} here")
    const pm = fromSemanticDocument(source)
    let found = false
    pm.descendants((node) => {
      if (node.type.name === "template_image") {
        found = true
        expect(node.attrs.slug).toBe("company_logo")
      }
    })
    expect(found).toBe(true)
    const back = toSemanticDocument(pm, { styles: source.styles })
    expect(paragraphTexts(back).join("")).toContain("{{@image company_logo}}")
  })

  test("insertTemplateMarker serializes as a canonical block placeholder", () => {
    const state = createEditorStateFromDocument(paragraph("Body"))
    const result = applyCommandToSemantic(
      state,
      insertTemplateMarker("each", "items")
    )
    expect(result.applied).toBe(true)
    expect(paragraphTexts(result.document)).toContain("{{#each items}}")
    expect(encodeTemplateMarker("each", "items")).toBe("{{#each items}}")
    expect(encodeTemplateImage("photo")).toBe("{{@image photo}}")
  })

  test("wrapTemplateRegion inserts a matching pair around the selection", () => {
    const state = createEditorStateFromDocument(paragraph("Shown"))
    const result = applyCommandToSemantic(
      state,
      wrapTemplateRegion("if", "shown")
    )
    expect(result.applied).toBe(true)
    const texts = paragraphTexts(result.document)
    expect(texts[0]).toBe("{{#if shown}}")
    expect(texts.at(-1)).toBe("{{/if}}")
    expect(texts).toContain("Shown")
  })

  test("insertTemplateImage serializes as {{@image path}}", () => {
    const state = createEditorStateFromDocument(paragraph("Body"))
    const result = applyCommandToSemantic(
      state,
      insertTemplateImage("photo", "Photo")
    )
    expect(result.applied).toBe(true)
    expect(paragraphTexts(result.document).join("")).toContain(
      "{{@image photo}}"
    )
  })

  test("createEditorPlugins includes the template-blocks plugin", () => {
    const source = readFileSync(
      join(import.meta.dir, "../src/plugins/create-plugins.ts"),
      "utf8"
    )
    expect(source).toContain("createTemplateBlocksPlugin")
    expect(
      createEditorPlugins({ enablePagination: false }).length
    ).toBeGreaterThan(0)
  })
})
