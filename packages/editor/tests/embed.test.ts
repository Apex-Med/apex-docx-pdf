import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createBlankDocument } from "@apexmed/core"
import { serializeDocx } from "@apexmed/docx"
import { buildMinimalDocx } from "../../testkit/src/docx"

import {
  parseEmbedDocx,
  serializeEmbedDocx,
  serializeEmbedPdf,
  toUint8Array,
  transformCssForShadowDom,
} from "../src/embed"
import type { EditorController, EditorMountOptions } from "../src/ui/Editor"

describe("embed path structural checks", () => {
  test("custom element definition exists in source", () => {
    const path = join(import.meta.dir, "../src/embed/index.ts")
    const source = readFileSync(path, "utf8")
    expect(source).toContain("class ApexDocxEditorElement")
    expect(source).toContain("attachShadow")
    expect(source).toContain("customElements.define")
    expect(source).toContain("transformCssForShadowDom")
    expect(source).toContain("observedAttributes")
    expect(source).toContain("readonly")
    expect(source).toContain("css-url")
    expect(source).toContain('CustomEvent("ready"')
    expect(source).toContain('CustomEvent<EmbedChangeDetail>("change"')
    expect(source).toContain('CustomEvent<EmbedErrorDetail>("error"')
    expect(source).toContain("loadDocx")
    expect(source).toContain("getDocx")
    expect(source).toContain("getPdf")
    expect(source).toContain("setReadOnly")
    expect(source).toContain("getDocument")
  })

  test("EditorChrome portals into an optional shadow container", () => {
    const path = join(import.meta.dir, "../src/ui/EditorChrome.tsx")
    const source = readFileSync(path, "utf8")
    expect(source).toContain("PortalContainerProvider")
    expect(source).toContain("portalContainer")
  })

  test("custom element wires mountEditor with onChange and readOnly", () => {
    const path = join(import.meta.dir, "../src/embed/index.ts")
    const source = readFileSync(path, "utf8")
    expect(source).toContain("mountEditor")
    expect(source).toContain("readOnly:")
    expect(source).toContain("onChange:")
    expect(source).toContain("shadowRoot:")
    expect(source).toContain("controller?.destroy()")
  })

  test("mountEditor exposes controller API", () => {
    const path = join(import.meta.dir, "../src/ui/Editor.tsx")
    const source = readFileSync(path, "utf8")
    expect(source).toContain("export type EditorController")
    expect(source).toContain("export function mountEditor")
    expect(source).toContain("editable:")
    expect(source).toContain("portalContainer")
    expect(source).toContain("createRoot")
    expect(source).toContain("mountEditorHeadless")
    expect(source).toContain("loadDocx:")
    expect(source).toContain("getPdf:")
    expect(source).toContain("setReadOnly:")
  })

  test("shadow-DOM CSS transform hoists @property, rewrites :root, resets host typography", () => {
    const input = `
@property --tw-scale-x {
  syntax: "*";
  inherits: false;
  initial-value: 1;
}
:root {
  --bg: white;
  color: red;
}
.btn { color: blue; }
`
    const result = transformCssForShadowDom(input)
    expect(result.hoistedPropertyRules).toContain("@property --tw-scale-x")
    expect(result.shadowCss).toContain(":host")
    expect(result.shadowCss).not.toMatch(/(^|[,}\s]):root\b/m)
    expect(result.shadowCss).toContain("font-family")
    expect(result.shadowCss).toContain("--tw-scale-x: 1")
    expect(result.shadowCss).toContain(".btn")
  })

  test("minimal transform does not throw on empty CSS", () => {
    expect(() => transformCssForShadowDom("")).not.toThrow()
    const result = transformCssForShadowDom("")
    expect(result.shadowCss).toContain(":host")
  })
})

