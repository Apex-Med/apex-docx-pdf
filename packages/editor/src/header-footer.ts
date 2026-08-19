import {
  createEmptyDocumentStyles,
  nodeId,
  resolveStyles,
  type SemanticBlock,
  type SemanticDocument,
  type SemanticHeaderFooter,
  type SemanticInline,
  type SemanticParagraph,
} from "@apexmed/core"

export type HeaderFooterKind = "header" | "footer"
export type HeaderFooterVariant = "default" | "first"

export const HEADER_FOOTER_CONTENT_TR_META = "apexHeaderFooterContentChanged"
export const HEADER_FOOTER_EDIT_REQUEST_EVENT =
  "apex-header-footer-edit-request"

export type HeaderFooterEditRequestDetail = Readonly<{
  sectionId: string
  kind: HeaderFooterKind
  variant: HeaderFooterVariant
  pageNumber: number
}>

export type HeaderFooterEdit = Readonly<{
  content: string
  differentFirstPage: boolean
  firstPageContent: string
}>

export function headerFooterDefinitionId(
  sectionId: string,
  kind: HeaderFooterKind,
  variant: HeaderFooterVariant
): string {
  const safeSectionId = sectionId.replace(/[^a-zA-Z0-9_-]/gu, "_")
  return `editor:${kind}:${safeSectionId}:${variant}`
}

function emptyParagraph(
  document: SemanticDocument,
  id: string,
  kind: HeaderFooterKind
): SemanticParagraph {
  return {
    type: "paragraph",
    id: nodeId(`${id}:paragraph:1`),
    source: { part: "editor", xmlPath: `/${kind}[1]/p[1]` },
    properties: (document.styles ?? createEmptyDocumentStyles()).defaults
      .paragraph,
    styleId: null,
    directProperties: null,
    children: [],
  }
}

function namespaceParagraph(
  paragraph: SemanticParagraph,
  paragraphId: string
): SemanticParagraph {
  return {
    ...paragraph,
    id: nodeId(paragraphId),
    children: paragraph.children.map((inline, inlineIndex) => ({
      ...inline,
      id: nodeId(`${paragraphId}:inline:${inlineIndex + 1}`),
    })),
  }
}

function namespaceHeaderFooterBlocks(
  blocks: readonly SemanticBlock[],
  definitionId: string,
  kind: HeaderFooterKind
): readonly SemanticBlock[] {
  return blocks.map((block, blockIndex) => {
    const blockId = `editor:${kind}-content:${definitionId}:block:${blockIndex + 1}`
    if (block.type === "paragraph") {
      return namespaceParagraph(block, `${blockId}:paragraph`)
    }
    if (block.type === "horizontalRule") {
      return { ...block, id: nodeId(`${blockId}:horizontal-rule`) }
    }
    return {
      ...block,
      id: nodeId(`${blockId}:table`),
      rows: block.rows.map((row, rowIndex) => {
        const rowId = `${blockId}:table:row:${rowIndex + 1}`
        return {
          ...row,
          id: nodeId(rowId),
          cells: row.cells.map((cell, cellIndex) => {
            const cellId = `${rowId}:cell:${cellIndex + 1}`
            return {
              ...cell,
              id: nodeId(cellId),
              blocks: cell.blocks.map((paragraph, paragraphIndex) =>
                namespaceParagraph(
                  paragraph,
                  `${cellId}:paragraph:${paragraphIndex + 1}`
                )
              ),
            }
          }),
        }
      }),
    }
  })
}

function paragraphInlines(
  text: string,
  prefix: string,
  document: SemanticDocument
): readonly SemanticInline[] {
  const style = (document.styles ?? createEmptyDocumentStyles()).defaults.text
  const parts = text.split(/(\{pages?\})/giu)
  return parts.flatMap((part, index): readonly SemanticInline[] => {
    if (!part) return []
    const token = part.toLowerCase()
    if (token === "{page}" || token === "{pages}") {
      return [
        {
          type: "pageField",
          id: nodeId(`${prefix}:field:${index + 1}`),
          source: {
            part: "editor",
            xmlPath: `/${prefix}/field[${index + 1}]`,
          },
          field: token === "{page}" ? "PAGE" : "NUMPAGES",
          displayText: "1",
          format: "decimal",
          style,
          styleId: null,
          directStyle: null,
        },
      ]
    }
    return [
      {
        type: "text",
        id: nodeId(`${prefix}:text:${index + 1}`),
        source: {
          part: "editor",
          xmlPath: `/${prefix}/text[${index + 1}]`,
        },
        text: part,
        preserveSpace: /^\s|\s$/u.test(part),
        style,
        styleId: null,
        directStyle: null,
      },
    ]
  })
}

