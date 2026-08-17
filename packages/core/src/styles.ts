import { nodeId } from "./ids"
import type {
  DocumentStyles,
  ParagraphProperties,
  SemanticBlock,
  SemanticDocument,
  SemanticHeaderFooter,
  SemanticInline,
  SemanticParagraph,
  SemanticSection,
  SemanticTable,
  SemanticTableCell,
  SemanticTableRow,
  SemanticText,
  StyleDefinition,
  StyleId,
  TextStyle,
} from "./document"
import { twips } from "./units"

/** Authoring default body text (Inter 11pt black). */
export const DEFAULT_TEXT_STYLE: TextStyle = Object.freeze({
  fontFamily: "Inter",
  fontSize: twips(220),
  fontWeight: 400,
  fontStyle: "normal",
  underline: false,
  strikethrough: false,
  color: "#000000",
  highlightColor: null,
  verticalAlignment: "baseline",
})

/** Word-compatible default paragraph properties. */
export const DEFAULT_PARAGRAPH_PROPERTIES: ParagraphProperties = Object.freeze({
  alignment: "left",
  spacingBefore: twips(0),
  spacingAfter: twips(0),
  lineSpacing: null,
  indentStart: twips(0),
  indentEnd: twips(0),
  firstLineIndent: twips(0),
  keepWithNext: false,
  keepLinesTogether: false,
  widowControl: true,
  pageBreakBefore: false,
  numbering: null,
  tabStops: Object.freeze([]),
})

/** Empty style sheet using document defaults only. */
export function createEmptyDocumentStyles(): DocumentStyles {
  return Object.freeze({
    defaults: Object.freeze({
      text: DEFAULT_TEXT_STYLE,
      paragraph: DEFAULT_PARAGRAPH_PROPERTIES,
    }),
    definitions: Object.freeze([]),
    defaultParagraphStyleId: null,
    defaultCharacterStyleId: null,
  })
}

/**
 * Creates a blank semantic document ready for authoring. No DOCX package is
 * required. The returned document satisfies the resolved-styles invariant.
 */
export function createBlankDocument(
  options: Readonly<{
    pageWidth?: number
    pageHeight?: number
    margins?: Readonly<{
      top: number
      right: number
      bottom: number
      left: number
    }>
  }> = {}
): SemanticDocument {
  const pageWidth = twips(options.pageWidth ?? 11_906)
  const pageHeight = twips(options.pageHeight ?? 16_838)
  const margins = {
    top: twips(options.margins?.top ?? 1_440),
    right: twips(options.margins?.right ?? 1_440),
    bottom: twips(options.margins?.bottom ?? 1_440),
    left: twips(options.margins?.left ?? 1_440),
  }
  const styles = createEmptyDocumentStyles()
  const paragraph = resolveParagraph(
    {
      type: "paragraph",
      id: nodeId("blank:paragraph:1"),
      source: { part: "editor", xmlPath: "/blank/p[1]" },
      properties: DEFAULT_PARAGRAPH_PROPERTIES,
      styleId: null,
      directProperties: null,
      children: [
        {
          type: "text",
          id: nodeId("blank:text:1:1"),
          source: { part: "editor", xmlPath: "/blank/p[1]/r[1]/t[1]" },
          text: "",
          style: DEFAULT_TEXT_STYLE,
          styleId: null,
          directStyle: null,
        },
      ],
    },
    styles
  )
  const document: SemanticDocument = {
    type: "document",
    id: nodeId("blank:document:1"),
    source: { part: "editor", xmlPath: "/blank" },
    assets: [],
    headers: [],
    footers: [],
    numberingDefinitions: [],
    styles,
    sections: [
      {
        type: "section",
        id: nodeId("blank:section:1"),
        source: { part: "editor", xmlPath: "/blank/sect[1]" },
        properties: {
          pageWidth,
          pageHeight,
          orientation: pageWidth > pageHeight ? "landscape" : "portrait",
          margins,
          headerDistance: twips(720),
          footerDistance: twips(720),
        },
        defaultHeaderId: null,
        defaultFooterId: null,
        blocks: [paragraph],
      },
    ],
  }
  return resolveStyles(document)
}

