import { describe, expect, test } from "bun:test"
import type { SemanticImageAsset } from "@apex-docx-pdf/core"
import { encode } from "fast-png"
import { unzlibSync, zlibSync } from "fflate"

import { ImagePreparationError, prepareImageAssets } from "../src"

const source = { part: "word/media/image.png", xmlPath: "/fixture" }

function asset(
  id: string,
  mimeType: "image/png" | "image/jpeg",
  bytes: Uint8Array,
  pixelWidth: number,
  pixelHeight: number
): SemanticImageAsset {
  return {
    type: "imageAsset",
    id,
    source,
    packagePath: source.part,
    mimeType,
    bytes: Array.from(bytes),
    pixelWidth,
    pixelHeight,
  }
}

function segment(marker: number, data: readonly number[]): number[] {
  const length = data.length + 2
  return [0xff, marker, length >>> 8, length & 0xff, ...data]
}

function pngChunk(
  type: string,
  data: readonly number[] | Uint8Array
): Uint8Array {
  const typeBytes = new TextEncoder().encode(type)
  const body = Uint8Array.from([...typeBytes, ...data])
  let crc = 0xffffffff
  for (const byte of body) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1)
      crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
  }
  crc = (crc ^ 0xffffffff) >>> 0
  const length = data.length
  return Uint8Array.from([
    length >>> 24,
    (length >>> 16) & 0xff,
    (length >>> 8) & 0xff,
    length & 0xff,
    ...body,
    crc >>> 24,
    (crc >>> 16) & 0xff,
    (crc >>> 8) & 0xff,
    crc & 0xff,
  ])
}

function insertBeforeIdat(png: Uint8Array, chunk: Uint8Array): Uint8Array {
  const marker = new TextEncoder().encode("IDAT")
  let offset = 8
  while (offset + 8 <= png.length) {
    if (marker.every((byte, index) => png[offset + 4 + index] === byte)) break
    const length =
      ((png[offset] ?? 0) * 0x1000000 +
        ((png[offset + 1] ?? 0) << 16) +
        ((png[offset + 2] ?? 0) << 8) +
        (png[offset + 3] ?? 0)) >>>
      0
    offset += 12 + length
  }
  return Uint8Array.from([
    ...png.slice(0, offset),
    ...chunk,
    ...png.slice(offset),
  ])
}

function pngFromChunks(
  width: number,
  height: number,
  depth: number,
  colorType: number,
  chunks: readonly Uint8Array[],
  interlace = 0
): Uint8Array {
  const header = pngChunk("IHDR", [
    width >>> 24,
    (width >>> 16) & 0xff,
    (width >>> 8) & 0xff,
    width & 0xff,
    height >>> 24,
    (height >>> 16) & 0xff,
    (height >>> 8) & 0xff,
    height & 0xff,
    depth,
    colorType,
    0,
    0,
    interlace,
  ])
  return Uint8Array.from([
    137,
    80,
    78,
    71,
    13,
    10,
    26,
    10,
    ...header,
    ...chunks.flatMap((chunk) => [...chunk]),
    ...pngChunk("IEND", []),
  ])
}

