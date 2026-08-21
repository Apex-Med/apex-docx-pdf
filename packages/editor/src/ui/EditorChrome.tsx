import { PortalContainerProvider } from "@workspace/ui/lib/portal-container"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { TooltipProvider } from "@workspace/ui/components/tooltip"
import { useRef, type CSSProperties, type ReactNode } from "react"

import {
  EDITOR_WORKSPACE_TABS,
  type EditorChromeActions,
  type EditorChromeResources,
  type EditorChromeViewState,
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
  const portalRef = useRef<HTMLElement | ShadowRoot | null>(
    portalContainer ?? null
  )
  portalRef.current = portalContainer ?? null
  const pagesRef = useRef<HTMLDivElement | null>(null)

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
          <Tabs
            value={view.workspaceTab}
            onValueChange={(value) => {
              if (
                value === "document" ||
                value === "form" ||
                value === "preview"
              ) {
                actions.onWorkspaceTabChange(value)
              }
            }}
            className="apex-editor-workspace-tabs gap-0"
          >
            <TabsList
              variant="line"
              className="h-9 w-full justify-start rounded-none px-2"
            >
              {EDITOR_WORKSPACE_TABS.map(([id, label]) => (
                <TabsTrigger key={id} value={id} className="flex-none px-3">
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {view.workspaceTab === "document" ? (
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
              tableOptionsOpen={view.tableOptionsOpen}
              onCustomPalettesChange={resources.onCustomPalettesChange}
            />
          ) : null}
          {view.workspaceTab === "document" && view.rulerVisible && section ? (
            <Ruler
              pageWidthTwips={section.pageWidth}
              marginLeftTwips={section.marginLeft}
              marginRightTwips={section.marginRight}
              indentStartTwips={paragraph?.indentStart ?? 0}
              firstLineIndentTwips={paragraph?.firstLineIndent ?? 0}
              tabStops={paragraph?.tabStops ?? []}
              zoom={view.zoom}
              pageHostRef={pagesRef}
              onMarginsChange={actions.onMarginsChange}
              onIndentsChange={actions.onIndentsChange}
              onTabStopsChange={actions.onTabStopsChange}
            />
          ) : null}
          <div
            ref={pagesRef}
            key="apex-editor-pages"
            className="apex-editor-pages min-h-0 flex-1"
            style={pagesStyle}
          >
            {children}
          </div>
        </div>
      </TooltipProvider>
    </PortalContainerProvider>
  )
}
