import {
  createEmptyDocumentStyles,
  type DocumentStyles,
  type NumberingDefinition,
  type ParagraphProperties,
  type SemanticBlock,
  type SemanticDocument,
  type SemanticFontAsset,
  type SemanticHeaderFooter,
  type SemanticImage,
  type SemanticInline,
  type SemanticParagraph,
  type SemanticSection,
  type SemanticTable,
  type SemanticText,
  type StyleDefinition,
  type TextStyle,
} from "@apexmed/core"
import { minimalPng } from "@apexmed/images"
import { strToU8, zipSync } from "fflate"

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
const R_NS =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
const WP_NS =
  "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
const A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"
const PIC_NS = "http://schemas.openxmlformats.org/drawingml/2006/picture"
const CT_NS = "http://schemas.openxmlformats.org/package/2006/content-types"
const PKG_REL_NS =
  "http://schemas.openxmlformats.org/package/2006/relationships"
const OFFICE_DOCUMENT_REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
const STYLES_REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"
const NUMBERING_REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering"
const SETTINGS_REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings"
const FONT_TABLE_REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable"
const FONT_REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/font"
const EMBEDDED_FONT_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.obfuscatedFont"
const IMAGE_REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"
const HEADER_REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/header"
const FOOTER_REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer"
const HYPERLINK_REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink"
const CUSTOM_XML_REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml"
const ASVG_NS = "http://schemas.microsoft.com/office/drawing/2016/SVG/main"
const A14_NS = "http://schemas.microsoft.com/office/drawing/2010/main"
const SVG_BLIP_EXT_URI = "{96DAC541-7B7A-43D3-8B79-37D633B846F1}"
const USE_LOCAL_DPI_EXT_URI = "{28A0092B-C50C-407E-A947-70E740481C1C}"

function extensionForMime(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return "png"
    case "image/jpeg":
      return "jpeg"
    case "image/gif":
      return "gif"
    case "image/webp":
      return "webp"
    case "image/avif":
      return "avif"
    case "image/svg+xml":
      return "svg"
    default:
      return "bin"
  }
}

const EMU_PER_TWIP = 635

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

function colorHex(value: string): string {
  return value.startsWith("#")
    ? value.slice(1).toUpperCase()
    : value.toUpperCase()
}

function halfPoints(fontSizeTwips: number): number {
  return Math.max(1, Math.round(fontSizeTwips / 10))
}

function booleanElement(name: string, value: boolean | undefined): string {
  if (value === undefined) return ""
  return value ? `<w:${name}/>` : `<w:${name} w:val="0"/>`
}

/**
 * Collect precise font weights that OOXML cannot express (only boolean bold).
 * Keys are 0-based indexes of text/pageField runs in document order.
 */
function collectRunWeights(
  document: SemanticDocument
): Readonly<Record<string, number>> {
  const weights: Record<string, number> = {}
  let index = 0
  const visitInlines = (inlines: readonly SemanticInline[]): void => {
    for (const inline of inlines) {
      if (inline.type === "text" || inline.type === "pageField") {
        const weight = inline.style.fontWeight
        if (weight !== 400 && weight !== 700) {
          weights[String(index)] = weight
        }
        index += 1
      }
    }
  }
  const visitBlocks = (blocks: readonly SemanticBlock[]): void => {
    for (const block of blocks) {
      if (block.type === "paragraph") {
        visitInlines(block.children)
      } else if (block.type === "table") {
        for (const row of block.rows) {
          for (const cell of row.cells) {
            visitBlocks(cell.blocks)
          }
        }
      }
    }
  }
  for (const section of document.sections) visitBlocks(section.blocks)
  for (const header of document.headers) visitBlocks(header.blocks)
  for (const footer of document.footers) visitBlocks(footer.blocks)
  return Object.freeze(weights)
}

function textStyleXml(style: TextStyle, styleId?: string | null): string {
  const parts: string[] = []
  if (styleId) parts.push(`<w:rStyle w:val="${escapeXml(styleId)}"/>`)
  parts.push(
    `<w:rFonts w:ascii="${escapeXml(style.fontFamily)}" w:hAnsi="${escapeXml(style.fontFamily)}"/>`
  )
  // OOXML only has boolean bold; precise weights live in apexEditor.json runWeights.
  parts.push(booleanElement("b", style.fontWeight >= 700))
  parts.push(booleanElement("i", style.fontStyle === "italic"))
  if (style.underline) parts.push(`<w:u w:val="single"/>`)
  else parts.push(`<w:u w:val="none"/>`)
  if (style.strikethrough) parts.push(`<w:strike/>`)
  else parts.push(`<w:strike w:val="0"/>`)
  parts.push(`<w:color w:val="${colorHex(style.color)}"/>`)
  parts.push(`<w:sz w:val="${halfPoints(style.fontSize)}"/>`)
  parts.push(`<w:szCs w:val="${halfPoints(style.fontSize)}"/>`)
  if (style.verticalAlignment && style.verticalAlignment !== "baseline") {
    parts.push(`<w:vertAlign w:val="${style.verticalAlignment}"/>`)
  }
  if (style.highlightColor) {
    // Map common hex colors back to Word highlight names when possible.
    const name = highlightName(style.highlightColor)
    if (name) parts.push(`<w:highlight w:val="${name}"/>`)
  }
  return `<w:rPr>${parts.join("")}</w:rPr>`
}

function highlightName(hex: string): string | undefined {
  const normalized = colorHex(hex)
  const map: Record<string, string> = {
    FFFF00: "yellow",
    "00FF00": "green",
    "00FFFF": "cyan",
    FF00FF: "magenta",
    "0000FF": "blue",
    FF0000: "red",
    "000080": "darkBlue",
    "008080": "darkCyan",
    "008000": "darkGreen",
    "800080": "darkMagenta",
    "800000": "darkRed",
    "808000": "darkYellow",
    "808080": "darkGray",
    C0C0C0: "lightGray",
    "000000": "black",
  }
  return map[normalized]
}

