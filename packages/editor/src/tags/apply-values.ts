import type {
  SemanticBlock,
  SemanticDocument,
  SemanticHeaderFooter,
  SemanticInline,
  SemanticParagraph,
  SemanticSection,
  SemanticTable,
  SemanticText,
} from "@apexmed/core"

import { readTemplateTagMetadata } from "./metadata"
import {
  encodeTemplatePlaceholder,
  findValuePlaceholders,
  resolveTemplateTagValue,
  templateTagExportText,
} from "./placeholder"
import type { TemplateTagDefinition, TemplateTagValues } from "./types"

/** Replace catalog placeholders with assigned values; leave unset tags as source text. */
export function applyTemplateTagValues(
  document: SemanticDocument,
  now: Date = new Date()
): SemanticDocument {
  const { tags, values } = readTemplateTagMetadata(document.editorMetadata)
  if (tags.length === 0) return document
  const bySlug = new Map(tags.map((tag) => [tag.slug, tag]))
  const mapInline = (inline: SemanticInline): SemanticInline[] => {
    if (inline.type !== "text") return [inline]
    return applyValuesToText(inline, bySlug, values, now)
  }
  return {
    ...document,
    sections: document.sections.map((section) =>
      mapSection(section, mapInline)
    ),
    headers: document.headers.map((part) => mapHeaderFooter(part, mapInline)),
    footers: document.footers.map((part) => mapHeaderFooter(part, mapInline)),
  }
}

function applyValuesToText(
  inline: SemanticText,
  bySlug: ReadonlyMap<string, TemplateTagDefinition>,
  values: TemplateTagValues,
  now: Date
): SemanticInline[] {
  const matches = findValuePlaceholders(inline.text)
  if (matches.length === 0) return [inline]
  const pieces: SemanticInline[] = []
  let cursor = 0
  for (const match of matches) {
    if (match.start > cursor) {
      pieces.push(
        styledTextPiece(inline, inline.text.slice(cursor, match.start))
      )
    }
    const tag = bySlug.get(match.slug)
    const replacement = tag
      ? templateTagExportText(tag, resolveTemplateTagValue(tag, values, now))
      : match.raw
    pieces.push(styledTextPiece(inline, replacement))
    cursor = match.end
  }
  if (cursor < inline.text.length) {
    pieces.push(styledTextPiece(inline, inline.text.slice(cursor)))
  }
  return pieces.filter(
    (piece) => piece.type !== "text" || piece.text.length > 0
  )
}

function styledTextPiece(inline: SemanticText, text: string): SemanticText {
  return {
    ...inline,
    text,
    preserveSpace: /^\s|\s$/u.test(text),
  }
}

function mapSection(
  section: SemanticSection,
  mapInline: (inline: SemanticInline) => SemanticInline[]
): SemanticSection {
  return {
    ...section,
    blocks: section.blocks.map((block) => mapBlock(block, mapInline)),
  }
}

function mapHeaderFooter(
  part: SemanticHeaderFooter,
  mapInline: (inline: SemanticInline) => SemanticInline[]
): SemanticHeaderFooter {
  return {
    ...part,
    blocks: part.blocks.map((block) => mapBlock(block, mapInline)),
  }
}

function mapBlock(
  block: SemanticBlock,
  mapInline: (inline: SemanticInline) => SemanticInline[]
): SemanticBlock {
  if (block.type === "paragraph") return mapParagraph(block, mapInline)
  if (block.type === "table") return mapTable(block, mapInline)
  return block
}

function mapParagraph(
  paragraph: SemanticParagraph,
  mapInline: (inline: SemanticInline) => SemanticInline[]
): SemanticParagraph {
  return {
    ...paragraph,
    children: paragraph.children.flatMap(mapInline),
  }
}

function mapTable(
  table: SemanticTable,
  mapInline: (inline: SemanticInline) => SemanticInline[]
): SemanticTable {
  return {
    ...table,
    rows: table.rows.map((row) => ({
      ...row,
      cells: row.cells.map((cell) => ({
        ...cell,
        blocks: cell.blocks.map((block) => mapParagraph(block, mapInline)),
      })),
    })),
  }
}

export function placeholderLookup(
  tags: readonly TemplateTagDefinition[]
): ReadonlyMap<string, TemplateTagDefinition> {
  return new Map(
    tags.flatMap((tag) => [
      [encodeTemplatePlaceholder(tag), tag],
      [tag.slug, tag],
    ])
  )
}
