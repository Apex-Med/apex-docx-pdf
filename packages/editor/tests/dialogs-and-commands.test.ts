import { describe, expect, test } from "bun:test"
import { createBlankDocument, twips, type StyleDefinition } from "@apexmed/core"
import { TextSelection } from "prosemirror-state"

import {
  applyBulletList,
  applyDefinedParagraphStyle,
  applyCommandToSemantic,
  applyNumberedList,
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
  setFontFamily,
  setFontSize,
  setFontWeight,
  setHighlightColor,
  setParagraphAttrs,
  setParagraphSpacing,
  setTableAttrs,
  setTextColor,
  toggleBold,
  toggleStrikethrough,
  twipsToUnit,
  unitToTwips,
  updateDefinedParagraphStyle,
} from "../src/index"
import { getSelectionSnapshot } from "../src/plugins/selection-state"
import { styleFromSelection } from "../src/ui/style-from-selection"
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

  test("applyBulletList toggles numbering and list indentation", () => {
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

    const removed = applyCommandToSemantic(result.state, applyBulletList())
    expect(removed.applied).toBe(true)
    const plainParagraph = removed.document.sections[0]?.blocks[0]
    expect(plainParagraph?.type).toBe("paragraph")
    if (plainParagraph?.type !== "paragraph") return
    expect(plainParagraph.properties.numbering).toBeNull()
    expect(Number(plainParagraph.properties.indentStart)).toBe(0)
    expect(Number(plainParagraph.properties.firstLineIndent)).toBe(0)
  })

  test("applyNumberedList toggles numbering off when clicked again", () => {
    const state = createEditorStateFromDocument(createBlankDocument())
    const numbered = applyCommandToSemantic(state, applyNumberedList())
    expect(numbered.applied).toBe(true)

    const removed = applyCommandToSemantic(numbered.state, applyNumberedList())
    expect(removed.applied).toBe(true)
    const paragraph = removed.document.sections[0]?.blocks[0]
    expect(paragraph?.type).toBe("paragraph")
    if (paragraph?.type !== "paragraph") return
    expect(paragraph.properties.numbering).toBeNull()
    expect(Number(paragraph.properties.indentStart)).toBe(0)
    expect(Number(paragraph.properties.firstLineIndent)).toBe(0)
  })

  test("Backspace at the start of a list paragraph exits the list", () => {
    const state = createEditorStateFromDocx(
      buildMinimalDocx({ paragraphs: ["List item"] })
    )
    const listed = applyCommandToSemantic(state, applyBulletList())
    let paraStart = 0
    listed.state.doc.descendants((node, pos) => {
      if (node.type.name !== "paragraph") return true
      paraStart = pos + 1
      return false
    })
    const atStart = listed.state.apply(
      listed.state.tr.setSelection(
        TextSelection.create(listed.state.doc, paraStart)
      )
    )

    const removed = applyCommandToSemantic(atStart, backspaceCommand)
    expect(removed.applied).toBe(true)
    const paragraph = removed.document.sections[0]?.blocks[0]
    expect(paragraph?.type).toBe("paragraph")
    if (paragraph?.type !== "paragraph") return
    expect(paragraph.properties.numbering).toBeNull()
    expect(Number(paragraph.properties.indentStart)).toBe(0)
    expect(Number(paragraph.properties.firstLineIndent)).toBe(0)
    expect(
      paragraph.children
        .filter((child) => child.type === "text")
        .map((child) => (child.type === "text" ? child.text : ""))
        .join("")
    ).toBe("List item")
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

  test("applyDefinedParagraphStyle replaces typography across selected paragraphs", () => {
    const state = createEditorStateFromDocx(
      buildMinimalDocx({ paragraphs: ["First", "Second"] })
    )
    const textRanges: { from: number; to: number }[] = []
    state.doc.descendants((node, pos) => {
      if (node.isText) textRanges.push({ from: pos, to: pos + node.nodeSize })
    })
    const firstText = textRanges[0]
    const lastText = textRanges.at(-1)
    expect(firstText).toBeDefined()
    expect(lastText).toBeDefined()
    if (!firstText || !lastText) return
    const selected = state.apply(
      state.tr.setSelection(
        TextSelection.create(state.doc, firstText.from, lastText.to)
      )
    )
    const definition: StyleDefinition = {
      id: "Heading1",
      name: "Heading 1",
      type: "paragraph",
      basedOn: "Normal",
      next: "Normal",
      paragraph: { spacingAfter: twips(120), keepWithNext: true },
      text: { fontSize: twips(400), fontWeight: 700 },
    }

    const result = applyCommandToSemantic(
      selected,
      applyDefinedParagraphStyle(definition)
    )

    const paragraphs = (result.document.sections[0]?.blocks ?? []).filter(
      (block) => block.type === "paragraph"
    )
    expect(paragraphs).toHaveLength(2)
    for (const paragraph of paragraphs) {
      if (paragraph.type !== "paragraph") continue
      expect(paragraph.styleId).toBe("Heading1")
      expect(paragraph.properties.keepWithNext).toBe(true)
      const text = paragraph.children.find((child) => child.type === "text")
      expect(text?.type).toBe("text")
      if (text?.type !== "text") continue
      expect(Number(text.style.fontSize)).toBe(400)
      expect(text.style.fontWeight).toBe(700)
    }
  })

  test("updateDefinedParagraphStyle refreshes every paragraph using the style", () => {
    const state = createEditorStateFromDocx(
      buildMinimalDocx({ paragraphs: ["First", "Second", "Third"] })
    )
    const heading: StyleDefinition = {
      id: "Heading1",
      name: "Heading 1",
      type: "paragraph",
      basedOn: "Normal",
      next: "Normal",
      paragraph: { spacingAfter: twips(120) },
      text: { fontSize: twips(400), fontWeight: 700 },
    }
    const paragraphStarts: number[] = []
    state.doc.descendants((node, pos) => {
      if (node.type.name === "paragraph") paragraphStarts.push(pos + 1)
    })
    const first = paragraphStarts[0]
    const third = paragraphStarts[2]
    expect(first).toBeDefined()
    expect(third).toBeDefined()
    if (first === undefined || third === undefined) return
    const firstSelected = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, first))
    )
    const firstStyled = applyCommandToSemantic(
      firstSelected,
      applyDefinedParagraphStyle(heading)
    )
    const thirdSelected = firstStyled.state.apply(
      firstStyled.state.tr.setSelection(
        TextSelection.create(firstStyled.state.doc, third)
      )
    )
    const bothStyled = applyCommandToSemantic(
      thirdSelected,
      applyDefinedParagraphStyle(heading)
    )
    const updated: StyleDefinition = {
      ...heading,
      paragraph: {
        spacingBefore: twips(160),
        spacingAfter: twips(240),
        lineSpacing: { rule: "auto", value240ths: 360 },
      },
      text: {
        fontFamily: "Aptos",
        fontSize: twips(320),
        fontWeight: 500,
        color: "#2563eb",
        highlightColor: "#fef08a",
      },
    }

    const result = applyCommandToSemantic(
      bothStyled.state,
      updateDefinedParagraphStyle(updated)
    )
    const paragraphs = (result.document.sections[0]?.blocks ?? []).filter(
      (block) => block.type === "paragraph"
    )
    expect(paragraphs.map((paragraph) => paragraph.styleId)).toEqual([
      "Heading1",
      null,
      "Heading1",
    ])
    for (const paragraph of [paragraphs[0], paragraphs[2]]) {
      if (paragraph?.type !== "paragraph") continue
      expect(Number(paragraph.properties.spacingBefore)).toBe(160)
      expect(Number(paragraph.properties.spacingAfter)).toBe(240)
      expect(paragraph.properties.lineSpacing).toEqual({
        rule: "auto",
        value240ths: 360,
      })
      const text = paragraph.children.find((child) => child.type === "text")
      if (text?.type !== "text") continue
      expect(text.style.fontFamily).toBe("Aptos")
      expect(Number(text.style.fontSize)).toBe(320)
      expect(text.style.fontWeight).toBe(500)
      expect(text.style.color).toBe("#2563eb")
      expect(text.style.highlightColor).toBe("#fef08a")
    }
  })

  test("updating a style from selected text refreshes every matching paragraph", () => {
    const state = createEditorStateFromDocx(
      buildMinimalDocx({ paragraphs: ["First heading", "Body", "Second heading"] })
    )
    const heading: StyleDefinition = {
      id: "Heading1",
      name: "Heading 1",
      type: "paragraph",
      basedOn: "Normal",
      next: "Normal",
      paragraph: { spacingBefore: twips(320), spacingAfter: twips(120) },
      text: { fontSize: twips(400), fontWeight: 700 },
    }
    const paragraphStarts: number[] = []
    const textRanges: { from: number; to: number }[] = []
    state.doc.descendants((node, pos) => {
      if (node.type.name === "paragraph") paragraphStarts.push(pos + 1)
      if (node.isText) textRanges.push({ from: pos, to: pos + node.nodeSize })
    })
    const first = paragraphStarts[0]
    const third = paragraphStarts[2]
    const firstText = textRanges[0]
    expect(first).toBeDefined()
    expect(third).toBeDefined()
    expect(firstText).toBeDefined()
    if (first === undefined || third === undefined || !firstText) return

    const firstStyled = applyCommandToSemantic(
      state.apply(
        state.tr.setSelection(TextSelection.create(state.doc, first))
      ),
      applyDefinedParagraphStyle(heading)
    )
    const bothStyled = applyCommandToSemantic(
      firstStyled.state.apply(
        firstStyled.state.tr.setSelection(
          TextSelection.create(firstStyled.state.doc, third)
        )
      ),
      applyDefinedParagraphStyle(heading)
    )
    const firstSelected = bothStyled.state.apply(
      bothStyled.state.tr.setSelection(
        TextSelection.create(
          bothStyled.state.doc,
          firstText.from,
          firstText.to
        )
      )
    )
    const restyled = applyCommandToSemantic(firstSelected, setFontFamily("Aptos"))
    const sized = applyCommandToSemantic(restyled.state, setFontSize(320))
    const weighted = applyCommandToSemantic(sized.state, setFontWeight(500))
    const colored = applyCommandToSemantic(weighted.state, setTextColor("#2563eb"))
    const highlighted = applyCommandToSemantic(
      colored.state,
      setHighlightColor("#fef08a")
    )
    const spaced = applyCommandToSemantic(
      highlighted.state,
      setParagraphSpacing({
        spacingBefore: 160,
        spacingAfter: 240,
        lineSpacing: { rule: "auto", value240ths: 360 },
      })
    )
    const snap = getSelectionSnapshot(spaced.state)
    expect(snap).not.toBeNull()
    if (!snap) return
    const updated = styleFromSelection("Heading1", "Heading 1", snap)
    expect(updated.text).toMatchObject({
      fontFamily: "Aptos",
      fontSize: 320,
      fontWeight: 500,
      color: "#2563eb",
      highlightColor: "#fef08a",
    })
    expect(updated.paragraph).toMatchObject({
      spacingBefore: 160,
      spacingAfter: 240,
      lineSpacing: { rule: "auto", value240ths: 360 },
    })

    const result = applyCommandToSemantic(
      spaced.state,
      updateDefinedParagraphStyle(updated)
    )
    const paragraphs = (result.document.sections[0]?.blocks ?? []).filter(
      (block) => block.type === "paragraph"
    )
    expect(paragraphs.map((paragraph) => paragraph.styleId)).toEqual([
      "Heading1",
      null,
      "Heading1",
    ])
    for (const paragraph of [paragraphs[0], paragraphs[2]]) {
      if (paragraph?.type !== "paragraph") continue
      expect(Number(paragraph.properties.spacingBefore)).toBe(160)
      expect(Number(paragraph.properties.spacingAfter)).toBe(240)
      expect(paragraph.properties.lineSpacing).toEqual({
        rule: "auto",
        value240ths: 360,
      })
      const text = paragraph.children.find((child) => child.type === "text")
      if (text?.type !== "text") continue
      expect(text.style.fontFamily).toBe("Aptos")
      expect(Number(text.style.fontSize)).toBe(320)
      expect(text.style.fontWeight).toBe(500)
      expect(text.style.color).toBe("#2563eb")
      expect(text.style.highlightColor).toBe("#fef08a")
    }
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
