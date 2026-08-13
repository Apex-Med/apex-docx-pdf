import {
  nodeId,
  twips,
  type FontWeight,
  type OperationResult,
  type SemanticBlock,
  type SemanticDocument,
  type SemanticHeaderFooter,
  type SemanticInline,
  type SemanticParagraph,
  type SemanticSection,
  type SemanticTable,
  type TextStyle,
} from "@apexmed/core"

import type {
  ParsedDocxDocument,
  ParsedDocxParagraph,
  ParsedDocxRunProperties,
  ParsedDocxTable,
} from "./types"

function runPropertiesToTextStyle(
  properties: ParsedDocxRunProperties
): TextStyle {
  return {
    fontFamily: properties.fontFamily,
    fontSize: twips(properties.fontSizeHalfPoints * 10),
    fontWeight: properties.fontWeight,
    fontStyle: properties.fontStyle,
    underline: properties.underline,
    strikethrough: properties.strikethrough ?? false,
    highlightColor:
      properties.highlightColor === null
        ? null
        : `#${properties.highlightColor}`,
    verticalAlignment: properties.verticalAlignment,
    color: properties.color.startsWith("#")
      ? properties.color
      : `#${properties.color}`,
  }
}

function directRunStyle(
  properties:
    | ParsedDocxRunProperties
    | Partial<ParsedDocxRunProperties>
    | null
    | undefined
): Partial<TextStyle> | null {
  if (properties === null || properties === undefined) return null
  // Direct OOXML overrides may be partial; fill missing fields with defaults
  // only for conversion — callers store this as Partial<TextStyle>.
  const full: ParsedDocxRunProperties = {
    fontFamily: "Calibri",
    fontSizeHalfPoints: 22,
    fontWeight: 400,
    fontStyle: "normal",
    underline: false,
    color: "#000000",
    highlightColor: null,
    verticalAlignment: "baseline",
    ...properties,
  }
  const style = runPropertiesToTextStyle(full)
  const partial: {
    -readonly [K in keyof TextStyle]?: TextStyle[K]
  } = {}
  if (properties.fontFamily !== undefined) partial.fontFamily = style.fontFamily
  if (properties.fontSizeHalfPoints !== undefined)
    partial.fontSize = style.fontSize
  if (properties.fontWeight !== undefined) partial.fontWeight = style.fontWeight
  if (properties.fontStyle !== undefined) partial.fontStyle = style.fontStyle
  if (properties.underline !== undefined) partial.underline = style.underline
  if (properties.color !== undefined) partial.color = style.color
  if (properties.highlightColor !== undefined)
    partial.highlightColor = style.highlightColor
  if (properties.verticalAlignment !== undefined)
    partial.verticalAlignment = style.verticalAlignment
  if (properties.strikethrough !== undefined)
    partial.strikethrough = properties.strikethrough
  return Object.keys(partial).length > 0 ? partial : null
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object") return value
  const object = value as object
  if (seen.has(object)) return value
  seen.add(object)
  for (const child of Object.values(object)) deepFreeze(child, seen)
  return Object.freeze(value)
}

const GOOGLE_ISO_PAGE_SIZES = Object.freeze([
  // Google Docs exports ISO paper sizes using integer-point PDF boxes. Keep
  // semantic geometry on that same grid so pagination and PDF output agree
  // instead of preserving millimetre-to-twip conversion noise from the DOCX.
  Object.freeze({
    source: [16_838, 23_811] as const,
    google: [16_840, 23_820] as const,
  }), // A3
  Object.freeze({
    source: [11_906, 16_838] as const,
    google: [11_920, 16_840] as const,
  }), // A4
  Object.freeze({
    source: [8_391, 11_906] as const,
    google: [8_380, 11_920] as const,
  }), // A5
  Object.freeze({
    source: [5_953, 8_391] as const,
    google: [5_960, 8_380] as const,
  }), // A6
])

