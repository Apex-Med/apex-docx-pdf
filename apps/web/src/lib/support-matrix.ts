export type SupportStatus =
  "supported" | "limited" | "unsupported" | "planned" | "testkit"

export type SupportRow = Readonly<{
  area: string
  status: SupportStatus
  behavior: string
}>

export const ENGINE_VERSION = "0.0.0-phase.7" as const

export const supportStatusLabel: Record<SupportStatus, string> = {
  supported: "Supported",
  limited: "Supported with limits",
  unsupported: "Unsupported",
  planned: "Planned",
  testkit: "Supported for workspace PDFs",
}

export const supportMatrix: readonly SupportRow[] = [
  {
    area: "DOCX package validation",
    status: "supported",
    behavior:
      "Validates ZIP structure, paths, limits, XML, relationship roots, external relationships, and the root office-document relationship.",
  },
  {
    area: "Main-document paragraphs",
    status: "supported",
    behavior:
      "Preserves supported paragraphs and runs in source order across one or more sections. Missing page geometry falls back to A4-profile defaults.",
  },
  {
    area: "Styles and paragraph formatting",
    status: "limited",
    behavior:
      "Resolves docDefaults, default paragraph/character styles, basedOn, direct formatting, indents, alignment, spacing, keep controls, widow/orphan control, and page-break-before.",
  },
  {
    area: "DOCX numbering and list layout",
    status: "limited",
    behavior:
      "Relationship-owned definitions and overrides, supported formats and restarts, searchable source-linked labels, indentation and wrapping, and deterministic counters.",
  },
  {
    area: "Registered fonts and embedded text",
    status: "limited",
    behavior:
      "Explicit TrueType bytes and LTR Latin shaping; searchable upright Type0/CIDFontType2 output. The default path embeds complete fonts rather than true subsets.",
  },
  {
    area: "Template values and formatters",
    status: "limited",
    behavior:
      'Typed dotted paths plus upper, lower, currency:"ISO", and date:"d MMMM yyyy" using explicit locale and time-zone context.',
  },
  {
    area: "Conditions and loops",
    status: "limited",
    behavior:
      "Nested whole-paragraph and whole-table-row if / optional else / each blocks, with item-relative object fields and cumulative limits.",
  },
  {
    area: "Fixed-grid tables",
    status: "limited",
    behavior:
      "Positive integer-twip tblGrid, explicit tblW/tcW, supported margins, borders, shading, heights, alignment, spans, merges, repeated headers, and deterministic fragmentation.",
  },
  {
    area: "Static inline images",
    status: "limited",
    behavior:
      "Internal relationship-owned PNG/JPEG parts with explicit positive DrawingML extents. Supported in ordinary paragraphs, bounded table cells, headers, and footers.",
  },
  {
    area: "Image resource limits",
    status: "supported",
    behavior:
      "Defaults cover distinct parts, total bytes, pixels per side, pixels per image, chunks/markers, and decoded working bytes.",
  },
  {
    area: "PNG profile",
    status: "limited",
    behavior:
      "Non-interlaced legal grayscale/RGB/indexed/gray-alpha/RGBA depths, validated CRC/order/palette/transparency/scanlines/filters, normalized to 8-bit gray/RGB plus optional alpha.",
  },
  {
    area: "JPEG profile",
    status: "limited",
    behavior:
      "Well-formed 8-bit baseline or bounded progressive grayscale/three-component JPEG with validated scans, orientation 1, and unambiguous JFIF/Adobe transform.",
  },
  {
    area: "PDF image output",
    status: "supported",
    behavior:
      "Deterministic content deduplication, per-page XObject resources, DCTDecode JPEG, FlateDecode PNG planes, optional grayscale alpha SMask, and source-linked placements.",
  },
  {
    area: "Multiple sections",
    status: "limited",
    behavior:
      "Paragraph and final body section properties create ordered nextPage sections. Positive portrait/landscape geometry maps to per-page PDF MediaBox values.",
  },
  {
    area: "Default headers and footers",
    status: "limited",
    behavior:
      "Internal default references inherit across sections until replaced. Exact edge-relative distances default to 720 twips and must fit inside body margins.",
  },
  {
    area: "Header/footer templates",
    status: "limited",
    behavior:
      "Reusable definitions support paragraph values, safe formatters, bounded whole-paragraph blocks, static images, and page fields. Automatic paragraph numbering is unsupported.",
  },
  {
    area: "PAGE and NUMPAGES",
    status: "limited",
    behavior:
      "Simple or complete complex fields with decimal/no-op switches only. Layout reserves digit width, paginates globally, then materializes current and total values.",
  },
  {
    area: "Determinism and source links",
    status: "supported",
    behavior:
      "Stable semantic and display IDs, source-ordered collections, deterministic resource ordering, searchable page text, byte-repeatable PDFs, and optional source-linked traces.",
  },
  {
    area: "Binary-safe testkit",
    status: "testkit",
    behavior:
      "Validates classic xref offsets, direct stream lengths, page image resources, upright text transforms, and per-page searchable text for workspace PDFs. Not a general PDF parser.",
  },
  {
    area: "Dynamic image tags",
    status: "unsupported",
    behavior:
      "{{@image …}}, {{image …}}, and :image values are rejected. Static DOCX images are preserved content, not data-created resources.",
  },
  {
    area: "Floating, cropped, or transformed images",
    status: "unsupported",
    behavior:
      "Anchors, floating placement, crop, rotation, and other DrawingML transformations are outside the profile.",
  },
  {
    area: "SVG and broad image conversion",
    status: "unsupported",
    behavior:
      "SVG, CMYK/YCCK, ICC conversion, arbitrary PNG/JPEG profiles, and general color management are not implemented.",
  },
  {
    area: "Other section and header variants",
    status: "unsupported",
    behavior:
      "Continuous, odd-page, and even-page breaks; first/even headers and footers; automatic header/footer numbering; and arbitrary Word fields are unavailable.",
  },
  {
    area: "Other table features",
    status: "unsupported",
    behavior:
      "Percentage widths, nested tables, styles/themes/conditional regions, complex shading, and complete Word autofit are unavailable.",
  },
  {
    area: "Other text and font features",
    status: "unsupported",
    behavior:
      "General tab stops, complex scripts/bidi, CFF PDF embedding, and true default font subsetting are unavailable.",
  },
  {
    area: "Dormant Convex groundwork",
    status: "limited",
    behavior:
      "Tested anonymous-session storage, metadata, cache, realtime, and deletion adapters exist for future product work, but the current playground does not mount them and remains local-only.",
  },
  {
    area: "Hosted deployment",
    status: "planned",
    behavior:
      "No production Vercel deployment, production Convex authorization, canonical hosted playground, or operational readiness claim has been verified.",
  },
] as const
