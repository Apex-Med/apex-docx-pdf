export { editorSchema } from "./schema"
export {
  toSemanticDocument,
  fromSemanticDocument,
  createEmptyEditorDoc,
} from "./model/bridge"
export {
  pageBreaksFromTrace,
  mergeManualPageBreakPlacements,
  positionForParagraphOffset,
  paginationSignature,
  decorationKeyForPlacement,
  applyBreakSpacerGeometry,
  spacerSpecsFromPlacements,
  createBreakSpacerElement,
  detectOversizedNonSplittable,
  sectionStackHeightTwips,
  sectionPageCountsFromLayout,
  applySectionPageCountsToDom,
  PAGE_BREAK_SCROLL_META,
  PAGE_GAP_TWIPS,
  type PageBreakPlacement,
  type SpacerSpec,
  type OversizedBlockDiagnostic,
  type SectionPageCount,
} from "./pagination/breaks"
export {
  handleLayoutRequest,
  type LayoutWorkerRequest,
  type LayoutWorkerOutbound,
} from "./pagination/protocol"
export {
  createPaginationPlugin,
  paginationPluginKey,
  mapPaginationThroughTransaction,
  type PaginationPluginState,
  type PaginationPluginOptions,
  type PaginationLayoutFn,
} from "./pagination/plugin"
export {
  toggleBold,
  toggleItalic,
  toggleUnderline,
  toggleStrikethrough,
  setTextColor,
  setHighlightColor,
  setLink,
  removeLink,
  toggleLink,
  setFontFamily,
  setFontWeight,
  setFontSize,
  setParagraphAlignment,
  setParagraphSpacing,
  setParagraphAttrs,
  INDENT_STEP_TWIPS,
  increaseIndent,
  decreaseIndent,
  handleTab,
  handleShiftTab,
  backspaceDecreaseIndent,
  clearFormatting,
  setVerticalAlignment,
  applyBulletList,
  applyNumberedList,
  createBulletNumberingDefinition,
  createDecimalNumberingDefinition,
  applyParagraphStyle,
  applyDefinedParagraphStyle,
  updateDefinedParagraphStyle,
  matchStyleToSelection,
  insertPageBreak,
  insertColumnBreak,
  insertTemplateTag,
  insertTemplateMarker,
  insertTemplateImage,
  wrapTemplateRegion,
  updateTemplateTagInstances,
  removeTemplateTagInstances,
  arrowPastTemplateTag,
  deleteAdjacentTemplateTag,
  insertImage,
  insertImageFromBytes,
  setImageAltText,
  insertTable,
  imageAssetFromTransaction,
  numberingDefinitionFromTransaction,
  IMAGE_ASSET_META,
  NUMBERING_DEFINITION_META,
  BULLET_NUMBERING_ID,
  DECIMAL_NUMBERING_ID,
  setSectionPageSetup,
  setSectionHeaderFooter,
  setSectionColumns,
  setCellShading,
  setCellHorizontalAlignment,
  setCellVerticalAlignment,
  setCellBorder,
  setCellBorderStyle,
  setSelectedCellBorderStyle,
  setTableBorderStyle,
  selectedTableCellPositions,
  selectedTableCellGrid,
  selectedTableCellBorders,
  selectedTableSizing,
  setTableSizing,
  setTableWidthMode,
  setSelectedColumnSizing,
  selectEnclosingTable,
  selectCurrentTableColumn,
  selectCurrentTableRow,
  selectTableColumn,
  selectTableRow,
  moveTableRow,
  moveTableColumn,
  moveCurrentTableRow,
  moveCurrentTableColumn,
  findEnclosingTable,
  tableHasMergedSpans,
  setTableAttrs,
  setRowAttrs,
  editorKeymap,
  createLinkKeymap,
  tableCommands,
  splitOrCreateParagraph,
  backspaceCommand,
  deleteCommand,
  insertLineBreak,
  type CellBorderSpec,
  type CellBorderSide,
  type SelectedCellBorderTarget,
  type SelectedTableCellGrid,
  type SelectedTableCellBorders,
  type SelectedTableSizing,
  type EnclosingTable,
  type TableReorderAxis,
} from "./commands"
export {
  createLayoutClient,
  getLayoutAsync,
  layoutInProcess,
  type LayoutClient,
} from "./pagination/layout-client"
export { decorationsFromPlacements } from "./pagination/plugin"
export {
  BUILTIN_FONT_INDEX,
  EDITOR_FONT_FAMILIES,
  GOOGLE_FONT_FAMILIES,
  TAILWIND_PALETTES,
  injectDomFontFaces,
  injectGoogleFontStylesheet,
  injectEmbeddedDocumentFonts,
  fontRegistryForDocument,
  fontRegistryForExport,
  workerFontUrls,
  loadWorkerFontBytes,
  loadGoogleFontCatalog,
  searchGoogleFonts,
  findGoogleFontFamily,
  availableFontWeights,
  nearestAvailableFontWeight,
  fontWeightLabel,
  ensureFontLoaded,
  registerFontWithWorker,
  familyToSlug,
  snapToFontWeight,
  type FontIndex,
  type FontFaceEntry,
  type CustomPalette,
  type GoogleFontCatalog,
  type GoogleFontFamily,
  type EnsureFontLoadedResult,
  type RegisterFontCallback,
} from "./fonts"
export { createEditorPlugins } from "./plugins/create-plugins"
export { createTemplateBlocksPlugin } from "./plugins/template-blocks"
export {
  applyTemplateTagValues,
  defaultTemplateTags,
  encodeTemplateImage,
  encodeTemplateMarker,
  encodeTemplatePlaceholder,
  findImagePlaceholders,
  findValuePlaceholders,
  hydrateTemplateTagCatalog,
  isPrintedAtTag,
  isSystemTemplateTag,
  isTodayTag,
  isValidTemplatePath,
  mergeDefaultTemplateTags,
  paragraphIsStandaloneMarker,
  readTemplateTagMetadata,
  slugifyLabel,
  uniqueSlug,
  writeTemplateTagMetadata,
  type TemplateTagDefinition,
  type TemplateTagKind,
  type TemplateTagSource,
  type TemplateTagValue,
} from "./tags"
export {
  createImagePasteDropPlugin,
  insertImageFile,
} from "./plugins/image-paste-drop"
export {
  createSelectionStatePlugin,
  getSelectionSnapshot,
  selectionStatePluginKey,
  type EditorSelectionSnapshot,
} from "./plugins/selection-state"
export {
  caretAroundTable,
  createTableCaretPlugin,
  tableClickSide,
} from "./plugins/table-caret"
export {
  createTemplateTagCaretPlugin,
  ensureTemplateTagCaretAnchors,
  isTemplateTagCaretAnchor,
  tagSelectionDecorations,
  templateTagClickSide,
  templateTagPositionsInSelection,
  TEMPLATE_TAG_IN_SELECTION_CLASS,
} from "./plugins/template-tag-caret"
export {
  createTemplateTagDropPlugin,
  parsePlainTagId,
  resolveTagDropPosition,
} from "./plugins/template-tag-drop"
export {
  createTableContextMenuPlugin,
  tableContextMenuItems,
  selectionIsInTable,
  tableContextMenuPluginKey,
} from "./plugins/table-context-menu"
export {
  transformCssForShadowDom,
  hoistPropertyRulesToDocument,
  ApexDocxEditorElement,
  defineApexDocxEditorElement,
  loadEmbed,
  parseEmbedDocx,
  serializeEmbedDocx,
  serializeEmbedPdf,
  toUint8Array,
  type EmbedChangeDetail,
  type EmbedErrorDetail,
} from "./embed"
export {
  ApexEditor,
  mountEditor,
  type ApexEditorProps,
  type ApexEditorHandle,
  type EditorMountOptions,
  type EditorController,
} from "./ui/Editor"
export { MenuBar, type MenuBarProps } from "./ui/MenuBar"
export {
  applyHeaderFooterBlocks,
  applyHeaderFooterEdit,
  headerFooterDefinition,
  headerFooterDefinitionId,
  headerFooterEditorDocument,
  headerFooterText,
  setDifferentFirstPage,
  HEADER_FOOTER_CONTENT_TR_META,
  HEADER_FOOTER_EDIT_REQUEST_EVENT,
  type HeaderFooterEdit,
  type HeaderFooterEditRequestDetail,
  type HeaderFooterKind,
  type HeaderFooterVariant,
} from "./header-footer"
export {
  HeaderFooterDialog,
  type HeaderFooterDialogProps,
} from "./ui/HeaderFooterDialog"
export { Toolbar, type ToolbarProps } from "./ui/Toolbar"
export {
  EDITOR_PREFERENCES_STORAGE_KEY,
  normalizeEditorPreferences,
  useEditorPreferences,
  type EditorPreferencesState,
  type EditorPreferenceValues,
} from "./ui/editor-preferences"
export {
  ScrubbableNumberInput,
  ScrubbableNumberLabel,
  ScrubbableNumberDisclosure,
  type ScrubbableNumberInputProps,
} from "./ui/ScrubbableNumberInput"
export {
  Ruler,
  alignmentFromRects,
  type RulerProps,
  type TabStop,
} from "./ui/Ruler"
export { EditorChrome, type EditorChromeProps } from "./ui/EditorChrome"
export type {
  EditorChromeActions,
  EditorChromeResources,
  EditorChromeViewState,
  ParagraphAlignment,
  ParagraphSpacingOptions,
} from "./ui/chrome-types"
export {
  ZOOM_PRESETS,
  TWIPS_PER_INCH,
  FONT_SIZE_OPTIONS,
  DARK_PAGES_STORAGE_KEY,
  readDarkPagesPreference,
  writeDarkPagesPreference,
} from "./ui/chrome-types"
export { FontPicker, type FontPickerProps } from "./ui/FontPicker"
export { LinkDialog, type LinkDialogProps } from "./ui/LinkDialog"
export { ImageOptions, type ImageOptionsProps } from "./ui/ImageOptions"
export { PrintPreview, type PrintPreviewProps } from "./ui/PrintPreview"
export {
  DivergenceOverlay,
  type DivergenceOverlayProps,
} from "./ui/DivergenceOverlay"
export {
  PageSetupDialog,
  twipsToUnit,
  unitToTwips,
  PAPER_SIZES,
  type PageSetupDialogProps,
  type PageSetupOptions,
  type PageSetupUnit,
  type PaperSizeId,
} from "./ui/PageSetupDialog"
export {
  TablePropertiesDialog,
  type TablePropertiesDialogProps,
  type TablePropertiesOptions,
} from "./ui/TablePropertiesDialog"
export {
  TableReorderOverlay,
  type TableReorderOverlayProps,
} from "./ui/TableReorderOverlay"
export {
  FindReplaceDialog,
  findTextInDoc,
  type FindReplaceDialogProps,
} from "./ui/FindReplaceDialog"
export {
  LineSpacingDialog,
  LINE_SPACING_PRESETS,
  type LineSpacingDialogProps,
  type LineSpacingOptions,
} from "./ui/LineSpacingDialog"
export { ColumnsDialog, type ColumnsDialogProps } from "./ui/ColumnsDialog"
export { StyleDialog, type StyleDialogProps } from "./ui/StyleDialog"

