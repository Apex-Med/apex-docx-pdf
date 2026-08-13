import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  createBlankDocument,
  nodeId,
  twips,
  type SemanticDocument,
} from "@apexmed/core"
import { minimalPng } from "@apexmed/images"

import { serializeEmbedPdf } from "../src/embed"
import { fromSemanticDocument, toSemanticDocument } from "../src/model/bridge"

function anchoredFixture(): SemanticDocument {
  const blank = createBlankDocument()
  const paragraph = blank.sections[0]?.blocks[0]
  if (paragraph?.type !== "paragraph") {
    throw new Error("blank document must begin with a paragraph")
  }
  const fontBytes = readFileSync(
    join(import.meta.dir, "../assets/fonts/inter-400.ttf")
  )
  const imageBytes = minimalPng(2, 1)
  return {
    ...blank,
    assets: [
      {
        type: "imageAsset",
        id: "fixture-image",
        source: { part: "word/media/fixture.png", xmlPath: "/fixture" },
        packagePath: "word/media/fixture.png",
        mimeType: "image/png",
        bytes: Array.from(imageBytes),
        pixelWidth: 2,
        pixelHeight: 1,
      },
    ],
    fontAssets: [
      {
        type: "fontAsset",
        id: "fixture-inter-regular",
        source: { part: "word/fonts/inter.ttf", xmlPath: "/fixture" },
        packagePath: "word/fonts/inter.ttf",
        family: "Fixture Inter",
        weight: 400,
        style: "normal",
        bytes: Array.from(fontBytes),
      },
    ],
    sections: [
      {
        ...blank.sections[0]!,
        blocks: [
          {
            ...paragraph,
            children: [
              {
                type: "text",
                id: nodeId("fixture-text"),
                source: paragraph.source,
                text: "Embedded face and anchored image",
                preserveSpace: false,
                style: {
                  fontFamily: "Fixture Inter",
                  fontSize: twips(220),
                  fontWeight: 400,
                  fontStyle: "normal",
                  underline: false,
                  color: "#000000",
                },
              },
              {
                type: "image",
                id: nodeId("fixture-image-node"),
                source: paragraph.source,
                assetId: "fixture-image",
                width: twips(360),
                height: twips(180),
                aspect: {
                  pixelWidth: 2,
                  pixelHeight: 1,
                  intrinsicRatio: 2,
                  preserve: true,
                },
                placement: {
                  type: "anchor",
                  offsetX: twips(120),
                  offsetY: twips(180),
                  horizontalRelative: "column",
                  verticalRelative: "paragraph",
                  wrap: "square",
                },
              },
            ],
          },
        ],
      },
    ],
  }
}

describe("anchor and embedded-resource editor regressions", () => {
  test("the ProseMirror bridge keeps DrawingML anchor offsets and document font assets", () => {
    const document = anchoredFixture()
    const pm = fromSemanticDocument(document)
    let imageAttrs: Record<string, unknown> | undefined
    pm.descendants((node) => {
      if (node.type.name === "image") imageAttrs = node.attrs
    })
    expect(imageAttrs).toMatchObject({
      placementType: "anchor",
      offsetX: 120,
      offsetY: 180,
    })

    const restored = toSemanticDocument(pm, {
      assets: document.assets,
      fontAssets: document.fontAssets,
      styles: document.styles,
    })
    const paragraph = restored.sections[0]?.blocks[0]
    expect(paragraph?.type).toBe("paragraph")
    if (paragraph?.type !== "paragraph") return
    const image = paragraph.children.find((inline) => inline.type === "image")
    expect(image?.placement).toMatchObject({
      type: "anchor",
      offsetX: 120,
      offsetY: 180,
      horizontalRelative: "column",
      verticalRelative: "paragraph",
      wrap: "square",
    })
    expect(restored.fontAssets).toEqual(document.fontAssets)
  })

  test("embed PDF export supplies both image and embedded font resources", async () => {
    const pdf = await serializeEmbedPdf(anchoredFixture())
    const pdfText = new TextDecoder("latin1").decode(pdf)
    expect(pdfText).toContain("/Subtype /Image")
    expect(pdfText).toContain("/FontFile2")
    expect(pdfText).toContain("/Subtype /Type0")
  })
})
