import { parser as jsonParser } from "@lezer/json"

export type JsonParseIssue = Readonly<{
  message: string
  line?: number
  column?: number
  position?: number
}>

export type JsonParseResult =
  | Readonly<{ ok: true; data: Readonly<Record<string, unknown>> }>
  | Readonly<{ ok: false; issue: JsonParseIssue }>

export function parseTemplateJson(text: string): JsonParseResult {
  try {
    const parsed: unknown = JSON.parse(text)
    if (!isRecord(parsed)) {
      return {
        ok: false,
        issue: {
          message:
            "Root value must be a JSON object ({ … }), not an array or primitive.",
          line: 1,
          column: 1,
          position: 0,
        },
      }
    }
    return { ok: true, data: parsed }
  } catch (error) {
    return { ok: false, issue: describeJsonSyntaxError(error, text) }
  }
}

export function formatJsonIssue(issue: JsonParseIssue): string {
  if (issue.line !== undefined && issue.column !== undefined) {
    return `Line ${issue.line}, column ${issue.column}: ${issue.message}`
  }
  return issue.message
}

export function isRecord(
  value: unknown
): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function describeJsonSyntaxError(error: unknown, text: string): JsonParseIssue {
  if (!(error instanceof SyntaxError)) {
    return { message: error instanceof Error ? error.message : "Invalid JSON" }
  }

  const message = tidySyntaxMessage(error.message)
  const position = resolveErrorPosition(error.message, text)
  const { line, column } = lineColAt(text, position)
  return { message, line, column, position }
}

function resolveErrorPosition(message: string, text: string): number {
  const lineCol = /line\s+(\d+)\s+column\s+(\d+)/i.exec(message)
  if (lineCol) {
    return offsetAt(text, Number(lineCol[1]), Number(lineCol[2]))
  }

  const positionMatch = /position\s+(\d+)/i.exec(message)
  if (positionMatch) {
    return Math.min(Number(positionMatch[1]), text.length)
  }

  return findLezerErrorPosition(text)
}

function findLezerErrorPosition(text: string): number {
  if (!text.trim()) return 0

  const tree = jsonParser.parse(text)
  let errorFrom: number | undefined
  tree.iterate({
    enter(node) {
      if (!node.type.isError) return
      if (errorFrom === undefined || node.from < errorFrom) {
        errorFrom = node.from
      }
    },
  })

  if (errorFrom !== undefined) return errorFrom
  return Math.max(0, text.length - 1)
}

function tidySyntaxMessage(message: string): string {
  return message
    .replace(/^JSON\.parse:\s*/i, "")
    .replace(/^JSON Parse error:\s*/i, "")
    .replace(/^json parse error:\s*/i, "")
    .replace(/\s+of the JSON data$/i, "")
    .replace(/\s+in JSON at position \d+/i, "")
    .replace(/\s+at position \d+(?:\s*\(line \d+ column \d+\))?/i, "")
    .replace(/^Unexpected end of JSON input$/i, "Unexpected end of input")
    .replace(/^Unexpected EOF$/i, "Unexpected end of input")
    .trim()
}

function lineColAt(
  text: string,
  position: number
): { line: number; column: number } {
  const clamped = Math.max(0, Math.min(position, text.length))
  let line = 1
  let column = 1
  for (let index = 0; index < clamped; index += 1) {
    if (text.charCodeAt(index) === 10) {
      line += 1
      column = 1
    } else {
      column += 1
    }
  }
  return { line, column }
}

function offsetAt(text: string, line: number, column: number): number {
  let currentLine = 1
  let index = 0
  while (index < text.length && currentLine < line) {
    if (text.charCodeAt(index) === 10) currentLine += 1
    index += 1
  }
  return Math.min(text.length, index + Math.max(0, column - 1))
}
