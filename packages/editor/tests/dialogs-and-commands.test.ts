import { describe, expect, test } from "bun:test"
import { createBlankDocument, twips, type StyleDefinition } from "@apexmed/core"
import { TextSelection } from "prosemirror-state"

import {
  applyBulletList,
  applyDefinedParagraphStyle,
  applyCommandToSemantic,
  backspaceCommand,
  BULLET_NUMBERING_ID,
  clearFormatting,
  createEditorStateFromDocx,
  createEditorStateFromDocument,
  decreaseIndent,
  handleShiftTab,
  handleTab,
  increaseIndent,
  INDENT_STEP_TWIPS,
  insertTable,
  setParagraphAttrs,
  setTableAttrs,
  toggleBold,
  toggleStrikethrough,
  twipsToUnit,
  unitToTwips,
} from "../src/index"
import { buildMinimalDocx } from "../../testkit/src/docx"

describe("dialogs and commands (phase 5 / 8)", () => {
  test("setParagraphAttrs merges paragraph properties", () => {
    const state = createEditorStateFromDocument(createBlankDocument())
    const result = applyCommandToSemantic(
      state,
      setParagraphAttrs({
        alignment: "center",
        indentStart: 720,
        firstLineIndent: -360,
      })
    )
    expect(result.applied).toBe(true)
    const paragraph = result.document.sections[0]?.blocks[0]
    expect(paragraph?.type).toBe("paragraph")
    if (paragraph?.type !== "paragraph") return
    expect(paragraph.properties.alignment).toBe("center")
    expect(Number(paragraph.properties.indentStart)).toBe(720)
    expect(Number(paragraph.properties.firstLineIndent)).toBe(-360)
  })

  test("increaseIndent and decreaseIndent step left indent by half an inch", () => {
    const state = createEditorStateFromDocument(createBlankDocument())
    const indented = applyCommandToSemantic(state, increaseIndent())
    expect(indented.applied).toBe(true)
    const paragraph = indented.document.sections[0]?.blocks[0]
    expect(paragraph?.type).toBe("paragraph")
    if (paragraph?.type !== "paragraph") return
    expect(Number(paragraph.properties.indentStart)).toBe(INDENT_STEP_TWIPS)

    const again = applyCommandToSemantic(indented.state, increaseIndent())
    const twice = again.document.sections[0]?.blocks[0]
    expect(twice?.type).toBe("paragraph")
    if (twice?.type !== "paragraph") return
    expect(Number(twice.properties.indentStart)).toBe(INDENT_STEP_TWIPS * 2)

    const outdented = applyCommandToSemantic(again.state, decreaseIndent())
    const once = outdented.document.sections[0]?.blocks[0]
    expect(once?.type).toBe("paragraph")
    if (once?.type !== "paragraph") return
    expect(Number(once.properties.indentStart)).toBe(INDENT_STEP_TWIPS)

    const cleared = applyCommandToSemantic(outdented.state, decreaseIndent())
    const flush = cleared.document.sections[0]?.blocks[0]
    expect(flush?.type).toBe("paragraph")
    if (flush?.type !== "paragraph") return
    expect(Number(flush.properties.indentStart)).toBe(0)

    const stillFlush = applyCommandToSemantic(cleared.state, decreaseIndent())
    expect(stillFlush.applied).toBe(false)
  })

  test("increaseIndent applies to every paragraph in the selection", () => {
    const state = createEditorStateFromDocx(
      buildMinimalDocx({ paragraphs: ["First", "Second"] })
    )
    const textStarts: number[] = []
    const textEnds: number[] = []
    state.doc.descendants((node, pos) => {
      if (!node.isText) return
      textStarts.push(pos)
      textEnds.push(pos + node.nodeSize)
    })
    expect(textStarts.length).toBeGreaterThanOrEqual(2)
    const selected = state.apply(
      state.tr.setSelection(
        TextSelection.create(
          state.doc,
          textStarts[0]!,
          textEnds[textEnds.length - 1]!
        )
      )
    )
    const result = applyCommandToSemantic(selected, increaseIndent())
    expect(result.applied).toBe(true)
    const blocks = result.document.sections[0]?.blocks ?? []
    const paragraphs = blocks.filter((block) => block.type === "paragraph")
    expect(paragraphs).toHaveLength(2)
    expect(
      paragraphs.every(
        (block) =>
          block.type === "paragraph" &&
          Number(block.properties.indentStart) === INDENT_STEP_TWIPS
      )
    ).toBe(true)
  })

  test("Tab indents outside tables and still navigates cells inside tables", () => {
    const body = createEditorStateFromDocument(createBlankDocument())
    const indented = applyCommandToSemantic(body, handleTab())
    expect(indented.applied).toBe(true)
    const paragraph = indented.document.sections[0]?.blocks[0]
    expect(paragraph?.type).toBe("paragraph")
    if (paragraph?.type !== "paragraph") return
    expect(Number(paragraph.properties.indentStart)).toBe(INDENT_STEP_TWIPS)

    const outdented = applyCommandToSemantic(indented.state, handleShiftTab())
    expect(outdented.applied).toBe(true)
    const flush = outdented.document.sections[0]?.blocks[0]
    expect(flush?.type).toBe("paragraph")
    if (flush?.type !== "paragraph") return
    expect(Number(flush.properties.indentStart)).toBe(0)

    expect(handleShiftTab()(outdented.state)).toBe(true)

    const table = applyCommandToSemantic(body, insertTable(2, 2))
    const before = table.document.sections[0]?.blocks.find(
      (block) => block.type === "table"
    )
    expect(before?.type).toBe("table")
    if (before?.type !== "table") return
    const firstCellIndent = Number(
      before.rows[0]?.cells[0]?.blocks[0]?.type === "paragraph"
        ? before.rows[0].cells[0].blocks[0].properties.indentStart
        : -1
    )
    const tabbed = applyCommandToSemantic(table.state, handleTab())
    const after = tabbed.document.sections[0]?.blocks.find(
      (block) => block.type === "table"
    )
    expect(after?.type).toBe("table")
    if (after?.type !== "table") return
    const nextCell = after.rows[0]?.cells[1]?.blocks[0]
    expect(nextCell?.type).toBe("paragraph")
    if (nextCell?.type !== "paragraph") return
    expect(Number(nextCell.properties.indentStart)).toBe(firstCellIndent)
    expect(tabbed.state.selection.from).not.toBe(table.state.selection.from)
  })

  test("Backspace at the start of an indented paragraph removes one indent step", () => {
    const state = createEditorStateFromDocx(
      buildMinimalDocx({ paragraphs: ["Hello"] })
    )
    const indented = applyCommandToSemantic(state, increaseIndent())
    const twice = applyCommandToSemantic(indented.state, increaseIndent())
    let paraStart = 0
    twice.state.doc.descendants((node, pos) => {
      if (node.type.name !== "paragraph") return true
      paraStart = pos + 1
      return false
    })
    const atStart = twice.state.apply(
      twice.state.tr.setSelection(
        TextSelection.create(twice.state.doc, paraStart)
      )
    )
    const outdented = applyCommandToSemantic(atStart, backspaceCommand)
    expect(outdented.applied).toBe(true)
    const paragraph = outdented.document.sections[0]?.blocks[0]
    expect(paragraph?.type).toBe("paragraph")
    if (paragraph?.type !== "paragraph") return
    expect(Number(paragraph.properties.indentStart)).toBe(INDENT_STEP_TWIPS)
    expect(
      paragraph.children
        .filter((child) => child.type === "text")
        .map((child) => (child.type === "text" ? child.text : ""))
        .join("")
    ).toBe("Hello")

    const flush = applyCommandToSemantic(outdented.state, backspaceCommand)
    const flushed = flush.document.sections[0]?.blocks[0]
    expect(flushed?.type).toBe("paragraph")
    if (flushed?.type !== "paragraph") return
    expect(Number(flushed.properties.indentStart)).toBe(0)
  })

  test("Backspace in the middle of an indented paragraph does not outdent", () => {
    const state = createEditorStateFromDocx(
      buildMinimalDocx({ paragraphs: ["Hello"] })
    )
    const indented = applyCommandToSemantic(state, increaseIndent())
    let textPos = 0
    indented.state.doc.descendants((node, pos) => {
      if (!node.isText) return
      textPos = pos
      return false
    })
    const inMiddle = indented.state.apply(
      indented.state.tr.setSelection(
        TextSelection.create(indented.state.doc, textPos + 2)
      )
    )
    const result = applyCommandToSemantic(inMiddle, backspaceCommand)
    expect(result.applied).toBe(false)
    const paragraph = result.document.sections[0]?.blocks[0]
    expect(paragraph?.type).toBe("paragraph")
    if (paragraph?.type !== "paragraph") return
    expect(Number(paragraph.properties.indentStart)).toBe(INDENT_STEP_TWIPS)
    expect(
      paragraph.children
        .filter((child) => child.type === "text")
        .map((child) => (child.type === "text" ? child.text : ""))
        .join("")
    ).toBe("Hello")
  })

  test("clearFormatting removes run marks and resets paragraph attrs", () => {
    const bytes = buildMinimalDocx({ paragraphs: ["Hello world"] })
    let state = createEditorStateFromDocx(bytes)
    let textPos = 0
    let textLen = 0
    state.doc.descendants((node, pos) => {
      if (node.isText) {
        textPos = pos
        textLen = node.text?.length ?? 0
        return false
      }
      return true
    })
    expect(textLen).toBeGreaterThan(0)
    state = state.apply(
      state.tr.setSelection(
        TextSelection.create(state.doc, textPos, textPos + textLen)
      )
    )
    const bolded = applyCommandToSemantic(state, toggleBold())
    expect(bolded.applied).toBe(true)

    const styled = applyCommandToSemantic(
      bolded.state,
      setParagraphAttrs({
        alignment: "right",
        spacingBefore: 200,
        indentStart: 720,
        styleId: "Heading1",
      })
    )
    expect(styled.applied).toBe(true)

    const cleared = applyCommandToSemantic(styled.state, clearFormatting())
    expect(cleared.applied).toBe(true)
    const paragraph = cleared.document.sections[0]?.blocks[0]
    expect(paragraph?.type).toBe("paragraph")
    if (paragraph?.type !== "paragraph") return
    expect(paragraph.properties.alignment).toBe("left")
    expect(Number(paragraph.properties.spacingBefore)).toBe(0)
    expect(Number(paragraph.properties.indentStart)).toBe(0)
    expect(paragraph.styleId).toBeNull()
    const weights = paragraph.children
      .filter((child) => child.type === "text")
      .map((child) => (child.type === "text" ? child.style.fontWeight : 700))
    expect(weights.length).toBeGreaterThan(0)
    expect(weights.every((weight) => weight < 700)).toBe(true)
  })

  test("toggleStrikethrough flips the textStyle strikethrough flag", () => {
    const state = createEditorStateFromDocument(createBlankDocument())
    // Stored marks path (empty selection on blank paragraph).
    const struck = applyCommandToSemantic(state, toggleStrikethrough())
    expect(struck.applied).toBe(true)
    const marks =
      struck.state.storedMarks ?? struck.state.selection.$from.marks()
    const textStyle = struck.state.schema.marks.textStyle?.isInSet(marks)
    expect(textStyle?.attrs.strikethrough).toBe(true)

    const toggledOff = applyCommandToSemantic(
      struck.state,
      toggleStrikethrough()
    )
    expect(toggledOff.applied).toBe(true)
    const marksOff =
      toggledOff.state.storedMarks ?? toggledOff.state.selection.$from.marks()
    const textStyleOff =
      toggledOff.state.schema.marks.textStyle?.isInSet(marksOff)
    expect(textStyleOff?.attrs.strikethrough).toBe(false)
  })

  test("applyBulletList sets numbering and merges definition into document", () => {
    const state = createEditorStateFromDocument(createBlankDocument())
    const result = applyCommandToSemantic(state, applyBulletList())
    expect(result.applied).toBe(true)
    const paragraph = result.document.sections[0]?.blocks[0]
    expect(paragraph?.type).toBe("paragraph")
    if (paragraph?.type !== "paragraph") return
    expect(paragraph.properties.numbering).toEqual({
      definitionId: BULLET_NUMBERING_ID,
      level: 0,
    })
    expect(Number(paragraph.properties.indentStart)).toBe(720)
    expect(Number(paragraph.properties.firstLineIndent)).toBe(-360)
    expect(
      result.document.numberingDefinitions.some(
        (definition) =>
          definition.id === BULLET_NUMBERING_ID &&
          definition.levels[0]?.format === "bullet"
      )
    ).toBe(true)
    let numberingLabel: unknown
    let markerDom: unknown
    result.state.doc.descendants((node) => {
      if (node.type.name !== "paragraph") return true
      numberingLabel = node.attrs.numberingLabel
      markerDom = node.type.spec.toDOM?.(node)
      return false
    })
    expect(numberingLabel).toBe("•")
    expect(JSON.stringify(markerDom)).toContain("data-list-marker")
    expect(JSON.stringify(markerDom)).toContain("•")
  })

  test("applyDefinedParagraphStyle applies named paragraph and text formatting", () => {
    const bytes = buildMinimalDocx({ paragraphs: ["Styled paragraph"] })
    const state = createEditorStateFromDocx(bytes)
    const definition: StyleDefinition = {
      id: "Apex-Callout",
      name: "Callout",
      type: "paragraph",
      basedOn: null,
      next: "Apex-Callout",
      paragraph: {
        alignment: "center",
        spacingBefore: twips(120),
        spacingAfter: twips(180),
      },
      text: {
        fontFamily: "Inter",
        fontSize: twips(280),
        fontWeight: 700,
        color: "#2563eb",
      },
    }
    const result = applyCommandToSemantic(
      state,
      applyDefinedParagraphStyle(definition)
    )
    expect(result.applied).toBe(true)
    const paragraph = result.document.sections[0]?.blocks[0]
    expect(paragraph?.type).toBe("paragraph")
    if (paragraph?.type !== "paragraph") return
    expect(paragraph.styleId).toBe("Apex-Callout")
    expect(paragraph.properties.alignment).toBe("center")
    const text = paragraph.children.find((child) => child.type === "text")
    expect(text?.type).toBe("text")
    if (text?.type !== "text") return
    expect(text.style.fontFamily).toBe("Inter")
    expect(text.style.fontWeight).toBe(700)
    expect(text.style.color).toBe("#2563eb")
  })

  test("setTableAttrs persists table justification through the semantic bridge", () => {
    const state = createEditorStateFromDocument(createBlankDocument())
    const inserted = applyCommandToSemantic(state, insertTable(1, 1))
    expect(inserted.applied).toBe(true)
    const centered = applyCommandToSemantic(
      inserted.state,
      setTableAttrs({ alignment: "center" })
    )
    expect(centered.applied).toBe(true)
    const table = centered.document.sections[0]?.blocks.find(
      (block) => block.type === "table"
    )
    expect(table?.type).toBe("table")
    if (table?.type !== "table") return
    expect(table.alignment).toBe("center")
    let tableDom = ""
    centered.state.doc.descendants((node) => {
      if (node.type.name !== "table") return true
      tableDom = JSON.stringify(node.type.spec.toDOM?.(node))
      return false
    })
    expect(tableDom).toContain("colgroup")
    expect(tableDom).toContain("margin-left:auto")
    expect(tableDom).toContain("width:100%")
  })

  test("unit conversion helpers use twips/in/cm/pt", () => {
    expect(unitToTwips(1, "in")).toBe(1440)
    expect(unitToTwips(2.54, "cm")).toBe(1440)
    expect(unitToTwips(72, "pt")).toBe(1440)
    expect(twipsToUnit(1440, "in")).toBe(1)
    expect(Math.round(twipsToUnit(1440, "cm") * 100) / 100).toBe(2.54)
    expect(twipsToUnit(1440, "pt")).toBe(72)
  })
})
