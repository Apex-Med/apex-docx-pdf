import type { SemanticBlock, SemanticDocument } from "@apexmed/core"
import { Button } from "@workspace/ui/components/button"
import { Switch } from "@workspace/ui/components/switch"
import { EditorState } from "prosemirror-state"
import { EditorView } from "prosemirror-view"
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"

import {
  headerFooterEditorDocument,
  type HeaderFooterKind,
  type HeaderFooterVariant,
} from "../header-footer"
import { fromSemanticDocument, toSemanticDocument } from "../model/bridge"
import { createImageNodeView } from "../node-views/image"
import { createTemplateTagNodeView } from "../node-views/template-tag"
import { createEditorPlugins } from "../plugins/create-plugins"
import {
  getSelectionSnapshot,
  type EditorSelectionSnapshot,
} from "../plugins/selection-state"
import { editorSchema } from "../schema"

type PageGeometry = Readonly<{
  left: number
  top: number
  width: number
  height: number
  marginLeft: number
  marginRight: number
  headerTop: number
  headerDivider: number
  footerDivider: number
  footerBottom: number
}>

function samePageGeometry(
  current: PageGeometry | null,
  next: PageGeometry | null
): boolean {
  if (current === next) return true
  if (!current || !next) return false
  return (
    current.left === next.left &&
    current.top === next.top &&
    current.width === next.width &&
    current.height === next.height &&
    current.marginLeft === next.marginLeft &&
    current.marginRight === next.marginRight &&
    current.headerTop === next.headerTop &&
    current.headerDivider === next.headerDivider &&
    current.footerDivider === next.footerDivider &&
    current.footerBottom === next.footerBottom
  )
}

export type HeaderFooterEditorProps = Readonly<{
  surface: HTMLElement
  mainView: EditorView
  initialDocument: SemanticDocument
  sectionId: string
  kind: HeaderFooterKind
  variant: HeaderFooterVariant
  zoom: number
  differentFirstPage: boolean
  readOnly: boolean
  onViewChange: (view: EditorView | null) => void
  onSelectionChange: (snapshot: EditorSelectionSnapshot) => void
  onBlocksChange: (blocks: readonly SemanticBlock[]) => void
  onDifferentFirstPageChange: (enabled: boolean) => void
  onClose: () => void
}>

function selectedSectionElement(
  mainView: EditorView,
  sectionId: string
): HTMLElement | null {
  const sections = mainView.dom.querySelectorAll<HTMLElement>(
    ":scope > section[data-section]"
  )
  return (
    Array.from(sections).find(
      (section) => section.dataset.nodeId === sectionId
    ) ?? null
  )
}

function measurePage(
  surface: HTMLElement,
  mainView: EditorView,
  document: SemanticDocument,
  sectionId: string,
  zoom: number
): PageGeometry | null {
  const element = selectedSectionElement(mainView, sectionId)
  const section = document.sections.find(
    (entry) => String(entry.id) === sectionId
  )
  if (!element || !section) return null
  const pageRect = element.getBoundingClientRect()
  const surfaceRect = surface.getBoundingClientRect()
  const scale = Math.max(0.1, zoom / 100)
  const pageLeft = pageRect.left - surfaceRect.left + surface.scrollLeft
  const pageTop = pageRect.top - surfaceRect.top + surface.scrollTop
  const toVisualPx = (twips: number) => (twips / 15) * scale
  const margins = section.properties.margins
  return {
    left: pageLeft,
    top: pageTop,
    width: pageRect.width,
    height: pageRect.height,
    marginLeft: toVisualPx(margins.left),
    marginRight: toVisualPx(margins.right),
    headerTop: toVisualPx(section.properties.headerDistance),
    headerDivider: toVisualPx(margins.top),
    footerDivider: toVisualPx(section.properties.pageHeight - margins.bottom),
    footerBottom: toVisualPx(section.properties.footerDistance),
  }
}