import { createBlankDocument, type SemanticDocument } from "@apexmed/core"
import { normaliseDocxBytes } from "@apexmed/docx"
import { EditorState } from "prosemirror-state"

import {
  imageAssetFromTransaction,
  numberingDefinitionFromTransaction,
} from "./commands"
import { fromSemanticDocument, toSemanticDocument } from "./model/bridge"
import { createEditorPlugins } from "./plugins/create-plugins"
import { editorSchema } from "./schema"

/**
 * Create a ready-to-use EditorState for a blank document or a normalised DOCX.
 * Primary consumer entry point for package-import smoke tests.
 */
export function createEditorStateFromDocument(
  document: SemanticDocument = createBlankDocument()
): EditorState {
  return EditorState.create({
    schema: editorSchema,
    doc: fromSemanticDocument(document),
    plugins: createEditorPlugins({
      enablePagination: false,
      forceInProcessLayout: true,
      structuralOnly: true,
    }),
  })
}

/**
 * Load DOCX bytes into an EditorState. Throws when parse/normalise fails.
 */
export function createEditorStateFromDocx(bytes: Uint8Array): EditorState {
  const result = normaliseDocxBytes(bytes)
  if (!result.ok) {
    throw new Error(
      result.diagnostics.map((entry) => entry.message).join("; ") ||
        "Failed to parse DOCX"
    )
  }
  return createEditorStateFromDocument(result.value)
}

