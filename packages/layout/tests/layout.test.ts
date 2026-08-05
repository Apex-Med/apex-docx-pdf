import { describe, expect, test } from "bun:test"
import {
  documentHash,
  fontFaceId,
  glyphId,
  twips,
  type FontFaceRequest,
  type FontFaceResource,
  type FontRegistry,
  type GlyphRun,
  type NumberingDefinition,
  type ResolvedBlock,
  type ResolvedDocument,
  type ResolvedParagraph,
  type ResolvedTable,
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
  blocks: readonly ResolvedBlock[],
  properties: Partial<ResolvedDocument["sections"][number]["properties"]> = {}
): ResolvedDocument {
  return {
    type: "document",
    id: "document" as ResolvedDocument["id"],
    source,
    assets: [],
    headers: [],
    footers: [],
    numberingDefinitions: [],
    sections: [
      {
        type: "section",
        id: "section" as ResolvedDocument["sections"][number]["id"],
        source,
        properties: {
          pageWidth: twips(2_000),
          pageHeight: twips(1_600),
          orientation: "portrait",
          headerDistance: twips(720),
          footerDistance: twips(720),
          margins: {
            top: twips(100),
            right: twips(100),
            bottom: twips(100),
            left: twips(100),
          },
          ...properties,
        },
        defaultHeaderId: null,
        defaultFooterId: null,
        blocks,
      },
    ],
  }
}

const noBorders: ResolvedTable["borders"] = {
  top: null,
  right: null,
  bottom: null,
  left: null,
  insideHorizontal: null,
  insideVertical: null,
}

function table(
  rows: readonly (readonly string[])[],
  overrides: Partial<ResolvedTable> = {}
): ResolvedTable {
  const columnCount = rows[0]?.length ?? 1
  const columnWidths = Array.from({ length: columnCount }, () => twips(400))
  return {
    type: "table",
    id: "table" as ResolvedTable["id"],
    source,
    width: twips(columnCount * 400),
    preferredWidth: null,
    layout: "fixed",
    columnWidths,
    borders: noBorders,
    cellPadding: {
      top: twips(20),
      right: twips(20),
      bottom: twips(20),
      left: twips(20),
    },
    repeatHeaderRowCount: 0,
    rows: rows.map((values, rowIndex) => ({
      type: "tableRow",
      id: `row-${rowIndex}` as ResolvedTable["rows"][number]["id"],
      source,
      repeatAsHeader: false,
      allowBreakAcrossPages: true,
      height: null,
      cells: values.map((text, columnIndex) => ({
        type: "tableCell",
        id: `cell-${rowIndex}-${columnIndex}` as ResolvedTable["rows"][number]["cells"][number]["id"],
        source,
        columnIndex,
        width: twips(400),
        preferredWidth: null,
        columnSpan: 1,
        verticalMerge: "none",
        verticalAlignment: "top",
        fillColor: null,
        blocks: [
          paragraph([{ text }], {}, `cell-p-${rowIndex}-${columnIndex}`),
        ],
      })),
    })),
    ...overrides,
  }
}

function tableRow(
  value: ResolvedTable,
  index = 0
): ResolvedTable["rows"][number] {
  const row = value.rows[index]
  if (!row) throw new Error(`Missing test table row ${index}`)
  return row
}

function tableCell(
  row: ResolvedTable["rows"][number],
  index = 0
): ResolvedTable["rows"][number]["cells"][number] {
  const cell = row.cells[index]
  if (!cell) throw new Error(`Missing test table cell ${index}`)
  return cell
}

function imageInline(
  id: string,
  width: number,
  height: number,
  assetId = "asset"
): ResolvedParagraph["children"][number] {
  return {
    type: "image",
    id: id as ResolvedParagraph["children"][number]["id"],
    source,
    assetId,
    width: twips(width),
    height: twips(height),
    aspect: {
      pixelWidth: width,
      pixelHeight: height,
      intrinsicRatio: width / height,
      preserve: true,
    },
  }
}

function pageField(
  id: string,
  field: "PAGE" | "NUMPAGES",
  fieldStyle: TextStyle = style
): ResolvedParagraph["children"][number] {
  return {
    type: "pageField",
    id: id as ResolvedParagraph["children"][number]["id"],
    source,
    field,
    displayText: "1",
    format: "decimal",
    style: fieldStyle,
  }
}

function imageDocument(blocks: readonly ResolvedBlock[]): ResolvedDocument {
  return {
    ...documentWith(blocks),
    assets: [
      {
        type: "imageAsset",
        id: "asset",
        source,
        packagePath: "word/media/image.png",
        mimeType: "image/png",
        bytes: [1],
        pixelWidth: 100,
        pixelHeight: 100,
      },
    ],
  }
}

function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message)
  return value
}

