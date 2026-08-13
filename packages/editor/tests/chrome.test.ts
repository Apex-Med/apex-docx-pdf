import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { EDITOR_CSS } from "../src/styles/editor-css"
import type { EditorChromeActions } from "../src/ui/chrome-types"
import { EditorChrome } from "../src/ui/EditorChrome"
import { MenuBar } from "../src/ui/MenuBar"
import { alignmentFromRects, Ruler } from "../src/ui/Ruler"
import { Toolbar } from "../src/ui/Toolbar"
import type { EditorSelectionSnapshot } from "../src/plugins/selection-state"

const snapshot: EditorSelectionSnapshot = {
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  textStyle: {
    fontFamily: "Calibri",
    fontSize: 220,
    fontWeight: 400,
    fontStyle: "normal",
    underline: false,
    strikethrough: false,
    color: "#000000",
    highlightColor: null,
    verticalAlignment: "baseline",
    styleId: null,
    href: null,
  },
  paragraph: {
    alignment: "left",
    spacingBefore: 0,
    spacingAfter: 0,
    lineSpacing: null,
    indentStart: 0,
    indentEnd: 0,
    firstLineIndent: 0,
    styleId: null,
    numbering: null,
    tabStops: [],
  },
  section: {
    pageWidth: 12240,
    pageHeight: 15840,
    orientation: "portrait",
    marginTop: 1440,
    marginRight: 1440,
    marginBottom: 1440,
    marginLeft: 1440,
    columnCount: 1,
    columnEqualWidth: true,
    columnSpace: 720,
    columnSeparator: false,
    columnWidths: null,
  },
  table: { inTable: false, rows: 0, cols: 0, cellFill: null },
  canUndo: true,
  canRedo: true,
  empty: true,
  revision: 0,
}

const noopActions: EditorChromeActions = {
  onNew: () => undefined,
  onOpenDocx: () => undefined,
  onSaveDocx: () => undefined,
  onExportPdf: () => undefined,
  onPrint: () => undefined,
  onPageSetup: () => undefined,
  onUndo: () => undefined,
  onRedo: () => undefined,
  onCut: () => undefined,
  onCopy: () => undefined,
  onPaste: () => undefined,
  onSelectAll: () => undefined,
  onFindReplace: () => undefined,
  onToggleRuler: () => undefined,
  onToggleDarkPages: () => undefined,
  onTogglePreview: () => undefined,
  onToggleDivergence: () => undefined,
  onZoomChange: () => undefined,
  onInsertImage: () => undefined,
  onInsertTable: () => undefined,
  onInsertPageBreak: () => undefined,
  onInsertLink: () => undefined,
  onInsertColumnBreak: () => undefined,
  onBold: () => undefined,
  onItalic: () => undefined,
  onUnderline: () => undefined,
  onStrikethrough: () => undefined,
  onVerticalAlignment: () => undefined,
  onTextColor: () => undefined,
  onHighlightColor: () => undefined,
  onAlign: () => undefined,
  onLineSpacing: () => undefined,
  onParagraphSpacing: () => undefined,
  onColumns: () => undefined,
  onClearFormatting: () => undefined,
  onApplyStyle: () => undefined,
  onMatchStyle: () => undefined,
  onCreateStyle: () => undefined,
  onUpdateStyle: () => undefined,
  onPaintFormat: () => undefined,
  onBulletList: () => undefined,
  onNumberedList: () => undefined,
  onIndentDecrease: () => undefined,
  onIndentIncrease: () => undefined,
  onFontFamily: () => undefined,
  onFontSize: () => undefined,
  onWordCount: () => undefined,
  onTableInsert: () => undefined,
  onTableAddRowBefore: () => undefined,
  onTableAddRowAfter: () => undefined,
  onTableAddColumnBefore: () => undefined,
  onTableAddColumnAfter: () => undefined,
  onTableDeleteRow: () => undefined,
  onTableDeleteColumn: () => undefined,
  onTableMergeCells: () => undefined,
  onTableSplitCell: () => undefined,
  onTableProperties: () => undefined,
  onMarginsChange: () => undefined,
  onIndentsChange: () => undefined,
  onTabStopsChange: () => undefined,
}

