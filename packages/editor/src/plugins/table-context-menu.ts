import { Plugin, PluginKey, type EditorState } from "prosemirror-state"
import type { EditorView } from "prosemirror-view"
import { CellSelection, deleteTable, isInTable } from "prosemirror-tables"

import {
  setCellBorderStyle,
  setCellShading,
  selectCurrentTableColumn,
  selectEnclosingTable,
  selectedTableCellPositions,
  moveCurrentTableColumn,
  moveCurrentTableRow,
  tableCommands,
  type CellBorderSide,
} from "../commands"

export const tableContextMenuPluginKey = new PluginKey("apexTableContextMenu")

type MenuItem = Readonly<{
  id: string
  label: string
  run: (state: EditorState, dispatch: EditorView["dispatch"]) => boolean
  danger?: boolean
  separatorBefore?: boolean
  section?: string
}>

let menuCellPositions: readonly number[] = []

const solid = (
  side: CellBorderSide,
  style: "none" | "single" | "double" | "dotted" | "dashed" = "single"
) => setCellBorderStyle(side, style, "#000000", 15, menuCellPositions)

const MENU_ITEMS: readonly MenuItem[] = [
  {
    id: "select-column",
    label: "Select column",
    run: (state, dispatch) => selectCurrentTableColumn()(state, dispatch),
  },
  {
    id: "select-table",
    label: "Select table",
    run: (state, dispatch) => selectEnclosingTable()(state, dispatch),
  },
  {
    id: "row-before",
    label: "Insert row above",
    run: (state, dispatch) => tableCommands.addRowBefore(state, dispatch),
    separatorBefore: true,
  },
  {
    id: "row-after",
    label: "Insert row below",
    run: (state, dispatch) => tableCommands.addRowAfter(state, dispatch),
  },
  {
    id: "col-before",
    label: "Insert column left",
    run: (state, dispatch) => tableCommands.addColumnBefore(state, dispatch),
  },
  {
    id: "col-after",
    label: "Insert column right",
    run: (state, dispatch) => tableCommands.addColumnAfter(state, dispatch),
  },
  {
    id: "row-up",
    label: "Move row up",
    run: (state, dispatch) => moveCurrentTableRow(-1)(state, dispatch),
    separatorBefore: true,
  },
  {
    id: "row-down",
    label: "Move row down",
    run: (state, dispatch) => moveCurrentTableRow(1)(state, dispatch),
  },
  {
    id: "col-left",
    label: "Move column left",
    run: (state, dispatch) => moveCurrentTableColumn(-1)(state, dispatch),
  },
  {
    id: "col-right",
    label: "Move column right",
    run: (state, dispatch) => moveCurrentTableColumn(1)(state, dispatch),
  },
  {
    id: "delete-row",
    label: "Delete row",
    run: (state, dispatch) => tableCommands.deleteRow(state, dispatch),
    danger: true,
    separatorBefore: true,
  },
  {
    id: "delete-col",
    label: "Delete column",
    run: (state, dispatch) => tableCommands.deleteColumn(state, dispatch),
    danger: true,
  },
  {
    id: "delete-table",
    label: "Delete table",
    run: (state, dispatch) => deleteTable(state, dispatch),
    danger: true,
  },
  // Per-side borders
  {
    id: "border-all",
    label: "Borders: all sides",
    run: (state, dispatch) => solid("all")(state, dispatch),
    separatorBefore: true,
    section: "Borders",
  },
  {
    id: "border-top",
    label: "Border: top",
    run: (state, dispatch) => solid("top")(state, dispatch),
    section: "Borders",
  },
  {
    id: "border-bottom",
    label: "Border: bottom",
    run: (state, dispatch) => solid("bottom")(state, dispatch),
    section: "Borders",
  },
  {
    id: "border-left",
    label: "Border: left",
    run: (state, dispatch) => solid("left")(state, dispatch),
    section: "Borders",
  },
  {
    id: "border-right",
    label: "Border: right",
    run: (state, dispatch) => solid("right")(state, dispatch),
    section: "Borders",
  },
  {
    id: "border-none",
    label: "Borders: none",
    run: (state, dispatch) => solid("all", "none")(state, dispatch),
    section: "Borders",
  },
  {
    id: "border-dashed",
    label: "Borders: dashed",
    run: (state, dispatch) => solid("all", "dashed")(state, dispatch),
    section: "Borders",
  },
  {
    id: "shade-light",
    label: "Shading: light gray",
    run: (state, dispatch) =>
      setCellShading("#f1f3f4", menuCellPositions)(state, dispatch),
    separatorBefore: true,
    section: "Shading",
  },
  {
    id: "shade-none",
    label: "Shading: none",
    run: (state, dispatch) =>
      setCellShading(null, menuCellPositions)(state, dispatch),
    section: "Shading",
  },
]

/**
 * Right-click context menu for table cells: rows/columns + per-side borders.
 */