function paragraphPropertiesXml(
  properties: ParagraphProperties,
  styleId?: string | null,
  includeSectPr = false,
  sectPrXml = ""
): string {
  const parts: string[] = []
  if (styleId) parts.push(`<w:pStyle w:val="${escapeXml(styleId)}"/>`)
  if (properties.keepWithNext) parts.push(`<w:keepNext/>`)
  if (properties.keepLinesTogether) parts.push(`<w:keepLines/>`)
  if (properties.pageBreakBefore) parts.push(`<w:pageBreakBefore/>`)
  parts.push(
    properties.widowControl
      ? `<w:widowControl/>`
      : `<w:widowControl w:val="0"/>`
  )
  if (properties.numbering) {
    const numId = properties.numbering.definitionId.replace(/^docx-num-/, "")
    parts.push(
      `<w:numPr><w:ilvl w:val="${properties.numbering.level}"/><w:numId w:val="${escapeXml(numId)}"/></w:numPr>`
    )
  }
  const spacingAttrs: string[] = []
  if (properties.spacingBefore)
    spacingAttrs.push(`w:before="${properties.spacingBefore}"`)
  if (properties.spacingAfter)
    spacingAttrs.push(`w:after="${properties.spacingAfter}"`)
  if (properties.lineSpacing) {
    if (properties.lineSpacing.rule === "auto") {
      spacingAttrs.push(
        `w:line="${properties.lineSpacing.value240ths}" w:lineRule="auto"`
      )
    } else {
      spacingAttrs.push(
        `w:line="${properties.lineSpacing.value}" w:lineRule="${properties.lineSpacing.rule}"`
      )
    }
  }
  if (spacingAttrs.length > 0)
    parts.push(`<w:spacing ${spacingAttrs.join(" ")}/>`)
  const indentAttrs: string[] = []
  if (properties.indentStart)
    indentAttrs.push(`w:left="${properties.indentStart}"`)
  if (properties.indentEnd)
    indentAttrs.push(`w:right="${properties.indentEnd}"`)
  if (properties.firstLineIndent)
    indentAttrs.push(`w:firstLine="${properties.firstLineIndent}"`)
  if (indentAttrs.length > 0) parts.push(`<w:ind ${indentAttrs.join(" ")}/>`)
  if (properties.alignment !== "left")
    parts.push(`<w:jc w:val="${properties.alignment}"/>`)
  if (properties.tabStops && properties.tabStops.length > 0) {
    parts.push(
      `<w:tabs>${properties.tabStops
        .map((stop) => `<w:tab w:val="left" w:pos="${stop.position}"/>`)
        .join("")}</w:tabs>`
    )
  }
  if (includeSectPr) parts.push(sectPrXml)
  if (parts.length === 0) return ""
  return `<w:pPr>${parts.join("")}</w:pPr>`
}

function textXml(text: SemanticText): string {
  const preserve =
    text.preserveSpace === true || /^\s|\s$/u.test(text.text)
      ? ` xml:space="preserve"`
      : ""
  return `<w:t${preserve}>${escapeXml(text.text)}</w:t>`
}

function inlineXml(
  inline: SemanticInline,
  style: TextStyle,
  styleId: string | null | undefined,
  imageRels: ReadonlyMap<string, string>
): string {
  if (inline.type === "text") {
    return `<w:r>${textStyleXml(style, styleId)}${textXml(inline)}</w:r>`
  }
  if (inline.type === "break") {
    if (inline.kind === "page") {
      return `<w:r><w:br w:type="page"/></w:r>`
    }
    if (inline.kind === "column") {
      return `<w:r><w:br w:type="column"/></w:r>`
    }
    return `<w:r><w:br/></w:r>`
  }
  if (inline.type === "tab") {
    return `<w:r><w:tab/></w:r>`
  }
  if (inline.type === "pageField") {
    return (
      `<w:r>${textStyleXml(style, styleId)}` +
      `<w:fldChar w:fldCharType="begin"/></w:r>` +
      `<w:r>${textStyleXml(style, styleId)}` +
      `<w:instrText xml:space="preserve"> ${inline.field} </w:instrText></w:r>` +
      `<w:r>${textStyleXml(style, styleId)}` +
      `<w:fldChar w:fldCharType="separate"/></w:r>` +
      `<w:r>${textStyleXml(style, styleId)}` +
      `<w:t>${escapeXml(inline.displayText)}</w:t></w:r>` +
      `<w:r>${textStyleXml(style, styleId)}` +
      `<w:fldChar w:fldCharType="end"/></w:r>`
    )
  }
  if (inline.type === "image") {
    return imageXml(inline, imageRels)
  }
  return ""
}

