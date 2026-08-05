import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import type {
  FontConfiguration,
  FontFaceRegistration,
} from "../packages/core/src"
import {
  OFFLINE_FONT_ALIASES,
  OFFLINE_FONT_CATALOG,
  OFFLINE_FONT_FALLBACK_FAMILY,
} from "../packages/fonts/src"

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url))

/** Loads the same checked-in font catalog used by the browser worker. */
export async function loadOfflineFontConfiguration(): Promise<FontConfiguration> {
  const faces = await Promise.all(
    OFFLINE_FONT_CATALOG.flatMap(({ family, faces }) =>
      faces.map(async (face): Promise<FontFaceRegistration> => ({
        family,
        weight: face.weight,
        style: face.style,
        bytes: new Uint8Array(
          await readFile(
            join(repositoryRoot, "packages", "fonts", "assets", face.asset)
          )
        ),
      }))
    )
  )
  return {
    faces,
    aliases: OFFLINE_FONT_ALIASES,
    fallbackFamily: OFFLINE_FONT_FALLBACK_FAMILY,
  }
}
