import { describe, expect, test } from "bun:test"
import {
  createBlankDocument,
  nodeId,
  twips,
  type SemanticDocument,
  type SemanticParagraph,
  type SemanticText,
  type TextStyle,
} from "@apexmed/core"

import { validatePdfStructure } from "../../testkit/src"
import { serializeEmbedPdf } from "../src/embed"
import {
  applyTemplateTagValues,
} from "../src/tags/apply-values"
import {
  defaultTemplateTags,
  mergeDefaultTemplateTags,
  todayDateValue,
} from "../src/tags/defaults"
import { hydrateTemplateTagCatalog } from "../src/tags/metadata"
import { formatTemplateTagValue } from "../src/tags/placeholder"

const style: TextStyle = {
  fontFamily: "Calibri",
  fontSize: twips(220),
  fontWeight: 400,
  fontStyle: "normal",
  underline: false,
  color: "#000000",
}

function documentWithText(
  text: string,
  extras: Partial<SemanticDocument> = {},
  runStyle: TextStyle = style
): SemanticDocument {
  const blank = createBlankDocument()
  const run: SemanticText = {
    type: "text",
    id: nodeId("run-1"),
    source: { part: "editor", xmlPath: "/w:t[1]" },
    text,
    style: runStyle,
  }
  const para: SemanticParagraph = {
    ...(blank.sections[0]!.blocks[0] as SemanticParagraph),
    children: [run],
  }
  return {
    ...blank,
    ...extras,
    sections: [{ ...blank.sections[0]!, blocks: [para] }],
  }
}

function paragraphText(document: SemanticDocument): string {
  const block = document.sections[0]!.blocks[0] as SemanticParagraph
  return block.children
    .filter((child) => child.type === "text")
    .map((child) => (child.type === "text" ? child.text : ""))
    .join("")
}