export function createTableContextMenuPlugin(): Plugin {
  let menuEl: HTMLElement | null = null
  let activeView: EditorView | null = null

  const dismiss = (): void => {
    if (menuEl) {
      menuEl.remove()
      menuEl = null
    }
    window.removeEventListener("pointerdown", onPointerDownOutside, true)
    window.removeEventListener("keydown", onKeyDown, true)
    window.removeEventListener("blur", dismiss)
  }

  const onPointerDownOutside = (event: Event): void => {
    if (!menuEl) return
    if (event.target instanceof Node && menuEl.contains(event.target)) return
    dismiss()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") dismiss()
  }

  const showMenu = (
    view: EditorView,
    clientX: number,
    clientY: number
  ): void => {
    dismiss()
    activeView = view
    menuCellPositions = selectedTableCellPositions(view.state)
    if (!isInTable(view.state)) return

    const root =
      view.dom.getRootNode instanceof Function
        ? view.dom.getRootNode()
        : document
    const host: ParentNode =
      root instanceof ShadowRoot
        ? root
        : root instanceof Document
          ? root.body
          : document.body

    const menu = document.createElement("div")
    menu.className = "apex-table-context-menu"
    menu.setAttribute("role", "menu")
    menu.setAttribute("data-apex-table-menu", "true")
    menu.style.left = `${clientX}px`
    menu.style.top = `${clientY}px`

    let lastSection: string | undefined
    for (const item of MENU_ITEMS) {
      if (item.section && item.section !== lastSection) {
        if (lastSection !== undefined || item.separatorBefore) {
          const sep = document.createElement("div")
          sep.className = "apex-table-context-menu__separator"
          sep.setAttribute("role", "separator")
          menu.append(sep)
        }
        const heading = document.createElement("div")
        heading.className = "apex-table-context-menu__submenu-label"
        heading.textContent = item.section
        menu.append(heading)
        lastSection = item.section
      } else if (item.separatorBefore) {
        const sep = document.createElement("div")
        sep.className = "apex-table-context-menu__separator"
        sep.setAttribute("role", "separator")
        menu.append(sep)
      }

      // Dry-run: commands return false when not applicable.
      const enabled = item.run(view.state, undefined as never)
      const button = document.createElement("button")
      button.type = "button"
      button.className = item.danger
        ? "apex-table-context-menu__item apex-table-context-menu__item--danger"
        : "apex-table-context-menu__item"
      button.setAttribute("role", "menuitem")
      button.disabled = !enabled
      button.textContent = item.label
      button.addEventListener("click", (event) => {
        event.preventDefault()
        event.stopPropagation()
        if (!activeView || button.disabled) return
        const { state, dispatch } = activeView
        item.run(state, dispatch)
        activeView.focus()
        dismiss()
      })
      menu.append(button)
    }

    host.append(menu)
    menuEl = menu

    const rect = menu.getBoundingClientRect()
    const maxX = window.innerWidth - rect.width - 8
    const maxY = window.innerHeight - rect.height - 8
    if (rect.left > maxX) menu.style.left = `${Math.max(8, maxX)}px`
    if (rect.top > maxY) menu.style.top = `${Math.max(8, maxY)}px`

    window.addEventListener("pointerdown", onPointerDownOutside, true)
    window.addEventListener("keydown", onKeyDown, true)
    window.addEventListener("blur", dismiss)
  }

  const selectClickedCell = (
    view: EditorView,
    clientX: number,
    clientY: number
  ): void => {
    const hit = view.posAtCoords({ left: clientX, top: clientY })
    if (!hit) return
    const $hit = view.state.doc.resolve(hit.pos)
    let depth = $hit.depth
    while (
      depth > 0 &&
      $hit.node(depth).type.name !== "table_cell" &&
      $hit.node(depth).type.name !== "table_header"
    ) {
      depth -= 1
    }
    if (depth === 0) return
    const cellPos = $hit.before(depth)
    if (selectedTableCellPositions(view.state).includes(cellPos)) return
    view.dispatch(
      view.state.tr.setSelection(
        CellSelection.create(view.state.doc, cellPos, cellPos)
      )
    )
  }

  return new Plugin({
    key: tableContextMenuPluginKey,
    view() {
      return {
        destroy() {
          dismiss()
          activeView = null
        },
      }
    },
    props: {
      handleDOMEvents: {
        contextmenu(view, event) {
          if (!isInTable(view.state)) return false
          if (
            !(event.target instanceof Node) ||
            !view.dom.contains(event.target)
          ) {
            return false
          }
          event.preventDefault()
          selectClickedCell(view, event.clientX, event.clientY)
          showMenu(view, event.clientX, event.clientY)
          return true
        },
      },
    },
  })
}

export function tableContextMenuItems(): readonly MenuItem[] {
  return MENU_ITEMS
}

export function selectionIsInTable(state: EditorState): boolean {
  return isInTable(state)
}
