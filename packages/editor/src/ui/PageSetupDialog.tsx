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

import { TWIPS_PER_INCH } from "./chrome-types"
import { ScrubbableNumberInput } from "./ScrubbableNumberInput"

export type PageSetupUnit = "in" | "cm" | "pt"

export type PaperSizeId =
  | "letter"
  | "legal"
  | "tabloid"
  | "a3"
  | "a4"
  | "a5"
  | "executive"
  | "statement"
  | "custom"

/** Portrait width × height in twips. */
export const PAPER_SIZES: Readonly<
  Record<
    Exclude<PaperSizeId, "custom">,
    Readonly<{ width: number; height: number; label: string }>
  >
> = {
  letter: { width: 12_240, height: 15_840, label: "Letter" },
  legal: { width: 12_240, height: 20_160, label: "Legal" },
  tabloid: { width: 15_840, height: 24_480, label: "Tabloid" },
  a3: { width: 16_838, height: 23_811, label: "A3" },
  a4: { width: 11_906, height: 16_838, label: "A4" },
  a5: { width: 8_391, height: 11_906, label: "A5" },
  executive: { width: 10_440, height: 15_120, label: "Executive" },
  statement: { width: 7_920, height: 12_240, label: "Statement" },
}

export type PageSetupOptions = Readonly<{
  pageWidth: number
  pageHeight: number
  orientation: "portrait" | "landscape"
  marginTop: number
  marginRight: number
  marginBottom: number
  marginLeft: number
}>

export type PageSetupDialogProps = Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  initial: Partial<PageSetupOptions>
  onApply: (options: PageSetupOptions) => void
  unit: PageSetupUnit
  onUnitChange: (unit: PageSetupUnit) => void
  /** When provided, "Set as default" writes page setup into editorMetadata. */
  onSetAsDefault?: (options: PageSetupOptions) => void
}>

export function twipsToUnit(twipsValue: number, unit: PageSetupUnit): number {
  if (unit === "pt") return twipsValue / 20
  const inches = twipsValue / TWIPS_PER_INCH
  if (unit === "cm") return inches * 2.54
  return inches
}

export function unitToTwips(value: number, unit: PageSetupUnit): number {
  if (!Number.isFinite(value)) return 0
  if (unit === "pt") return Math.round(value * 20)
  const inches = unit === "cm" ? value / 2.54 : value
  return Math.round(inches * TWIPS_PER_INCH)
}

function matchPaperSize(
  width: number,
  height: number,
  orientation: "portrait" | "landscape"
): PaperSizeId {
  const portraitW = orientation === "landscape" ? height : width
  const portraitH = orientation === "landscape" ? width : height
  for (const [id, size] of Object.entries(PAPER_SIZES) as Array<
    [
      Exclude<PaperSizeId, "custom">,
      (typeof PAPER_SIZES)[Exclude<PaperSizeId, "custom">],
    ]
  >) {
    if (size.width === portraitW && size.height === portraitH) return id
  }
  return "custom"
}

function formatUnitValue(twipsValue: number, unit: PageSetupUnit): string {
  const value = twipsToUnit(twipsValue, unit)
  if (unit === "pt") return String(Math.round(value * 100) / 100)
  return String(Math.round(value * 1000) / 1000)
}

