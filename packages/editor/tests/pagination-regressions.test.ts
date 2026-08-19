import { describe, expect, test } from "bun:test"
import {
  nodeId,
  twips,
  type LayoutTrace,
  type PageDisplayList,
} from "@apexmed/core"
import { EditorState } from "prosemirror-state"

import {
  pageBreaksFromTrace,
  pageGeometryFromDisplayList,
  paginationSignature,
  decorationKeyForPlacement,
  applyBreakSpacerGeometry,
  createBreakSpacerElement,
  positionForParagraphOffset,
  spacerSpecsFromPlacements,
  type PageBreakPlacement,
} from "../src/pagination/breaks"
import { decorationsFromPlacements } from "../src/pagination/plugin"
import { createNodeIdentityPlugin } from "../src/plugins/node-identity"
import { editorSchema } from "../src/schema"

function schemaNode(name: string) {
  const type = editorSchema.nodes[name]
  if (!type) throw new Error(`Missing editor schema node: ${name}`)
  return type
}

const page = (
  pageNumber: number,
  geometry: {
    width?: number
    height?: number
    x?: number
    y?: number
    contentWidth?: number
    contentHeight?: number
  } = {}
): PageDisplayList["pages"][number] => ({
  pageNumber,
  width: twips(geometry.width ?? 6_000),
  height: twips(geometry.height ?? 8_000),
  contentBounds: {
    x: twips(geometry.x ?? 500),
    y: twips(geometry.y ?? 600),
    width: twips(geometry.contentWidth ?? 5_000),
    height: twips(geometry.contentHeight ?? 6_800),
  },
  items: [],
})

const placement = (
  overrides: Partial<PageBreakPlacement> = {}
): PageBreakPlacement => ({
  sourceNodeId: nodeId("pagination:p1"),
  charOffset: 4,
  pageNumber: 2,
  restTwips: 0,
  contentHeightTwips: 8_000,
  pageWidthTwips: 6_000,
  pageHeightTwips: 8_000,
  marginTopTwips: 0,
  marginBottomTwips: 0,
  marginLeftTwips: 0,
  marginRightTwips: 0,
  key: "stable-break-key",
  ...overrides,
})