function imageXml(
  image: SemanticImage,
  imageRels: ReadonlyMap<string, string>
): string {
  const rId = imageRels.get(image.assetId)
  if (rId === undefined) return ""
  const cx = image.width * EMU_PER_TWIP
  const cy = image.height * EMU_PER_TWIP
  const name = `Picture ${image.assetId}`
  const svgRId = imageRels.get(`${image.assetId}::svg`)
  const blipInner = svgRId
    ? `<a:blip r:embed="${rId}">` +
      `<a:extLst>` +
      `<a:ext uri="${USE_LOCAL_DPI_EXT_URI}">` +
      `<a14:useLocalDpi xmlns:a14="${A14_NS}" val="0"/>` +
      `</a:ext>` +
      `<a:ext uri="${SVG_BLIP_EXT_URI}">` +
      `<asvg:svgBlip xmlns:asvg="${ASVG_NS}" r:embed="${svgRId}"/>` +
      `</a:ext>` +
      `</a:extLst>` +
      `</a:blip>`
    : `<a:blip r:embed="${rId}"/>`
  const anchor = image.placement?.type === "anchor" ? image.placement : null
  const anchored = anchor !== null
  const frameOpen = anchor
    ? `<wp:anchor allowOverlap="1" behindDoc="0" distB="0" distT="0" distL="0" distR="0" hidden="0" layoutInCell="1" locked="0" relativeHeight="0" simplePos="0">` +
      `<wp:simplePos x="0" y="0"/>` +
      `<wp:positionH relativeFrom="column"><wp:posOffset>${anchor.offsetX * EMU_PER_TWIP}</wp:posOffset></wp:positionH>` +
      `<wp:positionV relativeFrom="paragraph"><wp:posOffset>${anchor.offsetY * EMU_PER_TWIP}</wp:posOffset></wp:positionV>`
    : `<wp:inline distT="0" distB="0" distL="0" distR="0">`
  const frameClose = anchored ? `</wp:anchor>` : `</wp:inline>`
  return (
    `<w:r><w:drawing>` +
    frameOpen +
    `<wp:extent cx="${cx}" cy="${cy}"/>` +
    (anchored
      ? `<wp:effectExtent b="0" l="0" r="0" t="0"/><wp:wrapSquare wrapText="bothSides" distB="0" distT="0" distL="0" distR="0"/>`
      : "") +
    `<wp:docPr id="1" name="${escapeXml(name)}"/>` +
    `<a:graphic xmlns:a="${A_NS}">` +
    `<a:graphicData uri="${PIC_NS}">` +
    `<pic:pic xmlns:pic="${PIC_NS}">` +
    `<pic:nvPicPr><pic:cNvPr id="0" name="${escapeXml(name)}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill>${blipInner}<a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic>${frameClose}</w:drawing></w:r>`
  )
}

function paragraphXml(
  paragraph: SemanticParagraph,
  imageRels: ReadonlyMap<string, string>,
  hyperlinkRelsOrSectPr?: Map<string, string> | string | null,
  documentRels?: Array<{ id: string; type: string; target: string }> | null,
  nextRId?: (() => string) | null,
  trailingSectPr = ""
): string {
  let hyperlinkRels = new Map<string, string>()
  let rels: Array<{ id: string; type: string; target: string }> = []
  let alloc: () => string = () => "rIdLocal"
  if (typeof hyperlinkRelsOrSectPr === "string") {
    trailingSectPr = hyperlinkRelsOrSectPr
  } else if (hyperlinkRelsOrSectPr) {
    hyperlinkRels = hyperlinkRelsOrSectPr
    rels = documentRels ?? rels
    alloc = nextRId ?? alloc
  }
  const pPr = paragraphPropertiesXml(
    paragraph.properties,
    paragraph.styleId,
    trailingSectPr.length > 0,
    trailingSectPr
  )
  const runs = groupParagraphInlines(paragraph.children)
    .map((group) => {
      if (group.kind === "hyperlink") {
        let rId = hyperlinkRels.get(group.href)
        if (rId === undefined) {
          rId = alloc()
          hyperlinkRels.set(group.href, rId)
          rels.push({
            id: rId,
            type: HYPERLINK_REL,
            target: group.href,
          })
        }
        const inner = group.children
          .map((child) =>
            inlineXml(child, child.style, child.styleId, imageRels)
          )
          .join("")
        return `<w:hyperlink r:id="${rId}">${inner}</w:hyperlink>`
      }
      const child = group.child
      if (child.type === "text") {
        return inlineXml(child, child.style, child.styleId, imageRels)
      }
      if (child.type === "pageField") {
        return inlineXml(child, child.style, child.styleId, imageRels)
      }
      return inlineXml(
        child,
        {
          fontFamily: "Calibri",
          fontSize: 220 as never,
          fontWeight: 400,
          fontStyle: "normal",
          underline: false,
          strikethrough: false,
          color: "#000000",
        },
        null,
        imageRels
      )
    })
    .join("")
  const paragraphMarkRun =
    runs.length === 0 && paragraph.paragraphMarkStyle
      ? `<w:r>${textStyleXml(paragraph.paragraphMarkStyle, null)}</w:r>`
      : ""
  return `<w:p>${pPr}${runs}${paragraphMarkRun}</w:p>`
}

type ParagraphInlineGroup =
  | Readonly<{ kind: "inline"; child: SemanticInline }>
  | Readonly<{
      kind: "hyperlink"
      href: string
      children: readonly SemanticText[]
    }>

function groupParagraphInlines(
  children: readonly SemanticInline[]
): readonly ParagraphInlineGroup[] {
  const groups: ParagraphInlineGroup[] = []
  let hyperlinkGroup: Extract<
    ParagraphInlineGroup,
    { kind: "hyperlink" }
  > | null = null
  const flushHyperlink = (): void => {
    if (hyperlinkGroup) {
      groups.push(hyperlinkGroup)
      hyperlinkGroup = null
    }
  }
  for (const child of children) {
    if (child.type === "text" && child.href) {
      if (hyperlinkGroup && hyperlinkGroup.href === child.href) {
        hyperlinkGroup = {
          kind: "hyperlink",
          href: child.href,
          children: [...hyperlinkGroup.children, child],
        }
      } else {
        flushHyperlink()
        hyperlinkGroup = {
          kind: "hyperlink",
          href: child.href,
          children: [child],
        }
      }
      continue
    }
    flushHyperlink()
    groups.push({ kind: "inline", child })
  }
  flushHyperlink()
  return groups
}

function tableBorderXml(
  name: string,
  border: SemanticTable["borders"]["top"]
): string {
  if (border === null) return `<w:${name} w:val="nil"/>`
  const size = Math.max(0, Math.round((border.width * 8) / 20))
  const space = Math.max(0, Math.round(border.space / 20))
  return `<w:${name} w:val="${border.style}" w:sz="${size}" w:space="${space}" w:color="${colorHex(border.color)}"/>`
}

