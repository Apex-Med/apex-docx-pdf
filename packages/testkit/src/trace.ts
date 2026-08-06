import type { LayoutTrace } from "@apex-docx-pdf/core"

/**
 * Serializes a layout trace with a fixed field order and no environment-specific
 * whitespace. Array order remains meaningful and is therefore preserved.
 */
export function serializeLayoutTrace(trace: LayoutTrace): string {
  return JSON.stringify({
    pages: trace.pages.map((page) => ({
      pageNumber: page.pageNumber,
      pageBounds: rect(page.pageBounds),
      contentBounds: rect(page.contentBounds),
    })),
    events: trace.events.map((event) => ({
      pageNumber: event.pageNumber,
      sourceNodeId: event.sourceNodeId,
      kind: event.kind,
      ...(event.bounds === undefined ? {} : { bounds: rect(event.bounds) }),
      ...(event.reason === undefined ? {} : { reason: event.reason }),
      ...(event.kind === "glyph-run" ? { baselineY: event.baselineY } : {}),
      ...(event.kind === "table-row-fragment"
        ? {
            fragmentOffset: event.fragmentOffset,
            rowHeight: event.rowHeight,
            repeatedHeader: event.repeatedHeader,
          }
        : {}),
      ...(event.kind === "keep-decision" ? { decision: event.decision } : {}),
    })),
  })
}

function rect(value: LayoutTrace["pages"][number]["pageBounds"]): object {
  return {
    x: value.x,
    y: value.y,
    width: value.width,
    height: value.height,
  }
}
