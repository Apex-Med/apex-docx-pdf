import { describe, expect, test } from "bun:test"
import type {
  BrowserCompileResult,
  WorkerProgress,
} from "@apex-docx-pdf/browser"

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
    engineVersion: "0.0.0-phase.7",
    fontRegistryHash: "fonts-123",
    templateHash: "template-123",
    manifest: { fields },
    jsonSchema: {},
    starterData: {},
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
    expect(BUNDLED_FONT_PROFILE.faces).toHaveLength(4)
    expect(BUNDLED_FONT_PROFILE.aliases).toEqual([
      "Calibri",
      "Arial",
      "Helvetica",
      "Times New Roman",
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

    expect(describeWorkerProgress(progress)).toBe("Lay out pages · Step 2 of 3")
  })
})
