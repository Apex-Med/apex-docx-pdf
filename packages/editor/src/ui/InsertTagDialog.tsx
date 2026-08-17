import { useEffect, useMemo, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"

import type { TemplateTagDefinition } from "../tags"

export type InsertTagDialogProps = Readonly<{
  open: boolean
  tags: readonly TemplateTagDefinition[]
  onOpenChange: (open: boolean) => void
  onInsert: (tag: TemplateTagDefinition) => void
  onCreate: () => void
}>

export function InsertTagDialog({
  open,
  tags,
  onOpenChange,
  onInsert,
  onCreate,
}: InsertTagDialogProps) {
  const [query, setQuery] = useState("")
  const [activeId, setActiveId] = useState<string | null>(tags[0]?.id ?? null)

  useEffect(() => {
    if (!open) return
    setQuery("")
    setActiveId(tags[0]?.id ?? null)
  }, [open, tags])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return tags
    return tags.filter(
      (tag) =>
        tag.label.toLowerCase().includes(needle) ||
        tag.slug.toLowerCase().includes(needle)
    )
  }, [query, tags])

  useEffect(() => {
    if (filtered.some((tag) => tag.id === activeId)) return
    setActiveId(filtered[0]?.id ?? null)
  }, [filtered, activeId])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Insert tag</DialogTitle>
          <DialogDescription>
            Choose a tag to insert at the current cursor.
          </DialogDescription>
        </DialogHeader>
        {tags.length === 0 ? (
          <div className="text-muted-foreground grid gap-3 text-sm">
            <p>This document has no tags yet.</p>
            <Button
              type="button"
              onClick={() => {
                onOpenChange(false)
                onCreate()
              }}
            >
              Create tag
            </Button>
          </div>
        ) : (
          <div className="grid gap-3">
            <Input
              value={query}
              placeholder="Search tags"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return
                const tag = filtered.find((entry) => entry.id === activeId)
                if (!tag) return
                event.preventDefault()
                onInsert(tag)
                onOpenChange(false)
              }}
              autoFocus
            />
            <ul className="max-h-64 overflow-auto border border-(--apex-chrome-border)">
              {filtered.map((tag) => {
                const active = tag.id === activeId
                return (
                  <li key={tag.id}>
                    <button
                      type="button"
                      className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm ${
                        active
                          ? "bg-(--apex-chrome-hover)"
                          : "hover:bg-(--apex-chrome-hover)"
                      }`}
                      onClick={() => {
                        onInsert(tag)
                        onOpenChange(false)
                      }}
                      onMouseEnter={() => setActiveId(tag.id)}
                    >
                      <span>{tag.label}</span>
                      <span className="text-muted-foreground font-mono text-xs">
                        {tag.slug}:{tag.kind}
                      </span>
                    </button>
                  </li>
                )
              })}
              {filtered.length === 0 ? (
                <li className="text-muted-foreground px-3 py-4 text-sm">
                  No tags match “{query}”.
                </li>
              ) : null}
            </ul>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
