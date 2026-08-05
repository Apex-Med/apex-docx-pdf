import type { NodeId } from "./ids"

export type DiagnosticSeverity = "info" | "warning" | "error"
/**
 * Controls only explicitly classified unsupported-feature fallbacks.
 * Invalid input, security failures, and unclassified content loss always fail.
 */
export type UnsupportedFeatureMode = "strict" | "compatible" | "lenient"

export type SourceLocation = Readonly<{
  part: string
  xmlPath: string
  line?: number
  column?: number
}>

export type DiagnosticDetail = string | number | boolean | null

export type Diagnostic = Readonly<{
  code: string
  severity: DiagnosticSeverity
  message: string
  source?: SourceLocation
  nodeId?: NodeId
  details?: Readonly<Record<string, DiagnosticDetail>>
}>

export type OperationResult<T> =
  | Readonly<{
      ok: true
      value: T
      diagnostics: readonly Diagnostic[]
    }>
  | Readonly<{
      ok: false
      diagnostics: readonly Diagnostic[]
    }>

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error")
}
