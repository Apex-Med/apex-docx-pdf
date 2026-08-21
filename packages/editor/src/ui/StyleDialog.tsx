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
import { useEffect, useId, useState, type ReactNode } from "react"

export type StyleDialogProps = Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  suggestedName?: string
  onCreate: (name: string) => void
}>

export function StyleDialog({
  open,
  onOpenChange,
  suggestedName = "Custom style",
  onCreate,
}: StyleDialogProps): ReactNode {
  const inputId = useId()
  const [name, setName] = useState(suggestedName)

  useEffect(() => {
    if (open) setName(suggestedName)
  }, [open, suggestedName])

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onCreate(trimmed)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Create a paragraph style</DialogTitle>
          <DialogDescription>
            Save the selected paragraph and character formatting as a reusable
            DOCX style.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor={inputId}>Style name</Label>
          <Input
            id={inputId}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return
              if (event.key === "Enter") {
                event.preventDefault()
                submit()
              }
            }}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={!name.trim()} onClick={submit}>
            Create style
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