describe("applyTemplateTagValues", () => {
  test("substitutes assigned values and leaves unset tags as placeholders", () => {
    const document = documentWithText(
      "By {{author_name:string}} on {{issued_at:date | date:\"dd-MM-yyyy\"}}",
      {
        editorMetadata: {
          templateTags: [
            {
              id: "t1",
              label: "Author name",
              slug: "author_name",
              kind: "string",
            },
            {
              id: "t2",
              label: "Issued at",
              slug: "issued_at",
              kind: "date",
              date: { includeTime: false, pattern: "dd-MM-yyyy" },
            },
          ],
          templateTagValues: {
            t1: { kind: "string", value: "Ada Lovelace" },
          },
        },
      }
    )
    const resolved = applyTemplateTagValues(document)
    expect(paragraphText(resolved)).toBe(
      'By Ada Lovelace on {{issued_at:date | date:"dd-MM-yyyy"}}'
    )
    const sourceRun = document.sections[0]!.blocks[0] as SemanticParagraph
    expect((sourceRun.children[0] as SemanticText).style.fontFamily).toBe(
      "Calibri"
    )
  })

  test("formats assigned dates and numbers", () => {
    const document = documentWithText(
      '{{total:number}} {{when:date | date:"dd-MM-yyyy HH:mm"}}',
      {
        editorMetadata: {
          templateTags: [
            { id: "n1", label: "Total", slug: "total", kind: "number" },
            {
              id: "d1",
              label: "When",
              slug: "when",
              kind: "date",
              date: { includeTime: true, pattern: "dd-MM-yyyy HH:mm" },
            },
          ],
          templateTagValues: {
            n1: { kind: "number", value: 12.5 },
            d1: { kind: "date", value: "2026-08-05T09:30:00.000Z" },
          },
        },
      }
    )
    expect(paragraphText(applyTemplateTagValues(document))).toBe(
      "12.5 05-08-2026 09:30"
    )
  })

  test("keeps a space-only run between a word and a filled tag", () => {
    const document = documentWithText("hello {{author_name:string}}", {
      editorMetadata: {
        templateTags: [
          {
            id: "t1",
            label: "Author name",
            slug: "author_name",
            kind: "string",
          },
        ],
        templateTagValues: {
          t1: { kind: "string", value: "Craig" },
        },
      },
    })
    expect(paragraphText(applyTemplateTagValues(document))).toBe("hello Craig")
    const children = (
      applyTemplateTagValues(document).sections[0]!.blocks[0] as SemanticParagraph
    ).children.filter((child): child is SemanticText => child.type === "text")
    expect(children[0]?.text).toBe("hello ")
    expect(children[0]?.preserveSpace).toBe(true)
    expect(children[0]?.style.fontWeight).toBe(400)
  })

  test("keeps Medium and Bold weights on filled tags", () => {
    const blank = createBlankDocument()
    const prototype = blank.sections[0]!.blocks[0] as SemanticParagraph
    const document: SemanticDocument = {
      ...blank,
      editorMetadata: {
        templateTags: [
          { id: "medium", label: "Medium", slug: "medium_name", kind: "string" },
          { id: "bold", label: "Bold", slug: "bold_name", kind: "string" },
        ],
        templateTagValues: {
          medium: { kind: "string", value: "Medium Ada" },
          bold: { kind: "string", value: "Bold Ada" },
        },
      },
      sections: [
        {
          ...blank.sections[0]!,
          blocks: [
            {
              ...prototype,
              children: [
                {
                  type: "text",
                  id: nodeId("run-medium"),
                  source: { part: "editor", xmlPath: "/w:t[1]" },
                  text: "{{medium_name:string}}",
                  style: { ...style, fontFamily: "Inter", fontWeight: 500 },
                },
                {
                  type: "text",
                  id: nodeId("run-space"),
                  source: { part: "editor", xmlPath: "/w:t[2]" },
                  text: " ",
                  preserveSpace: true,
                  style: { ...style, fontFamily: "Inter", fontWeight: 400 },
                },
                {
                  type: "text",
                  id: nodeId("run-bold"),
                  source: { part: "editor", xmlPath: "/w:t[3]" },
                  text: "{{bold_name:string}}",
                  style: { ...style, fontFamily: "Inter", fontWeight: 700 },
                },
              ],
            },
          ],
        },
      ],
    }
    const resolved = applyTemplateTagValues(document)
    const weights = (
      resolved.sections[0]!.blocks[0] as SemanticParagraph
    ).children
      .filter((child): child is SemanticText => child.type === "text")
      .map((child) => [child.text, child.style.fontWeight] as const)
    expect(weights).toEqual([
      ["Medium Ada", 500],
      [" ", 400],
      ["Bold Ada", 700],
    ])
  })

  test("preserves surrounding style on split runs", () => {
    const document = documentWithText("{{author_name:string}}", {
      editorMetadata: {
        templateTags: [
          {
            id: "t1",
            label: "Author name",
            slug: "author_name",
            kind: "string",
          },
        ],
        templateTagValues: {
          t1: { kind: "string", value: "Ada" },
        },
      },
    })
    const resolved = applyTemplateTagValues(document)
    const run = (resolved.sections[0]!.blocks[0] as SemanticParagraph)
      .children[0] as SemanticText
    expect(run.text).toBe("Ada")
    expect(run.style).toEqual(style)
  })

  test("printed_at uses the supplied now and ignores stored values", () => {
    const printedAt = defaultTemplateTags().find(
      (tag) => tag.slug === "printed_at"
    )
    expect(printedAt).toBeDefined()
    if (!printedAt) return
    const document = documentWithText(
      '{{printed_at:date | date:"dd-MM-yyyy HH:mm"}}',
      {
        editorMetadata: {
          templateTags: [printedAt],
          templateTagValues: {
            [printedAt.id]: { kind: "date", value: "2020-01-01T00:00:00.000Z" },
          },
        },
      }
    )
    const now = new Date("2026-08-17T15:45:00.000Z")
    expect(paragraphText(applyTemplateTagValues(document, now))).toBe(
      formatTemplateTagValue(printedAt, {
        kind: "date",
        value: now.toISOString(),
      })
    )
  })

  test("today keeps the stored date and does not follow now", () => {
    const today = defaultTemplateTags().find((tag) => tag.slug === "today")
    expect(today).toBeDefined()
    if (!today) return
    const stored = { kind: "date" as const, value: "2026-01-02T00:00:00.000Z" }
    const document = documentWithText(
      '{{today:date | date:"dd-MM-yyyy"}}',
      {
        editorMetadata: {
          templateTags: [today],
          templateTagValues: { [today.id]: stored },
        },
      }
    )
    const printed = applyTemplateTagValues(
      document,
      new Date("2026-08-17T15:45:00.000Z")
    )
    expect(paragraphText(printed)).toBe(
      formatTemplateTagValue(today, stored)
    )
  })

  test("unset today stays a placeholder at print", () => {
    const today = defaultTemplateTags().find((tag) => tag.slug === "today")
    expect(today).toBeDefined()
    if (!today) return
    const document = documentWithText(
      '{{today:date | date:"dd-MM-yyyy"}}',
      {
        editorMetadata: {
          templateTags: [today],
          templateTagValues: {},
        },
      }
    )
    expect(
      paragraphText(
        applyTemplateTagValues(document, new Date("2026-08-17T15:45:00.000Z"))
      )
    ).toBe('{{today:date | date:"dd-MM-yyyy"}}')
  })
})

