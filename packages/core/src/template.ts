import type { Diagnostic, SourceLocation } from "./diagnostics"
import type { DocumentHash, NodeId } from "./ids"
import type { SemanticDocument } from "./document"
import type { Twip } from "./units"

/**
 * Caller-owned value accepted by a canonical `{{@image path}}` template tag.
 * Width and height are physical layout bounds in twips. The engine never
 * resolves URLs: callers must provide the complete PNG or JPEG bytes.
 */
export type TemplateImageValue = Readonly<{
  mimeType: "image/png" | "image/jpeg"
  bytes: Uint8Array
  pixelWidth: number
  pixelHeight: number
  width: Twip
  height: Twip
  preserveAspectRatio?: boolean
  altText?: string
}>

export type TemplateFieldKind =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "image"
  | "object"
  | "array"
  | "unknown"

export type FormatterReference = Readonly<{
  name: string
  arguments: readonly (string | number | boolean)[]
}>

export type TemplateField = Readonly<{
  path: string
  kind: TemplateFieldKind
  required: boolean
  formatters: readonly FormatterReference[]
  sourceLocations: readonly SourceLocation[]
  inferredFrom: readonly string[]
  description?: string
}>

export type TemplateManifest = Readonly<{
  fields: readonly TemplateField[]
}>

export type JsonSchema = Readonly<Record<string, unknown>>

export type CompiledTemplate = Readonly<{
  version: string
  templateHash: DocumentHash
  source: SemanticDocument
  manifest: TemplateManifest
  jsonSchema: JsonSchema
  starterData: Readonly<Record<string, unknown>>
  diagnostics: readonly Diagnostic[]
  placeholderNodes: Readonly<Record<NodeId, string>>
}>
