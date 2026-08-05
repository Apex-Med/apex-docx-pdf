export type PlaygroundRenderRevision = number

export const initialPlaygroundRenderRevision: PlaygroundRenderRevision = 0

export function invalidatePlaygroundRender(
  revision: PlaygroundRenderRevision
): PlaygroundRenderRevision {
  return revision + 1
}

export function isPlaygroundRenderCurrent(
  currentRevision: PlaygroundRenderRevision,
  renderRevision: PlaygroundRenderRevision
): boolean {
  return currentRevision === renderRevision
}

export function isPlaygroundRenderedDataCurrent(
  renderedData: Readonly<Record<string, unknown>>,
  currentData: Readonly<Record<string, unknown>>
): boolean {
  return canonicalJson(renderedData) === canonicalJson(currentData)
}

export function emptyPlaygroundTemplateMetadata(): Readonly<{
  fileName?: string
  fileSize?: number
}> {
  return {}
}
import { canonicalJson } from "@/lib/render-cache"
