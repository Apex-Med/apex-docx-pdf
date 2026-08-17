import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  createBlankDocument,
  nodeId,
  twips,
  type SemanticDocument,
  type SemanticParagraph,
  type SemanticText,
  type TextStyle,
} from "@apexmed/core"

import { NodeSelection } from "prosemirror-state"

import {
  applyCommandToSemantic,
  createEditorStateFromDocument,
  encodeTemplatePlaceholder,
  findValuePlaceholders,
  fromSemanticDocument,
  hydrateTemplateTagCatalog,
  insertTemplateTag,
  isValidTemplatePath,
  slugifyLabel,
  toSemanticDocument,
  uniqueSlug,
} from "../src/index"
import { setFontSize } from "../src/commands"
import { EDITOR_CSS } from "../src/styles/editor-css"
import { todayDateValue } from "../src/tags/defaults"

const style: TextStyle = {
  fontFamily: "Calibri",
  fontSize: twips(220),
  fontWeight: 400,
  fontStyle: "normal",
  underline: false,
  color: "#000000",
}

function paragraph(text: string, extras: Partial<SemanticDocument> = {}): SemanticDocument {
  const blank = createBlankDocument()
  const run: SemanticText = {
    type: "text",
    id: nodeId("run-1"),
    source: { part: "editor", xmlPath: "/w:t[1]" },
    text,
    style,
  }
  const para: SemanticParagraph = {
    ...(blank.sections[0]!.blocks[0] as SemanticParagraph),
    children: [run],
  }
  return {
    ...blank,
    ...extras,
    sections: [
      {
        ...blank.sections[0]!,
        blocks: [para],
      },
    ],
  }
}

describe("template tag helpers", () => {
  test("slugifyLabel converts a human name to a path slug", () => {
    expect(slugifyLabel("Author name")).toBe("author_name")
    expect(slugifyLabel("  Invoice # 42 ")).toBe("invoice_42")
    expect(slugifyLabel("")).toBe("tag")
    expect(slugifyLabel("123 go")).toBe("tag_123_go")
    expect(slugifyLabel("constructor")).toBe("constructor_field")
  })

  test("uniqueSlug suffixes collisions", () => {
    expect(uniqueSlug("author_name", ["author_name"])).toBe("author_name_2")
    expect(uniqueSlug("author_name", ["author_name", "author_name_2"])).toBe(
      "author_name_3"
    )
  })

  test("isValidTemplatePath accepts dotted paths and rejects reserved segments", () => {
    expect(isValidTemplatePath("author_name")).toBe(true)
    expect(isValidTemplatePath("customer.name")).toBe(true)
    expect(isValidTemplatePath("1bad")).toBe(false)
    expect(isValidTemplatePath("foo.__proto__")).toBe(false)
  })

  test("encodes typed placeholders including date formats", () => {
    expect(
      encodeTemplatePlaceholder({ slug: "author_name", kind: "string" })
    ).toBe("{{author_name:string}}")
    expect(
      encodeTemplatePlaceholder({ slug: "invoice_total", kind: "number" })
    ).toBe("{{invoice_total:number}}")
    expect(
      encodeTemplatePlaceholder({
        slug: "issued_at",
        kind: "date",
        date: { includeTime: false, pattern: "dd-MM-yyyy" },
      })
    ).toBe('{{issued_at:date | date:"dd-MM-yyyy"}}')
    expect(
      encodeTemplatePlaceholder({
        slug: "starts_at",
        kind: "date",
        date: { includeTime: true, pattern: "dd-MM-yyyy HH:mm" },
      })
    ).toBe('{{starts_at:date | date:"dd-MM-yyyy HH:mm"}}')
  })

  test("findValuePlaceholders ignores block and image tags", () => {
    const matches = findValuePlaceholders(
      "Hello {{author_name:string}}. {{#each items}} {{@image logo}}"
    )
    expect(matches).toHaveLength(1)
    expect(matches[0]?.slug).toBe("author_name")
    expect(matches[0]?.kind).toBe("string")
  })
})

