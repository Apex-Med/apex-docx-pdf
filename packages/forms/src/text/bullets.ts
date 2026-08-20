export type TextEdit = {
  value: string
  selectionStart: number
  selectionEnd: number
}

const DASH_MARKER = /^(\s*)- /gm
const BULLET_LIST_PREFIX = /^(\s*)• /

function lineStartAt(value: string, position: number): number {
  if (position === 0) return 0
  return value.lastIndexOf("\n", position - 1) + 1
}

function lineEndAt(value: string, position: number): number {
  const nextNewline = value.indexOf("\n", position)
  return nextNewline === -1 ? value.length : nextNewline
}

/** Render dash-space shorthand as typographic bullets at the start of lines. */
export function normalizeBulletMarkers(value: string): string {
  return value.replace(DASH_MARKER, "$1• ")
}

/** Continue a bullet on Enter, or finish the list from an empty bullet. */
export function continueBulletList(
  value: string,
  selectionStart: number,
  selectionEnd: number
): TextEdit | null {
  if (selectionStart !== selectionEnd) return null

  const lineStart = lineStartAt(value, selectionStart)
  const lineEnd = lineEndAt(value, selectionStart)
  const line = value.slice(lineStart, lineEnd)
  const prefixMatch = BULLET_LIST_PREFIX.exec(line)
  if (!prefixMatch) return null

  const marker = prefixMatch[0]
  if (selectionStart < lineStart + marker.length) return null

  if (line === marker) {
    return {
      value: `${value.slice(0, lineStart)}${value.slice(lineEnd)}`,
      selectionStart: lineStart,
      selectionEnd: lineStart,
    }
  }

  const insertion = `\n${marker}`
  const caret = selectionStart + insertion.length
  return {
    value: `${value.slice(0, selectionStart)}${insertion}${value.slice(selectionStart)}`,
    selectionStart: caret,
    selectionEnd: caret,
  }
}
