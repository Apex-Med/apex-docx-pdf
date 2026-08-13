import { PortalContainerProvider } from "@workspace/ui/lib/portal-container"
import { TooltipProvider } from "@workspace/ui/components/tooltip"
import { useRef, type CSSProperties, type ReactNode } from "react"

import type {
  EditorChromeActions,
  EditorChromeResources,
  EditorChromeViewState,
} from "./chrome-types"
import { MenuBar } from "./MenuBar"
import { Ruler } from "./Ruler"
import { Toolbar } from "./Toolbar"

export type EditorChromeProps = Readonly<{
  actions: EditorChromeActions
  view: EditorChromeViewState
  resources: EditorChromeResources
  /** Shadow root or host element for overlay portals (embed). */
  portalContainer?: HTMLElement | ShadowRoot | null
  children: ReactNode
}>

export function EditorChrome({
  actions,
  view,
  resources,
  portalContainer,
  children,
}: EditorChromeProps): ReactNode {
  const portalRef = useRef<HTMLElement | ShadowRoot | null>(portalContainer ?? null)
  portalRef.current = portalContainer ?? null

  const section = view.snapshot.section
  const paragraph = view.snapshot.paragraph

  const pagesStyle = {
    "--apex-zoom": view.zoom / 100,
  } as CSSProperties

  return (
    <PortalContainerProvider container={portalRef}>
      <TooltipProvider>
        <div className="apex-editor-chrome flex min-h-0 flex-1 flex-col">
          <MenuBar
            actions={actions}
            view={view}
            styleNames={resources.styleNames}
          />
          <Toolbar
            actions={actions}
            snapshot={view.snapshot}
            zoom={view.zoom}
            fonts={resources.fonts}
            googleFonts={resources.googleFonts}
            fontCatalog={resources.fontCatalog}
            styleNames={resources.styleNames}
            palettes={resources.palettes}
            customPalettes={resources.customPalettes}
            onCustomPalettesChange={resources.onCustomPalettesChange}
          />
          {view.rulerVisible && section ? (
            <Ruler
              pageWidthTwips={section.pageWidth}
              marginLeftTwips={section.marginLeft}
              marginRightTwips={section.marginRight}
              indentStartTwips={paragraph?.indentStart ?? 0}
              firstLineIndentTwips={paragraph?.firstLineIndent ?? 0}
              tabStops={paragraph?.tabStops ?? []}
              zoom={view.zoom}
              onMarginsChange={actions.onMarginsChange}
              onIndentsChange={actions.onIndentsChange}
              onTabStopsChange={actions.onTabStopsChange}
            />
          ) : null}
          <div className="apex-editor-pages min-h-0 flex-1" style={pagesStyle}>
            {children}
          </div>
        </div>
      </TooltipProvider>
    </PortalContainerProvider>
  )
}
