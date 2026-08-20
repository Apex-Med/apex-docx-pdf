import { isQuestion, type FormNode, type FormPage } from "../model/types"

export const PALETTE_COLUMN = "palette"
export const CANVAS_COLUMN = "form-canvas"
export const PALETTE_ID_PREFIX = "palette:"
export const PARENT_ID_PREFIX = "parent:"

export type BoardContainer =
  | typeof PALETTE_COLUMN
  | typeof CANVAS_COLUMN
  | `${typeof PARENT_ID_PREFIX}${string}`

export type BoardIds = Readonly<{
  palette: readonly string[]
  canvas: readonly string[]
  nested: Readonly<Record<string, readonly string[]>>
}>

export function paletteDragId(kind: string): string {
  return `${PALETTE_ID_PREFIX}${kind}`
}

export function kindFromPaletteId(id: string): string | null {
  if (!id.startsWith(PALETTE_ID_PREFIX)) return null
  const kind = id.slice(PALETTE_ID_PREFIX.length)
  return kind.length > 0 ? kind : null
}

export function parentDropId(
  id: string
): `${typeof PARENT_ID_PREFIX}${string}` {
  return `${PARENT_ID_PREFIX}${id}`
}

export function parentIdFromDropId(id: string): string | null {
  if (!id.startsWith(PARENT_ID_PREFIX)) return null
  const parentId = id.slice(PARENT_ID_PREFIX.length)
  return parentId.length > 0 ? parentId : null
}

export function boardFromPage(
  page: FormPage | undefined,
  paletteIds: readonly string[]
): BoardIds {
  const nested: Record<string, string[]> = {}
  const canvas: string[] = []
  for (const node of page?.nodes ?? []) {
    canvas.push(node.id)
    collectNested(node, nested)
  }
  return { palette: paletteIds, canvas, nested }
}

function collectNested(node: FormNode, nested: Record<string, string[]>): void {
  if (!isQuestion(node) || node.kind !== "repeater") return
  nested[node.id] = (node.children ?? []).map((child) => child.id)
  for (const child of node.children ?? []) collectNested(child, nested)
}

export function isColumnId(id: string): boolean {
  return (
    id === PALETTE_COLUMN ||
    id === CANVAS_COLUMN ||
    id.startsWith(PARENT_ID_PREFIX)
  )
}

export function pickDropCollision(
  hitIds: readonly string[],
  activeId: string,
  board?: BoardIds
): string | undefined {
  const usable = hitIds.filter((id) => parentIdFromDropId(id) !== activeId)
  const nestedChildIds = new Set(
    board ? Object.values(board.nested).flat() : []
  )
  const nestedChild = usable.find(
    (id) => nestedChildIds.has(id) && id !== activeId
  )
  if (nestedChild) return nestedChild
  const nestedColumn = usable.find((id) => id.startsWith(PARENT_ID_PREFIX))
  if (nestedColumn) return nestedColumn
  const item = usable.find((id) => !isColumnId(id) && id !== activeId)
  if (item) return item
  return usable[0]
}

export function findContainer(
  board: BoardIds,
  id: string
): BoardContainer | null {
  if (id === PALETTE_COLUMN || board.palette.includes(id)) return PALETTE_COLUMN
  if (id === CANVAS_COLUMN || board.canvas.includes(id)) return CANVAS_COLUMN
  const nestedParent = parentIdFromDropId(id)
  if (nestedParent && nestedParent in board.nested) {
    return parentDropId(nestedParent)
  }
  for (const [parentId, ids] of Object.entries(board.nested)) {
    if (ids.includes(id)) return parentDropId(parentId)
  }
  return null
}

export function itemsOf(
  board: BoardIds,
  container: BoardContainer
): readonly string[] {
  if (container === PALETTE_COLUMN) return board.palette
  if (container === CANVAS_COLUMN) return board.canvas
  const parentId = parentIdFromDropId(container)
  if (!parentId) return []
  return board.nested[parentId] ?? []
}

export function dropLocation(
  board: BoardIds,
  activeId: string
): Readonly<{ index: number; parentId: string | null }> | null {
  const container = findContainer(board, activeId)
  if (!container || container === PALETTE_COLUMN) return null
  const index = itemsOf(board, container).indexOf(activeId)
  if (index === -1) return null
  return {
    index,
    parentId:
      container === CANVAS_COLUMN ? null : parentIdFromDropId(container),
  }
}

