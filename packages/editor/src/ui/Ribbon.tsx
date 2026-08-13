import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import type { ReactNode } from "react"

import type { CustomPalette, FontIndex } from "../fonts"

export type RibbonProps = Readonly<{
  onBold: () => void
  onItalic: () => void
  onUnderline: () => void
  onAlign: (alignment: "left" | "center" | "right" | "justify") => void
  onColor: (color: string) => void
  onFontFamily: (family: string) => void
  onFontSize: (fontSizeTwips: number) => void
  onPageBreak: () => void
  onInsertTable: () => void
  onCellBorder?: (
    side: "top" | "right" | "bottom" | "left" | "all",
    style: "none" | "single" | "double" | "dotted" | "dashed"
  ) => void
  onInsertImage: (file: File) => void
  onApplyStyle: (styleId: string | null) => void
  onMatchStyle: () => void
  onParagraphSpacing: (options: {
    spacingBefore?: number
    spacingAfter?: number
  }) => void
  onPageSetup: (options: {
    pageWidth?: number
    pageHeight?: number
    marginTop?: number
    marginRight?: number
    marginBottom?: number
    marginLeft?: number
  }) => void
  onNew: () => void
  onOpenDocx: (file: File) => void
  onSaveDocx: () => void
  onExportPdf: () => void
  onTogglePreview: () => void
  onToggleDivergence: () => void
  previewOn: boolean
  divergenceOn: boolean
  palettes: Readonly<Record<string, readonly string[]>>
  customPalettes: readonly CustomPalette[]
  onCustomPalettesChange: (palettes: CustomPalette[]) => void
  fonts: FontIndex
  googleFonts?: readonly string[]
  styleNames?: readonly { id: string; name: string }[]
}>

