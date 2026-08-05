import { nodeId, twips } from "@apex-docx-pdf/core"
import type {
  OperationResult,
  SemanticBlock,
  SemanticDocument,
  SemanticHeaderFooter,
  SemanticInline,
  SemanticParagraph,
  SemanticTable,
} from "@apex-docx-pdf/core"

import type {
  ParsedDocxDocument,
  ParsedDocxParagraph,
  ParsedDocxTable,
} from "./types"

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object") return value
  const object = value as object
  if (seen.has(object)) return value
  seen.add(object)
  for (const child of Object.values(object)) deepFreeze(child, seen)
  return Object.freeze(value)
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
          style: {
            fontFamily: run.properties.fontFamily,
            fontSize: twips(run.properties.fontSizeHalfPoints * 10),
            fontWeight: run.properties.fontWeight,
            fontStyle: run.properties.fontStyle,
            underline: run.properties.underline,
            highlightColor:
              run.properties.highlightColor === null
                ? null
                : `#${run.properties.highlightColor}`,
            verticalAlignment: run.properties.verticalAlignment,
            color: run.properties.color.startsWith("#")
              ? run.properties.color
              : `#${run.properties.color}`,
          },
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
        style: {
          fontFamily: run.properties.fontFamily,
          fontSize: twips(run.properties.fontSizeHalfPoints * 10),
          fontWeight: run.properties.fontWeight,
          fontStyle: run.properties.fontStyle,
          underline: run.properties.underline,
          highlightColor:
            run.properties.highlightColor === null
              ? null
              : `#${run.properties.highlightColor}`,
          verticalAlignment: run.properties.verticalAlignment,
          color: run.properties.color.startsWith("#")
            ? run.properties.color
            : `#${run.properties.color}`,
        },
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
    sections: document.sections.map((section, sectionIndex) => ({
      type: "section",
      id: nodeId(`docx:section:${sectionIndex + 1}`),
      source: section.source,
      properties: {
        pageWidth: twips(section.properties.pageWidth),
        pageHeight: twips(section.properties.pageHeight),
        orientation: section.properties.orientation,
        margins: {
          top: twips(section.properties.marginTop),
          right: twips(section.properties.marginRight),
          bottom: twips(section.properties.marginBottom),
          left: twips(section.properties.marginLeft),
        },
        headerDistance: twips(section.properties.headerDistance),
        footerDistance: twips(section.properties.footerDistance),
      },
      defaultHeaderId: section.defaultHeaderId,
      defaultFooterId: section.defaultFooterId,
      blocks: normaliseBlocks(section.blocks),
    })),
  }
  return {
    ok: true,
    value: deepFreeze(value),
    diagnostics: [],
  }
}
