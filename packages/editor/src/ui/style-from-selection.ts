import { twips, type StyleDefinition } from "@apexmed/core"

import type { EditorSelectionSnapshot } from "../plugins/selection-state"

export function styleIdFromName(name: string): string {
  const slug = name
    .trim()
    .replace(/[^a-zA-Z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
  return slug ? `Apex-${slug}` : `Apex-Style-${Date.now().toString(36)}`
}

/** Capture the typography the user can see on the current selection. */
export function styleFromSelection(
  id: string,
  name: string,
  snapshot: EditorSelectionSnapshot
): StyleDefinition {
  const paragraph = snapshot.paragraph
  const text = snapshot.textStyle
  return {
    id,
    name,
    type: "paragraph",
    basedOn: null,
    next: id,
    paragraph: paragraph
      ? {
          alignment: paragraph.alignment,
          spacingBefore: twips(paragraph.spacingBefore),
          spacingAfter: twips(paragraph.spacingAfter),
          lineSpacing: paragraph.lineSpacing as never,
          indentStart: twips(paragraph.indentStart),
          indentEnd: twips(paragraph.indentEnd),
          firstLineIndent: twips(paragraph.firstLineIndent),
          numbering: paragraph.numbering,
          tabStops: paragraph.tabStops.map((stop) => ({
            position: twips(stop.position),
            alignment: stop.alignment,
          })),
        }
      : null,
    text: {
      fontFamily: text.fontFamily,
      fontSize: twips(text.fontSize),
      // Runtime OpenType variation values may sit between static CSS weights.
      fontWeight: text.fontWeight as never,
      fontStyle: text.fontStyle,
      underline: text.underline,
      strikethrough: text.strikethrough,
      color: text.color,
      highlightColor: text.highlightColor,
      verticalAlignment: text.verticalAlignment,
    },
  }
}
