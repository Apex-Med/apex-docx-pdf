import { createHash } from "node:crypto"
import { resolve } from "node:path"
import { describe, expect, test } from "bun:test"
import {
  twips,
  type FontFaceRegistration,
  type FontWeight,
} from "@apexmed/core"

import {
  createFontRegistry,
  OFFLINE_FONT_ALIASES,
  OFFLINE_FONT_CATALOG,
  OFFLINE_FONT_FALLBACK_FAMILY,
  OFFLINE_FONT_FAMILIES,
} from "../src"

describe("offline font catalog", () => {
  test("pins six families and every published weight to intact TrueType assets", async () => {
    expect(OFFLINE_FONT_FAMILIES).toEqual([
      "Inter",
      "Instrument Sans",
      "Instrument Serif",
      "Geist",
      "Geist Mono",
      "Bricolage Grotesque",
    ])

    const expectedNormalWeights: Readonly<Record<string, FontWeight[]>> = {
      Inter: [100, 200, 300, 400, 500, 600, 700, 800, 900],
      "Instrument Sans": [400, 500, 600, 700],
      "Instrument Serif": [400],
      Geist: [100, 200, 300, 400, 500, 600, 700, 800, 900],
      "Geist Mono": [100, 200, 300, 400, 500, 600, 700, 800, 900],
      "Bricolage Grotesque": [200, 300, 400, 500, 600, 700, 800],
    }

    for (const family of OFFLINE_FONT_CATALOG) {
      expect(family.license).toBe("OFL-1.1")
      expect(family.revision.length).toBeGreaterThan(3)
      for (const face of family.faces) {
        const bytes = await assetBytes(face.asset)
        expect(bytes.slice(0, 4)).toEqual(Uint8Array.of(0, 1, 0, 0))
        expect(createHash("sha256").update(bytes).digest("hex")).toBe(
          face.sha256
        )
      }
      expect(
        family.faces
          .filter((face) => face.style === "normal")
          .map((face) => face.weight)
      ).toEqual(expectedNormalWeights[family.family]!)
    }
  })

  test("registers, matches, and shapes every real catalog family", async () => {
    const faces: FontFaceRegistration[] = []
    for (const family of OFFLINE_FONT_CATALOG) {
      for (const face of family.faces) {
        faces.push({
          family: family.family,
          weight: face.weight,
          style: face.style,
          bytes: await assetBytes(face.asset),
        })
      }
    }
    const registry = await createFontRegistry({
      faces,
      aliases: OFFLINE_FONT_ALIASES,
      fallbackFamily: OFFLINE_FONT_FALLBACK_FAMILY,
    })

    for (const family of OFFLINE_FONT_CATALOG) {
      const match = registry.matchFace({
        family: family.family,
        weight: 400,
        style: "normal",
      })
      expect(match.kind).toBe("exact")
      expect(match.resolvedFamily).toBe(family.family)
      const face = registry.face(match.faceId)
      expect(face.kind).toBe("truetype")
      const shaped = registry.shape({
        face,
        text: "Apex 0123",
        fontSize: twips(240),
        direction: "ltr",
      })
      expect(shaped.advanceX).toBeGreaterThan(0)
    }

    expect(
      registry.matchFace({
        family: "InstrumentSans",
        weight: 400,
        style: "normal",
      })
    ).toMatchObject({ kind: "alias", resolvedFamily: "Instrument Sans" })
    expect(
      registry.matchFace({
        family: "Times New Roman",
        weight: 400,
        style: "normal",
      })
    ).toMatchObject({ kind: "alias", resolvedFamily: "Instrument Serif" })
    expect(
      registry.matchFace({
        family: "Inter SemiBold",
        weight: 400,
        style: "normal",
      })
    ).toMatchObject({ kind: "alias", resolvedFamily: "Inter" })
    const interMedium = registry.matchFace({
      family: "Inter Medium",
      weight: 400,
      style: "normal",
    })
    const interSemiBold = registry.matchFace({
      family: "Inter SemiBold",
      weight: 400,
      style: "normal",
    })
    expect(registry.face(interMedium.faceId)).toMatchObject({
      weight: 500,
      postscriptName: "Inter-Medium",
    })
    expect(registry.face(interSemiBold.faceId)).toMatchObject({
      weight: 600,
      postscriptName: "Inter-SemiBold",
    })
    expect(interMedium.faceId).not.toBe(interSemiBold.faceId)
    expect(
      registry.matchFace({
        family: "Bricolage Grotesque SemiBold",
        weight: 400,
        style: "normal",
      })
    ).toMatchObject({ kind: "alias", resolvedFamily: "Bricolage Grotesque" })
    const bricolageSemiBold = registry.matchFace({
      family: "Bricolage Grotesque SemiBold",
      weight: 400,
      style: "normal",
    })
    expect(registry.face(bricolageSemiBold.faceId)).toMatchObject({
      weight: 600,
      postscriptName: "BricolageGrotesque-14ptSemiBold",
    })
    const bricolageMedium = registry.matchFace({
      family: "Bricolage Grotesque Medium",
      weight: 700,
      style: "normal",
    })
    expect(registry.face(bricolageMedium.faceId)).toMatchObject({
      weight: 500,
      postscriptName: "BricolageGrotesque-14ptMedium",
    })
  })
})

async function assetBytes(asset: string): Promise<Uint8Array> {
  const path = resolve(import.meta.dir, "../assets", asset)
  return new Uint8Array(await Bun.file(path).arrayBuffer())
}