function googleCompatiblePageSize(
  width: number,
  height: number
): Readonly<{ width: number; height: number }> {
  const tolerance = 24
  for (const size of GOOGLE_ISO_PAGE_SIZES) {
    if (
      Math.abs(width - size.source[0]) <= tolerance &&
      Math.abs(height - size.source[1]) <= tolerance
    ) {
      return { width: size.google[0], height: size.google[1] }
    }
    if (
      Math.abs(width - size.source[1]) <= tolerance &&
      Math.abs(height - size.source[0]) <= tolerance
    ) {
      return { width: size.google[1], height: size.google[0] }
    }
  }
  return { width, height }
}

function normaliseParagraph(
  paragraph: ParsedDocxParagraph,
  idPrefix: string,
  textIdPrefix = `${idPrefix}:text`
): SemanticParagraph {
  const children: SemanticInline[] = []
  let textIndex = 0
  for (const run of paragraph.runs) {
    for (const inline of run.inlines) {
      if (inline.type === "docx-break") {
        children.push({
          type: "break",
          id: nodeId(`${textIdPrefix}:${textIndex + 1}`),
          source: inline.source,
          kind: inline.kind,
        })
        textIndex += 1
        continue
      }
      if (inline.type === "docx-tab") {
        children.push({
          type: "tab",
          id: nodeId(`${textIdPrefix}:${textIndex + 1}`),
          source: inline.source,
        })
        textIndex += 1
        continue
      }
      if (inline.type === "docx-image") {
        children.push({
          type: "image",
          id: nodeId(`${textIdPrefix}:${textIndex + 1}`),
          source: inline.source,
          assetId: inline.assetId,
          width: twips(inline.widthTwips),
          height: twips(inline.heightTwips),
          aspect: {
            pixelWidth: inline.pixelWidth,
            pixelHeight: inline.pixelHeight,
            intrinsicRatio: inline.intrinsicRatio,
            preserve: inline.preserveAspect,
          },
          placement:
            inline.placement.type === "anchor"
              ? {
                  ...inline.placement,
                  offsetX: twips(inline.placement.offsetXTwips),
                  offsetY: twips(inline.placement.offsetYTwips),
                }
              : inline.placement,
        })
        textIndex += 1
        continue
      }
      if (inline.type === "docx-page-field") {
        children.push({
          type: "pageField",
          id: nodeId(`${textIdPrefix}:${textIndex + 1}`),
          source: inline.source,
          field: inline.field,
          displayText: inline.displayText,
          format: "decimal",
          style: runPropertiesToTextStyle(run.properties),
          styleId: run.styleId ?? null,
          directStyle: directRunStyle(run.directProperties),
        })
        textIndex += 1
        continue
      }
      children.push({
        type: "text",
        id: nodeId(`${textIdPrefix}:${textIndex + 1}`),
        source: inline.source,
        text: inline.text,
        preserveSpace: inline.preserveSpace,
        style: runPropertiesToTextStyle(run.properties),
        styleId: run.styleId ?? null,
        directStyle: directRunStyle(run.directProperties),
        ...(inline.href ? { href: inline.href } : {}),
        ...(inline.anchor ? { anchor: inline.anchor } : {}),
      })
      textIndex += 1
    }
  }
  return {
    type: "paragraph",
    id: nodeId(idPrefix),
    source: paragraph.source,
    properties: {
      alignment: paragraph.properties.alignment,
      spacingBefore: twips(paragraph.properties.spacingBefore),
      spacingAfter: twips(paragraph.properties.spacingAfter),
      lineSpacing:
        paragraph.properties.lineSpacing === null
          ? null
          : paragraph.properties.lineSpacing.rule === "auto"
            ? {
                rule: "auto",
                value240ths: paragraph.properties.lineSpacing.value240ths,
              }
            : {
                rule: paragraph.properties.lineSpacing.rule,
                value: twips(paragraph.properties.lineSpacing.valueTwips),
              },
      indentStart: twips(paragraph.properties.indentStart),
      indentEnd: twips(paragraph.properties.indentEnd),
      firstLineIndent: twips(paragraph.properties.firstLineIndent),
      keepWithNext: paragraph.properties.keepWithNext,
      keepLinesTogether: paragraph.properties.keepLinesTogether,
      widowControl: paragraph.properties.widowControl,
      pageBreakBefore: paragraph.properties.pageBreakBefore,
      numbering: paragraph.properties.numbering,
      tabStops: paragraph.properties.tabStops.map((stop) => ({
        position: twips(stop.position),
        alignment: stop.alignment,
      })),
    },
    styleId: paragraph.styleId ?? null,
    paragraphMarkStyle:
      paragraph.paragraphMarkProperties === null ||
      paragraph.paragraphMarkProperties === undefined
        ? null
        : runPropertiesToTextStyle(paragraph.paragraphMarkProperties),
    children,
  }
}