export type DropTarget = Readonly<{
  index: number
  parentId: string | null
}>

export function dropTargetsEqual(
  left: DropTarget | null,
  right: DropTarget | null
): boolean {
  if (left === right) return true
  if (!left || !right) return false
  return left.index === right.index && left.parentId === right.parentId
}

/** Insert slot for a new item hovering `overId`, without moving it onto the board. */
export function dropLocationFromOver(
  board: BoardIds,
  overId: string
): DropTarget | null {
  const container = findContainer(board, overId)
  if (!container || container === PALETTE_COLUMN) return null
  const items = itemsOf(board, container)
  return {
    index: columnDropIndex(items, overId, container, false),
    parentId:
      container === CANVAS_COLUMN ? null : parentIdFromDropId(container),
  }
}

export function boardsEqual(left: BoardIds, right: BoardIds): boolean {
  return (
    sameList(left.palette, right.palette) &&
    sameList(left.canvas, right.canvas) &&
    sameNested(left.nested, right.nested)
  )
}

export function moveBoardItem(
  board: BoardIds,
  activeId: string,
  overId: string
): BoardIds {
  if (activeId === overId) return board
  const activeContainer = findContainer(board, activeId)
  const overContainer = findContainer(board, overId)
  if (!activeContainer || !overContainer) return board
  if (
    overContainer === PALETTE_COLUMN &&
    kindFromPaletteId(activeId) === null
  ) {
    return board
  }
  // Hovering the wrapping repeater card while already inside it would
  // bounce the item back onto the canvas and retrigger onDragOver.
  if (parentIdFromDropId(activeContainer) === overId) return board
  const parentOfOver = parentIdFromDropId(overContainer)
  if (parentOfOver && ancestorContains(board, activeId, parentOfOver)) {
    return board
  }

  const activeItems = [...itemsOf(board, activeContainer)]
  const activeIndex = activeItems.indexOf(activeId)
  if (activeIndex === -1) return board

  if (activeContainer === overContainer) {
    const overIndex = columnDropIndex(activeItems, overId, overContainer, true)
    if (overIndex === activeIndex) return board
    return setItems(
      board,
      activeContainer,
      arrayMove(activeItems, activeIndex, overIndex)
    )
  }

  const overItems = [...itemsOf(board, overContainer)]
  const overIndex = columnDropIndex(overItems, overId, overContainer, false)
  const nextActive = [...activeItems]
  nextActive.splice(activeIndex, 1)
  const nextOver = [...overItems]
  nextOver.splice(overIndex, 0, activeId)
  return setItems(
    setItems(board, activeContainer, nextActive),
    overContainer,
    nextOver
  )
}

function columnDropIndex(
  items: readonly string[],
  overId: string,
  container: BoardContainer,
  sameContainer: boolean
): number {
  if (overId === container) {
    return sameContainer ? Math.max(items.length - 1, 0) : items.length
  }
  const index = items.indexOf(overId)
  if (index === -1) return items.length
  return index
}

function setItems(
  board: BoardIds,
  container: BoardContainer,
  items: readonly string[]
): BoardIds {
  if (container === PALETTE_COLUMN) return { ...board, palette: items }
  if (container === CANVAS_COLUMN) return { ...board, canvas: items }
  const parentId = parentIdFromDropId(container)
  if (!parentId) return board
  return {
    ...board,
    nested: { ...board.nested, [parentId]: items },
  }
}

function ancestorContains(
  board: BoardIds,
  activeId: string,
  parentId: string
): boolean {
  if (activeId === parentId) return true
  const children = board.nested[activeId]
  if (!children) return false
  return (
    children.includes(parentId) ||
    children.some((child) => ancestorContains(board, child, parentId))
  )
}

function sameList(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((id, index) => id === right[index])
  )
}

function sameNested(
  left: Readonly<Record<string, readonly string[]>>,
  right: Readonly<Record<string, readonly string[]>>
): boolean {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false
  return leftKeys.every((key) => sameList(left[key] ?? [], right[key] ?? []))
}

function arrayMove(items: string[], from: number, to: number): string[] {
  if (from === to) return items
  const next = [...items]
  const [item] = next.splice(from, 1)
  if (item === undefined) return items
  next.splice(to, 0, item)
  return next
}
