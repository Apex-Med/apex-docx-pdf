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

export type ImageOptionsProps = Readonly<{
  open: boolean
  initialAltText?: string
  onOpenChange: (open: boolean) => void
  onApply: (altText: string) => void
}>

/** Minimal image options dialog — alt text editing. */
export function ImageOptions({
  open,
  initialAltText,
  onOpenChange,
  onApply,
}: ImageOptionsProps) {
  const [altText, setAltText] = useState(initialAltText ?? "")

  useEffect(() => {
    if (open) setAltText(initialAltText ?? "")
  }, [open, initialAltText])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Image options</DialogTitle>
          <DialogDescription>
            Set alternative text for accessibility and DOCX export.
          </DialogDescription>
        </DialogHeader>
        <label className="grid gap-1.5 text-sm">
          <span className="text-muted-foreground">Alt text</span>
          <Input
            value={altText}
            onChange={(event) => setAltText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                onApply(altText)
                onOpenChange(false)
              }
            }}
            placeholder="Describe the image"
            autoFocus
          />
        </label>
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
              onApply(altText)
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
