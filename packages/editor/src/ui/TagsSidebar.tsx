import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Delete02Icon,
  PencilEdit01Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { useEffect, useMemo, useState, type ReactNode } from "react"

import {
  TEMPLATE_TAG_MIME,
  encodeTemplatePlaceholder,
  formatTemplateTagValue,
  isPrintedAtTag,
  isSystemTemplateTag,
  isTodayTag,
  resolveTemplateTagValue,
  subscribeNowClock,
  useTemplateTagStore,
  type TemplateTagDefinition,
  type TemplateTagValue,
  type TemplateTagValues,
} from "../tags"

export type TagsSidebarProps = Readonly<{
  open: boolean
  tags: readonly TemplateTagDefinition[]
  values: TemplateTagValues
  onToggle: () => void
  onCreate: () => void
  onEdit: (tag: TemplateTagDefinition) => void
  onDelete: (tag: TemplateTagDefinition) => void
  onValueChange: (tag: TemplateTagDefinition, value: TemplateTagValue | null) => void
}>

export function TagsSidebar({
  open,
  tags,
  values,
  onToggle,
  onCreate,
  onEdit,
  onDelete,
  onValueChange,
}: TagsSidebarProps): ReactNode {
  if (!open) {
    return (
      <div className="apex-tags-sidebar apex-tags-sidebar--collapsed">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Show tags sidebar"
          aria-expanded={false}
          onClick={onToggle}
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
        </Button>
      </div>
    )
  }

  return (
    <aside className="apex-tags-sidebar" aria-label="Document tags">
      <header className="apex-tags-sidebar__header">
        <div>
          <h2 className="apex-tags-sidebar__title">Tags</h2>
          <p className="apex-tags-sidebar__subtitle">
            Placeholders for template data
          </p>
        </div>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Hide tags sidebar"
          aria-expanded={true}
          onClick={onToggle}
        >
          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
        </Button>
      </header>
      <Tabs defaultValue="tags" className="apex-tags-sidebar__tabs">
        <TabsList variant="line" className="w-full">
          <TabsTrigger value="tags">Tags</TabsTrigger>
          <TabsTrigger value="data">Data</TabsTrigger>
        </TabsList>
        <TabsContent value="tags" className="apex-tags-sidebar__panel">
          <Button type="button" size="sm" className="w-full" onClick={onCreate}>
            <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
            New tag
          </Button>
          {tags.length === 0 ? (
            <p className="apex-tags-sidebar__empty">
              Create a tag, then drag it into the document or insert it from the
              Insert menu.
            </p>
          ) : (
            <ul className="apex-tags-sidebar__list">
              {tags.map((tag) => (
                <li key={tag.id}>
                  <TagListItem
                    tag={tag}
                    filled={
                      resolveTemplateTagValue(tag, values) !== undefined
                    }
                    onEdit={() => onEdit(tag)}
                    onDelete={() => onDelete(tag)}
                  />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
        <TabsContent value="data" className="apex-tags-sidebar__panel">
          {tags.length === 0 ? (
            <p className="apex-tags-sidebar__empty">
              Add tags first, then assign preview values here.
            </p>
          ) : (
            <div className="apex-tags-sidebar__fields">
              {tags.map((tag) => (
                <TagValueField
                  key={tag.id}
                  tag={tag}
                  value={values[tag.id]}
                  onValueChange={(next) => onValueChange(tag, next)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </aside>
  )
}

function TagListItem({
  tag,
  filled,
  onEdit,
  onDelete,
}: {
  tag: TemplateTagDefinition
  filled: boolean
  onEdit: () => void
  onDelete: () => void
}): ReactNode {
  const system = isSystemTemplateTag(tag)
  return (
    <div className="apex-tags-sidebar__item">
      <button
        type="button"
        className="apex-tags-sidebar__drag"
        aria-label={`Drag ${tag.label} into the document`}
        draggable
        onDragStart={(event) => {
          useTemplateTagStore.getState().setDraggingTagId(tag.id)
          event.dataTransfer.setData(TEMPLATE_TAG_MIME, tag.id)
          event.dataTransfer.setData("text/plain", `apex-tag:${tag.id}`)
          event.dataTransfer.effectAllowed = "copy"
          const ghost = event.currentTarget.ownerDocument.createElement("span")
          ghost.className = "apex-template-tag-drag-ghost"
          ghost.textContent = tag.label
          event.currentTarget.ownerDocument.body.append(ghost)
          event.dataTransfer.setDragImage(ghost, 12, 10)
          requestAnimationFrame(() => ghost.remove())
        }}
        onDragEnd={() => {
          useTemplateTagStore.getState().setDraggingTagId(null)
        }}
      >
        <span className="apex-tags-sidebar__grip" aria-hidden>
          ::
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm">{tag.label}</span>
          <span className="text-muted-foreground block truncate font-mono text-[11px]">
            {encodeTemplatePlaceholder(tag)}
          </span>
        </span>
        <span className="apex-tags-sidebar__kind">
          {isPrintedAtTag(tag) ? "now" : filled ? "set" : tag.kind}
        </span>
      </button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={`Edit ${tag.label}`}
        onClick={onEdit}
      >
        <HugeiconsIcon icon={PencilEdit01Icon} strokeWidth={2} />
      </Button>
      {system ? null : (
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={`Delete ${tag.label}`}
          onClick={onDelete}
        >
          <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
        </Button>
      )}
    </div>
  )
}

function TagValueField({
  tag,
  value,
  onValueChange,
}: {
  tag: TemplateTagDefinition
  value: TemplateTagValue | undefined
  onValueChange: (value: TemplateTagValue | null) => void
}): ReactNode {
  const inputId = useMemo(() => `tag-value-${tag.id}`, [tag.id])
  const now = useNowClock(isPrintedAtTag(tag))
  if (isPrintedAtTag(tag)) {
    const live = resolveTemplateTagValue(tag, {}, now)
    return (
      <div className="grid gap-1.5">
        <Label htmlFor={inputId} className="text-muted-foreground">
          {tag.label}
        </Label>
        <Input
          id={inputId}
          readOnly
          value={live ? formatTemplateTagValue(tag, live) : ""}
        />
        <p className="text-muted-foreground text-xs">
          Shows the current time while you edit. Fixed when you print or
          export PDF.
        </p>
      </div>
    )
  }
  if (tag.kind === "number") {
    return (
      <div className="grid gap-1.5">
        <Label htmlFor={inputId} className="text-muted-foreground">
          {tag.label}
        </Label>
        <Input
          id={inputId}
          type="number"
          value={value?.kind === "number" ? String(value.value) : ""}
          onChange={(event) => {
            const raw = event.target.value
            if (raw.trim() === "") {
              onValueChange(null)
              return
            }
            const next = Number(raw)
            if (Number.isFinite(next)) onValueChange({ kind: "number", value: next })
          }}
        />
      </div>
    )
  }
  if (tag.kind === "date") {
    const includeTime = tag.date?.includeTime === true
    return (
      <div className="grid gap-1.5">
        <Label htmlFor={inputId} className="text-muted-foreground">
          {tag.label}
        </Label>
        <Input
          id={inputId}
          type={includeTime ? "datetime-local" : "date"}
          value={isoToInput(value?.kind === "date" ? value.value : "", includeTime)}
          onChange={(event) => {
            const raw = event.target.value
            if (!raw) {
              onValueChange(null)
              return
            }
            onValueChange({
              kind: "date",
              value: inputToIso(raw, includeTime),
            })
          }}
        />
        {isTodayTag(tag) ? (
          <p className="text-muted-foreground text-xs">
            Captured while editing. Does not change when you print.
          </p>
        ) : null}
      </div>
    )
  }
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={inputId} className="text-muted-foreground">
        {tag.label}
      </Label>
      <Input
        id={inputId}
        value={value?.kind === "string" ? value.value : ""}
        onChange={(event) => {
          const raw = event.target.value
          onValueChange(raw.length === 0 ? null : { kind: "string", value: raw })
        }}
      />
    </div>
  )
}

function useNowClock(enabled: boolean): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (!enabled) return
    setNow(new Date())
    return subscribeNowClock(() => setNow(new Date()))
  }, [enabled])
  return now
}

function isoToInput(iso: string, includeTime: boolean): string {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  if (!includeTime) return `${year}-${month}-${day}`
  const hour = String(date.getUTCHours()).padStart(2, "0")
  const minute = String(date.getUTCMinutes()).padStart(2, "0")
  return `${year}-${month}-${day}T${hour}:${minute}`
}

function inputToIso(raw: string, includeTime: boolean): string {
  if (includeTime) {
    const parsed = new Date(`${raw}:00.000Z`)
    return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString()
  }
  return `${raw}T00:00:00.000Z`
}
