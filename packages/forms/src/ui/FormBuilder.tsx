import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import {
  ArrowDown01Icon,
  AttachmentIcon,
  Calendar03Icon,
  CheckListIcon,
  Copy01Icon,
  Delete02Icon,
  DragDropVerticalIcon,
  HashtagIcon,
  Heading01Icon,
  HierarchySquare01Icon,
  Image01Icon,
  InputLongTextIcon,
  InputShortTextIcon,
  Layout01Icon,
  Note01Icon,
  PlusSignIcon,
  RadioButtonIcon,
  RepeatIcon,
  Search01Icon,
  SectionIcon,
  UserCircleIcon,
  UserIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useForm } from "@tanstack/react-form"
import { AutocompleteField } from "@workspace/ui/components/autocomplete"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Cascader } from "@workspace/ui/components/cascader"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { DatePicker } from "@workspace/ui/components/date-picker"
import { FileAcceptCombobox } from "@workspace/ui/components/file-accept-combobox"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@workspace/ui/components/hover-card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { NumberField } from "@workspace/ui/components/number-field"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Separator } from "@workspace/ui/components/separator"
import {
  SortableItem,
  SortableItemHandle,
} from "@workspace/ui/components/sortable"
import { Switch } from "@workspace/ui/components/switch"
import { Textarea } from "@workspace/ui/components/textarea"
import { cn } from "@workspace/ui/lib/utils"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react"

import {
  CONTEXT_BINDING_LABELS,
  CONTEXT_BINDINGS,
  collectKeys,
  createEmptyForm,
  DATE_DEFAULT_TODAY,
  DEFAULT_ATTACHMENT_ACCEPT,
  defaultNodeForKind,
  duplicateNode,
  encodeMarkerPlaceholder,
  encodeValuePlaceholder,
  findNode,
  flattenChoiceOptions,
  FORM_LAYOUT_KIND_DESCRIPTIONS,
  FORM_LAYOUT_KIND_LABELS,
  FORM_LAYOUT_KINDS,
  FORM_QUESTION_KIND_DESCRIPTIONS,
  FORM_QUESTION_KIND_LABELS,
  FORM_QUESTION_KINDS,
  FORM_TAG_MIME,
  addPage,
  hasDefaultAnswer,
  insertExistingNode,
  isChoiceKind,
  isContextBinding,
  isLayoutBlock,
  isLayoutKind,
  isQuestion,
  isQuestionKind,
  isTodayDateDefault,
  moveNode,
  NUMBER_UNIT_OPTIONS,
  parseFlatOptions,
  parseOptionTree,
  questionSupportsDefaultAnswer,
  removeNode,
  removePage,
  renameForm,
  serializeOptionTree,
  slugifyKey,
  tagsFromForm,
  updateNode,
  updatePage,
  visibilitySourceQuestions,
  type BoundTag,
  type ContextBinding,
  type FormAnswerValue,
  type FormConditionGroup,
  type FormConditionOp,
  type FormNode,
  type FormNodeKind,
  type FormNodePatch,
  type FormPage,
  type FormQuestion,
  type FormTemplate,
} from "../index"
import { FieldPreview } from "./field-preview"
import {
  boardFromPage,
  boardsEqual,
  CANVAS_COLUMN,
  dropLocation,
  dropLocationFromOver,
  dropTargetsEqual,
  findContainer,
  kindFromPaletteId,
  moveBoardItem,
  PALETTE_COLUMN,
  paletteDragId,
  parentDropId,
  parentIdFromDropId,
  pickDropCollision,
  type BoardIds,
  type DropTarget,
} from "./form-builder-board"

type PaletteItem = Readonly<{
  kind: FormNodeKind
  label: string
  icon: typeof InputShortTextIcon
}>

const QUESTION_PALETTE: readonly PaletteItem[] = [
  { kind: "short_text", label: "Short text", icon: InputShortTextIcon },
  { kind: "long_text", label: "Long text", icon: InputLongTextIcon },
  { kind: "number", label: "Number", icon: HashtagIcon },
  { kind: "date", label: "Date", icon: Calendar03Icon },
  { kind: "boolean", label: "Yes / No", icon: RadioButtonIcon },
  { kind: "select", label: "Select", icon: ArrowDown01Icon },
  { kind: "multi_select", label: "Multi-select", icon: CheckListIcon },
  { kind: "autocomplete", label: "Autocomplete", icon: Search01Icon },
  { kind: "cascader", label: "Cascader", icon: HierarchySquare01Icon },
  { kind: "reference", label: "Reference", icon: UserIcon },
  { kind: "attachment", label: "Attachment", icon: AttachmentIcon },
  { kind: "repeater", label: "Repeater", icon: RepeatIcon },
  { kind: "context", label: "Context", icon: UserCircleIcon },
]

const LAYOUT_PALETTE: readonly PaletteItem[] = [
  { kind: "section", label: "Section", icon: SectionIcon },
  { kind: "heading", label: "Heading", icon: Heading01Icon },
  { kind: "text", label: "Text", icon: Note01Icon },
  { kind: "image", label: "Image", icon: Image01Icon },
]

const PALETTE_ITEMS = [...QUESTION_PALETTE, ...LAYOUT_PALETTE]

const PALETTE_IDS = PALETTE_ITEMS.map((item) => paletteDragId(item.kind))

const CONDITION_OPS: readonly Readonly<{ op: FormConditionOp; label: string }>[] = [
  { op: "eq", label: "is" },
  { op: "neq", label: "is not" },
  { op: "in", label: "is one of" },
  { op: "not_in", label: "is not one of" },
  { op: "is_set", label: "is answered" },
  { op: "is_empty", label: "is empty" },
  { op: "gt", label: "is greater than" },
  { op: "lt", label: "is less than" },
]

function sortableIds(ids: readonly string[]): string[] {
  return ids.slice()
}

function paletteKind(id: string): FormNodeKind | null {
  const kind = kindFromPaletteId(id)
  if (!kind) return null
  return PALETTE_ITEMS.find((item) => item.kind === kind)?.kind ?? null
}

function labelForKind(kind: FormNodeKind): string {
  if (isQuestionKind(kind)) return FORM_QUESTION_KIND_LABELS[kind]
  if (isLayoutKind(kind)) return FORM_LAYOUT_KIND_LABELS[kind]
  return kind
}

function descriptionForKind(kind: FormNodeKind): string {
  if (isQuestionKind(kind)) return FORM_QUESTION_KIND_DESCRIPTIONS[kind]
  if (isLayoutKind(kind)) return FORM_LAYOUT_KIND_DESCRIPTIONS[kind]
  return ""
}

function KindUsageCard({ kind }: Readonly<{ kind: FormNodeKind }>): ReactNode {
  return (
    <>
      <p className="font-medium">{labelForKind(kind)}</p>
      <p className="text-muted-foreground">{descriptionForKind(kind)}</p>
    </>
  )
}

export type FormBuilderProps = Readonly<{
  form: FormTemplate
  onFormChange: (form: FormTemplate) => void
  selectedNodeId?: string | null
  onSelectedNodeIdChange?: (id: string | null) => void
}>