export function HeaderFooterEditor({
  surface,
  mainView,
  initialDocument,
  sectionId,
  kind,
  variant,
  zoom,
  differentFirstPage,
  readOnly,
  onViewChange,
  onSelectionChange,
  onBlocksChange,
  onDifferentFirstPageChange,
  onClose,
}: HeaderFooterEditorProps): ReactNode {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const [geometry, setGeometry] = useState<PageGeometry | null>(null)

  useLayoutEffect(() => {
    const sync = () => {
      const next = measurePage(
        surface,
        mainView,
        initialDocument,
        sectionId,
        zoom
      )
      setGeometry((current) =>
        samePageGeometry(current, next) ? current : next
      )
    }
    sync()
    surface.addEventListener("scroll", sync, { passive: true })
    const ownerWindow = surface.ownerDocument.defaultView
    ownerWindow?.addEventListener("resize", sync)
    const observer = new ResizeObserver(sync)
    observer.observe(surface)
    observer.observe(mainView.dom)
    return () => {
      surface.removeEventListener("scroll", sync)
      ownerWindow?.removeEventListener("resize", sync)
      observer.disconnect()
    }
  }, [initialDocument, mainView, sectionId, surface, zoom])

  const ready = geometry !== null
  useEffect(() => {
    if (!ready || !mountRef.current) return
    const editingDocument = headerFooterEditorDocument(
      initialDocument,
      sectionId,
      kind,
      variant
    )
    const state = EditorState.create({
      schema: editorSchema,
      doc: fromSemanticDocument(editingDocument),
      plugins: createEditorPlugins({ enablePagination: false }),
    })
    const view = new EditorView(mountRef.current, {
      state,
      editable: () => !readOnly,
      attributes: {
        class: "apex-prosemirror apex-header-footer-prosemirror",
        spellcheck: "true",
        "aria-label": `${variant === "first" ? "First-page " : ""}${kind}`,
      },
      nodeViews: {
        image: createImageNodeView,
        template_tag: createTemplateTagNodeView,
      },
      handleDOMEvents: {
        keydown: (_view, event) => {
          if (event.key !== "Escape") return false
          event.preventDefault()
          onClose()
          return true
        },
      },
      dispatchTransaction(transaction) {
        const next = view.state.apply(transaction)
        view.updateState(next)
        const snapshot = getSelectionSnapshot(next)
        if (snapshot) onSelectionChange(snapshot)
        if (!transaction.docChanged) return
        const semantic = toSemanticDocument(next.doc, {
          assets: initialDocument.assets,
          fontAssets: initialDocument.fontAssets,
          styles: initialDocument.styles,
          numberingDefinitions: initialDocument.numberingDefinitions,
          editorMetadata: initialDocument.editorMetadata,
        })
        const blocks = semantic.sections[0]?.blocks
        if (blocks) onBlocksChange(blocks)
      },
    })
    onViewChange(view)
    const snapshot = getSelectionSnapshot(view.state)
    if (snapshot) onSelectionChange(snapshot)
    queueMicrotask(() => view.focus())
    return () => {
      onViewChange(null)
      view.destroy()
    }
  }, [
    initialDocument,
    kind,
    onBlocksChange,
    onClose,
    onSelectionChange,
    onViewChange,
    readOnly,
    ready,
    sectionId,
    variant,
  ])

  if (!geometry) return null
  const label = `${kind === "header" ? "Header" : "Footer"}${
    variant === "first" ? " · First page" : ""
  }`
  const editorStyle =
    kind === "header"
      ? {
          left: 0,
          top: geometry.headerTop,
          width: geometry.width,
          "--apex-header-footer-margin-left": `${geometry.marginLeft}px`,
          "--apex-header-footer-margin-right": `${geometry.marginRight}px`,
        }
      : {
          left: 0,
          bottom: geometry.footerBottom,
          width: geometry.width,
          "--apex-header-footer-margin-left": `${geometry.marginLeft}px`,
          "--apex-header-footer-margin-right": `${geometry.marginRight}px`,
        }
  const typedEditorStyle = editorStyle as CSSProperties
  const dividerStyle = {
    left: 0,
    width: geometry.width,
    top: kind === "header" ? geometry.headerDivider : geometry.footerDivider,
  }
  const bodyExitStyle: CSSProperties = {
    left: 0,
    top: geometry.headerDivider,
    width: geometry.width,
    height: Math.max(0, geometry.footerDivider - geometry.headerDivider),
  }

  return createPortal(
    <section
      className={`apex-header-footer-editor apex-header-footer-editor--${kind}`}
      style={{
        left: geometry.left,
        top: geometry.top,
        width: geometry.width,
        height: geometry.height,
      }}
      aria-label={`${label} editing mode`}
    >
      <div
        className="apex-header-footer-editor__body-exit"
        style={bodyExitStyle}
        onDoubleClick={onClose}
        aria-hidden="true"
      />
      <div className="apex-header-footer-editor__divider" style={dividerStyle}>
        <div className="apex-header-footer-editor__controls">
          <span className="apex-header-footer-editor__label">{label}</span>
          <div className="apex-header-footer-editor__first-page">
            <Switch
              checked={differentFirstPage}
              onCheckedChange={onDifferentFirstPageChange}
              aria-label="Different first page"
            />
            <span>Different first page</span>
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
      <div
        ref={mountRef}
        className="apex-header-footer-editor__content"
        style={typedEditorStyle}
      />
    </section>,
    surface
  )
}