/** Apply a command and return the updated semantic document. */
export function applyCommandToSemantic(
  state: EditorState,
  command: (
    state: EditorState,
    dispatch?: (tr: import("prosemirror-state").Transaction) => void
  ) => boolean,
  bridgeOptions?: Parameters<typeof toSemanticDocument>[1]
): { state: EditorState; document: SemanticDocument; applied: boolean } {
  let next = state
  let imageAsset: import("@apexmed/core").SemanticImageAsset | null = null
  let numberingDefinition: import("@apexmed/core").NumberingDefinition | null =
    null
  const applied = command(state, (tr) => {
    imageAsset = imageAssetFromTransaction(tr)
    numberingDefinition = numberingDefinitionFromTransaction(tr)
    next = state.apply(tr)
  })
  const assets = imageAsset
    ? [
        ...(bridgeOptions?.assets ?? []).filter(
          (asset) => asset.id !== imageAsset?.id
        ),
        imageAsset,
      ]
    : bridgeOptions?.assets
  const numberingDefinitions = numberingDefinition
    ? [
        ...(bridgeOptions?.numberingDefinitions ?? []).filter(
          (definition) => definition.id !== numberingDefinition?.id
        ),
        numberingDefinition,
      ]
    : bridgeOptions?.numberingDefinitions
  return {
    state: next,
    document: toSemanticDocument(next.doc, {
      ...bridgeOptions,
      assets,
      numberingDefinitions,
    }),
    applied,
  }
}