export function Ribbon(props: RibbonProps): ReactNode {
  const fontFamilies = [
    "Calibri",
    ...props.fonts.families.map((f) => f.family),
    ...(props.googleFonts ?? []),
  ].filter((name, index, all) => all.indexOf(name) === index)
  const styles = props.styleNames ?? [
    { id: "Normal", name: "Normal" },
    { id: "Heading1", name: "Heading 1" },
    { id: "Heading2", name: "Heading 2" },
    { id: "Title", name: "Title" },
  ]

  return (
    <div
      role="toolbar"
      aria-label="Editor ribbon"
      className="apex-editor-ribbon"
    >
      <div className="apex-editor-ribbon__group">
        <Button type="button" size="xs" variant="outline" onClick={props.onNew}>
          New
        </Button>
        <label className="inline-flex cursor-pointer">
          <span className="inline-flex h-7 items-center border border-border bg-transparent px-3 text-xs font-semibold tracking-widest uppercase">
            Open
          </span>
          <input
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) props.onOpenDocx(file)
              event.target.value = ""
            }}
          />
        </label>
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={props.onSaveDocx}
        >
          Save
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={props.onExportPdf}
        >
          PDF
        </Button>
      </div>

      <Separator orientation="vertical" className="h-6" />

      <Select
        defaultValue={fontFamilies[0]}
        onValueChange={(value) => {
          if (value) props.onFontFamily(value)
        }}
      >
        <SelectTrigger
          size="sm"
          className="apex-editor-ribbon__select"
          aria-label="Font family"
        >
          <SelectValue placeholder="Font" />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {fontFamilies.map((family) => (
            <SelectItem key={family} value={family}>
              <span style={{ fontFamily: `"${family}", system-ui, sans-serif` }}>
                {family}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        defaultValue="220"
        onValueChange={(value) => {
          if (value) props.onFontSize(Number(value))
        }}
      >
        <SelectTrigger
          size="sm"
          className="apex-editor-ribbon__select--size"
          aria-label="Font size"
        >
          <SelectValue placeholder="Size" />
        </SelectTrigger>
        <SelectContent>
          {[
            ["180", "9"],
            ["200", "10"],
            ["220", "11"],
            ["240", "12"],
            ["280", "14"],
            ["320", "16"],
            ["360", "18"],
            ["480", "24"],
          ].map(([twips, pt]) => (
            <SelectItem key={twips} value={twips!}>
              {pt} pt
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="apex-editor-ribbon__group">
        <Button
          type="button"
          size="icon-xs"
          variant="outline"
          title="Bold (⌘B)"
          onClick={props.onBold}
        >
          <strong>B</strong>
        </Button>
        <Button
          type="button"
          size="icon-xs"
          variant="outline"
          title="Italic (⌘I)"
          onClick={props.onItalic}
        >
          <em>I</em>
        </Button>
        <Button
          type="button"
          size="icon-xs"
          variant="outline"
          title="Underline (⌘U)"
          onClick={props.onUnderline}
        >
          <span className="underline">U</span>
        </Button>
      </div>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={() => props.onAlign("left")}
        >
          Left
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={() => props.onAlign("center")}
        >
          Center
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={() => props.onAlign("right")}
        >
          Right
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={() => props.onAlign("justify")}
        >
          Justify
        </Button>
      </div>

      <Popover>
        <PopoverTrigger
          render={
            <Button type="button" size="xs" variant="outline">
              Color
            </Button>
          }
        />
        <PopoverContent className="w-64 p-3">
          <div className="mb-2 text-xs font-semibold tracking-widest uppercase text-muted-foreground">
            Tailwind palettes
          </div>
          <div className="flex flex-wrap gap-1">
            {Object.entries(props.palettes).flatMap(([name, colors]) =>
              colors.map((color) => (
                <button
                  key={`${name}-${color}`}
                  type="button"
                  title={`${name} ${color}`}
                  className="size-5 rounded-sm border border-border"
                  style={{ background: color }}
                  onClick={() => props.onColor(color)}
                />
              ))
            )}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Label htmlFor="apex-custom-color" className="text-xs">
              Custom
            </Label>
            <Input
              id="apex-custom-color"
              type="color"
              className="h-8 w-14 p-1"
              onChange={(event) => props.onColor(event.target.value)}
            />
            <Button
              type="button"
              size="xs"
              variant="secondary"
              onClick={() => {
                const id = `palette-${props.customPalettes.length + 1}`
                const colors = Object.values(props.palettes)[0] ?? ["#000000"]
                props.onCustomPalettesChange([
                  ...props.customPalettes,
                  { id, name: id, colors: [...colors] },
                ])
              }}
            >
              + Palette
            </Button>
          </div>
          {props.customPalettes.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {props.customPalettes.flatMap((palette) =>
                palette.colors.map((color) => (
                  <button
                    key={`${palette.id}-${color}`}
                    type="button"
                    title={`${palette.name} ${color}`}
                    className="size-5 rounded-sm border border-border"
                    style={{ background: color }}
                    onClick={() => props.onColor(color)}
                  />
                ))
              )}
            </div>
          ) : null}
        </PopoverContent>
      </Popover>

      <Separator orientation="vertical" className="h-6" />

      <Select
        defaultValue="Normal"
        onValueChange={(value) => {
          if (value === "__none__") props.onApplyStyle(null)
          else if (value) props.onApplyStyle(value)
        }}
      >
        <SelectTrigger
          size="sm"
          className="apex-editor-ribbon__select--style"
          aria-label="Style gallery"
        >
          <SelectValue placeholder="Style" />
        </SelectTrigger>
        <SelectContent>
          {styles.map((style) => (
            <SelectItem key={style.id} value={style.id}>
              {style.name}
            </SelectItem>
          ))}
          <SelectItem value="__none__">Clear style</SelectItem>
        </SelectContent>
      </Select>
      <Button
        type="button"
        size="xs"
        variant="outline"
        title="Match style to selection"
        onClick={props.onMatchStyle}
      >
        Match style
      </Button>

      <Popover>
        <PopoverTrigger
          render={
            <Button type="button" size="xs" variant="outline">
              Spacing
            </Button>
          }
        />
        <PopoverContent className="w-56 space-y-3 p-3">
          <div className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
            Paragraph spacing
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              size="xs"
              variant="secondary"
              onClick={() =>
                props.onParagraphSpacing({
                  spacingBefore: 0,
                  spacingAfter: 200,
                })
              }
            >
              After 10pt
            </Button>
            <Button
              type="button"
              size="xs"
              variant="secondary"
              onClick={() =>
                props.onParagraphSpacing({
                  spacingBefore: 200,
                  spacingAfter: 200,
                })
              }
            >
              10pt / 10pt
            </Button>
            <Button
              type="button"
              size="xs"
              variant="secondary"
              onClick={() =>
                props.onParagraphSpacing({
                  spacingBefore: 0,
                  spacingAfter: 0,
                })
              }
            >
              Tight
            </Button>
            <Button
              type="button"
              size="xs"
              variant="secondary"
              onClick={() =>
                props.onParagraphSpacing({
                  spacingBefore: 0,
                  spacingAfter: 400,
                })
              }
            >
              After 20pt
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger
          render={
            <Button type="button" size="xs" variant="outline">
              Page setup
            </Button>
          }
        />
        <PopoverContent className="w-64 space-y-3 p-3">
          <div className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
            Page size & margins
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              size="xs"
              variant="secondary"
              onClick={() =>
                props.onPageSetup({
                  pageWidth: 11906,
                  pageHeight: 16838,
                })
              }
            >
              A4
            </Button>
            <Button
              type="button"
              size="xs"
              variant="secondary"
              onClick={() =>
                props.onPageSetup({
                  pageWidth: 12240,
                  pageHeight: 15840,
                })
              }
            >
              Letter
            </Button>
            <Button
              type="button"
              size="xs"
              variant="secondary"
              onClick={() =>
                props.onPageSetup({
                  marginTop: 1440,
                  marginRight: 1440,
                  marginBottom: 1440,
                  marginLeft: 1440,
                })
              }
            >
              1″ margins
            </Button>
            <Button
              type="button"
              size="xs"
              variant="secondary"
              onClick={() =>
                props.onPageSetup({
                  marginTop: 720,
                  marginRight: 720,
                  marginBottom: 720,
                  marginLeft: 720,
                })
              }
            >
              0.5″ margins
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Separator orientation="vertical" className="h-6" />

      <Button
        type="button"
        size="xs"
        variant="outline"
        onClick={props.onInsertTable}
      >
        Table
      </Button>
      {props.onCellBorder ? (
        <Popover>
          <PopoverTrigger
            render={
              <Button type="button" size="xs" variant="outline">
                Cell border
              </Button>
            }
          />
          <PopoverContent className="w-56 space-y-2 p-3">
            <div className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
              Cell borders
            </div>
            <div className="grid grid-cols-2 gap-1">
              {(
                [
                  ["all", "All"],
                  ["top", "Top"],
                  ["bottom", "Bottom"],
                  ["left", "Left"],
                  ["right", "Right"],
                ] as const
              ).map(([side, label]) => (
                <Button
                  key={side}
                  type="button"
                  size="xs"
                  variant="secondary"
                  onClick={() => props.onCellBorder?.(side, "single")}
                >
                  {label}
                </Button>
              ))}
              <Button
                type="button"
                size="xs"
                variant="secondary"
                onClick={() => props.onCellBorder?.("all", "dashed")}
              >
                Dashed
              </Button>
              <Button
                type="button"
                size="xs"
                variant="secondary"
                onClick={() => props.onCellBorder?.("all", "none")}
              >
                None
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Or right-click a cell for full table tools.
            </p>
          </PopoverContent>
        </Popover>
      ) : null}
      <label className="inline-flex cursor-pointer">
        <span className="inline-flex h-7 items-center border border-border bg-transparent px-3 text-xs font-semibold tracking-widest uppercase">
          Image
        </span>
        <input
          type="file"
          accept="image/*,.svg"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) props.onInsertImage(file)
            event.target.value = ""
          }}
        />
      </label>
      <Button
        type="button"
        size="xs"
        variant="outline"
        title="Insert page break (⌘Enter)"
        onClick={props.onPageBreak}
      >
        Page break
      </Button>

      <Separator orientation="vertical" className="h-6" />

      <Button
        type="button"
        size="xs"
        variant={props.previewOn ? "default" : "outline"}
        onClick={props.onTogglePreview}
      >
        Preview
      </Button>
      <Button
        type="button"
        size="xs"
        variant={props.divergenceOn ? "default" : "outline"}
        onClick={props.onToggleDivergence}
      >
        Divergence
      </Button>
    </div>
  )
}
