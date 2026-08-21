import { describe, expect, test } from "bun:test"
import { createBlankDocument } from "@apexmed/core"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  applyCommandToSemantic,
  caretAroundTable,
  createEditorPlugins,
  createEditorStateFromDocument,
  createTableCaretPlugin,
  insertTable,
  tableClickSide,
} from "../src/index"
import { EDITOR_CSS } from "../src/styles/editor-css"

function firstTableAndFollowing(state: {
  doc: {
    descendants: (
      fn: (node: { type: { name: string } }, pos: number) => boolean | void
    ) => void
    nodeAt: (pos: number) => { nodeSize: number } | null
    resolve: (pos: number) => { nodeAfter: { isTextblock: boolean } | null }
  }
}): {
  tablePos: number
  afterIsTextblock: boolean
} {
  let tablePos = -1
  let tableSize = 0
  state.doc.descendants((node, pos) => {
    if (tablePos >= 0) return false
    if (node.type.name === "table") {
      tablePos = pos
      tableSize = state.doc.nodeAt(pos)?.nodeSize ?? 0
      return false
    }
    return true
  })
  const after = tablePos + tableSize
  return {
    tablePos,
    afterIsTextblock: Boolean(state.doc.resolve(after).nodeAfter?.isTextblock),
  }
}

describe("table caret after/beside tables", () => {
  test("gapcursor is visible while the editor is focused", () => {
    expect(EDITOR_CSS).toContain(
      ".apex-editor-surface .ProseMirror-focused .ProseMirror-gapcursor"
    )
    expect(EDITOR_CSS).toContain("display: block")
    const css = readFileSync(
      join(import.meta.dir, "../src/styles/editor.css"),
      "utf8"
    )
    expect(css).toContain("ProseMirror-focused .ProseMirror-gapcursor")
  })

  test("createTableCaretPlugin is in the default plugin stack", () => {
    const plugins = createEditorPlugins({ enablePagination: false })
    const source = readFileSync(
      join(import.meta.dir, "../src/plugins/create-plugins.ts"),
      "utf8"
    )
    expect(source).toContain("createTableCaretPlugin")
    expect(
      plugins.some((plugin) => plugin.spec.props?.handleClick !== undefined)
    ).toBe(true)
    expect(createTableCaretPlugin).toBeTypeOf("function")
  })

  test("insertTable leaves a paragraph after the table and caret in the first cell", () => {
    const state = createEditorStateFromDocument(createBlankDocument())
    const result = applyCommandToSemantic(state, insertTable(2, 2))
    expect(result.applied).toBe(true)
    const { tablePos, afterIsTextblock } = firstTableAndFollowing(result.state)
    expect(tablePos).toBeGreaterThanOrEqual(0)
    expect(afterIsTextblock).toBe(true)

    const { $from } = result.state.selection
    expect($from.parent.type.name).toBe("paragraph")
    let inTable = false
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      if ($from.node(depth).type.name === "table") inTable = true
    }
    expect(inTable).toBe(true)
  })

  test("insertTable on a blank document is a table followed by one paragraph", () => {
    const result = applyCommandToSemantic(
      createEditorStateFromDocument(createBlankDocument()),
      insertTable(2, 2)
    )
    const blocks = result.document.sections[0]?.blocks ?? []
    expect(blocks.map((block) => block.type)).toEqual(["table", "paragraph"])
  })

  test("tableClickSide maps margin clicks beside the table", () => {
    const table = { left: 100, top: 80, right: 400, bottom: 200 }
    const page = { left: 40, top: 40, right: 560, bottom: 700 }
    expect(tableClickSide({ x: 480, y: 120 }, table, page)).toBe("after")
    expect(tableClickSide({ x: 60, y: 120 }, table, page)).toBe("before")
    expect(tableClickSide({ x: 60, y: 50 }, table, page)).toBe("before")
    expect(tableClickSide({ x: 250, y: 120 }, table, page)).toBeNull()
    expect(tableClickSide({ x: 480, y: 300 }, table, page)).toBeNull()
    expect(tableClickSide({ x: 20, y: 120 }, table, page)).toBeNull()
  })

  test("caret before a leading table is a gap, not a new paragraph", () => {
    const result = applyCommandToSemantic(
      createEditorStateFromDocument(createBlankDocument()),
      insertTable(2, 2)
    )
    const { tablePos } = firstTableAndFollowing(result.state)
    const tableNode = result.state.doc.nodeAt(tablePos)
    expect(tableNode?.type.name).toBe("table")
    const target = caretAroundTable(
      result.state.doc,
      tablePos,
      tableNode!,
      "before"
    )
    expect(target).toEqual({ kind: "gap", pos: tablePos })
    const after = caretAroundTable(
      result.state.doc,
      tablePos,
      tableNode!,
      "after"
    )
    expect(after?.kind).toBe("text")
  })
})