function definitionMap(
  styles: DocumentStyles
): ReadonlyMap<StyleId, StyleDefinition> {
  return new Map(styles.definitions.map((definition) => [definition.id, definition]))
}

function styleChain(
  styles: DocumentStyles,
  styleId: StyleId | null | undefined,
  expectedType: StyleDefinition["type"]
): readonly StyleDefinition[] {
  if (styleId === null || styleId === undefined) return []
  const map = definitionMap(styles)
  const chain: StyleDefinition[] = []
  const visiting = new Set<string>()
  let current: string | null = styleId
  while (current !== null) {
    if (visiting.has(current)) break
    visiting.add(current)
    const definition = map.get(current)
    if (definition === undefined || definition.type !== expectedType) break
    chain.unshift(definition)
    current = definition.basedOn
  }
  return chain
}

/** Merge partial paragraph properties left-to-right (later wins). */
export function mergeParagraphProperties(
  base: ParagraphProperties,
  ...layers: readonly (Partial<ParagraphProperties> | null | undefined)[]
): ParagraphProperties {
  let result = { ...base }
  for (const layer of layers) {
    if (layer === null || layer === undefined) continue
    result = {
      ...result,
      ...layer,
      tabStops: layer.tabStops ?? result.tabStops,
      numbering:
        layer.numbering === undefined ? result.numbering : layer.numbering,
      lineSpacing:
        layer.lineSpacing === undefined
          ? result.lineSpacing
          : layer.lineSpacing,
    }
  }
  return result
}

/** Merge partial text styles left-to-right (later wins). */
export function mergeTextStyles(
  base: TextStyle,
  ...layers: readonly (Partial<TextStyle> | null | undefined)[]
): TextStyle {
  let result = { ...base }
  for (const layer of layers) {
    if (layer === null || layer === undefined) continue
    result = { ...result, ...layer }
  }
  return result
}

/**
 * Resolve a paragraph styleId + direct overrides against a style sheet.
 * Returns fully resolved ParagraphProperties.
 */
export function resolveParagraphProperties(
  styles: DocumentStyles,
  styleId: StyleId | null | undefined,
  direct: Partial<ParagraphProperties> | null | undefined
): ParagraphProperties {
  const chain = styleChain(styles, styleId, "paragraph")
  return mergeParagraphProperties(
    styles.defaults.paragraph,
    ...chain.map((entry) => entry.paragraph),
    direct
  )
}

/**
 * Resolve a character styleId + direct overrides against a style sheet.
 * Returns fully resolved TextStyle.
 */
export function resolveTextStyle(
  styles: DocumentStyles,
  styleId: StyleId | null | undefined,
  direct: Partial<TextStyle> | null | undefined
): TextStyle {
  const chain = styleChain(styles, styleId, "character")
  return mergeTextStyles(
    styles.defaults.text,
    ...chain.map((entry) => entry.text),
    direct
  )
}

function textStylesEqual(left: TextStyle, right: TextStyle): boolean {
  return (
    left.fontFamily === right.fontFamily &&
    left.fontSize === right.fontSize &&
    left.fontWeight === right.fontWeight &&
    left.fontStyle === right.fontStyle &&
    left.underline === right.underline &&
    (left.strikethrough ?? false) === (right.strikethrough ?? false) &&
    left.color === right.color &&
    (left.highlightColor ?? null) === (right.highlightColor ?? null) &&
    (left.verticalAlignment ?? "baseline") ===
      (right.verticalAlignment ?? "baseline")
  )
}

function paragraphPropertiesEqual(
  left: ParagraphProperties,
  right: ParagraphProperties
): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function resolveText(
  text: SemanticText,
  styles: DocumentStyles
): SemanticText {
  const resolved = resolveTextStyle(styles, text.styleId, text.directStyle)
  if (textStylesEqual(text.style, resolved)) return text
  return { ...text, style: resolved }
}