export function PageSetupDialog({
  open,
  onOpenChange,
  initial,
  onApply,
  unit,
  onUnitChange,
  onSetAsDefault,
}: PageSetupDialogProps) {
  const defaults: PageSetupOptions = useMemo(
    () => ({
      pageWidth: initial.pageWidth ?? 12_240,
      pageHeight: initial.pageHeight ?? 15_840,
      orientation: initial.orientation ?? "portrait",
      marginTop: initial.marginTop ?? 1_440,
      marginRight: initial.marginRight ?? 1_440,
      marginBottom: initial.marginBottom ?? 1_440,
      marginLeft: initial.marginLeft ?? 1_440,
    }),
    [initial]
  )

  const [orientation, setOrientation] = useState<"portrait" | "landscape">(
    defaults.orientation
  )
  const [paperSize, setPaperSize] = useState<PaperSizeId>(() =>
    matchPaperSize(
      defaults.pageWidth,
      defaults.pageHeight,
      defaults.orientation
    )
  )
  const [widthTwips, setWidthTwips] = useState(defaults.pageWidth)
  const [heightTwips, setHeightTwips] = useState(defaults.pageHeight)
  const [marginTop, setMarginTop] = useState(defaults.marginTop)
  const [marginRight, setMarginRight] = useState(defaults.marginRight)
  const [marginBottom, setMarginBottom] = useState(defaults.marginBottom)
  const [marginLeft, setMarginLeft] = useState(defaults.marginLeft)
  const fieldId = useId()

  useEffect(() => {
    if (!open) return
    setOrientation(defaults.orientation)
    setWidthTwips(defaults.pageWidth)
    setHeightTwips(defaults.pageHeight)
    setMarginTop(defaults.marginTop)
    setMarginRight(defaults.marginRight)
    setMarginBottom(defaults.marginBottom)
    setMarginLeft(defaults.marginLeft)
    setPaperSize(
      matchPaperSize(
        defaults.pageWidth,
        defaults.pageHeight,
        defaults.orientation
      )
    )
  }, [open, defaults])

  const applyPaperSize = (id: PaperSizeId) => {
    setPaperSize(id)
    if (id === "custom") return
    const size = PAPER_SIZES[id]
    if (orientation === "landscape") {
      setWidthTwips(size.height)
      setHeightTwips(size.width)
    } else {
      setWidthTwips(size.width)
      setHeightTwips(size.height)
    }
  }

  const applyOrientation = (next: "portrait" | "landscape") => {
    if (next === orientation) return
    setOrientation(next)
    setWidthTwips(heightTwips)
    setHeightTwips(widthTwips)
  }

  const buildOptions = (): PageSetupOptions => ({
    pageWidth: widthTwips,
    pageHeight: heightTwips,
    orientation,
    marginTop,
    marginRight,
    marginBottom,
    marginLeft,
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Page setup</DialogTitle>
          <DialogDescription>
            Choose paper size, orientation, and margins for the current section.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="flex items-center justify-between gap-3">
            <Label className="text-muted-foreground">Units</Label>
            <RadioGroup
              value={unit}
              onValueChange={(value) => {
                if (value === "in" || value === "cm" || value === "pt") {
                  onUnitChange(value)
                }
              }}
              className="flex gap-3"
            >
              <Label className="flex items-center gap-1.5 text-sm">
                <RadioGroupItem value="in" />
                in
              </Label>
              <Label className="flex items-center gap-1.5 text-sm">
                <RadioGroupItem value="cm" />
                cm
              </Label>
              <Label className="flex items-center gap-1.5 text-sm">
                <RadioGroupItem value="pt" />
                pt
              </Label>
            </RadioGroup>
          </div>

          <div className="grid gap-2">
            <Label className="text-muted-foreground">Orientation</Label>
            <RadioGroup
              value={orientation}
              onValueChange={(value) => {
                if (value === "portrait" || value === "landscape") {
                  applyOrientation(value)
                }
              }}
              className="flex gap-4"
            >
              <Label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="portrait" />
                Portrait
              </Label>
              <Label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="landscape" />
                Landscape
              </Label>
            </RadioGroup>
          </div>

          <div className="grid gap-2">
            <Label className="text-muted-foreground">Paper size</Label>
            <Select
              items={[
                ...(
                  Object.keys(PAPER_SIZES) as Array<
                    Exclude<PaperSizeId, "custom">
                  >
                ).map((id) => ({ value: id, label: PAPER_SIZES[id].label })),
                { value: "custom", label: "Custom" },
              ]}
              value={paperSize}
              onValueChange={(value) => {
                if (value) applyPaperSize(value as PaperSizeId)
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  Object.keys(PAPER_SIZES) as Array<
                    Exclude<PaperSizeId, "custom">
                  >
                ).map((id) => (
                  <SelectItem key={id} value={id}>
                    {PAPER_SIZES[id].label}
                  </SelectItem>
                ))}
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5 text-sm">
              <Label
                htmlFor={`${fieldId}-width`}
                className="text-muted-foreground"
              >
                Width ({unit})
              </Label>
              <ScrubbableNumberInput
                id={`${fieldId}-width`}
                step="any"
                value={formatUnitValue(widthTwips, unit)}
                scrubMin={unit === "pt" ? 1 : 0.1}
                scrubStep={unit === "pt" ? 1 : 0.1}
                onValueChange={(value) => {
                  setPaperSize("custom")
                  setWidthTwips(unitToTwips(Number(value), unit))
                }}
              />
            </div>
            <div className="grid gap-1.5 text-sm">
              <Label
                htmlFor={`${fieldId}-height`}
                className="text-muted-foreground"
              >
                Height ({unit})
              </Label>
              <ScrubbableNumberInput
                id={`${fieldId}-height`}
                step="any"
                value={formatUnitValue(heightTwips, unit)}
                scrubMin={unit === "pt" ? 1 : 0.1}
                scrubStep={unit === "pt" ? 1 : 0.1}
                onValueChange={(value) => {
                  setPaperSize("custom")
                  setHeightTwips(unitToTwips(Number(value), unit))
                }}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label className="text-muted-foreground">Margins</Label>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ["Top", marginTop, setMarginTop],
                  ["Right", marginRight, setMarginRight],
                  ["Bottom", marginBottom, setMarginBottom],
                  ["Left", marginLeft, setMarginLeft],
                ] as const
              ).map(([label, value, setter]) => (
                <div key={label} className="grid gap-1.5 text-sm">
                  <Label
                    htmlFor={`${fieldId}-margin-${label.toLowerCase()}`}
                    className="text-muted-foreground"
                  >
                    {label} ({unit})
                  </Label>
                  <ScrubbableNumberInput
                    id={`${fieldId}-margin-${label.toLowerCase()}`}
                    step="any"
                    value={formatUnitValue(value, unit)}
                    scrubMin={0}
                    scrubStep={unit === "pt" ? 1 : 0.1}
                    onValueChange={(nextValue) =>
                      setter(unitToTwips(Number(nextValue), unit))
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-wrap gap-2">
          {onSetAsDefault ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => onSetAsDefault(buildOptions())}
            >
              Set as default
            </Button>
          ) : null}
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