function jpeg(
  components: 1 | 3 = 3,
  extra: readonly number[] = [],
  entropy: readonly number[] = [1, 2, 3],
  frameMarker: 0xc0 | 0xc2 = 0xc0,
  spectral: readonly [number, number, number] = [0, 63, 0]
): Uint8Array {
  const componentTable =
    components === 1 ? [1, 0x11, 0] : [1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0]
  const scanTable = components === 1 ? [1, 1, 0] : [3, 1, 0, 2, 0, 3, 0]
  return Uint8Array.from([
    0xff,
    0xd8,
    ...segment(0xe0, [0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...extra,
    ...segment(frameMarker, [8, 0, 1, 0, 2, components, ...componentTable]),
    ...segment(0xda, [...scanTable, ...spectral]),
    ...entropy,
    0xff,
    0xd9,
  ])
}

function appendBeforeJpegEnd(
  jpegBytes: Uint8Array,
  bytes: readonly number[]
): Uint8Array {
  return Uint8Array.from([...jpegBytes.slice(0, -2), ...bytes, 0xff, 0xd9])
}

describe("static image preparation", () => {
  test("normalizes RGBA PNG into deterministic RGB and soft-mask planes", () => {
    const png = encode({
      width: 2,
      height: 1,
      channels: 4,
      depth: 8,
      data: Uint8Array.of(255, 0, 0, 128, 0, 255, 0, 255),
    })
    const first = prepareImageAssets([asset("alpha", "image/png", png, 2, 1)])
    const second = prepareImageAssets([asset("alpha", "image/png", png, 2, 1)])
    const image = first.get("alpha")

    expect(image?.colorSpace).toBe("DeviceRGB")
    expect(image?.filter).toBe("FlateDecode")
    expect(image?.hash).toBe(
      new Bun.CryptoHasher("sha256").update(png).digest("hex")
    )
    expect(unzlibSync(Uint8Array.from(image?.bytes ?? []))).toEqual(
      Uint8Array.of(255, 0, 0, 0, 255, 0)
    )
    expect(unzlibSync(Uint8Array.from(image?.alphaBytes ?? []))).toEqual(
      Uint8Array.of(128, 255)
    )
    expect(image).toEqual(second.get("alpha"))
  })

  test("deduplicates exact source bytes and keeps caller mutation out", () => {
    const png = encode({
      width: 1,
      height: 1,
      channels: 1,
      depth: 8,
      data: Uint8Array.of(42),
    })
    const mutable = Array.from(png)
    const first = asset("a", "image/png", png, 1, 1)
    const registry = prepareImageAssets([
      { ...first, bytes: mutable },
      asset("b", "image/png", png, 1, 1),
    ])
    mutable[0] = 0

    expect(registry.get("a")).toBe(registry.get("b"))
    expect(unzlibSync(Uint8Array.from(registry.get("a")?.bytes ?? []))).toEqual(
      Uint8Array.of(42)
    )
    expect(registry.assets).toHaveLength(2)
  })

  test("validates each asset declaration before exact-byte dedup reuse", () => {
    const png = encode({
      width: 1,
      height: 1,
      channels: 1,
      depth: 8,
      data: Uint8Array.of(42),
    })
    expect(() =>
      prepareImageAssets([
        asset("valid", "image/png", png, 1, 1),
        asset("wrong-mime", "image/jpeg", png, 1, 1),
      ])
    ).toThrow("missing JPEG SOI")
    expect(() =>
      prepareImageAssets([
        asset("valid", "image/png", png, 1, 1),
        asset("wrong-size", "image/png", png, 2, 1),
      ])
    ).toThrow("PNG dimensions do not match the asset")
  })

  test("preserves exact JPEG DCT bytes including PDF delimiter text", () => {
    const bytes = jpeg(
      3,
      [],
      [...new TextEncoder().encode("endobj\nstream\n%%EOF")]
    )
    const image = prepareImageAssets([
      asset("jpeg", "image/jpeg", bytes, 2, 1),
    ]).get("jpeg")
    expect(image?.filter).toBe("DCTDecode")
    expect(image?.colorSpace).toBe("DeviceRGB")
    expect(image?.bytes).toEqual(Array.from(bytes))
  })

  test("supports grayscale JPEG and rejects ambiguous three-component color", () => {
    expect(
      prepareImageAssets([asset("gray", "image/jpeg", jpeg(1), 2, 1)]).get(
        "gray"
      )?.colorSpace
    ).toBe("DeviceGray")
    const noJfif = jpeg(3).slice(20)
    const malformed = Uint8Array.from([0xff, 0xd8, ...noJfif.slice(2)])
    expect(() =>
      prepareImageAssets([asset("ambiguous", "image/jpeg", malformed, 2, 1)])
    ).toThrow()
  })

  test("validates JPEG SOF/SOS ordering, selectors, spectral fields, and multiscan state", () => {
    const scan = segment(0xda, [3, 1, 0, 2, 0, 3, 0, 0, 63, 0])
    const premature = Uint8Array.from([0xff, 0xd8, ...scan, 1, 0xff, 0xd9])
    expect(() =>
      prepareImageAssets([asset("premature", "image/jpeg", premature, 2, 1)])
    ).toThrow("SOS must follow")

    const badSelector = jpeg(3)
    const scanOffset = badSelector.findIndex(
      (value, index) => value === 0xff && badSelector[index + 1] === 0xda
    )
    badSelector[scanOffset + 5] = 99
    expect(() =>
      prepareImageAssets([asset("selector", "image/jpeg", badSelector, 2, 1)])
    ).toThrow("component selector")

    expect(() =>
      prepareImageAssets([
        asset(
          "baseline-spectral",
          "image/jpeg",
          jpeg(3, [], [1], 0xc0, [0, 0, 0]),
          2,
          1
        ),
      ])
    ).toThrow("baseline JPEG spectral")
    expect(() =>
      prepareImageAssets([
        asset(
          "progressive-ac-components",
          "image/jpeg",
          jpeg(3, [], [1], 0xc2, [1, 63, 0]),
          2,
          1
        ),
      ])
    ).toThrow("progressive JPEG spectral")

    const progressive = jpeg(3, [], [1], 0xc2, [0, 0, 0])
    expect(
      prepareImageAssets([
        asset("progressive", "image/jpeg", progressive, 2, 1),
      ]).get("progressive")?.filter
    ).toBe("DCTDecode")
    const progressiveScan = segment(0xda, [3, 1, 0, 2, 0, 3, 0, 0, 0, 0])
    const overlapping = appendBeforeJpegEnd(progressive, [
      ...progressiveScan,
      1,
    ])
    expect(() =>
      prepareImageAssets([asset("overlap", "image/jpeg", overlapping, 2, 1)])
    ).toThrow("refinement or overlap")
  })

  test("rejects CRC damage, declared-dimension mismatches, and resource limits", () => {
    const png = encode({
      width: 1,
      height: 1,
      channels: 3,
      depth: 8,
      data: Uint8Array.of(1, 2, 3),
    })
    const damaged = png.slice()
    damaged[29] = (damaged[29] ?? 0) ^ 1
    for (const [candidate, width, limits] of [
      [damaged, 1, undefined],
      [png, 2, undefined],
      [png, 1, { maxBytes: 8 }],
    ] as const) {
      expect(() =>
        prepareImageAssets(
          [asset("bad", "image/png", candidate, width, 1)],
          limits ? { limits } : {}
        )
      ).toThrow(ImagePreparationError)
    }
  })

  test("rejects APNG, unknown critical chunks, and compressed metadata before decode", () => {
    const png = encode({
      width: 1,
      height: 1,
      channels: 3,
      depth: 8,
      data: Uint8Array.of(1, 2, 3),
    })
    const cases = [
      ["acTL", [0, 0, 0, 1, 0, 0, 0, 0], "images/png-apng"],
      ["ABCD", [], "images/png-critical"],
      ["zTXt", [0, 0], "images/png-metadata"],
    ] as const
    for (const [type, data, code] of cases) {
      try {
        prepareImageAssets([
          asset(
            type,
            "image/png",
            insertBeforeIdat(png, pngChunk(type, data)),
            1,
            1
          ),
        ])
        throw new Error("expected preparation to fail")
      } catch (error) {
        expect(error).toBeInstanceOf(ImagePreparationError)
        expect((error as ImagePreparationError).code).toBe(code)
      }
    }
  })

  test("bounds inflation at the exact IHDR scanline ceiling before normalization", () => {
    const bomb = pngFromChunks(1, 1, 8, 0, [
      pngChunk("IDAT", zlibSync(new Uint8Array(1_000_000))),
    ])
    expect(() =>
      prepareImageAssets([asset("bomb", "image/png", bomb, 1, 1)])
    ).toThrow("exact IHDR scanline size")

    const rgba = encode({
      width: 2,
      height: 2,
      channels: 4,
      depth: 8,
      data: new Uint8Array(16),
    })
    expect(() =>
      prepareImageAssets([asset("working", "image/png", rgba, 2, 2)], {
        limits: { maxDecodedBytes: 16 },
      })
    ).toThrow("decoded PNG byte limit")
  })

  test("uses IHDR color type rather than optional PLTE presence", () => {
    const rgb = encode({
      width: 1,
      height: 1,
      channels: 3,
      depth: 8,
      data: Uint8Array.of(9, 8, 7),
    })
    const suggested = insertBeforeIdat(rgb, pngChunk("PLTE", [255, 0, 0]))
    const image = prepareImageAssets([
      asset("suggested", "image/png", suggested, 1, 1),
    ]).get("suggested")
    expect(unzlibSync(Uint8Array.from(image?.bytes ?? []))).toEqual(
      Uint8Array.of(9, 8, 7)
    )

    const gray = encode({
      width: 1,
      height: 1,
      channels: 1,
      depth: 8,
      data: Uint8Array.of(9),
    })
    expect(() =>
      prepareImageAssets([
        asset(
          "gray-palette",
          "image/png",
          insertBeforeIdat(gray, pngChunk("PLTE", [1, 2, 3])),
          1,
          1
        ),
      ])
    ).toThrow("PLTE is forbidden")
  })

  test("decodes legal indexed transparency and sub-byte grayscale profiles", () => {
    const indexed = pngFromChunks(2, 1, 1, 3, [
      pngChunk("PLTE", [255, 0, 0, 0, 255, 0]),
      pngChunk("tRNS", [0, 255]),
      pngChunk("IDAT", zlibSync(Uint8Array.of(0, 0x40))),
    ])
    const indexedImage = prepareImageAssets([
      asset("indexed", "image/png", indexed, 2, 1),
    ]).get("indexed")
    expect(unzlibSync(Uint8Array.from(indexedImage?.bytes ?? []))).toEqual(
      Uint8Array.of(255, 0, 0, 0, 255, 0)
    )
    expect(unzlibSync(Uint8Array.from(indexedImage?.alphaBytes ?? []))).toEqual(
      Uint8Array.of(0, 255)
    )

    const grayscale = pngFromChunks(2, 1, 1, 0, [
      pngChunk("IDAT", zlibSync(Uint8Array.of(0, 0x40))),
    ])
    const grayImage = prepareImageAssets([
      asset("one-bit", "image/png", grayscale, 2, 1),
    ]).get("one-bit")
    expect(unzlibSync(Uint8Array.from(grayImage?.bytes ?? []))).toEqual(
      Uint8Array.of(0, 255)
    )
  })

  test("enforces PNG palette, transparency, and consecutive-IDAT state", () => {
    const missingPalette = pngFromChunks(1, 1, 1, 3, [
      pngChunk("IDAT", zlibSync(Uint8Array.of(0, 0))),
    ])
    const grayTransparency = pngFromChunks(1, 1, 8, 0, [
      pngChunk("tRNS", [0]),
      pngChunk("IDAT", zlibSync(Uint8Array.of(0, 0))),
    ])
    const splitIdat = pngFromChunks(1, 1, 8, 0, [
      pngChunk("IDAT", zlibSync(Uint8Array.of(0, 0)).slice(0, 3)),
      pngChunk("tEXt", [107, 0, 118]),
      pngChunk("IDAT", zlibSync(Uint8Array.of(0, 0)).slice(3)),
    ])
    const interlaced = pngFromChunks(
      1,
      1,
      8,
      0,
      [pngChunk("IDAT", zlibSync(Uint8Array.of(0, 0)))],
      1
    )
    for (const [name, bytes, expected] of [
      ["missing-palette", missingPalette, "requires PLTE"],
      ["gray-trns", grayTransparency, "invalid PNG tRNS length"],
      ["split-idat", splitIdat, "must be consecutive"],
      ["interlace", interlaced, "interlaced PNG is unsupported"],
    ] as const)
      expect(() =>
        prepareImageAssets([asset(name, "image/png", bytes, 1, 1)])
      ).toThrow(expected)
  })

  test("rejects JPEG ICC and unsupported Adobe color transforms", () => {
    const icc = segment(0xe2, [
      ...new TextEncoder().encode("ICC_PROFILE"),
      0,
      1,
      1,
    ])
    const adobe = segment(0xee, [
      ...new TextEncoder().encode("Adobe"),
      0,
      100,
      0,
      0,
      0,
      0,
      2,
    ])
    expect(() =>
      prepareImageAssets([asset("icc", "image/jpeg", jpeg(3, icc), 2, 1)])
    ).toThrow("ICC profiles")
    expect(() =>
      prepareImageAssets([
        asset("transform", "image/jpeg", jpeg(3, adobe), 2, 1),
      ])
    ).toThrow("color transform")
  })

  test("rejects nontrivial EXIF orientation before JPEG embedding", () => {
    const tiff = [
      0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, 6, 0,
      0, 0, 0, 0, 0, 0,
    ]
    const exif = segment(0xe1, [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff])
    expect(() =>
      prepareImageAssets([asset("rotated", "image/jpeg", jpeg(3, exif), 2, 1)])
    ).toThrow("EXIF orientation 6")
  })

  test("honours cancellation", () => {
    const controller = new AbortController()
    controller.abort()
    const png = encode({
      width: 1,
      height: 1,
      channels: 1,
      depth: 8,
      data: Uint8Array.of(1),
    })
    expect(() =>
      prepareImageAssets([asset("cancel", "image/png", png, 1, 1)], {
        signal: controller.signal,
      })
    ).toThrow()
  })
})