describe("default template tags", () => {
  test("hydrate seeds printed_at and today without replacing existing today", () => {
    const storedToday = {
      kind: "date" as const,
      value: "2026-01-02T00:00:00.000Z",
    }
    const document = documentWithText("Hello", {
      editorMetadata: {
        templateTags: [
          {
            id: "tag:today",
            label: "Today",
            slug: "today",
            kind: "date",
            date: { includeTime: false, pattern: "dd-MM-yyyy" },
          },
        ],
        templateTagValues: { "tag:today": storedToday },
      },
    })
    const now = new Date("2026-08-17T15:45:00.000Z")
    const hydrated = hydrateTemplateTagCatalog(document, now)
    const meta = hydrated.editorMetadata as {
      templateTags: { slug: string; source?: string }[]
      templateTagValues: Record<string, { kind: string; value: string }>
    }
    expect(meta.templateTags.map((tag) => tag.slug)).toEqual([
      "printed_at",
      "today",
    ])
    expect(meta.templateTags.every((tag) => tag.source === "system")).toBe(true)
    expect(meta.templateTagValues["tag:today"]).toEqual(storedToday)
  })

  test("hydrate stamps today when it is missing", () => {
    const now = new Date("2026-08-17T15:45:00.000Z")
    const hydrated = hydrateTemplateTagCatalog(
      documentWithText("Hello"),
      now
    )
    const meta = hydrated.editorMetadata as {
      templateTagValues: Record<string, { kind: string; value: string }>
    }
    const stamped = todayDateValue(now)
    expect(stamped.kind).toBe("date")
    expect(meta.templateTagValues["tag:today"]?.value).toBe(
      stamped.kind === "date" ? stamped.value : ""
    )
  })

  test("mergeDefaultTemplateTags leaves an incompatible printed_at slug alone", () => {
    const custom = {
      id: "user-printed",
      label: "Printed copy",
      slug: "printed_at",
      kind: "string" as const,
    }
    const merged = mergeDefaultTemplateTags([custom], {})
    expect(merged.tags.find((tag) => tag.slug === "printed_at")).toEqual(custom)
    expect(
      merged.tags.some(
        (tag) => tag.slug === "today" && tag.source === "system"
      )
    ).toBe(true)
  })
})

describe("PDF conversion of filled tags", () => {
  test("embeds distinct Inter Medium and Bold programs for filled tags", async () => {
    const blank = createBlankDocument()
    const prototype = blank.sections[0]!.blocks[0] as SemanticParagraph
    const document: SemanticDocument = {
      ...blank,
      editorMetadata: {
        templateTags: [
          { id: "medium", label: "Medium", slug: "medium_name", kind: "string" },
          { id: "bold", label: "Bold", slug: "bold_name", kind: "string" },
        ],
        templateTagValues: {
          medium: { kind: "string", value: "Medium Ada" },
          bold: { kind: "string", value: "Bold Ada" },
        },
      },
      sections: [
        {
          ...blank.sections[0]!,
          blocks: [
            {
              ...prototype,
              children: [
                {
                  type: "text",
                  id: nodeId("run-medium"),
                  source: { part: "editor", xmlPath: "/w:t[1]" },
                  text: "{{medium_name:string}}",
                  style: { ...style, fontFamily: "Inter", fontWeight: 500 },
                },
                {
                  type: "text",
                  id: nodeId("run-space"),
                  source: { part: "editor", xmlPath: "/w:t[2]" },
                  text: " ",
                  preserveSpace: true,
                  style: { ...style, fontFamily: "Inter", fontWeight: 400 },
                },
                {
                  type: "text",
                  id: nodeId("run-bold"),
                  source: { part: "editor", xmlPath: "/w:t[3]" },
                  text: "{{bold_name:string}}",
                  style: { ...style, fontFamily: "Inter", fontWeight: 700 },
                },
              ],
            },
          ],
        },
      ],
    }
    const pdf = await serializeEmbedPdf(document)
    const pdfSource = new TextDecoder("latin1").decode(pdf)
    const validation = validatePdfStructure(pdf)
    expect(pdfSource.startsWith("%PDF-")).toBe(true)
    expect(validation.valid).toBe(true)
    expect(validation.text).toContain("Medium Ada")
    expect(validation.text).toContain("Bold Ada")
    expect(validation.text).not.toContain("{{")
    expect(pdfSource).toMatch(/\/[A-Z]{6}\+Inter-Medium/u)
    expect(pdfSource).toMatch(/\/[A-Z]{6}\+Inter-Bold/u)
  })
})
