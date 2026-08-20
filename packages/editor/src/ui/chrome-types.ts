import type { CustomPalette, FontIndex, GoogleFontCatalog } from "../fonts"
import type { EditorSelectionSnapshot } from "../plugins/selection-state"

export type ParagraphAlignment = "left" | "center" | "right" | "justify"

export type EditorWorkspaceTab = "document" | "form" | "preview"

export const EDITOR_WORKSPACE_TABS = [
  ["document", "Document"],
  ["form", "Form"],
  ["preview", "Preview"],
] as const satisfies ReadonlyArray<readonly [EditorWorkspaceTab, string]>

export type ParagraphSpacingOptions = Readonly<{
  spacingBefore?: number
  spacingAfter?: number
  lineSpacing?: Readonly<{ rule: "auto"; value240ths: number }> | null
}>

export type EditorChromeActions = Readonly<{
  onNew: () => void
  onOpenDocx: (file: File) => void
  onSaveDocx: () => void
  onExportPdf: () => void
  onPrint: () => void
  onPageSetup: () => void
  onUndo: () => void
  onRedo: () => void
  onCut: () => void
  onCopy: () => void
  onPaste: () => void
  onSelectAll: () => void
  onFindReplace: () => void
  onToggleRuler: () => void
  onToggleDarkPages: () => void
  onTogglePreview: () => void
  onToggleDivergence: () => void
  onZoomChange: (percent: number) => void
  onInsertImage: (file: File) => void
  onInsertHeader: () => void
  onInsertFooter: () => void
  onInsertTable: (rows?: number, columns?: number) => void
  onInsertPageBreak: () => void
  onInsertLink: () => void
  onInsertColumnBreak: () => void
  onInsertTag: () => void
  onToggleTagsSidebar: () => void
  onWorkspaceTabChange: (tab: EditorWorkspaceTab) => void
  onBold: () => void
  onItalic: () => void
  onUnderline: () => void
  onStrikethrough: () => void
  onVerticalAlignment: (
    alignment: "baseline" | "superscript" | "subscript"
  ) => void
  onTextColor: (color: string) => void
  onHighlightColor: (color: string) => void
  onAlign: (alignment: ParagraphAlignment) => void
  onLineSpacing: () => void
  onParagraphSpacing: (options: ParagraphSpacingOptions) => void
  onColumns: () => void
  onClearFormatting: () => void
  onApplyStyle: (styleId: string | null) => void
  onMatchStyle: () => void
  onCreateStyle: () => void
  onUpdateStyle: (styleId?: string) => void
  onPaintFormat: () => void
  onBulletList: () => void
  onNumberedList: () => void
  onIndentDecrease: () => void
  onIndentIncrease: () => void
  onFontFamily: (family: string, weight?: number) => void
  onFontSize: (fontSizeTwips: number) => void
  onWordCount: () => void
  onTableInsert: () => void
  onTableAddRowBefore: () => void
  onTableAddRowAfter: () => void
  onTableAddColumnBefore: () => void
  onTableAddColumnAfter: () => void
  onTableDeleteRow: () => void
  onTableDeleteColumn: () => void
  onTableMergeCells: () => void
  onTableSplitCell: () => void
  onTableProperties: () => void
  onMarginsChange: (options: {
    marginLeft?: number
    marginRight?: number
  }) => void
  onIndentsChange: (options: {
    indentStart?: number
    firstLineIndent?: number
  }) => void
  onTabStopsChange: (
    tabStops: readonly { position: number; alignment: "left" }[]
  ) => void
}>

export type EditorChromeViewState = Readonly<{
  snapshot: EditorSelectionSnapshot
  zoom: number
  rulerVisible: boolean
  darkPages: boolean
  previewOn: boolean
  divergenceOn: boolean
  printLayout: boolean
  tableOptionsOpen: boolean
  tagsSidebarOpen: boolean
  workspaceTab: EditorWorkspaceTab
}>

export const DARK_PAGES_STORAGE_KEY = "apex-editor-dark-pages"

export function readDarkPagesPreference(): boolean {
  if (typeof localStorage === "undefined") return false
  try {
    const stored = localStorage.getItem(DARK_PAGES_STORAGE_KEY)
    if (stored === "false") return false
    if (stored === "true") return true
  } catch {
    // Ignore unavailable storage.
  }
  return false
}

export function writeDarkPagesPreference(enabled: boolean): void {
  if (typeof localStorage === "undefined") return
  try {
    localStorage.setItem(DARK_PAGES_STORAGE_KEY, enabled ? "true" : "false")
  } catch {
    // Ignore quota errors.
  }
}

export type EditorChromeResources = Readonly<{
  fonts: FontIndex
  googleFonts?: readonly string[]
  fontCatalog?: GoogleFontCatalog
  styleNames: readonly { id: string; name: string }[]
  palettes: Readonly<Record<string, readonly string[]>>
  customPalettes: readonly CustomPalette[]
  onCustomPalettesChange: (palettes: CustomPalette[]) => void
}>

export const ZOOM_PRESETS = [50, 75, 100, 125, 150, 200] as const

export const TWIPS_PER_INCH = 1440

export const FONT_SIZE_OPTIONS: ReadonlyArray<readonly [string, string]> = [
  ["160", "8"],
  ["180", "9"],
  ["200", "10"],
  ["220", "11"],
  ["240", "12"],
  ["280", "14"],
  ["360", "18"],
  ["480", "24"],
  ["720", "36"],
  ["960", "48"],
  ["1200", "60"],
  ["1440", "72"],
  ["1920", "96"],
]
