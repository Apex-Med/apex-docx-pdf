import {
  createBlankDocument,
  createEmptyDocumentStyles,
  resolveStyles,
  twips,
  type SemanticDocument,
  type SemanticImageAsset,
  type StyleDefinition,
} from "@apexmed/core"
import { normaliseDocxBytes, serializeDocx } from "@apexmed/docx"
import {
  answersToTagValues,
  createEmptyForm,
  formFromMetadata,
  readFormAnswers,
  tagsFromForm,
  writeFormMetadata,
  type FormAnswers,
  type FormTemplate,
} from "@apexmed/forms"
import { FormBuilder } from "@apexmed/forms/ui"
import { layoutDocument } from "@apexmed/layout"
import { selectAll } from "prosemirror-commands"
import { redo, undo } from "prosemirror-history"
import { EditorState, type Command } from "prosemirror-state"
import { EditorView } from "prosemirror-view"
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { createRoot, type Root } from "react-dom/client"
import { flushSync } from "react-dom"

import {
  parseEmbedDocx,
  serializeEmbedDocx,
  serializeEmbedPdf,
} from "../embed/helpers"

import {
  applyBulletList,
  applyDefinedParagraphStyle,
  applyNumberedList,
  applyParagraphStyle,
  clearFormatting,
  decreaseIndent,
  increaseIndent,
  imageAssetFromTransaction,
  insertColumnBreak,
  insertPageBreak,
  insertTable,
  insertTemplateTag,
  removeTemplateTagInstances,
  updateTemplateTagInstances,
  matchStyleToSelection,
  numberingDefinitionFromTransaction,
  removeLink,
  setCellShading,
  setFontFamily,
  setFontWeight,
  setFontSize,
  setHighlightColor,
  setLink,
  setParagraphAlignment,
  setParagraphSpacing,
  setParagraphAttrs,
  setRowAttrs,
  setSelectedCellBorderStyle,
  setTableSizing,
  selectedTableSizing,
  selectCurrentTableColumn,
  selectEnclosingTable,
  setSectionColumns,
  setSectionPageSetup,
  selectedTableCellPositions,
  selectedTableCellBorders,
  selectedTableCellGrid,
  setTableAttrs,
  setTextColor,
  tableCommands,
  toggleBold,
  toggleItalic,
  toggleStrikethrough,
  toggleUnderline,
  updateDefinedParagraphStyle,
  setVerticalAlignment,
} from "../commands"
import { insertImageFile } from "../plugins/image-paste-drop"
import {
  BUILTIN_FONT_INDEX,
  GOOGLE_FONT_FAMILIES,
  GOOGLE_FONT_CATALOG_FALLBACK,
  TAILWIND_PALETTES,
  findGoogleFontFamily,
  injectDomFontFaces,
  injectEmbeddedDocumentFonts,
  injectGoogleFontFamilyStylesheet,
  injectGoogleFontStylesheet,
  loadGoogleFontCatalog,
  type CustomPalette,
  type GoogleFontCatalog,
} from "../fonts"
import { fromSemanticDocument, toSemanticDocument } from "../model/bridge"
import {
  applyHeaderFooterBlocks,
  HEADER_FOOTER_CONTENT_TR_META,
  HEADER_FOOTER_EDIT_REQUEST_EVENT,
  setDifferentFirstPage,
  type HeaderFooterEditRequestDetail,
  type HeaderFooterKind,
  type HeaderFooterVariant,
} from "../header-footer"
import { createImageNodeView } from "../node-views/image"
import { createTemplateTagNodeView } from "../node-views/template-tag"
import {
  applyTemplateTagValues,
  hydrateTemplateTagCatalog,
  mergeDefaultTemplateTags,
  readTemplateTagMetadata,
  TEMPLATE_TAG_VALUES_TR_META,
  useTemplateTagStore,
  writeTemplateTagMetadata,
  type TemplateTagDefinition,
} from "../tags"
import { createEditorPlugins } from "../plugins/create-plugins"
import {
  getSelectionSnapshot,
  type EditorSelectionSnapshot,
} from "../plugins/selection-state"
import { editorSchema } from "../schema"
import { EDITOR_CSS } from "../styles/editor-css"
import { DivergenceOverlay } from "./DivergenceOverlay"
import { EditorChrome } from "./EditorChrome"
import type { EditorChromeActions } from "./chrome-types"
import { ColumnsDialog } from "./ColumnsDialog"
import { useEditorPreferences } from "./editor-preferences"
import { FindReplaceDialog } from "./FindReplaceDialog"
import { FormPreview } from "./FormPreview"
import { HeaderFooterEditor } from "./HeaderFooterEditor"
import { LinkDialog } from "./LinkDialog"
import { LineSpacingDialog } from "./LineSpacingDialog"
import { PageSetupDialog, type PageSetupUnit } from "./PageSetupDialog"
import { paragraphStyleOptions } from "./paragraph-style-options"
import { styleFromSelection, styleIdFromName } from "./style-from-selection"
import { printPdfBytes } from "./print-pdf"
import { PrintPreview } from "./PrintPreview"
import { TablePropertiesDialog } from "./TablePropertiesDialog"
import { TableReorderOverlay } from "./TableReorderOverlay"
import { StyleDialog } from "./StyleDialog"
import { InsertTagDialog } from "./InsertTagDialog"
import { TagEditorDialog } from "./TagEditorDialog"
import { TagsSidebar } from "./TagsSidebar"

function ensureEditorStyles(): void {
  if (typeof document === "undefined") return
  let style = document.getElementById("apex-editor-styles")
  if (!(style instanceof HTMLStyleElement)) {
    style = document.createElement("style")
    style.id = "apex-editor-styles"
    document.head.appendChild(style)
  }
  if (style.textContent !== EDITOR_CSS) {
    style.textContent = EDITOR_CSS
  }
}

type HeaderFooterEditingState = Readonly<{
  kind: HeaderFooterKind
  sectionId: string
  variant: HeaderFooterVariant
  differentFirstPage: boolean
  initialDocument: SemanticDocument
}>

function selectedSectionId(state: EditorState): string | null {
  const { $from } = state.selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.type.name === "section") {
      return node.attrs.nodeId ? String(node.attrs.nodeId) : null
    }
  }
  return null
}

