import { DEFAULT_ATTACHMENT_ACCEPT } from "../model/attachment"
import { createFormId, prettifyKey, slugifyKey } from "../model/ids"
import type { FormQuestion, FormQuestionKind } from "../model/types"
import { DEFAULT_DATE_PATTERN, type BoundTag, type BoundTagKind } from "./types"

export type TagSeed = Readonly<{
  slug: string
  kind?: BoundTagKind
  label?: string
  includeTime?: boolean
  role?: BoundTag["role"]
}>

export function questionFromTag(tag: TagSeed): FormQuestion {
  const kind = kindFromTag(tag)
  const key = slugifyKey(tag.slug.split(".").at(-1) ?? tag.slug)
  const label = tag.label ?? prettifyKey(key)
  return {
    id: createFormId("node"),
    key,
    label,
    kind,
    required: false,
    ...(kind === "date"
      ? {
          includeTime: tag.includeTime === true,
        }
      : {}),
    ...(kind === "repeater" ? { columns: 2, children: [] } : {}),
    ...(kind === "attachment"
      ? {
          attachment: {
            accept: [...DEFAULT_ATTACHMENT_ACCEPT],
            maxCount: 1,
          },
        }
      : {}),
  }
}

export function boundTagFromSeed(tag: TagSeed): BoundTag {
  const kind = tag.kind ?? "string"
  return {
    id: `tag:${tag.slug}`,
    label: tag.label ?? prettifyKey(tag.slug),
    slug: tag.slug,
    kind,
    role: tag.role ?? "value",
    source: "user",
    ...(kind === "date"
      ? {
          date: {
            includeTime: tag.includeTime === true,
            pattern: DEFAULT_DATE_PATTERN,
          },
        }
      : {}),
  }
}

function kindFromTag(tag: TagSeed): FormQuestionKind {
  if (tag.role === "each") return "repeater"
  if (tag.role === "image") return "attachment"
  if (tag.kind === "number") return "number"
  if (tag.kind === "date") return "date"
  return "short_text"
}
