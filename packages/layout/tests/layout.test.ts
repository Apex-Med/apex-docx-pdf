import { describe, expect, test } from "bun:test"
import {
  documentHash,
  fontFaceId,
  glyphId,
  twips,
  type FontFaceRequest,
  type FontFaceResource,
  type FontRegistry,
  type NumberingDefinition,
  type ResolvedDocument,
  type ResolvedParagraph,
  type TextShaper,
  type TextStyle,
} from "@apex-docx-pdf/core"

import {
  createPhase1StandardFontMetrics,
  layoutDocument,
  LayoutLimitError,
  type Phase1FontMetrics,
} from "../src"

const source = { part: "word/document.xml", xmlPath: "/w:document[1]" }
const style: TextStyle = {
  fontFamily: "Helvetica",
  fontSize: twips(240),
  fontWeight: 400,
  fontStyle: "normal",
  underline: false,
  color: "#000000",
}
const paragraphProperties: ResolvedParagraph["properties"] = {
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
}

function paragraph(
  runs: readonly Readonly<{
    text: string
    style?: TextStyle
    preserveSpace?: boolean
  }>[],
  properties: Partial<ResolvedParagraph["properties"]> = {},
  id = "paragraph"
): ResolvedParagraph {
  return {
    type: "paragraph",
    id: id as ResolvedParagraph["id"],
    source,
    properties: { ...paragraphProperties, ...properties },
    children: runs.map((run, index) => ({
      type: "text",
      id: `${id}-text-${index}` as ResolvedParagraph["children"][number]["id"],
      source,
      text: run.text,
      preserveSpace: run.preserveSpace,
      style: run.style ?? style,
    })),
  }
}

function documentWith(
  blocks: readonly ResolvedParagraph[],
  properties: Partial<ResolvedDocument["sections"][number]["properties"]> = {}
): ResolvedDocument {
  return {
    type: "document",
    id: "document" as ResolvedDocument["id"],
    source,
    numberingDefinitions: [],
    sections: [
      {
        type: "section",
        id: "section" as ResolvedDocument["sections"][number]["id"],
        source,
        properties: {
          pageWidth: twips(2_000),
          pageHeight: twips(1_600),
          margins: {
            top: twips(100),
            right: twips(100),
            bottom: twips(100),
            left: twips(100),
          },
          ...properties,
        },
        blocks,
      },
    ],
  }
}

function numberedDocument(
  blocks: readonly ResolvedParagraph[],
  numberingDefinitions: readonly NumberingDefinition[],
  properties: Partial<ResolvedDocument["sections"][number]["properties"]> = {}
): ResolvedDocument {
  return { ...documentWith(blocks, properties), numberingDefinitions }
}

function numberingLevel(
  level: number,
  overrides: Partial<NumberingDefinition["levels"][number]> = {}
): NumberingDefinition["levels"][number] {
  return {
    level,
    startAt: 1,
    format: "decimal",
    levelText: `%${level + 1}.`,
    suffix: "tab",
    alignment: "right",
    indentStart: twips(300),
    firstLineIndent: twips(-200),
    restartAfterLevel: level > 0 ? level - 1 : null,
    legal: false,
    ...overrides,
  }
}

function glyphRuns(result: ReturnType<typeof layoutDocument>) {
  return result.displayList.pages.flatMap((page) =>
    page.items.filter((item) => item.type === "glyph-run")
  )
}

function labelsFor(
  result: ReturnType<typeof layoutDocument>,
  paragraphIds: readonly string[]
) {
  const ids = new Set(paragraphIds)
  return glyphRuns(result)
    .filter((run) => ids.has(run.sourceNodeId))
    .map((run) => run.text)
}

const fixedMetrics: Phase1FontMetrics = {
  measureText(text) {
    return twips(
      [...text].reduce(
        (total, character) => total + (character === " " ? 50 : 100),
        0
      )
    )
  },
  lineHeight() {
    return twips(240)
  },
}

function fakeTypography() {
  const matches: FontFaceRequest[] = []
  const shapes: Array<{ text: string; faceId: string }> = []
  const registry: FontRegistry = {
    registryHash: documentHash("0".repeat(64)),
    matchFace(request) {
      matches.push(request)
      return {
        faceId: fontFaceId(`${request.weight}-${request.style}`),
        requestedFamily: request.family,
        resolvedFamily: request.family,
        kind: "exact",
        metrics: faceMetrics,
      }
    },
    face(id) {
      const [weight, fontStyle] = id.split("-")
      return {
        faceId: id,
        family: "Test Sans",
        weight: Number(weight) as 400 | 700,
        style: fontStyle as "normal" | "italic",
        postscriptName: `TestSans-${id}`,
        kind: "truetype",
        bytes: new Uint8Array([1, 2, 3]),
        metrics: faceMetrics,
      } satisfies FontFaceResource
    },
  }
  const shaper: TextShaper = {
    shape(input) {
      shapes.push({ text: input.text, faceId: input.face.faceId })
      let start = 0
      const glyphs = [...input.text].map((character) => {
        const clusterStart = start
        start += character.length
        return {
          glyphId: glyphId(character.codePointAt(0) ?? 0),
          unicode: character,
          clusterStart,
          clusterEnd: start,
          advanceX: twips(character === " " ? 50 : 100),
          advanceY: twips(0),
          offsetX: twips(0),
          offsetY: twips(0),
        }
      })
      return {
        glyphs,
        advanceX: twips(glyphs.reduce((sum, glyph) => sum + glyph.advanceX, 0)),
        ascent: twips(160),
        descent: twips(-40),
        lineGap: twips(20),
      }
    },
  }
  return { registry, shaper, matches, shapes }
}

