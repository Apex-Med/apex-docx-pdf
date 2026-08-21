import { isQuestion, type FormTemplate } from "../model/types"
import { walkNodes } from "../model/walk"
import { tagsFromForm } from "./tags-from-form"
import type { BindingDiagnostic, BindingDocument, BoundTag } from "./types"

const MAX_MARKER_DEPTH = 32

export function bindingDiagnostics(
  form: FormTemplate,
  document: BindingDocument
): readonly BindingDiagnostic[] {
  const diagnostics: BindingDiagnostic[] = []
  const tags = tagsFromForm(form)
  const bySlug = new Map(tags.map((tag) => [tag.slug, tag]))
  const formKeys = new Set<string>()
  walkNodes(form, ({ node }) => {
    if (isQuestion(node)) formKeys.add(node.key)
  })

  const documentSlugs = new Set(document.valueSlugs)
  for (const slug of document.valueSlugs) {
    if (!bySlug.has(slug) && !formKeys.has(slug.split(".")[0] ?? slug)) {
      diagnostics.push({
        code: "ORPHAN_TAG",
        severity: "warning",
        message: `Document tag “${slug}” is not bound to a form question`,
        key: slug,
      })
    }
  }

  for (const tag of tags) {
    if (
      tag.role === "value" &&
      !documentSlugs.has(tag.slug) &&
      !tag.parentKey
    ) {
      diagnostics.push({
        code: "UNUSED_QUESTION",
        severity: "warning",
        message: `Question “${tag.label}” is not placed in the document`,
        key: tag.slug,
      })
    }
    if (tag.role === "each") {
      const open = document.markers.some(
        (marker) => marker.type === "each" && marker.path === tag.slug
      )
      if (!open) {
        diagnostics.push({
          code: "UNUSED_REPEATER",
          severity: "warning",
          message: `Repeater “${tag.label}” has no {{#each ${tag.slug}}} region in the document`,
          key: tag.slug,
        })
      }
    }
    if (tag.role === "image" && !document.imagePaths.includes(tag.slug)) {
      diagnostics.push({
        code: "UNUSED_ATTACHMENT",
        severity: "warning",
        message: `Attachment “${tag.label}” has no {{@image ${tag.slug}}} tag in the document`,
        key: tag.slug,
      })
    }
  }

  diagnostics.push(...markerBalanceDiagnostics(document.markers))
  diagnostics.push(...kindMismatchDiagnostics(tags, document))
  return diagnostics
}

export function markerBalanceDiagnostics(
  markers: BindingDocument["markers"]
): BindingDiagnostic[] {
  const diagnostics: BindingDiagnostic[] = []
  const stack: Array<{ type: "if" | "each"; path?: string }> = []
  for (const marker of markers) {
    if (marker.type === "if" || marker.type === "each") {
      if (stack.length >= MAX_MARKER_DEPTH) {
        diagnostics.push({
          code: "MARKER_NESTING",
          severity: "error",
          message: `Block markers exceed the ${MAX_MARKER_DEPTH}-level nesting limit`,
          key: marker.path,
        })
      }
      stack.push({ type: marker.type, path: marker.path })
      continue
    }
    if (marker.type === "else") {
      const frame = stack.at(-1)
      if (frame?.type !== "if") {
        diagnostics.push({
          code: "MARKER_ELSE",
          severity: "error",
          message: "{{else}} must belong to an open {{#if}} block",
        })
      }
      continue
    }
    const expected = marker.type === "endIf" ? "if" : "each"
    const frame = stack.at(-1)
    if (!frame || frame.type !== expected) {
      diagnostics.push({
        code: "MARKER_UNBALANCED",
        severity: "error",
        message: `Closing {{/${expected}}} does not match the open block`,
        key: marker.path,
      })
      continue
    }
    stack.pop()
  }
  for (const frame of stack) {
    diagnostics.push({
      code: "MARKER_UNCLOSED",
      severity: "error",
      message: `Unclosed {{#${frame.type} ${frame.path ?? ""}}}`.trim(),
      key: frame.path,
    })
  }
  return diagnostics
}

function kindMismatchDiagnostics(
  tags: readonly BoundTag[],
  document: BindingDocument
): BindingDiagnostic[] {
  const bySlug = new Map(tags.map((tag) => [tag.slug, tag]))
  const diagnostics: BindingDiagnostic[] = []
  for (const slug of document.valueSlugs) {
    const tag = bySlug.get(slug)
    if (!tag) continue
    if (tag.role !== "value") {
      diagnostics.push({
        code: "KIND_MISMATCH",
        severity: "warning",
        message: `“${slug}” is a ${tag.role} region but is used as a value tag`,
        key: slug,
      })
    }
  }
  return diagnostics
}