function normaliseTable(
  table: ParsedDocxTable,
  tableIndex: number
): SemanticTable {
  const border = (value: ParsedDocxTable["borders"]["top"]) =>
    value === null
      ? null
      : {
          style: value.style,
          color: value.color.startsWith("#") ? value.color : `#${value.color}`,
          width: twips(Math.round((value.size * 20) / 8)),
          space: twips(value.space * 20),
        }
  return {
    type: "table",
    id: nodeId(`docx:table:${tableIndex}`),
    source: table.source,
    width: twips(table.width),
    preferredWidth:
      table.preferredWidth === null ? null : twips(table.preferredWidth),
    indentStart: twips(table.indentStart),
    alignment: table.alignment,
    layout: table.layout,
    columnWidths: table.columnWidths.map(twips),
    borders: {
      top: border(table.borders.top),
      right: border(table.borders.right),
      bottom: border(table.borders.bottom),
      left: border(table.borders.left),
      insideHorizontal: border(table.borders.insideHorizontal),
      insideVertical: border(table.borders.insideVertical),
    },
    cellPadding: {
      top: twips(table.cellPadding.top),
      right: twips(table.cellPadding.right),
      bottom: twips(table.cellPadding.bottom),
      left: twips(table.cellPadding.left),
    },
    repeatHeaderRowCount: table.repeatHeaderRowCount,
    rows: table.rows.map((row, rowIndex) => ({
      type: "tableRow",
      id: nodeId(`docx:table:${tableIndex}:row:${rowIndex + 1}`),
      source: row.source,
      repeatAsHeader: row.repeatAsHeader,
      allowBreakAcrossPages: row.allowBreakAcrossPages,
      height:
        row.height === null
          ? null
          : { rule: row.height.rule, value: twips(row.height.value) },
      cells: row.cells.map((cell, cellIndex) => ({
        type: "tableCell",
        id: nodeId(
          `docx:table:${tableIndex}:row:${rowIndex + 1}:cell:${cellIndex + 1}`
        ),
        source: cell.source,
        columnIndex: cell.columnIndex,
        width: twips(cell.width),
        preferredWidth:
          cell.preferredWidth === null ? null : twips(cell.preferredWidth),
        columnSpan: cell.columnSpan,
        verticalMerge: cell.verticalMerge,
        verticalAlignment: cell.verticalAlignment,
        fillColor:
          cell.fillColor === null
            ? null
            : cell.fillColor.startsWith("#")
              ? cell.fillColor
              : `#${cell.fillColor}`,
        borders: {
          top: border(cell.borders.top),
          right: border(cell.borders.right),
          bottom: border(cell.borders.bottom),
          left: border(cell.borders.left),
        },
        cellPadding:
          cell.cellPadding === null
            ? null
            : {
                top: twips(cell.cellPadding.top),
                right: twips(cell.cellPadding.right),
                bottom: twips(cell.cellPadding.bottom),
                left: twips(cell.cellPadding.left),
              },
        blocks: cell.paragraphs.map((paragraph, paragraphIndex) =>
          normaliseParagraph(
            paragraph,
            `docx:table:${tableIndex}:row:${rowIndex + 1}:cell:${cellIndex + 1}:paragraph:${paragraphIndex + 1}`
          )
        ),
      })),
    })),
  }
}

