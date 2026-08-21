import { describe, expect, test } from "bun:test"
import type { BrowserCompileResult, WorkerProgress } from "@apexmed/browser"

import {
  BUNDLED_FONT_PROFILE,
  PROFILE_CAPABILITIES,
  describeWorkerProgress,
  inspectTemplate,
} from "../src/lib/template-inspection"

function compileResult(
  fields: BrowserCompileResult["manifest"]["fields"],
  diagnostics: BrowserCompileResult["diagnostics"] = []
): BrowserCompileResult {
  return {
    engineVersion: "0.0.0-phase.8",
    fontRegistryHash: "fonts-123",
    templateHash: "template-123",
    manifest: { fields },
    jsonSchema: {},
    starterData: {},
    templatePreview: {
      displayList: { pages: [] },
      placeholderNodes: {},
      assets: [],
      layoutTrace: { pages: [], events: [] },
    },
    inspection: {
      documentModelAvailable: true,
      requiredFonts: [],
      requiredFontEntryCount: 0,
      requiredFontsTruncated: false,
      features: [],
      featureEntryCount: 0,
      featuresTruncated: false,
      diagnostics: [],
      sourceLimitPerEntry: 20,
      entryLimit: 200,
    },
    diagnostics,
  }
}

describe("template inspection", () => {
  test("summarizes field kinds, required paths, loops, and manifest-backed conditions", () => {
    const result = inspectTemplate(
      compileResult(
        [
          {
            path: "invoice.items",
            kind: "array",
            required: true,
            formatters: [],
            sourceLocations: [],
            inferredFrom: ["{{#each invoice.items}}"],
          },
          {
            path: "invoice.items[].amount",
            kind: "number",
            required: true,
            formatters: [],
            sourceLocations: [],
            inferredFrom: ["{{amount:number}}"],
          },
          {
            path: "showNotes",
            kind: "boolean",
            required: false,
            formatters: [],
            sourceLocations: [],
            inferredFrom: ["{{#if showNotes}}"],
          },
          {
            path: "title",
            kind: "string",
            required: true,
            formatters: [],
            sourceLocations: [],
            inferredFrom: ["{{title:string}}"],
          },
        ],
        [
          { code: "warning-one", severity: "warning", message: "Warning" },
          { code: "info-one", severity: "info", message: "Info" },
        ]
      )
    )

    expect(result).toEqual({
      fieldCount: 4,
      previewPageCount: 0,
      fieldCountsByKind: [
        { kind: "string", count: 1 },
        { kind: "number", count: 1 },
        { kind: "boolean", count: 1 },
        { kind: "array", count: 1 },
      ],
      requiredFields: ["invoice.items", "invoice.items[].amount", "title"],
      arrayRoots: ["invoice.items"],
      conditionalFields: ["showNotes"],
      diagnosticCounts: { error: 0, warning: 1, info: 1 },
      documentModelAvailable: true,
      requiredFonts: [],
      features: [],
    })
  })

  test("does not infer structural document facts outside the public result", () => {
    const inspection = inspectTemplate(compileResult([]))

    expect(inspection.fieldCount).toBe(0)
    expect(Object.keys(inspection)).not.toContain("images")
    expect(Object.keys(inspection)).not.toContain("sections")
    expect(PROFILE_CAPABILITIES.map(({ label }) => label)).toEqual([
      "Static images",
      "Sections",
      "Headers and footers",
      "Page fields",
    ])
    expect(BUNDLED_FONT_PROFILE.families).toEqual([
      "Inter",
      "Instrument Sans",
      "Instrument Serif",
      "Geist",
      "Geist Mono",
      "Bricolage Grotesque",
    ])
    expect(BUNDLED_FONT_PROFILE.catalogVersion).toBe("apex-offline-ttf/v3")
    expect(BUNDLED_FONT_PROFILE.uploadedEmbeddedFonts).toBe(false)
    expect(BUNDLED_FONT_PROFILE.aliases).toEqual([
      "Arial → Inter",
      "Calibri → Inter",
      "Helvetica → Inter",
      "Times New Roman → Instrument Serif",
      "Courier New → Geist Mono",
      "Inter Variable → Inter",
      "Inter Medium → Inter (500)",
      "Inter SemiBold → Inter (600)",
      "BricolageGrotesque → Bricolage Grotesque",
      "Bricolage Grotesque Medium → Bricolage Grotesque (500)",
      "Bricolage Grotesque SemiBold → Bricolage Grotesque (600)",
      "InstrumentSans → Instrument Sans",
      "InstrumentSerif → Instrument Serif",
      "GeistMono → Geist Mono",
    ])
  })

  test("describes real worker stages without implying byte progress", () => {
    const progress: WorkerProgress = {
      requestId: "request-1",
      stage: "layout",
      completed: 2,
      total: 3,
      message: "Laying out pages",
    }

    expect(describeWorkerProgress(progress)).toBe(
      "Laying out pages · Step 2 of 3"
    )
  })
})
