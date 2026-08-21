import { GapCursor } from "prosemirror-gapcursor"
import type { Node as PMNode, ResolvedPos } from "prosemirror-model"
import { Plugin, TextSelection } from "prosemirror-state"
import type { EditorView } from "prosemirror-view"

const gapCursorValid = (
  GapCursor as unknown as { valid: (pos: ResolvedPos) => boolean }
).valid

export type RectBox = Readonly<{
  left: number
  top: number
  right: number
  bottom: number
}>

export type TableClickSide = "before" | "after"

const TEXT_HIT_SELECTOR =
  "p, td, th, li, img, .apex-image-node, .apex-table-dnd__handle, .column-resize-handle"

/**
 * Clicks in the page margin beside a table should leave the table, not land
 * in the nearest cell. `posAtCoords` otherwise maps those hits inward.
 *
 * Left-margin clicks above the table still count as "before" so the user can
 * put a caret in front of a leading table without first creating a paragraph.
 */
export function tableClickSide(
  click: Readonly<{ x: number; y: number }>,
  table: RectBox,
  page: RectBox
): TableClickSide | null {
  if (
    click.x < page.left ||
    click.x > page.right ||
    click.y < page.top ||
    click.y > page.bottom
  ) {
    return null
  }
  const inside =
    click.x >= table.left &&
    click.x <= table.right &&
    click.y >= table.top &&
    click.y <= table.bottom
  if (inside) return null
  if (
    click.x > table.right &&
    click.y >= table.top &&
    click.y <= table.bottom
  ) {
    return "after"
  }
  if (click.x < table.left && click.y <= table.bottom) return "before"
  return null
}

export type TableCaretTarget =
  | Readonly<{ kind: "text"; pos: number }>
  | Readonly<{ kind: "gap"; pos: number }>

/**
 * Where a click beside a table should put the caret.
 * Never inserts a paragraph — typing at a gap cursor creates one.
 */
export function caretAroundTable(
  doc: PMNode,
  tablePos: number,
  tableNode: PMNode,
  side: TableClickSide
): TableCaretTarget | null {
  const gap = side === "after" ? tablePos + tableNode.nodeSize : tablePos
  const $gap = doc.resolve(gap)
  if (gapCursorValid($gap)) return { kind: "gap", pos: gap }
  const neighbor = side === "after" ? $gap.nodeAfter : $gap.nodeBefore
  if (neighbor?.isTextblock) {
    return { kind: "text", pos: side === "after" ? gap + 1 : gap - 1 }
  }
  return null
}

function pageBoxForTable(table: HTMLTableElement): DOMRect {
  const section = table.closest("section")
  return (section ?? table).getBoundingClientRect()
}

function tableNodeAt(
  view: EditorView,
  table: HTMLTableElement
): { pos: number; node: PMNode } | null {
  const start = view.posAtDOM(table, 0)
  const $pos = view.state.doc.resolve(start)
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === "table") {
      return { pos: $pos.before(depth), node: $pos.node(depth) }
    }
  }
  const direct = view.state.doc.nodeAt(start)
  if (direct?.type.name === "table") return { pos: start, node: direct }
  return null
}

function isTextHit(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(target.closest(TEXT_HIT_SELECTOR))
}

function placeAroundTable(
  view: EditorView,
  tablePos: number,
  tableNode: PMNode,
  side: TableClickSide
): boolean {
  const target = caretAroundTable(view.state.doc, tablePos, tableNode, side)
  if (!target) return false
  if (!view.hasFocus()) view.focus()
  const selection =
    target.kind === "gap"
      ? new GapCursor(view.state.doc.resolve(target.pos))
      : TextSelection.create(view.state.doc, target.pos)
  view.dispatch(view.state.tr.setSelection(selection))
  return true
}

function handleTableChromeClick(view: EditorView, event: MouseEvent): boolean {
  if (!view.editable) return false
  if (event.button !== 0) return false
  if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) {
    return false
  }
  const click = { x: event.clientX, y: event.clientY }
  const tables = Array.from(view.dom.querySelectorAll("table"))
  let best:
    | {
        table: HTMLTableElement
        side: TableClickSide
        distance: number
      }
    | undefined
  for (const table of tables) {
    const tableBox = table.getBoundingClientRect()
    const side = tableClickSide(click, tableBox, pageBoxForTable(table))
    if (!side) continue
    const distance =
      side === "after" ? click.x - tableBox.right : tableBox.left - click.x
    if (!best || distance < best.distance) {
      best = { table, side, distance }
    }
  }
  if (best) {
    const found = tableNodeAt(view, best.table)
    if (!found) return false
    return placeAroundTable(view, found.pos, found.node, best.side)
  }

  if (isTextHit(event.target)) return false

  const nearestBelow = tables
    .map((table) => ({ table, box: table.getBoundingClientRect() }))
    .filter(({ box }) => box.top > click.y)
    .sort((left, right) => left.box.top - right.box.top)[0]
  if (nearestBelow) {
    const page = pageBoxForTable(nearestBelow.table)
    const closeAbove = nearestBelow.box.top - click.y < 120
    if (closeAbove && click.x >= page.left && click.x <= page.right) {
      const found = tableNodeAt(view, nearestBelow.table)
      if (found && !view.state.doc.resolve(found.pos).nodeBefore) {
        return placeAroundTable(view, found.pos, found.node, "before")
      }
    }
  }

  const above = tables
    .map((table) => ({ table, box: table.getBoundingClientRect() }))
    .filter(({ box }) => box.bottom < click.y)
    .sort((left, right) => right.box.bottom - left.box.bottom)[0]
  if (!above) return false
  const page = pageBoxForTable(above.table)
  if (click.x < page.left || click.x > page.right) return false
  const found = tableNodeAt(view, above.table)
  if (!found) return false
  const $after = view.state.doc.resolve(found.pos + found.node.nodeSize)
  if ($after.nodeAfter) return false
  return placeAroundTable(view, found.pos, found.node, "after")
}

/** Clicks beside/below a table place a visible caret after (or before) it. */
export function createTableCaretPlugin(): Plugin {
  return new Plugin({
    props: {
      handleDOMEvents: {
        mousedown(view, event) {
          if (!(event instanceof MouseEvent)) return false
          if (!handleTableChromeClick(view, event)) return false
          event.preventDefault()
          return true
        },
      },
      handleClick(view, _pos, event) {
        return handleTableChromeClick(view, event)
      },
    },
  })
}
