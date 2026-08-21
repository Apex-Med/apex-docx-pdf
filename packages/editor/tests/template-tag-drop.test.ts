import { describe, expect, test } from "bun:test"
import {
  createBlankDocument,
  nodeId,
  twips,
  type SemanticDocument,
  type SemanticParagraph,
  type SemanticText,
  type TextStyle,
} from "@apexmed/core"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  createEditorPlugins,
  createEditorStateFromDocument,
  parsePlainTagId,
  resolveTagDropPosition,
} from "../src/index"
import { fromSemanticDocument } from "../src/model/bridge"
import { EDITOR_CSS } from "../src/styles/editor-css"

const style: TextStyle = {
  fontFamily: "Calibri",
  fontSize: twips(220),
  fontWeight: 400,
  fontStyle: "normal",
  underline: false,
  color: "#000000",
}

function paragraph(text: string, id: string): SemanticParagraph {
  const blank = createBlankDocument()
  const base = blank.sections[0]!.blocks[0] as SemanticParagraph
  const run: SemanticText = {
    type: "text",
    id: nodeId(`${id}-run`),
    source: { part: "editor", xmlPath: `/${id}` },
    text,
    style,
  }
  return { ...base, id: nodeId(id), children: [run] }
}

function twoParagraphDoc(): SemanticDocument {
  const blank = createBlankDocument()
  return {
    ...blank,
    sections: [
      {
        ...blank.sections[0]!,
        blocks: [paragraph("hello", "p1"), paragraph("world", "p2")],
      },
    ],
  }
}

describe("template tag drop", () => {
  test("parsePlainTagId reads the drag payload prefix", () => {
    expect(parsePlainTagId("apex-tag:abc-123")).toBe("abc-123")
    expect(parsePlainTagId("abc-123")).toBe(null)
  })

  test("resolveTagDropPosition keeps an inline hit inside the paragraph", () => {
    const doc = fromSemanticDocument(twoParagraphDoc())
    const state = createEditorStateFromDocument(twoParagraphDoc())
    let helloPos = -1
    doc.descendants((node, pos) => {
      if (node.isText && node.text === "hello") helloPos = pos
    })
    expect(helloPos).toBeGreaterThanOrEqual(0)
    const resolved = resolveTagDropPosition(
      state.doc,
      helloPos + 2,
      state.schema
    )
    expect(resolved).toBe(helloPos + 2)
    const $pos = state.doc.resolve(resolved!)
    expect($pos.parent.inlineContent).toBe(true)
  })

  test("resolveTagDropPosition snaps a block-level hit to a paragraph", () => {
    const state = createEditorStateFromDocument(twoParagraphDoc())
    let sectionPos = -1
    state.doc.descendants((node, pos) => {
      if (node.type.name === "section") sectionPos = pos
    })
    expect(sectionPos).toBeGreaterThanOrEqual(0)
    const resolved = resolveTagDropPosition(
      state.doc,
      sectionPos + 1,
      state.schema
    )
    expect(resolved).not.toBeNull()
    const $pos = state.doc.resolve(resolved!)
    expect($pos.parent.inlineContent).toBe(true)
  })

  test("drop plugin and drop-cursor hide rules are wired", () => {
    const source = readFileSync(
      join(import.meta.dir, "../src/plugins/create-plugins.ts"),
      "utf8"
    )
    expect(source).toContain("createTemplateTagDropPlugin")
    expect(source).toContain("apex-pm-dropcursor")
    expect(EDITOR_CSS).toContain(".apex-template-tag-drop-cursor")
    expect(EDITOR_CSS).toContain("[data-apex-tag-dragging]")
    expect(
      createEditorPlugins({ enablePagination: false }).length
    ).toBeGreaterThan(0)
  })
})
