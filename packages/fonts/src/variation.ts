import type { ParsedFontFace } from "./parser"

export type FontVariationOptions = Readonly<{
  wght?: number
  ital?: number
}>

export type FontVariationResult = Readonly<{
  parsed: ParsedFontFace
  settings: Readonly<Record<string, number>>
}>
