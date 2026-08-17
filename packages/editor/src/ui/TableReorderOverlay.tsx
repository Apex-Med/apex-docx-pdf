import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type ReactNode,
} from "react"
import type { Command } from "prosemirror-state"
import type { EditorView } from "prosemirror-view"

import {
  findEnclosingTable,
  moveTableColumn,
  moveTableRow,
  selectTableColumn,
  selectTableRow,
  tableHasMergedSpans,
} from "../commands/table-reorder"

type ReorderAxis = "row" | "column"

type Band = Readonly<{
  index: number
  start: number
  size: number
}>

type TableGeometry = Readonly<{
  tablePos: number
  left: number
  top: number
  right: number
  bottom: number
  rows: readonly Band[]
  columns: readonly Band[]
  canMoveRows: boolean
  canMoveColumns: boolean
}>

export type TableReorderOverlayProps = Readonly<{
  viewRef: MutableRefObject<EditorView | null>
  surfaceRef: MutableRefObject<HTMLDivElement | null>
  revision: number
  inTable: boolean
  zoom: number
  readOnly: boolean
}>

function parseHandleId(
  id: UniqueIdentifier | undefined | null
): { axis: ReorderAxis; index: number } | null {
  if (id == null) return null
  const match = String(id).match(/^(row|column):(\d+)$/u)
  if (!match) return null
  return {
    axis: match[1] === "row" ? "row" : "column",
    index: Number(match[2]),
  }
}

function handleId(axis: ReorderAxis, index: number): string {
  return `${axis}:${index}`
}

const HANDLE_SIZE = 18
const HANDLE_GUTTER = 20
const EDGE_OUTSET = 24
const EDGE_INSET = 10
const HANDLE_KEEP_PAD = 6

type RevealTarget = Readonly<{ axis: ReorderAxis; index: number }>

function bandAt(point: number, bands: readonly Band[]): Band | null {
  for (const band of bands) {
    if (point >= band.start && point < band.start + band.size) return band
  }
  return null
}

function handleBox(
  geometry: TableGeometry,
  target: RevealTarget
): { left: number; top: number; right: number; bottom: number } | null {
  if (target.axis === "row") {
    const row = geometry.rows[target.index]
    if (!row) return null
    const left = geometry.left - HANDLE_GUTTER
    const top = row.start + row.size / 2 - HANDLE_SIZE / 2
    return { left, top, right: left + HANDLE_SIZE, bottom: top + HANDLE_SIZE }
  }
  const column = geometry.columns[target.index]
  if (!column) return null
  const top = geometry.top - HANDLE_GUTTER
  const left = column.start + column.size / 2 - HANDLE_SIZE / 2
  return { left, top, right: left + HANDLE_SIZE, bottom: top + HANDLE_SIZE }
}

function pointInBox(
  x: number,
  y: number,
  box: { left: number; top: number; right: number; bottom: number },
  pad = 0
): boolean {
  return (
    x >= box.left - pad &&
    x <= box.right + pad &&
    y >= box.top - pad &&
    y <= box.bottom + pad
  )
}

function revealFromPoint(
  clientX: number,
  clientY: number,
  geometry: TableGeometry,
  current: RevealTarget | null
): RevealTarget | null {
  if (current) {
    const box = handleBox(geometry, current)
    if (box && pointInBox(clientX, clientY, box, HANDLE_KEEP_PAD)) {
      return current
    }
  }

  const row = bandAt(clientY, geometry.rows)
  const column = bandAt(clientX, geometry.columns)
  const alongLeft =
    clientX >= geometry.left - EDGE_OUTSET &&
    clientX <= geometry.left + EDGE_INSET &&
    row !== null
  const alongTop =
    clientY >= geometry.top - EDGE_OUTSET &&
    clientY <= geometry.top + EDGE_INSET &&
    column !== null

  if (alongLeft && alongTop && row && column) {
    const preferRow =
      Math.abs(clientX - geometry.left) <= Math.abs(clientY - geometry.top)
    return preferRow
      ? { axis: "row", index: row.index }
      : { axis: "column", index: column.index }
  }
  if (alongLeft && row) return { axis: "row", index: row.index }
  if (alongTop && column) return { axis: "column", index: column.index }
  return null
}

