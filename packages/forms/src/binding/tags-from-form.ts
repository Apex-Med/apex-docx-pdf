import { defaultReferenceFields } from "../model/ops"
import { isQuestion, type FormQuestion, type FormTemplate } from "../model/types"
import { walkNodes } from "../model/walk"
import {
  DEFAULT_DATE_PATTERN,
  DEFAULT_DATE_TIME_PATTERN,
  encodeImagePlaceholder,
  encodeMarkerPlaceholder,
  questionTagId,
  tagKindForQuestion,
  type BoundTag,
} from "./types"

export function tagsFromForm(form: FormTemplate): readonly BoundTag[] {
  const tags: BoundTag[] = []
  walkNodes(form, ({ node, location }) => {
    if (!isQuestion(node)) return
    const parentKey = location.path.at(-1)
    if (node.kind === "repeater") {
      tags.push({
        id: questionTagId(node.key),
        label: node.label,
        slug: node.key,
        kind: "string",
        role: "each",
        parentKey,
        source: "form",
      })
      return
    }
    if (node.kind === "attachment") {
      tags.push({
        id: questionTagId(node.key),
        label: node.label,
        slug: node.key,
        kind: "string",
        role: "image",
        parentKey,
        source: "form",
      })
      return
    }
    const kind = tagKindForQuestion(node)
    tags.push({
      id: questionTagId(node.key),
      label: node.label,
      slug: node.key,
      kind,
      role: "value",
      parentKey,
      source: "form",
      ...(kind === "date"
        ? {
            date: {
              includeTime: node.includeTime === true,
              pattern:
                node.includeTime === true
                  ? DEFAULT_DATE_TIME_PATTERN
                  : DEFAULT_DATE_PATTERN,
            },
          }
        : {}),
    })
    if (node.kind === "reference" || node.kind === "context") {
      const fields = fieldsForQuestion(node)
      for (const field of fields) {
        tags.push({
          id: questionTagId(`${node.key}.${field.key}`),
          label: `${node.label} ${field.label}`,
          slug: `${node.key}.${field.key}`,
          kind: "string",
          role: "value",
          parentKey: node.key,
          source: "form",
        })
      }
    }
    if (node.condition && node.condition.rules.length > 0) {
      tags.push({
        id: questionTagId(`if_${node.key}`),
        label: `Show ${node.label}`,
        slug: node.key,
        kind: "string",
        role: "if",
        parentKey,
        source: "form",
      })
    }
  })
  return tags
}

function fieldsForQuestion(
  question: FormQuestion
): readonly { key: string; label: string }[] {
  if (question.reference?.fields && question.reference.fields.length > 0) {
    return question.reference.fields
  }
  const source = question.reference?.source ?? question.context?.binding
  return source ? defaultReferenceFields(source) : []
}

export function markerPlaceholdersForTag(tag: BoundTag): readonly string[] {
  if (tag.role === "each") {
    return [
      encodeMarkerPlaceholder({ type: "each", path: tag.slug }),
      encodeMarkerPlaceholder({ type: "endEach" }),
    ]
  }
  if (tag.role === "if") {
    return [
      encodeMarkerPlaceholder({ type: "if", path: tag.slug }),
      encodeMarkerPlaceholder({ type: "endIf" }),
    ]
  }
  if (tag.role === "image") return [encodeImagePlaceholder(tag.slug)]
  return []
}
