import { describe, expect, test, beforeEach, mock } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { GOOGLE_FONT_CATALOG_FALLBACK } from "../src/fonts/google-catalog-fallback"
import {
  availableFontWeights,
  fontWeightLabel,
  loadGoogleFontCatalog,
  nearestAvailableFontWeight,
  resetGoogleFontCatalogCacheForTests,
  searchGoogleFonts,
  familyHasWeightAxis,
  weightAxisRange,
} from "../src/fonts/google-catalog"
import {
  ensureFontLoaded,
  injectGoogleFontFamilyStylesheet,
  resetFontLoaderCachesForTests,
  snapToFontWeight,
  familyToSlug,
} from "../src/fonts/font-loader"

describe("google font catalog fallback", () => {
  beforeEach(() => {
    resetGoogleFontCatalogCacheForTests()
  })

  test("fallback catalog is nonempty and includes Inter with wght axis", () => {
    expect(GOOGLE_FONT_CATALOG_FALLBACK.length).toBeGreaterThanOrEqual(40)
    const inter = GOOGLE_FONT_CATALOG_FALLBACK.find(
      (entry) => entry.family === "Inter"
    )
    expect(inter).toBeDefined()
    expect(familyHasWeightAxis(inter!)).toBe(true)
    const axis = weightAxisRange(inter!)
    expect(axis?.min).toBe(100)
    expect(axis?.max).toBe(900)
  })

  test("fallback catalog includes every required editor family and its published weights", () => {
    const expected = {
      Inter: [100, 200, 300, 400, 500, 600, 700, 800, 900],
      "Instrument Sans": [400, 500, 600, 700],
      "Instrument Serif": [400],
      Geist: [100, 200, 300, 400, 500, 600, 700, 800, 900],
      "Geist Mono": [100, 200, 300, 400, 500, 600, 700, 800, 900],
      "Bricolage Grotesque": [200, 300, 400, 500, 600, 700, 800],
    } as const

    for (const [name, weights] of Object.entries(expected)) {
      const entry = GOOGLE_FONT_CATALOG_FALLBACK.find(
        (family) => family.family === name
      )
      expect(entry).toBeDefined()
      expect(availableFontWeights(entry!)).toEqual(weights)
    }
  })

  test("searchGoogleFonts filters by query", async () => {
    const catalog = await loadGoogleFontCatalog()
    const results = searchGoogleFonts(catalog, "mono")
    expect(results.some((entry) => entry.family === "JetBrains Mono")).toBe(
      true
    )
    expect(
      results.every((entry) => entry.family.toLowerCase().includes("mono"))
    ).toBe(true)
  })

  test("loadGoogleFontCatalog uses mocked metadata without network", async () => {
    const mockFetch = mock(
      async () =>
        new Response(
          JSON.stringify({
            familyMetadataList: [
              {
                family: "Mock Sans",
                category: "Sans Serif",
                axes: [
                  {
                    tag: "wght",
                    min: 200,
                    max: 800,
                    default: 400,
                  },
                ],
              },
            ],
          }),
          { status: 200 }
        )
    )
    const original = globalThis.fetch
    globalThis.fetch = mockFetch as unknown as typeof fetch
    try {
      const catalog = await loadGoogleFontCatalog()
      expect(catalog.source).toBe("network")
      expect(catalog.families.some((f) => f.family === "Mock Sans")).toBe(true)
      expect(mockFetch).toHaveBeenCalled()
    } finally {
      globalThis.fetch = original
      resetGoogleFontCatalogCacheForTests()
    }
  })

  test("strips XSSI prefix from metadata responses", async () => {
    const body = `)]}'\n{"familyMetadataList":[{"family":"Xssi Sans","category":"Sans Serif","axes":[{"tag":"wght","min":100,"max":900,"default":400}]}]}`
    const mockFetch = mock(async () => new Response(body, { status: 200 }))
    const original = globalThis.fetch
    globalThis.fetch = mockFetch as unknown as typeof fetch
    try {
      const catalog = await loadGoogleFontCatalog()
      expect(catalog.families.some((f) => f.family === "Xssi Sans")).toBe(true)
    } finally {
      globalThis.fetch = original
      resetGoogleFontCatalogCacheForTests()
    }
  })
})

