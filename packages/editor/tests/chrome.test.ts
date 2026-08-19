import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { EDITOR_CSS } from "../src/styles/editor-css"
import { TAILWIND_PALETTES } from "../src/fonts"
import { hexToHsv, hsvToHex, normalizeHexColor } from "../src/ui/color-utils"
import type { EditorChromeActions } from "../src/ui/chrome-types"
import { EditorChrome } from "../src/ui/EditorChrome"
import { MenuBar } from "../src/ui/MenuBar"
import { alignmentFromRects, Ruler } from "../src/ui/Ruler"
import { Toolbar } from "../src/ui/Toolbar"
import { paragraphStyleOptions } from "../src/ui/paragraph-style-options"
import {
  styleFromSelection,
  styleIdFromName,
} from "../src/ui/style-from-selection"
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
    differentFirstPage: false,
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
  onInsertHeader: () => undefined,
  onInsertFooter: () => undefined,
  onInsertTable: () => undefined,
  onInsertPageBreak: () => undefined,
  onInsertTag: () => undefined,
  onToggleTagsSidebar: () => undefined,
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
  test("built-in typography options remain visible with document styles", () => {
    const options = paragraphStyleOptions([
      {
        id: "Heading1",
        name: "Imported Heading 1",
        type: "paragraph",
        basedOn: "Normal",
        next: "Normal",
        paragraph: null,
        text: null,
      },
      {
        id: "Apex-Callout",
        name: "Callout",
        type: "paragraph",
        basedOn: null,
        next: "Apex-Callout",
        paragraph: null,
        text: null,
      },
    ])

    expect(options).toEqual([
      { id: "Normal", name: "Normal" },
      { id: "Heading1", name: "Imported Heading 1" },
      { id: "Heading2", name: "Heading 2" },
      { id: "Title", name: "Title" },
      { id: "Apex-Callout", name: "Callout" },
    ])
  })

  test("styleFromSelection captures typography metadata from selected text", () => {
    expect(styleIdFromName("Callout Block")).toBe("Apex-Callout-Block")
    const definition = styleFromSelection("Heading1", "Heading 1", {
      ...snapshot,
      empty: false,
      bold: true,
      textStyle: {
        ...snapshot.textStyle,
        fontFamily: "Aptos",
        fontSize: 320,
        fontWeight: 500,
        color: "#2563eb",
        highlightColor: "#fef08a",
        styleId: "Heading1",
      },
      paragraph: {
        ...snapshot.paragraph!,
        styleId: "Heading1",
        spacingBefore: 160,
        spacingAfter: 240,
        lineSpacing: { rule: "auto", value240ths: 360 },
      },
    })
    expect(definition).toMatchObject({
      id: "Heading1",
      name: "Heading 1",
      type: "paragraph",
      text: {
        fontFamily: "Aptos",
        fontSize: 320,
        fontWeight: 500,
        color: "#2563eb",
        highlightColor: "#fef08a",
      },
      paragraph: {
        spacingBefore: 160,
        spacingAfter: 240,
        lineSpacing: { rule: "auto", value240ths: 360 },
      },
    })
  })

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
    expect(source).toContain('variant="ghost"')
    expect(source).toContain("DropdownMenu")
    expect(source).toContain('className="w-40 min-w-40"')
    expect(source).toContain("icon={AlignLeftIcon}")
    expect(source).toContain("icon={TextAlignCenterIcon}")
    expect(source).toContain("icon={TextAlignRightIcon}")
    expect(source).toContain("icon={TextAlignJustifyCenterIcon}")
    expect(source).toContain('className="w-64 min-w-64"')
    expect(source).toContain("icon={ArrowUpFromLineIcon}")
    expect(source).toContain("icon={ArrowDownFromLineIcon}")
    expect(source).toContain("icon={SlidersVerticalIcon}")
    expect(source).toContain("ParagraphSpacingIcon")
    expect(source).toContain("Update style to match selected text")
    expect(source).toContain("Update selected text to match style")
    expect(source).toContain("actions.onUpdateStyle(menu.id)")
    expect(source).toContain("actions.onApplyStyle(menu.id)")
    expect(source).toContain("alignItemWithTrigger={false}")
    expect(source).toContain("max-h-80!")
    expect(source).toContain(
      "if (event.button === 0) event.preventDefault()"
    )
    expect(source).toContain("onMouseDown={(event) => {")
    expect(source).toContain("onContextMenu")
    expect(source).not.toContain("ContextMenuTrigger")
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
    expect(raw).toMatch(
      /\.apex-editor-toolbar__font-size-input\s*\{[^}]*min-width:\s*3\.5rem/s
    )
    expect(EDITOR_CSS).toContain("flex-shrink: 0")
    // Manual page-break atom is a zero-size marker; spacers paint the sheet.
    expect(raw).toContain("apex-manual-page-break")
    expect(raw).toMatch(/\.apex-manual-page-break\s*\{[^}]*height:\s*0/s)
  })

  test("table options is an in-layout collapsible sidebar", () => {
    const source = readFileSync(
      join(import.meta.dir, "../src/ui/TablePropertiesDialog.tsx"),
      "utf8"
    )
    expect(source).toContain("apex-table-options")
    expect(source).toContain("Table options")
    expect(source).toContain("aria-expanded")
    expect(source).toContain("apex-cell-border")
    expect(source).toContain("selectionGrid.rows")
    expect(source).toContain("insideHorizontal")
    expect(source).toContain("insideVertical")
    expect(source).toContain("onContextMenu")
    expect(source).toContain('type: "cellBorder"')
    expect(source).toContain("ScrubbableNumberLabel")
    expect(source).toContain("ScrubbableNumberDisclosure")
    expect(source).toContain("ScrubbableNumberInput")
    expect(source).toContain("paddingText")
    expect(source).toContain("HorizontalResizeIcon")
    expect(source).toContain("VerticalResizeIcon")
    expect(source).toContain("paddingExpanded")
    expect(source).toContain('placeholder="Mixed"')
    expect(source).toContain("Allow multiline text")
    expect(source).toContain("At least one column must remain Fill")
    expect(source).toContain("Hug matches the widest cell")
    expect(source).toContain("Imported fixed grid")
    expect(source).toContain("apex-table-sizing__modes")
    expect(source).not.toContain(">Apply<")
    expect(source).not.toContain("Sheet")
    expect(source).not.toContain("SheetContent")
    const css = readFileSync(
      join(import.meta.dir, "../src/styles/editor.css"),
      "utf8"
    )
    expect(css).toContain(".apex-table-options")
    expect(css).toContain("width: 340px")
    expect(css).toContain("max-width: 520px")
    expect(css).toContain(".apex-sidebar-resize-handle")
    expect(source).toContain("Resize table options sidebar")
    expect(css).toContain(".apex-cell-border__edge:hover")
    expect(css).toContain("cursor: context-menu")
    expect(css).toContain("var(--apex-accent) 13%")
    expect(css).toContain(".apex-table-dnd")
    expect(css).toContain(".apex-table-dnd__handle")
    expect(css).toContain(".apex-table-dnd__handle.is-visible")
    // Overlay must stay out of the page flex row — a gap-3 sibling
    // shrinks the desk and recenters the sheet on click/hover.
    expect(css).toMatch(/\.apex-table-dnd\s*\{[^}]*position:\s*absolute/s)

    const editorSource = readFileSync(
      join(import.meta.dir, "../src/ui/Editor.tsx"),
      "utf8"
    )
    expect(editorSource).toContain("TableReorderOverlay")
    expect(editorSource).toContain(
      'className="relative min-h-0 min-w-0 flex-1"'
    )
    expect(editorSource).toContain("tr.selectionSet")
    expect(editorSource).toContain("readTableOptionsSelection(next)")
    expect(editorSource).toContain("tableOptionsSelection.positions.join")
    expect(editorSource).toContain("const runLive = useCallback")
    const runLiveSource = editorSource.slice(
      editorSource.indexOf("const runLive = useCallback"),
      editorSource.indexOf("const runLiveAll = useCallback")
    )
    expect(runLiveSource).not.toContain("view.focus()")
  })

  test("tags and table options sidebars are resizable", () => {
    const tags = readFileSync(
      join(import.meta.dir, "../src/ui/TagsSidebar.tsx"),
      "utf8"
    )
    const table = readFileSync(
      join(import.meta.dir, "../src/ui/TablePropertiesDialog.tsx"),
      "utf8"
    )
    const handle = readFileSync(
      join(import.meta.dir, "../src/ui/ResizableSidebarHandle.tsx"),
      "utf8"
    )
    expect(tags).toContain("Resize tags sidebar")
    expect(table).toContain("Resize table options sidebar")
    expect(handle).toContain("<hr")
    expect(handle).toContain('aria-orientation="vertical"')
    expect(handle).toContain('event.key === "ArrowLeft"')
    expect(handle).toContain('event.key === "ArrowRight"')
    expect(handle).toContain("setPointerCapture")
  })

  test("editor numeric inputs share vertical scrubbing", () => {
    const scrubSource = readFileSync(
      join(import.meta.dir, "../src/ui/ScrubbableNumberInput.tsx"),
      "utf8"
    )
    expect(scrubSource).toContain("startY")
    expect(scrubSource).toContain("drag.startY - event.clientY")
    expect(scrubSource).toContain("Math.abs(deltaX) > Math.abs(deltaY)")
    expect(scrubSource).toContain("setPointerCapture")
    expect(scrubSource).toContain("cursor-ns-resize")
    expect(scrubSource).toContain("touch-pan-x")
    expect(scrubSource).toContain("Click to type, or drag vertically")
    expect(scrubSource).toContain("individual cell padding controls")

    for (const file of [
      "Toolbar.tsx",
      "TablePropertiesDialog.tsx",
      "LineSpacingDialog.tsx",
      "PageSetupDialog.tsx",
      "ColumnsDialog.tsx",
    ]) {
      const source = readFileSync(
        join(import.meta.dir, `../src/ui/${file}`),
        "utf8"
      )
      expect(source).toContain("ScrubbableNumberInput")
    }
  })

  test("shared color picker uses vertical families and horizontal shades", () => {
    const toolbarPath = join(import.meta.dir, "../src/ui/Toolbar.tsx")
    const tablePath = join(
      import.meta.dir,
      "../src/ui/TablePropertiesDialog.tsx"
    )
    const pickerPath = join(import.meta.dir, "../src/ui/ColorPicker.tsx")
    const toolbarSource = readFileSync(toolbarPath, "utf8")
    const tableSource = readFileSync(tablePath, "utf8")
    const pickerSource = readFileSync(pickerPath, "utf8")
    expect(toolbarSource).toContain("<ColorPicker")
    expect(tableSource).toContain("<ColorPicker")
    expect(pickerSource).toContain('TabsTrigger value="swatches"')
    expect(pickerSource).toContain('TabsTrigger value="custom"')
    expect(pickerSource).toContain("gridTemplateColumns")
    expect(pickerSource).toContain("1.5rem")
    expect(pickerSource).toContain("TAILWIND_SHADE_LABELS")
    expect(pickerSource).toContain('data-selected={selected ? "true"')
    expect(pickerSource).toContain("inset 0 0 0 2px var(--popover)")
    expect(pickerSource).toContain("0 0 0 2px var(--foreground)")
    expect(pickerSource).toContain("Hue and saturation color wheel")
    expect(pickerSource).toContain("Enter a 3- or 6-digit hex value")
    expect(Object.keys(TAILWIND_PALETTES)).toHaveLength(18)
    expect(Object.keys(TAILWIND_PALETTES)).not.toContain("slate")
    expect(Object.keys(TAILWIND_PALETTES)).not.toContain("gray")
    expect(Object.keys(TAILWIND_PALETTES)).not.toContain("zinc")
    expect(Object.keys(TAILWIND_PALETTES)).not.toContain("stone")
    expect(Object.keys(TAILWIND_PALETTES)).toContain("neutral")
    expect(
      Object.values(TAILWIND_PALETTES).every((colors) => colors.length === 11)
    ).toBe(true)
    // Overflow should not recompute on every selection revision (layout shift).
    expect(toolbarSource).not.toContain("snapshot.revision, zoom")
    expect(toolbarSource).toContain("h-12 min-h-12")
    expect(toolbarSource).toContain('variant="ghost"')
    expect(toolbarSource).toContain("FONT_SIZE_OPTIONS")
    expect(toolbarSource).toContain("FontSizeControl")
    expect(toolbarSource).toContain('label="Open table options"')
    expect(toolbarSource).toContain("tableOptionsOpen")
    expect(toolbarSource).toContain('event.key !== "Enter"')
    expect(toolbarSource).toContain("apex-editor-toolbar__font-size-input")
  })

  test("custom color picker normalizes hex and round-trips HSV colors", () => {
    expect(normalizeHexColor("abc")).toBe("#aabbcc")
    expect(normalizeHexColor("#2563EB")).toBe("#2563eb")
    expect(normalizeHexColor("#12xz89")).toBeNull()
    expect(hsvToHex(hexToHsv("#2563eb"))).toBe("#2563eb")
    expect(hsvToHex(hexToHsv("#ffffff"))).toBe("#ffffff")
    expect(hsvToHex(hexToHsv("#000000"))).toBe("#000000")
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
    expect(EDITOR_CSS).toContain(
      ".apex-editor-surface .ProseMirror-focused .ProseMirror-gapcursor"
    )
    expect(EDITOR_CSS).toContain(
      ".apex-editor-surface .ProseMirror-gapcursor:has(+ .tableWrapper)::after"
    )
  })

  test("page sheets do not size a multi-page section as one Letter box", () => {
    expect(EDITOR_CSS).not.toContain("content-visibility: auto")
    expect(EDITOR_CSS).not.toContain("contain-intrinsic-size")
    expect(EDITOR_CSS).toContain("apex-engine-page-sheet")
    expect(EDITOR_CSS).toContain("--apex-sheet-height")
    expect(EDITOR_CSS).toContain("var(--apex-section-pages, 1)")
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
    expect(
      alignmentFromRects({ left: 120, width: 408 }, { left: 40 }, 816)
    ).toEqual({
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
    expect(menu).toContain("Microsoft Word (.docx)")
    expect(menu).toContain("<MenubarItem onClick={actions.onSaveDocx}>")
    expect(menu).toContain("PDF Document (.pdf)")
    expect(menu).toContain("Tag…")
    expect(menu).toContain("Tags sidebar")
    expect(menu).not.toContain("Download as PDF")
    expect(editor).toContain("printPdfBytes")
    expect(editor).toContain("serializeEmbedPdf")
    expect(editor).not.toContain("window.print()")
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

  test("print preview paints the display list without layout-trace font fallback labels", () => {
    const preview = readFileSync(
      join(import.meta.dir, "../src/ui/PrintPreview.tsx"),
      "utf8"
    )
    const editor = readFileSync(
      join(import.meta.dir, "../src/ui/Editor.tsx"),
      "utf8"
    )
    expect(preview).toContain("DisplayListPreview")
    expect(preview).not.toContain("layoutTrace")
    expect(preview).not.toContain("font fallback")
    expect(editor).toContain(
      "<PrintPreview displayList={layoutResult.displayList} />"
    )
  })
})