function createDefinition(
  document: SemanticDocument,
  kind: HeaderFooterKind,
  id: string,
  content: string
): SemanticHeaderFooter {
  const properties = (document.styles ?? createEmptyDocumentStyles()).defaults
    .paragraph
  const blocks: SemanticParagraph[] = content.split("\n").map((line, index) => {
    const prefix = `${id}:paragraph:${index + 1}`
    return {
      type: "paragraph",
      id: nodeId(prefix),
      source: {
        part: "editor",
        xmlPath: `/${kind}[1]/p[${index + 1}]`,
      },
      properties,
      styleId: null,
      directProperties: null,
      children: paragraphInlines(line, prefix, document),
    }
  })
  return {
    type: kind,
    id,
    source: { part: "editor", xmlPath: `/${kind}[1]` },
    blocks,
  }
}

function inlineText(inline: SemanticInline): string {
  if (inline.type === "text") return inline.text
  if (inline.type === "pageField") {
    return inline.field === "PAGE" ? "{page}" : "{pages}"
  }
  if (inline.type === "break" && inline.kind === "line") return "\n"
  return ""
}

function paragraphText(paragraph: SemanticParagraph): string {
  return paragraph.children.map(inlineText).join("")
}

function blockText(block: SemanticBlock): string {
  if (block.type === "paragraph") return paragraphText(block)
  if (block.type === "horizontalRule") return ""
  return block.rows
    .map((row) =>
      row.cells
        .map((cell) => cell.blocks.map(paragraphText).join("\n"))
        .join("\t")
    )
    .join("\n")
}

export function headerFooterText(
  document: SemanticDocument,
  kind: HeaderFooterKind,
  id: string | null | undefined
): string {
  if (!id) return ""
  const definitions = kind === "header" ? document.headers : document.footers
  const definition = definitions.find((entry) => entry.id === id)
  return (
    definition?.blocks
      .map(blockText)
      .join("\n") ?? ""
  )
}

/** Apply a plain-text header/footer edit to one section without mutating peers. */
export function applyHeaderFooterEdit(
  document: SemanticDocument,
  sectionId: string,
  kind: HeaderFooterKind,
  edit: HeaderFooterEdit
): SemanticDocument {
  const sectionIndex = document.sections.findIndex(
    (section) => String(section.id) === sectionId
  )
  if (sectionIndex < 0) throw new RangeError(`Unknown section '${sectionId}'`)

  const defaultId = headerFooterDefinitionId(sectionId, kind, "default")
  const firstId = headerFooterDefinitionId(sectionId, kind, "first")
  const defaultDefinition = edit.content
    ? createDefinition(document, kind, defaultId, edit.content)
    : null
  const firstDefinition = edit.firstPageContent
    ? createDefinition(document, kind, firstId, edit.firstPageContent)
    : null
  const currentDefinitions =
    kind === "header" ? document.headers : document.footers
  const definitions = [
    ...currentDefinitions.filter(
      (entry) => entry.id !== defaultId && entry.id !== firstId
    ),
    ...(defaultDefinition ? [defaultDefinition] : []),
    ...(firstDefinition ? [firstDefinition] : []),
  ]
  const sections = document.sections.map((section, index) => {
    if (index !== sectionIndex) return section
    return {
      ...section,
      properties: {
        ...section.properties,
        differentFirstPage: edit.differentFirstPage,
      },
      ...(kind === "header"
        ? {
            defaultHeaderId: defaultDefinition?.id ?? null,
            firstPageHeaderId: firstDefinition?.id ?? null,
          }
        : {
            defaultFooterId: defaultDefinition?.id ?? null,
            firstPageFooterId: firstDefinition?.id ?? null,
          }),
    }
  })
  return resolveStyles({
    ...document,
    ...(kind === "header"
      ? { headers: definitions }
      : { footers: definitions }),
    sections,
  })
}

