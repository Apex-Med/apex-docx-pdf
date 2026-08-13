import { useEffect, useId, useState } from "react"
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
import { Input } from "@workspace/ui/components/input"
import {
  RadioGroup,
  RadioGroupItem,
} from "@workspace/ui/components/radio-group"
import { Switch } from "@workspace/ui/components/switch"

export type ColumnsDialogProps = Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  initialCount?: number
  initialSeparator?: boolean
  initialEqualWidth?: boolean
  initialSpace?: number
  initialWidths?: readonly number[] | null
  onApply: (options: {
    count: number
    equalWidth: boolean
    space: number
    separator: boolean
    widths: readonly number[] | null
  }) => void
}>

export function ColumnsDialog({
  open,
  onOpenChange,
  initialCount = 1,
  initialSeparator = false,
  initialEqualWidth = true,
  initialSpace = 720,
  initialWidths = null,
  onApply,
}: ColumnsDialogProps) {
  const [count, setCount] = useState(
    String(Math.min(12, Math.max(1, initialCount)))
  )
  const [separator, setSeparator] = useState(initialSeparator)
  const [equalWidth, setEqualWidth] = useState(initialEqualWidth)
  const [space, setSpace] = useState(String(initialSpace))
  const [widths, setWidths] = useState((initialWidths ?? []).join(", "))
  const countId = useId()
  const equalWidthId = useId()
  const spaceId = useId()
  const widthsId = useId()
  const separatorId = useId()

  useEffect(() => {
    if (!open) return
    setCount(String(Math.min(12, Math.max(1, initialCount))))
    setSeparator(initialSeparator)
    setEqualWidth(initialEqualWidth)
    setSpace(String(initialSpace))
    setWidths((initialWidths ?? []).join(", "))
  }, [
    open,
    initialCount,
    initialEqualWidth,
    initialSeparator,
    initialSpace,
    initialWidths,
  ])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Columns</DialogTitle>
          <DialogDescription>
            Split the current section into one, two, or three equal columns.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Number of columns</Label>
            <RadioGroup
              value={count}
              onValueChange={(value) => {
                if (value) setCount(value)
              }}
            >
              <div className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="1" aria-label="One column" /> One
              </div>
              <div className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="2" aria-label="Two columns" /> Two
              </div>
              <div className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="3" aria-label="Three columns" /> Three
              </div>
            </RadioGroup>
            <div className="grid gap-1.5 text-sm">
              <Label htmlFor={countId} className="text-muted-foreground">
                Custom count (1–12)
              </Label>
              <Input
                id={countId}
                type="number"
                min={1}
                max={12}
                value={count}
                onChange={(event) =>
                  setCount(
                    String(
                      Math.min(12, Math.max(1, Number(event.target.value) || 1))
                    )
                  )
                }
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 text-sm">
            <Label htmlFor={equalWidthId}>Equal column widths</Label>
            <Switch
              id={equalWidthId}
              checked={equalWidth}
              onCheckedChange={setEqualWidth}
            />
          </div>
          <div className="grid gap-1.5 text-sm">
            <Label htmlFor={spaceId} className="text-muted-foreground">
              Column spacing (twips)
            </Label>
            <Input
              id={spaceId}
              type="number"
              min={0}
              value={space}
              onChange={(event) => setSpace(event.target.value)}
            />
          </div>
          {!equalWidth ? (
            <div className="grid gap-1.5 text-sm">
              <Label htmlFor={widthsId} className="text-muted-foreground">
                Column widths (twips, comma-separated)
              </Label>
              <Input
                id={widthsId}
                value={widths}
                onChange={(event) => setWidths(event.target.value)}
                placeholder="3600, 2400"
              />
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3 text-sm">
            <Label htmlFor={separatorId}>Line between columns</Label>
            <Switch
              id={separatorId}
              checked={separator}
              onCheckedChange={setSeparator}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            onClick={() => {
              const parsedWidths = widths
                .split(/[\s,]+/u)
                .map(Number)
                .filter((value) => Number.isFinite(value) && value > 0)
              onApply({
                count: Number(count),
                equalWidth,
                space: Math.max(0, Number(space) || 0),
                separator,
                widths:
                  equalWidth || parsedWidths.length === 0 ? null : parsedWidths,
              })
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