export function FormBuilder({
  form,
  onFormChange,
  selectedNodeId: selectedNodeIdProp,
  onSelectedNodeIdChange,
}: FormBuilderProps): ReactNode {
  const [internalSelected, setInternalSelected] = useState<string | null>(null)
  const selectedNodeId = selectedNodeIdProp ?? internalSelected
  const setSelectedNodeId = (id: string | null) => {
    onSelectedNodeIdChange?.(id)
    if (selectedNodeIdProp === undefined) setInternalSelected(id)
  }
  const [pageId, setPageId] = useState(form.pages[0]?.id ?? "")
  const [activeDrag, setActiveDrag] = useState<
    | Readonly<{ type: "palette"; kind: FormNodeKind }>
    | Readonly<{ type: "node"; id: string; width: number }>
    | null
  >(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const page = form.pages.find((entry) => entry.id === pageId) ?? form.pages[0]
  const board = useMemo(() => boardFromPage(page, PALETTE_IDS), [page])
  const boardRef = useRef(board)
  const lastOverIdRef = useRef<string | null>(null)
  const dropTargetRef = useRef<DropTarget | null>(null)
  boardRef.current = board
  dropTargetRef.current = dropTarget
  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const pointerHits = pointerWithin(args)
    const hits = pointerHits.length > 0 ? pointerHits : closestCorners(args)
    const chosen = pickDropCollision(
      hits.map((hit) => String(hit.id)),
      String(args.active.id),
      boardRef.current
    )
    if (!chosen) return []
    const match = hits.find((hit) => String(hit.id) === chosen)
    return match ? [match] : []
  }, [])
  const tags = useMemo(() => tagsFromForm(form), [form])
  const nodesById = useMemo(() => {
    const map = new Map<string, FormNode>()
    for (const entry of page?.nodes ?? []) collectNodeMap(entry, map)
    return map
  }, [page])
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 10 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  useEffect(() => {
    if (!form.pages.some((entry) => entry.id === pageId)) {
      setPageId(form.pages[0]?.id ?? "")
    }
  }, [form.pages, pageId])

  const insertKind = (
    kind: FormNodeKind,
    target: Readonly<{ pageId: string; index: number; parentId: string | null }>
  ) => {
    const node = defaultNodeForKind(kind, labelForKind(kind), collectKeys(form))
    onFormChange(
      insertExistingNode(form, target.pageId, node, {
        index: target.index,
        parentId: target.parentId,
      })
    )
    setSelectedNodeId(node.id)
  }

  const onDragStart = (event: DragStartEvent) => {
    boardRef.current = board
    lastOverIdRef.current = null
    dropTargetRef.current = null
    setDropTarget(null)
    const kind = paletteKind(String(event.active.id))
    if (kind) {
      setActiveDrag({ type: "palette", kind })
      return
    }
    setActiveDrag({
      type: "node",
      id: String(event.active.id),
      width:
        event.active.rect.current.initial?.width ??
        event.active.rect.current.translated?.width ??
        0,
    })
  }

  const onDragOver = (event: DragOverEvent) => {
    const overId = event.over ? String(event.over.id) : null
    if (!overId || overId === lastOverIdRef.current) return
    lastOverIdRef.current = overId
    const activeId = String(event.active.id)
    const current = boardRef.current
    const from = findContainer(current, activeId)
    const to = findContainer(current, overId)
    const isPalette = paletteKind(activeId) !== null
    if (
      !to ||
      to === PALETTE_COLUMN ||
      parentIdFromDropId(from ?? "") === overId ||
      (!isPalette && from === to)
    ) {
      if (dropTargetRef.current) {
        dropTargetRef.current = null
        setDropTarget(null)
      }
      return
    }
    const next = dropLocationFromOver(current, overId)
    if (dropTargetsEqual(next, dropTargetRef.current)) return
    dropTargetRef.current = next
    setDropTarget(next)
  }

  const onDragEnd = (event: DragEndEvent) => {
    const activeId = String(event.active.id)
    const overId = event.over ? String(event.over.id) : null
    const kind = paletteKind(activeId)
    const hovered =
      overId !== null ? dropLocationFromOver(boardRef.current, overId) : null
    const target = hovered ?? dropTargetRef.current
    lastOverIdRef.current = null
    dropTargetRef.current = null
    setActiveDrag(null)
    setDropTarget(null)
    if (!page) return
    if (kind) {
      if (!overId || !target) return
      insertKind(kind, {
        pageId: page.id,
        index: target.index,
        parentId: target.parentId,
      })
      return
    }
    if (!overId) return
    const current = moveBoardItem(boardRef.current, activeId, overId)
    if (boardsEqual(current, boardRef.current)) return
    const moved = dropLocation(current, activeId)
    if (!moved || moved.parentId === activeId) return
    onFormChange(
      moveNode(form, activeId, {
        pageId: page.id,
        index: moved.index,
        parentId: moved.parentId,
      })
    )
  }

  const onDragCancel = () => {
    lastOverIdRef.current = null
    dropTargetRef.current = null
    setActiveDrag(null)
    setDropTarget(null)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragCancel={onDragCancel}
      onDragEnd={onDragEnd}
    >
      <div className="apex-form-builder" data-dragging={activeDrag !== null || undefined}>
        <FieldPalette
          onAdd={(kind) => {
            if (!page) return
            insertKind(kind, {
              pageId: page.id,
              index: page.nodes.length,
              parentId: null,
            })
          }}
        />
        <FormCanvas
          form={form}
          page={page}
          board={board}
          dropTarget={dropTarget}
          nodesById={nodesById}
          selectedNodeId={selectedNodeId}
          onPageIdChange={setPageId}
          onSelect={setSelectedNodeId}
          onAddPage={() => {
            const next = addPage(form)
            const created = next.pages[next.pages.length - 1]
            onFormChange(next)
            if (created) setPageId(created.id)
            setSelectedNodeId(null)
          }}
          onRemove={(id) => {
            onFormChange(removeNode(form, id))
            if (selectedNodeId === id) setSelectedNodeId(null)
          }}
          onDuplicate={(id) => {
            const next = duplicateNode(form, id)
            onFormChange(next)
            const added = newestNodeId(form, next)
            if (added) setSelectedNodeId(added)
          }}
        />
        <SettingsPanel
          form={form}
          page={page}
          selectedNodeId={selectedNodeId}
          tags={tags}
          onFormChange={onFormChange}
          onDuplicate={(id) => {
            const next = duplicateNode(form, id)
            onFormChange(next)
            const added = newestNodeId(form, next)
            if (added) setSelectedNodeId(added)
          }}
          onRemove={(id) => {
            onFormChange(removeNode(form, id))
            if (selectedNodeId === id) setSelectedNodeId(null)
          }}
          onRemovePage={(id) => {
            onFormChange(removePage(form, id))
            setSelectedNodeId(null)
          }}
        />
      </div>
      <DragOverlay dropAnimation={null}>
        {activeDrag?.type === "palette" ? (
          <PaletteChipFace item={paletteItemForKind(activeDrag.kind)} dragging />
        ) : activeDrag?.type === "node" ? (
          <DraggingQuestionCard
            node={findNode(form, activeDrag.id)?.node}
            width={activeDrag.width}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function FieldPalette({
  onAdd,
}: Readonly<{
  onAdd: (kind: FormNodeKind) => void
}>): ReactNode {
  const { setNodeRef, isOver } = useDroppable({ id: PALETTE_COLUMN })
  return (
    <aside
      ref={setNodeRef}
      data-apex-form-palette=""
      style={{ width: 240, minWidth: 240, maxWidth: 240 }}
      className={cn(
        "flex h-full shrink-0 flex-col overflow-hidden border-r bg-background",
        isOver && "bg-muted/40"
      )}
    >
      <div className="p-3">
        <p className="text-sm font-medium">Questions</p>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <SortableContext
          items={sortableIds(PALETTE_IDS)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-4 p-3 pt-0">
            <PaletteGroup
              title="Fields"
              items={QUESTION_PALETTE}
              onAdd={onAdd}
            />
            <PaletteGroup
              title="Layout"
              items={LAYOUT_PALETTE}
              onAdd={onAdd}
            />
          </div>
        </SortableContext>
      </ScrollArea>
    </aside>
  )
}

function PaletteGroup({
  title,
  items,
  onAdd,
}: Readonly<{
  title: string
  items: readonly PaletteItem[]
  onAdd: (kind: FormNodeKind) => void
}>): ReactNode {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </p>
      <div className="grid grid-cols-1 gap-1">
        {items.map((item) => (
          <PaletteChip key={item.kind} item={item} onAdd={onAdd} />
        ))}
      </div>
    </div>
  )
}

function PaletteChipFace({
  item,
  dragging = false,
  className,
  ...props
}: Readonly<{ item: PaletteItem; dragging?: boolean }> &
  Omit<ComponentProps<typeof Button>, "children">): ReactNode {
  return (
    <Button
      type="button"
      variant="outline"
      className={cn(
        "w-full justify-start active:translate-y-0 focus-visible:ring-inset",
        dragging && "shadow-md",
        className
      )}
      {...props}
    >
      <HugeiconsIcon icon={item.icon} strokeWidth={2} data-icon="inline-start" />
      <span className="truncate">{item.label}</span>
    </Button>
  )
}

function PaletteChip({
  item,
  onAdd,
}: Readonly<{
  item: PaletteItem
  onAdd: (kind: FormNodeKind) => void
}>): ReactNode {
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: paletteDragId(item.kind),
    data: { type: "palette", kind: item.kind },
  })
  const [hoverOpen, setHoverOpen] = useState(false)
  return (
    <HoverCard
      open={isDragging ? false : hoverOpen}
      onOpenChange={(next) => {
        if (isDragging) return
        setHoverOpen(next)
      }}
    >
      <HoverCardTrigger
        delay={400}
        closeDelay={80}
        render={
          <PaletteChipFace
            item={item}
            ref={setNodeRef}
            className={isDragging ? "opacity-50" : undefined}
            {...attributes}
            {...listeners}
            onClick={() => {
              if (isDragging) return
              onAdd(item.kind)
            }}
          />
        }
      />
      <HoverCardContent
        side="right"
        align="start"
        sideOffset={8}
        className="flex flex-col gap-1"
      >
        <KindUsageCard kind={item.kind} />
      </HoverCardContent>
    </HoverCard>
  )
}

function FormCanvas({
  form,
  page,
  board,
  dropTarget,
  nodesById,
  selectedNodeId,
  onPageIdChange,
  onSelect,
  onAddPage,
  onRemove,
  onDuplicate,
}: Readonly<{
  form: FormTemplate
  page: FormPage | undefined
  board: BoardIds
  dropTarget: DropTarget | null
  nodesById: ReadonlyMap<string, FormNode>
  selectedNodeId: string | null
  onPageIdChange: (id: string) => void
  onSelect: (id: string | null) => void
  onAddPage: () => void
  onRemove: (id: string) => void
  onDuplicate: (id: string) => void
}>): ReactNode {
  const { setNodeRef, isOver } = useDroppable({ id: CANVAS_COLUMN })
  const canvasIds = board.canvas
  const acceptingEmpty =
    canvasIds.length === 0 && dropTarget?.parentId === null
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-muted/40">
      <div className="flex items-center gap-2 overflow-x-auto border-b bg-background px-3 py-2">
        {form.pages.map((entry, index) => (
          <Button
            key={entry.id}
            type="button"
            size="sm"
            variant={entry.id === page?.id ? "secondary" : "ghost"}
            onClick={() => {
              onPageIdChange(entry.id)
              onSelect(null)
            }}
          >
            {entry.title || `Page ${index + 1}`}
          </Button>
        ))}
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Add page" onClick={onAddPage}>
          <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
        </Button>
      </div>
      <ScrollArea className="h-full min-h-0 flex-1">
        <div className="relative flex min-h-full justify-center p-6">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Clear question selection"
            onClick={() => onSelect(null)}
          />
          <div
            ref={setNodeRef}
            className={cn(
              "relative z-10 flex min-h-full w-full min-w-0 max-w-xl flex-col overflow-hidden rounded-xl border bg-background p-6 shadow-sm",
              (isOver || acceptingEmpty) &&
              canvasIds.length === 0 &&
              "ring-2 ring-primary/40"
            )}
          >
            <div className="mb-6">
              <h2 className="text-lg font-medium">{form.name}</h2>
              {page?.description ? (
                <p className="mt-1 text-sm text-muted-foreground">{page.description}</p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  {page?.title || "Form preview"}
                </p>
              )}
            </div>
            {canvasIds.length === 0 ? (
              <div
                className={cn(
                  "flex min-h-48 flex-1 flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center",
                  acceptingEmpty && "border-primary bg-primary/5"
                )}
              >
                <HugeiconsIcon icon={Layout01Icon} strokeWidth={2} className="mb-2 size-6 text-muted-foreground" />
                <p className="text-sm font-medium">Drag a question here</p>
              </div>
            ) : (
              <SortableContext
                items={sortableIds(canvasIds)}
                strategy={verticalListSortingStrategy}
              >
                <div className="flex flex-col gap-3">
                  {canvasIds.map((id, index) => {
                    const node = nodesById.get(id)
                    if (!node) return null
                    return (
                      <InsertSlot
                        key={node.id}
                        before={dropTarget?.parentId === null && dropTarget.index === index}
                        after={
                          dropTarget?.parentId === null &&
                          dropTarget.index === canvasIds.length &&
                          index === canvasIds.length - 1
                        }
                      >
                        <SortablePreviewCard
                          node={node}
                          nestedIds={board.nested[node.id] ?? []}
                          nodesById={nodesById}
                          selectedNodeId={selectedNodeId}
                          dropTarget={dropTarget}
                          onSelect={onSelect}
                          onRemove={onRemove}
                          onDuplicate={onDuplicate}
                        />
                      </InsertSlot>
                    )
                  })}
                </div>
              </SortableContext>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}

function DraggingQuestionCard({
  node,
  width,
}: Readonly<{ node: FormNode | undefined; width: number }>): ReactNode {
  if (!node) return null
  const isRepeater = isQuestion(node) && node.kind === "repeater"
  const nested = isRepeater ? (node.children ?? []) : []
  return (
    <div
      className="cursor-grabbing rounded-lg border bg-background p-3 shadow-md"
      style={width > 0 ? { width } : undefined}
    >
      <div className="mb-2 flex items-center gap-1">
        <span className="text-muted-foreground">
          <HugeiconsIcon icon={DragDropVerticalIcon} strokeWidth={2} className="size-4" />
        </span>
        <span className="text-[11px] tracking-wide text-muted-foreground uppercase">
          {labelForKind(node.kind)}
        </span>
        {node.condition && node.condition.rules.length > 0 ? (
          <Badge variant="outline" className="text-[10px]">
            Conditional
          </Badge>
        ) : null}
      </div>
      {isRepeater ? (
        <div className="flex flex-col gap-2">
          <LabeledName label={node.label} required={node.required} />
          <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
            {nested.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                Drop questions here to repeat them for each row.
              </p>
            ) : (
              nested.map((child) => (
                <div key={child.id} className="rounded-md border bg-background p-2">
                  <div className="mb-1 text-[11px] text-muted-foreground uppercase">
                    {labelForKind(child.kind)}
                  </div>
                  <FieldPreview node={child} />
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <FieldPreview node={node} />
      )}
    </div>
  )
}

function InsertSlot({
  before,
  after,
  children,
}: Readonly<{
  before: boolean
  after: boolean
  children: ReactNode
}>): ReactNode {
  return (
    <div className="relative">
      {before ? <InsertLine className="-top-2" /> : null}
      {children}
      {after ? <InsertLine className="-bottom-2" /> : null}
    </div>
  )
}

function InsertLine({ className }: Readonly<{ className: string }>): ReactNode {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute right-0 left-0 z-30 h-1 rounded-full bg-primary",
        className
      )}
    />
  )
}

function SortablePreviewCard({
  node,
  nestedIds,
  nodesById,
  selectedNodeId,
  dropTarget,
  onSelect,
  onRemove,
  onDuplicate,
}: Readonly<{
  node: FormNode
  nestedIds: readonly string[]
  nodesById: ReadonlyMap<string, FormNode>
  selectedNodeId: string | null
  dropTarget: DropTarget | null
  onSelect: (id: string) => void
  onRemove: (id: string) => void
  onDuplicate: (id: string) => void
}>): ReactNode {
  const selected = node.id === selectedNodeId
  const isRepeater = isQuestion(node) && node.kind === "repeater"
  return (
    <SortableItem value={node.id}>
      <div
        className={cn(
          "group/card relative min-w-0 overflow-hidden rounded-lg border bg-background p-3 transition-colors",
          selected ? "border-primary" : "hover:border-foreground/20"
        )}
        data-question-selected={selected ? "true" : undefined}
      >
        <button
          type="button"
          className="absolute inset-0 z-10 rounded-[inherit]"
          aria-label={`Select ${node.label}`}
          aria-pressed={selected}
          onClick={() => onSelect(node.id)}
        />
        <div className="mb-2 flex items-center gap-1">
          <SortableItemHandle
            className="relative z-20 text-muted-foreground hover:text-foreground"
            aria-label={`Reorder ${node.label}`}
          >
            <HugeiconsIcon icon={DragDropVerticalIcon} strokeWidth={2} className="size-4" />
          </SortableItemHandle>
          <span className="text-[11px] tracking-wide text-muted-foreground uppercase">
            {labelForKind(node.kind)}
          </span>
          {node.condition && node.condition.rules.length > 0 ? (
            <Badge variant="outline" className="relative z-20 text-[10px]">
              Conditional
            </Badge>
          ) : null}
          <div
            className={cn(
              "relative z-20 ml-auto flex items-center gap-0.5",
              selected
                ? "opacity-100"
                : "opacity-0 group-hover/card:opacity-100 focus-within:opacity-100"
            )}
          >
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label={`Duplicate ${node.label}`}
              onClick={(event) => {
                event.stopPropagation()
                onDuplicate(node.id)
              }}
            >
              <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
            </Button>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label={`Delete ${node.label}`}
              onClick={(event) => {
                event.stopPropagation()
                onRemove(node.id)
              }}
            >
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
            </Button>
          </div>
        </div>
        {isRepeater && isQuestion(node) ? (
          <RepeaterPreview
            node={node}
            nestedIds={nestedIds}
            nodesById={nodesById}
            selectedNodeId={selectedNodeId}
            dropTarget={dropTarget}
            onSelect={onSelect}
            onRemove={onRemove}
          />
        ) : (
          <FieldPreview node={node} />
        )}
      </div>
    </SortableItem>
  )
}

function RepeaterPreview({
  node,
  nestedIds,
  nodesById,
  selectedNodeId,
  dropTarget,
  onSelect,
  onRemove,
}: Readonly<{
  node: FormNode
  nestedIds: readonly string[]
  nodesById: ReadonlyMap<string, FormNode>
  selectedNodeId: string | null
  dropTarget: DropTarget | null
  onSelect: (id: string) => void
  onRemove: (id: string) => void
}>): ReactNode {
  const { setNodeRef, isOver } = useDroppable({ id: parentDropId(node.id) })
  const insertIndex =
    dropTarget !== null && dropTarget.parentId === node.id
      ? dropTarget.index
      : -1
  const accepting = insertIndex !== -1
  return (
    <div className="flex flex-col gap-2">
      <LabeledName label={node.label} required={isQuestion(node) ? node.required : false} />
      <SortableContext
        items={sortableIds(nestedIds)}
        strategy={verticalListSortingStrategy}
      >
        <div
          ref={setNodeRef}
          className={cn(
            "relative z-20 flex flex-col gap-2 rounded-lg border border-dashed p-3",
            (isOver || accepting) && "border-primary bg-primary/5"
          )}
        >
          {nestedIds.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              Drop questions here to repeat them for each row.
            </p>
          ) : (
            nestedIds.map((id, index) => {
              const child = nodesById.get(id)
              if (!child) return null
              return (
                <InsertSlot
                  key={child.id}
                  before={insertIndex === index}
                  after={
                    insertIndex === nestedIds.length &&
                    index === nestedIds.length - 1
                  }
                >
                  <SortableItem value={child.id}>
                    <div
                      className={cn(
                        "group/nested relative rounded-md border bg-background p-2",
                        child.id === selectedNodeId && "border-primary"
                      )}
                      data-question-selected={
                        child.id === selectedNodeId ? "true" : undefined
                      }
                    >
                      <button
                        type="button"
                        className="absolute inset-0 z-10 rounded-[inherit]"
                        aria-label={`Select ${child.label}`}
                        aria-pressed={child.id === selectedNodeId}
                        onClick={(event) => {
                          event.stopPropagation()
                          onSelect(child.id)
                        }}
                      />
                      <div className="pointer-events-none">
                        <div className="mb-1 flex items-center gap-1">
                          <SortableItemHandle
                            className="pointer-events-auto relative z-20 text-muted-foreground hover:text-foreground"
                            aria-label={`Reorder ${child.label}`}
                          >
                            <HugeiconsIcon
                              icon={DragDropVerticalIcon}
                              strokeWidth={2}
                              className="size-4"
                            />
                          </SortableItemHandle>
                          <span className="text-[11px] text-muted-foreground uppercase">
                            {labelForKind(child.kind)}
                          </span>
                          <Button
                            type="button"
                            size="icon-xs"
                            variant="ghost"
                            className={cn(
                              "relative z-20 ml-auto",
                              child.id === selectedNodeId
                                ? "pointer-events-auto opacity-100"
                                : "opacity-0 group-hover/nested:pointer-events-auto group-hover/nested:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100"
                            )}
                            aria-label={`Delete ${child.label}`}
                            onClick={(event) => {
                              event.stopPropagation()
                              onRemove(child.id)
                            }}
                          >
                            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                          </Button>
                        </div>
                        <FieldPreview node={child} />
                      </div>
                    </div>
                  </SortableItem>
                </InsertSlot>
              )
            })
          )}
        </div>
      </SortableContext>
    </div>
  )
}

function LabeledName({
  label,
  required,
}: Readonly<{ label: string; required: boolean }>): ReactNode {
  return (
    <p className="text-sm font-medium">
      {label}
      {required ? <span className="text-destructive"> *</span> : null}
    </p>
  )
}

function SettingsPanel({
  form,
  page,
  selectedNodeId,
  tags,
  onFormChange,
  onDuplicate,
  onRemove,
  onRemovePage,
}: Readonly<{
  form: FormTemplate
  page: FormPage | undefined
  selectedNodeId: string | null
  tags: readonly BoundTag[]
  onFormChange: (form: FormTemplate) => void
  onDuplicate: (id: string) => void
  onRemove: (id: string) => void
  onRemovePage: (id: string) => void
}>): ReactNode {
  const node = selectedNodeId ? (findNode(form, selectedNodeId)?.node ?? null) : null
  return (
    <aside
      data-apex-form-settings=""
      style={{ width: 300, minWidth: 300, maxWidth: 300 }}
      className="flex h-full shrink-0 flex-col overflow-hidden border-l bg-background"
    >
      <div className="flex w-full min-w-0 shrink-0 items-center justify-between gap-2 border-b p-3">
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="truncate text-sm font-medium">
            {node ? "Question settings" : "Form settings"}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {node ? labelForKind(node.kind) : page?.title || form.name}
          </p>
        </div>
        <div
          className={cn("flex shrink-0 items-center", !node && "invisible")}
          aria-hidden={!node}
        >
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            disabled={!node}
            tabIndex={node ? undefined : -1}
            aria-label={node ? `Duplicate ${node.label}` : "Duplicate question"}
            onClick={() => {
              if (!node) return
              onDuplicate(node.id)
            }}
          >
            <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            disabled={!node}
            tabIndex={node ? undefined : -1}
            aria-label={node ? `Delete ${node.label}` : "Delete question"}
            onClick={() => {
              if (!node) return
              onRemove(node.id)
            }}
          >
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
          </Button>
        </div>
      </div>
      <div className="min-h-0 w-full min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
        <div className="box-border flex w-full min-w-0 flex-col gap-5 p-3">
          {!node && page ? (
            <FormSettings
              form={form}
              page={page}
              onFormChange={onFormChange}
              onRemovePage={onRemovePage}
            />
          ) : null}
          {node ? (
            <NodeInspector
              key={`${node.id}:${node.kind}`}
              node={node}
              sources={visibilitySourceQuestions(form).filter(
                (question) => question.id !== node.id
              )}
              onChange={(patch) => onFormChange(updateNode(form, node.id, patch))}
            />
          ) : null}
          <Separator />
          <div className="flex w-full min-w-0 flex-col gap-2">
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Document tags
            </p>
            <p className="text-xs text-muted-foreground">
              Drag a tag into the document to bind this form.
            </p>
            {tags.length === 0 ? (
              <p className="text-xs text-muted-foreground">No bindable questions yet.</p>
            ) : (
              tags.map((tag) => <TagBadge key={tag.id} tag={tag} />)
            )}
          </div>
        </div>
      </div>
    </aside>
  )
}

function FormSettings({
  form,
  page,
  onFormChange,
  onRemovePage,
}: Readonly<{
  form: FormTemplate
  page: FormPage
  onFormChange: (form: FormTemplate) => void
  onRemovePage: (id: string) => void
}>): ReactNode {
  const formRef = useRef(form)
  const pageRef = useRef(page)
  const onFormChangeRef = useRef(onFormChange)
  formRef.current = form
  pageRef.current = page
  onFormChangeRef.current = onFormChange
  const settings = useForm({
    defaultValues: {
      name: form.name,
      title: page.title,
      description: page.description ?? "",
    },
    listeners: {
      onChange: ({ formApi }) => {
        const values = formApi.state.values
        const current = formRef.current
        const currentPage = pageRef.current
        if (
          current.name === values.name &&
          currentPage.title === values.title &&
          (currentPage.description ?? "") === values.description
        ) {
          return
        }
        let next = renameForm(current, values.name)
        next = updatePage(next, currentPage.id, {
          title: values.title,
          description: values.description,
          key: slugifyKey(values.title),
        })
        onFormChangeRef.current(next)
      },
    },
  })
  return (
    <div className="flex w-full min-w-0 max-w-full flex-col gap-3">
      <settings.Field name="name">
        {(field) => (
          <div className="flex w-full min-w-0 flex-col gap-1.5">
            <Label>Form name</Label>
            <Input
              className="w-full min-w-0"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          </div>
        )}
      </settings.Field>
      <settings.Field name="title">
        {(field) => (
          <div className="flex w-full min-w-0 flex-col gap-1.5">
            <Label>Page title</Label>
            <Input
              className="w-full min-w-0"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          </div>
        )}
      </settings.Field>
      <settings.Field name="description">
        {(field) => (
          <div className="flex w-full min-w-0 flex-col gap-1.5">
            <Label>Page description</Label>
            <Textarea
              className="w-full min-w-0"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          </div>
        )}
      </settings.Field>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-full"
        disabled={form.pages.length <= 1}
        onClick={() => onRemovePage(page.id)}
      >
        Delete page
      </Button>
    </div>
  )
}

function NodeInspector({
  node,
  sources,
  onChange,
}: Readonly<{
  node: FormNode
  sources: readonly FormQuestion[]
  onChange: (patch: FormNodePatch) => void
}>): ReactNode {
  const nodeRef = useRef(node)
  const onChangeRef = useRef(onChange)
  nodeRef.current = node
  onChangeRef.current = onChange
  const form = useForm({
    defaultValues: {
      label: node.label,
      description: node.description ?? "",
      body: isLayoutBlock(node) ? (node.body ?? "") : "",
      required: isQuestion(node) ? node.required : false,
      includeTime: isQuestion(node) ? node.includeTime === true : false,
      quickDateSelection: isQuestion(node)
        ? node.quickDateSelection === true
        : false,
      dateRange: isQuestion(node) ? node.dateRange === true : false,
      allowOther: isQuestion(node) ? node.allowOther === true : false,
      optionsText: isQuestion(node)
        ? node.kind === "cascader"
          ? serializeOptionTree(node.options ?? [])
          : (node.options ?? []).map((option) => option.label).join("\n")
        : "",
      contextBinding:
        isQuestion(node) && node.context?.binding ? node.context.binding : "patient",
      min: isQuestion(node) ? (node.validation?.min ?? null) : null,
      max: isQuestion(node) ? (node.validation?.max ?? null) : null,
      unit: isQuestion(node) ? (node.unit ?? "") : "",
      accept:
        isQuestion(node) && node.kind === "attachment"
          ? [...(node.attachment?.accept ?? DEFAULT_ATTACHMENT_ACCEPT)]
          : [...DEFAULT_ATTACHMENT_ACCEPT],
      maxCount:
        isQuestion(node) && node.kind === "attachment"
          ? (node.attachment?.maxCount ?? 1)
          : 1,
      maxFileSizeMb:
        isQuestion(node) && node.kind === "attachment"
          ? (node.attachment?.maxFileSizeMb ?? 10)
          : 10,
    },
    listeners: {
      onChange: ({ formApi }) => {
        const current = nodeRef.current
        const values = formApi.state.values
        const options =
          current.kind === "cascader"
            ? parseOptionTree(values.optionsText)
            : parseFlatOptions(values.optionsText)
        const min = values.min
        const max = values.max
        const accept = values.accept
          .map((part) => part.trim())
          .filter((part) => part.length > 0)
        const maxCount =
          typeof values.maxCount === "number" && Number.isFinite(values.maxCount)
            ? Math.max(1, Math.floor(values.maxCount))
            : 1
        const maxFileSizeMb =
          typeof values.maxFileSizeMb === "number" &&
            Number.isFinite(values.maxFileSizeMb)
            ? Math.max(1, values.maxFileSizeMb)
            : 10
        const optionsText =
          isQuestion(current) && current.kind === "cascader"
            ? serializeOptionTree(current.options ?? [])
            : isQuestion(current)
              ? (current.options ?? []).map((option) => option.label).join("\n")
              : ""
        const currentAccept =
          isQuestion(current) && current.kind === "attachment"
            ? [...(current.attachment?.accept ?? DEFAULT_ATTACHMENT_ACCEPT)]
            : values.accept
        const currentMaxCount =
          isQuestion(current) && current.kind === "attachment"
            ? (current.attachment?.maxCount ?? 1)
            : values.maxCount
        const currentMaxFileSizeMb =
          isQuestion(current) && current.kind === "attachment"
            ? (current.attachment?.maxFileSizeMb ?? 10)
            : values.maxFileSizeMb
        if (
          current.label === values.label &&
          (current.description ?? "") === values.description &&
          (!isLayoutBlock(current) || (current.body ?? "") === values.body) &&
          optionsText === values.optionsText &&
          (!isQuestion(current) ||
            (current.required === values.required &&
              (current.includeTime === true) === values.includeTime &&
              (current.quickDateSelection === true) ===
              values.quickDateSelection &&
              (current.dateRange === true) === values.dateRange &&
              (current.allowOther === true) === values.allowOther &&
              (current.context?.binding ?? "patient") === values.contextBinding &&
              (current.validation?.min ?? null) === min &&
              (current.validation?.max ?? null) === max &&
              (current.unit ?? "") === values.unit &&
              acceptsEqual(currentAccept, accept) &&
              currentMaxCount === maxCount &&
              currentMaxFileSizeMb === maxFileSizeMb))
        ) {
          return
        }
        onChangeRef.current({
          label: values.label,
          description: values.description,
          key: slugifyKey(values.label),
          ...(isLayoutBlock(current) && current.kind === "text" ? { body: values.body } : {}),
          ...(isQuestion(current)
            ? {
              required: values.required,
              includeTime: values.includeTime,
              quickDateSelection: values.quickDateSelection,
              dateRange: values.dateRange,
              allowOther: values.allowOther,
              options:
                isChoiceKind(current.kind)
                  ? options
                  : current.options,
              context:
                current.kind === "context" && isContextBinding(values.contextBinding)
                  ? { binding: values.contextBinding }
                  : current.context,
              validation:
                current.kind === "number"
                  ? {
                    ...(typeof min === "number" && Number.isFinite(min)
                      ? { min }
                      : {}),
                    ...(typeof max === "number" && Number.isFinite(max)
                      ? { max }
                      : {}),
                  }
                  : current.validation,
              unit:
                current.kind === "number"
                  ? (values.unit.trim() || undefined)
                  : current.unit,
              attachment:
                current.kind === "attachment"
                  ? {
                    accept:
                      accept.length > 0 ? accept : [...DEFAULT_ATTACHMENT_ACCEPT],
                    maxCount,
                    maxFileSizeMb,
                  }
                  : current.attachment,
            }
            : {}),
        })
      },
    },
  })
  return (
    <div className="flex w-full min-w-0 max-w-full flex-col gap-3">
      <div className="flex w-full min-w-0 flex-col gap-1.5">
        <Label>{isQuestion(node) ? "Question type" : "Block type"}</Label>
        <Select
          value={node.kind}
          items={(isQuestion(node) ? FORM_QUESTION_KINDS : FORM_LAYOUT_KINDS).map(
            (kind) => ({ value: kind, label: labelForKind(kind) })
          )}
          onValueChange={(value) => {
            if (typeof value !== "string" || value === node.kind) return
            if (isQuestion(node) && isQuestionKind(value)) {
              onChange({ kind: value })
              return
            }
            if (isLayoutBlock(node) && isLayoutKind(value)) {
              onChange({ kind: value })
            }
          }}
        >
          <SelectTrigger className="w-full min-w-0 max-w-full overflow-hidden">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {(isQuestion(node) ? FORM_QUESTION_KINDS : FORM_LAYOUT_KINDS).map(
                (kind) => (
                  <SelectItem key={kind} value={kind}>
                    {labelForKind(kind)}
                  </SelectItem>
                )
              )}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <form.Field name="label">
        {(field) => (
          <div className="flex w-full min-w-0 flex-col gap-1.5">
            <Label>Label</Label>
            <Input
              className="w-full min-w-0"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
            />
            <p className="truncate text-xs text-muted-foreground">Key: {node.key}</p>
          </div>
        )}
      </form.Field>
      <form.Field name="description">
        {(field) => (
          <div className="flex w-full min-w-0 flex-col gap-1.5">
            <Label>Help text</Label>
            <Textarea
              className="w-full min-w-0"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          </div>
        )}
      </form.Field>
      {isLayoutBlock(node) && node.kind === "text" ? (
        <form.Field name="body">
          {(field) => (
            <div className="flex w-full min-w-0 flex-col gap-1.5">
              <Label>Body</Label>
              <Textarea
                className="w-full min-w-0"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            </div>
          )}
        </form.Field>
      ) : null}
      {isQuestion(node) && !isLayoutBlock(node) ? (
        <form.Field name="required">
          {(field) => (
            <div className="flex w-full min-w-0 items-center justify-between gap-2 text-sm">
              Required
              <Switch
                checked={field.state.value}
                onCheckedChange={(checked) => field.handleChange(checked)}
              />
            </div>
          )}
        </form.Field>
      ) : null}
      {isQuestion(node) && node.kind === "context" ? (
        <form.Field name="contextBinding">
          {(field) => (
            <div className="flex w-full min-w-0 flex-col gap-1.5">
              <Label>Context source</Label>
              <Select
                value={field.state.value}
                items={CONTEXT_BINDINGS.map((binding) => ({
                  value: binding,
                  label: CONTEXT_BINDING_LABELS[binding],
                }))}
                onValueChange={(value) => {
                  if (typeof value === "string") field.handleChange(value as ContextBinding)
                }}
              >
                <SelectTrigger className="w-full min-w-0 max-w-full overflow-hidden">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {CONTEXT_BINDINGS.map((binding) => (
                      <SelectItem key={binding} value={binding}>
                        {CONTEXT_BINDING_LABELS[binding]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          )}
        </form.Field>
      ) : null}
      {isQuestion(node) && node.kind === "date" ? (
        <>
          <form.Field name="includeTime">
            {(field) => (
              <div className="flex w-full min-w-0 items-center justify-between gap-2 text-sm">
                Include time
                <Switch
                  checked={field.state.value}
                  onCheckedChange={(checked) => field.handleChange(checked)}
                />
              </div>
            )}
          </form.Field>
          <form.Field name="quickDateSelection">
            {(field) => (
              <div className="flex w-full min-w-0 items-center justify-between gap-2 text-sm">
                Quick date selection
                <Switch
                  checked={field.state.value}
                  onCheckedChange={(checked) => field.handleChange(checked)}
                />
              </div>
            )}
          </form.Field>
          <form.Field name="dateRange">
            {(field) => (
              <div className="flex w-full min-w-0 items-center justify-between gap-2 text-sm">
                Date range
                <Switch
                  checked={field.state.value}
                  onCheckedChange={(checked) => field.handleChange(checked)}
                />
              </div>
            )}
          </form.Field>
        </>
      ) : null}
      {isQuestion(node) && node.kind === "number" ? (
        <div className="flex w-full min-w-0 flex-col gap-3">
          <form.Field name="min">
            {(field) => (
              <div className="flex w-full min-w-0 flex-col gap-1.5">
                <Label>Min</Label>
                <NumberField
                  className="w-full min-w-0"
                  value={field.state.value}
                  onValueChange={(value) => field.handleChange(value)}
                />
              </div>
            )}
          </form.Field>
          <form.Field name="max">
            {(field) => (
              <div className="flex w-full min-w-0 flex-col gap-1.5">
                <Label>Max</Label>
                <NumberField
                  className="w-full min-w-0"
                  value={field.state.value}
                  onValueChange={(value) => field.handleChange(value)}
                />
              </div>
            )}
          </form.Field>
          <form.Field name="unit">
            {(field) => (
              <div className="flex w-full min-w-0 flex-col gap-1.5">
                <Label>Unit</Label>
                <AutocompleteField
                  className="w-full min-w-0"
                  value={field.state.value}
                  options={NUMBER_UNIT_OPTIONS}
                  allowCustomValue
                  placeholder="Optional, e.g. mmol/L"
                  emptyText="No matches. Keep this text as a custom unit."
                  customValueLabel={(query) => `Use “${query}”`}
                  onValueChange={(value) => field.handleChange(value)}
                />
              </div>
            )}
          </form.Field>
        </div>
      ) : null}
      {isQuestion(node) && node.kind === "attachment" ? (
        <div className="flex w-full min-w-0 flex-col gap-3">
          <form.Field name="accept">
            {(field) => (
              <div className="flex w-full min-w-0 flex-col gap-1.5">
                <Label>Accepted types</Label>
                <FileAcceptCombobox
                  value={field.state.value}
                  onValueChange={(next) => field.handleChange(next)}
                />
                <p className="text-xs text-muted-foreground">
                  Choose common types or type a custom MIME type / extension.
                </p>
              </div>
            )}
          </form.Field>
          <form.Field name="maxCount">
            {(field) => (
              <div className="flex w-full min-w-0 flex-col gap-1.5">
                <Label>Max files</Label>
                <NumberField
                  className="w-full min-w-0"
                  value={field.state.value}
                  min={1}
                  step={1}
                  onValueChange={(value) =>
                    field.handleChange(
                      typeof value === "number" && Number.isFinite(value)
                        ? Math.max(1, Math.floor(value))
                        : 1
                    )
                  }
                />
              </div>
            )}
          </form.Field>
          <form.Field name="maxFileSizeMb">
            {(field) => (
              <div className="flex w-full min-w-0 flex-col gap-1.5">
                <Label>Max size (MB)</Label>
                <NumberField
                  className="w-full min-w-0"
                  value={field.state.value}
                  min={1}
                  step={1}
                  onValueChange={(value) =>
                    field.handleChange(
                      typeof value === "number" && Number.isFinite(value)
                        ? Math.max(1, value)
                        : 10
                    )
                  }
                />
              </div>
            )}
          </form.Field>
        </div>
      ) : null}
      {isQuestion(node) &&
        (node.kind === "select" ||
          node.kind === "multi_select" ||
          node.kind === "autocomplete") ? (
        <>
          <form.Field name="optionsText">
            {(field) => (
              <OptionsEditor
                value={field.state.value}
                onChange={(value) => field.handleChange(value)}
              />
            )}
          </form.Field>
          <form.Field name="allowOther">
            {(field) => (
              <div className="flex w-full min-w-0 items-center justify-between gap-2 text-sm">
                Allow other
                <Switch
                  checked={field.state.value}
                  onCheckedChange={(checked) => field.handleChange(checked)}
                />
              </div>
            )}
          </form.Field>
        </>
      ) : null}
      {isQuestion(node) && node.kind === "cascader" ? (
        <form.Field name="optionsText">
          {(field) => (
            <div className="flex w-full min-w-0 flex-col gap-1.5">
              <Label>Options</Label>
              <Textarea
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                className="min-h-32 w-full min-w-0 font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Indent with two spaces to nest a child option.
              </p>
            </div>
          )}
        </form.Field>
      ) : null}
      {isQuestion(node) ? (
        <DefaultAnswerEditor node={node} onChange={onChange} />
      ) : null}
      <ConditionEditor node={node} sources={sources} onChange={onChange} />
    </div>
  )
}

function DefaultAnswerEditor({
  node,
  onChange,
}: Readonly<{
  node: FormQuestion
  onChange: (patch: FormNodePatch) => void
}>): ReactNode {
  const [draftOn, setDraftOn] = useState(false)
  if (!questionSupportsDefaultAnswer(node.kind)) return null
  const stored = hasDefaultAnswer(node)
  const enabled = stored || draftOn
  const choiceOptions = flattenChoiceOptions(node.options ?? [])
  const needsOptions =
    node.kind === "select" ||
    node.kind === "multi_select" ||
    node.kind === "autocomplete" ||
    node.kind === "cascader"
  const canEnable = !needsOptions || choiceOptions.length > 0

  const setDefault = (value: FormAnswerValue | undefined) => {
    onChange({ defaultValue: value })
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-3">
      <div className="flex w-full min-w-0 items-center justify-between gap-2 text-sm">
        Default answer
        <Switch
          checked={enabled}
          disabled={!canEnable && !enabled}
          onCheckedChange={(checked) => {
            if (!checked) {
              setDraftOn(false)
              setDefault(undefined)
              return
            }
            setDraftOn(true)
          }}
        />
      </div>
      {enabled ? (
        <div className="w-full min-w-0">
          <DefaultValueControl
            node={node}
            onChange={(value) => {
              if (value !== undefined) setDraftOn(false)
              setDefault(value)
            }}
          />
        </div>
      ) : null}
    </div>
  )
}

function DefaultValueControl({
  node,
  onChange,
}: Readonly<{
  node: FormQuestion
  onChange: (value: FormAnswerValue | undefined) => void
}>): ReactNode {
  const value = node.defaultValue
  switch (node.kind) {
    case "short_text":
    case "reference":
      return (
        <Input
          className="w-full min-w-0"
          value={typeof value === "string" ? value : ""}
          placeholder="Default answer"
          onChange={(event) =>
            onChange(event.target.value.length > 0 ? event.target.value : undefined)
          }
        />
      )
    case "long_text":
      return (
        <Textarea
          className="w-full min-w-0"
          value={typeof value === "string" ? value : ""}
          placeholder="Default answer"
          onChange={(event) =>
            onChange(event.target.value.length > 0 ? event.target.value : undefined)
          }
        />
      )
    case "number":
      return (
        <NumberField
          className="w-full min-w-0"
          value={typeof value === "number" ? value : null}
          suffix={node.unit}
          onValueChange={(next) => onChange(next ?? undefined)}
        />
      )
    case "date":
      return (
        <DateDefaultControl
          value={typeof value === "string" ? value : ""}
          includeTime={node.includeTime === true}
          quickSelect={node.quickDateSelection === true}
          range={node.dateRange === true}
          onChange={onChange}
        />
      )
    case "boolean":
      return (
        <Select
          value={value === true ? "yes" : value === false ? "no" : null}
          items={{ yes: "Yes", no: "No" }}
          onValueChange={(next) => {
            if (next === "yes") onChange(true)
            if (next === "no") onChange(false)
          }}
        >
          <SelectTrigger className="w-full min-w-0 max-w-full overflow-hidden">
            <SelectValue placeholder="Choose default" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="yes">Yes</SelectItem>
              <SelectItem value="no">No</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      )
    case "select":
    case "autocomplete": {
      const options = flattenChoiceOptions(node.options ?? [])
      const stringValue = typeof value === "string" ? value : ""
      if (node.kind === "autocomplete" && node.allowOther === true) {
        return (
          <AutocompleteField
            className="w-full min-w-0"
            value={stringValue}
            options={options}
            allowCustomValue
            placeholder="Default answer"
            onValueChange={(next) => onChange(next.length > 0 ? next : undefined)}
          />
        )
      }
      return (
        <Select
          value={stringValue.length > 0 ? stringValue : null}
          items={options.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
          onValueChange={(next) => {
            if (typeof next === "string") onChange(next)
          }}
        >
          <SelectTrigger className="w-full min-w-0 max-w-full overflow-hidden">
            <SelectValue placeholder="Choose default" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      )
    }
    case "cascader":
      return (
        <Cascader
          className="w-full min-w-0"
          value={typeof value === "string" ? value : ""}
          options={node.options ?? []}
          placeholder="Choose default"
          onValueChange={(next) => onChange(next.length > 0 ? next : undefined)}
        />
      )
    case "multi_select": {
      const selected = Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : []
      return (
        <div className="flex w-full min-w-0 flex-col gap-2">
          {(node.options ?? []).map((option) => {
            const checked = selected.includes(option.value)
            return (
              <div key={option.value} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={checked}
                  onCheckedChange={(next) => {
                    const on = next === true
                    const nextSelected = on
                      ? [...selected, option.value]
                      : selected.filter((item) => item !== option.value)
                    onChange(nextSelected.length > 0 ? nextSelected : undefined)
                  }}
                />
                {option.label}
              </div>
            )
          })}
        </div>
      )
    }
    default:
      return null
  }
}

function DateDefaultControl({
  value,
  includeTime,
  quickSelect,
  range,
  onChange,
}: Readonly<{
  value: string
  includeTime: boolean
  quickSelect: boolean
  range: boolean
  onChange: (value: FormAnswerValue | undefined) => void
}>): ReactNode {
  const storedMode = isTodayDateDefault(value)
    ? "today"
    : value.length > 0
      ? "custom"
      : ""
  const [mode, setMode] = useState(storedMode)
  const selected = mode || storedMode
  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <Select
        value={selected.length > 0 ? selected : null}
        items={{ today: "Today", custom: "Specific date" }}
        onValueChange={(next) => {
          if (next === "today") {
            setMode("today")
            onChange(DATE_DEFAULT_TODAY)
            return
          }
          if (next === "custom") {
            setMode("custom")
            if (isTodayDateDefault(value)) onChange(undefined)
          }
        }}
      >
        <SelectTrigger className="w-full min-w-0 max-w-full overflow-hidden">
          <SelectValue placeholder="Choose default" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="custom">Specific date</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      {selected === "custom" ? (
        <DatePicker
          className="w-full min-w-0"
          value={isTodayDateDefault(value) ? "" : value}
          includeTime={includeTime}
          quickSelect={quickSelect}
          range={range}
          onValueChange={(next) => onChange(next.length > 0 ? next : undefined)}
        />
      ) : null}
    </div>
  )
}

function ConditionEditor({
  node,
  sources,
  onChange,
}: Readonly<{
  node: FormNode
  sources: readonly FormQuestion[]
  onChange: (patch: FormNodePatch) => void
}>): ReactNode {
  const existingRules = node.condition?.rules ?? []
  const form = useForm({
    defaultValues: {
      enabled: existingRules.length > 0,
      match: node.condition?.match ?? ("all" as const),
      rules: (existingRules.length > 0
        ? existingRules
        : [
          {
            fieldKey: sources[0]?.key ?? "",
            op: "eq" as const,
            value: "",
          },
        ]
      ).map((rule) => ({
        fieldKey: rule.fieldKey,
        op: rule.op,
        value: ruleValueToInput(rule.value),
      })),
    },
    listeners: {
      onChange: ({ formApi }) => {
        const values = formApi.state.values
        if (!values.enabled) {
          onChange({ condition: undefined })
          return
        }
        const rules = values.rules
          .filter((rule) => rule.fieldKey.length > 0)
          .map((rule) => ({
            fieldKey: rule.fieldKey,
            op: rule.op,
            ...valuePatchForOp(rule.op, rule.value),
          }))
        onChange({
          condition: {
            match: values.match,
            rules,
          },
        })
      },
    },
  })
  return (
    <div className="flex w-full min-w-0 flex-col gap-3 border-t pt-3">
      <form.Field name="enabled">
        {(field) => (
          <div className="flex w-full min-w-0 items-center justify-between gap-2 text-sm">
            Show only when
            <Switch
              checked={field.state.value}
              onCheckedChange={(checked) => field.handleChange(checked)}
            />
          </div>
        )}
      </form.Field>
      <form.Subscribe selector={(state) => state.values.enabled}>
        {(enabled) =>
          enabled ? (
            <div className="flex w-full min-w-0 flex-col gap-3">
              {sources.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Add another question first to use display logic.
                </p>
              ) : (
                <>
                  <form.Field name="match">
                    {(field) => (
                      <div className="flex w-full min-w-0 flex-col gap-1.5">
                        <Label>Match</Label>
                        <Select
                          value={field.state.value}
                          items={{ all: "All rules", any: "Any rule" }}
                          onValueChange={(value) => {
                            if (value === "all" || value === "any") {
                              field.handleChange(value)
                            }
                          }}
                        >
                          <SelectTrigger className="w-full min-w-0 max-w-full overflow-hidden">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="all">All rules</SelectItem>
                              <SelectItem value="any">Any rule</SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </form.Field>
                  <form.Field name="rules">
                    {(field) => (
                      <div className="flex w-full min-w-0 flex-col gap-3">
                        {field.state.value.map((rule, index) => {
                          const source = sources.find((entry) => entry.key === rule.fieldKey)
                          const needsValue = rule.op !== "is_set" && rule.op !== "is_empty"
                          return (
                            <div
                              // biome-ignore lint/suspicious/noArrayIndexKey: condition rows are ordered editor slots
                              key={`rule-${index}`}
                              className="flex w-full min-w-0 flex-col gap-1.5 rounded-lg border p-2"
                            >
                              <Select
                                value={rule.fieldKey}
                                items={sources.map((question) => ({
                                  value: question.key,
                                  label: question.label,
                                }))}
                                onValueChange={(value) => {
                                  if (typeof value !== "string") return
                                  const next = [...field.state.value]
                                  const current = next[index]
                                  if (!current) return
                                  next[index] = { ...current, fieldKey: value, value: "" }
                                  field.handleChange(next)
                                }}
                              >
                                <SelectTrigger className="w-full min-w-0 max-w-full overflow-hidden">
                                  <SelectValue placeholder="Question" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectGroup>
                                    {sources.map((question) => (
                                      <SelectItem key={question.id} value={question.key}>
                                        {question.label}
                                      </SelectItem>
                                    ))}
                                  </SelectGroup>
                                </SelectContent>
                              </Select>
                              <Select
                                value={rule.op}
                                items={CONDITION_OPS.map((entry) => ({
                                  value: entry.op,
                                  label: entry.label,
                                }))}
                                onValueChange={(value) => {
                                  const op = CONDITION_OPS.find((entry) => entry.op === value)?.op
                                  if (!op) return
                                  const next = [...field.state.value]
                                  const current = next[index]
                                  if (!current) return
                                  next[index] = { ...current, op }
                                  field.handleChange(next)
                                }}
                              >
                                <SelectTrigger className="w-full min-w-0 max-w-full overflow-hidden">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectGroup>
                                    {CONDITION_OPS.map((entry) => (
                                      <SelectItem key={entry.op} value={entry.op}>
                                        {entry.label}
                                      </SelectItem>
                                    ))}
                                  </SelectGroup>
                                </SelectContent>
                              </Select>
                              {needsValue ? (
                                <div className="w-full min-w-0">
                                  <ConditionValueInput
                                    source={source}
                                    op={rule.op}
                                    value={rule.value}
                                    onChange={(value) => {
                                      const next = [...field.state.value]
                                      const current = next[index]
                                      if (!current) return
                                      next[index] = { ...current, value }
                                      field.handleChange(next)
                                    }}
                                  />
                                </div>
                              ) : null}
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="w-full"
                                disabled={field.state.value.length <= 1}
                                onClick={() =>
                                  field.handleChange(
                                    field.state.value.filter((_, ruleIndex) => ruleIndex !== index)
                                  )
                                }
                              >
                                Remove rule
                              </Button>
                            </div>
                          )
                        })}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="w-full"
                          onClick={() =>
                            field.handleChange([
                              ...field.state.value,
                              {
                                fieldKey: sources[0]?.key ?? "",
                                op: "eq",
                                value: "",
                              },
                            ])
                          }
                        >
                          Add rule
                        </Button>
                      </div>
                    )}
                  </form.Field>
                </>
              )}
            </div>
          ) : null
        }
      </form.Subscribe>
    </div>
  )
}

function ConditionValueInput({
  source,
  op,
  value,
  onChange,
}: Readonly<{
  source: FormQuestion | undefined
  op: FormConditionOp
  value: string
  onChange: (value: string) => void
}>): ReactNode {
  if (source?.kind === "boolean" && (op === "eq" || op === "neq")) {
    return (
      <Select
        value={value}
        items={{ true: "Yes", false: "No" }}
        onValueChange={(next) => {
          if (typeof next === "string") onChange(next)
        }}
      >
        <SelectTrigger className="w-full min-w-0 max-w-full overflow-hidden">
          <SelectValue placeholder="Value" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="true">Yes</SelectItem>
            <SelectItem value="false">No</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    )
  }
  if (source && isChoiceKind(source.kind) && (op === "eq" || op === "neq")) {
    const options =
      source.kind === "cascader"
        ? flattenChoiceOptions(source.options ?? [])
        : (source.options ?? [])
    return (
      <Select
        value={value}
        items={options.map((option) => ({
          value: option.value,
          label: option.label,
        }))}
        onValueChange={(next) => {
          if (typeof next === "string") onChange(next)
        }}
      >
        <SelectTrigger className="w-full min-w-0 max-w-full overflow-hidden">
          <SelectValue placeholder="Value" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    )
  }
  if (source?.kind === "number" && (op === "eq" || op === "neq" || op === "gt" || op === "lt")) {
    return (
      <NumberField
        className="w-full min-w-0"
        value={value.trim().length === 0 || !Number.isFinite(Number(value)) ? null : Number(value)}
        onValueChange={(next) => onChange(next === null ? "" : String(next))}
      />
    )
  }
  return (
    <Input
      className="w-full min-w-0"
      value={value}
      placeholder={op === "in" || op === "not_in" ? "Comma-separated values" : "Value"}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

function ruleValueToInput(value: FormConditionGroup["rules"][number]["value"]): string {
  if (value === undefined) return ""
  if (Array.isArray(value)) return value.join(", ")
  return String(value)
}

function valuePatchForOp(
  op: FormConditionOp,
  value: string
): Readonly<{ value?: string | number | readonly string[] }> {
  if (op === "is_set" || op === "is_empty") return {}
  if (op === "in" || op === "not_in") {
    return {
      value: value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
    }
  }
  if (op === "gt" || op === "lt") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? { value: parsed } : { value }
  }
  return { value }
}

function OptionsEditor({
  value,
  onChange,
}: Readonly<{ value: string; onChange: (value: string) => void }>): ReactNode {
  const options = value.length === 0 ? [""] : value.split("\n")
  return (
    <div className="flex w-full min-w-0 flex-col gap-1.5">
      <Label>Options</Label>
      {options.map((option, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: option rows are ordered editor slots
          key={`option-${index}`}
          className="flex w-full min-w-0 items-center gap-1"
        >
          <Input
            className="min-w-0 flex-1"
            value={option}
            onChange={(event) => {
              const next = [...options]
              next[index] = event.target.value
              onChange(next.join("\n"))
            }}
          />
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            className="shrink-0"
            aria-label="Remove option"
            disabled={options.length <= 1}
            onClick={() => onChange(options.filter((_, optionIndex) => optionIndex !== index).join("\n"))}
          >
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="w-full"
        onClick={() => onChange(`${value}\n`)}
      >
        Add option
      </Button>
    </div>
  )
}

function acceptsEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

function TagBadge({ tag }: Readonly<{ tag: BoundTag }>): ReactNode {
  const placeholder =
    tag.role === "value"
      ? encodeValuePlaceholder(tag)
      : tag.role === "each"
        ? encodeMarkerPlaceholder({ type: "each", path: tag.slug })
        : tag.role === "if"
          ? encodeMarkerPlaceholder({ type: "if", path: tag.slug })
          : `{{@image ${tag.slug}}}`
  return (
    <button
      type="button"
      draggable
      className="flex w-full min-w-0 items-center justify-between gap-2 overflow-hidden rounded-md border px-2 py-1.5 text-left text-sm"
      onDragStart={(event) => {
        event.dataTransfer.setData(FORM_TAG_MIME, tag.id)
        event.dataTransfer.setData("text/plain", placeholder)
        event.dataTransfer.effectAllowed = "copy"
      }}
    >
      <span className="min-w-0 truncate">{tag.label}</span>
      <Badge variant="outline" className="shrink-0">
        {tag.role}
      </Badge>
    </button>
  )
}

function paletteItemForKind(kind: FormNodeKind): PaletteItem {
  return (
    PALETTE_ITEMS.find((item) => item.kind === kind) ?? {
      kind,
      label: labelForKind(kind),
      icon: Layout01Icon,
    }
  )
}

function collectNodeMap(node: FormNode, map: Map<string, FormNode>): void {
  map.set(node.id, node)
  if (isQuestion(node) && node.children) {
    for (const child of node.children) collectNodeMap(child, map)
  }
}

function newestNodeId(before: FormTemplate, after: FormTemplate): string | null {
  const previous = new Set<string>()
  for (const page of before.pages) collectIds(page.nodes, previous)
  for (const page of after.pages) {
    const found = firstNewId(page.nodes, previous)
    if (found) return found
  }
  return null
}

function collectIds(nodes: readonly FormNode[], into: Set<string>): void {
  for (const node of nodes) {
    into.add(node.id)
    if (isQuestion(node) && node.children) collectIds(node.children, into)
  }
}

function firstNewId(nodes: readonly FormNode[], previous: Set<string>): string | null {
  for (const node of nodes) {
    if (!previous.has(node.id)) return node.id
    if (isQuestion(node) && node.children) {
      const nested = firstNewId(node.children, previous)
      if (nested) return nested
    }
  }
  return null
}

export function emptyFormTemplate(): FormTemplate {
  return createEmptyForm()
}