function tableDomAt(
  view: EditorView,
  tablePos: number
): HTMLTableElement | null {
  const nodeDom = view.nodeDOM(tablePos)
  if (!(nodeDom instanceof HTMLElement)) return null
  if (nodeDom instanceof HTMLTableElement) return nodeDom
  const nested = nodeDom.querySelector("table")
  return nested instanceof HTMLTableElement ? nested : null
}

function tableFromPos(
  view: EditorView,
  pos: number
): {
  node: ReturnType<EditorView["state"]["doc"]["nodeAt"]>
  pos: number
} | null {
  const $pos = view.state.doc.resolve(pos)
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === "table") {
      return { node: $pos.node(depth), pos: $pos.before(depth) }
    }
  }
  return null
}

function measureTable(
  view: EditorView,
  tablePos: number
): TableGeometry | null {
  const tableNode = view.state.doc.nodeAt(tablePos)
  if (tableNode?.type.name !== "table") return null
  const table = tableDomAt(view, tablePos)
  if (!table) return null
  const tableRect = table.getBoundingClientRect()
  if (tableRect.width < 4 || tableRect.height < 4) return null
  const htmlRows = table.tBodies[0]?.rows ?? table.rows
  const rows: Band[] = []
  for (let index = 0; index < htmlRows.length; index += 1) {
    const rect = htmlRows[index]?.getBoundingClientRect()
    if (!rect) continue
    rows.push({ index, start: rect.top, size: rect.height })
  }
  const columns: Band[] = []
  const firstRow = htmlRows[0]
  if (firstRow) {
    for (let index = 0; index < firstRow.cells.length; index += 1) {
      const rect = firstRow.cells[index]?.getBoundingClientRect()
      if (!rect) continue
      columns.push({ index, start: rect.left, size: rect.width })
    }
  }
  if (rows.length < 1 || columns.length < 1) return null
  return {
    tablePos,
    left: tableRect.left,
    top: tableRect.top,
    right: tableRect.right,
    bottom: tableRect.bottom,
    rows,
    columns,
    canMoveRows: rows.length > 1 && !tableHasMergedSpans(tableNode, "row"),
    canMoveColumns:
      columns.length > 1 && !tableHasMergedSpans(tableNode, "column"),
  }
}

function SortableHandle({
  id,
  axis,
  index,
  label,
  disabled,
  disabledReason,
  visible,
  style,
  onSelect,
}: {
  id: string
  axis: ReorderAxis
  index: number
  label: string
  disabled: boolean
  disabledReason?: string
  visible: boolean
  style: CSSProperties
  onSelect: (axis: ReorderAxis, index: number) => void
}): ReactNode {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    disabled: disabled || !visible,
    animateLayoutChanges: () => false,
  })
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={
        visible ? "apex-table-dnd__handle is-visible" : "apex-table-dnd__handle"
      }
      data-axis={axis}
      data-index={index}
      disabled={disabled}
      tabIndex={visible ? 0 : -1}
      aria-hidden={visible ? undefined : true}
      aria-label={label}
      title={visible ? (disabled ? disabledReason : label) : undefined}
      style={{
        ...style,
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 3 : undefined,
      }}
      {...attributes}
      {...listeners}
      onClick={(event) => {
        if (disabled || isDragging || !visible) return
        event.preventDefault()
        onSelect(axis, index)
      }}
    >
      <span className="apex-table-dnd__grip" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </span>
    </button>
  )
}

/**
 * dnd-kit handles overlaid on the selected or hovered table. Dragging a handle
 * reorders that row or column; the document updates on drop.
 */