describe("embed controller helpers", () => {
  test("toUint8Array accepts ArrayBuffer and Uint8Array", () => {
    const raw = new Uint8Array([1, 2, 3])
    expect(toUint8Array(raw)).toEqual(raw)
    expect(
      toUint8Array(
        raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)
      )
    ).toEqual(raw)
  })

  test("parseEmbedDocx + serializeEmbedDocx round-trips minimal fixture text", () => {
    const bytes = buildMinimalDocx({ paragraphs: ["Embed hello"] })
    const doc = parseEmbedDocx(bytes)
    const texts = doc.sections.flatMap((section) =>
      section.blocks.flatMap((block) =>
        block.type === "paragraph"
          ? block.children
              .filter((child) => child.type === "text")
              .map((child) => (child.type === "text" ? child.text : ""))
          : []
      )
    )
    expect(texts.join(" ")).toContain("Embed hello")

    const out = serializeEmbedDocx(doc)
    expect(out.byteLength).toBeGreaterThan(100)
    const again = parseEmbedDocx(out)
    const againTexts = again.sections.flatMap((section) =>
      section.blocks.flatMap((block) =>
        block.type === "paragraph"
          ? block.children
              .filter((child) => child.type === "text")
              .map((child) => (child.type === "text" ? child.text : ""))
          : []
      )
    )
    expect(againTexts.join(" ")).toContain("Embed hello")
  })

  test("parseEmbedDocx accepts ArrayBuffer", () => {
    const bytes = buildMinimalDocx({ paragraphs: ["Buffer path"] })
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer
    const doc = parseEmbedDocx(buffer)
    expect(
      doc.sections[0]?.blocks.some(
        (block) =>
          block.type === "paragraph" &&
          block.children.some(
            (child) =>
              child.type === "text" && child.text.includes("Buffer path")
          )
      )
    ).toBe(true)
  })

  test("parseEmbedDocx throws on invalid bytes", () => {
    expect(() => parseEmbedDocx(new Uint8Array([0, 1, 2, 3, 4]))).toThrow()
  })

  test("serializeEmbedDocx blank document is non-empty OOXML", () => {
    const bytes = serializeEmbedDocx(createBlankDocument())
    expect(bytes.byteLength).toBeGreaterThan(50)
    // ZIP local file header magic
    expect(bytes[0]).toBe(0x50)
    expect(bytes[1]).toBe(0x4b)
  })

  test("serializeEmbedPdf returns PDF bytes for a blank document", async () => {
    const pdf = await serializeEmbedPdf(createBlankDocument())
    expect(pdf.byteLength).toBeGreaterThan(50)
    const header = String.fromCharCode(
      pdf[0]!,
      pdf[1]!,
      pdf[2]!,
      pdf[3]!,
      pdf[4]!
    )
    expect(header).toBe("%PDF-")
  })

  test("serializeEmbedPdf works for a normalised minimal DOCX", async () => {
    const doc = parseEmbedDocx(
      buildMinimalDocx({ paragraphs: ["PDF from embed helper"] })
    )
    const pdf = await serializeEmbedPdf(doc)
    expect(String.fromCharCode(pdf[0]!, pdf[1]!, pdf[2]!, pdf[3]!)).toBe("%PDF")
  })
})

describe("EditorController contract (headless helpers)", () => {
  test("controller-shaped object can load/get DOCX and PDF", async () => {
    const documentRef = { current: createBlankDocument() }
    let changeCount = 0
    let readOnly = false

    const controller: EditorController = {
      destroy: () => {
        documentRef.current = createBlankDocument()
      },
      loadDocx: async (bytes) => {
        documentRef.current = parseEmbedDocx(bytes)
        changeCount += 1
      },
      getDocx: async () => serializeEmbedDocx(documentRef.current),
      getPdf: async () => serializeEmbedPdf(documentRef.current),
      setReadOnly: (value) => {
        readOnly = value
      },
      getDocument: () => documentRef.current,
    }

    const options: EditorMountOptions = {
      readOnly: false,
      onChange: () => {
        changeCount += 1
      },
    }
    expect(options.readOnly).toBe(false)

    await controller.loadDocx(
      buildMinimalDocx({ paragraphs: ["Controller load"] })
    )
    expect(changeCount).toBe(1)
    expect(controller.getDocument()?.sections.length).toBeGreaterThan(0)

    const docx = await controller.getDocx()
    expect(docx[0]).toBe(0x50)

    const pdf = await controller.getPdf()
    expect(String.fromCharCode(pdf[0]!, pdf[1]!, pdf[2]!, pdf[3]!)).toBe("%PDF")

    controller.setReadOnly(true)
    expect(readOnly).toBe(true)

    // Ensure serializeDocx path matches helper for the same semantic doc
    expect(await controller.getDocx()).toEqual(
      serializeDocx(controller.getDocument()!)
    )

    controller.destroy()
  })
})