describe("font loader helpers", () => {
  test("familyToSlug normalizes names", () => {
    expect(familyToSlug("Open Sans")).toBe("open-sans")
    expect(familyToSlug("Source Sans 3")).toBe("source-sans-3")
  })

  test("snapToFontWeight picks nearest CSS weight", () => {
    expect(snapToFontWeight(430)).toBe(400)
    expect(snapToFontWeight(610)).toBe(600)
  })

  test("family-aware snapping never produces an unavailable weight", () => {
    const instrumentSans = GOOGLE_FONT_CATALOG_FALLBACK.find(
      (entry) => entry.family === "Instrument Sans"
    )
    const instrumentSerif = GOOGLE_FONT_CATALOG_FALLBACK.find(
      (entry) => entry.family === "Instrument Serif"
    )
    expect(nearestAvailableFontWeight(instrumentSans!, 250)).toBe(400)
    expect(nearestAvailableFontWeight(instrumentSans!, 560)).toBe(600)
    expect(nearestAvailableFontWeight(instrumentSerif!, 900)).toBe(400)
    expect(fontWeightLabel(600)).toBe("Semibold")
  })
})

describe("ensureFontLoaded DOM injection", () => {
  beforeEach(() => {
    resetFontLoaderCachesForTests()
    resetGoogleFontCatalogCacheForTests()
  })

  test("injectGoogleFontFamilyStylesheet adds a link element", () => {
    const inter = GOOGLE_FONT_CATALOG_FALLBACK.find(
      (entry) => entry.family === "Inter"
    )
    expect(inter).toBeDefined()
    const doc = {
      head: {
        appendChild: (node: { id?: string; href?: string; rel?: string }) => {
          appended = node
        },
      },
      getElementById: (id: string) =>
        appended?.id === id ? (appended as unknown as HTMLElement) : null,
      createElement: (tag: string) => {
        if (tag !== "link") throw new Error("expected link")
        return {
          id: "",
          rel: "",
          href: "",
          setAttribute: () => undefined,
        } as unknown as HTMLLinkElement
      },
    }
    let appended: { id?: string; href?: string; rel?: string } | null = null
    const originalDocument = globalThis.document
    globalThis.document = doc as unknown as Document
    try {
      injectGoogleFontFamilyStylesheet(inter!)
      const link = appended as { href?: string; rel?: string } | null
      expect(link?.rel).toBe("stylesheet")
      expect(link?.href).toContain("fonts.googleapis.com/css2")
      expect(link?.href).toContain("wght")
    } finally {
      globalThis.document = originalDocument
    }
  })

  test("ensureFontLoaded uses builtin Inter without Google font fetches", async () => {
    const assetsDir = join(import.meta.dir, "../assets/fonts")
    const originalFetch = globalThis.fetch
    const mockFetch = mock(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (
        url.includes("fontsource") ||
        url.includes("fonts.googleapis.com") ||
        url.includes("fonts.google.com")
      ) {
        throw new Error(`unexpected Google font fetch: ${url}`)
      }
      if (url.includes("/fonts/")) {
        const name = url.split("/fonts/")[1]
        if (!name) throw new Error(`invalid font url ${url}`)
        return new Response(readFileSync(join(assetsDir, name)))
      }
      return originalFetch(input)
    })
    globalThis.fetch = mockFetch as unknown as typeof fetch
    try {
      const result = await ensureFontLoaded("Inter", {
        weight: 400,
        catalog: {
          version: 1,
          families: GOOGLE_FONT_CATALOG_FALLBACK,
          source: "fallback",
        },
      })
      expect(result.family).toBe("Inter")
      expect(result.bytes.length).toBeGreaterThan(0)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