function numberedDocument(
  blocks: readonly ResolvedBlock[],
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

  test("formats bullet, decimal, alphabetic, and Roman numbering", () => {
    const formats = [
      "bullet",
      "decimal",
      "lowerLetter",
      "upperLetter",
      "lowerRoman",
      "upperRoman",
    ] as const
    const definitions = formats.map((format, index) => ({
      id: `list-${index}`,
      levels: [numberingLevel(0, { format, levelText: "%1" })],
    }))
    const blocks = formats.map((_format, index) =>
      paragraph(
        [{ text: "body" }],
        { numbering: { definitionId: `list-${index}`, level: 0 } },
        `format-${index}`
      )
    )
    const result = layoutDocument(numberedDocument(blocks, definitions), {
      metrics: fixedMetrics,
    })
    expect(
      labelsFor(
        result,
        blocks.map((block) => block.id)
      )
    ).toEqual(["•", "1", "a", "A", "i", "I"])
  })

  test("applies start values, multilevel legal formatting, and configured restarts", () => {
    const definition: NumberingDefinition = {
      id: "outline",
      levels: [
        numberingLevel(0, {
          startAt: 3,
          format: "upperRoman",
          levelText: "%1.",
        }),
        numberingLevel(1, {
          startAt: 2,
          format: "lowerLetter",
          levelText: "%1.%2",
          legal: true,
          restartAfterLevel: 0,
        }),
      ],
    }
    const levels = [0, 1, 1, 0, 1]
    const blocks = levels.map((level, index) =>
      paragraph(
        [{ text: "body" }],
        { numbering: { definitionId: "outline", level } },
        `outline-${index}`
      )
    )
    const result = layoutDocument(numberedDocument(blocks, [definition]), {
      metrics: fixedMetrics,
    })
    expect(
      labelsFor(
        result,
        blocks.map((block) => block.id)
      )
    ).toEqual(["III.", "3.2", "3.3", "IV.", "4.2"])
  })

  test("accepts the OOXML non-negative zero numbering start", () => {
    const definition: NumberingDefinition = {
      id: "zero",
      levels: [numberingLevel(0, { startAt: 0 })],
    }
    const blocks = ["zero-0", "zero-1"].map((id) =>
      paragraph(
        [{ text: "body" }],
        { numbering: { definitionId: "zero", level: 0 } },
        id
      )
    )
    const result = layoutDocument(numberedDocument(blocks, [definition]), {
      metrics: fixedMetrics,
    })

    expect(
      labelsFor(
        result,
        blocks.map((block) => block.id)
      )
    ).toEqual(["0.", "1."])
  })

  test("keeps counters continuous across pages and isolated by concrete definition ID", () => {
    const definitions: NumberingDefinition[] = [
      { id: "a", levels: [numberingLevel(0)] },
      { id: "b", levels: [numberingLevel(0)] },
    ]
    const ids = ["a-1", "a-2", "b-1", "a-3"]
    const blocks = ids.map((id, index) =>
      paragraph(
        [{ text: "body" }],
        {
          numbering: { definitionId: index === 2 ? "b" : "a", level: 0 },
          pageBreakBefore: index === 1,
        },
        id
      )
    )
    const result = layoutDocument(numberedDocument(blocks, definitions), {
      metrics: fixedMetrics,
    })
    expect(labelsFor(result, ids)).toEqual(["1.", "2.", "1.", "3."])
  })

  test("emits a searchable, source-linked label and treats tab suffix as list positioning", () => {
    const typography = fakeTypography()
    const listed = paragraph(
      [{ text: "aa aa aa aa", style: { ...style, fontFamily: "Test Sans" } }],
      { numbering: { definitionId: "list", level: 0 } },
      "listed"
    )
    const result = layoutDocument(
      numberedDocument(
        [listed],
        [{ id: "list", levels: [numberingLevel(0)] }],
        { pageWidth: twips(700) }
      ),
      {
        fonts: typography.registry,
        shaper: typography.shaper,
        includeTrace: true,
      }
    )
    expect(typography.shapes.map(({ text }) => text)).toEqual([
      "1.",
      "aa aa aa aa",
    ])
    const label = glyphRuns(result).find((run) => run.sourceNodeId === "listed")
    expect(label).toMatchObject({ text: "1.", x: twips(200) })
    expect(result.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "layout/tab-stop-unsupported" })
    )
    expect(
      result.trace?.events
        .filter(
          (event) => event.kind === "line" && event.sourceNodeId === "listed"
        )
        .map((event) => event.bounds?.x)
    ).toEqual([twips(400), twips(400), twips(400), twips(400)])
  })

  test("uses explicit nonzero paragraph indentation instead of list-level indentation", () => {
    const listed = paragraph(
      [{ text: "body" }],
      {
        numbering: { definitionId: "list", level: 0 },
        indentStart: twips(500),
        firstLineIndent: twips(-300),
      },
      "overridden"
    )
    const result = layoutDocument(
      numberedDocument([listed], [{ id: "list", levels: [numberingLevel(0)] }]),
      { metrics: fixedMetrics }
    )
    const runs = glyphRuns(result)
    expect(runs.find((run) => run.sourceNodeId === "overridden")?.x).toBe(
      twips(400)
    )
    expect(
      runs.find((run) => run.sourceNodeId === "overridden-text-0")?.x
    ).toBe(twips(600))
  })

  test("diagnoses missing and duplicate numbering references and emits visible fallback labels", () => {
    const blocks = [
      paragraph(
        [{ text: "missing" }],
        { numbering: { definitionId: "missing", level: 0 } },
        "missing-ref"
      ),
      paragraph(
        [{ text: "duplicate" }],
        { numbering: { definitionId: "duplicate", level: 0 } },
        "duplicate-ref"
      ),
    ]
    const duplicate = { id: "duplicate", levels: [numberingLevel(0)] }
    const result = layoutDocument(
      numberedDocument(blocks, [duplicate, duplicate]),
      { metrics: fixedMetrics }
    )
    expect(result.diagnostics.map(({ code }) => code)).toEqual([
      "layout/numbering-definition-missing",
      "layout/numbering-definition-duplicate",
    ])
    expect(labelsFor(result, ["missing-ref", "duplicate-ref"])).toEqual([
      "[?]",
      "[?]",
    ])
  })

  test("diagnoses malformed runtime references and levels without dropping labels", () => {
    const badReference = paragraph(
      [{ text: "bad reference" }],
      {
        numbering: {
          definitionId: "list",
          level: 99,
        } as unknown as ResolvedParagraph["properties"]["numbering"],
      },
      "bad-reference"
    )
    const badLevel = paragraph(
      [{ text: "bad level" }],
      { numbering: { definitionId: "bad-level", level: 0 } },
      "bad-level"
    )
    const result = layoutDocument(
      numberedDocument(
        [badReference, badLevel],
        [
          { id: "list", levels: [numberingLevel(0)] },
          {
            id: "bad-level",
            levels: [numberingLevel(0, { levelText: "%10" })],
          },
        ]
      ),
      { metrics: fixedMetrics }
    )
    expect(result.diagnostics.map(({ code }) => code)).toEqual([
      "layout/numbering-reference-invalid",
      "layout/numbering-level-invalid",
    ])
    expect(labelsFor(result, ["bad-reference", "bad-level"])).toEqual([
      "[?]",
      "[?]",
    ])
  })

  test("moves a fitting keep-with-next chain to a fresh page", () => {
    const blocks = [
      paragraph([{ text: "filler" }], {}, "filler"),
      paragraph([{ text: "first" }], { keepWithNext: true }, "first"),
      paragraph([{ text: "second" }], {}, "second"),
    ]
    const result = layoutDocument(
      documentWith(blocks, { pageHeight: twips(800) }),
      { metrics: fixedMetrics, includeTrace: true }
    )
    expect(
      result.trace?.events
        .find(
          (event) =>
            event.kind === "page-break" && event.reason === "keep-with-next"
        )
        ?.sourceNodeId.toString()
    ).toBe("first")
    const pageFor = (text: string) =>
      result.displayList.pages.find((page) =>
        page.items.some(
          (item) => item.type === "glyph-run" && item.text === text
        )
      )?.pageNumber
    expect(pageFor("first")).toBe(2)
    expect(pageFor("second")).toBe(2)
  })

  test("degrades an oversized keep-with-next chain once with an explicit reason", () => {
    const blocks = [
      paragraph([{ text: "one" }], { keepWithNext: true }, "one"),
      paragraph([{ text: "two" }], { keepWithNext: true }, "two"),
      paragraph([{ text: "three" }], {}, "three"),
    ]
    const result = layoutDocument(
      documentWith(blocks, { pageHeight: twips(700) }),
      { metrics: fixedMetrics, includeTrace: true }
    )
    expect(result.displayList.pages).toHaveLength(2)
    expect(
      result.diagnostics.filter(
        ({ code }) => code === "layout/keep-with-next-chain-too-tall"
      )
    ).toHaveLength(1)
    expect(result.trace?.events).toContainEqual(
      expect.objectContaining({ reason: "keep-with-next-chain-too-tall" })
    )
  })

  test("widow control changes a four-line split from 3+1 to 2+2 and false disables it", () => {
    const split = (widowControl: boolean) =>
      layoutDocument(
        documentWith(
          [paragraph([{ text: "a\na\na\na" }], { widowControl }, "split")],
          { pageHeight: twips(920) }
        ),
        { metrics: fixedMetrics, includeTrace: true }
      )
    const fragmentHeights = (result: ReturnType<typeof layoutDocument>) =>
      result.trace?.events
        .filter(
          (event) => event.kind === "block" && event.sourceNodeId === "split"
        )
        .map((event) => event.bounds?.height)
    expect(fragmentHeights(split(true))).toEqual([twips(480), twips(480)])
    expect(fragmentHeights(split(false))).toEqual([twips(720), twips(240)])
  })

  test("keeps cancellation and max-page limits effective for numbered pagination", () => {
    const definition = { id: "list", levels: [numberingLevel(0)] }
    const blocks = Array.from({ length: 4 }, (_, index) =>
      paragraph(
        [{ text: "body" }],
        { numbering: { definitionId: "list", level: 0 } },
        `limited-${index}`
      )
    )
    expect(() =>
      layoutDocument(
        numberedDocument(blocks, [definition], { pageHeight: twips(500) }),
        { metrics: fixedMetrics, maxPages: 1 }
      )
    ).toThrow(LayoutLimitError)

    const controller = new AbortController()
    controller.abort()
    expect(() =>
      layoutDocument(numberedDocument(blocks, [definition]), {
        metrics: fixedMetrics,
        signal: controller.signal,
      })
    ).toThrow()
  })
})