function resolveInline(
  inline: SemanticInline,
  styles: DocumentStyles
): SemanticInline {
  if (inline.type === "text") return resolveText(inline, styles)
  if (inline.type === "pageField") {
    const resolved = resolveTextStyle(
      styles,
      inline.styleId,
      inline.directStyle
    )
    if (textStylesEqual(inline.style, resolved)) return inline
    return { ...inline, style: resolved }
  }
  return inline
}

function resolveParagraph(
  paragraph: SemanticParagraph,
  styles: DocumentStyles
): SemanticParagraph {
  const properties = resolveParagraphProperties(
    styles,
    paragraph.styleId,
    paragraph.directProperties
  )
  const children = paragraph.children.map((child) =>
    resolveInline(child, styles)
  )
  const propsEqual = paragraphPropertiesEqual(paragraph.properties, properties)
  const childrenEqual = children.every(
    (child, index) => child === paragraph.children[index]
  )
  if (propsEqual && childrenEqual) return paragraph
  return {
    ...paragraph,
    properties,
    children,
  }
}

function resolveCell(
  cell: SemanticTableCell,
  styles: DocumentStyles
): SemanticTableCell {
  const blocks = cell.blocks.map((block) => resolveParagraph(block, styles))
  if (blocks.every((block, index) => block === cell.blocks[index])) return cell
  return { ...cell, blocks }
}

function resolveRow(
  row: SemanticTableRow,
  styles: DocumentStyles
): SemanticTableRow {
  const cells = row.cells.map((cell) => resolveCell(cell, styles))
  if (cells.every((cell, index) => cell === row.cells[index])) return row
  return { ...row, cells }
}

function resolveTable(
  table: SemanticTable,
  styles: DocumentStyles
): SemanticTable {
  const rows = table.rows.map((row) => resolveRow(row, styles))
  if (rows.every((row, index) => row === table.rows[index])) return table
  return { ...table, rows }
}

function resolveBlock(
  block: SemanticBlock,
  styles: DocumentStyles
): SemanticBlock {
  if (block.type === "paragraph") return resolveParagraph(block, styles)
  if (block.type === "table") return resolveTable(block, styles)
  return block
}

function resolveHeaderFooter(
  value: SemanticHeaderFooter,
  styles: DocumentStyles
): SemanticHeaderFooter {
  const blocks = value.blocks.map((block) => resolveParagraph(block, styles))
  if (blocks.every((block, index) => block === value.blocks[index]))
    return value
  return { ...value, blocks }
}

function resolveSection(
  section: SemanticSection,
  styles: DocumentStyles
): SemanticSection {
  const blocks = section.blocks.map((block) => resolveBlock(block, styles))
  if (blocks.every((block, index) => block === section.blocks[index]))
    return section
  return { ...section, blocks }
}

/**
 * Enforce the resolved-styles invariant across a document:
 * `style === resolve(styles, styleId, direct)` for every paragraph and text run.
 * Layout and PDF continue to read only the fully resolved values.
 */
export function resolveStyles(document: SemanticDocument): SemanticDocument {
  const styles = document.styles ?? createEmptyDocumentStyles()
  const sections = document.sections.map((section) =>
    resolveSection(section, styles)
  )
  const headers = document.headers.map((header) =>
    resolveHeaderFooter(header, styles)
  )
  const footers = document.footers.map((footer) =>
    resolveHeaderFooter(footer, styles)
  )
  const sectionsEqual = sections.every(
    (section, index) => section === document.sections[index]
  )
  const headersEqual = headers.every(
    (header, index) => header === document.headers[index]
  )
  const footersEqual = footers.every(
    (footer, index) => footer === document.footers[index]
  )
  if (
    sectionsEqual &&
    headersEqual &&
    footersEqual &&
    document.styles !== undefined
  ) {
    return document
  }
  return {
    ...document,
    styles,
    sections,
    headers,
    footers,
  }
}
