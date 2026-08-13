import { useEffect, useId, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  RadioGroup,
  RadioGroupItem,
} from "@workspace/ui/components/radio-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"

import type { CellBorderSpec } from "../commands"

export type TablePropertiesOptions = Readonly<{
  alignment: "left" | "center" | "right"
  columnWidths: readonly number[]
  rowHeight: number | null
  cellPadding: Readonly<{
    top: number
    right: number
    bottom: number
    left: number
  }>
  borderStyle: CellBorderSpec["style"]
  borderColor: string
  borderWidth: number
  applyBordersTo: "all" | "top" | "right" | "bottom" | "left"
  cellShading: string | null
  cellVerticalAlignment: "top" | "center" | "bottom"
  headerRowRepeat: boolean
  allowBreakAcrossPages: boolean
}>

export type TablePropertiesDialogProps = Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: Partial<TablePropertiesOptions>
  onApply: (options: TablePropertiesOptions) => void
}>

const DEFAULT_PADDING = { top: 0, right: 108, bottom: 0, left: 108 }

export function TablePropertiesDialog({
  open,
  onOpenChange,
  initial,
  onApply,
}: TablePropertiesDialogProps) {
  const [alignment, setAlignment] = useState<"left" | "center" | "right">(
    initial?.alignment ?? "left"
  )
  const [columnWidthsText, setColumnWidthsText] = useState(
    (initial?.columnWidths ?? []).join(", ")
  )
  const [rowHeight, setRowHeight] = useState(
    initial?.rowHeight != null ? String(initial.rowHeight) : ""
  )
  const [padTop, setPadTop] = useState(
    String(initial?.cellPadding?.top ?? DEFAULT_PADDING.top)
  )
  const [padRight, setPadRight] = useState(
    String(initial?.cellPadding?.right ?? DEFAULT_PADDING.right)
  )
  const [padBottom, setPadBottom] = useState(
    String(initial?.cellPadding?.bottom ?? DEFAULT_PADDING.bottom)
  )
  const [padLeft, setPadLeft] = useState(
    String(initial?.cellPadding?.left ?? DEFAULT_PADDING.left)
  )
  const [borderStyle, setBorderStyle] = useState<CellBorderSpec["style"]>(
    initial?.borderStyle ?? "single"
  )
  const [borderColor, setBorderColor] = useState(
    initial?.borderColor ?? "#000000"
  )
  const [borderWidth, setBorderWidth] = useState(
    String(initial?.borderWidth ?? 15)
  )
  const [applyBordersTo, setApplyBordersTo] = useState<
    TablePropertiesOptions["applyBordersTo"]
  >(initial?.applyBordersTo ?? "all")
  const [cellShading, setCellShading] = useState(initial?.cellShading ?? "")
  const [cellVerticalAlignment, setCellVerticalAlignment] = useState<
    TablePropertiesOptions["cellVerticalAlignment"]
  >(initial?.cellVerticalAlignment ?? "top")
  const [headerRowRepeat, setHeaderRowRepeat] = useState(
    initial?.headerRowRepeat ?? false
  )
  const [allowBreakAcrossPages, setAllowBreakAcrossPages] = useState(
    initial?.allowBreakAcrossPages ?? true
  )
  const fieldId = useId()

  useEffect(() => {
    if (!open) return
    setAlignment(initial?.alignment ?? "left")
    setColumnWidthsText((initial?.columnWidths ?? []).join(", "))
    setRowHeight(initial?.rowHeight != null ? String(initial.rowHeight) : "")
    setPadTop(String(initial?.cellPadding?.top ?? DEFAULT_PADDING.top))
    setPadRight(String(initial?.cellPadding?.right ?? DEFAULT_PADDING.right))
    setPadBottom(String(initial?.cellPadding?.bottom ?? DEFAULT_PADDING.bottom))
    setPadLeft(String(initial?.cellPadding?.left ?? DEFAULT_PADDING.left))
    setBorderStyle(initial?.borderStyle ?? "single")
    setBorderColor(initial?.borderColor ?? "#000000")
    setBorderWidth(String(initial?.borderWidth ?? 15))
    setApplyBordersTo(initial?.applyBordersTo ?? "all")
    setCellShading(initial?.cellShading ?? "")
    setCellVerticalAlignment(initial?.cellVerticalAlignment ?? "top")
    setHeaderRowRepeat(initial?.headerRowRepeat ?? false)
    setAllowBreakAcrossPages(initial?.allowBreakAcrossPages ?? true)
  }, [open, initial])

  const buildOptions = (): TablePropertiesOptions => {
    const columnWidths = columnWidthsText
      .split(/[,\s]+/)
      .map((part) => Number(part.trim()))
      .filter((value) => Number.isFinite(value) && value > 0)
    const heightValue = Number(rowHeight)
    return {
      alignment,
      columnWidths,
      rowHeight:
        rowHeight.trim().length > 0 && Number.isFinite(heightValue)
          ? Math.round(heightValue)
          : null,
      cellPadding: {
        top: Math.round(Number(padTop) || 0),
        right: Math.round(Number(padRight) || 0),
        bottom: Math.round(Number(padBottom) || 0),
        left: Math.round(Number(padLeft) || 0),
      },
      borderStyle,
      borderColor,
      borderWidth: Math.round(Number(borderWidth) || 15),
      applyBordersTo,
      cellShading: cellShading.trim().length > 0 ? cellShading.trim() : null,
      cellVerticalAlignment,
      headerRowRepeat,
      allowBreakAcrossPages,
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="shrink-0 border-b border-border px-6 py-4 pr-14">
          <SheetTitle>Table properties</SheetTitle>
          <SheetDescription>
            Adjust alignment, row height, cell padding, borders, and shading.
          </SheetDescription>
        </SheetHeader>

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Alignment</Label>
              <RadioGroup
                value={alignment}
                onValueChange={(value) => {
                  if (
                    value === "left" ||
                    value === "center" ||
                    value === "right"
                  ) {
                    setAlignment(value)
                  }
                }}
                className="flex gap-4"
              >
                <div className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="left" aria-label="Align table left" />
                  Left
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="center" aria-label="Center table" />
                  Center
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <RadioGroupItem
                    value="right"
                    aria-label="Align table right"
                  />
                  Right
                </div>
              </RadioGroup>
            </div>

            <div className="grid gap-1.5 text-sm">
              <Label
                htmlFor={`${fieldId}-widths`}
                className="text-muted-foreground"
              >
                Column widths (twips, comma-separated)
              </Label>
              <Input
                id={`${fieldId}-widths`}
                value={columnWidthsText}
                onChange={(event) => setColumnWidthsText(event.target.value)}
                placeholder="2880, 2880"
              />
            </div>

            <div className="grid gap-1.5 text-sm">
              <Label
                htmlFor={`${fieldId}-row-height`}
                className="text-muted-foreground"
              >
                Row height (twips)
              </Label>
              <Input
                id={`${fieldId}-row-height`}
                type="number"
                value={rowHeight}
                onChange={(event) => setRowHeight(event.target.value)}
                placeholder="Auto"
              />
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">
                Cell padding (twips)
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5 text-sm">
                  <Label
                    htmlFor={`${fieldId}-pad-top`}
                    className="text-muted-foreground"
                  >
                    Top
                  </Label>
                  <Input
                    id={`${fieldId}-pad-top`}
                    type="number"
                    value={padTop}
                    onChange={(event) => setPadTop(event.target.value)}
                  />
                </div>
                <div className="grid gap-1.5 text-sm">
                  <Label
                    htmlFor={`${fieldId}-pad-right`}
                    className="text-muted-foreground"
                  >
                    Right
                  </Label>
                  <Input
                    id={`${fieldId}-pad-right`}
                    type="number"
                    value={padRight}
                    onChange={(event) => setPadRight(event.target.value)}
                  />
                </div>
                <div className="grid gap-1.5 text-sm">
                  <Label
                    htmlFor={`${fieldId}-pad-bottom`}
                    className="text-muted-foreground"
                  >
                    Bottom
                  </Label>
                  <Input
                    id={`${fieldId}-pad-bottom`}
                    type="number"
                    value={padBottom}
                    onChange={(event) => setPadBottom(event.target.value)}
                  />
                </div>
                <div className="grid gap-1.5 text-sm">
                  <Label
                    htmlFor={`${fieldId}-pad-left`}
                    className="text-muted-foreground"
                  >
                    Left
                  </Label>
                  <Input
                    id={`${fieldId}-pad-left`}
                    type="number"
                    value={padLeft}
                    onChange={(event) => setPadLeft(event.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-3 rounded-none border border-border p-3">
              <Label className="text-muted-foreground">Borders</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5 text-sm">
                  <Label
                    htmlFor={`${fieldId}-border-side`}
                    className="text-muted-foreground"
                  >
                    Side
                  </Label>
                  <Select
                    value={applyBordersTo}
                    onValueChange={(value) => {
                      if (
                        value === "all" ||
                        value === "top" ||
                        value === "right" ||
                        value === "bottom" ||
                        value === "left"
                      ) {
                        setApplyBordersTo(value)
                      }
                    }}
                  >
                    <SelectTrigger
                      id={`${fieldId}-border-side`}
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="top">Top</SelectItem>
                        <SelectItem value="right">Right</SelectItem>
                        <SelectItem value="bottom">Bottom</SelectItem>
                        <SelectItem value="left">Left</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5 text-sm">
                  <Label
                    htmlFor={`${fieldId}-border-style`}
                    className="text-muted-foreground"
                  >
                    Style
                  </Label>
                  <Select
                    value={borderStyle}
                    onValueChange={(value) => {
                      if (
                        value === "none" ||
                        value === "single" ||
                        value === "double" ||
                        value === "dotted" ||
                        value === "dashed"
                      ) {
                        setBorderStyle(value)
                      }
                    }}
                  >
                    <SelectTrigger
                      id={`${fieldId}-border-style`}
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="single">Single</SelectItem>
                        <SelectItem value="double">Double</SelectItem>
                        <SelectItem value="dotted">Dotted</SelectItem>
                        <SelectItem value="dashed">Dashed</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5 text-sm">
                  <Label
                    htmlFor={`${fieldId}-border-color`}
                    className="text-muted-foreground"
                  >
                    Color
                  </Label>
                  <Input
                    id={`${fieldId}-border-color`}
                    type="color"
                    value={borderColor}
                    onChange={(event) => setBorderColor(event.target.value)}
                  />
                </div>
                <div className="grid gap-1.5 text-sm">
                  <Label
                    htmlFor={`${fieldId}-border-width`}
                    className="text-muted-foreground"
                  >
                    Width (twips)
                  </Label>
                  <Input
                    id={`${fieldId}-border-width`}
                    type="number"
                    value={borderWidth}
                    onChange={(event) => setBorderWidth(event.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-1.5 text-sm">
              <Label
                htmlFor={`${fieldId}-cell-shading`}
                className="text-muted-foreground"
              >
                Cell shading
              </Label>
              <div className="flex gap-2">
                <Input
                  id={`${fieldId}-cell-shading`}
                  type="color"
                  value={cellShading || "#ffffff"}
                  onChange={(event) => setCellShading(event.target.value)}
                  className="w-14"
                />
                <Input
                  value={cellShading}
                  onChange={(event) => setCellShading(event.target.value)}
                  placeholder="None"
                />
              </div>
            </div>

            <div className="grid gap-1.5 text-sm">
              <Label
                htmlFor={`${fieldId}-vertical-align`}
                className="text-muted-foreground"
              >
                Cell vertical alignment
              </Label>
              <Select
                value={cellVerticalAlignment}
                onValueChange={(value) => {
                  if (
                    value === "top" ||
                    value === "center" ||
                    value === "bottom"
                  ) {
                    setCellVerticalAlignment(value)
                  }
                }}
              >
                <SelectTrigger
                  id={`${fieldId}-vertical-align`}
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="top">Top</SelectItem>
                    <SelectItem value="center">Center</SelectItem>
                    <SelectItem value="bottom">Bottom</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <Checkbox
                id={`${fieldId}-repeat-header`}
                checked={headerRowRepeat}
                onCheckedChange={(checked) =>
                  setHeaderRowRepeat(checked === true)
                }
              />
              <Label htmlFor={`${fieldId}-repeat-header`}>
                Repeat header row
              </Label>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <Checkbox
                id={`${fieldId}-break-pages`}
                checked={allowBreakAcrossPages}
                onCheckedChange={(checked) =>
                  setAllowBreakAcrossPages(checked === true)
                }
              />
              <Label htmlFor={`${fieldId}-break-pages`}>
                Allow row to break across pages
              </Label>
            </div>
          </div>
        </div>

        <SheetFooter className="shrink-0 border-t border-border px-6 py-4 sm:flex-row sm:justify-end">
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
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
