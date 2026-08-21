export type HsvColor = Readonly<{
  h: number
  s: number
  v: number
}>

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export function normalizeHexColor(value: string): string | null {
  const raw = value.trim().replace(/^#/, "")
  if (/^[\da-f]{3}$/i.test(raw)) {
    return `#${raw
      .split("")
      .map((character) => `${character}${character}`)
      .join("")}`.toLowerCase()
  }
  return /^[\da-f]{6}$/i.test(raw) ? `#${raw.toLowerCase()}` : null
}

export function hexToHsv(value: string): HsvColor {
  const normalized = normalizeHexColor(value) ?? "#000000"
  const red = Number.parseInt(normalized.slice(1, 3), 16) / 255
  const green = Number.parseInt(normalized.slice(3, 5), 16) / 255
  const blue = Number.parseInt(normalized.slice(5, 7), 16) / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min
  let hue = 0

  if (delta !== 0) {
    if (max === red) hue = 60 * (((green - blue) / delta) % 6)
    else if (max === green) hue = 60 * ((blue - red) / delta + 2)
    else hue = 60 * ((red - green) / delta + 4)
  }

  return {
    h: hue < 0 ? hue + 360 : hue,
    s: max === 0 ? 0 : delta / max,
    v: max,
  }
}

export function hsvToHex({ h, s, v }: HsvColor): string {
  const hue = ((h % 360) + 360) % 360
  const saturation = clampUnit(s)
  const brightness = clampUnit(v)
  const chroma = brightness * saturation
  const section = hue / 60
  const x = chroma * (1 - Math.abs((section % 2) - 1))
  const match = brightness - chroma
  const [red, green, blue] =
    section < 1
      ? [chroma, x, 0]
      : section < 2
        ? [x, chroma, 0]
        : section < 3
          ? [0, chroma, x]
          : section < 4
            ? [0, x, chroma]
            : section < 5
              ? [x, 0, chroma]
              : [chroma, 0, x]

  return `#${[red, green, blue]
    .map((channel) =>
      Math.round((channel + match) * 255)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`
}
