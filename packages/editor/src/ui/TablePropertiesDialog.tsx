import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import {
  twips,
  type TableColumnSizing,
  type TableSizing,
  type TableWidthMode,
  type Twip,
} from "@apexmed/core"
import {
  ArrowDown01Icon,
  Cancel01Icon,
  HorizontalResizeIcon,
  VerticalResizeIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

import type {
  CellBorderSpec,
  SelectedCellBorderTarget,
  SelectedTableCellBorders,
  SelectedTableCellGrid,
} from "../commands"
import {
  tableSizingConstraintMessage,
  withTableWidthMode,
} from "../schema/table-sizing"
import {
  ScrubbableNumberDisclosure,
  ScrubbableNumberInput,
  ScrubbableNumberLabel,
} from "./ScrubbableNumberInput"

type BorderTarget = Exclude<SelectedCellBorderTarget, "all">

export type TablePropertiesOptions = Readonly<{
  columnWidths: readonly number[]
  rowHeight: number | null
  cellPadding: Readonly<{
    top: number
    right: number
    bottom: number
    left: number
  }>
  cellShading: string | null
  headerRowRepeat: boolean
  allowBreakAcrossPages: boolean
  tableSizing: TableSizing
}>

export type TablePropertiesChange =
  | Readonly<{ type: "columnWidths"; value: readonly number[] }>
  | Readonly<{ type: "rowHeight"; value: number | null }>
  | Readonly<{
    type: "cellPadding"
    value: TablePropertiesOptions["cellPadding"]
  }>
  | Readonly<{ type: "cellShading"; value: string | null }>
  | Readonly<{
    type: "cellBorder"
    target: SelectedCellBorderTarget
    value: CellBorderSpec | null
  }>
  | Readonly<{ type: "headerRowRepeat"; value: boolean }>
  | Readonly<{ type: "allowBreakAcrossPages"; value: boolean }>
  | Readonly<{ type: "tableSizing"; value: TableSizing }>

export type TablePropertiesDialogProps = Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  selectionGrid: SelectedTableCellGrid
  initialBorders?: SelectedTableCellBorders
  initial?: Partial<TablePropertiesOptions>
  selectedColumns?: readonly number[]
  importedFixed?: boolean
  onSelectTable?: () => void
  onSelectColumn?: () => void
  onChange: (change: TablePropertiesChange) => void
}>

const DEFAULT_PADDING = { top: 0, right: 108, bottom: 0, left: 108 }
const OUTSIDE_BORDER_TARGETS: readonly BorderTarget[] = [
  "top",
  "right",
  "bottom",
  "left",
]
const DEFAULT_BORDER: CellBorderSpec = {
  style: "single",
  color: "#000000",
  width: 15,
}
const BORDER_STYLE_ITEMS = [
  { value: "single", label: "Line" },
  { value: "double", label: "Double line" },
  { value: "dotted", label: "Dotted" },
  { value: "dashed", label: "Dash" },
] as const
const CELL_GRID_KEYS = {
  "1x1": ["cell"],
  "1x2": ["left", "right"],
  "2x1": ["top", "bottom"],
  "2x2": ["top-left", "top-right", "bottom-left", "bottom-right"],
} as const

function OptionsSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [expanded, setExpanded] = useState(defaultOpen)
  return (
    <section className="apex-table-options__section">
      <button
        type="button"
        className="apex-table-options__section-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          strokeWidth={2}
          className="apex-table-options__chevron"
        />
        {title}
      </button>
      {expanded ? (
        <div className="apex-table-options__section-body">{children}</div>
      ) : null}
    </section>
  )
}

function points(twipValue: number | null | undefined): string {
  return twipValue == null ? "" : String(Number((twipValue / 20).toFixed(2)))
}

function SizingModeControl<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string
  value: T
  options: readonly Readonly<{ value: T; label: string }>[]
  disabled?: Partial<Record<T, string>>
  onChange: (value: T) => void
}) {
  return (
    <fieldset className="apex-table-sizing__modes">
      <legend className="sr-only">{label}</legend>
      {options.map((option) => {
        const disabledReason = disabled?.[option.value]
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            disabled={Boolean(disabledReason)}
            title={disabledReason}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        )
      })}
    </fieldset>
  )
}

