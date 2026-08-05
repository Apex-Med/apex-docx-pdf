import { describe, expect, test } from "bun:test"

import { inspectDocx } from "../src"
import { buildOneParagraphDocx } from "./helpers/docx-fixture"

function diagnosticsFor(
  extraParts: Readonly<Record<string, string | Uint8Array>>
) {
  return inspectDocx(buildOneParagraphDocx({ extraParts })).diagnostics
}

function codesFor(extraParts: Readonly<Record<string, string | Uint8Array>>) {
  return diagnosticsFor(extraParts).map((entry) => entry.code)
}

const RELATIONSHIPS =
  "http://schemas.openxmlformats.org/package/2006/relationships"
const OFFICE_RELATIONSHIPS =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships"

describe("DOCX active-content package security", () => {
  test("rejects VBA parts and macro-enabled content types before document parsing", () => {
    const diagnostics = diagnosticsFor({
      "[Content_Types].xml": `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.ms-word.document.macroEnabled.main+xml"/><Override PartName="/word/vbaProject.bin" ContentType="application/vnd.ms-office.vbaProject"/></Types>`,
      "word/vbaProject.bin": new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]),
    })

    expect(diagnostics.map((entry) => entry.code)).toEqual([
      "DOCX_FORBIDDEN_VBA",
    ])
    expect(diagnostics[0]?.source).toEqual({
      part: "word/vbaProject.bin",
      xmlPath: "/",
    })
  })

  test("rejects OLE embeddings even when no relationship points at the part", () => {
    expect(
      codesFor({ "word/embeddings/oleObject1.bin": new Uint8Array([1, 2, 3]) })
    ).toEqual(["DOCX_FORBIDDEN_OLE_OBJECT"])
  })

  test("rejects renamed OLE objects, ActiveX controls, and attached packages by relationship type", () => {
    const codes = codesFor({
      "word/payloads/object.dat": "object",
      "word/payloads/control.dat": "control",
      "word/payloads/package.dat": "package",
      "word/_rels/document.xml.rels": `<Relationships xmlns="${RELATIONSHIPS}"><Relationship Id="ole" Type="${OFFICE_RELATIONSHIPS}/oleObject" Target="payloads/object.dat"/><Relationship Id="control" Type="${OFFICE_RELATIONSHIPS}/control" Target="payloads/control.dat"/><Relationship Id="package" Type="${OFFICE_RELATIONSHIPS}/pack&#97;ge" Target="payloads/package.dat"/></Relationships>`,
    })

    expect(codes).toEqual([
      "DOCX_FORBIDDEN_OLE_OBJECT",
      "DOCX_FORBIDDEN_ACTIVEX",
      "DOCX_FORBIDDEN_ATTACHED_PACKAGE",
    ])
  })

  test("rejects ActiveX content types without relying on conventional paths", () => {
    expect(
      codesFor({
        "[Content_Types].xml": `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/data/control.bin" ContentType="application/vnd.ms-office.activeX"/></Types>`,
        "word/data/control.bin": "control",
      })
    ).toEqual(["DOCX_FORBIDDEN_ACTIVEX"])
  })

  test("rejects executable attachments by path or declared content type", () => {
    expect(codesFor({ "word/data/payload.exe": "MZ" })).toEqual([
      "DOCX_FORBIDDEN_EXECUTABLE_CONTENT",
    ])
    expect(
      codesFor({
        "[Content_Types].xml": `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/data/payload.dat" ContentType="application/x-msdownload"/></Types>`,
        "word/data/payload.dat": "MZ",
      })
    ).toEqual(["DOCX_FORBIDDEN_EXECUTABLE_CONTENT"])
  })

  test("rejects attached templates and toolbars, custom UI, web extensions, and alternative-format chunks as active OOXML", () => {
    for (const type of [
      `${OFFICE_RELATIONSHIPS}/attachedTemplate`,
      `${OFFICE_RELATIONSHIPS}/attachedToolbars`,
      "http://schemas.microsoft.com/office/2006/relationships/ui/extensibility",
      `${OFFICE_RELATIONSHIPS}/webextension`,
      `${OFFICE_RELATIONSHIPS}/aFChunk`,
    ]) {
      expect(
        codesFor({
          "word/payload.xml": "<payload/>",
          "word/_rels/document.xml.rels": `<Relationships xmlns="${RELATIONSHIPS}"><Relationship Id="active" Type="${type}" Target="payload.xml"/></Relationships>`,
        })
      ).toEqual(["DOCX_FORBIDDEN_ACTIVE_CONTENT"])
    }
  })

  test("keeps the ordinary package namespace and supported internal relationships valid", () => {
    const result = inspectDocx(buildOneParagraphDocx())
    expect(result.ok).toBe(true)
    expect(result.diagnostics).toEqual([])
  })

  test("active content remains an error in lenient unsupported-feature mode", () => {
    const result = inspectDocx(
      buildOneParagraphDocx({
        extraParts: { "word/activeX/activeX1.bin": "control" },
      }),
      { unsupportedFeatures: "lenient" }
    )
    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]?.severity).toBe("error")
    expect(result.diagnostics[0]?.code).toBe("DOCX_FORBIDDEN_ACTIVEX")
  })
})