describe("table layout", () => {
  test("lays out deterministic 2x2 geometry in normal paragraph flow", () => {
    const before = paragraph([{ text: "before" }], {}, "before")
    const grid = table([
      ["a", "b"],
      ["c", "d"],
    ])
    const after = paragraph([{ text: "after" }], {}, "after")
    const result = layoutDocument(documentWith([before, grid, after]), {
      metrics: fixedMetrics,
      includeTrace: true,
    })
    const runs = glyphRuns(result)
    expect(runs.map((run) => run.text)).toEqual([
      "before",
      "a",
      "b",
      "c",
      "d",
      "after",
    ])
    expect(
      runs.filter((run) => run.text === "a" || run.text === "b")
    ).toMatchObject([{ x: twips(120) }, { x: twips(520) }])
    const rowEvents = result.trace?.events.filter(
      (event) =>
        event.sourceNodeId === "row-0" || event.sourceNodeId === "row-1"
    )
    expect(rowEvents?.map((event) => event.bounds)).toEqual([
      { x: twips(100), y: twips(340), width: twips(800), height: twips(280) },
      { x: twips(100), y: twips(620), width: twips(800), height: twips(280) },
    ])
    expect(runs.at(-1)?.baselineY).toBe(twips(1_092))
  })

  test("honours grid spans and vertical merge ownership while suppressing merge borders", () => {
    const border = {
      style: "single" as const,
      color: "#123456",
      width: twips(10),
      space: twips(0),
    }
    const base = table(
      [
        ["a", "b"],
        ["", "c"],
      ],
      {
        borders: {
          top: border,
          right: border,
          bottom: border,
          left: border,
          insideHorizontal: border,
          insideVertical: border,
        },
      }
    )
    const firstRow = tableRow(base)
    const secondRow = tableRow(base, 1)
    const merged: ResolvedTable = {
      ...base,
      rows: [
        {
          ...firstRow,
          cells: [
            { ...tableCell(firstRow), verticalMerge: "restart" },
            tableCell(firstRow, 1),
          ],
        },
        {
          ...secondRow,
          cells: [
            {
              ...tableCell(secondRow),
              verticalMerge: "continue",
              blocks: [],
            },
            tableCell(secondRow, 1),
          ],
        },
      ],
    }
    const result = layoutDocument(documentWith([merged]), {
      metrics: fixedMetrics,
    })
    expect(glyphRuns(result).map((run) => run.text)).toEqual(["a", "b", "c"])
    const horizontalAtMerge = result.displayList.pages[0]?.items.filter(
      (item) =>
        item.type === "line" &&
        item.y1 === twips(380) &&
        item.y2 === twips(380) &&
        item.x1 === twips(100)
    )
    expect(horizontalAtMerge).toHaveLength(0)

    const spanRow = tableRow(base)
    const spanning = {
      ...base,
      rows: [
        {
          ...spanRow,
          cells: [
            {
              ...tableCell(spanRow),
              width: twips(800),
              columnSpan: 2,
              blocks: [paragraph([{ text: "wide" }], {}, "wide")],
            },
          ],
        },
      ],
    }
    expect(
      glyphRuns(
        layoutDocument(documentWith([spanning]), { metrics: fixedMetrics })
      )[0]
    ).toMatchObject({ text: "wide", x: twips(120) })
  })

  test("emits padding, solid shading, and single/double/dotted/dashed border styles", () => {
    const makeBorder = (style: "single" | "double" | "dotted" | "dashed") => ({
      style,
      color: "#010203",
      width: twips(8),
      space: twips(4),
    })
    const paint = table([["paint"]])
    const paintRow = tableRow(paint)
    const grid = table([["paint"]], {
      borders: {
        top: makeBorder("double"),
        right: makeBorder("dotted"),
        bottom: makeBorder("dashed"),
        left: makeBorder("single"),
        insideHorizontal: null,
        insideVertical: null,
      },
      rows: [
        {
          ...paintRow,
          cells: [
            {
              ...tableCell(paintRow),
              fillColor: "#AABBCC",
            },
          ],
        },
      ],
    })
    const result = layoutDocument(documentWith([grid]), {
      metrics: fixedMetrics,
    })
    expect(result.displayList.pages[0]?.items[0]).toMatchObject({
      type: "rectangle",
      fillColor: "#AABBCC",
      bounds: { x: twips(100), width: twips(400) },
    })
    expect(glyphRuns(result)[0]).toMatchObject({ x: twips(124) })
    const lines =
      result.displayList.pages[0]?.items.filter(
        (item) => item.type === "line"
      ) ?? []
    expect(lines.filter((line) => line.y1 === twips(92))).toHaveLength(1)
    expect(lines.some((line) => line.lineCap === "round")).toBe(true)
    expect(lines.some((line) => line.dashArray?.[0] === twips(32))).toBe(true)
  })

  test("applies exact/atLeast heights and top/center/bottom vertical alignment", () => {
    const base = table([["t", "c", "b"]])
    const row = tableRow(base)
    const aligned: ResolvedTable = {
      ...base,
      width: twips(1_200),
      columnWidths: [twips(400), twips(400), twips(400)],
      rows: [
        {
          ...row,
          height: { rule: "exact", value: twips(600) },
          cells: row.cells.map((cell, index) => {
            const verticalAlignment =
              index === 0 ? "top" : index === 1 ? "center" : "bottom"
            return { ...cell, verticalAlignment }
          }),
        },
      ],
    }
    const runs = glyphRuns(
      layoutDocument(documentWith([aligned]), { metrics: fixedMetrics })
    )
    expect(runs.map((run) => run.baselineY)).toEqual([
      twips(312),
      twips(472),
      twips(632),
    ])
    const oneCell = table([["x"]])
    const atLeast = {
      ...oneCell,
      rows: [
        {
          ...tableRow(oneCell),
          height: { rule: "atLeast" as const, value: twips(500) },
        },
      ],
    }
    const traced = layoutDocument(documentWith([atLeast]), {
      metrics: fixedMetrics,
      includeTrace: true,
    })
    expect(
      traced.trace?.events.find((event) => event.sourceNodeId === "row-0")
        ?.bounds?.height
    ).toBe(twips(500))
  })

  test("fragments rows, moves fitting cantSplit rows, and degrades oversized cantSplit rows", () => {
    const split = table([["one two three four five six seven eight"]])
    const splitResult = layoutDocument(
      documentWith([split], { pageHeight: twips(500) }),
      { metrics: fixedMetrics, includeTrace: true }
    )
    expect(splitResult.displayList.pages.length).toBeGreaterThan(1)
    expect(
      splitResult.trace?.events.some(
        (event) => event.reason === "table-row-fragment"
      )
    ).toBe(true)

    const base = table([["x"]])
    const cantRow = {
      ...tableRow(base),
      allowBreakAcrossPages: false,
      height: { rule: "exact" as const, value: twips(400) },
    }
    const moved = layoutDocument(
      documentWith(
        [paragraph([{ text: "lead" }]), { ...base, rows: [cantRow] }],
        {
          pageHeight: twips(800),
        }
      ),
      { metrics: fixedMetrics }
    )
    expect(moved.displayList.pages).toHaveLength(2)
    expect(glyphRuns(moved).find((run) => run.text === "x")?.baselineY).toBe(
      twips(312)
    )

    const degraded = layoutDocument(
      documentWith(
        [
          {
            ...base,
            rows: [
              { ...cantRow, height: { rule: "exact", value: twips(800) } },
            ],
          },
        ],
        { pageHeight: twips(600) }
      ),
      { metrics: fixedMetrics }
    )
    expect(degraded.diagnostics).toContainEqual(
      expect.objectContaining({ code: "layout/table-cant-split-too-tall" })
    )
  })

  test("repeats contiguous headers without reshaping or advancing their numbering", () => {
    const typography = fakeTypography()
    const base = table([["H"], ["1"], ["2"], ["3"]])
    const header = tableRow(base)
    const numberedRows = base.rows.map((row, index) => ({
      ...row,
      cells: row.cells.map((cell) => ({
        ...cell,
        blocks: [
          paragraph(
            [{ text: index === 0 ? "H" : String(index) }],
            { numbering: { definitionId: "list", level: 0 } },
            `table-number-${index}`
          ),
        ],
      })),
    }))
    const repeated: ResolvedTable = {
      ...base,
      repeatHeaderRowCount: 1,
      rows: [
        { ...numberedRows[0], repeatAsHeader: true, id: header.id },
        ...numberedRows.slice(1),
      ] as ResolvedTable["rows"],
    }
    const result = layoutDocument(
      numberedDocument(
        [repeated],
        [{ id: "list", levels: [numberingLevel(0)] }],
        { pageHeight: twips(700) }
      ),
      { fonts: typography.registry, shaper: typography.shaper }
    )
    expect(result.displayList.pages.length).toBeGreaterThan(1)
    expect(typography.shapes.filter(({ text }) => text === "H")).toHaveLength(1)
    expect(glyphRuns(result).filter((run) => run.text === "H").length).toBe(
      result.displayList.pages.length
    )
    expect(labelsFor(result, ["table-number-0"])).toEqual(
      Array.from({ length: result.displayList.pages.length }, () => "1.")
    )
    expect(
      labelsFor(result, ["table-number-1", "table-number-2", "table-number-3"])
    ).toEqual(["2.", "3.", "4."])
  })

  test("rejects malformed grids, overlaps, merge chains, content boxes, and header-crossing merges", () => {
    const base = table([["a", "b"]])
    const row = tableRow(base)
    const invalids: ResolvedTable[] = [
      { ...base, columnWidths: [twips(0), twips(800)] },
      { ...base, width: twips(799) },
      {
        ...base,
        rows: [
          {
            ...row,
            cells: [tableCell(row), { ...tableCell(row, 1), columnIndex: 0 }],
          },
        ],
      },
      {
        ...base,
        rows: [
          {
            ...row,
            cells: [
              { ...tableCell(row), verticalMerge: "continue", blocks: [] },
              tableCell(row, 1),
            ],
          },
        ],
      },
      {
        ...base,
        cellPadding: {
          top: twips(20),
          bottom: twips(20),
          left: twips(200),
          right: twips(200),
        },
      },
    ]
    for (const invalid of invalids)
      expect(() =>
        layoutDocument(documentWith([invalid]), { metrics: fixedMetrics })
      ).toThrow()

    const twoRows = table([["header"], [""]])
    const headerRow = tableRow(twoRows)
    const bodyRow = tableRow(twoRows, 1)
    const crossing: ResolvedTable = {
      ...twoRows,
      repeatHeaderRowCount: 1,
      rows: [
        {
          ...headerRow,
          repeatAsHeader: true,
          cells: [{ ...tableCell(headerRow), verticalMerge: "restart" }],
        },
        {
          ...bodyRow,
          cells: [
            {
              ...tableCell(bodyRow),
              verticalMerge: "continue",
              blocks: [],
            },
          ],
        },
      ],
    }
    expect(() =>
      layoutDocument(documentWith([crossing]), { metrics: fixedMetrics })
    ).toThrow(/header\/body/u)
  })

  test("moves a fitting original repeating-header group atomically after leading flow", () => {
    const base = table([["H1"], ["H2"]])
    const headers: ResolvedTable = {
      ...base,
      repeatHeaderRowCount: 2,
      rows: base.rows.map((row) => ({ ...row, repeatAsHeader: true })),
    }
    const result = layoutDocument(
      documentWith([paragraph([{ text: "lead\nlead" }], {}, "lead"), headers], {
        pageHeight: twips(1_000),
      }),
      { metrics: fixedMetrics, includeTrace: true }
    )
    expect(result.displayList.pages).toHaveLength(2)
    expect(
      result.trace?.events
        .filter(
          (event) =>
            event.kind === "block" &&
            (event.sourceNodeId === "row-0" || event.sourceNodeId === "row-1")
        )
        .map((event) => ({ page: event.pageNumber, bounds: event.bounds }))
    ).toEqual([
      {
        page: 2,
        bounds: {
          x: twips(100),
          y: twips(100),
          width: twips(400),
          height: twips(280),
        },
      },
      {
        page: 2,
        bounds: {
          x: twips(100),
          y: twips(380),
          width: twips(400),
          height: twips(280),
        },
      },
    ])
    expect(
      result.trace?.events.some(
        (event) => event.reason === "table-row-fragment"
      )
    ).toBe(false)
  })

  test("fragments only at full line-box boundaries across cells", () => {
    const grid = table([["aa aa aa aa", "bb bb bb bb"]])
    const result = layoutDocument(
      documentWith([grid], { pageHeight: twips(500) }),
      { metrics: fixedMetrics, includeTrace: true }
    )
    for (const event of result.trace?.events.filter(
      (candidate) => candidate.kind === "line"
    ) ?? []) {
      const page = result.displayList.pages[event.pageNumber - 1]
      expect(event.bounds).toBeDefined()
      expect(
        (event.bounds?.y ?? 0) + (event.bounds?.height ?? 0)
      ).toBeLessThanOrEqual(
        (page?.contentBounds.y ?? 0) + (page?.contentBounds.height ?? 0)
      )
    }
    const textFor = (id: string) =>
      glyphRuns(result)
        .filter((run) => run.sourceNodeId === id)
        .map((run) => run.text)
        .join("")
    expect(textFor("cell-p-0-0-text-0")).toBe("aaaaaaaa")
    expect(textFor("cell-p-0-1-text-0")).toBe("bbbbbbbb")
  })

  test("fails closed for exact-height clipping and atomic lines taller than a fresh page", () => {
    const hugeMetrics: Phase1FontMetrics = {
      measureText: fixedMetrics.measureText,
      lineHeight: () => twips(500),
    }
    const base = table([["x"]])
    const exact: ResolvedTable = {
      ...base,
      rows: [
        {
          ...tableRow(base),
          height: { rule: "exact", value: twips(300) },
        },
      ],
    }
    expect(() =>
      layoutDocument(documentWith([exact]), { metrics: hugeMetrics })
    ).toThrow(/without clipping/u)
    expect(() =>
      layoutDocument(documentWith([base], { pageHeight: twips(500) }), {
        metrics: hugeMetrics,
      })
    ).toThrow(/atomic line box/u)
  })

  test("uses vertical-merge union geometry and stable shading-text-border layers", () => {
    const border = {
      style: "single" as const,
      color: "#111111",
      width: twips(5),
      space: twips(0),
    }
    const base = table([["x"], [""]], {
      borders: {
        top: border,
        right: border,
        bottom: border,
        left: border,
        insideHorizontal: border,
        insideVertical: null,
      },
    })
    const first = tableRow(base)
    const second = tableRow(base, 1)
    const merged: ResolvedTable = {
      ...base,
      rows: [
        {
          ...first,
          height: { rule: "exact", value: twips(100) },
          cells: [
            {
              ...tableCell(first),
              verticalMerge: "restart",
              fillColor: "#FF0000",
            },
          ],
        },
        {
          ...second,
          height: { rule: "exact", value: twips(100) },
          cells: [
            {
              ...tableCell(second),
              verticalMerge: "continue",
              fillColor: "#0000FF",
              blocks: [],
            },
          ],
        },
      ],
    }
    const result = layoutDocument(documentWith([merged]), {
      metrics: fixedMetrics,
      includeTrace: true,
    })
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "layout/table-vertical-merge-expanded-exact-row",
        details: { deficit: twips(80) },
      })
    )
    expect(
      result.trace?.events
        .filter(
          (event) =>
            event.sourceNodeId === "row-0" || event.sourceNodeId === "row-1"
        )
        .map((event) => event.bounds?.height)
    ).toEqual([twips(100), twips(180)])
    const items = result.displayList.pages[0]?.items ?? []
    const rectangles = items.filter((item) => item.type === "rectangle")
    expect(rectangles).toHaveLength(2)
    expect(rectangles.every((item) => item.fillColor === "#FF0000")).toBe(true)
    const reversedShadingIndex = [...items]
      .reverse()
      .findIndex((item) => item.type === "rectangle")
    const lastShading = items.length - reversedShadingIndex - 1
    const firstGlyph = items.findIndex((item) => item.type === "glyph-run")
    const firstBorder = items.findIndex(
      (item) => item.type === "line" && item.sourceNodeId === "cell-0-0"
    )
    expect(lastShading).toBeLessThan(firstGlyph)
    expect(firstGlyph).toBeLessThan(firstBorder)
    expect(
      items.filter(
        (item) =>
          item.type === "line" &&
          item.y1 === twips(200) &&
          item.y2 === twips(200)
      )
    ).toHaveLength(0)

    const centered: ResolvedTable = {
      ...merged,
      rows: merged.rows.map((row, index) => ({
        ...row,
        height: { rule: "exact", value: twips(200) },
        cells: row.cells.map((cell) => ({
          ...cell,
          verticalAlignment: index === 0 ? "center" : cell.verticalAlignment,
        })),
      })),
    }
    expect(
      glyphRuns(
        layoutDocument(documentWith([centered]), { metrics: fixedMetrics })
      )[0]?.baselineY
    ).toBe(twips(372))

    const plainItems =
      layoutDocument(documentWith([base]), { metrics: fixedMetrics })
        .displayList.pages[0]?.items ?? []
    expect(
      plainItems.filter(
        (item) =>
          item.type === "line" &&
          item.y1 === twips(380) &&
          item.y2 === twips(380)
      )
    ).toHaveLength(1)
  })

  test("rejects noncanonical cell order before shaping", () => {
    const typography = fakeTypography()
    const base = table([["a", "b"]])
    const row = tableRow(base)
    const reversed: ResolvedTable = {
      ...base,
      rows: [{ ...row, cells: [tableCell(row, 1), tableCell(row)] }],
    }
    expect(() =>
      layoutDocument(documentWith([reversed]), {
        fonts: typography.registry,
        shaper: typography.shaper,
      })
    ).toThrow(/strictly increasing/u)
    expect(typography.shapes).toEqual([])
  })

  test("is deterministic and preserves cancellation and maxPages", () => {
    const grid = table([["one two three four five six seven eight nine ten"]])
    const input = documentWith([grid], { pageHeight: twips(500) })
    expect(
      layoutDocument(input, { metrics: fixedMetrics, includeTrace: true })
    ).toEqual(
      layoutDocument(input, { metrics: fixedMetrics, includeTrace: true })
    )
    expect(() =>
      layoutDocument(input, { metrics: fixedMetrics, maxPages: 1 })
    ).toThrow(LayoutLimitError)
    const controller = new AbortController()
    controller.abort()
    expect(() =>
      layoutDocument(input, {
        metrics: fixedMetrics,
        signal: controller.signal,
      })
    ).toThrow()
  })
})