const faceMetrics = {
  unitsPerEm: 1_000,
  ascent: 800,
  descent: -200,
  lineGap: 100,
  underlinePosition: -100,
  underlineThickness: 50,
  bbox: { xMin: 0, yMin: -200, xMax: 1_000, yMax: 800 },
} as const

describe("paragraph layout", () => {
  test("retains the explicit standard-metrics compatibility path", () => {
    const metrics = createPhase1StandardFontMetrics()
    expect(metrics.measureText("Hello", style)).toBe(twips(507))
    const result = layoutDocument(
      documentWith([paragraph([{ text: "Hello" }])])
    )
    expect(result.displayList.pages[0]?.items[0]).toMatchObject({
      type: "glyph-run",
      fontSource: "standard",
      text: "Hello",
    })
  })

  test("matches and shapes each semantic run once and emits positioned embedded glyphs", () => {
    const typography = fakeTypography()
    const boldItalic: TextStyle = {
      ...style,
      fontFamily: "Test Sans",
      fontWeight: 700,
      fontStyle: "italic",
      color: "#112233",
    }
    const result = layoutDocument(
      documentWith([
        paragraph([
          { text: "mixed ", style: { ...style, fontFamily: "Test Sans" } },
          { text: "style", style: boldItalic },
        ]),
      ]),
      { fonts: typography.registry, shaper: typography.shaper }
    )

    expect(typography.matches).toEqual([
      { family: "Test Sans", weight: 400, style: "normal" },
      { family: "Test Sans", weight: 700, style: "italic" },
    ])
    expect(typography.shapes.map(({ text }) => text)).toEqual([
      "mixed ",
      "style",
    ])
    const runs =
      result.displayList.pages[0]?.items.filter(
        (item) => item.type === "glyph-run"
      ) ?? []
    expect(runs).toHaveLength(2)
    expect(runs[1]).toMatchObject({
      fontSource: "embedded",
      faceId: fontFaceId("700-italic"),
      color: "#112233",
    })
    expect(
      runs
        .flatMap((run) => (run.fontSource === "embedded" ? run.glyphs : []))
        .map((glyph) => glyph.unicode)
        .join("")
    ).toBe("mixed style")
  })

  test("treats an explicit family alias as a resolved match rather than a fallback warning", () => {
    const typography = fakeTypography()
    const aliasRegistry: FontRegistry = {
      ...typography.registry,
      matchFace(request) {
        const match = typography.registry.matchFace(request)
        return {
          ...match,
          resolvedFamily: "Noto Sans",
          kind: "alias",
        }
      },
    }
    const result = layoutDocument(
      documentWith([
        paragraph([
          { text: "Aliased", style: { ...style, fontFamily: "Calibri" } },
        ]),
      ]),
      { fonts: aliasRegistry, shaper: typography.shaper }
    )

    expect(result.diagnostics).toEqual([])
  })

  test("keeps hard breaks out of font shaping without splitting the semantic run", () => {
    const typography = fakeTypography()
    const result = layoutDocument(
      documentWith([
        paragraph([
          { text: "a\nb", style: { ...style, fontFamily: "Test Sans" } },
        ]),
      ]),
      {
        fonts: typography.registry,
        shaper: typography.shaper,
        includeTrace: true,
      }
    )
    expect(typography.shapes.map(({ text }) => text)).toEqual(["a b"])
    expect(
      result.trace?.events.filter((event) => event.kind === "line")
    ).toHaveLength(2)
    expect(
      result.displayList.pages
        .flatMap((page) => page.items)
        .flatMap((item) => (item.type === "glyph-run" ? [item.text] : []))
        .join("")
    ).toBe("ab")
  })

  test("diagnoses tabs instead of silently treating them as ordinary spaces", () => {
    const result = layoutDocument(
      documentWith([paragraph([{ text: "left\tright" }])])
    )
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "layout/tab-stop-unsupported",
        severity: "error",
      })
    )
  })

  test("applies first-line, hanging, start, and end indents before alignment", () => {
    const first = layoutDocument(
      documentWith(
        [
          paragraph([{ text: "aa aa aa" }], {
            indentStart: twips(100),
            indentEnd: twips(100),
            firstLineIndent: twips(50),
          }),
        ],
        { pageWidth: twips(800) }
      ),
      { metrics: fixedMetrics, includeTrace: true }
    )
    const lineBounds = first.trace?.events
      .filter((event) => event.kind === "line")
      .map((event) => event.bounds)
    expect(lineBounds?.[0]?.x).toBe(twips(250))
    expect(lineBounds?.[1]?.x).toBe(twips(200))

    const hanging = layoutDocument(
      documentWith(
        [
          paragraph([{ text: "aa" }], {
            alignment: "right",
            indentStart: twips(100),
            indentEnd: twips(100),
            firstLineIndent: twips(-50),
          }),
        ],
        { pageWidth: twips(800) }
      ),
      { metrics: fixedMetrics }
    )
    const run = hanging.displayList.pages[0]?.items[0]
    expect(run?.type === "glyph-run" ? run.x : undefined).toBe(twips(400))
  })

  test("justifies wrapped non-final lines deterministically across spaces", () => {
    const result = layoutDocument(
      documentWith(
        [
          paragraph([{ text: "aa aa aa" }], {
            alignment: "justify",
            indentStart: twips(100),
            indentEnd: twips(100),
          }),
        ],
        { pageWidth: twips(1_000) }
      ),
      { metrics: fixedMetrics, includeTrace: true }
    )
    const runs =
      result.displayList.pages[0]?.items.filter(
        (item) => item.type === "glyph-run"
      ) ?? []
    expect(runs.map((run) => [run.text, run.x, run.width])).toEqual([
      ["aa ", twips(200), twips(400)],
      ["aa", twips(600), twips(200)],
      ["aa", twips(200), twips(200)],
    ])
    expect(
      result.trace?.events
        .filter((event) => event.kind === "line")
        .map((event) => event.bounds?.width)
    ).toEqual([twips(600), twips(200)])
  })

  test("supports exact, at-least, and automatic line spacing", () => {
    const blocks = [
      paragraph(
        [{ text: "a" }],
        { lineSpacing: { rule: "exact", value: twips(100) } },
        "exact"
      ),
      paragraph(
        [{ text: "a" }],
        { lineSpacing: { rule: "atLeast", value: twips(300) } },
        "at-least"
      ),
      paragraph(
        [{ text: "a" }],
        { lineSpacing: { rule: "auto", value240ths: 480 } },
        "auto"
      ),
    ]
    const result = layoutDocument(documentWith(blocks), {
      metrics: fixedMetrics,
      includeTrace: true,
    })
    expect(
      result.trace?.events
        .filter((event) => event.kind === "line")
        .map((event) => event.bounds?.height)
    ).toEqual([twips(100), twips(300), twips(480)])
  })

  test("fragments paragraphs over pages and honours explicit page breaks", () => {
    const flowing = paragraph(
      [{ text: "aa aa aa aa aa aa aa aa aa aa" }],
      {},
      "flowing"
    )
    const forced = paragraph(
      [{ text: "forced" }],
      { pageBreakBefore: true },
      "forced"
    )
    const result = layoutDocument(
      documentWith([flowing, forced], {
        pageWidth: twips(500),
        pageHeight: twips(700),
      }),
      { metrics: fixedMetrics, includeTrace: true }
    )
    expect(result.displayList.pages.length).toBeGreaterThan(2)
    expect(
      result.trace?.events.some(
        (event) =>
          event.kind === "page-break" && event.reason === "line-overflow"
      )
    ).toBe(true)
    expect(
      result.trace?.events.some(
        (event) =>
          event.kind === "page-break" &&
          event.reason === "page-break-before" &&
          event.sourceNodeId === "forced"
      )
    ).toBe(true)
  })

  test("checks cancellation during shaping preparation and fragmentation", () => {
    const controller = new AbortController()
    const typography = fakeTypography()
    const shaper: TextShaper = {
      shape(input) {
        controller.abort()
        return typography.shaper.shape(input)
      },
    }
    expect(() =>
      layoutDocument(documentWith([paragraph([{ text: "cancel me" }])]), {
        fonts: typography.registry,
        shaper,
        signal: controller.signal,
      })
    ).toThrow()
  })

  test("retains significant whitespace without retaining ordinary leading space", () => {
    const ordinary = layoutDocument(
      documentWith([paragraph([{ text: "   retained text" }])])
    )
    const preserved = layoutDocument(
      documentWith([
        paragraph([{ text: "   retained text", preserveSpace: true }]),
      ])
    )
    const text = (result: ReturnType<typeof layoutDocument>) =>
      result.displayList.pages
        .flatMap((page) => page.items)
        .flatMap((item) => (item.type === "glyph-run" ? [item.text] : []))
        .join("")
    expect(text(ordinary)).toBe("retained text")
    expect(text(preserved)).toBe("   retained text")
  })
})
