import { useEffect, useState } from "react"
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

export type LinkDialogProps = Readonly<{
  open: boolean
  initialHref?: string | null
  onOpenChange: (open: boolean) => void
  onApply: (href: string) => void
  onRemove: () => void
}>

export function LinkDialog({
  open,
  initialHref,
  onOpenChange,
  onApply,
  onRemove,
}: LinkDialogProps) {
  const [url, setUrl] = useState(initialHref ?? "")

  useEffect(() => {
    if (open) setUrl(initialHref ?? "")
  }, [open, initialHref])

  const trimmed = url.trim()
  const canApply = trimmed.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Insert link</DialogTitle>
          <DialogDescription>
            Enter a URL for the selected text. Links open in a new tab in the
            editor preview.
          </DialogDescription>
        </DialogHeader>
        <Input
          type="url"
          placeholder="https://example.com"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && canApply) {
              event.preventDefault()
              onApply(trimmed)
              onOpenChange(false)
            }
          }}
          autoFocus
        />
        <DialogFooter>
          {initialHref ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onRemove()
                onOpenChange(false)
              }}
            >
              Remove
            </Button>
          ) : null}
          {initialHref ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                window.open(initialHref, "_blank", "noopener,noreferrer")
              }}
            >
              Open
            </Button>
          ) : null}
          <Button
            type="button"
            disabled={!canApply}
            onClick={() => {
              onApply(trimmed)
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
