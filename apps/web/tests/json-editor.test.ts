import { describe, expect, test } from "bun:test"

import { formatJsonIssue, parseTemplateJson } from "../src/lib/json-editor"

describe("parseTemplateJson", () => {
  test("accepts a JSON object", () => {
    const result = parseTemplateJson('{\n  "name": "Ada"\n}')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data).toEqual({ name: "Ada" })
  })

  test("rejects arrays and primitives", () => {
    const result = parseTemplateJson("[1, 2]")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issue.message).toContain("JSON object")
    }
  })

  test("reports line and column for syntax errors", () => {
    const result = parseTemplateJson('{\n  "name": "Ada",\n}')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issue.line).toBeGreaterThan(0)
      expect(result.issue.column).toBeGreaterThan(0)
      expect(formatJsonIssue(result.issue)).toMatch(/^Line \d+, column \d+:/)
    }
  })

  test("reports a clear message for truncated JSON", () => {
    const result = parseTemplateJson('{"name":')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issue.message.toLowerCase()).toContain("end of input")
    }
  })
})