describe("Phase 6 images, sections, headers, footers, and page fields", () => {
  test("lays out text-image-text atoms with exact positive-down bounds", () => {
    const before = paragraph([{ text: "before " }], {}, "mixed")
    const after = paragraph([{ text: " after" }], {}, "after")
    const mixed: ResolvedParagraph = {
      ...before,
      children: [
        required(before.children[0], "Missing before run"),
        imageInline("inline-image", 300, 400),
        required(after.children[0], "Missing after run"),
      ],
    }
    const result = layoutDocument(imageDocument([mixed]), {
      metrics: fixedMetrics,
      includeTrace: true,
    })
    const placement = result.displayList.pages[0]?.items.find(
      (item) => item.type === "image"
    )
    expect(placement).toMatchObject({
      type: "image",
      sourceNodeId: "inline-image",
      assetId: "asset",
      bounds: { width: 300, height: 400 },
    })
    expect(placement?.bounds.x).toBeGreaterThan(100)
    expect(placement?.bounds.y).toBeGreaterThanOrEqual(100)
    expect(glyphRuns(result).map((run) => run.text)).toEqual([
      "before ",
      " after",
    ])
  })

  test("wraps and paginates image atoms and rejects oversize or exact-line conflicts", () => {
    const lead = paragraph([{ text: "abcdefghijklmnop" }], {}, "lead")
    const wrapped: ResolvedParagraph = {
      ...lead,
      children: [
        required(lead.children[0], "Missing lead run"),
        imageInline("wrapped-image", 400, 300),
      ],
    }
    const wrappedResult = layoutDocument(imageDocument([wrapped]), {
      metrics: fixedMetrics,
    })
    const textRun = required(glyphRuns(wrappedResult)[0], "Missing text run")
    const wrappedImage = wrappedResult.displayList.pages[0]?.items.find(
      (item) => item.type === "image"
    )
    expect(wrappedImage?.bounds.y).toBeGreaterThan(textRun.baselineY)

    const paged: ResolvedParagraph = {
      ...lead,
      children: [
        required(lead.children[0], "Missing lead run"),
        imageInline("paged-image", 400, 1_300),
      ],
    }
    expect(
      layoutDocument(imageDocument([paged]), { metrics: fixedMetrics })
        .displayList.pages
    ).toHaveLength(2)

    const tooWide: ResolvedParagraph = {
      ...lead,
      children: [imageInline("wide", 1_801, 100)],
    }
    expect(() =>
      layoutDocument(imageDocument([tooWide]), { metrics: fixedMetrics })
    ).toThrow(/wider than/u)
    const tooTall: ResolvedParagraph = {
      ...lead,
      children: [imageInline("tall", 100, 1_401)],
    }
    expect(() =>
      layoutDocument(imageDocument([tooTall]), { metrics: fixedMetrics })
    ).toThrow(/taller than/u)
    const exact: ResolvedParagraph = {
      ...lead,
      properties: {
        ...lead.properties,
        lineSpacing: { rule: "exact", value: twips(200) },
      },
      children: [imageInline("exact", 100, 300)],
    }
    expect(() =>
      layoutDocument(imageDocument([exact]), { metrics: fixedMetrics })
    ).toThrow(/Exact line spacing/u)
  })

  test("preserves image atoms in fragmented tables and repeated headers", () => {
    const base = table([["head"], ["one"], ["two"], ["three"]])
    const headerRow = tableRow(base)
    const headerCell = tableCell(headerRow)
    const headerParagraph = paragraph([], {}, "image-header")
    const withImage: ResolvedTable = {
      ...base,
      repeatHeaderRowCount: 1,
      rows: [
        {
          ...headerRow,
          repeatAsHeader: true,
          cells: [
            {
              ...headerCell,
              blocks: [
                {
                  ...headerParagraph,
                  children: [imageInline("table-image", 100, 100)],
                },
              ],
            },
          ],
        },
        ...base.rows.slice(1),
      ],
    }
    const original = imageDocument([withImage])
    const originalSection = required(
      original.sections[0],
      "Missing image section"
    )
    const input: ResolvedDocument = {
      ...original,
      sections: [
        {
          ...originalSection,
          properties: {
            ...originalSection.properties,
            pageHeight: twips(700),
          },
        },
      ],
    }
    const result = layoutDocument(input, { metrics: fixedMetrics })
    expect(result.displayList.pages.length).toBeGreaterThan(1)
    expect(
      result.displayList.pages.flatMap((page) =>
        page.items.filter((item) => item.type === "image")
      ).length
    ).toBe(result.displayList.pages.length)
  })

  test("starts every section on a fresh page with its own immutable geometry", () => {
    const base = documentWith([])
    const first = required(base.sections[0], "Missing base section")
    const input: ResolvedDocument = {
      ...base,
      sections: [
        {
          ...first,
          id: "portrait-1" as typeof first.id,
          properties: {
            ...first.properties,
            pageWidth: twips(2_000),
            pageHeight: twips(3_000),
            orientation: "portrait",
          },
          blocks: [paragraph([{ text: "one" }], {}, "one")],
        },
        {
          ...first,
          id: "landscape" as typeof first.id,
          properties: {
            ...first.properties,
            pageWidth: twips(3_000),
            pageHeight: twips(2_000),
            orientation: "landscape",
          },
          blocks: [],
        },
        {
          ...first,
          id: "portrait-2" as typeof first.id,
          properties: {
            ...first.properties,
            pageWidth: twips(2_000),
            pageHeight: twips(3_000),
            orientation: "portrait",
          },
          blocks: [paragraph([{ text: "three" }], {}, "three")],
        },
      ],
    }
    const result = layoutDocument(input, { metrics: fixedMetrics })
    expect(
      result.displayList.pages.map(({ pageNumber, width, height }) => ({
        pageNumber,
        width,
        height,
      }))
    ).toEqual([
      { pageNumber: 1, width: twips(2_000), height: twips(3_000) },
      { pageNumber: 2, width: twips(3_000), height: twips(2_000) },
      { pageNumber: 3, width: twips(2_000), height: twips(3_000) },
    ])
  })

  test("reuses inherited header/footer preparation and materializes Page X of Y globally", () => {
    const tinyStyle = { ...style, fontSize: twips(120) }
    const header = paragraph(
      [{ text: "Resolved {{name}}", style: tinyStyle }],
      {},
      "header-p"
    )
    const footerBase = paragraph([], {}, "footer-p")
    const footer: ResolvedParagraph = {
      ...footerBase,
      children: [
        required(
          paragraph([{ text: "Page ", style: tinyStyle }], {}, "f1")
            .children[0],
          "Missing footer prefix"
        ),
        pageField("page-field", "PAGE", tinyStyle),
        required(
          paragraph([{ text: " of ", style: tinyStyle }], {}, "f2").children[0],
          "Missing footer separator"
        ),
        pageField("pages-field", "NUMPAGES", tinyStyle),
      ],
    }
    const base = documentWith([])
    const section = required(base.sections[0], "Missing base section")
    const input: ResolvedDocument = {
      ...base,
      headers: [{ type: "header", id: "h", source, blocks: [header] }],
      footers: [{ type: "footer", id: "f", source, blocks: [footer] }],
      sections: Array.from({ length: 10 }, (_, index) => ({
        ...section,
        id: `section-${index}` as typeof section.id,
        defaultHeaderId: "h",
        defaultFooterId: "f",
        properties: {
          ...section.properties,
          pageWidth: twips(4_000),
          pageHeight: twips(2_000),
          headerDistance: twips(20),
          footerDistance: twips(20),
          margins: {
            top: twips(320),
            right: twips(100),
            bottom: twips(320),
            left: twips(100),
          },
        },
        blocks: [],
      })),
    }
    const first = layoutDocument(input, {
      metrics: fixedMetrics,
      maxPages: 10,
    })
    const second = layoutDocument(input, {
      metrics: fixedMetrics,
      maxPages: 10,
    })
    expect(first).toEqual(second)
    expect(first.displayList.pages).toHaveLength(10)
    expect(
      first.displayList.pages.every((page) =>
        page.items.some(
          (item) =>
            item.type === "glyph-run" && item.text === "Resolved {{name}}"
        )
      )
    ).toBe(true)
    const ninthFields = required(
      first.displayList.pages[8],
      "Missing ninth page"
    ).items.filter(
      (item): item is GlyphRun =>
        item.type === "glyph-run" &&
        (item.sourceNodeId === "page-field" ||
          item.sourceNodeId === "pages-field")
    )
    const tenthFields = required(
      first.displayList.pages[9],
      "Missing tenth page"
    ).items.filter(
      (item): item is GlyphRun =>
        item.type === "glyph-run" &&
        (item.sourceNodeId === "page-field" ||
          item.sourceNodeId === "pages-field")
    )
    expect(ninthFields.map((item) => item.text)).toEqual(["9", "10"])
    expect(tenthFields.map((item) => item.text)).toEqual(["10", "10"])
    expect(ninthFields.map((item) => item.width)).toEqual(
      tenthFields.map((item) => item.width)
    )
    expect(ninthFields.map((item) => item.width)).toEqual([
      twips(200),
      twips(200),
    ])
    expect(ninthFields.map((item) => item.x)).toEqual(
      tenthFields.map((item) => item.x)
    )
  })

  test("reserves exactly digitCount(maxPages) times the widest measured digit", () => {
    const digitMetrics: Phase1FontMetrics = {
      measureText(text) {
        return twips(
          [...text].reduce(
            (total, character) =>
              total + (character === "8" ? 130 : character === "1" ? 60 : 100),
            0
          )
        )
      },
      lineHeight() {
        return twips(240)
      },
    }
    const base = paragraph([], {}, "measured-field-paragraph")
    const result = layoutDocument(
      documentWith([
        {
          ...base,
          children: [pageField("measured-field", "NUMPAGES")],
        },
      ]),
      { metrics: digitMetrics, maxPages: 999 }
    )
    expect(
      result.displayList.pages[0]?.items.find(
        (item) =>
          item.type === "glyph-run" && item.sourceNodeId === "measured-field"
      )
    ).toMatchObject({ text: "1", width: twips(390) })
  })

  test("does not falsely wrap or collide at an exact field-width boundary", () => {
    const boundaryParagraph = (
      id: string,
      fieldId: string
    ): ResolvedParagraph => {
      const text = paragraph([{ text: "abcdefghijklmnop" }], {}, id)
      return {
        ...text,
        children: [
          required(text.children[0], `Missing ${id} text`),
          pageField(fieldId, "NUMPAGES"),
        ],
      }
    }
    const header = boundaryParagraph("boundary-header", "boundary-header-field")
    const footer = boundaryParagraph("boundary-footer", "boundary-footer-field")
    const body = boundaryParagraph("boundary-body", "boundary-body-field")
    const base = documentWith([])
    const section = required(base.sections[0], "Missing base section")
    const result = layoutDocument(
      {
        ...base,
        headers: [{ type: "header", id: "h", source, blocks: [header] }],
        footers: [{ type: "footer", id: "f", source, blocks: [footer] }],
        sections: [
          {
            ...section,
            defaultHeaderId: "h",
            defaultFooterId: "f",
            properties: {
              ...section.properties,
              pageWidth: twips(2_000),
              pageHeight: twips(2_000),
              headerDistance: twips(20),
              footerDistance: twips(20),
              margins: {
                top: twips(308),
                right: twips(100),
                bottom: twips(308),
                left: twips(100),
              },
            },
            blocks: [body],
          },
        ],
      },
      { metrics: fixedMetrics, maxPages: 10 }
    )
    expect(result.displayList.pages).toHaveLength(1)
    const page = required(result.displayList.pages[0], "Missing boundary page")
    for (const [textId, fieldId] of [
      ["boundary-header-text-0", "boundary-header-field"],
      ["boundary-footer-text-0", "boundary-footer-field"],
      ["boundary-body-text-0", "boundary-body-field"],
    ] as const) {
      const textRun = page.items.find(
        (item): item is GlyphRun =>
          item.type === "glyph-run" && item.sourceNodeId === textId
      )
      const fieldRun = page.items.find(
        (item): item is GlyphRun =>
          item.type === "glyph-run" && item.sourceNodeId === fieldId
      )
      expect(fieldRun).toMatchObject({ width: twips(200) })
      expect(fieldRun?.baselineY).toBe(textRun?.baselineY)
    }
  })

  test("uses exact header-top and footer-bottom distances per section", () => {
    const header = paragraph([{ text: "Header" }], {}, "distance-header")
    const footer = paragraph([{ text: "Footer" }], {}, "distance-footer")
    const base = documentWith([])
    const section = required(base.sections[0], "Missing base section")
    const sectionWithDistances = (
      id: string,
      headerDistance: number,
      footerDistance: number
    ): ResolvedDocument["sections"][number] => ({
      ...section,
      id: id as typeof section.id,
      defaultHeaderId: "h",
      defaultFooterId: "f",
      properties: {
        ...section.properties,
        pageHeight: twips(4_000),
        headerDistance: twips(headerDistance),
        footerDistance: twips(footerDistance),
        margins: {
          top: twips(1_000),
          right: twips(100),
          bottom: twips(1_000),
          left: twips(100),
        },
      },
    })
    const result = layoutDocument(
      {
        ...base,
        headers: [{ type: "header", id: "h", source, blocks: [header] }],
        footers: [{ type: "footer", id: "f", source, blocks: [footer] }],
        sections: [
          sectionWithDistances("near", 100, 200),
          sectionWithDistances("far", 400, 500),
        ],
      },
      { metrics: fixedMetrics }
    )
    const placements = result.displayList.pages.map((page) => ({
      header: page.items.find(
        (item) =>
          item.type === "glyph-run" &&
          item.sourceNodeId === "distance-header-text-0"
      ),
      footer: page.items.find(
        (item) =>
          item.type === "glyph-run" &&
          item.sourceNodeId === "distance-footer-text-0"
      ),
    }))
    expect(placements).toMatchObject([
      { header: { baselineY: 292 }, footer: { baselineY: 3_752 } },
      { header: { baselineY: 592 }, footer: { baselineY: 3_452 } },
    ])
  })

  test("honours the normalized 720-twip default distances", () => {
    const header = paragraph([{ text: "Header" }], {}, "default-header")
    const footer = paragraph([{ text: "Footer" }], {}, "default-footer")
    const base = documentWith([])
    const section = required(base.sections[0], "Missing base section")
    expect(section.properties.headerDistance).toBe(twips(720))
    expect(section.properties.footerDistance).toBe(twips(720))
    const result = layoutDocument(
      {
        ...base,
        headers: [{ type: "header", id: "h", source, blocks: [header] }],
        footers: [{ type: "footer", id: "f", source, blocks: [footer] }],
        sections: [
          {
            ...section,
            defaultHeaderId: "h",
            defaultFooterId: "f",
            properties: {
              ...section.properties,
              pageHeight: twips(4_000),
              margins: {
                top: twips(1_000),
                right: twips(100),
                bottom: twips(1_000),
                left: twips(100),
              },
            },
          },
        ],
      },
      { metrics: fixedMetrics }
    )
    expect(
      result.displayList.pages[0]?.items.find(
        (item) =>
          item.type === "glyph-run" &&
          item.sourceNodeId === "default-header-text-0"
      )
    ).toMatchObject({ baselineY: 912 })
    expect(
      result.displayList.pages[0]?.items.find(
        (item) =>
          item.type === "glyph-run" &&
          item.sourceNodeId === "default-footer-text-0"
      )
    ).toMatchObject({ baselineY: 3_232 })
  })

  test("shapes reusable embedded header text and decimal field glyphs only once", () => {
    const typography = fakeTypography()
    const embeddedStyle = { ...style, fontFamily: "Test Sans" }
    const header = paragraph(
      [{ text: "Header", style: embeddedStyle }],
      {},
      "embedded-header"
    )
    const footerBase = paragraph([], {}, "embedded-footer")
    const footer: ResolvedParagraph = {
      ...footerBase,
      children: [pageField("embedded-page", "PAGE", embeddedStyle)],
    }
    const base = documentWith([])
    const section = required(base.sections[0], "Missing base section")
    const input: ResolvedDocument = {
      ...base,
      headers: [{ type: "header", id: "h", source, blocks: [header] }],
      footers: [{ type: "footer", id: "f", source, blocks: [footer] }],
      sections: Array.from({ length: 3 }, (_, index) => ({
        ...section,
        id: `embedded-section-${index}` as typeof section.id,
        defaultHeaderId: "h",
        defaultFooterId: "f",
        properties: {
          ...section.properties,
          headerDistance: twips(20),
          footerDistance: twips(20),
          margins: {
            top: twips(320),
            right: twips(100),
            bottom: twips(320),
            left: twips(100),
          },
        },
      })),
    }
    const result = layoutDocument(input, {
      fonts: typography.registry,
      shaper: typography.shaper,
    })
    expect(typography.shapes.map(({ text }) => text)).toEqual([
      "Header",
      "0123456789",
    ])
    expect(
      result.displayList.pages.map((page) =>
        page.items.find(
          (item) =>
            item.type === "glyph-run" && item.sourceNodeId === "embedded-page"
        )
      )
    ).toMatchObject([
      { fontSource: "embedded", text: "1" },
      { fontSource: "embedded", text: "2" },
      { fontSource: "embedded", text: "3" },
    ])
  })

  test("fails closed for missing references, collisions, cancellation, and page limits", () => {
    const missingImage = paragraph([], {}, "missing-image")
    expect(() =>
      layoutDocument(
        documentWith([
          { ...missingImage, children: [imageInline("missing", 10, 10)] },
        ]),
        { metrics: fixedMetrics }
      )
    ).toThrow(/missing asset/u)

    const base = documentWith([])
    const section = required(base.sections[0], "Missing base section")
    expect(() =>
      layoutDocument(
        {
          ...base,
          headers: [
            {
              type: "header",
              id: "h",
              source,
              blocks: [paragraph([{ text: "too tall" }], {}, "tall-header")],
            },
          ],
          sections: [{ ...section, defaultHeaderId: "h" }],
        },
        { metrics: fixedMetrics }
      )
    ).toThrow(/collides with the body/u)
    expect(() =>
      layoutDocument(
        { ...base, sections: [{ ...section, defaultFooterId: "missing" }] },
        { metrics: fixedMetrics }
      )
    ).toThrow(/missing footer/u)

    const imageBase = imageDocument([])
    const imageSection = required(
      imageBase.sections[0],
      "Missing image section"
    )
    const imageHeaderBase = paragraph([], {}, "collision-image-header")
    expect(() =>
      layoutDocument(
        {
          ...imageBase,
          headers: [
            {
              type: "header",
              id: "image-header",
              source,
              blocks: [
                {
                  ...imageHeaderBase,
                  children: [imageInline("header-image", 100, 200)],
                },
              ],
            },
          ],
          sections: [
            {
              ...imageSection,
              defaultHeaderId: "image-header",
              properties: {
                ...imageSection.properties,
                headerDistance: twips(801),
                margins: {
                  ...imageSection.properties.margins,
                  top: twips(1_000),
                },
              },
            },
          ],
        },
        { metrics: fixedMetrics }
      )
    ).toThrow(/Header content collides/u)

    const fieldFooterBase = paragraph([], {}, "collision-field-footer")
    expect(() =>
      layoutDocument(
        {
          ...base,
          footers: [
            {
              type: "footer",
              id: "field-footer",
              source,
              blocks: [
                {
                  ...fieldFooterBase,
                  children: [pageField("footer-pages", "NUMPAGES")],
                },
              ],
            },
          ],
          sections: [
            {
              ...section,
              defaultFooterId: "field-footer",
              properties: {
                ...section.properties,
                footerDistance: twips(713),
                margins: {
                  ...section.properties.margins,
                  bottom: twips(1_000),
                },
              },
            },
          ],
        },
        { metrics: fixedMetrics }
      )
    ).toThrow(/Footer content collides/u)

    expect(() =>
      layoutDocument(
        {
          ...base,
          sections: [
            {
              ...section,
              properties: {
                ...section.properties,
                headerDistance: twips(-1),
              },
            },
          ],
        },
        { metrics: fixedMetrics }
      )
    ).toThrow(/header distance must be a non-negative safe integer/u)
    expect(() =>
      layoutDocument(
        {
          ...base,
          sections: [
            {
              ...section,
              properties: {
                ...section.properties,
                footerDistance: (Number.MAX_SAFE_INTEGER +
                  1) as typeof section.properties.footerDistance,
              },
            },
          ],
        },
        { metrics: fixedMetrics }
      )
    ).toThrow(/footer distance must be a non-negative safe integer/u)
    expect(() =>
      layoutDocument(
        {
          ...base,
          sections: [section, { ...section, id: "s2" as typeof section.id }],
        },
        { metrics: fixedMetrics, maxPages: 1 }
      )
    ).toThrow(LayoutLimitError)
    const controller = new AbortController()
    controller.abort()
    expect(() =>
      layoutDocument(base, { metrics: fixedMetrics, signal: controller.signal })
    ).toThrow()
  })
})
