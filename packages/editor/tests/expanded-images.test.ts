import { describe, expect, test } from "bun:test"
import { createBlankDocument } from "@apexmed/core"
import { minimalPng } from "@apexmed/images"
import { EditorState, NodeSelection } from "prosemirror-state"

import {
  applyCommandToSemantic,
  createEditorStateFromDocument,
  insertImageFromBytes,
  setImageAltText,
} from "../src"
import { fromSemanticDocument } from "../src/model/bridge"
import { createEditorPlugins } from "../src/plugins/create-plugins"
import { editorSchema } from "../src/schema"

describe("expanded image insert", () => {
  test("insertImageFromBytes accepts SVG with rasterFallback", () => {
    const png = minimalPng(2, 1)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 1"><rect width="2" height="1"/></svg>`
    const state = createEditorStateFromDocument(createBlankDocument())
    const { command, asset } = insertImageFromBytes({
      bytes: new TextEncoder().encode(svg),
      mimeType: "image/svg+xml",
      pixelWidth: 2,
      pixelHeight: 1,
      altText: "logo",
      rasterFallback: {
        bytes: Array.from(png),
        pixelWidth: 2,
        pixelHeight: 1,
      },
    })
    expect(asset.mimeType).toBe("image/svg+xml")
    expect(asset.rasterFallback?.bytes.length).toBeGreaterThan(0)
    const result = applyCommandToSemantic(state, command)
    expect(result.applied).toBe(true)
    expect(
      result.document.assets.some((a) => a.mimeType === "image/svg+xml")
    ).toBe(true)
  })

  test("setImageAltText updates selected image", () => {
    const png = minimalPng(1, 1)
    let state = createEditorStateFromDocument(createBlankDocument())
    const { command } = insertImageFromBytes({
      bytes: png,
      mimeType: "image/png",
      pixelWidth: 1,
      pixelHeight: 1,
      altText: "before",
    })
    const inserted = applyCommandToSemantic(state, command)
    state = inserted.state
    let imagePos: number | null = null
    state.doc.descendants((node, pos) => {
      if (node.type.name === "image" && imagePos === null) imagePos = pos
    })
    expect(imagePos).not.toBeNull()
    state = state.apply(
      state.tr.setSelection(NodeSelection.create(state.doc, imagePos!))
    )
    const updated = applyCommandToSemantic(state, setImageAltText("after"))
    expect(updated.applied).toBe(true)
    let alt = ""
    updated.state.doc.descendants((node) => {
      if (node.type.name === "image") alt = String(node.attrs.altText ?? "")
    })
    expect(alt).toBe("after")
  })

  test("createEditorPlugins includes image paste/drop plugin", () => {
    const state = EditorState.create({
      schema: editorSchema,
      doc: fromSemanticDocument(createBlankDocument()),
      plugins: createEditorPlugins({ enablePagination: false }),
    })
    expect(state.plugins.length).toBeGreaterThan(3)
  })
})