export function headerFooterDefinition(
  document: SemanticDocument,
  kind: HeaderFooterKind,
  id: string | null | undefined
): SemanticHeaderFooter | null {
  if (!id) return null
  const definitions = kind === "header" ? document.headers : document.footers
  return definitions.find((entry) => entry.id === id) ?? null
}

/** Persist rich block content from the in-canvas header/footer editor. */
export function applyHeaderFooterBlocks(
  document: SemanticDocument,
  sectionId: string,
  kind: HeaderFooterKind,
  variant: HeaderFooterVariant,
  blocks: readonly SemanticBlock[]
): SemanticDocument {
  const sectionIndex = document.sections.findIndex(
    (section) => String(section.id) === sectionId
  )
  if (sectionIndex < 0) throw new RangeError(`Unknown section '${sectionId}'`)

  const section = document.sections[sectionIndex]
  if (!section) throw new RangeError(`Unknown section '${sectionId}'`)
  const currentId =
    variant === "first"
      ? kind === "header"
        ? section.firstPageHeaderId
        : section.firstPageFooterId
      : kind === "header"
        ? section.defaultHeaderId
        : section.defaultFooterId
  const id = currentId ?? headerFooterDefinitionId(sectionId, kind, variant)
  const current = headerFooterDefinition(document, kind, currentId)
  const persistedBlocks =
    blocks.length > 0 ? blocks : [emptyParagraph(document, id, kind)]
  const definition: SemanticHeaderFooter = {
    type: kind,
    id,
    source: current?.source ?? { part: "editor", xmlPath: `/${kind}[1]` },
    blocks: namespaceHeaderFooterBlocks(persistedBlocks, id, kind),
  }
  const currentDefinitions =
    kind === "header" ? document.headers : document.footers
  const definitions = [
    ...currentDefinitions.filter((entry) => entry.id !== id),
    definition,
  ]
  const sections = document.sections.map((entry, index) => {
    if (index !== sectionIndex) return entry
    if (kind === "header") {
      return variant === "first"
        ? { ...entry, firstPageHeaderId: id }
        : { ...entry, defaultHeaderId: id }
    }
    return variant === "first"
      ? { ...entry, firstPageFooterId: id }
      : { ...entry, defaultFooterId: id }
  })
  return resolveStyles({
    ...document,
    ...(kind === "header"
      ? { headers: definitions }
      : { footers: definitions }),
    sections,
  })
}

export function setDifferentFirstPage(
  document: SemanticDocument,
  sectionId: string,
  enabled: boolean
): SemanticDocument {
  const sections = document.sections.map((section) =>
    String(section.id) === sectionId
      ? {
          ...section,
          properties: {
            ...section.properties,
            differentFirstPage: enabled,
          },
        }
      : section
  )
  if (!sections.some((section) => String(section.id) === sectionId)) {
    throw new RangeError(`Unknown section '${sectionId}'`)
  }
  return { ...document, sections }
}

/** Build the one-section semantic document mounted in the nested editor. */
export function headerFooterEditorDocument(
  document: SemanticDocument,
  sectionId: string,
  kind: HeaderFooterKind,
  variant: HeaderFooterVariant
): SemanticDocument {
  const section = document.sections.find(
    (entry) => String(entry.id) === sectionId
  )
  if (!section) throw new RangeError(`Unknown section '${sectionId}'`)
  const id =
    variant === "first"
      ? kind === "header"
        ? section.firstPageHeaderId
        : section.firstPageFooterId
      : kind === "header"
        ? section.defaultHeaderId
        : section.defaultFooterId
  const definition = headerFooterDefinition(document, kind, id)
  const fallbackId = id ?? headerFooterDefinitionId(sectionId, kind, variant)
  return {
    ...document,
    headers: [],
    footers: [],
    sections: [
      {
        ...section,
        defaultHeaderId: null,
        defaultFooterId: null,
        firstPageHeaderId: null,
        firstPageFooterId: null,
        blocks: definition?.blocks ?? [
          emptyParagraph(document, fallbackId, kind),
        ],
      },
    ],
  }
}
