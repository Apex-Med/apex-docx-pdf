import { useEffect, useId, useMemo, useState } from "react"
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
import { Label } from "@workspace/ui/components/label"
import {
  RadioGroup,
  RadioGroupItem,
} from "@workspace/ui/components/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Switch } from "@workspace/ui/components/switch"

import {
  DATE_ONLY_PATTERNS,
  DATE_TIME_PATTERNS,
  DEFAULT_DATE_PATTERN,
  DEFAULT_DATE_TIME_PATTERN,
  isSystemTemplateTag,
  isValidTemplatePath,
  slugifyLabel,
  uniqueSlug,
  type TemplateTagDefinition,
  type TemplateTagKind,
} from "../tags"

export type TagEditorDialogProps = Readonly<{
  open: boolean
  mode: "create" | "edit"
  initial?: TemplateTagDefinition
  takenSlugs: readonly string[]
  onOpenChange: (open: boolean) => void
  onSubmit: (tag: Omit<TemplateTagDefinition, "id"> & { id?: string }) => void
}>

export function TagEditorDialog({
  open,
  mode,
  initial,
  takenSlugs,
  onOpenChange,
  onSubmit,
}: TagEditorDialogProps) {
  const labelId = useId()
  const slugId = useId()
  const timeId = useId()
  const [label, setLabel] = useState(initial?.label ?? "")
  const [slug, setSlug] = useState(initial?.slug ?? "")
  const [slugTouched, setSlugTouched] = useState(mode === "edit")
  const [kind, setKind] = useState<TemplateTagKind>(initial?.kind ?? "string")
  const [includeTime, setIncludeTime] = useState(
    initial?.date?.includeTime ?? false
  )
  const [pattern, setPattern] = useState(
    initial?.date?.pattern ?? DEFAULT_DATE_PATTERN
  )

  useEffect(() => {
    if (!open) return
    setLabel(initial?.label ?? "")
    setSlug(initial?.slug ?? "")
    setSlugTouched(mode === "edit")
    setKind(initial?.kind ?? "string")
    setIncludeTime(initial?.date?.includeTime ?? false)
    setPattern(initial?.date?.pattern ?? DEFAULT_DATE_PATTERN)
  }, [open, initial, mode])

  const patterns = includeTime ? DATE_TIME_PATTERNS : DATE_ONLY_PATTERNS
  const generated = useMemo(() => {
    const desired = slugTouched ? slug : slugifyLabel(label)
    const reserved = takenSlugs.filter((entry) => entry !== initial?.slug)
    return uniqueSlug(desired || "tag", reserved)
  }, [label, slug, slugTouched, takenSlugs, initial?.slug])

  useEffect(() => {
    if (kind !== "date") return
    if (!(patterns as readonly string[]).includes(pattern)) {
      setPattern(includeTime ? DEFAULT_DATE_TIME_PATTERN : DEFAULT_DATE_PATTERN)
    }
  }, [kind, includeTime, pattern, patterns])

  const system = initial ? isSystemTemplateTag(initial) : false
  const slugValid = isValidTemplatePath(generated)
  const canSubmit = label.trim().length > 0 && slugValid

  const example =
    kind === "date"
      ? includeTime
        ? pattern.includes("a")
          ? "05-08-2026 09:30 AM"
          : "05-08-2026 09:30"
        : "05-08-2026"
      : kind === "number"
        ? "42"
        : "Jane Author"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Edit tag" : "Create tag"}</DialogTitle>
          <DialogDescription>
            {system
              ? "Built-in tags keep their placeholder id and type. You can rename them or change the date format."
              : "Tags become typed placeholders such as "}
            {system ? null : <code>{"{{author_name:string}}"}</code>}
            {system ? null : " in the saved DOCX."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor={labelId} className="text-muted-foreground">
              Name
            </Label>
            <Input
              id={labelId}
              value={label}
              placeholder="Author name"
              onChange={(event) => {
                setLabel(event.target.value)
                if (!slugTouched) setSlug(slugifyLabel(event.target.value))
              }}
              autoFocus
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-muted-foreground">Type</Label>
            <RadioGroup
              value={kind}
              disabled={system}
              onValueChange={(value) => {
                if (system) return
                if (value === "string" || value === "number" || value === "date") {
                  setKind(value)
                }
              }}
              className="flex flex-wrap gap-4"
            >
              <Label className="flex items-center gap-2 text-sm font-normal tracking-normal normal-case">
                <RadioGroupItem value="string" disabled={system} />
                String
              </Label>
              <Label className="flex items-center gap-2 text-sm font-normal tracking-normal normal-case">
                <RadioGroupItem value="number" disabled={system} />
                Number
              </Label>
              <Label className="flex items-center gap-2 text-sm font-normal tracking-normal normal-case">
                <RadioGroupItem value="date" disabled={system} />
                Date
              </Label>
            </RadioGroup>
          </div>
          {kind === "date" ? (
            <div className="grid gap-3">
              <Label
                htmlFor={timeId}
                className="flex items-center justify-between gap-3 text-sm font-normal tracking-normal normal-case"
              >
                Include time
                <Switch
                  id={timeId}
                  checked={includeTime}
                  disabled={system}
                  onCheckedChange={(next) => {
                    if (!system) setIncludeTime(next)
                  }}
                />
              </Label>
              <div className="grid gap-1.5">
                <Label className="text-muted-foreground">Format</Label>
                <Select
                  items={patterns.map((entry) => ({
                    value: entry,
                    label: entry,
                  }))}
                  value={pattern}
                  onValueChange={(value) => {
                    if (value) setPattern(value)
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {patterns.map((entry) => (
                      <SelectItem key={entry} value={entry}>
                        {entry}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-xs">
                  Example: {example}
                </p>
              </div>
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor={slugId} className="text-muted-foreground">
              Placeholder id
            </Label>
            <Input
              id={slugId}
              value={mode === "edit" ? (initial?.slug ?? generated) : generated}
              disabled={mode === "edit"}
              spellCheck={false}
              onChange={(event) => {
                setSlugTouched(true)
                setSlug(event.target.value)
              }}
            />
            <p className="text-muted-foreground font-mono text-xs">
              {kind === "date"
                ? `{{${generated}:date | date:"${pattern}"}}`
                : `{{${generated}:${kind}}}`}
            </p>
            {!slugValid ? (
              <p className="text-destructive text-xs">
                Use a letter-leading dotted path such as author_name or
                customer.name.
              </p>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={() => {
              onSubmit({
                ...(initial?.id ? { id: initial.id } : {}),
                ...(initial?.source ? { source: initial.source } : {}),
                label: label.trim(),
                slug: mode === "edit" ? (initial?.slug ?? generated) : generated,
                kind,
                ...(kind === "date" ? { date: { includeTime, pattern } } : {}),
              })
              onOpenChange(false)
            }}
          >
            {mode === "edit" ? "Save" : "Create tag"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
