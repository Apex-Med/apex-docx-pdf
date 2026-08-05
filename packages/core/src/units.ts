declare const twipBrand: unique symbol

export type Twip = number & { readonly [twipBrand]: true }

export const TWIPS_PER_POINT = 20
export const TWIPS_PER_INCH = 1_440

export function twips(value: number): Twip {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError("Layout units must be safe integers")
  }

  return value as Twip
}

export function pointsToTwips(points: number): Twip {
  if (!Number.isFinite(points)) {
    throw new TypeError("Point values must be finite")
  }

  return twips(Math.round(points * TWIPS_PER_POINT))
}

export function twipsToPoints(value: Twip): number {
  return value / TWIPS_PER_POINT
}

export type Rect = Readonly<{
  x: Twip
  y: Twip
  width: Twip
  height: Twip
}>

export type Insets = Readonly<{
  top: Twip
  right: Twip
  bottom: Twip
  left: Twip
}>