describe("editor chrome components", () => {
  test("imports MenuBar, Toolbar, Ruler, and EditorChrome", () => {
    expect(MenuBar).toBeDefined()
    expect(Toolbar).toBeDefined()
    expect(Ruler).toBeDefined()
    expect(EditorChrome).toBeDefined()
  })

  test("Toolbar source accepts chrome actions and snapshot props", () => {
    // Structural: avoid rendering Toolbar (hooks require React act in bun:test).
    const source = readFileSync(
      join(import.meta.dir, "../src/ui/Toolbar.tsx"),
      "utf8"
    )
    expect(source).toContain("export type ToolbarProps")
    expect(source).toContain("actions: EditorChromeActions")
    expect(source).toContain("snapshot: EditorSelectionSnapshot")
    expect(source).toContain("clearFormatting")
    expect(source).toContain("onClearFormatting")
    expect(source).toContain("onParagraphSpacing")
    expect(source).toContain("variant=\"ghost\"")
    expect(source).toContain("DropdownMenu")
    expect(source).toContain("ParagraphSpacingIcon")
    expect(source).toContain("apex-editor-toolbar__sep")
    expect(source).toContain("canUndo")
    expect(source).not.toContain("ToggleGroup")
    // Ensure the mock shape stays aligned with chrome actions.
    expect(Object.keys(noopActions).length).toBeGreaterThan(20)
    expect(snapshot.revision).toBe(0)
  })

  test("editor.css contains chrome and ruler classes", () => {
    expect(EDITOR_CSS).toContain("apex-editor-chrome")
    expect(EDITOR_CSS).toContain("apex-editor-ruler")

    const cssPath = join(import.meta.dir, "../src/styles/editor.css")
    const raw = readFileSync(cssPath, "utf8")
    expect(raw).toContain("apex-editor-chrome")
    expect(raw).toContain("apex-editor-ruler")
    expect(raw).toContain("apex-editor-ruler__tab-add")
    expect(raw).toContain("apex-editor-toolbar__font")
    expect(raw).toContain("min-width: 11rem")
    expect(raw).toContain("apex-editor-toolbar__font-size-input")
    expect(EDITOR_CSS).toContain("flex-shrink: 0")
    // Manual page-break atom is a zero-size marker; spacers paint the sheet.
    expect(raw).toContain("apex-manual-page-break")
    expect(raw).toMatch(/\.apex-manual-page-break\s*\{[^}]*height:\s*0/s)
  })

  test("toolbar color palette uses vertical hue columns", () => {
    const toolbarPath = join(import.meta.dir, "../src/ui/Toolbar.tsx")
    const source = readFileSync(toolbarPath, "utf8")
    expect(source).toContain("Columns = hue families")
    expect(source).toContain("gridTemplateColumns")
    expect(source).toContain("gridAutoFlow")
    expect(source).toContain("size-7")
    expect(source).toContain("grid w-fit gap-1")
    // Overflow should not recompute on every selection revision (layout shift).
    expect(source).not.toContain("snapshot.revision, zoom")
    expect(source).toContain("h-12 min-h-12")
    expect(source).toContain("variant=\"ghost\"")
    expect(source).toContain("FONT_SIZE_OPTIONS")
    expect(source).toContain("FontSizeControl")
    expect(source).toContain('event.key !== "Enter"')
    expect(source).toContain("apex-editor-toolbar__font-size-input")
  })

  test("authored table grids are not overridden by browser cell minimums", () => {
    expect(EDITOR_CSS).toContain("min-width: 0")
    expect(EDITOR_CSS).toContain("overflow-wrap: break-word")
    expect(EDITOR_CSS).toContain("word-break: normal")
    expect(EDITOR_CSS).not.toContain("overflow-wrap: anywhere")
    expect(EDITOR_CSS).not.toContain("word-break: break-word")
    expect(EDITOR_CSS).toContain("margin-top: 0")
    expect(EDITOR_CSS).toContain("margin-bottom: 0")
    expect(EDITOR_CSS).not.toContain("margin: 8px 0")
    expect(EDITOR_CSS).toContain("width: auto")
    expect(EDITOR_CSS).toContain("--apex-row-height")
    expect(EDITOR_CSS).toContain("data-list-marker")
    expect(EDITOR_CSS).toContain("tableWrapper")
    expect(EDITOR_CSS).toContain("min-height: 0")
    expect(EDITOR_CSS).toContain("ProseMirror-trailingBreak:not(:only-child)")
  })

  test("page sheets do not size a multi-page section as one Letter box", () => {
    expect(EDITOR_CSS).not.toContain("content-visibility: auto")
    expect(EDITOR_CSS).not.toContain("contain-intrinsic-size")
    expect(EDITOR_CSS).toContain("apex-engine-page-sheet")
    expect(EDITOR_CSS).toContain("overscroll-behavior: contain")
    expect(EDITOR_CSS).toContain("prefers-reduced-motion: reduce")
    expect(EDITOR_CSS).toContain("display: flow-root")
    expect(EDITOR_CSS).toContain("zoom: var(--apex-zoom, 1)")
    expect(EDITOR_CSS).not.toMatch(
      /\.apex-editor-surface\s*\{[^}]*transform:\s*scale/s
    )
    expect(EDITOR_CSS).toContain(".apex-page-break-spacer__gap::before")
    expect(EDITOR_CSS).toContain(".apex-page-break-spacer__gap::after")
  })

  test("editor host stays mounted across ruler conditional siblings", () => {
    const chrome = readFileSync(
      join(import.meta.dir, "../src/ui/EditorChrome.tsx"),
      "utf8"
    )
    expect(chrome).toContain('key="apex-editor-pages"')
    expect(chrome).toContain("pageHostRef={pagesRef}")
  })

  test("ruler aligns to the page sheet instead of self-centering with the tab button", () => {
    const source = readFileSync(
      join(import.meta.dir, "../src/ui/Ruler.tsx"),
      "utf8"
    )
    expect(source).toContain('transformOrigin: "top left"')
    expect(source).not.toContain("justify-center")
    expect(source).toContain("section[data-section]")
    expect(source).toContain("apex-editor-ruler__tab-add")
    expect(alignmentFromRects({ left: 120, width: 408 }, { left: 40 }, 816)).toEqual({
      left: 80,
      width: 408,
      scale: 0.5,
    })
  })

  test("editor exposes application shortcuts, full font catalog, and style creation", () => {
    const editor = readFileSync(
      join(import.meta.dir, "../src/ui/Editor.tsx"),
      "utf8"
    )
    const menu = readFileSync(
      join(import.meta.dir, "../src/ui/MenuBar.tsx"),
      "utf8"
    )
    expect(editor).toContain("loadGoogleFontCatalog")
    expect(editor).toContain('key === "s"')
    expect(editor).toContain('key === "f"')
    expect(editor).toContain("StyleDialog")
    expect(menu).toContain("TableGridPicker")
    expect(menu).toContain("Update current style to match")
    expect(menu).toContain("Dark pages")
    expect(menu).toContain("onToggleDarkPages")
    expect(menu).toContain("Align &amp; indent")
    expect(menu).toContain("Bullets &amp; numbering")
    expect(menu).toContain("PDF Document (.pdf)")
    expect(menu).not.toContain("Download as PDF")
  })

  test("file menu actions use native labels instead of cancelled nested clicks", () => {
    const menu = readFileSync(
      join(import.meta.dir, "../src/ui/MenuBar.tsx"),
      "utf8"
    )
    expect(menu).toContain('aria-label="Open document"')
    expect(menu).toContain('aria-label="Insert image"')
    expect(menu).toContain("id={openDocxInputId}")
    expect(menu).toContain("id={insertImageInputId}")
    expect(menu).not.toContain("event.preventDefault()")
  })
})