function PointInput({
  id,
  label,
  value,
  placeholder,
  onChange,
}: {
  id: string
  label: string
  value: Twip | null | undefined
  placeholder?: string
  onChange: (value: Twip | null) => void
}) {
  const [text, setText] = useState(points(value))
  useEffect(() => setText(points(value)), [value])
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-muted-foreground">
        {label}
      </Label>
      <div className="apex-table-sizing__number">
        <Input
          id={id}
          type="number"
          min="1"
          step="1"
          inputMode="decimal"
          value={text}
          placeholder={placeholder}
          onChange={(event) => {
            const next = event.target.value
            setText(next)
            if (next === "") {
              onChange(null)
              return
            }
            const numeric = Number(next)
            if (Number.isFinite(numeric) && numeric > 0) {
              onChange(twips(Math.round(numeric * 20)))
            }
          }}
        />
        <span aria-hidden="true">pt</span>
      </div>
    </div>
  )
}

function BorderToggle({
  target,
  active,
  spec,
  onToggle,
  onSpecChange,
}: {
  target: BorderTarget
  active: boolean
  spec: CellBorderSpec
  onToggle: () => void
  onSpecChange: (spec: CellBorderSpec) => void
}) {
  const [open, setOpen] = useState(false)
  const [widthText, setWidthText] = useState(String(spec.width))
  const contextOpenRef = useRef(false)
  const widthId = useId()
  const colorId = useId()
  const targetLabel =
    target === "insideHorizontal"
      ? "middle horizontal"
      : target === "insideVertical"
        ? "middle vertical"
        : target
  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen || contextOpenRef.current) setOpen(nextOpen)
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            className="apex-cell-border__edge"
            data-target={target}
            aria-label={`Toggle ${targetLabel} cell border`}
            aria-pressed={active}
            title={`Toggle ${targetLabel} border. Right-click for border options.`}
          />
        }
        onClick={(event) => {
          event.preventDefault()
          onToggle()
        }}
        onContextMenu={(event) => {
          event.preventDefault()
          contextOpenRef.current = true
          setOpen(true)
          queueMicrotask(() => {
            contextOpenRef.current = false
          })
        }}
      />
      <PopoverContent side="left" align="center" className="w-60 gap-3">
        <div>
          <p className="text-sm font-medium capitalize">{targetLabel} border</p>
          <p className="text-xs text-muted-foreground">
            Changes apply immediately.
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-muted-foreground">Line type</Label>
          <Select
            items={BORDER_STYLE_ITEMS}
            value={spec.style === "none" ? "single" : spec.style}
            onValueChange={(value) => {
              if (
                value === "single" ||
                value === "double" ||
                value === "dotted" ||
                value === "dashed"
              ) {
                onSpecChange({ ...spec, style: value })
              }
            }}
          >
            <SelectTrigger
              className="w-full"
              aria-label={`${targetLabel} border line type`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BORDER_STYLE_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-[1fr_5rem] gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor={colorId} className="text-muted-foreground">
              Color
            </Label>
            <Input
              id={colorId}
              type="color"
              value={spec.color}
              onChange={(event) =>
                onSpecChange({ ...spec, color: event.target.value })
              }
            />
          </div>
          <div className="grid gap-1.5">
            <ScrubbableNumberLabel
              htmlFor={widthId}
              value={Number(widthText) || spec.width}
              min={1}
              onChange={(width) => {
                setWidthText(String(width))
                onSpecChange({ ...spec, width })
              }}
              className="text-muted-foreground"
            >
              Width
            </ScrubbableNumberLabel>
            <ScrubbableNumberInput
              id={widthId}
              min={1}
              value={widthText}
              scrubValue={Number(widthText) || spec.width}
              scrubMin={1}
              scrubStep={1}
              onValueChange={(value) => {
                setWidthText(value)
                const width = Number(value)
                if (value !== "" && Number.isFinite(width) && width > 0) {
                  onSpecChange({ ...spec, width: Math.round(width) })
                }
              }}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function TablePropertiesDialog({
  open,
  onOpenChange,
  selectionGrid,
  initialBorders,
  initial,
  selectedColumns = [],
  importedFixed = false,
  onSelectTable,
  onSelectColumn,
  onChange,
}: TablePropertiesDialogProps) {
  const [tableSizing, setTableSizingState] = useState<TableSizing | null>(
    initial?.tableSizing ?? null
  )
  const [sizingError, setSizingError] = useState<string | null>(null)
  const [rowHeight, setRowHeight] = useState(
    initial?.rowHeight != null ? String(initial.rowHeight) : ""
  )
  const initialPadding = { ...DEFAULT_PADDING, ...initial?.cellPadding }
  const [paddingText, setPaddingText] = useState({
    top: String(initialPadding.top),
    right: String(initialPadding.right),
    bottom: String(initialPadding.bottom),
    left: String(initialPadding.left),
  })
  const [paddingExpanded, setPaddingExpanded] = useState(false)
  const [cellShading, setCellShading] = useState(initial?.cellShading ?? "")
  const [headerRowRepeat, setHeaderRowRepeat] = useState(
    initial?.headerRowRepeat ?? false
  )
  const [allowBreakAcrossPages, setAllowBreakAcrossPages] = useState(
    initial?.allowBreakAcrossPages ?? true
  )
  const [activeBorders, setActiveBorders] = useState<
    Record<BorderTarget, boolean>
  >({
    top: initialBorders?.top !== null,
    right: initialBorders?.right !== null,
    bottom: initialBorders?.bottom !== null,
    left: initialBorders?.left !== null,
    insideHorizontal: initialBorders?.insideHorizontal !== null,
    insideVertical: initialBorders?.insideVertical !== null,
  })
  const [borderSpecs, setBorderSpecs] = useState<
    Record<BorderTarget, CellBorderSpec>
  >({
    top: initialBorders?.top ?? DEFAULT_BORDER,
    right: initialBorders?.right ?? DEFAULT_BORDER,
    bottom: initialBorders?.bottom ?? DEFAULT_BORDER,
    left: initialBorders?.left ?? DEFAULT_BORDER,
    insideHorizontal: initialBorders?.insideHorizontal ?? DEFAULT_BORDER,
    insideVertical: initialBorders?.insideVertical ?? DEFAULT_BORDER,
  })
  const fieldId = useId()

  if (!open) return null

  const applySizing = (next: TableSizing) => {
    const error = tableSizingConstraintMessage(next)
    if (error) {
      setSizingError(error)
      return
    }
    setSizingError(null)
    setTableSizingState(next)
    onChange({ type: "tableSizing", value: next })
  }

  const selectedColumn =
    selectedColumns.length === 1 ? selectedColumns[0] : undefined
  const selectedPolicy =
    selectedColumn === undefined
      ? undefined
      : tableSizing?.columns[selectedColumn]
  const fillCount =
    tableSizing?.columns.filter((column) => column.mode === "fill").length ?? 0
  const updateColumn = (patch: Partial<TableColumnSizing>) => {
    if (!tableSizing || selectedColumn === undefined) return
    let mode = tableSizing.mode
    const columns = tableSizing.columns.map((column, index) =>
      index === selectedColumn ? { ...column, ...patch } : column
    )
    if (mode === "hug" && columns.some((column) => column.mode === "fill")) {
      mode = "fill"
    }
    applySizing({ ...tableSizing, mode, columns })
  }

  const updatePaddingSides = (
    sides: readonly (keyof TablePropertiesOptions["cellPadding"])[],
    value: string
  ) => {
    const nextText = { ...paddingText }
    for (const side of sides) nextText[side] = value
    setPaddingText(nextText)
    if (value.trim() === "") return
    const numericValue = Number(value)
    if (!Number.isFinite(numericValue)) return
    const next = {
      top: Math.round(Number(nextText.top) || 0),
      right: Math.round(Number(nextText.right) || 0),
      bottom: Math.round(Number(nextText.bottom) || 0),
      left: Math.round(Number(nextText.left) || 0),
    }
    onChange({ type: "cellPadding", value: next })
  }

  const updatePadding = (
    side: keyof TablePropertiesOptions["cellPadding"],
    value: string
  ) => updatePaddingSides([side], value)

  const horizontalPaddingText =
    paddingText.left === paddingText.right ? paddingText.left : ""
  const verticalPaddingText =
    paddingText.top === paddingText.bottom ? paddingText.top : ""
  const horizontalPaddingValue =
    (Number(paddingText.left) + Number(paddingText.right)) / 2 || 0
  const verticalPaddingValue =
    (Number(paddingText.top) + Number(paddingText.bottom)) / 2 || 0
  const paddingDetailsId = `${fieldId}-padding-details`

  const updateBorder = (target: BorderTarget, spec: CellBorderSpec | null) => {
    setActiveBorders((current) => ({ ...current, [target]: spec !== null }))
    if (spec) setBorderSpecs((current) => ({ ...current, [target]: spec }))
    onChange({ type: "cellBorder", target, value: spec })
  }

  const borderTargets: BorderTarget[] = [
    ...OUTSIDE_BORDER_TARGETS,
    ...(selectionGrid.rows > 1 ? (["insideHorizontal"] as const) : []),
    ...(selectionGrid.columns > 1 ? (["insideVertical"] as const) : []),
  ]
  const allBordersActive = borderTargets.every(
    (target) => activeBorders[target]
  )

  return (
    <aside className="apex-table-options" aria-label="Table options">
      <header className="apex-table-options__header">
        <div>
          <h2 className="apex-table-options__title">Table options</h2>
          <p className="apex-table-options__subtitle">
            Changes save as you edit
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Close table options"
          onClick={() => onOpenChange(false)}
        >
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
        </Button>
      </header>

      <div className="apex-table-options__body">
        {tableSizing ? (
          <fieldset className="apex-table-sizing__scope">
            <legend className="sr-only">Table selection</legend>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={onSelectTable}
            >
              Table
            </button>
            <span aria-hidden="true">/</span>
            <button
              type="button"
              disabled={selectedColumn === undefined}
              onMouseDown={(event) => event.preventDefault()}
              onClick={onSelectColumn}
            >
              {selectedColumn === undefined
                ? "Select one column"
                : `Column ${selectedColumn + 1}`}
            </button>
          </fieldset>
        ) : null}
        {tableSizing ? (
          <OptionsSection title="Table">
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label className="text-muted-foreground">Width</Label>
                <SizingModeControl<TableWidthMode>
                  label="Table width"
                  value={tableSizing.mode}
                  options={[
                    { value: "fixed", label: "Fixed" },
                    { value: "hug", label: "Hug" },
                    { value: "fill", label: "Fill" },
                  ]}
                  onChange={(mode) =>
                    applySizing(withTableWidthMode(tableSizing, mode))
                  }
                />
              </div>
              {tableSizing.mode === "fixed" ? (
                <PointInput
                  id={`${fieldId}-table-width`}
                  label="Fixed width"
                  value={tableSizing.width}
                  onChange={(value) => {
                    if (value !== null) {
                      applySizing({ ...tableSizing, width: value })
                    }
                  }}
                />
              ) : null}
              {importedFixed ? (
                <p className="apex-table-sizing__hint">
                  Imported fixed grid. Existing column widths stay unchanged
                  until you choose a responsive sizing mode.
                </p>
              ) : null}
              <p className="apex-table-sizing__hint">
                Fill uses the page or section column width. Hug follows the
                table&apos;s widest cell content.
              </p>
            </div>
          </OptionsSection>
        ) : null}

        {tableSizing ? (
          <OptionsSection
            title={
              selectedColumn === undefined
                ? "Column"
                : `Column ${selectedColumn + 1}`
            }
          >
            {selectedPolicy && selectedColumn !== undefined ? (
              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-muted-foreground">Width</Label>
                  <SizingModeControl<TableColumnSizing["mode"]>
                    label={`Column ${selectedColumn + 1} width`}
                    value={selectedPolicy.mode}
                    options={[
                      { value: "fixed", label: "Fixed" },
                      { value: "hug", label: "Hug" },
                      { value: "fill", label: "Fill" },
                    ]}
                    disabled={
                      tableSizing.mode !== "hug" &&
                        selectedPolicy.mode === "fill" &&
                        fillCount === 1
                        ? {
                          fixed: "At least one column must remain Fill.",
                          hug: "At least one column must remain Fill.",
                        }
                        : undefined
                    }
                    onChange={(mode) => updateColumn({ mode })}
                  />
                </div>
                {selectedPolicy.mode === "fixed" ? (
                  <PointInput
                    id={`${fieldId}-column-width`}
                    label="Fixed width"
                    value={selectedPolicy.width}
                    onChange={(value) => {
                      if (value !== null) updateColumn({ width: value })
                    }}
                  />
                ) : null}
                <div className="flex items-center gap-2 text-sm">
                  <Checkbox
                    id={`${fieldId}-multiline`}
                    checked={selectedPolicy.allowMultiline}
                    onCheckedChange={(checked) =>
                      updateColumn({
                        allowMultiline: checked === true,
                        ...(checked === true
                          ? {}
                          : { minWidth: null, maxWidth: null }),
                      })
                    }
                  />
                  <Label htmlFor={`${fieldId}-multiline`}>
                    Allow multiline text
                  </Label>
                </div>
                {selectedPolicy.allowMultiline ? (
                  <div className="grid grid-cols-2 gap-3">
                    <PointInput
                      id={`${fieldId}-column-min`}
                      label="Min width"
                      value={selectedPolicy.minWidth}
                      placeholder="None"
                      onChange={(minWidth) => updateColumn({ minWidth })}
                    />
                    <PointInput
                      id={`${fieldId}-column-max`}
                      label="Max width"
                      value={selectedPolicy.maxWidth}
                      placeholder="None"
                      onChange={(maxWidth) => updateColumn({ maxWidth })}
                    />
                  </div>
                ) : (
                  <p className="apex-table-sizing__hint">
                    Single-line text keeps each cell on one line. Min and max
                    constraints are available when multiline text is enabled.
                  </p>
                )}
                {selectedPolicy.mode === "hug" ? (
                  <p className="apex-table-sizing__hint">
                    Hug matches the widest cell in this column.
                  </p>
                ) : null}
                {sizingError ? (
                  <p className="apex-table-sizing__error" role="status">
                    {sizingError}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="apex-table-sizing__hint">
                Place the caret in a column or choose Select column from the
                table context menu.
              </p>
            )}
          </OptionsSection>
        ) : null}

        <OptionsSection title="Row">
          <div className="grid gap-1.5 text-sm">
            <ScrubbableNumberLabel
              htmlFor={`${fieldId}-row-height`}
              value={Number(rowHeight) || 0}
              step={10}
              onChange={(value) => {
                setRowHeight(String(value))
                onChange({ type: "rowHeight", value })
              }}
              className="text-muted-foreground"
            >
              Row height (twips)
            </ScrubbableNumberLabel>
            <ScrubbableNumberInput
              id={`${fieldId}-row-height`}
              value={rowHeight}
              scrubValue={Number(rowHeight) || 0}
              scrubMin={0}
              scrubStep={10}
              onValueChange={(value) => {
                setRowHeight(value)
                const parsed = Number(value)
                if (value === "" || Number.isFinite(parsed)) {
                  onChange({
                    type: "rowHeight",
                    value: value === "" ? null : Math.round(parsed),
                  })
                }
              }}
              placeholder="Auto"
            />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Checkbox
              id={`${fieldId}-repeat-header`}
              checked={headerRowRepeat}
              onCheckedChange={(checked) => {
                const value = checked === true
                setHeaderRowRepeat(value)
                onChange({ type: "headerRowRepeat", value })
              }}
            />
            <Label htmlFor={`${fieldId}-repeat-header`}>
              Repeat header row
            </Label>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Checkbox
              id={`${fieldId}-break-pages`}
              checked={allowBreakAcrossPages}
              onCheckedChange={(checked) => {
                const value = checked === true
                setAllowBreakAcrossPages(value)
                onChange({ type: "allowBreakAcrossPages", value })
              }}
            />
            <Label htmlFor={`${fieldId}-break-pages`}>
              Allow row to break across pages
            </Label>
          </div>
        </OptionsSection>

        <OptionsSection title="Cell">
          <div className="grid gap-2">
            <Label className="text-muted-foreground">
              Cell padding (twips)
            </Label>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  {
                    axis: "horizontal",
                    label: "Horizontal",
                    icon: HorizontalResizeIcon,
                    sides: ["left", "right"],
                    text: horizontalPaddingText,
                    value: horizontalPaddingValue,
                  },
                  {
                    axis: "vertical",
                    label: "Vertical",
                    icon: VerticalResizeIcon,
                    sides: ["top", "bottom"],
                    text: verticalPaddingText,
                    value: verticalPaddingValue,
                  },
                ] as const
              ).map(({ axis, label, icon, sides, text, value }) => (
                <div key={axis} className="grid gap-1.5 text-sm">
                  <ScrubbableNumberLabel
                    htmlFor={`${fieldId}-pad-${axis}`}
                    value={value}
                    step={10}
                    onChange={(nextValue) =>
                      updatePaddingSides(sides, String(nextValue))
                    }
                    className="text-muted-foreground"
                  >
                    {label}
                  </ScrubbableNumberLabel>
                  <div className="flex items-center gap-1">
                    <ScrubbableNumberDisclosure
                      value={value}
                      onChange={(nextValue) =>
                        updatePaddingSides(sides, String(nextValue))
                      }
                      onActivate={() =>
                        setPaddingExpanded((current) => !current)
                      }
                      expanded={paddingExpanded}
                      controls={paddingDetailsId}
                      label={label}
                    >
                      <HugeiconsIcon icon={icon} strokeWidth={1.8} />
                    </ScrubbableNumberDisclosure>
                    <ScrubbableNumberInput
                      id={`${fieldId}-pad-${axis}`}
                      value={text}
                      placeholder="Mixed"
                      scrubValue={value}
                      scrubMin={0}
                      scrubStep={10}
                      onValueChange={(nextValue) =>
                        updatePaddingSides(sides, nextValue)
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
            {paddingExpanded ? (
              <div
                id={paddingDetailsId}
                className="grid grid-cols-2 gap-3 border-t border-border pt-2"
              >
                {(["top", "right", "bottom", "left"] as const).map((side) => (
                  <div key={side} className="grid gap-1.5 text-sm">
                    <ScrubbableNumberLabel
                      htmlFor={`${fieldId}-pad-${side}`}
                      value={Number(paddingText[side]) || 0}
                      step={10}
                      onChange={(value) => updatePadding(side, String(value))}
                      className="text-muted-foreground capitalize"
                    >
                      {side}
                    </ScrubbableNumberLabel>
                    <ScrubbableNumberInput
                      id={`${fieldId}-pad-${side}`}
                      value={paddingText[side]}
                      scrubValue={Number(paddingText[side]) || 0}
                      scrubMin={0}
                      scrubStep={10}
                      onValueChange={(value) => updatePadding(side, value)}
                    />
                  </div>
                ))}
              </div>
            ) : null}
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
                className="w-14"
                onChange={(event) => {
                  setCellShading(event.target.value)
                  onChange({ type: "cellShading", value: event.target.value })
                }}
              />
              <Input
                aria-label="Cell shading color"
                value={cellShading}
                onChange={(event) => {
                  const value = event.target.value
                  setCellShading(value)
                  onChange({ type: "cellShading", value: value.trim() || null })
                }}
                placeholder="None"
              />
            </div>
          </div>
        </OptionsSection>

        <OptionsSection title="Cell borders">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs leading-5 text-muted-foreground">
              Click an edge to toggle it. Right-click an edge for its style.
            </p>
            <Button
              type="button"
              size="sm"
              variant={allBordersActive ? "secondary" : "outline"}
              aria-pressed={allBordersActive}
              className="shrink-0"
              onClick={() => {
                const enable = !allBordersActive
                onChange({
                  type: "cellBorder",
                  target: "all",
                  value: enable ? DEFAULT_BORDER : null,
                })
                setActiveBorders((current) => {
                  const next = { ...current }
                  for (const target of borderTargets) next[target] = enable
                  return next
                })
                if (enable) {
                  setBorderSpecs((current) => {
                    const next = { ...current }
                    for (const target of borderTargets) {
                      next[target] = DEFAULT_BORDER
                    }
                    return next
                  })
                }
              }}
            >
              All borders
            </Button>
          </div>
          <fieldset
            className="apex-cell-border"
            data-rows={selectionGrid.rows}
            data-columns={selectionGrid.columns}
            aria-label="Visible cell borders"
          >
            <span className="apex-cell-border__cells" aria-hidden="true">
              {CELL_GRID_KEYS[
                `${selectionGrid.rows}x${selectionGrid.columns}`
              ].map((cellKey) => (
                <span key={cellKey}>
                  {selectionGrid.cellCount === 1 ? "Cell" : null}
                </span>
              ))}
            </span>
            {borderTargets.map((target) => (
              <BorderToggle
                key={target}
                target={target}
                active={activeBorders[target]}
                spec={borderSpecs[target]}
                onToggle={() =>
                  updateBorder(
                    target,
                    activeBorders[target] ? null : borderSpecs[target]
                  )
                }
                onSpecChange={(spec) => updateBorder(target, spec)}
              />
            ))}
          </fieldset>
        </OptionsSection>
      </div>
    </aside>
  )
}