function tableXml(
  table: SemanticTable,
  imageRels: ReadonlyMap<string, string>,
  hyperlinkRels?: Map<string, string> | null,
  documentRels?: Array<{ id: string; type: string; target: string }> | null,
  nextRId?: (() => string) | null
): string {
  const grid = table.columnWidths
    .map((width) => `<w:gridCol w:w="${width}"/>`)
    .join("")
  const borders = table.borders
  const tblBorders =
    `<w:tblBorders>` +
    tableBorderXml("top", borders.top) +
    tableBorderXml("left", borders.left) +
    tableBorderXml("bottom", borders.bottom) +
    tableBorderXml("right", borders.right) +
    tableBorderXml("insideH", borders.insideHorizontal) +
    tableBorderXml("insideV", borders.insideVertical) +
    `</w:tblBorders>`
  const cellMar =
    `<w:tblCellMar>` +
    `<w:top w:w="${table.cellPadding.top}" w:type="dxa"/>` +
    `<w:left w:w="${table.cellPadding.left}" w:type="dxa"/>` +
    `<w:bottom w:w="${table.cellPadding.bottom}" w:type="dxa"/>` +
    `<w:right w:w="${table.cellPadding.right}" w:type="dxa"/>` +
    `</w:tblCellMar>`
  const alignment = table.alignment ?? "left"
  const tblPr =
    `<w:tblPr>` +
    `<w:tblW w:w="${table.preferredWidth ?? table.width}" w:type="dxa"/>` +
    (alignment !== "left" ? `<w:jc w:val="${alignment}"/>` : "") +
    ((table.indentStart ?? 0) > 0
      ? `<w:tblInd w:w="${table.indentStart}" w:type="dxa"/>`
      : "") +
    `<w:tblLayout w:type="${table.layout === "fixed" ? "fixed" : "autofit"}"/>` +
    tblBorders +
    cellMar +
    `</w:tblPr>`
  const rows = table.rows
    .map((row) => {
      const trPrParts: string[] = []
      if (row.repeatAsHeader) trPrParts.push(`<w:tblHeader/>`)
      if (!row.allowBreakAcrossPages) trPrParts.push(`<w:cantSplit/>`)
      if (row.height) {
        trPrParts.push(
          `<w:trHeight w:val="${row.height.value}" w:hRule="${row.height.rule}"/>`
        )
      }
      const trPr =
        trPrParts.length > 0 ? `<w:trPr>${trPrParts.join("")}</w:trPr>` : ""
      const cells = row.cells
        .map((cell) => {
          const tcPrParts: string[] = [
            `<w:tcW w:w="${cell.preferredWidth ?? cell.width}" w:type="dxa"/>`,
          ]
          if (cell.columnSpan > 1)
            tcPrParts.push(`<w:gridSpan w:val="${cell.columnSpan}"/>`)
          if (cell.verticalMerge === "restart")
            tcPrParts.push(`<w:vMerge w:val="restart"/>`)
          else if (cell.verticalMerge === "continue")
            tcPrParts.push(`<w:vMerge/>`)
          if (cell.verticalAlignment !== "top")
            tcPrParts.push(`<w:vAlign w:val="${cell.verticalAlignment}"/>`)
          if (cell.cellPadding) {
            tcPrParts.push(
              `<w:tcMar>` +
                `<w:top w:w="${cell.cellPadding.top}" w:type="dxa"/>` +
                `<w:left w:w="${cell.cellPadding.left}" w:type="dxa"/>` +
                `<w:bottom w:w="${cell.cellPadding.bottom}" w:type="dxa"/>` +
                `<w:right w:w="${cell.cellPadding.right}" w:type="dxa"/>` +
                `</w:tcMar>`
            )
          }
          if (cell.fillColor)
            tcPrParts.push(
              `<w:shd w:val="clear" w:color="auto" w:fill="${colorHex(cell.fillColor)}"/>`
            )
          const cellBorders = cell.borders
          if (
            cellBorders.top ||
            cellBorders.right ||
            cellBorders.bottom ||
            cellBorders.left
          ) {
            tcPrParts.push(
              `<w:tcBorders>` +
                tableBorderXml("top", cellBorders.top) +
                tableBorderXml("left", cellBorders.left) +
                tableBorderXml("bottom", cellBorders.bottom) +
                tableBorderXml("right", cellBorders.right) +
                `</w:tcBorders>`
            )
          }
          const blocks = cell.blocks
            .map((block) =>
              paragraphXml(
                block,
                imageRels,
                hyperlinkRels,
                documentRels,
                nextRId
              )
            )
            .join("")
          const body = blocks.length > 0 ? blocks : `<w:p/>`
          return `<w:tc><w:tcPr>${tcPrParts.join("")}</w:tcPr>${body}</w:tc>`
        })
        .join("")
      return `<w:tr>${trPr}${cells}</w:tr>`
    })
    .join("")
  return `<w:tbl>${tblPr}<w:tblGrid>${grid}</w:tblGrid>${rows}</w:tbl>`
}

function horizontalRuleXml(
  block: Extract<SemanticBlock, { type: "horizontalRule" }>
): string {
  // Emit as a simple paragraph with bottom border — preserves presence for round-trip of K3 rules as paragraphs.
  return (
    `<w:p><w:pPr>` +
    paragraphPropertiesXml(block.properties).replace(
      /^<w:pPr>|<\/w:pPr>$/g,
      ""
    ) +
    `<w:pBdr><w:bottom w:val="single" w:sz="12" w:space="1" w:color="${colorHex(block.color)}"/></w:pBdr>` +
    `</w:pPr></w:p>`
  )
}