function normaliseHeaderFooter(
  value:
    | ParsedDocxDocument["headers"][number]
    | ParsedDocxDocument["footers"][number]
): SemanticHeaderFooter {
  return {
    type: value.type === "docx-header" ? "header" : "footer",
    id: value.id,
    source: value.source,
    blocks: value.paragraphs.map((paragraph, index) =>
      normaliseParagraph(paragraph, `${value.id}:paragraph:${index + 1}`)
    ),
  }
}

/** Converts the supported parsed OOXML surface into core's vocabulary. */
export function normaliseDocx(
  document: ParsedDocxDocument
): OperationResult<SemanticDocument> {
  let paragraphIndex = 0
  let tableIndex = 0
  const normaliseBlocks = (
    sourceBlocks: ParsedDocxDocument["blocks"]
  ): SemanticBlock[] =>
    sourceBlocks.map((block) => {
      if (block.type === "docx-table") {
        tableIndex += 1
        return normaliseTable(block, tableIndex)
      }
      if (block.type === "docx-horizontal-rule") {
        paragraphIndex += 1
        return {
          type: "horizontalRule",
          id: nodeId(`docx:horizontal-rule:${paragraphIndex}`),
          source: block.source,
          properties: {
            alignment: block.properties.alignment,
            spacingBefore: twips(block.properties.spacingBefore),
            spacingAfter: twips(block.properties.spacingAfter),
            lineSpacing: null,
            indentStart: twips(block.properties.indentStart),
            indentEnd: twips(block.properties.indentEnd),
            firstLineIndent: twips(block.properties.firstLineIndent),
            keepWithNext: block.properties.keepWithNext,
            keepLinesTogether: block.properties.keepLinesTogether,
            widowControl: block.properties.widowControl,
            pageBreakBefore: block.properties.pageBreakBefore,
            numbering: null,
          },
          height: twips(block.heightTwips),
          color: block.color.startsWith("#") ? block.color : `#${block.color}`,
        }
      }
      paragraphIndex += 1
      return normaliseParagraph(
        block,
        `docx:paragraph:${paragraphIndex}`,
        `docx:text:${paragraphIndex}`
      )
    })
  const value: SemanticDocument = {
    type: "document",
    id: nodeId("docx:document:1"),
    source: document.source,
    assets: document.assets.map((asset) => ({
      type: "imageAsset",
      id: asset.id,
      source: asset.source,
      packagePath: asset.packagePath,
      mimeType: asset.mimeType,
      bytes: asset.bytes,
      pixelWidth: asset.pixelWidth,
      pixelHeight: asset.pixelHeight,
      ...(asset.rasterFallback ? { rasterFallback: asset.rasterFallback } : {}),
    })),
    fontAssets: document.fontAssets.map((asset) => ({
      type: "fontAsset",
      id: asset.id,
      source: asset.source,
      packagePath: asset.packagePath,
      family: asset.family,
      weight: asset.weight,
      style: asset.style,
      bytes: asset.bytes,
    })),
    headers: document.headers.map(normaliseHeaderFooter),
    footers: document.footers.map(normaliseHeaderFooter),
    numberingDefinitions: document.numberingDefinitions.map((definition) => ({
      id: definition.id,
      levels: definition.levels.map((level) => ({
        ...level,
        indentStart: twips(level.indentStart),
        firstLineIndent: twips(level.firstLineIndent),
      })),
    })),
    styles: document.styles,
    editorMetadata: document.editorMetadata,
    sections: document.sections.map((section, sectionIndex) => {
      const pageSize = googleCompatiblePageSize(
        section.properties.pageWidth,
        section.properties.pageHeight
      )
      return {
        type: "section",
        id: nodeId(`docx:section:${sectionIndex + 1}`),
        source: section.source,
        properties: {
          pageWidth: twips(pageSize.width),
          pageHeight: twips(pageSize.height),
          orientation: section.properties.orientation,
          margins: {
            top: twips(section.properties.marginTop),
            right: twips(section.properties.marginRight),
            bottom: twips(section.properties.marginBottom),
            left: twips(section.properties.marginLeft),
          },
          headerDistance: twips(section.properties.headerDistance),
          footerDistance: twips(section.properties.footerDistance),
          columns:
            section.properties.columns === null
              ? null
              : {
                  count: section.properties.columns.count,
                  equalWidth: section.properties.columns.equalWidth,
                  space: twips(section.properties.columns.space),
                  separator: section.properties.columns.separator,
                  widths:
                    section.properties.columns.widths === null
                      ? null
                      : section.properties.columns.widths.map(twips),
                },
        },
        defaultHeaderId: section.defaultHeaderId,
        defaultFooterId: section.defaultFooterId,
        blocks: normaliseBlocks(section.blocks),
      }
    }),
  }
  return {
    ok: true,
    value: deepFreeze(applyRunWeightsFromMetadata(value)),
    diagnostics: [],
  }
}

