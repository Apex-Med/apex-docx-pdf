import type {
  Diagnostic,
  DiagnosticSeverity,
  SourceLocation,
} from "@apex-docx-pdf/core"

export function diagnostic(
  code: string,
  message: string,
  severity: DiagnosticSeverity = "error",
  source?: SourceLocation
): Diagnostic {
  return source === undefined
    ? { code, severity, message }
    : { code, severity, message, source }
}

export function source(part: string, xmlPath: string): SourceLocation {
  return { part, xmlPath }
}
