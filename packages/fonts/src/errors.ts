export class FontConfigurationError extends Error {
  readonly code = "fonts/configuration" as const

  constructor(message: string) {
    super(message)
    this.name = "FontConfigurationError"
  }
}

export class FontShapingError extends Error {
  readonly code: "fonts/shaping-boundary" | "fonts/missing-glyph"

  constructor(
    code: "fonts/shaping-boundary" | "fonts/missing-glyph",
    message: string
  ) {
    super(message)
    this.name = "FontShapingError"
    this.code = code
  }
}

export class FontSubsettingUnsupportedError extends Error {
  readonly code = "fonts/subsetting-unsupported" as const

  constructor() {
    super(
      "Font subsetting is unsupported until an adapter can provide a documented source-to-subset glyph mapping"
    )
    this.name = "FontSubsettingUnsupportedError"
  }
}