const FONT_WEIGHTS = new Set<number>([
  100, 200, 300, 400, 500, 600, 700, 800, 900,
])

function isFontWeight(value: number): value is FontWeight {
  return FONT_WEIGHTS.has(value)
}

function parseRunWeights(
  metadata: Readonly<Record<string, unknown>> | undefined
): ReadonlyMap<number, FontWeight> {
  const result = new Map<number, FontWeight>()
  const raw = metadata?.runWeights
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return result
  }
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const index = Number(key)
    const weight = typeof value === "number" ? value : Number(value)
    if (!Number.isInteger(index) || index < 0 || !isFontWeight(weight)) continue
    result.set(index, weight)
  }
  return result
}

function applyWeightToInline(
  inline: SemanticInline,
  weight: FontWeight
): SemanticInline {
  if (inline.type !== "text" && inline.type !== "pageField") return inline
  return {
    ...inline,
    style: { ...inline.style, fontWeight: weight },
    directStyle: {
      ...(inline.directStyle ?? {}),
      fontWeight: weight,
    },
  }
}

function applyRunWeightsToBlocks(
  blocks: readonly SemanticBlock[],
  weights: ReadonlyMap<number, FontWeight>,
  counter: { index: number }
): readonly SemanticBlock[] {
  const next: SemanticBlock[] = []
  for (const block of blocks) {
    if (block.type === "paragraph") {
      next.push({
        ...block,
        children: block.children.map((child) => {
          if (child.type !== "text" && child.type !== "pageField") return child
          const weight = weights.get(counter.index)
          counter.index += 1
          return weight === undefined
            ? child
            : applyWeightToInline(child, weight)
        }),
      })
      continue
    }
    if (block.type === "table") {
      next.push({
        ...block,
        rows: block.rows.map((row) => ({
          ...row,
          cells: row.cells.map((cell) => ({
            ...cell,
            blocks: applyRunWeightsToParagraphs(cell.blocks, weights, counter),
          })),
        })),
      })
      continue
    }
    next.push(block)
  }
  return next
}

function applyRunWeightsToParagraphs(
  blocks: readonly SemanticParagraph[],
  weights: ReadonlyMap<number, FontWeight>,
  counter: { index: number }
): readonly SemanticParagraph[] {
  return blocks.map((block) => ({
    ...block,
    children: block.children.map((child) => {
      if (child.type !== "text" && child.type !== "pageField") return child
      const weight = weights.get(counter.index)
      counter.index += 1
      return weight === undefined ? child : applyWeightToInline(child, weight)
    }),
  }))
}

function applyRunWeightsFromMetadata(
  document: SemanticDocument
): SemanticDocument {
  const weights = parseRunWeights(document.editorMetadata)
  if (weights.size === 0) return document
  const counter = { index: 0 }
  const mapHeaderFooter = (
    entry: SemanticHeaderFooter
  ): SemanticHeaderFooter => ({
    ...entry,
    blocks: applyRunWeightsToParagraphs(entry.blocks, weights, counter),
  })
  // Match serialize order: sections, then headers, then footers.
  const sections: readonly SemanticSection[] = document.sections.map(
    (section) => ({
      ...section,
      blocks: applyRunWeightsToBlocks(section.blocks, weights, counter),
    })
  )
  return {
    ...document,
    sections,
    headers: document.headers.map(mapHeaderFooter),
    footers: document.footers.map(mapHeaderFooter),
  }
}
