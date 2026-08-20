import { describe, expect, test } from "bun:test"
import { createBlankDocument, nodeId, twips } from "@apexmed/core"
import { layoutDocument } from "@apexmed/layout"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  applyHeaderFooterEdit,
  applyHeaderFooterBlocks,
  createEditorStateFromDocument,
  headerFooterEditorDocument,
  headerFooterText,
  insertTable,
  setSectionHeaderFooter,
  applyCommandToSemantic,
  toSemanticDocument,
} from "../src"
import { headerFooterOverlaySpecs } from "../src/pagination/plugin"

describe("header and footer authoring", () => {
  test("creates section-scoped default and first-page header definitions", () => {
    const document = createBlankDocument()
    const sectionId = String(document.sections[0]?.id)
    const edited = applyHeaderFooterEdit(document, sectionId, "header", {
      content: "Clinic {page} of {pages}",
      differentFirstPage: true,
      firstPageContent: "Confidential",
    })
    const section = edited.sections[0]

    expect(section?.properties.differentFirstPage).toBe(true)
    expect(section?.defaultHeaderId).toContain("editor:header:")
    expect(section?.firstPageHeaderId).toContain("editor:header:")
    const defaultHeaderBlock = edited.headers[0]?.blocks[0]
    expect(
      defaultHeaderBlock?.type === "paragraph"
        ? defaultHeaderBlock.children.map((inline) => inline.type)
        : []
    ).toEqual(["text", "pageField", "text", "pageField"])
    expect(headerFooterText(edited, "header", section?.defaultHeaderId)).toBe(
      "Clinic {page} of {pages}"
    )
    expect(headerFooterText(edited, "header", section?.firstPageHeaderId)).toBe(
      "Confidential"
    )
  })

  test("preserves first-page references through the ProseMirror bridge", () => {
    const document = createBlankDocument()
    const sectionId = String(document.sections[0]?.id)
    const edited = applyHeaderFooterEdit(document, sectionId, "footer", {
      content: "Page {page}",
      differentFirstPage: true,
      firstPageContent: "Cover",
    })
    const section = edited.sections[0]
    expect(section).toBeDefined()
    if (!section) return
    const state = createEditorStateFromDocument(edited)
    const result = applyCommandToSemantic(
      state,
      setSectionHeaderFooter({
        differentFirstPage: true,
        defaultFooterId: section.defaultFooterId,
        firstPageFooterId: section.firstPageFooterId,
      }),
      { headers: edited.headers, footers: edited.footers }
    )

    expect(result.applied).toBe(true)
    expect(result.document.sections[0]?.properties.differentFirstPage).toBe(
      true
    )
    expect(result.document.sections[0]?.defaultFooterId).toBe(
      section.defaultFooterId
    )
    expect(result.document.sections[0]?.firstPageFooterId).toBe(
      section.firstPageFooterId
    )
  })

  test("maps active first-page header and footer display items onto the editor sheet", () => {
    const document = createBlankDocument()
    const sectionId = String(document.sections[0]?.id)
    const withHeader = applyHeaderFooterEdit(document, sectionId, "header", {
      content: "Standard header {page}",
      differentFirstPage: true,
      firstPageContent: "First page header",
    })
    const edited = applyHeaderFooterEdit(withHeader, sectionId, "footer", {
      content: "Standard footer {page}",
      differentFirstPage: true,
      firstPageContent: "First page footer",
    })
    const state = createEditorStateFromDocument(edited)
    const layout = layoutDocument(edited, { includeTrace: true })

    expect(layout.trace).toBeDefined()
    if (!layout.trace) return
    const specs = headerFooterOverlaySpecs(
      state.doc,
      edited,
      layout.displayList,
      layout.trace
    )
    const firstPageText = specs[0]?.pages[0]?.items
      .filter((item) => item.type === "glyph-run")
      .map((item) => item.text)
      .join("")

    expect(specs).toHaveLength(1)
    expect(specs[0]?.pages[0]?.headerItemCount).toBeGreaterThan(0)
    expect(specs[0]?.pages[0]?.footerItemCount).toBeGreaterThan(0)
    expect(specs[0]?.pages[0]?.variant).toBe("first")
    expect(firstPageText).toContain("First page header")
    expect(firstPageText).toContain("First page footer")
    expect(firstPageText).not.toContain("Standard header")
    expect(firstPageText).not.toContain("Standard footer")
  })

  test("round-trips rich header paragraphs through the in-canvas editor model", () => {
    const document = createBlankDocument()
    const sectionId = String(document.sections[0]?.id)
    const seeded = applyHeaderFooterEdit(document, sectionId, "header", {
      content: "Styled header",
      differentFirstPage: false,
      firstPageContent: "",
    })
    const editing = headerFooterEditorDocument(
      seeded,
      sectionId,
      "header",
      "default"
    )
    const paragraph = editing.sections[0]?.blocks[0]
    expect(paragraph).toBeDefined()
    if (!paragraph) return
    expect(paragraph.type).toBe("paragraph")
    if (paragraph.type !== "paragraph") return
    const text = paragraph.children[0]
    expect(text?.type).toBe("text")
    if (text?.type !== "text") return

    const updated = applyHeaderFooterBlocks(
      seeded,
      sectionId,
      "header",
      "default",
      [
        {
          ...paragraph,
          children: [
            {
              ...text,
              style: { ...text.style, fontWeight: 700, color: "#2563eb" },
              directStyle: {
                ...(text.directStyle ?? {}),
                fontWeight: 700,
                color: "#2563eb",
              },
            },
          ],
        },
      ]
    )
    const savedBlock = updated.headers.find(
      (entry) => entry.id === updated.sections[0]?.defaultHeaderId
    )?.blocks[0]
    const saved =
      savedBlock?.type === "paragraph" ? savedBlock.children[0] : undefined

    expect(saved?.type).toBe("text")
    if (saved?.type === "text") {
      expect(saved.style.fontWeight).toBe(700)
      expect(saved.style.color).toBe("#2563eb")
    }
  })

  test("keeps rich header inline ids distinct from body inline ids", () => {
    const document = createBlankDocument()
    const sectionId = String(document.sections[0]?.id)
    const seeded = applyHeaderFooterEdit(document, sectionId, "header", {
      content: "Header text",
      differentFirstPage: false,
      firstPageContent: "",
    })
    const headerParagraph = seeded.headers[0]?.blocks[0]
    const headerText =
      headerParagraph?.type === "paragraph"
        ? headerParagraph.children[0]
        : undefined
    const bodyParagraph = seeded.sections[0]?.blocks[0]
    expect(headerText?.type).toBe("text")
    expect(bodyParagraph?.type).toBe("paragraph")
    if (
      headerParagraph?.type !== "paragraph" ||
      headerText?.type !== "text" ||
      bodyParagraph?.type !== "paragraph"
    ) {
      return
    }
    const seededSection = seeded.sections[0]
    expect(seededSection).toBeDefined()
    if (!seededSection) return
    const collidingId = nodeId("editor:text:1")
    const bodyDocument = {
      ...seeded,
      sections: [
        {
          ...seededSection,
          blocks: [
            {
              ...bodyParagraph,
              children: [{ ...headerText, id: collidingId, text: "Body text" }],
            },
          ],
        },
      ],
    }
    const updated = applyHeaderFooterBlocks(
      bodyDocument,
      sectionId,
      "header",
      "default",
      [
        {
          ...headerParagraph,
          children: [{ ...headerText, id: collidingId, text: "Header text" }],
        },
      ]
    )
    const state = createEditorStateFromDocument(updated)
    const layout = layoutDocument(updated, { includeTrace: true })
    expect(layout.trace).toBeDefined()
    if (!layout.trace) return
    const overlayText = headerFooterOverlaySpecs(
      state.doc,
      updated,
      layout.displayList,
      layout.trace
    )[0]
      ?.pages[0]?.items.filter((item) => item.type === "glyph-run")
      .map((item) => item.text)
      .join("")

    const updatedHeaderBlock = updated.headers[0]?.blocks[0]
    expect(
      updatedHeaderBlock?.type === "paragraph"
        ? updatedHeaderBlock.children[0]?.id
        : null
    ).not.toBe(
      updated.sections[0]?.blocks[0]?.type === "paragraph"
        ? updated.sections[0].blocks[0].children[0]?.id
        : null
    )
    expect(overlayText).toContain("Header text")
    expect(overlayText).not.toContain("Body text")
  })

  test("persists tables inserted in the header editor", () => {
    const document = createBlankDocument()
    const sectionId = String(document.sections[0]?.id)
    const editingDocument = headerFooterEditorDocument(
      document,
      sectionId,
      "header",
      "default"
    )
    let state = createEditorStateFromDocument(editingDocument)
    const inserted = insertTable(
      2,
      2,
      2880,
      false
    )(state, (transaction) => {
      state = state.apply(transaction)
    })
    expect(inserted).toBe(true)
    state = state.apply(state.tr.insertText("Header cell"))
    const edited = toSemanticDocument(state.doc, {
      styles: document.styles,
      numberingDefinitions: document.numberingDefinitions,
    })
    const blocks = edited.sections[0]?.blocks ?? []
    expect(blocks.some((block) => block.type === "table")).toBe(true)

    const updated = applyHeaderFooterBlocks(
      document,
      sectionId,
      "header",
      "default",
      blocks as Parameters<typeof applyHeaderFooterBlocks>[4]
    )

    expect(
      updated.headers[0]?.blocks.some((block) => block.type === "table")
    ).toBe(true)
    expect(
      headerFooterEditorDocument(
        updated,
        sectionId,
        "header",
        "default"
      ).sections[0]?.blocks.some((block) => block.type === "table")
    ).toBe(true)

    const mainState = createEditorStateFromDocument(updated)
    const layout = layoutDocument(updated, { includeTrace: true })
    expect(layout.trace).toBeDefined()
    if (!layout.trace) return
    const overlayItems = headerFooterOverlaySpecs(
      mainState.doc,
      updated,
      layout.displayList,
      layout.trace
    )[0]?.pages[0]?.items
    expect(
      overlayItems
        ?.filter((item) => item.type === "glyph-run")
        .map((item) => item.text)
        .join("")
    ).toContain("Header cell")
    expect(overlayItems?.some((item) => item.type === "line")).toBe(true)
    const headerTable = updated.headers[0]?.blocks.find(
      (block) => block.type === "table"
    )
    expect(
      headerTable?.type === "table" ? headerTable.cellPadding : null
    ).toEqual({
      top: twips(0),
      right: twips(108),
      bottom: twips(0),
      left: twips(108),
    })
    const headerGlyph = overlayItems?.find(
      (item) => item.type === "glyph-run" && item.text.includes("Header cell")
    )
    expect(headerGlyph?.type).toBe("glyph-run")
    if (headerGlyph?.type !== "glyph-run") return
    const headerDistance = updated.sections[0]?.properties.headerDistance ?? 0
    const natural = Math.max(
      headerGlyph.fontSize,
      Math.round((headerGlyph.fontSize * 6) / 5)
    )
    const lineHeight = Math.max(1, Math.round((natural * 324) / 240))
    const ascent = Math.round((natural * 4) / 5)
    const leading = Math.max(0, lineHeight - natural)
    expect(headerGlyph.baselineY).toBe(
      twips(headerDistance + ascent + Math.floor(leading / 2))
    )
    const horizontals =
      overlayItems?.flatMap((item) =>
        item.type === "line" && item.y1 === item.y2 ? [item] : []
      ) ?? []
    const top = Math.min(...horizontals.map((item) => Number(item.y1)))
    const bottom = Math.max(...horizontals.map((item) => Number(item.y1)))
    expect(headerGlyph.baselineY).toBeGreaterThan(top)
    expect(headerGlyph.baselineY).toBeLessThan(bottom)
  })

  test("uses an in-canvas editing mode instead of a header/footer dialog", () => {
    const editor = readFileSync(
      join(import.meta.dir, "../src/ui/Editor.tsx"),
      "utf8"
    )
    const css = readFileSync(
      join(import.meta.dir, "../src/styles/editor.css"),
      "utf8"
    )
    const headerFooterEditor = readFileSync(
      join(import.meta.dir, "../src/ui/HeaderFooterEditor.tsx"),
      "utf8"
    )
    const pagination = readFileSync(
      join(import.meta.dir, "../src/pagination/plugin.ts"),
      "utf8"
    )

    expect(editor).toContain("<HeaderFooterEditor")
    expect(editor).toContain("data-apex-header-footer-editing")
    expect(editor).toContain("headerFooterEditing === null")
    expect(editor).toContain(
      "activeHeaderFooterViewRef.current ?? viewRef.current"
    )
    expect(editor).not.toContain("<HeaderFooterDialog")
    expect(css).toContain(".apex-header-footer-editor__divider")
    expect(css).toContain("opacity: 0.36")
    expect(headerFooterEditor).not.toContain("unscaledPageWidth")
    expect(headerFooterEditor).toContain("--apex-header-footer-margin-left")
    expect(headerFooterEditor).toContain("marginLeft: toVisualPx(margins.left)")
    expect(headerFooterEditor).toContain("geometry.marginLeft")
    expect(headerFooterEditor).not.toContain("unscaledMarginLeft")
    expect(headerFooterEditor).toContain("onDoubleClick={onClose}")
    expect(css).not.toContain(
      ".apex-header-footer-editor__content .ProseMirror:focus-visible"
    )
    expect(pagination).toContain("apex-header-footer-overlay__hit")
    expect(pagination).toContain("HEADER_FOOTER_EDIT_REQUEST_EVENT")
    expect(editor).toContain("HEADER_FOOTER_EDIT_REQUEST_EVENT")
  })
})
