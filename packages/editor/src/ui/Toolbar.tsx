import {
  AlignLeftIcon,
  ArrowDownFromLineIcon,
  ArrowUpFromLineIcon,
  BoldIcon,
  HighlighterIcon,
  Image01Icon,
  LeftToRightListBulletIcon,
  LeftToRightListNumberIcon,
  Link01Icon,
  ListIndentDecreaseIcon,
  ListIndentIncreaseIcon,
  MinusSignIcon,
  MoreHorizontalIcon,
  PaintBrush01Icon,
  ParagraphSpacingIcon,
  PlusSignIcon,
  PrinterIcon,
  Redo02Icon,
  SlidersVerticalIcon,
  TextAlignCenterIcon,
  TextAlignJustifyCenterIcon,
  TextAlignRightIcon,
  TextClearIcon,
  TextColorIcon,
  TextItalicIcon,
  TextUnderlineIcon,
  ViewSidebarRightIcon,
  Undo02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Separator } from "@workspace/ui/components/separator"
import { Toggle } from "@workspace/ui/components/toggle"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react"

import type { CustomPalette, FontIndex, GoogleFontCatalog } from "../fonts"
import { EDITOR_FONT_FAMILIES, GOOGLE_FONT_CATALOG_FALLBACK } from "../fonts"
import type { EditorSelectionSnapshot } from "../plugins/selection-state"
import type { EditorChromeActions, ParagraphAlignment } from "./chrome-types"
import { FONT_SIZE_OPTIONS, ZOOM_PRESETS } from "./chrome-types"
import { ColorPicker } from "./ColorPicker"
import { FontPicker } from "./FontPicker"
import { LINE_SPACING_PRESETS } from "./LineSpacingDialog"
import { ScrubbableNumberInput } from "./ScrubbableNumberInput"

export type ToolbarProps = Readonly<{
  actions: EditorChromeActions
  snapshot: EditorSelectionSnapshot
  zoom: number
  fonts: FontIndex
  googleFonts?: readonly string[]
  fontCatalog?: GoogleFontCatalog
  styleNames: readonly { id: string; name: string }[]
  palettes: Readonly<Record<string, readonly string[]>>
  customPalettes: readonly CustomPalette[]
  tableOptionsOpen: boolean
  onCustomPalettesChange: (palettes: CustomPalette[]) => void
}>

const FALLBACK_FONT_CATALOG: GoogleFontCatalog = Object.freeze({
  version: 0,
  families: GOOGLE_FONT_CATALOG_FALLBACK,
  source: "fallback",
})

const SPACE_BEFORE_AFTER_TWIPS = 200

const ALIGN_ICONS = {
  left: AlignLeftIcon,
  center: TextAlignCenterIcon,
  right: TextAlignRightIcon,
  justify: TextAlignJustifyCenterIcon,
} as const

type ToolbarItemId =
  | "undo"
  | "redo"
  | "print"
  | "paintFormat"
  | "sep-undo"
  | "zoom"
  | "sep-zoom"
  | "styles"
  | "sep-styles"
  | "fontFamily"
  | "sep-font"
  | "fontSize"
  | "sep-size"
  | "bold"
  | "italic"
  | "underline"
  | "textColor"
  | "highlight"
  | "sep-marks"
  | "link"
  | "image"
  | "sep-insert"
  | "align"
  | "lineSpacing"
  | "bulletList"
  | "numberedList"
  | "indentDecrease"
  | "indentIncrease"
  | "clearFormatting"

const TOOLBAR_ORDER: readonly ToolbarItemId[] = [
  "undo",
  "redo",
  "print",
  "paintFormat",
  "sep-undo",
  "zoom",
  "sep-zoom",
  "styles",
  "sep-styles",
  "fontFamily",
  "sep-font",
  "fontSize",
  "sep-size",
  "bold",
  "italic",
  "underline",
  "textColor",
  "highlight",
  "sep-marks",
  "link",
  "image",
  "sep-insert",
  "align",
  "lineSpacing",
  "bulletList",
  "numberedList",
  "indentDecrease",
  "indentIncrease",
  "clearFormatting",
]

