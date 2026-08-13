import type {
  NumberingDefinition,
  NumberingFormat,
  NumberingLevelDefinition,
  ParagraphNumbering,
} from "@apexmed/core"

export type NumberingLabelState = Map<string, Map<number, number>>

function formatCounter(value: number, format: NumberingFormat): string {
  if (format === "bullet") return "•"
  if (format === "decimal") return String(value)
  if (format === "lowerLetter" || format === "upperLetter") {
    let current = value
    let result = ""
    while (current > 0) {
      current -= 1
      result = String.fromCharCode(97 + (current % 26)) + result
      current = Math.floor(current / 26)
    }
    return format === "upperLetter" ? result.toUpperCase() : result
  }
  const roman = toRoman(value)
  return format === "upperRoman" ? roman : roman.toLowerCase()
}

function toRoman(value: number): string {
  const pairs: readonly (readonly [number, string])[] = [
    [1_000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ]
  let remaining = value
  let result = ""
  for (const [amount, token] of pairs) {
    while (remaining >= amount) {
      result += token
      remaining -= amount
    }
  }
  return result
}

function levelMap(
  definition: NumberingDefinition
): Map<number, NumberingLevelDefinition> {
  const levels = new Map<number, NumberingLevelDefinition>()
  for (const level of definition.levels) {
    if (!levels.has(level.level)) levels.set(level.level, level)
  }
  return levels
}

/** Format the visible list marker for a numbered paragraph. */
export function numberingLabelForParagraph(
  numbering: ParagraphNumbering | null | undefined,
  definitions: readonly NumberingDefinition[],
  counters: NumberingLabelState
): string | null {
  if (numbering === null || numbering === undefined) return null
  const definition = definitions.find(
    (entry) => entry.id === numbering.definitionId
  )
  if (definition === undefined) return null
  const levels = levelMap(definition)
  const level = levels.get(numbering.level)
  if (level === undefined) return null

  const state = counters.get(definition.id) ?? new Map<number, number>()
  counters.set(definition.id, state)
  for (const candidate of levels.values()) {
    if (
      candidate.level > level.level &&
      candidate.restartAfterLevel === level.level
    ) {
      state.delete(candidate.level)
    }
  }
  state.set(
    level.level,
    state.has(level.level)
      ? (state.get(level.level) as number) + 1
      : level.startAt
  )
  const referencedLevels = [...level.levelText.matchAll(/%([1-9])/gu)].map(
    (match) => Number(match[1]) - 1
  )
  for (const referenced of referencedLevels) {
    if (!state.has(referenced)) {
      const referencedLevel = levels.get(referenced)
      if (referencedLevel) state.set(referenced, referencedLevel.startAt)
    }
  }
  return level.levelText.replace(/%([1-9])/gu, (_token, digit: string) => {
    const referenced = Number(digit) - 1
    const referencedLevel = levels.get(referenced)
    const format = level.legal
      ? "decimal"
      : (referencedLevel?.format ?? level.format)
    return formatCounter(state.get(referenced) ?? level.startAt, format)
  })
}

/** First-item marker for a newly applied numbering definition. */
export function initialNumberingLabel(
  definition: NumberingDefinition,
  level = 0
): string | null {
  return numberingLabelForParagraph(
    { definitionId: definition.id, level },
    [definition],
    new Map()
  )
}