function blockXml(
  block: SemanticBlock,
  imageRels: ReadonlyMap<string, string>,
  hyperlinkRels?: Map<string, string> | null,
  documentRels?: Array<{ id: string; type: string; target: string }> | null,
  nextRId?: (() => string) | null
): string {
  if (block.type === "paragraph")
    return paragraphXml(block, imageRels, hyperlinkRels, documentRels, nextRId)
  if (block.type === "table")
    return tableXml(block, imageRels, hyperlinkRels, documentRels, nextRId)
  return horizontalRuleXml(block)
}

function sectionColumnsXml(
  columns: NonNullable<SemanticSection["properties"]["columns"]>
): string {
  const attrs = [
    `w:num="${columns.count}"`,
    `w:space="${columns.space}"`,
    `w:equalWidth="${columns.equalWidth ? 1 : 0}"`,
    ...(columns.separator ? [`w:sep="1"`] : []),
  ]
  if (
    !columns.equalWidth &&
    columns.widths !== null &&
    columns.widths !== undefined &&
    columns.widths.length > 0
  ) {
    const widths = columns.widths
    const cols = widths
      .map((width, index) => {
        const space =
          index < widths.length - 1 ? ` w:space="${columns.space}"` : ""
        return `<w:col w:w="${width}"${space}/>`
      })
      .join("")
    return `<w:cols ${attrs.join(" ")}>${cols}</w:cols>`
  }
  return `<w:cols ${attrs.join(" ")}/>`
}

function sectionPropertiesXml(
  section: SemanticSection,
  headerRId: string | null,
  footerRId: string | null,
  firstPageHeaderRId: string | null,
  firstPageFooterRId: string | null
): string {
  const p = section.properties
  const refs: string[] = []
  if (headerRId)
    refs.push(`<w:headerReference w:type="default" r:id="${headerRId}"/>`)
  if (footerRId)
    refs.push(`<w:footerReference w:type="default" r:id="${footerRId}"/>`)
  if (firstPageHeaderRId)
    refs.push(
      `<w:headerReference w:type="first" r:id="${firstPageHeaderRId}"/>`
    )
  if (firstPageFooterRId)
    refs.push(
      `<w:footerReference w:type="first" r:id="${firstPageFooterRId}"/>`
    )
  const cols =
    p.columns !== null &&
    p.columns !== undefined &&
    (p.columns.count > 1 ||
      p.columns.separator ||
      !p.columns.equalWidth ||
      p.columns.space !== 720)
      ? sectionColumnsXml(p.columns)
      : p.columns !== null && p.columns !== undefined && p.columns.count === 1
        ? sectionColumnsXml(p.columns)
        : ""
  return (
    `<w:sectPr>` +
    refs.join("") +
    `<w:pgSz w:w="${p.pageWidth}" w:h="${p.pageHeight}"${
      p.orientation === "landscape" ? ` w:orient="landscape"` : ""
    }/>` +
    `<w:pgMar w:top="${p.margins.top}" w:right="${p.margins.right}" w:bottom="${p.margins.bottom}" w:left="${p.margins.left}" w:header="${p.headerDistance}" w:footer="${p.footerDistance}"/>` +
    (p.differentFirstPage ? `<w:titlePg/>` : "") +
    cols +
    `</w:sectPr>`
  )
}

function stylesXml(styles: DocumentStyles): string {
  const docDefaults =
    `<w:docDefaults>` +
    `<w:rPrDefault><w:rPr>` +
    textStyleXml(styles.defaults.text).replace(/^<w:rPr>|<\/w:rPr>$/g, "") +
    `</w:rPr></w:rPrDefault>` +
    `<w:pPrDefault><w:pPr>` +
    paragraphPropertiesXml(styles.defaults.paragraph).replace(
      /^<w:pPr>|<\/w:pPr>$/g,
      ""
    ) +
    `</w:pPr></w:pPrDefault>` +
    `</w:docDefaults>`

  const definitions = styles.definitions
    .map((definition) => styleDefinitionXml(definition, styles))
    .join("")

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:styles xmlns:w="${W_NS}">${docDefaults}${definitions}</w:styles>`
  )
}

function styleDefinitionXml(
  definition: StyleDefinition,
  styles: DocumentStyles
): string {
  const parts: string[] = [`<w:name w:val="${escapeXml(definition.name)}"/>`]
  if (definition.basedOn)
    parts.push(`<w:basedOn w:val="${escapeXml(definition.basedOn)}"/>`)
  if (definition.next)
    parts.push(`<w:next w:val="${escapeXml(definition.next)}"/>`)
  parts.push(`<w:qFormat/>`)
  if (definition.paragraph) {
    const resolved = {
      ...styles.defaults.paragraph,
      ...definition.paragraph,
    }
    parts.push(paragraphPropertiesXml(resolved))
  }
  if (definition.text) {
    const resolved = { ...styles.defaults.text, ...definition.text }
    parts.push(textStyleXml(resolved))
  }
  const isDefault =
    (definition.type === "paragraph" &&
      styles.defaultParagraphStyleId === definition.id) ||
    (definition.type === "character" &&
      styles.defaultCharacterStyleId === definition.id)
  return `<w:style w:type="${definition.type}" w:styleId="${escapeXml(definition.id)}"${
    isDefault ? ` w:default="1"` : ""
  }>${parts.join("")}</w:style>`
}

function numberingXml(definitions: readonly NumberingDefinition[]): string {
  if (definitions.length === 0) {
    return (
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:numbering xmlns:w="${W_NS}"/>`
    )
  }
  const abstracts = definitions
    .map((definition, index) => {
      const levels = definition.levels
        .map((level) => {
          return (
            `<w:lvl w:ilvl="${level.level}">` +
            `<w:start w:val="${level.startAt}"/>` +
            `<w:numFmt w:val="${level.format}"/>` +
            `<w:lvlText w:val="${escapeXml(level.levelText)}"/>` +
            `<w:lvlJc w:val="${level.alignment}"/>` +
            `<w:pPr><w:ind w:left="${level.indentStart}" w:hanging="${Math.max(0, -level.firstLineIndent)}"/></w:pPr>` +
            (level.legal ? `<w:isLgl/>` : "") +
            (level.restartAfterLevel !== null
              ? `<w:lvlRestart w:val="${level.restartAfterLevel}"/>`
              : "") +
            `</w:lvl>`
          )
        })
        .join("")
      return `<w:abstractNum w:abstractNumId="${index}">${levels}</w:abstractNum>`
    })
    .join("")
  const nums = definitions
    .map((definition, index) => {
      const numId = definition.id.replace(/^docx-num-/, "") || String(index + 1)
      return `<w:num w:numId="${escapeXml(numId)}"><w:abstractNumId w:val="${index}"/></w:num>`
    })
    .join("")
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:numbering xmlns:w="${W_NS}">${abstracts}${nums}</w:numbering>`
  )
}

function settingsXml(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:settings xmlns:w="${W_NS}"><w:compat/></w:settings>`
  )
}

