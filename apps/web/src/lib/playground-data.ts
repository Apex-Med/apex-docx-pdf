import type { JsonSchema } from "@apex-docx-pdf/core"
import Ajv2020, { type ErrorObject } from "ajv/dist/2020"
import addFormats from "ajv-formats"

export type TemplateDataIssue = Readonly<{
  path: string
  message: string
}>

export type TemplateDataValidation =
  | Readonly<{ ok: true; issues: readonly [] }>
  | Readonly<{
      ok: false
      errors: readonly string[]
      issues: readonly TemplateDataIssue[]
    }>

export type PlaygroundImageValue = Readonly<{
  mimeType: "image/png" | "image/jpeg"
  bytes: readonly number[]
  pixelWidth: number
  pixelHeight: number
  width: number
  height: number
  preserveAspectRatio: boolean
  altText: string
}>

const DEFAULT_IMAGE_WIDTH_TWIPS = 2_880
const validators = new WeakMap<object, ReturnType<Ajv2020["compile"]>>()

export function validateTemplateData(
  schema: JsonSchema,
  data: Readonly<Record<string, unknown>>
): TemplateDataValidation {
  let validate = validators.get(schema)
  if (!validate) {
    const ajv = new Ajv2020({ allErrors: true, strict: true })
    addFormats(ajv)
    validate = ajv.compile(schema)
    validators.set(schema, validate)
  }
  if (validate(data)) return { ok: true, issues: [] }
  const issues = (validate.errors ?? []).map(schemaIssue)
  return {
    ok: false,
    errors: issues.map(
      (issue) => `${concretePathToJsonPointer(issue.path)} ${issue.message}`
    ),
    issues,
  }
}

export function fieldValidationMessages(
  issues: readonly TemplateDataIssue[],
  path: string,
  includeDescendants = false
): readonly string[] {
  const messages = issues
    .filter(
      (issue) =>
        issue.path === path ||
        (includeDescendants &&
          (issue.path.startsWith(`${path}.`) ||
            issue.path.startsWith(`${path}[`)))
    )
    .map((issue) => issue.message)
  return [...new Set(messages)]
}

export function parseFiniteNumberInput(value: string): number | undefined {
  const parsed = value === "" ? 0 : Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function formatTemplateDataErrors(errors: readonly string[]): string {
  if (errors.length === 0) return "Template data does not match the schema."
  const visible = errors.slice(0, 3)
  const suffix =
    errors.length > visible.length
      ? ` (+${errors.length - visible.length} more)`
      : ""
  return `${visible.join("; ")}${suffix}`
}

export async function readPlaygroundImage(
  file: Pick<File, "arrayBuffer" | "name" | "type">
): Promise<PlaygroundImageValue> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const details = inspectImageBytes(bytes)
  const height = Math.max(
    1,
    Math.round(
      (DEFAULT_IMAGE_WIDTH_TWIPS * details.pixelHeight) / details.pixelWidth
    )
  )
  return {
    mimeType: details.mimeType,
    bytes: Array.from(bytes),
    pixelWidth: details.pixelWidth,
    pixelHeight: details.pixelHeight,
    width: DEFAULT_IMAGE_WIDTH_TWIPS,
    height,
    preserveAspectRatio: true,
    altText: file.name.replace(/\.(?:png|jpe?g)$/iu, ""),
  }
}

export function inspectImageBytes(bytes: Uint8Array): Readonly<{
  mimeType: "image/png" | "image/jpeg"
  pixelWidth: number
  pixelHeight: number
}> {
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const pixelWidth = view.getUint32(16)
    const pixelHeight = view.getUint32(20)
    if (pixelWidth < 1 || pixelHeight < 1)
      throw new Error("PNG dimensions are invalid.")
    return { mimeType: "image/png", pixelWidth, pixelHeight }
  }

  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    let offset = 2
    while (offset + 3 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1
        continue
      }
      while (bytes[offset] === 0xff) offset += 1
      const marker = bytes[offset]
      offset += 1
      if (marker === undefined || marker === 0xd9 || marker === 0xda) break
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
      if (offset + 1 >= bytes.length) break
      const length = view.getUint16(offset)
      if (length < 2 || offset + length > bytes.length) break
      if (isJpegStartOfFrame(marker) && length >= 7) {
        const pixelHeight = view.getUint16(offset + 3)
        const pixelWidth = view.getUint16(offset + 5)
        if (pixelWidth < 1 || pixelHeight < 1) break
        return { mimeType: "image/jpeg", pixelWidth, pixelHeight }
      }
      offset += length
    }
    throw new Error("JPEG dimensions could not be read.")
  }

  throw new Error("Choose a PNG or JPEG image with matching file bytes.")
}

function schemaIssue(error: ErrorObject): TemplateDataIssue {
  const property =
    error.keyword === "required" &&
    typeof error.params.missingProperty === "string"
      ? error.params.missingProperty
      : error.keyword === "additionalProperties" &&
          typeof error.params.additionalProperty === "string"
        ? error.params.additionalProperty
        : undefined
  const pointer = property
    ? `${error.instancePath}/${escapeJsonPointer(property)}`
    : error.instancePath
  return {
    path: jsonPointerToConcretePath(pointer),
    message: error.message ?? "is invalid",
  }
}

function escapeJsonPointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1")
}

function unescapeJsonPointer(value: string): string {
  return value.replaceAll("~1", "/").replaceAll("~0", "~")
}

function jsonPointerToConcretePath(pointer: string): string {
  if (!pointer) return ""
  const result: string[] = []
  for (const rawSegment of pointer.slice(1).split("/")) {
    const segment = unescapeJsonPointer(rawSegment)
    if (/^(?:0|[1-9]\d*)$/u.test(segment) && result.length > 0) {
      result[result.length - 1] += `[${segment}]`
    } else {
      result.push(segment)
    }
  }
  return result.join(".")
}

function concretePathToJsonPointer(path: string): string {
  if (!path) return "/"
  return `/${path
    .replaceAll(/\[(\d+)\]/gu, ".$1")
    .split(".")
    .map(escapeJsonPointer)
    .join("/")}`
}

function isJpegStartOfFrame(marker: number): boolean {
  return (
    marker >= 0xc0 &&
    marker <= 0xcf &&
    marker !== 0xc4 &&
    marker !== 0xc8 &&
    marker !== 0xcc
  )
}