export function TableReorderOverlay({
  viewRef,
  surfaceRef,
  revision,
  inTable,
  zoom,
  readOnly,
}: TableReorderOverlayProps): ReactNode {
  const [geometry, setGeometry] = useState<TableGeometry | null>(null)
  const [reveal, setReveal] = useState<RevealTarget | null>(null)
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null)
  const [overId, setOverId] = useState<UniqueIdentifier | null>(null)
  const revealRef = useRef<RevealTarget | null>(null)
  revealRef.current = reveal

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const active = parseHandleId(args.active.id)
    if (!active) return closestCenter(args)
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter((container) =>
        String(container.id).startsWith(`${active.axis}:`)
      ),
    })
  }, [])

  useLayoutEffect(() => {
    const view = viewRef.current
    const surface = surfaceRef.current
    if (!view || !surface || readOnly) {
      setGeometry(null)
      return
    }

    const resolveGeometry = (
      clientX?: number,
      clientY?: number
    ): TableGeometry | null => {
      const selected = findEnclosingTable(view.state)
      if (selected) {
        const measured = measureTable(view, selected.pos)
        if (measured) return measured
      }
      if (clientX === undefined || clientY === undefined) return null
      const hit = view.posAtCoords({ left: clientX, top: clientY })
      if (!hit) return null
      const hovered = tableFromPos(view, hit.pos)
      return hovered ? measureTable(view, hovered.pos) : null
    }

    const apply = (clientX?: number, clientY?: number): void => {
      const next = resolveGeometry(clientX, clientY)
      setGeometry(next)
      if (activeId) {
        setReveal(parseHandleId(activeId))
        return
      }
      if (!next) {
        setReveal(null)
        return
      }
      if (clientX === undefined || clientY === undefined) return
      setReveal(revealFromPoint(clientX, clientY, next, revealRef.current))
    }

    apply()
    void `${revision}:${zoom}:${inTable}`

    const onScroll = (): void => apply()
    const onResize = (): void => apply()
    const onPointerMove = (event: PointerEvent): void => {
      apply(event.clientX, event.clientY)
    }

    surface.addEventListener("scroll", onScroll, { passive: true })
    const viewPort = surface.ownerDocument.defaultView
    viewPort?.addEventListener("pointermove", onPointerMove)
    viewPort?.addEventListener("resize", onResize)
    const observer = new ResizeObserver(() => apply())
    observer.observe(surface)

    return () => {
      surface.removeEventListener("scroll", onScroll)
      viewPort?.removeEventListener("pointermove", onPointerMove)
      viewPort?.removeEventListener("resize", onResize)
      observer.disconnect()
    }
  }, [activeId, inTable, readOnly, revision, surfaceRef, viewRef, zoom])

  useEffect(() => {
    const view = viewRef.current
    const table = view && geometry ? tableDomAt(view, geometry.tablePos) : null
    if (!table || !activeId) return
    const parsed = parseHandleId(activeId)
    if (!parsed) return
    const htmlRows = Array.from(table.tBodies[0]?.rows ?? table.rows)
    const marked: HTMLElement[] = []
    if (parsed.axis === "row") {
      const row = htmlRows[parsed.index]
      if (row) marked.push(row)
    } else {
      for (const row of htmlRows) {
        const cell = row.cells[parsed.index]
        if (cell) marked.push(cell)
      }
    }
    for (const node of marked) node.classList.add("apex-table-drag-source")
    return () => {
      for (const node of marked) node.classList.remove("apex-table-drag-source")
    }
  }, [activeId, geometry, viewRef])

  const runCommand = useCallback(
    (command: Command, options?: { focus?: boolean }) => {
      const view = viewRef.current
      if (!view) return
      command(view.state, view.dispatch.bind(view))
      if (options?.focus !== false) view.focus()
    },
    [viewRef]
  )

  const onSelect = useCallback(
    (axis: ReorderAxis, index: number) => {
      runCommand(
        axis === "row" ? selectTableRow(index) : selectTableColumn(index),
        { focus: false }
      )
    },
    [runCommand]
  )

  const onDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id)
    setOverId(event.active.id)
  }, [])

  const onDragOver = useCallback((event: DragOverEvent) => {
    setOverId(event.over?.id ?? null)
  }, [])

  const onDragCancel = useCallback(() => {
    setActiveId(null)
    setOverId(null)
  }, [])

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const from = parseHandleId(event.active.id)
      const to = parseHandleId(event.over?.id)
      setActiveId(null)
      setOverId(null)
      if (!from || !to || from.axis !== to.axis || from.index === to.index) {
        return
      }
      runCommand(
        from.axis === "row"
          ? moveTableRow(from.index, to.index)
          : moveTableColumn(from.index, to.index)
      )
    },
    [runCommand]
  )

  const rowIds = useMemo(
    () => geometry?.rows.map((row) => handleId("row", row.index)) ?? [],
    [geometry]
  )
  const columnIds = useMemo(
    () =>
      geometry?.columns.map((column) => handleId("column", column.index)) ?? [],
    [geometry]
  )

  if (readOnly || !geometry) return null

  const active = parseHandleId(activeId)
  const over = parseHandleId(overId)
  const shown = active ?? reveal
  const mergedReason = "Cannot reorder when cells are merged"

  const dropIndicator = ((): CSSProperties | null => {
    if (
      !active ||
      !over ||
      active.axis !== over.axis ||
      active.index === over.index
    ) {
      return null
    }
    if (active.axis === "row") {
      const band = geometry.rows[over.index]
      if (!band) return null
      const after = over.index > active.index
      return {
        position: "fixed",
        left: geometry.left,
        width: geometry.right - geometry.left,
        top: after ? band.start + band.size - 1 : band.start,
        height: 2,
      }
    }
    const band = geometry.columns[over.index]
    if (!band) return null
    const after = over.index > active.index
    return {
      position: "fixed",
      top: geometry.top,
      height: geometry.bottom - geometry.top,
      left: after ? band.start + band.size - 1 : band.start,
      width: 2,
    }
  })()

  return (
    <div
      className={active ? "apex-table-dnd is-dragging" : "apex-table-dnd"}
      data-apex-table-dnd="true"
    >
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
          {geometry.rows.map((row) => (
            <SortableHandle
              key={handleId("row", row.index)}
              id={handleId("row", row.index)}
              axis="row"
              index={row.index}
              label={`Drag to reorder row ${row.index + 1}`}
              disabled={!geometry.canMoveRows}
              disabledReason={mergedReason}
              visible={shown?.axis === "row" && shown.index === row.index}
              onSelect={onSelect}
              style={{
                position: "fixed",
                left: geometry.left - HANDLE_GUTTER,
                top: row.start + row.size / 2 - HANDLE_SIZE / 2,
                width: HANDLE_SIZE,
                height: HANDLE_SIZE,
              }}
            />
          ))}
        </SortableContext>
        <SortableContext
          items={columnIds}
          strategy={horizontalListSortingStrategy}
        >
          {geometry.columns.map((column) => (
            <SortableHandle
              key={handleId("column", column.index)}
              id={handleId("column", column.index)}
              axis="column"
              index={column.index}
              label={`Drag to reorder column ${column.index + 1}`}
              disabled={!geometry.canMoveColumns}
              disabledReason={mergedReason}
              visible={shown?.axis === "column" && shown.index === column.index}
              onSelect={onSelect}
              style={{
                position: "fixed",
                top: geometry.top - HANDLE_GUTTER,
                left: column.start + column.size / 2 - HANDLE_SIZE / 2,
                width: HANDLE_SIZE,
                height: HANDLE_SIZE,
              }}
            />
          ))}
        </SortableContext>
        {dropIndicator ? (
          <div className="apex-table-dnd__indicator" style={dropIndicator} />
        ) : null}
      </DndContext>
    </div>
  )
}
