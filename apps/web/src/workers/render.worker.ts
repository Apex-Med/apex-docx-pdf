import { installRendererWorker } from "@apex-docx-pdf/browser/worker"
import notoSansBoldUrl from "notosans-fontface/fonts/NotoSans-Bold.ttf?url"
import notoSansBoldItalicUrl from "notosans-fontface/fonts/NotoSans-BoldItalic.ttf?url"
import notoSansItalicUrl from "notosans-fontface/fonts/NotoSans-Italic.ttf?url"
import notoSansRegularUrl from "notosans-fontface/fonts/NotoSans-Regular.ttf?url"

const fontFaces = Promise.all([
  loadFont(notoSansRegularUrl),
  loadFont(notoSansBoldUrl),
  loadFont(notoSansItalicUrl),
  loadFont(notoSansBoldItalicUrl),
]).then(([regular, bold, italic, boldItalic]) => ({
  fonts: {
    faces: [
      {
        family: "Noto Sans",
        weight: 400 as const,
        style: "normal" as const,
        bytes: regular,
      },
      {
        family: "Noto Sans",
        weight: 700 as const,
        style: "normal" as const,
        bytes: bold,
      },
      {
        family: "Noto Sans",
        weight: 400 as const,
        style: "italic" as const,
        bytes: italic,
      },
      {
        family: "Noto Sans",
        weight: 700 as const,
        style: "italic" as const,
        bytes: boldItalic,
      },
    ],
    aliases: [
      { from: "Calibri", to: "Noto Sans" },
      { from: "Arial", to: "Noto Sans" },
      { from: "Times New Roman", to: "Noto Sans" },
    ],
    fallbackFamily: "Noto Sans",
  },
}))

installRendererWorker(undefined, fontFaces)

async function loadFont(url: string): Promise<Uint8Array> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(
      `Unable to load the bundled Noto Sans font (${response.status})`
    )
  }
  return new Uint8Array(await response.arrayBuffer())
}
