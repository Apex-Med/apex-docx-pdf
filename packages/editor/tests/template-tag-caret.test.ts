import { describe, expect, test } from "bun:test"
import { createBlankDocument } from "@apexmed/core"
import { NodeSelection, TextSelection } from "prosemirror-state"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  applyCommandToSemantic,
  arrowPastTemplateTag,
  createEditorPlugins,
  createEditorStateFromDocument,
  deleteAdjacentTemplateTag,
  insertTemplateTag,
  tagSelectionDecorations,
  templateTagClickSide,
  templateTagPositionsInSelection,
} from "../src/index"
import { editorSchema } from "../src/schema"

const tag = {
  id: "tag-author",
  label: "Author name",
  slug: "author_name",
  kind: "string" as const,
}

function tagPosition(doc: {
  descendants: (
    fn: (node: { type: { name: string }; nodeSize: number }, pos: number) => void
  ) => void
}): number {
  let found = -1
  doc.descendants((node, pos) => {
    if (node.type.name === "template_tag") found = pos
  })
  return found
}

describe("template tag caret", () => {
  test("schema tags are unselectable inline atoms so the caret stays a text caret", () => {
    const spec = editorSchema.nodes.template_tag?.spec
    expect(spec?.inline).toBe(true)
    expect(spec?.atom).toBe(true)
    expect(spec?.selectable).toBe(false)
    expect(spec?.draggable).toBe(false)
  })

  test("insertTemplateTag leaves an empty text caret after the chip", () => {
    const state = createEditorStateFromDocument(createBlankDocument())
    const result = applyCommandToSemantic(state, insertTemplateTag(tag))
    expect(result.applied).toBe(true)
    expect(result.state.selection).toBeInstanceOf(TextSelection)
    expect(result.state.selection.empty).toBe(true)
    const pos = tagPosition(result.state.doc)
    expect(pos).toBeGreaterThanOrEqual(0)
    expect(result.state.selection.from).toBeGreaterThan(pos)
    expect(result.state.selection).not.toBeInstanceOf(NodeSelection)
  })

  test("text can be typed after an inserted tag without replacing it", () => {
    const inserted = applyCommandToSemantic(
      createEditorStateFromDocument(createBlankDocument()),
      insertTemplateTag(tag)
    )
    const typed = inserted.state.apply(
      inserted.state.tr.insertText(" wrote this")
    )
    let sawTag = false
    const texts: string[] = []
    typed.doc.descendants((node) => {
      if (node.type.name === "template_tag") sawTag = true
      if (node.isText) texts.push(node.text ?? "")
    })
    expect(sawTag).toBe(true)
    expect(texts.join("").replaceAll("\u200b", "")).toBe(" wrote this")
  })

  test("arrow keys jump over a tag instead of node-selecting it", () => {
    const inserted = applyCommandToSemantic(
      createEditorStateFromDocument(createBlankDocument()),
      insertTemplateTag(tag)
    )
    const before = inserted.state.apply(
      inserted.state.tr.setSelection(
        TextSelection.create(inserted.state.doc, tagPosition(inserted.state.doc))
      )
    )
    const right = applyCommandToSemantic(before, arrowPastTemplateTag(1))
    expect(right.applied).toBe(true)
    expect(right.state.selection).toBeInstanceOf(TextSelection)
    expect(right.state.selection).not.toBeInstanceOf(NodeSelection)
    const afterTag = tagPosition(right.state.doc) + 1
    expect(right.state.selection.from).toBeGreaterThanOrEqual(afterTag)

    const left = applyCommandToSemantic(right.state, arrowPastTemplateTag(-1))
    expect(left.applied).toBe(true)
    expect(left.state.selection.from).toBeLessThanOrEqual(
      tagPosition(left.state.doc)
    )
  })

  test("one Backspace after a tag deletes it", () => {
    const inserted = applyCommandToSemantic(
      createEditorStateFromDocument(createBlankDocument()),
      insertTemplateTag(tag)
    )
    const deleted = applyCommandToSemantic(
      inserted.state,
      deleteAdjacentTemplateTag(-1)
    )
    expect(deleted.applied).toBe(true)
    let sawTag = false
    deleted.state.doc.descendants((node) => {
      if (node.type.name === "template_tag") sawTag = true
    })
    expect(sawTag).toBe(false)
  })

  test("click side splits the chip at its midpoint", () => {
    expect(templateTagClickSide(10, { left: 0, width: 40 })).toBe("before")
    expect(templateTagClickSide(30, { left: 0, width: 40 })).toBe("after")
  })

  test("inserting a tag adds zero-width caret anchors around it", () => {
    const result = applyCommandToSemantic(
      createEditorStateFromDocument(createBlankDocument()),
      insertTemplateTag(tag)
    )
    const pos = tagPosition(result.state.doc)
    const $tag = result.state.doc.resolve(pos)
    expect($tag.nodeBefore?.isText).toBe(true)
    expect($tag.nodeBefore?.text).toBe("\u200b")
    expect($tag.nodeAfter?.type.name).toBe("template_tag")
    const $after = result.state.doc.resolve(pos + 1)
    expect($after.nodeAfter?.isText).toBe(true)
    expect($after.nodeAfter?.text).toBe("\u200b")
  })

  test("a text range that covers a tag marks it as selected", () => {
    const inserted = applyCommandToSemantic(
      createEditorStateFromDocument(createBlankDocument()),
      insertTemplateTag(tag)
    )
    const pos = tagPosition(inserted.state.doc)
    const covering = inserted.state.apply(
      inserted.state.tr.setSelection(
        TextSelection.create(inserted.state.doc, pos, pos + 1)
      )
    )
    expect(templateTagPositionsInSelection(covering)).toEqual([pos])
    const deco = tagSelectionDecorations(covering)
    const found = deco.find()
    expect(found).toHaveLength(1)
    expect(found[0]?.from).toBe(pos)
    expect(found[0]?.to).toBe(pos + 1)

    const beforeOnly = inserted.state.apply(
      inserted.state.tr.setSelection(
        TextSelection.create(inserted.state.doc, pos, pos)
      )
    )
    expect(templateTagPositionsInSelection(beforeOnly)).toEqual([])
  })

  test("caret plugin is in the default stack", () => {
    const source = readFileSync(
      join(import.meta.dir, "../src/plugins/create-plugins.ts"),
      "utf8"
    )
    expect(source).toContain("createTemplateTagCaretPlugin")
    expect(
      createEditorPlugins({ enablePagination: false }).length
    ).toBeGreaterThan(0)
  })
})
