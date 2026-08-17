import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from "@workspace/ui/components/menubar"
import { useId, useState, type ReactNode } from "react"

import type { EditorChromeActions, EditorChromeViewState } from "./chrome-types"
import { ZOOM_PRESETS } from "./chrome-types"

export type MenuBarProps = Readonly<{
  actions: EditorChromeActions
  view: EditorChromeViewState
  styleNames: readonly { id: string; name: string }[]
}>

export function MenuBar({
  actions,
  view,
  styleNames,
}: MenuBarProps): ReactNode {
  const [aboutOpen, setAboutOpen] = useState(false)
  const openDocxInputId = useId()
  const insertImageInputId = useId()
  const inTable = view.snapshot.table.inTable

  return (
    <>
      <Menubar className="apex-editor-menubar h-9 border-0 border-b border-(--apex-chrome-border) bg-(--apex-chrome-bg) px-2">
        <MenubarMenu>
          <MenubarTrigger className="apex-editor-menubar__trigger px-2.5 py-1 text-[14px] font-normal tracking-normal normal-case">
            File
          </MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={actions.onNew}>New</MenubarItem>
            <MenubarItem
              render={
                <label htmlFor={openDocxInputId} aria-label="Open document" />
              }
            >
              Open…
            </MenubarItem>
            <MenubarItem onClick={actions.onSaveDocx}>
              Save
              <MenubarShortcut>⌘S</MenubarShortcut>
            </MenubarItem>
            <MenubarSub>
              <MenubarSubTrigger>Download</MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarItem onClick={actions.onExportPdf}>
                  PDF Document (.pdf)
                </MenubarItem>
              </MenubarSubContent>
            </MenubarSub>
            <MenubarSeparator />
            <MenubarItem onClick={actions.onPageSetup}>Page setup…</MenubarItem>
            <MenubarItem onClick={actions.onPrint}>
              Print
              <MenubarShortcut>⌘P</MenubarShortcut>
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger className="apex-editor-menubar__trigger px-2.5 py-1 text-[14px] font-normal tracking-normal normal-case">
            Edit
          </MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={actions.onUndo}>
              Undo
              <MenubarShortcut>⌘Z</MenubarShortcut>
            </MenubarItem>
            <MenubarItem onClick={actions.onRedo}>
              Redo
              <MenubarShortcut>⌘Y</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={actions.onCut}>
              Cut
              <MenubarShortcut>⌘X</MenubarShortcut>
            </MenubarItem>
            <MenubarItem onClick={actions.onCopy}>
              Copy
              <MenubarShortcut>⌘C</MenubarShortcut>
            </MenubarItem>
            <MenubarItem onClick={actions.onPaste}>
              Paste
              <MenubarShortcut>⌘V</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={actions.onSelectAll}>
              Select all
              <MenubarShortcut>⌘A</MenubarShortcut>
            </MenubarItem>
            <MenubarItem onClick={actions.onFindReplace}>
              Find and replace…
              <MenubarShortcut>⌘F</MenubarShortcut>
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger className="apex-editor-menubar__trigger px-2.5 py-1 text-[14px] font-normal tracking-normal normal-case">
            View
          </MenubarTrigger>
          <MenubarContent>
            <MenubarCheckboxItem checked={view.printLayout}>
              Print layout
            </MenubarCheckboxItem>
            <MenubarCheckboxItem
              checked={view.rulerVisible}
              onCheckedChange={() => actions.onToggleRuler()}
            >
              Show ruler
            </MenubarCheckboxItem>
            <MenubarCheckboxItem
              checked={view.tagsSidebarOpen}
              onCheckedChange={() => actions.onToggleTagsSidebar()}
            >
              Tags sidebar
            </MenubarCheckboxItem>
            <MenubarCheckboxItem
              checked={view.darkPages}
              onCheckedChange={() => actions.onToggleDarkPages()}
            >
              Dark pages
            </MenubarCheckboxItem>
            <MenubarCheckboxItem
              checked={view.previewOn}
              onCheckedChange={() => actions.onTogglePreview()}
            >
              Show print preview
            </MenubarCheckboxItem>
            <MenubarCheckboxItem
              checked={view.divergenceOn}
              onCheckedChange={() => actions.onToggleDivergence()}
            >
              Divergence overlay
            </MenubarCheckboxItem>
            <MenubarSeparator />
            <MenubarSub>
              <MenubarSubTrigger>Zoom</MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarRadioGroup
                  value={String(view.zoom)}
                  onValueChange={(value) => {
                    if (value) actions.onZoomChange(Number(value))
                  }}
                >
                  {ZOOM_PRESETS.map((preset) => (
                    <MenubarRadioItem key={preset} value={String(preset)}>
                      {preset}%
                    </MenubarRadioItem>
                  ))}
                </MenubarRadioGroup>
              </MenubarSubContent>
            </MenubarSub>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger className="apex-editor-menubar__trigger px-2.5 py-1 text-[14px] font-normal tracking-normal normal-case">
            Insert
          </MenubarTrigger>
          <MenubarContent>
            <MenubarItem
              render={
                <label htmlFor={insertImageInputId} aria-label="Insert image" />
              }
            >
              Image…
            </MenubarItem>
            <MenubarSub>
              <MenubarSubTrigger>Table</MenubarSubTrigger>
              <MenubarSubContent className="p-2">
                <TableGridPicker onInsert={actions.onInsertTable} />
              </MenubarSubContent>
            </MenubarSub>
            <MenubarSub>
              <MenubarSubTrigger>Break</MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarItem onClick={actions.onInsertPageBreak}>
                  Page break
                  <MenubarShortcut>⌘↵</MenubarShortcut>
                </MenubarItem>
                <MenubarItem onClick={actions.onInsertColumnBreak}>
                  Column break
                </MenubarItem>
              </MenubarSubContent>
            </MenubarSub>
            <MenubarItem onClick={actions.onInsertTag}>Tag…</MenubarItem>
            <MenubarItem onClick={actions.onInsertLink}>Link…</MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger className="apex-editor-menubar__trigger px-2.5 py-1 text-[14px] font-normal tracking-normal normal-case">
            Format
          </MenubarTrigger>
          <MenubarContent>
            <MenubarSub>
              <MenubarSubTrigger>Text</MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarItem onClick={actions.onBold}>
                  Bold
                  <MenubarShortcut>⌘B</MenubarShortcut>
                </MenubarItem>
                <MenubarItem onClick={actions.onItalic}>
                  Italic
                  <MenubarShortcut>⌘I</MenubarShortcut>
                </MenubarItem>
                <MenubarItem onClick={actions.onUnderline}>
                  Underline
                  <MenubarShortcut>⌘U</MenubarShortcut>
                </MenubarItem>
                <MenubarItem onClick={actions.onStrikethrough}>
                  Strikethrough
                  <MenubarShortcut>⌘⇧X</MenubarShortcut>
                </MenubarItem>
                <MenubarSeparator />
                <MenubarItem
                  onClick={() => actions.onVerticalAlignment("superscript")}
                >
                  Superscript
                </MenubarItem>
                <MenubarItem
                  onClick={() => actions.onVerticalAlignment("subscript")}
                >
                  Subscript
                </MenubarItem>
                <MenubarItem
                  onClick={() => actions.onVerticalAlignment("baseline")}
                >
                  Baseline
                </MenubarItem>
              </MenubarSubContent>
            </MenubarSub>
            <MenubarSub>
              <MenubarSubTrigger>Paragraph styles</MenubarSubTrigger>
              <MenubarSubContent>
                {styleNames.map((style) => (
                  <MenubarItem
                    key={style.id}
                    onClick={() => actions.onApplyStyle(style.id)}
                  >
                    {style.name === "Normal" ? "Normal text" : style.name}
                  </MenubarItem>
                ))}
                <MenubarSeparator />
                <MenubarItem onClick={() => actions.onApplyStyle(null)}>
                  Clear style
                </MenubarItem>
                <MenubarItem onClick={actions.onMatchStyle}>
                  Match style to selection
                </MenubarItem>
                <MenubarItem onClick={actions.onCreateStyle}>
                  Create style from selection…
                </MenubarItem>
                <MenubarItem onClick={actions.onUpdateStyle}>
                  Update current style to match
                </MenubarItem>
              </MenubarSubContent>
            </MenubarSub>
            <MenubarSub>
              <MenubarSubTrigger>Align &amp; indent</MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarItem onClick={() => actions.onAlign("left")}>
                  Left
                </MenubarItem>
                <MenubarItem onClick={() => actions.onAlign("center")}>
                  Center
                </MenubarItem>
                <MenubarItem onClick={() => actions.onAlign("right")}>
                  Right
                </MenubarItem>
                <MenubarItem onClick={() => actions.onAlign("justify")}>
                  Justify
                </MenubarItem>
                <MenubarSeparator />
                <MenubarItem onClick={actions.onIndentDecrease}>
                  Decrease indent
                  <MenubarShortcut>⇧Tab</MenubarShortcut>
                </MenubarItem>
                <MenubarItem onClick={actions.onIndentIncrease}>
                  Increase indent
                  <MenubarShortcut>Tab</MenubarShortcut>
                </MenubarItem>
              </MenubarSubContent>
            </MenubarSub>
            <MenubarItem onClick={actions.onLineSpacing}>
              Line &amp; paragraph spacing
            </MenubarItem>
            <MenubarItem onClick={actions.onColumns}>Columns…</MenubarItem>
            <MenubarSub>
              <MenubarSubTrigger>Bullets &amp; numbering</MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarItem onClick={actions.onBulletList}>
                  Bulleted list
                </MenubarItem>
                <MenubarItem onClick={actions.onNumberedList}>
                  Numbered list
                </MenubarItem>
              </MenubarSubContent>
            </MenubarSub>
            <MenubarItem onClick={actions.onClearFormatting}>
              Clear formatting
            </MenubarItem>
            <MenubarSeparator />
            <MenubarSub>
              <MenubarSubTrigger>Table</MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarItem
                  disabled={!inTable}
                  onClick={actions.onTableAddRowBefore}
                >
                  Insert row above
                </MenubarItem>
                <MenubarItem
                  disabled={!inTable}
                  onClick={actions.onTableAddRowAfter}
                >
                  Insert row below
                </MenubarItem>
                <MenubarItem
                  disabled={!inTable}
                  onClick={actions.onTableAddColumnBefore}
                >
                  Insert column left
                </MenubarItem>
                <MenubarItem
                  disabled={!inTable}
                  onClick={actions.onTableAddColumnAfter}
                >
                  Insert column right
                </MenubarItem>
                <MenubarSeparator />
                <MenubarItem disabled={!inTable} onClick={actions.onTableDeleteRow}>
                  Delete row
                </MenubarItem>
                <MenubarItem
                  disabled={!inTable}
                  onClick={actions.onTableDeleteColumn}
                >
                  Delete column
                </MenubarItem>
                <MenubarSeparator />
                <MenubarItem
                  disabled={!inTable}
                  onClick={actions.onTableMergeCells}
                >
                  Merge cells
                </MenubarItem>
                <MenubarItem disabled={!inTable} onClick={actions.onTableSplitCell}>
                  Split cell
                </MenubarItem>
                <MenubarSeparator />
                <MenubarItem
                  disabled={!inTable}
                  onClick={actions.onTableProperties}
                >
                  Table options
                </MenubarItem>
              </MenubarSubContent>
            </MenubarSub>
            <MenubarSeparator />
            <MenubarItem onClick={() => actions.onTextColor("#000000")}>
              Text color…
            </MenubarItem>
            <MenubarItem onClick={() => actions.onHighlightColor("#ffff00")}>
              Highlight color…
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger className="apex-editor-menubar__trigger px-2.5 py-1 text-[14px] font-normal tracking-normal normal-case">
            Tools
          </MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={actions.onWordCount}>Word count</MenubarItem>
            <MenubarItem disabled>Spelling (browser native)</MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger className="apex-editor-menubar__trigger px-2.5 py-1 text-[14px] font-normal tracking-normal normal-case">
            Help
          </MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={() => setAboutOpen(true)}>About</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>

      <input
        id={openDocxInputId}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) actions.onOpenDocx(file)
          event.target.value = ""
        }}
      />
      <input
        id={insertImageInputId}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/svg+xml,.svg"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) actions.onInsertImage(file)
          event.target.value = ""
        }}
      />

      <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Apex DOCX Editor</DialogTitle>
            <DialogDescription>
              Engine-authoritative paginated document editor with DOCX import,
              layout, and PDF export.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" size="sm" onClick={() => setAboutOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function TableGridPicker({
  onInsert,
}: {
  onInsert: (rows?: number, columns?: number) => void
}): ReactNode {
  const [hovered, setHovered] = useState({ rows: 2, columns: 2 })
  return (
    <fieldset className="grid gap-2 border-0 p-0">
      <legend className="sr-only">Insert table size</legend>
      <div className="text-xs text-muted-foreground" aria-live="polite">
        {hovered.rows} × {hovered.columns}
      </div>
      <div
        className="grid grid-cols-8 gap-1"
        style={{ gridTemplateColumns: "repeat(8, 1.25rem)" }}
      >
        {Array.from({ length: 64 }, (_, index) => {
          const rows = Math.floor(index / 8) + 1
          const columns = (index % 8) + 1
          const active = rows <= hovered.rows && columns <= hovered.columns
          return (
            <MenubarItem
              key={`${rows}-${columns}`}
              render={<button type="button" />}
              aria-label={`${rows} rows by ${columns} columns`}
              className={`size-5 min-h-5 rounded-sm border p-0 ${active
                ? "border-primary bg-primary/20"
                : "border-border bg-background"
                } focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring`}
              onPointerEnter={() => setHovered({ rows, columns })}
              onFocus={() => setHovered({ rows, columns })}
              onClick={() => onInsert(rows, columns)}
            />
          )
        })}
      </div>
    </fieldset>
  )
}
