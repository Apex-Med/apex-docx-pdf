export type SupportStatus =
  "supported" | "limited" | "unsupported" | "planned" | "testkit"

export type SupportRow = Readonly<{
  area: string
  status: SupportStatus
  behavior: string
}>

export { ENGINE_VERSION } from "@apexmed/engine"

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
      "Validates ZIP structure, paths, limits, XML, relationship roots, external relationships, and the root office-document relationship; unconditionally rejects VBA/macros, OLE/embedded objects, ActiveX, attached packages/executables, custom UI, web extensions, and alternative-format chunks.",
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
    area: "Explicit left tab stops",
    status: "limited",
    behavior:
      "Word tabs require explicit resolved paragraph stops with positive integer-twip positions, left/start alignment, and no leader. Duplicate, clear, non-left, leader, missing-next-stop, and default-tab behavior are rejected rather than approximated.",
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
      "The library accepts explicit TrueType bytes for LTR Latin shaping and deterministically rewrites the used glyphs into mapped fontkit subsets. The playground self-hosts five application-owned, hash-pinned OFL TrueType families, maps familiar system names deterministically, and never executes uploaded embedded fonts. Output is searchable upright Type0/CIDFontType2 text.",
  },
  {
    area: "Template values and formatters",
    status: "limited",
    behavior:
      'Typed dotted paths plus upper, lower, currency:"ISO", and bounded date/time patterns. Date defaults to dd-MM-yyyy; explicit time tokens include 24-hour or 12-hour time using explicit locale and time-zone context.',
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
    status: "limited",
    behavior:
      "Stable semantic and display IDs, source-ordered collections, deterministic resource ordering, searchable page text, byte-repeatable PDFs, and optional source-linked traces. The checked-in golden matches in separate Bun processes, Node 24, and a real Chromium module worker.",
  },
  {
    area: "Binary-safe testkit",
    status: "testkit",
    behavior:
      "Validates classic xref offsets, direct stream lengths, page image resources, upright text transforms, and per-page searchable text for workspace PDFs. Not a general PDF parser.",
  },
  {
    area: "Dynamic image tags",
    status: "limited",
    behavior:
      "Canonical {{@image path}} values accept explicit PNG/JPEG bytes, pixel dimensions, physical twip bounds, optional aspect preservation, and semantic alt text. URLs and non-canonical image tags are rejected; PDFs remain untagged.",
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
      "Default or non-left tab behavior, tab leaders, complex scripts/bidi, CFF PDF embedding, variable-axis instantiation, and interrupting synchronous subsetting mid-encode are unavailable.",
  },
  {
    area: "Opt-in Convex persistence",
    status: "limited",
    behavior:
      "The configured playground mounts tested anonymous-session storage, upload-intent registration/cleanup, metadata, cache, realtime, and deletion adapters behind an explicit disabled-by-default control. This is demo isolation, not production authentication.",
  },
  {
    area: "Hosted deployment",
    status: "planned",
    behavior:
      "No production Vercel deployment, production Convex authorization, canonical hosted playground, or operational readiness claim has been verified.",
  },
] as const
