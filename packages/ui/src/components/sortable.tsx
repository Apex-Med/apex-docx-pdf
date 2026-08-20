"use client"

import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import type {
  DragCancelEvent,
  DragEndEvent,
  DragStartEvent,
  DropAnimation,
  Modifiers,
  UniqueIdentifier,
} from "@dnd-kit/core"
import {
  defaultDropAnimationSideEffects,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DraggableSyntheticListeners,
} from "@dnd-kit/core"
import {
  arrayMove,
  defaultAnimateLayoutChanges,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  type AnimateLayoutChanges,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

import { cn } from "@workspace/ui/lib/utils"

type SortableItemContextValue = Readonly<{
  listeners: DraggableSyntheticListeners | undefined
  isDragging: boolean
  disabled: boolean
}>

const SortableItemContext = createContext<SortableItemContextValue>({
  listeners: undefined,
  isDragging: false,
  disabled: false,
})

const IsOverlayContext = createContext(false)

const SortableInternalContext = createContext<{
  activeId: UniqueIdentifier | null
  modifiers?: Modifiers
}>({
  activeId: null,
})

const animateLayoutChanges: AnimateLayoutChanges = (args) =>
  defaultAnimateLayoutChanges({ ...args, wasDragging: true })

const dropAnimationConfig: DropAnimation = {
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: {
        opacity: "0.4",
      },
    },
  }),
}

const subscribeToNothing = () => () => { }
const getIsMounted = () => true
const getIsMountedOnServer = () => false

const MOUSE_SENSOR_OPTIONS = { activationConstraint: { distance: 10 } }
const TOUCH_SENSOR_OPTIONS = {
  activationConstraint: { delay: 250, tolerance: 5 },
}
const KEYBOARD_SENSOR_OPTIONS = {
  coordinateGetter: sortableKeyboardCoordinates,
}
const MEASURING_CONFIG = {
  droppable: { strategy: MeasuringStrategy.Always },
}
const STRATEGY_MAP = {
  horizontal: rectSortingStrategy,
  grid: rectSortingStrategy,
  vertical: verticalListSortingStrategy,
} as const

type SortableItemElementProps = {
  value?: string
  className?: string
}

export type SortableCommitMeta<T> = Readonly<{
  event: DragEndEvent
  activeIndex: number
  overIndex: number
  previousValue: T[]
}>

export type SortableRootProps<T> = Readonly<{
  value: T[]
  onValueChange: (value: T[]) => void
  getItemValue: (item: T) => string
  children: ReactNode
  className?: string
  strategy?: "horizontal" | "vertical" | "grid"
  onMove?: (event: {
    event: DragEndEvent
    activeIndex: number
    overIndex: number
  }) => void
  onValueCommit?: (value: T[], meta: SortableCommitMeta<T>) => void
  onDragStart?: (event: DragStartEvent) => void
  onDragEnd?: (event: DragEndEvent) => void
  onDragCancel?: (event: DragCancelEvent) => void
  modifiers?: Modifiers
}>

function overlayChild(
  children: ReactNode,
  activeId: UniqueIdentifier
): ReactNode {
  let result: ReactNode = null
  Children.forEach(children, (child) => {
    if (!isValidElement<SortableItemElementProps>(child)) return
    if (child.props.value !== activeId) return
    result = cloneElement(child, {
      className: cn(child.props.className, "z-50"),
    })
  })
  return result
}