function isSeparator(id: ToolbarItemId): boolean {
  return id.startsWith("sep-")
}

function twipsToPoints(twips: number): number {
  return Math.round(twips / 20)
}

function pointsToTwips(points: number): number {
  return Math.max(40, Math.round(points * 20))
}

function styleDisplayName(name: string): string {
  return name === "Normal" ? "Normal text" : name
}

function TypographyStyleItem({
  onOpenActions,
  style,
}: Readonly<{
  onOpenActions: (
    style: Readonly<{ id: string; name: string }>,
    event: MouseEvent<HTMLElement>
  ) => void
  style: Readonly<{ id: string; name: string }>
}>): ReactNode {
  const name = styleDisplayName(style.name)
  return (
    <SelectItem
      value={style.id}
      onPointerDown={(event) => {
        if (event.button === 2) event.preventDefault()
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onOpenActions(style, event)
      }}
    >
      <span className="max-w-40 truncate" title={name}>
        {name}
      </span>
    </SelectItem>
  )
}

function TypographyStyleActionMenu({
  actions,
  menu,
  onClose,
  selectionEmpty,
}: Readonly<{
  actions: EditorChromeActions
  menu: Readonly<{ id: string; name: string; x: number; y: number }>
  onClose: () => void
  selectionEmpty: boolean
}>): ReactNode {
  const name = styleDisplayName(menu.name)
  return (
    <DropdownMenu
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DropdownMenuTrigger
        aria-hidden
        tabIndex={-1}
        className="pointer-events-none fixed size-px opacity-0"
        style={{ left: menu.x, top: menu.y }}
      />
      <DropdownMenuContent
        align="start"
        className="min-w-64 w-auto"
        side="right"
        sideOffset={0}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel title={name} className="max-w-64 truncate">
            {name}
          </DropdownMenuLabel>
          <DropdownMenuItem
            disabled={selectionEmpty}
            onClick={() => {
              actions.onUpdateStyle(menu.id)
              onClose()
            }}
          >
            Update style to match selected text
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={selectionEmpty}
            onClick={() => {
              actions.onApplyStyle(menu.id)
              onClose()
            }}
          >
            Update selected text to match style
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function lineSpacingValue240ths(lineSpacing: unknown): number | null {
  if (
    lineSpacing &&
    typeof lineSpacing === "object" &&
    "value240ths" in lineSpacing &&
    typeof (lineSpacing as { value240ths: unknown }).value240ths === "number"
  ) {
    return (lineSpacing as { value240ths: number }).value240ths
  }
  return null
}

function matchLineSpacingPresetId(value240ths: number | null): string {
  if (value240ths == null) return "single"
  const preset = LINE_SPACING_PRESETS.find(
    (entry) => entry.value240ths === value240ths
  )
  return preset?.id ?? ""
}

function FontSizeControl({
  fontSizeTwips,
  onFontSize,
}: {
  fontSizeTwips: number
  onFontSize: (twips: number) => void
}): ReactNode {
  const listId = useId()
  const points = twipsToPoints(fontSizeTwips)
  const [draft, setDraft] = useState(String(points))
  const focusedRef = useRef(false)

  useEffect(() => {
    if (!focusedRef.current) setDraft(String(points))
  }, [points])

  const commit = () => {
    const next = Number(draft)
    if (!Number.isFinite(next) || next <= 0) {
      setDraft(String(points))
      return
    }
    onFontSize(pointsToTwips(next))
    setDraft(String(twipsToPoints(pointsToTwips(next))))
  }

  return (
    <div className="apex-editor-toolbar__font-size flex shrink-0 items-center gap-0.5">
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label="Decrease font size"
        onClick={() => onFontSize(pointsToTwips(points - 1))}
      >
        <HugeiconsIcon icon={MinusSignIcon} strokeWidth={2} />
      </Button>
      <ScrubbableNumberInput
        type="text"
        list={listId}
        inputMode="decimal"
        aria-label="Font size"
        value={draft}
        scrubValue={points}
        scrubMin={2}
        scrubStep={1}
        onValueChange={setDraft}
        onScrubValueChange={(next) => onFontSize(pointsToTwips(next))}
        onFocus={() => {
          focusedRef.current = true
        }}
        onBlur={() => {
          focusedRef.current = false
          commit()
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return
          event.preventDefault()
          commit()
          event.currentTarget.blur()
        }}
        className="apex-editor-toolbar__font-size-input h-9 px-1 text-center text-sm font-normal tracking-normal normal-case tabular-nums"
      />
      <datalist id={listId}>
        {FONT_SIZE_OPTIONS.map(([twips, pt]) => (
          <option key={twips} value={pt} />
        ))}
      </datalist>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label="Increase font size"
        onClick={() => onFontSize(pointsToTwips(points + 1))}
      >
        <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
      </Button>
    </div>
  )
}

function ToolbarIconButton({
  label,
  icon,
  onClick,
  pressed,
  disabled,
}: {
  label: string
  icon: typeof Undo02Icon
  onClick: () => void
  pressed?: boolean
  disabled?: boolean
}): ReactNode {
  const trigger =
    pressed === undefined ? (
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={label}
        title={label}
        disabled={disabled}
        onClick={onClick}
        className="apex-editor-toolbar__icon-btn"
      />
    ) : (
      <Toggle
        type="button"
        size="sm"
        variant="default"
        aria-label={label}
        title={label}
        pressed={pressed}
        disabled={disabled}
        onClick={onClick}
        className="apex-editor-toolbar__icon-btn size-9 min-w-9 px-0"
      />
    )

  return (
    <Tooltip>
      <TooltipTrigger render={trigger}>
        <HugeiconsIcon icon={icon} strokeWidth={2} />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function ToolbarImageButton({
  onInsert,
}: {
  onInsert: (file: File) => void
}): ReactNode {
  const inputRef = useRef<HTMLInputElement | null>(null)
  return (
    <>
      <ToolbarIconButton
        label="Insert image"
        icon={Image01Icon}
        onClick={() => inputRef.current?.click()}
      />
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/svg+xml,.svg"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onInsert(file)
          event.target.value = ""
        }}
      />
    </>
  )
}

export function Toolbar({
  actions,
  snapshot,
  zoom,
  fonts,
  googleFonts,
  fontCatalog,
  styleNames,
  palettes,
  customPalettes,
  tableOptionsOpen,
  onCustomPalettesChange,
}: ToolbarProps): ReactNode {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const measureRef = useRef<HTMLDivElement | null>(null)
  const [visibleItems, setVisibleItems] = useState<Set<ToolbarItemId>>(
    () => new Set(TOOLBAR_ORDER)
  )
  const [overflowItems, setOverflowItems] = useState<ToolbarItemId[]>([])

  const [styleActionMenu, setStyleActionMenu] = useState<{
    id: string
    name: string
    x: number
    y: number
  } | null>(null)

  const openStyleActionMenu = useCallback(
    (
      style: Readonly<{ id: string; name: string }>,
      event: MouseEvent<HTMLElement>
    ) => {
      setStyleActionMenu({
        id: style.id,
        name: style.name,
        x: event.clientX,
        y: event.clientY,
      })
    },
    []
  )

  const pickerCatalog = useMemo((): GoogleFontCatalog => {
    const base = fontCatalog ?? FALLBACK_FONT_CATALOG
    const extras = [
      snapshot.textStyle.fontFamily || "Inter",
      ...EDITOR_FONT_FAMILIES,
      ...fonts.families.map((entry) => entry.family),
      ...(googleFonts ?? []),
    ]
    const families = [...base.families]
    for (const name of extras) {
      if (!name) continue
      if (
        families.some(
          (entry) => entry.family.toLowerCase() === name.toLowerCase()
        )
      ) {
        continue
      }
      const local = fonts.families.find(
        (entry) => entry.family.toLowerCase() === name.toLowerCase()
      )
      families.unshift(
        Object.freeze({
          family: name,
          category: "Local",
          axes: [],
          ...(local
            ? {
                weights: Object.freeze(
                  [...new Set(local.faces.map((face) => face.weight))].sort(
                    (left, right) => left - right
                  )
                ),
              }
            : {}),
        })
      )
    }
    const featuredOrder = new Map(
      EDITOR_FONT_FAMILIES.map((family, index) => [family.toLowerCase(), index])
    )
    families.sort((left, right) => {
      const leftRank = featuredOrder.get(left.family.toLowerCase())
      const rightRank = featuredOrder.get(right.family.toLowerCase())
      if (leftRank === undefined && rightRank === undefined) return 0
      if (leftRank === undefined) return 1
      if (rightRank === undefined) return -1
      return leftRank - rightRank
    })
    return Object.freeze({
      version: base.version,
      source: base.source,
      families: Object.freeze(families),
    })
  }, [fontCatalog, fonts.families, googleFonts, snapshot.textStyle.fontFamily])

  const alignment = snapshot.paragraph?.alignment ?? "left"
  const fontSizeTwips = snapshot.textStyle.fontSize
  const styleId = snapshot.paragraph?.styleId ?? snapshot.textStyle.styleId
  const spacingBefore = snapshot.paragraph?.spacingBefore ?? 0
  const spacingAfter = snapshot.paragraph?.spacingAfter ?? 0
  const lineSpacingPreset = matchLineSpacingPresetId(
    lineSpacingValue240ths(snapshot.paragraph?.lineSpacing)
  )
  const renderItem = useCallback(
    (id: ToolbarItemId, inOverflow = false): ReactNode => {
      const key = inOverflow ? `overflow-${id}` : id
      if (isSeparator(id)) {
        return (
          <div
            key={key}
            data-toolbar-id={id}
            className="apex-editor-toolbar__item"
          >
            <Separator
              orientation="vertical"
              className="apex-editor-toolbar__sep"
            />
          </div>
        )
      }
      switch (id) {
        case "undo":
          return (
            <div
              key={key}
              data-toolbar-id={id}
              className="apex-editor-toolbar__item"
            >
              <ToolbarIconButton
                label="Undo"
                icon={Undo02Icon}
                disabled={!snapshot.canUndo}
                onClick={actions.onUndo}
              />
            </div>
          )
        case "redo":
          return (
            <div
              key={key}
              data-toolbar-id={id}
              className="apex-editor-toolbar__item"
            >
              <ToolbarIconButton
                label="Redo"
                icon={Redo02Icon}
                disabled={!snapshot.canRedo}
                onClick={actions.onRedo}
              />
            </div>
          )
        case "print":
          return (
            <div
              key={key}
              data-toolbar-id={id}
              className="apex-editor-toolbar__item"
            >
              <ToolbarIconButton
                label="Print"
                icon={PrinterIcon}
                onClick={actions.onPrint}
              />
            </div>
          )
        case "paintFormat":
          return (
            <div
              key={key}
              data-toolbar-id={id}
              className="apex-editor-toolbar__item"
            >
              <ToolbarIconButton
                label="Paint format"
                icon={PaintBrush01Icon}
                onClick={actions.onPaintFormat}
              />
            </div>
          )
        case "zoom":
          return (
            <div
              key={key}
              data-toolbar-id={id}
              className="apex-editor-toolbar__item"
            >
              <Select
                items={ZOOM_PRESETS.map((preset) => ({
                  value: String(preset),
                  label: `${preset}%`,
                }))}
                value={String(zoom)}
                onValueChange={(value) => {
                  if (value) actions.onZoomChange(Number(value))
                }}
              >
                <SelectTrigger
                  size="sm"
                  className="apex-editor-toolbar__zoom h-9 w-[4.75rem] text-sm font-normal tracking-normal normal-case"
                  aria-label="Zoom"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {ZOOM_PRESETS.map((preset) => (
                      <SelectItem key={preset} value={String(preset)}>
                        {preset}%
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          )
        case "styles":
          return (
            <div
              key={key}
              data-toolbar-id={id}
              className="apex-editor-toolbar__item"
            >
              <Select
                items={[
                  ...styleNames.map((style) => ({
                    value: style.id,
                    label: styleDisplayName(style.name),
                  })),
                  { value: "__none__", label: "Clear style" },
                ]}
                value={styleId ?? "Normal"}
                onValueChange={(value) => {
                  if (value === "__none__") actions.onApplyStyle(null)
                  else if (value) actions.onApplyStyle(value)
                }}
              >
                <SelectTrigger
                  size="sm"
                  className="apex-editor-toolbar__style h-9 w-[9.5rem] text-sm font-normal tracking-normal normal-case"
                  aria-label="Paragraph style"
                  // Keep the editor selection. pointerdown preventDefault also
                  // cancels Base UI Select's mousedown open handler.
                  onMouseDown={(event) => {
                    if (event.button === 0) event.preventDefault()
                  }}
                >
                  <SelectValue placeholder="Normal text" />
                </SelectTrigger>
                <SelectContent
                  alignItemWithTrigger={false}
                  className="w-auto min-w-48 max-h-80!"
                >
                  <SelectGroup>
                    {styleNames.map((style) => (
                      <TypographyStyleItem
                        key={style.id}
                        onOpenActions={openStyleActionMenu}
                        style={style}
                      />
                    ))}
                    <SelectItem value="__none__">Clear style</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          )
        case "fontFamily":
          return (
            <div
              key={key}
              data-toolbar-id={id}
              className="apex-editor-toolbar__item"
            >
              <FontPicker
                compact
                value={snapshot.textStyle.fontFamily || "Inter"}
                weight={snapshot.textStyle.fontWeight}
                catalog={pickerCatalog}
                onChange={(family, weight) => {
                  actions.onFontFamily(family, weight)
                }}
              />
            </div>
          )
        case "fontSize":
          return (
            <div
              key={key}
              data-toolbar-id={id}
              className="apex-editor-toolbar__item"
            >
              <FontSizeControl
                fontSizeTwips={fontSizeTwips}
                onFontSize={actions.onFontSize}
              />
            </div>
          )
        case "bold":
          return (
            <div
              key={key}
              data-toolbar-id={id}
              className="apex-editor-toolbar__item"
            >
              <ToolbarIconButton
                label="Bold"
                icon={BoldIcon}
                pressed={snapshot.bold}
                onClick={actions.onBold}
              />
            </div>
          )
        case "italic":
          return (
            <div
              key={key}
              data-toolbar-id={id}
              className="apex-editor-toolbar__item"
            >
              <ToolbarIconButton
                label="Italic"
                icon={TextItalicIcon}
                pressed={snapshot.italic}
                onClick={actions.onItalic}
              />
            </div>
          )
        case "underline":
          return (
            <div
              key={key}
              data-toolbar-id={id}
              className="apex-editor-toolbar__item"
            >
              <ToolbarIconButton
                label="Underline"
                icon={TextUnderlineIcon}
                pressed={snapshot.underline}
                onClick={actions.onUnderline}
              />
            </div>
          )
        case "textColor":
          return (
            <div
              key={key}
              data-toolbar-id={id}
              className="apex-editor-toolbar__item"
            >
              <Popover>
                <PopoverTrigger
                  render={
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Text color"
                      className="apex-editor-toolbar__color-btn"
                    />
                  }
                >
                  <HugeiconsIcon icon={TextColorIcon} strokeWidth={2} />
                  <span
                    className="apex-editor-toolbar__color-swatch"
                    style={{ background: snapshot.textStyle.color }}
                  />
                </PopoverTrigger>
                <PopoverContent className="w-[min(100vw-2rem,24rem)] p-3">
                  <ColorPicker
                    value={snapshot.textStyle.color}
                    palettes={palettes}
                    customPalettes={customPalettes}
                    onCustomPalettesChange={onCustomPalettesChange}
                    onPick={actions.onTextColor}
                  />
                </PopoverContent>
              </Popover>
            </div>
          )
        case "highlight":
          return (
            <div
              key={key}
              data-toolbar-id={id}
              className="apex-editor-toolbar__item"
            >
              <Popover>
                <PopoverTrigger
                  render={
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Highlight color"
                      className="apex-editor-toolbar__color-btn"
                    />
                  }
                >
                  <HugeiconsIcon icon={HighlighterIcon} strokeWidth={2} />
                  <span
                    className="apex-editor-toolbar__color-swatch"
                    style={{
                      background:
                        snapshot.textStyle.highlightColor ?? "#ffff00",
                    }}
                  />
                </PopoverTrigger>
                <PopoverContent className="w-[min(100vw-2rem,24rem)] p-3">
                  <ColorPicker
                    value={snapshot.textStyle.highlightColor ?? "#ffff00"}
                    palettes={palettes}
                    customPalettes={customPalettes}
                    onCustomPalettesChange={onCustomPalettesChange}
                    onPick={actions.onHighlightColor}
                  />
                </PopoverContent>
              </Popover>
            </div>
          )
        case "link":
          return (
            <div
              key={key}
              data-toolbar-id={id}
              className="apex-editor-toolbar__item"
            >
              <ToolbarIconButton
                label="Insert link"
                icon={Link01Icon}
                onClick={actions.onInsertLink}
              />
            </div>
          )
        case "image":
          return (
            <div
              key={key}
              data-toolbar-id={id}
              className="apex-editor-toolbar__item"
            >
              <ToolbarImageButton onInsert={actions.onInsertImage} />
            </div>
          )
        case "align":
          return (
            <div
              key={key}
              data-toolbar-id={id}
              className="apex-editor-toolbar__item"
            >
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <DropdownMenuTrigger
                        render={
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label="Align"
                            className="apex-editor-toolbar__icon-btn"
                          />
                        }
                      />
                    }
                  >
                    <HugeiconsIcon
                      icon={ALIGN_ICONS[alignment]}
                      strokeWidth={2}
                    />
                  </TooltipTrigger>
                  <TooltipContent>Align</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="start" className="w-40 min-w-40">
                  <DropdownMenuRadioGroup
                    value={alignment}
                    onValueChange={(value) => {
                      if (
                        value === "left" ||
                        value === "center" ||
                        value === "right" ||
                        value === "justify"
                      ) {
                        actions.onAlign(value satisfies ParagraphAlignment)
                      }
                    }}
                  >
                    <DropdownMenuGroup>
                      <DropdownMenuRadioItem value="left">
                        <HugeiconsIcon icon={AlignLeftIcon} strokeWidth={2} />
                        Left
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="center">
                        <HugeiconsIcon
                          icon={TextAlignCenterIcon}
                          strokeWidth={2}
                        />
                        Center
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="right">
                        <HugeiconsIcon
                          icon={TextAlignRightIcon}
                          strokeWidth={2}
                        />
                        Right
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="justify">
                        <HugeiconsIcon
                          icon={TextAlignJustifyCenterIcon}
                          strokeWidth={2}
                        />
                        Justify
                      </DropdownMenuRadioItem>
                    </DropdownMenuGroup>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        case "lineSpacing":
          return (
            <div
              key={key}
              data-toolbar-id={id}
              className="apex-editor-toolbar__item"
            >
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <DropdownMenuTrigger
                        render={
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label="Line & paragraph spacing"
                            className="apex-editor-toolbar__icon-btn"
                          />
                        }
                      />
                    }
                  >
                    <HugeiconsIcon
                      icon={ParagraphSpacingIcon}
                      strokeWidth={2}
                    />
                  </TooltipTrigger>
                  <TooltipContent>Line & paragraph spacing</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="start" className="w-64 min-w-64">
                  <DropdownMenuRadioGroup
                    value={lineSpacingPreset}
                    onValueChange={(value) => {
                      const preset = LINE_SPACING_PRESETS.find(
                        (entry) => entry.id === value
                      )
                      if (preset?.value240ths == null) return
                      actions.onParagraphSpacing({
                        lineSpacing: {
                          rule: "auto",
                          value240ths: preset.value240ths,
                        },
                      })
                    }}
                  >
                    <DropdownMenuGroup>
                      {LINE_SPACING_PRESETS.filter(
                        (entry) => entry.value240ths != null
                      ).map((entry) => (
                        <DropdownMenuRadioItem key={entry.id} value={entry.id}>
                          <HugeiconsIcon
                            icon={ParagraphSpacingIcon}
                            strokeWidth={2}
                          />
                          {entry.label}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuGroup>
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem
                      onClick={() =>
                        actions.onParagraphSpacing({
                          spacingBefore:
                            spacingBefore > 0 ? 0 : SPACE_BEFORE_AFTER_TWIPS,
                        })
                      }
                    >
                      <HugeiconsIcon
                        icon={ArrowUpFromLineIcon}
                        strokeWidth={2}
                      />
                      {spacingBefore > 0
                        ? "Remove space before paragraph"
                        : "Add space before paragraph"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        actions.onParagraphSpacing({
                          spacingAfter:
                            spacingAfter > 0 ? 0 : SPACE_BEFORE_AFTER_TWIPS,
                        })
                      }
                    >
                      <HugeiconsIcon
                        icon={ArrowDownFromLineIcon}
                        strokeWidth={2}
                      />
                      {spacingAfter > 0
                        ? "Remove space after paragraph"
                        : "Add space after paragraph"}
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={actions.onLineSpacing}>
                      <HugeiconsIcon
                        icon={SlidersVerticalIcon}
                        strokeWidth={2}
                      />
                      Custom spacing…
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        case "bulletList":
          return (
            <div
              key={key}
              data-toolbar-id={id}
              className="apex-editor-toolbar__item"
            >
              <ToolbarIconButton
                label="Bulleted list"
                icon={LeftToRightListBulletIcon}
                onClick={actions.onBulletList}
              />
            </div>
          )
        case "numberedList":
          return (
            <div
              key={key}
              data-toolbar-id={id}
              className="apex-editor-toolbar__item"
            >
              <ToolbarIconButton
                label="Numbered list"
                icon={LeftToRightListNumberIcon}
                onClick={actions.onNumberedList}
              />
            </div>
          )
        case "indentDecrease":
          return (
            <div
              key={key}
              data-toolbar-id={id}
              className="apex-editor-toolbar__item"
            >
              <ToolbarIconButton
                label="Decrease indent (Shift+Tab)"
                icon={ListIndentDecreaseIcon}
                onClick={actions.onIndentDecrease}
              />
            </div>
          )
        case "indentIncrease":
          return (
            <div
              key={key}
              data-toolbar-id={id}
              className="apex-editor-toolbar__item"
            >
              <ToolbarIconButton
                label="Increase indent (Tab)"
                icon={ListIndentIncreaseIcon}
                onClick={actions.onIndentIncrease}
              />
            </div>
          )
        case "clearFormatting":
          return (
            <div
              key={key}
              data-toolbar-id={id}
              className="apex-editor-toolbar__item"
            >
              <ToolbarIconButton
                label="Clear formatting"
                icon={TextClearIcon}
                onClick={actions.onClearFormatting}
              />
            </div>
          )
        default:
          return null
      }
    },
    [
      actions,
      alignment,
      customPalettes,
      fontSizeTwips,
      lineSpacingPreset,
      onCustomPalettesChange,
      palettes,
      openStyleActionMenu,
      pickerCatalog,
      snapshot.bold,
      snapshot.canRedo,
      snapshot.canUndo,
      snapshot.empty,
      snapshot.italic,
      snapshot.textStyle.color,
      snapshot.textStyle.fontFamily,
      snapshot.textStyle.fontWeight,
      snapshot.textStyle.highlightColor,
      snapshot.underline,
      spacingAfter,
      spacingBefore,
      styleId,
      styleNames,
      zoom,
    ]
  )

  const recomputeOverflow = useCallback(() => {
    const container = containerRef.current
    const measure = measureRef.current
    if (!container || !measure) return

    const containerWidth = container.clientWidth
    // Reserve space for the overflow trigger so items don't thrash in/out.
    const moreButtonWidth = snapshot.table.inTable ? 72 : 36
    const gap = 4
    const children = Array.from(
      measure.querySelectorAll<HTMLElement>("[data-toolbar-id]")
    )
    const widths = new Map<ToolbarItemId, number>()
    for (const child of children) {
      const id = child.dataset.toolbarId as ToolbarItemId | undefined
      if (id)
        widths.set(id, Math.ceil(child.getBoundingClientRect().width) + gap)
    }

    let used = moreButtonWidth + gap
    const nextVisible = new Set<ToolbarItemId>()
    const nextOverflow: ToolbarItemId[] = []

    for (const id of TOOLBAR_ORDER) {
      const width = widths.get(id) ?? 0
      if (used + width <= containerWidth) {
        nextVisible.add(id)
        used += width
      } else if (!isSeparator(id)) {
        nextOverflow.push(id)
      }
    }

    const nextVisibleList = TOOLBAR_ORDER.filter((id) => nextVisible.has(id))
    const nextOverflowList =
      nextOverflow.length === 0 ? ([] as ToolbarItemId[]) : nextOverflow
    const finalVisible =
      nextOverflowList.length === 0
        ? TOOLBAR_ORDER
        : (nextVisibleList as readonly ToolbarItemId[])

    setVisibleItems((prev) => {
      if (
        prev.size === finalVisible.length &&
        finalVisible.every((id) => prev.has(id))
      ) {
        return prev
      }
      return new Set(finalVisible)
    })
    setOverflowItems((prev) => {
      if (
        prev.length === nextOverflowList.length &&
        prev.every((id, index) => id === nextOverflowList[index])
      ) {
        return prev
      }
      return nextOverflowList
    })
  }, [snapshot.table.inTable])

  // Overflow depends on container width / chrome size — not selection revision.
  // Re-measure when the item set or zoom chrome changes width, via ResizeObserver.
  useLayoutEffect(() => {
    recomputeOverflow()
  }, [recomputeOverflow])

  useEffect(() => {
    const container = containerRef.current
    const measure = measureRef.current
    if (!container || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => recomputeOverflow())
    observer.observe(container)
    if (measure) observer.observe(measure)
    return () => observer.disconnect()
  }, [recomputeOverflow])

  const shownItems = TOOLBAR_ORDER.filter((id) => {
    if (!visibleItems.has(id)) return false
    if (!isSeparator(id)) return true
    const index = TOOLBAR_ORDER.indexOf(id)
    const prev = TOOLBAR_ORDER.slice(0, index)
      .reverse()
      .find((item) => !isSeparator(item) && visibleItems.has(item))
    const next = TOOLBAR_ORDER.slice(index + 1).find(
      (item) => !isSeparator(item) && visibleItems.has(item)
    )
    return Boolean(prev && next)
  })

  return (
    <>
      <div
        ref={containerRef}
        className="apex-editor-toolbar relative flex h-12 min-h-12 items-center gap-1 overflow-hidden border-b border-(--apex-chrome-border) bg-(--apex-chrome-bg) px-2"
        role="toolbar"
        aria-label="Formatting toolbar"
      >
      <div
        ref={measureRef}
        className="pointer-events-none absolute top-0 left-0 -z-50 flex h-12 items-center gap-1 opacity-0"
        aria-hidden
      >
        {TOOLBAR_ORDER.map((id) => renderItem(id))}
      </div>

      {shownItems.map((id) => renderItem(id))}

      <div className="ml-auto flex h-9 shrink-0 items-center justify-end gap-1">
        {snapshot.table.inTable ? (
          <ToolbarIconButton
            label="Open table options"
            icon={ViewSidebarRightIcon}
            pressed={tableOptionsOpen}
            onClick={actions.onTableProperties}
          />
        ) : null}
        {overflowItems.length > 0 ? (
          <Popover>
            <PopoverTrigger
              render={
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="More tools"
                  className="apex-editor-toolbar__more"
                />
              }
            >
              <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
            </PopoverTrigger>
            <PopoverContent className="flex max-w-[min(100vw-2rem,360px)] flex-wrap gap-2 p-2">
              {overflowItems.map((id) => renderItem(id, true))}
            </PopoverContent>
          </Popover>
        ) : null}
      </div>
      </div>
      {styleActionMenu ? (
        <TypographyStyleActionMenu
          actions={actions}
          menu={styleActionMenu}
          onClose={() => setStyleActionMenu(null)}
          selectionEmpty={snapshot.empty}
        />
      ) : null}
    </>
  )
}