type SerializedEmbeddedFont = Readonly<{
  asset: SemanticFontAsset
  relationshipId: string
  packagePath: string
  fontKey: string
  faceElement: "embedRegular" | "embedBold" | "embedItalic" | "embedBoldItalic"
}>

function faceElementForFont(
  asset: SemanticFontAsset
): SerializedEmbeddedFont["faceElement"] {
  // WordprocessingML has four embedded face slots. Preserve the closest
  // representable face for documents that carry a variable-font weight.
  if (asset.style === "italic") {
    return asset.weight >= 600 ? "embedBoldItalic" : "embedItalic"
  }
  return asset.weight >= 600 ? "embedBold" : "embedRegular"
}

function fontTableXml(
  families: readonly string[],
  embeddedFonts: readonly SerializedEmbeddedFont[]
): string {
  const unique = [...new Set(families.filter(Boolean))]
  const fonts = unique
    .map((family) => {
      const faces = embeddedFonts
        .filter((entry) => entry.asset.family === family)
        .map(
          (entry) =>
            `<w:${entry.faceElement} r:id="${entry.relationshipId}" w:fontKey="${entry.fontKey}"/>`
        )
        .join("")
      return `<w:font w:name="${escapeXml(family)}"><w:charset w:val="00"/><w:family w:val="swiss"/>${faces}</w:font>`
    })
    .join("")
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:fonts xmlns:w="${W_NS}" xmlns:r="${R_NS}">${fonts}</w:fonts>`
  )
}

/**
 * OOXML embedded-font parts are obfuscated by XORing the first 32 bytes with
 * the fontKey GUID in little-endian byte order. This is deliberately not
 * encryption, but writing it correctly keeps the result accepted by Word and
 * means our parser can recover the original program byte-for-byte.
 */
function obfuscateEmbeddedFont(
  bytes: readonly number[],
  fontKey: string
): Uint8Array {
  const hex = fontKey.replace(/[{}-]/gu, "")
  const key = Array.from({ length: 16 }, (_, index) =>
    Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  ).reverse()
  const result = Uint8Array.from(bytes)
  for (let index = 0; index < Math.min(32, result.length); index += 1) {
    result[index] = (result[index] ?? 0) ^ (key[index % key.length] ?? 0)
  }
  return result
}

/** Deterministic GUID material avoids volatile DOCX packages while remaining unique per face. */
function embeddedFontKey(asset: SemanticFontAsset, index: number): string {
  let stateA = 0x811c9dc5
  let stateB = 0x01000193
  const update = (value: number): void => {
    stateA = Math.imul(stateA ^ value, 0x01000193) >>> 0
    stateB = Math.imul(stateB ^ value, 0x85ebca6b) >>> 0
  }
  for (const value of new TextEncoder().encode(
    `${asset.id}\u0000${asset.family}\u0000${asset.weight}\u0000${asset.style}\u0000${index}`
  ))
    update(value)
  for (const value of asset.bytes) update(value)
  const words = [
    stateA,
    stateB,
    Math.imul(stateA ^ stateB, 0x27d4eb2d) >>> 0,
    Math.imul(stateA + stateB, 0x165667b1) >>> 0,
  ]
  const hex = words.map((word) => word.toString(16).padStart(8, "0")).join("")
  return `{${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}}`
}

function serializeEmbeddedFonts(
  fontAssets: readonly SemanticFontAsset[] | undefined
): readonly SerializedEmbeddedFont[] {
  if (!fontAssets?.length) return []
  const serialized: SerializedEmbeddedFont[] = []
  const occupiedFaces = new Set<string>()
  for (const asset of fontAssets) {
    const faceElement = faceElementForFont(asset)
    const faceKey = `${asset.family.toLocaleLowerCase()}\u0000${faceElement}`
    // The OOXML schema has only one of each face per family. Keeping the first
    // face is deterministic and never causes a later asset to overwrite it.
    if (occupiedFaces.has(faceKey)) continue
    occupiedFaces.add(faceKey)
    const ordinal = serialized.length + 1
    const requestedPath = asset.packagePath.replaceAll("\\", "/")
    const packagePath =
      requestedPath.startsWith("word/fonts/") &&
      !requestedPath.includes("../") &&
      !serialized.some((entry) => entry.packagePath === requestedPath)
        ? requestedPath
        : `word/fonts/font${ordinal}.odttf`
    serialized.push({
      asset,
      relationshipId: `rIdFont${ordinal}`,
      packagePath,
      fontKey: embeddedFontKey(asset, ordinal),
      faceElement,
    })
  }
  return serialized
}

function collectFontFamilies(document: SemanticDocument): string[] {
  const families = new Set<string>(["Calibri"])
  for (const asset of document.fontAssets ?? []) families.add(asset.family)
  const visitInline = (inline: SemanticInline): void => {
    if (inline.type === "text" || inline.type === "pageField") {
      families.add(inline.style.fontFamily)
    }
  }
  const visitParagraph = (paragraph: SemanticParagraph): void => {
    for (const child of paragraph.children) visitInline(child)
  }
  const visitBlock = (block: SemanticBlock): void => {
    if (block.type === "paragraph") visitParagraph(block)
    else if (block.type === "table") {
      for (const row of block.rows)
        for (const cell of row.cells)
          for (const p of cell.blocks) visitParagraph(p)
    }
  }
  for (const section of document.sections)
    for (const block of section.blocks) visitBlock(block)
  for (const header of document.headers)
    for (const block of header.blocks) visitBlock(block)
  for (const footer of document.footers)
    for (const block of footer.blocks) visitBlock(block)
  return [...families]
}

function headerFooterXml(
  value: SemanticHeaderFooter,
  imageRels: ReadonlyMap<string, string>
): string {
  const tag = value.type === "header" ? "hdr" : "ftr"
  const body = value.blocks.map((block) => blockXml(block, imageRels)).join("")
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:${tag} xmlns:w="${W_NS}" xmlns:r="${R_NS}" xmlns:wp="${WP_NS}" xmlns:a="${A_NS}" xmlns:pic="${PIC_NS}">` +
    (body || "<w:p/>") +
    `</w:${tag}>`
  )
}