function Sortable<T>({
  value,
  onValueChange,
  getItemValue,
  className,
  children,
  onMove,
  onValueCommit,
  strategy = "vertical",
  onDragStart,
  onDragEnd,
  onDragCancel,
  modifiers,
}: SortableRootProps<T>): ReactElement {
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null)
  const mounted = useSyncExternalStore(
    subscribeToNothing,
    getIsMounted,
    getIsMountedOnServer
  )
  const sensors = useSensors(
    useSensor(MouseSensor, MOUSE_SENSOR_OPTIONS),
    useSensor(TouchSensor, TOUCH_SENSOR_OPTIONS),
    useSensor(KeyboardSensor, KEYBOARD_SENSOR_OPTIONS)
  )

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      setActiveId(event.active.id)
      onDragStart?.(event)
    },
    [onDragStart]
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      setActiveId(null)
      onDragEnd?.(event)
      if (!over) return
      const activeIndex = value.findIndex((item) => getItemValue(item) === active.id)
      const overIndex = value.findIndex((item) => getItemValue(item) === over.id)
      if (activeIndex === -1 || overIndex === -1 || activeIndex === overIndex) return
      if (onMove) {
        onMove({ event, activeIndex, overIndex })
        return
      }
      const next = arrayMove(value, activeIndex, overIndex)
      onValueChange(next)
      onValueCommit?.(next, {
        event,
        activeIndex,
        overIndex,
        previousValue: value,
      })
    },
    [value, getItemValue, onValueChange, onMove, onDragEnd, onValueCommit]
  )

  const handleDragCancel = useCallback(
    (event: DragCancelEvent) => {
      setActiveId(null)
      onDragCancel?.(event)
    },
    [onDragCancel]
  )

  const itemIds = useMemo(() => value.map(getItemValue), [value, getItemValue])
  const contextValue = useMemo(() => ({ activeId, modifiers }), [activeId, modifiers])
  const overlayContent = useMemo(
    () => (activeId ? overlayChild(children, activeId) : null),
    [activeId, children]
  )

  return (
    <SortableInternalContext.Provider value={contextValue}>
      <DndContext
        sensors={sensors}
        modifiers={modifiers}
        measuring={MEASURING_CONFIG}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext
          items={itemIds}
          strategy={STRATEGY_MAP[strategy] ?? verticalListSortingStrategy}
        >
          <div
            data-slot="sortable"
            data-dragging={activeId !== null || undefined}
            className={cn(activeId !== null && "cursor-grabbing", className)}
          >
            {children}
          </div>
        </SortableContext>
        {mounted
          ? createPortal(
            <DragOverlay
              dropAnimation={dropAnimationConfig}
              modifiers={modifiers}
              className={cn("z-50", activeId && "cursor-grabbing")}
            >
              <IsOverlayContext.Provider value={true}>
                {overlayContent}
              </IsOverlayContext.Provider>
            </DragOverlay>,
            document.body
          )
          : null}
      </DndContext>
    </SortableInternalContext.Provider>
  )
}

export type SortableItemProps = ComponentProps<"div"> & {
  value: string
  disabled?: boolean
}

function SortableItem({
  value,
  className,
  disabled,
  children,
  style,
  ...props
}: SortableItemProps): ReactElement {
  const isOverlay = useContext(IsOverlayContext)
  const {
    setNodeRef,
    transform,
    transition,
    attributes,
    listeners,
    isDragging,
  } = useSortable({
    id: value,
    disabled: disabled === true || isOverlay,
    animateLayoutChanges,
  })
  const nextStyle: CSSProperties = {
    ...style,
    transition,
    transform: CSS.Transform.toString(transform),
  }

  return (
    <SortableItemContext.Provider
      value={
        isOverlay
          ? { listeners: undefined, isDragging: true, disabled: false }
          : { listeners, isDragging, disabled: disabled === true }
      }
    >
      <div
        data-slot="sortable-item"
        data-value={value}
        data-dragging={isDragging || undefined}
        data-disabled={disabled || undefined}
        ref={isOverlay ? undefined : setNodeRef}
        style={isOverlay ? style : nextStyle}
        className={cn(
          isDragging && "z-50 opacity-50",
          disabled && "opacity-50",
          className
        )}
        {...props}
        {...(isOverlay ? {} : attributes)}
      >
        {children}
      </div>
    </SortableItemContext.Provider>
  )
}

export type SortableItemHandleProps = ComponentProps<"button"> & {
  cursor?: boolean
}

function SortableItemHandle({
  className,
  cursor = true,
  children,
  onClick,
  ...props
}: SortableItemHandleProps): ReactElement {
  const { listeners, isDragging, disabled } = useContext(SortableItemContext)
  return (
    <button
      type="button"
      data-slot="sortable-item-handle"
      data-dragging={isDragging || undefined}
      data-disabled={disabled || undefined}
      disabled={disabled}
      {...listeners}
      {...props}
      className={cn(
        cursor && (isDragging ? "cursor-grabbing" : "cursor-grab"),
        className
      )}
      onClick={(event) => {
        event.stopPropagation()
        onClick?.(event)
      }}
    >
      {children}
    </button>
  )
}

export { Sortable, SortableItem, SortableItemHandle }