const EMPTY_SNAPSHOT: EditorSelectionSnapshot = {
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  textStyle: {
    fontFamily: "Inter",
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
  paragraph: null,
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

const FALLBACK_FONT_CATALOG: GoogleFontCatalog = Object.freeze({
  version: 0,
  families: GOOGLE_FONT_CATALOG_FALLBACK,
  source: "fallback",
})

function builtInStyle(
  styleId: string,
  document: SemanticDocument
): StyleDefinition | null {
  const defaults = (document.styles ?? createEmptyDocumentStyles()).defaults
  if (styleId === "Normal") {
    return {
      id: "Normal",
      name: "Normal text",
      type: "paragraph",
      basedOn: null,
      next: "Normal",
      paragraph: defaults.paragraph,
      text: defaults.text,
    }
  }
  const presets: Record<
    string,
    {
      name: string
      size: number
      weight: 400 | 700
      before: number
      after: number
    }
  > = {
    Heading1: {
      name: "Heading 1",
      size: 400,
      weight: 700,
      before: 320,
      after: 120,
    },
    Heading2: {
      name: "Heading 2",
      size: 320,
      weight: 700,
      before: 280,
      after: 100,
    },
    Title: {
      name: "Title",
      size: 520,
      weight: 400,
      before: 0,
      after: 240,
    },
  }
  const preset = presets[styleId]
  if (!preset) return null
  return {
    id: styleId,
    name: preset.name,
    type: "paragraph",
    basedOn: "Normal",
    next: "Normal",
    paragraph: {
      spacingBefore: twips(preset.before),
      spacingAfter: twips(preset.after),
      keepWithNext: styleId.startsWith("Heading"),
    },
    text: {
      ...defaults.text,
      fontSize: twips(preset.size),
      fontWeight: preset.weight,
    },
  }
}

export type EditorMountOptions = Readonly<{
  shadowRoot?: ShadowRoot
  initialDocument?: SemanticDocument
  onChange?: (document: SemanticDocument) => void
  /** When true, ProseMirror `editable` is false. */
  readOnly?: boolean
  /** When true, layout runs in-process (tests). Default: Worker off main thread. */
  forceInProcessLayout?: boolean
}>

/** Imperative API returned by `mountEditor` and used by `<apex-docx-editor>`. */
export type EditorController = Readonly<{
  destroy: () => void
  loadDocx: (bytes: Uint8Array | ArrayBuffer) => Promise<void>
  getDocx: () => Promise<Uint8Array>
  getPdf: () => Promise<Uint8Array>
  setReadOnly: (value: boolean) => void
  getDocument: () => SemanticDocument | null
}>

export type ApexEditorHandle = Readonly<{
  loadDocument: (document: SemanticDocument) => void
  loadDocx: (bytes: Uint8Array | ArrayBuffer) => Promise<void>
  getDocument: () => SemanticDocument
  getDocx: () => Promise<Uint8Array>
  getPdf: () => Promise<Uint8Array>
  setReadOnly: (value: boolean) => void
}>

export type ApexEditorProps = Readonly<{
  initialDocument?: SemanticDocument
  className?: string
  showPreview?: boolean
  showDivergence?: boolean
  onDocumentChange?: (document: SemanticDocument) => void
  forceInProcessLayout?: boolean
  /** When true, the surface is not editable. */
  readOnly?: boolean
  /** Shadow root or host for Base UI portals (embed). */
  portalContainer?: HTMLElement | ShadowRoot | null
}>

function createEditorState(
  document: SemanticDocument,
  options: {
    layoutEnabled: boolean
    forceInProcessLayout?: boolean
    openLinkCommand?: Command
    getBridgeContext: () => {
      assets: readonly SemanticImageAsset[]
      fontAssets: SemanticDocument["fontAssets"]
      styles: SemanticDocument["styles"]
      headers: SemanticDocument["headers"]
      footers: SemanticDocument["footers"]
      numberingDefinitions: SemanticDocument["numberingDefinitions"]
      editorMetadata: SemanticDocument["editorMetadata"]
    }
  }
): EditorState {
  const plugins = createEditorPlugins({
    enablePagination: options.layoutEnabled,
    forceInProcessLayout: options.forceInProcessLayout,
    openLinkCommand: options.openLinkCommand,
    structuralOnly:
      typeof globalThis.document === "undefined" ||
      options.forceInProcessLayout === true,
    toSemantic: (state) => {
      const ctx = options.getBridgeContext()
      return applyTemplateTagValues(toSemanticDocument(state.doc, ctx))
    },
  })
  return EditorState.create({
    schema: editorSchema,
    doc: fromSemanticDocument(document),
    plugins,
  })
}

function editorNodeViews() {
  return {
    image: createImageNodeView,
    template_tag: createTemplateTagNodeView,
  }
}

function definitionsFromForm(form: FormTemplate): TemplateTagDefinition[] {
  return tagsFromForm(form).map((tag) => ({
    id: tag.id,
    label: tag.label,
    slug: tag.slug,
    kind: tag.kind,
    source: "form" as const,
    ...(tag.date ? { date: tag.date } : {}),
  }))
}

function mergeCatalogWithForm(
  tags: readonly TemplateTagDefinition[],
  form: FormTemplate
): TemplateTagDefinition[] {
  return [
    ...tags.filter((tag) => tag.source !== "form"),
    ...definitionsFromForm(form),
  ]
}

type TableOptionsSelection = Readonly<{
  positions: readonly number[]
  grid: ReturnType<typeof selectedTableCellGrid>
  borders: ReturnType<typeof selectedTableCellBorders>
  sizing: NonNullable<ReturnType<typeof selectedTableSizing>> | null
}>

function readTableOptionsSelection(state: EditorState): TableOptionsSelection {
  return {
    positions: selectedTableCellPositions(state),
    grid: selectedTableCellGrid(state),
    borders: selectedTableCellBorders(state),
    sizing: selectedTableSizing(state),
  }
}

export const ApexEditor = forwardRef<ApexEditorHandle, ApexEditorProps>(
  function ApexEditor(
    {
      initialDocument,
      className,
      showPreview = false,
      showDivergence = false,
      onDocumentChange,
      forceInProcessLayout = false,
      readOnly: readOnlyProp = false,
      portalContainer = null,
    },
    ref
  ): ReactNode {
    const rootRef = useRef<HTMLDivElement | null>(null)
    const hostRef = useRef<HTMLDivElement | null>(null)
    const viewRef = useRef<EditorView | null>(null)
    const activeHeaderFooterViewRef = useRef<EditorView | null>(null)
    const documentRef = useRef<SemanticDocument>(
      initialDocument ?? createBlankDocument()
    )
    const readOnlyRef = useRef(readOnlyProp)
    const [readOnly, setReadOnlyState] = useState(readOnlyProp)
    readOnlyRef.current = readOnly
    const [document, setDocument] = useState<SemanticDocument>(
      () => documentRef.current
    )
    const [previewOn, setPreviewOn] = useState(showPreview)
    const [divergenceOn, setDivergenceOn] = useState(showDivergence)
    const previewOnRef = useRef(previewOn)
    const divergenceOnRef = useRef(divergenceOn)
    previewOnRef.current = previewOn
    divergenceOnRef.current = divergenceOn
    const rulerVisible = useEditorPreferences((state) => state.rulerVisible)
    const toggleRulerVisible = useEditorPreferences(
      (state) => state.toggleRulerVisible
    )
    const darkPages = useEditorPreferences((state) => state.darkPages)
    const toggleDarkPages = useEditorPreferences(
      (state) => state.toggleDarkPages
    )
    const zoom = useEditorPreferences((state) => state.zoom)
    const setZoom = useEditorPreferences((state) => state.setZoom)
    const [pageSetupOpen, setPageSetupOpen] = useState(false)
    const [linkOpen, setLinkOpen] = useState(false)
    const [findReplaceOpen, setFindReplaceOpen] = useState(false)
    const [lineSpacingOpen, setLineSpacingOpen] = useState(false)
    const [headerFooterEditing, setHeaderFooterEditing] =
      useState<HeaderFooterEditingState | null>(null)
    const headerFooterEditingRef = useRef(headerFooterEditing)
    headerFooterEditingRef.current = headerFooterEditing
    const mainDocumentEditable = !readOnly && headerFooterEditing === null
    const [tablePropsOpen, setTablePropsOpen] = useState(false)
    const tablePropsOpenRef = useRef(tablePropsOpen)
    tablePropsOpenRef.current = tablePropsOpen
    const [tableOptionsSelection, setTableOptionsSelection] =
      useState<TableOptionsSelection>({
        positions: [],
        grid: { rows: 1, columns: 1, cellCount: 0 },
        borders: {},
        sizing: null,
      })
    const [columnsOpen, setColumnsOpen] = useState(false)
    const [styleDialogOpen, setStyleDialogOpen] = useState(false)
    const [tagEditorOpen, setTagEditorOpen] = useState(false)
    const [tagEditorMode, setTagEditorMode] = useState<"create" | "edit">(
      "create"
    )
    const [editingTag, setEditingTag] = useState<TemplateTagDefinition | null>(
      null
    )
    const [insertTagOpen, setInsertTagOpen] = useState(false)
    const tagsSidebarOpen = useEditorPreferences(
      (state) => state.tagsSidebarOpen
    )
    const tagsSidebarWidth = useEditorPreferences(
      (state) => state.tagsSidebarWidth
    )
    const setTagsSidebarWidth = useEditorPreferences(
      (state) => state.setTagsSidebarWidth
    )
    const tableOptionsWidth = useEditorPreferences(
      (state) => state.tableOptionsWidth
    )
    const setTableOptionsWidth = useEditorPreferences(
      (state) => state.setTableOptionsWidth
    )
    const toggleTagsSidebarOpen = useEditorPreferences(
      (state) => state.toggleTagsSidebarOpen
    )
    const workspaceTab = useEditorPreferences((state) => state.workspaceTab)
    const setWorkspaceTab = useEditorPreferences(
      (state) => state.setWorkspaceTab
    )
    const [formTemplate, setFormTemplate] = useState<FormTemplate>(() =>
      formFromMetadata(document.editorMetadata)
    )
    const [formAnswers, setFormAnswers] = useState<FormAnswers>(() =>
      readFormAnswers(document.editorMetadata)
    )
    const formTemplateRef = useRef(formTemplate)
    formTemplateRef.current = formTemplate
    const formAnswersRef = useRef(formAnswers)
    formAnswersRef.current = formAnswers
    const templateTags = useTemplateTagStore((state) => state.tags)
    const templateTagValues = useTemplateTagStore((state) => state.values)
    const pageUnit = useEditorPreferences((state) => state.pageUnit)
    const setPageUnit = useEditorPreferences((state) => state.setPageUnit)
    const openLinkRef = useRef<() => void>(() => undefined)
    const [selectionSnapshot, setSelectionSnapshot] =
      useState<EditorSelectionSnapshot>(EMPTY_SNAPSHOT)
    const [customPalettes, setCustomPalettes] = useState<CustomPalette[]>(
      () => {
        const meta = document.editorMetadata as
          { customPalettes?: CustomPalette[] } | undefined
        return meta?.customPalettes ?? []
      }
    )
    const customPalettesRef = useRef(customPalettes)
    customPalettesRef.current = customPalettes
    const [fontCatalog, setFontCatalog] = useState<GoogleFontCatalog>(
      FALLBACK_FONT_CATALOG
    )
    const [status, setStatus] = useState<string>("")

    openLinkRef.current = () => setLinkOpen(true)

    const updateDocument = useCallback(
      (next: SemanticDocument) => {
        const stylesChanged = next.styles !== documentRef.current.styles
        const fontsChanged = next.fontAssets !== documentRef.current.fontAssets
        documentRef.current = next
        onDocumentChange?.(next)
        // Typing must not push a new React document on every character —
        // that re-ran layoutDocument during render and flashed the page.
        if (
          previewOnRef.current ||
          divergenceOnRef.current ||
          stylesChanged ||
          fontsChanged
        ) {
          setDocument(next)
        }
      },
      [onDocumentChange]
    )

    const persistTemplateTags = useCallback(() => {
      const { tags, values } = useTemplateTagStore.getState()
      updateDocument({
        ...documentRef.current,
        editorMetadata: writeFormMetadata(
          writeTemplateTagMetadata(
            documentRef.current.editorMetadata,
            tags,
            values
          ),
          formTemplateRef.current,
          formAnswersRef.current
        ),
      })
    }, [updateDocument])

    const persistForm = useCallback(
      (nextForm: FormTemplate, nextAnswers: FormAnswers) => {
        setFormTemplate(nextForm)
        setFormAnswers(nextAnswers)
        formTemplateRef.current = nextForm
        formAnswersRef.current = nextAnswers
        const store = useTemplateTagStore.getState()
        const tags = mergeCatalogWithForm(store.tags, nextForm)
        const mapped = answersToTagValues(nextForm, nextAnswers)
        store.reset(tags, { ...store.values, ...mapped })
        persistTemplateTags()
      },
      [persistTemplateTags]
    )

    const notifyTagValuesChanged = useCallback(() => {
      persistTemplateTags()
      const view = viewRef.current
      if (!view) return
      view.dispatch(view.state.tr.setMeta(TEMPLATE_TAG_VALUES_TR_META, true))
    }, [persistTemplateTags])

    const applyFormAnswers = useCallback(
      (nextAnswers: FormAnswers) => {
        persistForm(formTemplateRef.current, nextAnswers)
        notifyTagValuesChanged()
      },
      [persistForm, notifyTagValuesChanged]
    )

    const layoutResult = useMemo(() => {
      if (!previewOn && !divergenceOn) return null
      try {
        return layoutDocument(applyTemplateTagValues(document), {
          includeTrace: true,
        })
      } catch {
        return null
      }
    }, [document, divergenceOn, previewOn])

    useEffect(() => {
      setReadOnlyState(readOnlyProp)
    }, [readOnlyProp])

    useEffect(() => {
      const hydrated = hydrateTemplateTagCatalog(documentRef.current)
      const meta = readTemplateTagMetadata(hydrated.editorMetadata)
      const form = formFromMetadata(hydrated.editorMetadata)
      const answers = readFormAnswers(hydrated.editorMetadata)
      setFormTemplate(form)
      setFormAnswers(answers)
      formTemplateRef.current = form
      formAnswersRef.current = answers
      const mapped = answersToTagValues(form, answers)
      useTemplateTagStore
        .getState()
        .reset(mergeCatalogWithForm(meta.tags, form), {
          ...meta.values,
          ...mapped,
        })
      if (hydrated !== documentRef.current) {
        documentRef.current = hydrated
        setDocument(hydrated)
      }
    }, [])

    useEffect(() => {
      ensureEditorStyles()
    })

    useEffect(() => {
      injectDomFontFaces(BUILTIN_FONT_INDEX)
      injectGoogleFontStylesheet(GOOGLE_FONT_FAMILIES)
      let cancelled = false
      void loadGoogleFontCatalog().then((catalog) => {
        if (!cancelled) setFontCatalog(catalog)
      })
      return () => {
        cancelled = true
      }
    }, [])

    useEffect(
      () =>
        injectEmbeddedDocumentFonts(
          {
            ...documentRef.current,
            fontAssets: document.fontAssets,
          },
          portalContainer instanceof ShadowRoot ? portalContainer : undefined
        ),
      [document.fontAssets, portalContainer]
    )

    useEffect(() => {
      setPreviewOn(showPreview)
    }, [showPreview])

    useEffect(() => {
      setDivergenceOn(showDivergence)
    }, [showDivergence])

    useEffect(() => {
      viewRef.current?.setProps({
        editable: () => mainDocumentEditable,
      })
      viewRef.current?.dom.setAttribute(
        "aria-disabled",
        mainDocumentEditable ? "false" : "true"
      )
      activeHeaderFooterViewRef.current?.setProps({
        editable: () => !readOnly,
      })
    }, [mainDocumentEditable, readOnly])

    useEffect(() => {
      if (!hostRef.current) return
      const openLinkCommand: Command = () => {
        openLinkRef.current()
        return true
      }
      const state = createEditorState(documentRef.current, {
        layoutEnabled: true,
        forceInProcessLayout,
        openLinkCommand,
        getBridgeContext: () => {
          const current = documentRef.current
          return {
            assets: current.assets,
            fontAssets: current.fontAssets,
            styles: current.styles,
            headers: current.headers,
            footers: current.footers,
            numberingDefinitions: current.numberingDefinitions,
            editorMetadata: current.editorMetadata,
          }
        },
      })
      const view = new EditorView(hostRef.current, {
        state,
        nodeViews: editorNodeViews(),
        editable: () =>
          !readOnlyRef.current && headerFooterEditingRef.current === null,
        attributes: {
          class: "apex-prosemirror",
          spellcheck: "true",
        },
        dispatchTransaction(tr) {
          const next = view.state.apply(tr)
          view.updateState(next)
          if (tablePropsOpenRef.current && (tr.selectionSet || tr.docChanged)) {
            const nextTableSelection = readTableOptionsSelection(next)
            if (nextTableSelection.grid.cellCount > 0) {
              setTableOptionsSelection(nextTableSelection)
            } else {
              setTablePropsOpen(false)
            }
          }
          const snap = getSelectionSnapshot(next)
          if (snap && !activeHeaderFooterViewRef.current) {
            setSelectionSnapshot(snap)
          }
          if (
            tr.docChanged ||
            imageAssetFromTransaction(tr) ||
            numberingDefinitionFromTransaction(tr)
          ) {
            const current = documentRef.current
            const asset = imageAssetFromTransaction(tr)
            const assets = asset
              ? [...current.assets.filter((a) => a.id !== asset.id), asset]
              : current.assets
            const numbering = numberingDefinitionFromTransaction(tr)
            const numberingDefinitions = numbering
              ? [
                  ...current.numberingDefinitions.filter(
                    (definition) => definition.id !== numbering.id
                  ),
                  numbering,
                ]
              : current.numberingDefinitions
            const semantic = toSemanticDocument(next.doc, {
              assets,
              fontAssets: current.fontAssets,
              styles: current.styles,
              headers: current.headers,
              footers: current.footers,
              numberingDefinitions,
              editorMetadata: writeTemplateTagMetadata(
                {
                  ...(current.editorMetadata ?? {}),
                  customPalettes: customPalettesRef.current,
                },
                useTemplateTagStore.getState().tags,
                useTemplateTagStore.getState().values
              ),
            })
            updateDocument(semantic)
          }
        },
        ...(portalContainer instanceof ShadowRoot
          ? { root: portalContainer }
          : {}),
      } as ConstructorParameters<typeof EditorView>[1])
      viewRef.current = view
      const initialSnap = getSelectionSnapshot(view.state)
      if (initialSnap) setSelectionSnapshot(initialSnap)
      queueMicrotask(() => {
        if (!readOnlyRef.current) view.focus()
      })
      return () => {
        view.destroy()
        viewRef.current = null
      }
      // Mount once; document loads go through loadDocument.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [forceInProcessLayout, portalContainer, updateDocument])

    const run = useCallback((command: Command) => {
      const view = activeHeaderFooterViewRef.current ?? viewRef.current
      if (!view || readOnlyRef.current) return
      command(view.state, view.dispatch.bind(view))
      const snap = getSelectionSnapshot(view.state)
      if (snap) setSelectionSnapshot(snap)
      view.focus()
    }, [])

    const runLive = useCallback((command: Command) => {
      const view = activeHeaderFooterViewRef.current ?? viewRef.current
      if (!view || readOnlyRef.current) return
      command(view.state, view.dispatch.bind(view))
      const snap = getSelectionSnapshot(view.state)
      if (snap) setSelectionSnapshot(snap)
    }, [])

    const runLiveAll = useCallback((commands: readonly Command[]) => {
      const view = activeHeaderFooterViewRef.current ?? viewRef.current
      if (!view || readOnlyRef.current) return
      for (const command of commands) {
        command(view.state, view.dispatch.bind(view))
      }
      const snap = getSelectionSnapshot(view.state)
      if (snap) setSelectionSnapshot(snap)
    }, [])

    const loadDocument = useCallback(
      (next: SemanticDocument) => {
        setHeaderFooterEditing(null)
        const hydrated = hydrateTemplateTagCatalog(next)
        const tagMeta = readTemplateTagMetadata(hydrated.editorMetadata)
        const form = formFromMetadata(hydrated.editorMetadata)
        const answers = readFormAnswers(hydrated.editorMetadata)
        setFormTemplate(form)
        setFormAnswers(answers)
        formTemplateRef.current = form
        formAnswersRef.current = answers
        const mapped = answersToTagValues(form, answers)
        useTemplateTagStore
          .getState()
          .reset(mergeCatalogWithForm(tagMeta.tags, form), {
            ...tagMeta.values,
            ...mapped,
          })
        updateDocument(hydrated)
        setDocument(hydrated)
        const metadata = hydrated.editorMetadata as
          | { customPalettes?: CustomPalette[]; pageUnit?: PageSetupUnit }
          | undefined
        setCustomPalettes(metadata?.customPalettes ?? [])
        if (metadata?.pageUnit) setPageUnit(metadata.pageUnit)
        const view = viewRef.current
        if (!view) return
        const openLinkCommand: Command = () => {
          openLinkRef.current()
          return true
        }
        const state = createEditorState(hydrated, {
          layoutEnabled: true,
          forceInProcessLayout,
          openLinkCommand,
          getBridgeContext: () => {
            const current = documentRef.current
            return {
              assets: current.assets,
              fontAssets: current.fontAssets,
              styles: current.styles,
              headers: current.headers,
              footers: current.footers,
              numberingDefinitions: current.numberingDefinitions,
              editorMetadata: current.editorMetadata,
            }
          },
        })
        view.updateState(state)
        const snap = getSelectionSnapshot(state)
        if (snap) setSelectionSnapshot(snap)
      },
      [forceInProcessLayout, setPageUnit, updateDocument]
    )

    useImperativeHandle(
      ref,
      () => ({
        loadDocument,
        loadDocx: async (bytes) => {
          loadDocument(parseEmbedDocx(bytes))
        },
        getDocument: () => documentRef.current,
        getDocx: async () => serializeEmbedDocx(documentRef.current),
        getPdf: async () => serializeEmbedPdf(documentRef.current),
        setReadOnly: (value) => {
          setReadOnlyState(value)
        },
      }),
      [loadDocument]
    )

    useEffect(() => {
      if (workspaceTab !== "document") return
      const view = viewRef.current
      if (!view) return
      view.dispatch(view.state.tr.setMeta(TEMPLATE_TAG_VALUES_TR_META, true))
    }, [workspaceTab])

    const onOpenDocx = useCallback(
      async (file: File) => {
        try {
          const buffer = new Uint8Array(await file.arrayBuffer())
          const result = normaliseDocxBytes(buffer)
          if (!result.ok) {
            setStatus(
              `Failed to open DOCX: ${result.diagnostics.map((d) => d.message).join("; ")}`
            )
            return
          }
          loadDocument(result.value)
          setStatus(`Opened ${file.name}`)
        } catch (error) {
          setStatus(
            `Failed to open DOCX: ${error instanceof Error ? error.message : String(error)}`
          )
        }
      },
      [loadDocument]
    )

    const onSaveDocx = useCallback(() => {
      const bytes = serializeDocx(documentRef.current)
      const blob = new Blob([bytes as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      })
      const url = URL.createObjectURL(blob)
      const a = window.document.createElement("a")
      a.href = url
      a.download = "document.docx"
      a.click()
      URL.revokeObjectURL(url)
      setStatus("Saved document.docx")
    }, [])

    const onExportPdf = useCallback(async () => {
      try {
        persistForm(formTemplateRef.current, formAnswersRef.current)
        const bytes = await serializeEmbedPdf(documentRef.current)
        const blob = new Blob([bytes as BlobPart], {
          type: "application/pdf",
        })
        const url = URL.createObjectURL(blob)
        const a = window.document.createElement("a")
        a.href = url
        a.download = "document.pdf"
        a.click()
        URL.revokeObjectURL(url)
        setStatus("Exported document.pdf")
      } catch (error) {
        setStatus(
          `PDF export unavailable: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }, [persistForm])

    const generatePdfFromForm = useCallback(
      async (answers: FormAnswers) => {
        persistForm(formTemplateRef.current, answers)
        setStatus("Generating PDF…")
        try {
          const bytes = await serializeEmbedPdf(documentRef.current)
          setStatus("Generated PDF from form answers")
          return bytes
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          setStatus(`PDF export unavailable: ${message}`)
          throw error
        }
      },
      [persistForm]
    )

    const onPrint = useCallback(async () => {
      try {
        persistForm(formTemplateRef.current, formAnswersRef.current)
        setStatus("Preparing print…")
        const bytes = await serializeEmbedPdf(
          applyTemplateTagValues(documentRef.current)
        )
        const ownerDocument = rootRef.current?.ownerDocument ?? window.document
        await printPdfBytes(bytes, { ownerDocument })
        setStatus("Print dialog opened")
      } catch (error) {
        setStatus(
          `Print unavailable: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }, [persistForm])

    const onNew = useCallback(() => {
      const metadata = documentRef.current.editorMetadata as
        | {
            defaultPageSetup?: {
              pageWidth: number
              pageHeight: number
              marginTop: number
              marginRight: number
              marginBottom: number
              marginLeft: number
            }
            pageUnit?: PageSetupUnit
          }
        | undefined
      const defaults = metadata?.defaultPageSetup
      const blank = createBlankDocument(
        defaults
          ? {
              pageWidth: defaults.pageWidth,
              pageHeight: defaults.pageHeight,
              margins: {
                top: defaults.marginTop,
                right: defaults.marginRight,
                bottom: defaults.marginBottom,
                left: defaults.marginLeft,
              },
            }
          : undefined
      )
      const seeded = mergeDefaultTemplateTags([], {})
      const emptyForm = createEmptyForm()
      useTemplateTagStore.getState().reset(seeded.tags, seeded.values)
      loadDocument({
        ...blank,
        editorMetadata: writeFormMetadata(
          writeTemplateTagMetadata(
            {
              ...(blank.editorMetadata ?? {}),
              ...(defaults ? { defaultPageSetup: defaults } : {}),
              pageUnit,
              customPalettes: customPalettesRef.current,
            },
            seeded.tags,
            seeded.values
          ),
          emptyForm,
          {}
        ),
      })
      setStatus("New blank document")
    }, [loadDocument, pageUnit])

    const runClipboard = useCallback(
      async (command: "cut" | "copy" | "paste") => {
        const view = activeHeaderFooterViewRef.current ?? viewRef.current
        if (!view) return
        view.focus()
        const ownerDocument = view.dom.ownerDocument
        if (command === "paste") {
          try {
            const text =
              await ownerDocument.defaultView?.navigator.clipboard.readText()
            if (text) {
              view.pasteText(text)
              return
            }
          } catch {
            // Browser policy may require the legacy user-gesture path.
          }
        }
        ownerDocument.execCommand(command)
      },
      []
    )

    const onInsertImage = useCallback(async (file: File) => {
      const view = activeHeaderFooterViewRef.current ?? viewRef.current
      if (!view) return
      const ok = await insertImageFile(view, file)
      setStatus(
        ok ? `Inserted image ${file.name}` : `Could not insert ${file.name}`
      )
    }, [])

    const styleNames = useMemo(() => {
      const defs = document.styles?.definitions ?? []
      return paragraphStyleOptions(defs)
    }, [document.styles?.definitions])

    const applyStyleById = useCallback(
      (styleId: string | null) => {
        if (styleId === null) {
          run(applyParagraphStyle(null))
          return
        }
        const styles = documentRef.current.styles ?? createEmptyDocumentStyles()
        let definition = styles.definitions.find(
          (entry) => entry.id === styleId && entry.type === "paragraph"
        )
        if (!definition) {
          definition = builtInStyle(styleId, documentRef.current) ?? undefined
          if (definition) {
            updateDocument({
              ...documentRef.current,
              styles: {
                ...styles,
                definitions: [...styles.definitions, definition],
              },
            })
          }
        }
        if (definition) run(applyDefinedParagraphStyle(definition))
        else run(applyParagraphStyle(styleId))
      },
      [run, updateDocument]
    )

    const saveStyleFromSelection = useCallback(
      (name: string, requestedId?: string) => {
        const view = activeHeaderFooterViewRef.current ?? viewRef.current
        const snapshot =
          (view ? getSelectionSnapshot(view.state) : null) ?? selectionSnapshot
        if (requestedId && snapshot.empty) {
          setStatus("Select text before updating a style")
          return
        }
        const current = documentRef.current
        const id = requestedId ?? styleIdFromName(name)
        const definition = styleFromSelection(id, name, snapshot)
        const currentStyles = current.styles ?? createEmptyDocumentStyles()
        const styles = {
          ...currentStyles,
          definitions: [
            ...currentStyles.definitions.filter((entry) => entry.id !== id),
            definition,
          ],
        }
        updateDocument(resolveStyles({ ...current, styles }))
        if (requestedId) run(updateDefinedParagraphStyle(definition))
        else run(applyDefinedParagraphStyle(definition))
        setStatus(
          requestedId
            ? `Updated style ${name}`
            : `Created and applied style ${name}`
        )
      },
      [run, selectionSnapshot, updateDocument]
    )

    const beginHeaderFooterEditing = useCallback(
      (
        kind: HeaderFooterKind,
        requested?: Readonly<{
          sectionId: string
          variant: HeaderFooterVariant
        }>
      ) => {
        if (readOnlyRef.current) return
        const current = documentRef.current
        const view = viewRef.current
        const sectionId =
          requested?.sectionId ??
          (view ? selectedSectionId(view.state) : null) ??
          String(current.sections[0]?.id ?? "")
        const section = current.sections.find(
          (entry) => String(entry.id) === sectionId
        )
        if (!section) return
        view?.setProps({ editable: () => false })
        const differentFirstPage =
          section.properties.differentFirstPage === true
        setHeaderFooterEditing({
          kind,
          sectionId,
          variant:
            requested?.variant ?? (differentFirstPage ? "first" : "default"),
          differentFirstPage,
          initialDocument: current,
        })
      },
      []
    )

    useEffect(() => {
      const surface = hostRef.current
      if (!surface) return
      const handleEditRequest = (event: Event) => {
        const detail = (event as CustomEvent<HeaderFooterEditRequestDetail>)
          .detail
        if (!detail) return
        beginHeaderFooterEditing(detail.kind, {
          sectionId: detail.sectionId,
          variant: detail.variant,
        })
      }
      surface.addEventListener(
        HEADER_FOOTER_EDIT_REQUEST_EVENT,
        handleEditRequest
      )
      return () =>
        surface.removeEventListener(
          HEADER_FOOTER_EDIT_REQUEST_EVENT,
          handleEditRequest
        )
    }, [beginHeaderFooterEditing])

    const syncMainHeaderFooter = useCallback(
      (next: SemanticDocument, sectionId: string) => {
        const section = next.sections.find(
          (entry) => String(entry.id) === sectionId
        )
        const view = viewRef.current
        if (!section || !view) return
        let position: number | null = null
        let attrs: Readonly<Record<string, unknown>> | null = null
        view.state.doc.descendants((node, pos) => {
          if (
            node.type.name === "section" &&
            String(node.attrs.nodeId ?? "") === sectionId
          ) {
            position = pos
            attrs = node.attrs
            return false
          }
          return true
        })
        if (position === null || !attrs) return
        const targetAttrs = attrs as Readonly<Record<string, unknown>>
        const headerFooterAttrs = {
          differentFirstPage: section.properties.differentFirstPage === true,
          defaultHeaderId: section.defaultHeaderId,
          defaultFooterId: section.defaultFooterId,
          firstPageHeaderId: section.firstPageHeaderId ?? null,
          firstPageFooterId: section.firstPageFooterId ?? null,
        }
        const refsChanged = Object.entries(headerFooterAttrs).some(
          ([key, value]) => targetAttrs[key] !== value
        )
        const transaction = refsChanged
          ? view.state.tr.setNodeMarkup(position, undefined, {
              ...targetAttrs,
              ...headerFooterAttrs,
            })
          : view.state.tr.setMeta(HEADER_FOOTER_CONTENT_TR_META, true)
        view.dispatch(transaction)
      },
      []
    )

    const persistHeaderFooterBlocks = useCallback(
      (blocks: readonly import("@apexmed/core").SemanticBlock[]) => {
        if (!headerFooterEditing) return
        const next = applyHeaderFooterBlocks(
          documentRef.current,
          headerFooterEditing.sectionId,
          headerFooterEditing.kind,
          headerFooterEditing.variant,
          blocks
        )
        updateDocument(next)
        syncMainHeaderFooter(next, headerFooterEditing.sectionId)
      },
      [syncMainHeaderFooter, headerFooterEditing, updateDocument]
    )

    const handleHeaderFooterViewChange = useCallback(
      (view: EditorView | null) => {
        activeHeaderFooterViewRef.current = view
        const state = (view ?? viewRef.current)?.state
        if (!state) return
        const snapshot = getSelectionSnapshot(state)
        if (snapshot) setSelectionSnapshot(snapshot)
      },
      []
    )

    const closeHeaderFooterEditing = useCallback(() => {
      setHeaderFooterEditing(null)
      queueMicrotask(() => {
        const view = viewRef.current
        view?.setProps({ editable: () => !readOnlyRef.current })
        if (!readOnlyRef.current) view?.focus()
      })
    }, [])

    const changeDifferentFirstPage = useCallback(
      (enabled: boolean) => {
        const editing = headerFooterEditingRef.current
        if (!editing) return
        const next = setDifferentFirstPage(
          documentRef.current,
          editing.sectionId,
          enabled
        )
        updateDocument(next)
        syncMainHeaderFooter(next, editing.sectionId)
        setHeaderFooterEditing({
          ...editing,
          variant: enabled ? "first" : "default",
          differentFirstPage: enabled,
          initialDocument: next,
        })
      },
      [syncMainHeaderFooter, updateDocument]
    )

    const chromeActions = useMemo<EditorChromeActions>(
      () => ({
        onNew,
        onOpenDocx: (file) => void onOpenDocx(file),
        onSaveDocx,
        onExportPdf: () => void onExportPdf(),
        onPrint: () => void onPrint(),
        onPageSetup: () => setPageSetupOpen(true),
        onUndo: () => run(undo),
        onRedo: () => run(redo),
        onCut: () => void runClipboard("cut"),
        onCopy: () => void runClipboard("copy"),
        onPaste: () => void runClipboard("paste"),
        onSelectAll: () => run(selectAll),
        onFindReplace: () => setFindReplaceOpen(true),
        onToggleRuler: toggleRulerVisible,
        onToggleDarkPages: toggleDarkPages,
        onTogglePreview: () => {
          setDocument(documentRef.current)
          setPreviewOn((value) => !value)
        },
        onToggleDivergence: () => {
          setDocument(documentRef.current)
          setDivergenceOn((value) => !value)
        },
        onZoomChange: (percent) => setZoom(percent),
        onInsertImage: (file) => void onInsertImage(file),
        onInsertHeader: () => beginHeaderFooterEditing("header"),
        onInsertFooter: () => beginHeaderFooterEditing("footer"),
        onInsertTable: (rows = 2, columns = 2) => {
          const section = selectionSnapshot.section
          const writableWidth = section
            ? section.pageWidth - section.marginLeft - section.marginRight
            : 8640
          run(
            insertTable(
              rows,
              columns,
              Math.max(720, Math.floor(writableWidth / columns)),
              headerFooterEditingRef.current === null
            )
          )
        },
        onInsertPageBreak: () => run(insertPageBreak()),
        onInsertTag: () => setInsertTagOpen(true),
        onToggleTagsSidebar: toggleTagsSidebarOpen,
        onWorkspaceTabChange: setWorkspaceTab,
        onInsertLink: () => setLinkOpen(true),
        onInsertColumnBreak: () => {
          run(insertColumnBreak())
          setStatus("Inserted column break")
        },
        onBold: () => run(toggleBold()),
        onItalic: () => run(toggleItalic()),
        onUnderline: () => run(toggleUnderline()),
        onStrikethrough: () => run(toggleStrikethrough()),
        onVerticalAlignment: (alignment) =>
          run(setVerticalAlignment(alignment)),
        onTextColor: (color) => run(setTextColor(color)),
        onHighlightColor: (color) => run(setHighlightColor(color)),
        onAlign: (alignment) => run(setParagraphAlignment(alignment)),
        onLineSpacing: () => setLineSpacingOpen(true),
        onParagraphSpacing: (options) => {
          run(setParagraphSpacing(options))
          setStatus("Line spacing updated")
        },
        onColumns: () => setColumnsOpen(true),
        onClearFormatting: () => run(clearFormatting()),
        onApplyStyle: applyStyleById,
        onMatchStyle: () => run(matchStyleToSelection()),
        onCreateStyle: () => setStyleDialogOpen(true),
        onUpdateStyle: (requestedStyleId) => {
          const view = activeHeaderFooterViewRef.current ?? viewRef.current
          const snapshot =
            (view ? getSelectionSnapshot(view.state) : null) ??
            selectionSnapshot
          const styleId =
            requestedStyleId ??
            snapshot.paragraph?.styleId ??
            snapshot.textStyle.styleId
          if (!styleId) {
            setStatus("Apply a named style before updating it")
            return
          }
          const current = (
            documentRef.current.styles ?? createEmptyDocumentStyles()
          ).definitions.find((entry) => entry.id === styleId)
          const builtIn = builtInStyle(styleId, documentRef.current)
          saveStyleFromSelection(
            current?.name ?? builtIn?.name ?? styleId,
            styleId
          )
        },
        onPaintFormat: () => run(matchStyleToSelection()),
        onBulletList: () => run(applyBulletList()),
        onNumberedList: () => run(applyNumberedList()),
        onIndentDecrease: () => run(decreaseIndent()),
        onIndentIncrease: () => run(increaseIndent()),
        onFontFamily: (family, weight) => {
          const metadata = findGoogleFontFamily(fontCatalog, family)
          if (metadata) injectGoogleFontFamilyStylesheet(metadata)
          run(setFontFamily(family))
          if (weight !== undefined) run(setFontWeight(weight))
        },
        onFontSize: (twips) => run(setFontSize(twips)),
        onWordCount: () => {
          const text = documentRef.current.sections
            .flatMap((section) => section.blocks)
            .flatMap((block) =>
              block.type === "paragraph"
                ? block.children
                    .filter((child) => child.type === "text")
                    .map((child) => (child.type === "text" ? child.text : ""))
                : []
            )
            .join(" ")
          const words = text.trim().split(/\s+/).filter(Boolean).length
          setStatus(`Word count: ${words} words`)
        },
        onTableInsert: () =>
          run(insertTable(2, 2, 2880, headerFooterEditingRef.current === null)),
        onTableAddRowBefore: () => run(tableCommands.addRowBefore),
        onTableAddRowAfter: () => run(tableCommands.addRowAfter),
        onTableAddColumnBefore: () => run(tableCommands.addColumnBefore),
        onTableAddColumnAfter: () => run(tableCommands.addColumnAfter),
        onTableDeleteRow: () => run(tableCommands.deleteRow),
        onTableDeleteColumn: () => run(tableCommands.deleteColumn),
        onTableMergeCells: () => run(tableCommands.mergeCells),
        onTableSplitCell: () => run(tableCommands.splitCell),
        onTableProperties: () => {
          const view = viewRef.current
          if (view && !tablePropsOpenRef.current) {
            setTableOptionsSelection(readTableOptionsSelection(view.state))
          }
          setTablePropsOpen((current) => !current)
        },
        onMarginsChange: (options) => run(setSectionPageSetup(options)),
        onIndentsChange: (options) => run(setParagraphAttrs(options)),
        onTabStopsChange: (tabStops) => run(setParagraphAttrs({ tabStops })),
      }),
      [
        applyStyleById,
        onInsertImage,
        beginHeaderFooterEditing,
        onNew,
        runClipboard,
        saveStyleFromSelection,
        fontCatalog,
        onExportPdf,
        onOpenDocx,
        onPrint,
        onSaveDocx,
        run,
        selectionSnapshot,
        setWorkspaceTab,
        setZoom,
        toggleDarkPages,
        toggleRulerVisible,
        toggleTagsSidebarOpen,
      ]
    )

    useEffect(() => {
      const root = rootRef.current
      const ownerWindow = root?.ownerDocument.defaultView
      if (!root || !ownerWindow) return
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.isComposing || event.defaultPrevented) return
        const active = root.ownerDocument.activeElement
        if (
          !event.composedPath().includes(root) &&
          (!active || !root.contains(active))
        ) {
          return
        }
        const mod = event.metaKey || event.ctrlKey
        if (!mod) return
        const key = event.key.toLowerCase()
        let handled = true
        if (key === "enter" && event.shiftKey)
          chromeActions.onInsertColumnBreak()
        else if (key === "enter") chromeActions.onInsertPageBreak()
        else if (key === "s") chromeActions.onSaveDocx()
        else if (key === "p") chromeActions.onPrint()
        else if (key === "f") chromeActions.onFindReplace()
        else if (key === "\\") chromeActions.onClearFormatting()
        else if (key === "[" && !event.shiftKey)
          chromeActions.onIndentDecrease()
        else if (key === "]" && !event.shiftKey)
          chromeActions.onIndentIncrease()
        else if (key === "x" && event.shiftKey) chromeActions.onStrikethrough()
        else if (key === "7" && event.shiftKey) chromeActions.onNumberedList()
        else if (key === "8" && event.shiftKey) chromeActions.onBulletList()
        else if (event.altKey && key === "0")
          chromeActions.onApplyStyle("Normal")
        else if (event.altKey && key === "1")
          chromeActions.onApplyStyle("Heading1")
        else if (event.altKey && key === "2")
          chromeActions.onApplyStyle("Heading2")
        else handled = false
        if (handled) event.preventDefault()
      }
      ownerWindow.addEventListener("keydown", handleKeyDown, true)
      return () =>
        ownerWindow.removeEventListener("keydown", handleKeyDown, true)
    }, [chromeActions])

    return (
      <div
        ref={rootRef}
        className={
          className
            ? `apex-editor-root flex h-full min-h-[480px] flex-col bg-background text-foreground ${className}`
            : "apex-editor-root flex h-full min-h-[480px] flex-col bg-background text-foreground"
        }
        {...(darkPages ? { "data-apex-dark-pages": "true" } : {})}
        {...(headerFooterEditing
          ? {
              "data-apex-header-footer-editing": "true",
              "data-apex-header-footer-kind": headerFooterEditing.kind,
            }
          : {})}
      >
        <EditorChrome
          actions={chromeActions}
          portalContainer={portalContainer}
          view={{
            snapshot: selectionSnapshot,
            zoom,
            rulerVisible,
            darkPages,
            previewOn,
            divergenceOn,
            printLayout: true,
            tableOptionsOpen: tablePropsOpen,
            tagsSidebarOpen,
            workspaceTab,
          }}
          resources={{
            fonts: BUILTIN_FONT_INDEX,
            googleFonts: GOOGLE_FONT_FAMILIES,
            fontCatalog,
            styleNames,
            palettes: TAILWIND_PALETTES,
            customPalettes,
            onCustomPalettesChange: (palettes) => {
              setCustomPalettes(palettes)
              updateDocument({
                ...documentRef.current,
                editorMetadata: {
                  ...(documentRef.current.editorMetadata ?? {}),
                  customPalettes: palettes,
                },
              })
            },
          }}
        >
          <div className="flex min-h-0 flex-1">
            <div
              className={
                workspaceTab === "document"
                  ? "flex min-h-0 min-w-0 flex-1 gap-3 p-3"
                  : "flex min-h-0 min-w-0 flex-1"
              }
            >
              <div className="relative min-h-0 min-w-0 flex-1">
                <div
                  ref={hostRef}
                  className={
                    workspaceTab === "document"
                      ? "apex-editor-surface h-full overflow-auto rounded-lg"
                      : "apex-editor-surface apex-editor-surface--layout-hidden"
                  }
                  aria-hidden={workspaceTab !== "document"}
                />
                {workspaceTab === "form" ? (
                  <div className="apex-form-workspace absolute inset-0 z-20 overflow-hidden">
                    <FormBuilder
                      form={formTemplate}
                      onFormChange={(next) =>
                        persistForm(next, formAnswersRef.current)
                      }
                    />
                  </div>
                ) : null}
                {workspaceTab === "preview" ? (
                  <div className="apex-form-preview absolute inset-0 z-20 overflow-hidden">
                    <FormPreview
                      form={formTemplate}
                      answers={formAnswers}
                      onAnswersChange={applyFormAnswers}
                      onGeneratePdf={generatePdfFromForm}
                      onOpenFormBuilder={() => setWorkspaceTab("form")}
                    />
                  </div>
                ) : null}
                <TableReorderOverlay
                  viewRef={viewRef}
                  surfaceRef={hostRef}
                  revision={selectionSnapshot.revision}
                  inTable={selectionSnapshot.table.inTable}
                  zoom={zoom}
                  readOnly={readOnly || workspaceTab !== "document"}
                />
                {workspaceTab === "document" &&
                headerFooterEditing &&
                hostRef.current &&
                viewRef.current ? (
                  <HeaderFooterEditor
                    key={`${headerFooterEditing.sectionId}:${headerFooterEditing.kind}:${headerFooterEditing.variant}`}
                    surface={hostRef.current}
                    mainView={viewRef.current}
                    initialDocument={headerFooterEditing.initialDocument}
                    sectionId={headerFooterEditing.sectionId}
                    kind={headerFooterEditing.kind}
                    variant={headerFooterEditing.variant}
                    zoom={zoom}
                    differentFirstPage={headerFooterEditing.differentFirstPage}
                    readOnly={readOnly}
                    onViewChange={handleHeaderFooterViewChange}
                    onSelectionChange={setSelectionSnapshot}
                    onBlocksChange={persistHeaderFooterBlocks}
                    onDifferentFirstPageChange={changeDifferentFirstPage}
                    onClose={closeHeaderFooterEditing}
                  />
                ) : null}
              </div>
              {workspaceTab === "document" && previewOn && layoutResult ? (
                <PrintPreview displayList={layoutResult.displayList} />
              ) : null}
            </div>
            {workspaceTab === "document" ? (
              <TagsSidebar
                open={tagsSidebarOpen}
                tags={templateTags}
                values={templateTagValues}
                width={tagsSidebarWidth}
                onWidthChange={setTagsSidebarWidth}
                onToggle={toggleTagsSidebarOpen}
                onCreate={() => {
                  setEditingTag(null)
                  setTagEditorMode("create")
                  setTagEditorOpen(true)
                }}
                onEdit={(tag) => {
                  setEditingTag(tag)
                  setTagEditorMode("edit")
                  setTagEditorOpen(true)
                }}
                onDelete={(tag) => {
                  if (
                    !window.confirm(
                      `Delete “${tag.label}” and remove it from the document?`
                    )
                  ) {
                    return
                  }
                  useTemplateTagStore.getState().removeTag(tag.id)
                  persistTemplateTags()
                  run(removeTemplateTagInstances(tag.id))
                  setStatus(`Deleted tag ${tag.label}`)
                }}
                onValueChange={(tag, value) => {
                  useTemplateTagStore.getState().setValue(tag.id, value)
                  notifyTagValuesChanged()
                }}
              />
            ) : null}
            {workspaceTab === "document" && tablePropsOpen ? (
              <TablePropertiesDialog
                key={`${tableOptionsSelection.positions.join(":")}:${tableOptionsSelection.sizing?.selectedColumns.join(",") ?? ""}`}
                open
                width={tableOptionsWidth}
                onWidthChange={setTableOptionsWidth}
                onOpenChange={setTablePropsOpen}
                selectionGrid={tableOptionsSelection.grid}
                initialBorders={tableOptionsSelection.borders}
                selectedColumns={
                  tableOptionsSelection.sizing?.selectedColumns ?? []
                }
                importedFixed={
                  tableOptionsSelection.sizing?.importedFixed ?? false
                }
                onSelectTable={() => runLive(selectEnclosingTable())}
                onSelectColumn={() => runLive(selectCurrentTableColumn())}
                palettes={TAILWIND_PALETTES}
                customPalettes={customPalettes}
                onCustomPalettesChange={(palettes) => {
                  setCustomPalettes(palettes)
                  updateDocument({
                    ...documentRef.current,
                    editorMetadata: {
                      ...(documentRef.current.editorMetadata ?? {}),
                      customPalettes: palettes,
                    },
                  })
                }}
                initial={{
                  cellShading: selectionSnapshot.table.cellFill,
                  ...(tableOptionsSelection.sizing
                    ? { tableSizing: tableOptionsSelection.sizing.sizing }
                    : {}),
                }}
                onChange={(change) => {
                  const positions = tableOptionsSelection.positions
                  const captured = positions.length > 0 ? positions : undefined
                  if (change.type === "columnWidths") {
                    const width = change.value.reduce(
                      (sum, value) => sum + value,
                      0
                    )
                    runLive(
                      setTableAttrs({
                        columnWidths: change.value,
                        ...(width > 0 ? { width, preferredWidth: width } : {}),
                      })
                    )
                  } else if (change.type === "tableSizing") {
                    runLive(setTableSizing(change.value))
                  } else if (change.type === "rowHeight") {
                    runLive(
                      setRowAttrs({
                        height:
                          change.value === null
                            ? null
                            : { rule: "atLeast", value: change.value },
                      })
                    )
                  } else if (change.type === "cellPadding") {
                    runLive(setTableAttrs({ cellPadding: change.value }))
                  } else if (change.type === "cellShading") {
                    runLive(setCellShading(change.value, captured))
                  } else if (change.type === "cellBorder") {
                    runLive(
                      setSelectedCellBorderStyle(
                        change.target,
                        change.value?.style ?? "none",
                        change.value?.color ?? "#000000",
                        change.value?.width ?? 15,
                        captured
                      )
                    )
                  } else if (change.type === "headerRowRepeat") {
                    runLiveAll([
                      setTableAttrs({
                        repeatHeaderRowCount: change.value ? 1 : 0,
                      }),
                      setRowAttrs({ repeatAsHeader: change.value }),
                    ])
                  } else if (change.type === "allowBreakAcrossPages") {
                    runLive(
                      setRowAttrs({ allowBreakAcrossPages: change.value })
                    )
                  }
                  setStatus("Table options updated")
                }}
              />
            ) : null}
          </div>
        </EditorChrome>
        <TagEditorDialog
          open={tagEditorOpen}
          mode={tagEditorMode}
          initial={editingTag ?? undefined}
          takenSlugs={templateTags.map((tag) => tag.slug)}
          onOpenChange={setTagEditorOpen}
          onSubmit={(draft) => {
            const tag: TemplateTagDefinition = {
              id: draft.id ?? crypto.randomUUID(),
              label: draft.label,
              slug: draft.slug,
              kind: draft.kind,
              ...(draft.date ? { date: draft.date } : {}),
              ...(draft.source ? { source: draft.source } : {}),
            }
            const previous = useTemplateTagStore
              .getState()
              .tags.find((entry) => entry.id === tag.id)
            useTemplateTagStore.getState().upsertTag(tag)
            if (previous && previous.kind !== tag.kind) {
              useTemplateTagStore.getState().setValue(tag.id, null)
            }
            persistTemplateTags()
            if (draft.id) {
              run(updateTemplateTagInstances(tag))
              setStatus(`Updated tag ${tag.label}`)
            } else {
              setStatus(`Created tag ${tag.label}`)
            }
          }}
        />
        <InsertTagDialog
          open={insertTagOpen}
          tags={templateTags}
          onOpenChange={setInsertTagOpen}
          onInsert={(tag) => {
            run(insertTemplateTag(tag))
            setStatus(`Inserted ${tag.label}`)
          }}
          onCreate={() => {
            setEditingTag(null)
            setTagEditorMode("create")
            setTagEditorOpen(true)
          }}
        />
        <LinkDialog
          open={linkOpen}
          initialHref={selectionSnapshot.textStyle.href}
          onOpenChange={setLinkOpen}
          onApply={(href) => {
            run(setLink(href))
            setStatus(`Link set to ${href}`)
          }}
          onRemove={() => {
            run(removeLink())
            setStatus("Link removed")
          }}
        />
        <PageSetupDialog
          open={pageSetupOpen}
          onOpenChange={setPageSetupOpen}
          unit={pageUnit}
          onUnitChange={setPageUnit}
          initial={{
            pageWidth: selectionSnapshot.section?.pageWidth,
            pageHeight: selectionSnapshot.section?.pageHeight,
            orientation: selectionSnapshot.section?.orientation,
            marginTop: selectionSnapshot.section?.marginTop,
            marginRight: selectionSnapshot.section?.marginRight,
            marginBottom: selectionSnapshot.section?.marginBottom,
            marginLeft: selectionSnapshot.section?.marginLeft,
          }}
          onApply={(options) => {
            run(
              setSectionPageSetup({
                pageWidth: options.pageWidth,
                pageHeight: options.pageHeight,
                orientation: options.orientation,
                marginTop: options.marginTop,
                marginRight: options.marginRight,
                marginBottom: options.marginBottom,
                marginLeft: options.marginLeft,
              })
            )
            setStatus("Page setup applied")
          }}
          onSetAsDefault={(options) => {
            updateDocument({
              ...documentRef.current,
              editorMetadata: {
                ...(documentRef.current.editorMetadata ?? {}),
                defaultPageSetup: options,
                pageUnit,
              },
            })
            setStatus("Saved as default page setup")
          }}
        />
        <FindReplaceDialog
          open={findReplaceOpen}
          onOpenChange={setFindReplaceOpen}
          getView={() => viewRef.current}
        />
        <LineSpacingDialog
          open={lineSpacingOpen}
          onOpenChange={setLineSpacingOpen}
          initial={{
            spacingBefore: selectionSnapshot.paragraph?.spacingBefore,
            spacingAfter: selectionSnapshot.paragraph?.spacingAfter,
            value240ths:
              selectionSnapshot.paragraph?.lineSpacing &&
              typeof selectionSnapshot.paragraph.lineSpacing === "object" &&
              "value240ths" in
                (selectionSnapshot.paragraph.lineSpacing as object)
                ? Number(
                    (
                      selectionSnapshot.paragraph.lineSpacing as {
                        value240ths: number
                      }
                    ).value240ths
                  )
                : null,
          }}
          onApply={(options) => {
            run(
              setParagraphSpacing({
                spacingBefore: options.spacingBefore,
                spacingAfter: options.spacingAfter,
                lineSpacing: options.lineSpacing,
              })
            )
            setStatus("Line spacing updated")
          }}
        />
        <ColumnsDialog
          open={columnsOpen}
          onOpenChange={setColumnsOpen}
          initialCount={selectionSnapshot.section?.columnCount ?? 1}
          initialEqualWidth={
            selectionSnapshot.section?.columnEqualWidth ?? true
          }
          initialSpace={selectionSnapshot.section?.columnSpace ?? 720}
          initialSeparator={selectionSnapshot.section?.columnSeparator ?? false}
          initialWidths={selectionSnapshot.section?.columnWidths ?? null}
          onApply={({ count, equalWidth, space, separator, widths }) => {
            run(
              setSectionColumns(count, {
                equalWidth,
                space,
                separator,
                widths,
              })
            )
            setStatus(count === 1 ? "Single column" : `${count} columns`)
          }}
        />
        <StyleDialog
          open={styleDialogOpen}
          onOpenChange={setStyleDialogOpen}
          suggestedName={`Custom style ${(document.styles?.definitions.length ?? 0) + 1}`}
          onCreate={(name) => saveStyleFromSelection(name)}
        />
        {divergenceOn && layoutResult?.trace ? (
          <DivergenceOverlay
            document={document}
            trace={layoutResult.trace}
            host={hostRef.current}
          />
        ) : null}
        {status ? (
          <div
            className="border-t border-border bg-background px-3 py-1.5 text-xs text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            {status}
          </div>
        ) : null}
      </div>
    )
  }
)

/** Imperative mount for the embed custom element (React ApexEditor in host). */
export function mountEditor(
  host: HTMLElement,
  options: EditorMountOptions = {}
): EditorController {
  const handleRef: { current: ApexEditorHandle | null } = { current: null }
  let root: Root | null = null
  let destroyed = false
  let readOnly = options.readOnly === true
  const documentRef = {
    current: options.initialDocument ?? createBlankDocument(),
  }

  function MountBridge(): ReactNode {
    return (
      <ApexEditor
        ref={(instance) => {
          handleRef.current = instance
        }}
        initialDocument={documentRef.current}
        readOnly={readOnly}
        portalContainer={options.shadowRoot ?? host}
        forceInProcessLayout={options.forceInProcessLayout}
        onDocumentChange={(next) => {
          documentRef.current = next
          options.onChange?.(next)
        }}
      />
    )
  }

  // Prefer React ApexEditor so chrome portals can target the shadow root.
  try {
    root = createRoot(host)
    flushSync(() => {
      root?.render(<MountBridge />)
    })
    if (!handleRef.current) {
      throw new Error("ApexEditor handle was not attached")
    }
  } catch {
    // Fall back to a headless ProseMirror controller when React mount fails
    // (e.g. non-DOM test environments).
    try {
      root?.unmount()
    } catch {
      // ignore
    }
    root = null
    handleRef.current = null
    host.replaceChildren()
    return mountEditorHeadless(host, options, documentRef)
  }

  const requireHandle = (): ApexEditorHandle => {
    if (destroyed) throw new Error("Editor has been destroyed")
    const handle = handleRef.current
    if (!handle) throw new Error("Editor is not ready")
    return handle
  }

  return {
    destroy: () => {
      if (destroyed) return
      destroyed = true
      root?.unmount()
      root = null
      handleRef.current = null
      host.replaceChildren()
    },
    loadDocx: async (bytes) => {
      await requireHandle().loadDocx(bytes)
      documentRef.current = requireHandle().getDocument()
    },
    getDocx: async () => requireHandle().getDocx(),
    getPdf: async () => requireHandle().getPdf(),
    setReadOnly: (value) => {
      readOnly = value
      requireHandle().setReadOnly(value)
    },
    getDocument: () => {
      if (destroyed) return null
      return handleRef.current?.getDocument() ?? documentRef.current
    },
  }
}

/**
 * Headless ProseMirror mount used when React createRoot is unavailable.
 * Still honors onChange, readOnly, shadowRoot, and the controller API.
 */
function mountEditorHeadless(
  host: HTMLElement,
  options: EditorMountOptions,
  documentRef: { current: SemanticDocument }
): EditorController {
  const readOnlyRef = { current: options.readOnly === true }
  const state = createEditorState(documentRef.current, {
    layoutEnabled: true,
    forceInProcessLayout: options.forceInProcessLayout,
    getBridgeContext: () => ({
      assets: documentRef.current.assets,
      fontAssets: documentRef.current.fontAssets,
      styles: documentRef.current.styles,
      headers: documentRef.current.headers,
      footers: documentRef.current.footers,
      numberingDefinitions: documentRef.current.numberingDefinitions,
      editorMetadata: documentRef.current.editorMetadata,
    }),
  })
  if (typeof document !== "undefined") {
    ensureEditorStyles()
    injectDomFontFaces(BUILTIN_FONT_INDEX)
    injectGoogleFontStylesheet(GOOGLE_FONT_FAMILIES)
  }
  const view = new EditorView(host, {
    state,
    nodeViews: editorNodeViews(),
    editable: () => !readOnlyRef.current,
    attributes: { class: "apex-prosemirror", spellcheck: "true" },
    dispatchTransaction(tr) {
      const next = view.state.apply(tr)
      view.updateState(next)
      if (tr.docChanged || imageAssetFromTransaction(tr)) {
        const asset = imageAssetFromTransaction(tr)
        const assets = asset
          ? [
              ...documentRef.current.assets.filter((a) => a.id !== asset.id),
              asset,
            ]
          : documentRef.current.assets
        const semantic = toSemanticDocument(next.doc, {
          assets,
          fontAssets: documentRef.current.fontAssets,
          styles: documentRef.current.styles,
          headers: documentRef.current.headers,
          footers: documentRef.current.footers,
          numberingDefinitions: documentRef.current.numberingDefinitions,
          editorMetadata: documentRef.current.editorMetadata,
        })
        documentRef.current = semantic
        options.onChange?.(semantic)
      }
    },
    ...(options.shadowRoot ? { root: options.shadowRoot } : {}),
  } as ConstructorParameters<typeof EditorView>[1])

  const loadDocument = (next: SemanticDocument) => {
    documentRef.current = next
    const nextState = createEditorState(next, {
      layoutEnabled: true,
      forceInProcessLayout: options.forceInProcessLayout,
      getBridgeContext: () => ({
        assets: documentRef.current.assets,
        fontAssets: documentRef.current.fontAssets,
        styles: documentRef.current.styles,
        headers: documentRef.current.headers,
        footers: documentRef.current.footers,
        numberingDefinitions: documentRef.current.numberingDefinitions,
        editorMetadata: documentRef.current.editorMetadata,
      }),
    })
    view.updateState(nextState)
    options.onChange?.(next)
  }

  return {
    destroy: () => {
      view.destroy()
      host.replaceChildren()
    },
    loadDocx: async (bytes) => {
      loadDocument(parseEmbedDocx(bytes))
    },
    getDocx: async () => serializeEmbedDocx(documentRef.current),
    getPdf: async () => serializeEmbedPdf(documentRef.current),
    setReadOnly: (value) => {
      readOnlyRef.current = value
      view.setProps({ editable: () => !readOnlyRef.current })
    },
    getDocument: () => documentRef.current,
  }
}