describe("template tag bridge", () => {
  test("insertTemplateTag serializes as a library placeholder", () => {
    const state = createEditorStateFromDocument(createBlankDocument())
    const tag = {
      id: "tag-author",
      label: "Author name",
      slug: "author_name",
      kind: "string" as const,
    }
    const result = applyCommandToSemantic(state, insertTemplateTag(tag))
    expect(result.applied).toBe(true)
    const texts = result.document.sections[0]!.blocks.flatMap((block) =>
      block.type === "paragraph"
        ? block.children
            .filter((child) => child.type === "text")
            .map((child) => (child.type === "text" ? child.text : ""))
        : []
    )
    expect(texts.join("")).toContain("{{author_name:string}}")
    let found = false
    result.state.doc.descendants((node) => {
      if (node.type.name === "template_tag") found = true
    })
    expect(found).toBe(true)
  })

  test("fromSemantic hydrates a placeholder into an atom and back", () => {
    const catalog = [
      {
        id: "tag-author",
        label: "Author name",
        slug: "author_name",
        kind: "string" as const,
      },
    ]
    const document = paragraph("Hello {{author_name:string}}.", {
      editorMetadata: { templateTags: catalog, templateTagValues: {} },
    })
    const pm = fromSemanticDocument(document)
    const names: string[] = []
    const texts: string[] = []
    pm.descendants((node) => {
      if (node.isText) texts.push(node.text ?? "")
      if (node.type.name === "template_tag") {
        names.push(String(node.attrs.slug))
        expect(node.attrs.tagId).toBe("tag-author")
      }
    })
    expect(names).toEqual(["author_name"])
    expect(texts.join("")).toBe("Hello .")
    const back = toSemanticDocument(pm, {
      styles: document.styles,
      editorMetadata: document.editorMetadata,
    })
    const joined = (back.sections[0]!.blocks[0] as SemanticParagraph).children
      .filter((child) => child.type === "text")
      .map((child) => (child.type === "text" ? child.text : ""))
      .join("")
    expect(joined).toBe("Hello {{author_name:string}}.")
  })

  test("hydrate adopts unknown value tags and leaves #each alone", () => {
    const document = paragraph(
      "Hi {{customer.name:string}} {{#each items}}"
    )
    const hydrated = hydrateTemplateTagCatalog(document)
    const tags = (
      hydrated.editorMetadata as { templateTags?: { slug: string }[] }
    ).templateTags
    expect(tags?.map((tag) => tag.slug)).toEqual([
      "printed_at",
      "today",
      "customer.name",
    ])
  })

  test("hydrate seeds default printed_at and today on a blank document", () => {
    const now = new Date("2026-08-17T12:00:00.000Z")
    const hydrated = hydrateTemplateTagCatalog(createBlankDocument(), now)
    const meta = hydrated.editorMetadata as {
      templateTags?: { slug: string; source?: string }[]
      templateTagValues?: Record<string, { kind: string; value: string }>
    }
    expect(meta.templateTags?.map((tag) => tag.slug)).toEqual([
      "printed_at",
      "today",
    ])
    expect(meta.templateTags?.every((tag) => tag.source === "system")).toBe(
      true
    )
    const stamped = todayDateValue(now)
    expect(meta.templateTagValues?.["tag:today"]?.value).toBe(
      stamped.kind === "date" ? stamped.value : ""
    )
  })

  test("updateTextStyle updates template_tag fontSize", () => {
    const state = createEditorStateFromDocument(createBlankDocument())
    const inserted = applyCommandToSemantic(
      state,
      insertTemplateTag({
        id: "tag-author",
        label: "Author name",
        slug: "author_name",
        kind: "string",
      })
    )
    let tagPos = -1
    inserted.state.doc.descendants((node, pos) => {
      if (node.type.name === "template_tag") tagPos = pos
    })
    expect(tagPos).toBeGreaterThanOrEqual(0)
    const selected = inserted.state.apply(
      inserted.state.tr.setSelection(
        NodeSelection.create(inserted.state.doc, tagPos)
      )
    )
    const sized = applyCommandToSemantic(selected, setFontSize(360))
    let fontSize = 0
    sized.state.doc.descendants((node) => {
      if (node.type.name === "template_tag") {
        fontSize = Number(node.attrs.fontSize)
      }
    })
    expect(fontSize).toBe(360)
  })
})

describe("template tag CSS", () => {
  test("badge uses inherited line-height and horizontal-only padding", () => {
    expect(EDITOR_CSS).toContain("line-height: inherit")
    expect(EDITOR_CSS).toContain(".apex-template-tag")
    expect(EDITOR_CSS).toContain(".apex-template-tag__chip")
    const badgeRule =
      /\.apex-editor-surface \.ProseMirror \.apex-template-tag__chip \{([^}]+)\}/s.exec(
        EDITOR_CSS
      )
    expect(badgeRule?.[1]).toContain("padding: 0 0.28em")
    expect(badgeRule?.[1]).toContain("line-height: inherit")
    expect(badgeRule?.[1]).not.toMatch(/padding:\s*[1-9]/)
    expect(EDITOR_CSS).toContain(".apex-template-tag--in-selection")
    expect(EDITOR_CSS).toContain("background: Highlight")
    const raw = readFileSync(
      join(import.meta.dir, "../src/styles/editor.css"),
      "utf8"
    )
    expect(EDITOR_CSS).toBe(raw)
  })
})