function relationshipsXml(
  relationships: readonly Readonly<{
    id: string
    type: string
    target: string
  }>[]
): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="${PKG_REL_NS}">` +
    relationships
      .map(
        (rel) =>
          `<Relationship Id="${rel.id}" Type="${rel.type}" Target="${escapeXml(rel.target)}"/>`
      )
      .join("") +
    `</Relationships>`
  )
}

function contentTypesXml(
  overrides: readonly Readonly<{ partName: string; contentType: string }>[],
  defaults: readonly Readonly<{ extension: string; contentType: string }>[]
): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="${CT_NS}">` +
    defaults
      .map(
        (entry) =>
          `<Default Extension="${entry.extension}" ContentType="${entry.contentType}"/>`
      )
      .join("") +
    overrides
      .map(
        (entry) =>
          `<Override PartName="${entry.partName}" ContentType="${entry.contentType}"/>`
      )
      .join("") +
    `</Types>`
  )
}

/**
 * Serializes a SemanticDocument to a valid OOXML DOCX package.
 * Co-located with the parser so parse/serialize share one vocabulary.
 */
export function serializeDocx(document: SemanticDocument): Uint8Array {
  const styles = document.styles ?? createEmptyDocumentStyles()
  const parts: Record<string, Uint8Array> = {}
  const embeddedFonts = serializeEmbeddedFonts(document.fontAssets)
  const overrides: Array<{ partName: string; contentType: string }> = [
    {
      partName: "/word/document.xml",
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
    },
    {
      partName: "/word/styles.xml",
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml",
    },
    {
      partName: "/word/settings.xml",
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml",
    },
    {
      partName: "/word/fontTable.xml",
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml",
    },
  ]
  const defaults: Array<{ extension: string; contentType: string }> = [
    {
      extension: "rels",
      contentType: "application/vnd.openxmlformats-package.relationships+xml",
    },
    { extension: "xml", contentType: "application/xml" },
    { extension: "json", contentType: "application/json" },
  ]
  if (embeddedFonts.length > 0) {
    defaults.push({
      extension: "odttf",
      contentType: EMBEDDED_FONT_CONTENT_TYPE,
    })
  }

  // Media assets
  const imageRels = new Map<string, string>()
  const hyperlinkRels = new Map<string, string>()
  const documentRels: Array<{ id: string; type: string; target: string }> = [
    { id: "rIdStyles", type: STYLES_REL, target: "styles.xml" },
    { id: "rIdSettings", type: SETTINGS_REL, target: "settings.xml" },
    { id: "rIdFonts", type: FONT_TABLE_REL, target: "fontTable.xml" },
  ]
  let nextRel = 1
  const nextRId = (): string => {
    const id = `rId${nextRel}`
    nextRel += 1
    return id
  }

  for (const asset of document.assets) {
    if (asset.mimeType === "image/svg+xml") {
      // Dual-part: PNG blip fallback + SVG svgBlip.
      const fallbackBytes = asset.rasterFallback?.bytes
      const pngBytes = fallbackBytes
        ? Uint8Array.from(fallbackBytes)
        : minimalPng(1, 1)
      if (!defaults.some((entry) => entry.extension === "png")) {
        defaults.push({ extension: "png", contentType: "image/png" })
      }
      if (!defaults.some((entry) => entry.extension === "svg")) {
        defaults.push({ extension: "svg", contentType: "image/svg+xml" })
      }
      const pngPath = asset.rasterFallback?.packagePath?.startsWith("word/")
        ? asset.rasterFallback.packagePath
        : `word/media/${asset.id}.png`
      const svgPath = asset.packagePath.startsWith("word/")
        ? asset.packagePath
        : `word/media/${asset.id}.svg`
      const pngRel = pngPath.replace(/^word\//, "")
      const svgRel = svgPath.replace(/^word\//, "")
      const pngRId = nextRId()
      const svgRId = nextRId()
      imageRels.set(asset.id, pngRId)
      imageRels.set(`${asset.id}::svg`, svgRId)
      documentRels.push({ id: pngRId, type: IMAGE_REL, target: pngRel })
      documentRels.push({ id: svgRId, type: IMAGE_REL, target: svgRel })
      parts[pngPath] = pngBytes
      parts[svgPath] = new Uint8Array(asset.bytes)
      continue
    }

    const extension = extensionForMime(asset.mimeType)
    if (!defaults.some((entry) => entry.extension === extension)) {
      defaults.push({
        extension,
        contentType: asset.mimeType,
      })
    }
    const path = asset.packagePath.startsWith("word/")
      ? asset.packagePath
      : `word/media/${asset.id}.${extension}`
    const relative = path.replace(/^word\//, "")
    const rId = nextRId()
    imageRels.set(asset.id, rId)
    documentRels.push({ id: rId, type: IMAGE_REL, target: relative })
    parts[path] = new Uint8Array(asset.bytes)
  }

  if (document.numberingDefinitions.length > 0) {
    overrides.push({
      partName: "/word/numbering.xml",
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml",
    })
    documentRels.push({
      id: "rIdNumbering",
      type: NUMBERING_REL,
      target: "numbering.xml",
    })
    parts["word/numbering.xml"] = strToU8(
      numberingXml(document.numberingDefinitions)
    )
  }

  const headerRIds = new Map<string, string>()
  for (const header of document.headers) {
    const rId = nextRId()
    headerRIds.set(header.id, rId)
    const fileName = `header-${header.id.replace(/[^a-zA-Z0-9_-]/g, "_")}.xml`
    documentRels.push({ id: rId, type: HEADER_REL, target: fileName })
    overrides.push({
      partName: `/word/${fileName}`,
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml",
    })
    parts[`word/${fileName}`] = strToU8(headerFooterXml(header, imageRels))
  }
  const footerRIds = new Map<string, string>()
  for (const footer of document.footers) {
    const rId = nextRId()
    footerRIds.set(footer.id, rId)
    const fileName = `footer-${footer.id.replace(/[^a-zA-Z0-9_-]/g, "_")}.xml`
    documentRels.push({ id: rId, type: FOOTER_REL, target: fileName })
    overrides.push({
      partName: `/word/${fileName}`,
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml",
    })
    parts[`word/${fileName}`] = strToU8(headerFooterXml(footer, imageRels))
  }

  const runWeights = collectRunWeights(document)
  const editorMetadata: Record<string, unknown> | undefined = (() => {
    const base =
      document.editorMetadata !== undefined
        ? { ...document.editorMetadata }
        : undefined
    if (Object.keys(runWeights).length === 0) return base
    return { ...(base ?? {}), runWeights }
  })()
  if (editorMetadata) {
    const rId = nextRId()
    documentRels.push({
      id: rId,
      type: CUSTOM_XML_REL,
      target: "apexEditor.json",
    })
    parts["word/apexEditor.json"] = strToU8(JSON.stringify(editorMetadata))
  }

  // Body: all sections concatenated; each intermediate section ends with
  // paragraph-owned sectPr; final body-level sectPr closes the document.
  const bodyParts: string[] = []
  document.sections.forEach((section, sectionIndex) => {
    const isLast = sectionIndex === document.sections.length - 1
    const sectPr = sectionPropertiesXml(
      section,
      section.defaultHeaderId
        ? (headerRIds.get(section.defaultHeaderId) ?? null)
        : null,
      section.defaultFooterId
        ? (footerRIds.get(section.defaultFooterId) ?? null)
        : null,
      section.firstPageHeaderId
        ? (headerRIds.get(section.firstPageHeaderId) ?? null)
        : null,
      section.firstPageFooterId
        ? (footerRIds.get(section.firstPageFooterId) ?? null)
        : null
    )
    section.blocks.forEach((block, blockIndex) => {
      const isLastBlock = blockIndex === section.blocks.length - 1
      if (!isLast && isLastBlock && block.type === "paragraph") {
        bodyParts.push(
          paragraphXml(
            block,
            imageRels,
            hyperlinkRels,
            documentRels,
            nextRId,
            sectPr
          )
        )
      } else if (!isLast && isLastBlock) {
        bodyParts.push(
          blockXml(block, imageRels, hyperlinkRels, documentRels, nextRId)
        )
        bodyParts.push(`<w:p><w:pPr>${sectPr}</w:pPr></w:p>`)
      } else {
        bodyParts.push(
          blockXml(block, imageRels, hyperlinkRels, documentRels, nextRId)
        )
      }
    })
    if (isLast) bodyParts.push(sectPr)
  })

  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W_NS}" xmlns:r="${R_NS}" xmlns:wp="${WP_NS}" xmlns:a="${A_NS}" xmlns:pic="${PIC_NS}">` +
    `<w:body>${bodyParts.join("")}</w:body></w:document>`

  parts["[Content_Types].xml"] = strToU8(contentTypesXml(overrides, defaults))
  parts["_rels/.rels"] = strToU8(
    relationshipsXml([
      {
        id: "rId1",
        type: OFFICE_DOCUMENT_REL,
        target: "word/document.xml",
      },
    ])
  )
  parts["word/document.xml"] = strToU8(documentXml)
  parts["word/_rels/document.xml.rels"] = strToU8(
    relationshipsXml(documentRels)
  )
  parts["word/styles.xml"] = strToU8(stylesXml(styles))
  parts["word/settings.xml"] = strToU8(settingsXml())
  parts["word/fontTable.xml"] = strToU8(
    fontTableXml(collectFontFamilies(document), embeddedFonts)
  )
  if (embeddedFonts.length > 0) {
    parts["word/_rels/fontTable.xml.rels"] = strToU8(
      relationshipsXml(
        embeddedFonts.map((entry) => ({
          id: entry.relationshipId,
          type: FONT_REL,
          target: entry.packagePath.replace(/^word\//, ""),
        }))
      )
    )
    for (const entry of embeddedFonts) {
      parts[entry.packagePath] = obfuscateEmbeddedFont(
        entry.asset.bytes,
        entry.fontKey
      )
    }
  }

  return zipSync(parts, {
    level: 6,
    mtime: new Date("1980-01-01T00:00:00.000Z"),
  })
}
