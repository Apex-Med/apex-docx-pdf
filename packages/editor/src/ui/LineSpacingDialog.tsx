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
import {
  RadioGroup,
  RadioGroupItem,
} from "@workspace/ui/components/radio-group"

import { ScrubbableNumberInput } from "./ScrubbableNumberInput"

export const LINE_SPACING_PRESETS = [
  { id: "single", label: "Single", value240ths: 240 },
  { id: "115", label: "1.15", value240ths: 276 },
  { id: "15", label: "1.5", value240ths: 360 },
  { id: "double", label: "Double", value240ths: 480 },
  { id: "custom", label: "Custom", value240ths: null },
] as const

export type LineSpacingPresetId = (typeof LINE_SPACING_PRESETS)[number]["id"]

export type LineSpacingOptions = Readonly<{
  spacingBefore: number
  spacingAfter: number
  lineSpacing: Readonly<{ rule: "auto"; value240ths: number }> | null
}>

export type LineSpacingDialogProps = Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: Partial<{
    spacingBefore: number
    spacingAfter: number
    value240ths: number | null
  }>
  onApply: (options: LineSpacingOptions) => void
}>

function matchPreset(
  value240ths: number | null | undefined
): LineSpacingPresetId {
  if (value240ths == null) return "single"
  const preset = LINE_SPACING_PRESETS.find(
    (entry) => entry.value240ths === value240ths
  )
  return preset?.id ?? "custom"
}

export function LineSpacingDialog({
  open,
  onOpenChange,
  initial,
  onApply,
}: LineSpacingDialogProps) {
  const [preset, setPreset] = useState<LineSpacingPresetId>(() =>
    matchPreset(initial?.value240ths)
  )
  const [custom240ths, setCustom240ths] = useState(
    String(initial?.value240ths ?? 240)
  )
  const [spaceBeforePt, setSpaceBeforePt] = useState(
    String((initial?.spacingBefore ?? 0) / 20)
  )
  const [spaceAfterPt, setSpaceAfterPt] = useState(
    String((initial?.spacingAfter ?? 0) / 20)
  )
  const fieldId = useId()

  useEffect(() => {
    if (!open) return
    setPreset(matchPreset(initial?.value240ths))
    setCustom240ths(String(initial?.value240ths ?? 240))
    setSpaceBeforePt(String((initial?.spacingBefore ?? 0) / 20))
    setSpaceAfterPt(String((initial?.spacingAfter ?? 0) / 20))
  }, [open, initial])

  const buildOptions = (): LineSpacingOptions => {
    const presetEntry = LINE_SPACING_PRESETS.find(
      (entry) => entry.id === preset
    )
    const value240ths =
      preset === "custom"
        ? Math.max(1, Math.round(Number(custom240ths) || 240))
        : (presetEntry?.value240ths ?? 240)
    return {
      spacingBefore: Math.round((Number(spaceBeforePt) || 0) * 20),
      spacingAfter: Math.round((Number(spaceAfterPt) || 0) * 20),
      lineSpacing: { rule: "auto", value240ths },
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Line and paragraph spacing</DialogTitle>
          <DialogDescription>
            Choose a line spacing preset and space before/after the paragraph.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label className="text-muted-foreground">Line spacing</Label>
            <RadioGroup
              value={preset}
              onValueChange={(value) => {
                const next = LINE_SPACING_PRESETS.find(
                  (entry) => entry.id === value
                )
                if (next) setPreset(next.id)
              }}
              className="grid gap-2"
            >
              {LINE_SPACING_PRESETS.map((entry) => (
                <Label
                  key={entry.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <RadioGroupItem value={entry.id} />
                  {entry.label}
                  {entry.value240ths != null ? (
                    <span className="text-muted-foreground">
                      ({entry.value240ths}/240)
                    </span>
                  ) : null}
                </Label>
              ))}
            </RadioGroup>
            {preset === "custom" ? (
              <div className="grid gap-1.5 text-sm">
                <Label
                  htmlFor={`${fieldId}-custom`}
                  className="text-muted-foreground"
                >
                  Custom (240ths)
                </Label>
                <ScrubbableNumberInput
                  id={`${fieldId}-custom`}
                  value={custom240ths}
                  scrubMin={1}
                  scrubStep={1}
                  onValueChange={setCustom240ths}
                />
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5 text-sm">
              <Label
                htmlFor={`${fieldId}-before`}
                className="text-muted-foreground"
              >
                Space before (pt)
              </Label>
              <ScrubbableNumberInput
                id={`${fieldId}-before`}
                step="any"
                value={spaceBeforePt}
                scrubMin={0}
                scrubStep={0.5}
                onValueChange={setSpaceBeforePt}
              />
            </div>
            <div className="grid gap-1.5 text-sm">
              <Label
                htmlFor={`${fieldId}-after`}
                className="text-muted-foreground"
              >
                Space after (pt)
              </Label>
              <ScrubbableNumberInput
                id={`${fieldId}-after`}
                step="any"
                value={spaceAfterPt}
                scrubMin={0}
                scrubStep={0.5}
                onValueChange={setSpaceAfterPt}
              />
            </div>
          </div>
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
              onApply(buildOptions())
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
