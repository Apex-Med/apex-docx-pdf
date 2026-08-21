import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Label } from "@workspace/ui/components/label"
import { Switch } from "@workspace/ui/components/switch"
import { Textarea } from "@workspace/ui/components/textarea"
import { useEffect, useId, useState } from "react"

import type { HeaderFooterEdit, HeaderFooterKind } from "../header-footer"

export type HeaderFooterDialogProps = Readonly<{
  open: boolean
  kind: HeaderFooterKind
  initial: HeaderFooterEdit
  onOpenChange: (open: boolean) => void
  onApply: (edit: HeaderFooterEdit) => void
}>

export function HeaderFooterDialog({
  open,
  kind,
  initial,
  onOpenChange,
  onApply,
}: HeaderFooterDialogProps) {
  const [content, setContent] = useState(initial.content)
  const [differentFirstPage, setDifferentFirstPage] = useState(
    initial.differentFirstPage
  )
  const [firstPageContent, setFirstPageContent] = useState(
    initial.firstPageContent
  )
  const fieldId = useId()
  const label = kind === "header" ? "Header" : "Footer"

  useEffect(() => {
    if (!open) return
    setContent(initial.content)
    setDifferentFirstPage(initial.differentFirstPage)
    setFirstPageContent(initial.firstPageContent)
  }, [initial, open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            Add text to this section. Use {"{page}"} or {"{pages}"} for page
            numbers.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor={`${fieldId}-default`}>{label} text</Label>
            <Textarea
              id={`${fieldId}-default`}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder={`Enter ${kind} text`}
              autoFocus
            />
          </div>

          <div className="flex min-h-11 items-center justify-between gap-4">
            <Label htmlFor={`${fieldId}-different`}>Different first page</Label>
            <Switch
              id={`${fieldId}-different`}
              checked={differentFirstPage}
              onCheckedChange={setDifferentFirstPage}
            />
          </div>

          {differentFirstPage ? (
            <div className="grid gap-1.5">
              <Label htmlFor={`${fieldId}-first`}>First-page {kind}</Label>
              <Textarea
                id={`${fieldId}-first`}
                value={firstPageContent}
                onChange={(event) => setFirstPageContent(event.target.value)}
                placeholder={`Leave blank for no ${kind} on the first page`}
              />
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              onApply({ content, differentFirstPage, firstPageContent })
              onOpenChange(false)
            }}
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
