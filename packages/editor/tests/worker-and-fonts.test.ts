import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { createBlankDocument } from "@apexmed/core"

import { BUILTIN_FONT_INDEX, workerFontUrls } from "../src/fonts"
import {
  createLayoutClient,
  getLayoutAsync,
  layoutInProcess,
} from "../src/pagination/layout-client"

describe("layout worker wiring", () => {
  test("layout.worker.ts exists and posts layout protocol messages", () => {
    const path = join(import.meta.dir, "../src/worker/layout.worker.ts")
    expect(existsSync(path)).toBe(true)
    const source = readFileSync(path, "utf8")
    expect(source).toContain("layoutDocument")
    expect(source).toContain("includeTrace")
    expect(source).toContain("handleLayoutRequest")
    expect(source).toContain("onmessage")
  })

  test("createLayoutClient reports offMainThread when Worker is unavailable (in-process fallback)", () => {
    const client = createLayoutClient({ forceInProcess: true })
    expect(client.offMainThread).toBe(false)
    expect(typeof client.cancel).toBe("function")
    client.dispose()
  })

  test("Editor wires layout client rather than only inline layoutDocument", () => {
    const path = join(import.meta.dir, "../src/ui/Editor.tsx")
    const source = readFileSync(path, "utf8")
    expect(source).toContain("createEditorPlugins")
    // Pagination + worker client are assembled in createEditorPlugins
    const pluginsPath = join(
      import.meta.dir,
      "../src/plugins/create-plugins.ts"
    )
    const pluginsSource = readFileSync(pluginsPath, "utf8")
    expect(pluginsSource).toContain("createLayoutClient")
    expect(pluginsSource).toContain("createPaginationPlugin")
  })

  test("falls back when a layout worker never responds", async () => {
    const silentWorker = {
      onmessage: null,
      onerror: null,
      postMessage: () => undefined,
      terminate: () => undefined,
    } as unknown as Worker
    const client = createLayoutClient({
      createWorker: () => silentWorker,
      workerTimeoutMs: 5,
    })
    const layout = getLayoutAsync(client)
    expect(layout).not.toBeNull()

    const result = await layout!(createBlankDocument(), {
      includeTrace: true,
    })
    expect(result?.type).toBe("success")
    expect(result?.displayList.pages).toHaveLength(1)
    expect(client.offMainThread).toBe(false)
    client.dispose()
  })

  test("in-process pagination shapes with document-embedded fonts", async () => {
    const blank = createBlankDocument()
    const paragraph = blank.sections[0]?.blocks[0]
    expect(paragraph?.type).toBe("paragraph")
    if (paragraph?.type !== "paragraph") return
    const fontBytes = readFileSync(
      join(import.meta.dir, "../assets/fonts/inter-400.ttf")
    )
    const document = {
      ...blank,
      fontAssets: [
        {
          type: "fontAsset" as const,
          id: "worker-fixture-font",
          source: blank.source,
          packagePath: "word/fonts/worker-fixture.ttf",
          family: "Worker Fixture",
          weight: 400 as const,
          style: "normal" as const,
          bytes: Array.from(fontBytes),
        },
      ],
      sections: [
        {
          ...blank.sections[0]!,
          blocks: [
            {
              ...paragraph,
              children: paragraph.children.map((child) =>
                child.type === "text"
                  ? {
                      ...child,
                      text: "Embedded pagination metrics",
                      style: {
                        ...child.style,
                        fontFamily: "Worker Fixture",
                      },
                    }
                  : child
              ),
            },
          ],
        },
      ],
    }

    const result = await layoutInProcess(document, { includeTrace: true })
    expect(result?.type).toBe("success")
    expect(
      result?.displayList.pages
        .flatMap((page) => page.items)
        .some(
          (item) => item.type === "glyph-run" && item.fontSource === "embedded"
        )
    ).toBe(true)
  })
})

describe("self-hosted fonts", () => {
  const assetsDir = join(import.meta.dir, "../assets/fonts")

  test("ships woff2 and ttf assets for each index face", () => {
    const faces = workerFontUrls(BUILTIN_FONT_INDEX)
    expect(faces.length).toBeGreaterThanOrEqual(2)
    for (const face of faces) {
      const base = face.woff2.replace(/^\/fonts\//, "").replace(/\.woff2$/, "")
      const woff2 = join(assetsDir, `${base}.woff2`)
      const ttf = join(assetsDir, `${base}.ttf`)
      expect(existsSync(woff2)).toBe(true)
      expect(existsSync(ttf)).toBe(true)
      expect(face.woff2Sha256).toBeTruthy()
      expect(face.ttfSha256).toBeTruthy()
      // Hashes must be of file bytes, not path strings.
      const woff2Hash = createHash("sha256")
        .update(readFileSync(woff2))
        .digest("hex")
      const ttfHash = createHash("sha256")
        .update(readFileSync(ttf))
        .digest("hex")
      expect(face.woff2Sha256).toBe(woff2Hash)
      expect(face.ttfSha256).toBe(ttfHash)
      expect(face.woff2Sha256).not.toBe(
        createHash("sha256").update(face.woff2).digest("hex")
      )
    }
  })

  test("apps/web public/fonts serves the same self-hosted files", () => {
    const webFonts = join(import.meta.dir, "../../../apps/web/public/fonts")
    expect(existsSync(join(webFonts, "inter-400.woff2"))).toBe(true)
    expect(existsSync(join(webFonts, "inter-400.ttf"))).toBe(true)
    expect(existsSync(join(webFonts, "inter-700.woff2"))).toBe(true)
    expect(existsSync(join(webFonts, "inter-700.ttf"))).toBe(true)
  })
})