describe("pagination regressions", () => {
  test("does not add an inline spacer for a section-boundary page", () => {
    const sourceNodeId = nodeId("section-boundary:p1")
    const trace: LayoutTrace = {
      pages: [],
      events: [
        {
          kind: "line",
          pageNumber: 1,
          sourceNodeId,
          lineIndex: 0,
          charOffset: 0,
          bounds: {
            x: twips(500),
            y: twips(600),
            width: twips(2_000),
            height: twips(240),
          },
        },
        {
          kind: "page-break",
          pageNumber: 2,
          sourceNodeId: nodeId("section:2"),
          reason: "section-boundary",
        },
        {
          kind: "line",
          pageNumber: 2,
          sourceNodeId: nodeId("section-boundary:p2"),
          lineIndex: 0,
          charOffset: 0,
          bounds: {
            x: twips(500),
            y: twips(600),
            width: twips(2_000),
            height: twips(240),
          },
        },
      ],
    }

    expect(pageBreaksFromTrace(trace, { pages: [page(1), page(2)] })).toEqual(
      []
    )
  })

  test("includes page geometry in the pagination signature", () => {
    const baseline = placement()
    const resized = placement({ pageWidthTwips: 7_000 })
    const remargined = placement({ marginLeftTwips: 720 })

    expect(paginationSignature([baseline], 2)).not.toBe(
      paginationSignature([resized], 2)
    )
    expect(paginationSignature([baseline], 2)).not.toBe(
      paginationSignature([remargined], 2)
    )
  })

  test("widget decoration keys stay stable when rest height changes", () => {
    const baseline = placement({ restTwips: 1_200, key: "geo:1200" })
    const reflowed = placement({ restTwips: 800, key: "geo:800" })
    expect(decorationKeyForPlacement(baseline)).toBe("page-2")
    expect(decorationKeyForPlacement(reflowed)).toBe(
      decorationKeyForPlacement(baseline)
    )
    expect(decorationKeyForPlacement(baseline)).not.toBe(
      decorationKeyForPlacement(
        placement({ explicitPosition: 4, pageNumber: 2 })
      )
    )
  })

  test("spacer geometry can be updated in place without remounting", () => {
    if (typeof document === "undefined") {
      expect(typeof applyBreakSpacerGeometry).toBe("function")
      return
    }
    const el = createBreakSpacerElement(placement({ restTwips: 1_500 }))
    const beforeHeight = Number.parseFloat(el.style.height || "0")
    applyBreakSpacerGeometry(el, placement({ restTwips: 3_000 }))
    const afterHeight = Number.parseFloat(el.style.height || "0")
    expect(afterHeight).toBeGreaterThan(beforeHeight)
    expect(el.getAttribute("data-page-break-spacer")).toBe("page-2")
  })

  test("keeps exact-fit, zero-margin spacer geometry to the desk gap only", () => {
    const displayList: PageDisplayList = {
      pages: [
        page(1, {
          width: 6_000,
          height: 8_000,
          x: 0,
          y: 0,
          contentWidth: 6_000,
          contentHeight: 8_000,
        }),
      ],
    }
    const geometry = pageGeometryFromDisplayList(displayList, 1)
    expect(geometry).toEqual({
      pageWidthTwips: 6_000,
      pageHeightTwips: 8_000,
      marginTopTwips: 0,
      marginBottomTwips: 0,
      marginLeftTwips: 0,
      marginRightTwips: 0,
      contentHeightTwips: 8_000,
    })

    const paragraph = schemaNode("paragraph").create(
      { nodeId: "pagination:p1" },
      editorSchema.text("Exact fit")
    )
    const section = schemaNode("section").create(
      { nodeId: "pagination:section" },
      paragraph
    )
    const doc = schemaNode("doc").create(null, section)
    const specs = spacerSpecsFromPlacements(doc, [
      placement({ explicitPosition: 2 }),
    ])

    // With no remaining content or margins, only the fixed 32 px desk gap
    // remains: 32 px * 15 twips/px = 480 twips.
    expect(specs).toHaveLength(1)
    expect(specs[0]?.heightTwips).toBe(480)
  })

  test("maps layout offsets to the far side of break and page-field atoms", () => {
    const paragraph = schemaNode("paragraph").create({ nodeId: "offset:p1" }, [
      schemaNode("page_break").create({ nodeId: "offset:break" }),
      schemaNode("page_field").create({
        nodeId: "offset:field",
        displayText: "12",
      }),
      editorSchema.text("After"),
    ])
    const section = schemaNode("section").create(
      { nodeId: "offset:section" },
      paragraph
    )
    const doc = schemaNode("doc").create(null, section)
    let paragraphContentStart = -1
    doc.descendants((node, pos) => {
      if (node.type.name !== "paragraph") return true
      paragraphContentStart = pos + 1
      return false
    })

    // Break tokens consume a PM position but no layout character offset.
    expect(positionForParagraphOffset(doc, "offset:p1", 0)).toBe(
      paragraphContentStart + 1
    )
    // PAGE fields consume their rendered text length in layout, but remain a
    // single atom in ProseMirror. Offset 2 therefore belongs after the atom.
    expect(positionForParagraphOffset(doc, "offset:p1", 2)).toBe(
      paragraphContentStart + 2
    )
    expect(positionForParagraphOffset(doc, "offset:p1", 3)).toBe(
      paragraphContentStart + 3
    )
  })

  test("identity normalization preserves a later reserved generated-looking id", () => {
    const first = schemaNode("paragraph").create(
      { nodeId: null },
      editorSchema.text("Needs an id")
    )
    const later = schemaNode("paragraph").create(
      { nodeId: "editor:paragraph:1" },
      editorSchema.text("Already reserved")
    )
    const section = schemaNode("section").create(
      { nodeId: "identity:section" },
      [first, later]
    )
    const doc = schemaNode("doc").create(null, section)
    const state = EditorState.create({
      schema: editorSchema,
      doc,
      plugins: [createNodeIdentityPlugin()],
    })
    const applied = state.applyTransaction(state.tr.setMeta("test", true))
    const ids: string[] = []
    applied.state.doc.descendants((node) => {
      if (node.type.name === "paragraph") ids.push(String(node.attrs.nodeId))
      return true
    })

    expect(ids).toEqual(["editor:paragraph:2", "editor:paragraph:1"])
  })

  test("moves a table-cell page break to a valid table-row boundary", () => {
    const paragraph = schemaNode("paragraph").create(
      { nodeId: "table-cell:p1" },
      editorSchema.text("Cell content")
    )
    const cell = schemaNode("table_cell").create(
      { nodeId: "table-cell:1" },
      paragraph
    )
    const row = schemaNode("table_row").create({ nodeId: "table-row:1" }, cell)
    const table = schemaNode("table").create({ nodeId: "table:1" }, row)
    const section = schemaNode("section").create(
      { nodeId: "table:section" },
      table
    )
    const doc = schemaNode("doc").create(null, section)
    const decorations = decorationsFromPlacements(
      doc,
      [
        placement({
          sourceNodeId: nodeId("table-cell:p1"),
          charOffset: 4,
        }),
      ],
      true
    )

    const found = decorations.find()
    expect(found).toHaveLength(1)
    const paragraphPosition = positionForParagraphOffset(
      doc,
      "table-cell:p1",
      4
    )
    expect(paragraphPosition).not.toBeNull()
    expect(found[0]?.from).toBeLessThan(paragraphPosition ?? 0)
  })

  test("section page counts become PM-owned node decorations", () => {
    const paragraph = schemaNode("paragraph").create(
      { nodeId: "section-pages:p1" },
      editorSchema.text("Hello")
    )
    const section = schemaNode("section").create(
      { nodeId: "section-pages:s1" },
      paragraph
    )
    const doc = schemaNode("doc").create(null, section)
    const decorations = decorationsFromPlacements(doc, [], true, {
      specs: [],
      assets: [],
      sectionPages: [
        {
          sectionId: "section-pages:s1",
          pageCount: 3,
          pageHeightTwips: 16_838,
        },
      ],
    })

    const found = decorations.find()
    expect(found).toHaveLength(1)
    expect(found[0]?.from).toBe(0)
    expect(found[0]?.to).toBe(doc.content.size)
    const style = (
      found[0] as { type?: { attrs?: { style?: string } } }
    ).type?.attrs?.style
    expect(style).toBe("--apex-section-pages:3")
  })

  test("pagination view.update does not rewrite section styles", async () => {
    const source = await Bun.file(
      new URL("../src/pagination/plugin.ts", import.meta.url)
    ).text()
    const updateStart = source.indexOf("update(view, prevState)")
    const updateEnd = source.indexOf("destroy()", updateStart)
    expect(updateStart).toBeGreaterThan(0)
    expect(updateEnd).toBeGreaterThan(updateStart)
    expect(source.slice(updateStart, updateEnd)).not.toContain(
      "applySectionPageCountsToDom"
    )
  })
})
