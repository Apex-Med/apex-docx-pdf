import { nodeId, twips } from "@apex-docx-pdf/core"
import type {
  OperationResult,
  SemanticDocument,
  SemanticParagraph,
  SemanticText,
} from "@apex-docx-pdf/core"

import type { ParsedDocxDocument } from "./types"

/** Converts the supported parsed OOXML surface into core's vocabulary. */
export function normaliseDocx(
  document: ParsedDocxDocument
): OperationResult<SemanticDocument> {
  const blocks: SemanticParagraph[] = document.paragraphs.map(
    (paragraph, paragraphIndex) => {
      const children: SemanticText[] = []
      let textIndex = 0
      for (const run of paragraph.runs) {
        for (const text of run.texts) {
          children.push({
            type: "text",
            id: nodeId(`docx:text:${paragraphIndex + 1}:${textIndex + 1}`),
            source: text.source,
            text: text.text,
            preserveSpace: text.preserveSpace,
            style: {
              fontFamily: run.properties.fontFamily,
              fontSize: twips(run.properties.fontSizeHalfPoints * 10),
              fontWeight: run.properties.fontWeight,
              fontStyle: run.properties.fontStyle,
              underline: run.properties.underline,
              color: run.properties.color.startsWith("#")
                ? run.properties.color
                : `#${run.properties.color}`,
            },
          })
          textIndex += 1
        }
      }
      return {
        type: "paragraph",
        id: nodeId(`docx:paragraph:${paragraphIndex + 1}`),
        source: paragraph.source,
        properties: {
          alignment: paragraph.properties.alignment,
          spacingBefore: twips(paragraph.properties.spacingBefore),
          spacingAfter: twips(paragraph.properties.spacingAfter),
          lineSpacing:
            paragraph.properties.lineSpacing === null
              ? null
              : paragraph.properties.lineSpacing.rule === "auto"
                ? {
                    rule: "auto",
                    value240ths: paragraph.properties.lineSpacing.value240ths,
                  }
                : {
                    rule: paragraph.properties.lineSpacing.rule,
                    value: twips(paragraph.properties.lineSpacing.valueTwips),
                  },
          indentStart: twips(paragraph.properties.indentStart),
          indentEnd: twips(paragraph.properties.indentEnd),
          firstLineIndent: twips(paragraph.properties.firstLineIndent),
          keepWithNext: paragraph.properties.keepWithNext,
          keepLinesTogether: paragraph.properties.keepLinesTogether,
          widowControl: paragraph.properties.widowControl,
          pageBreakBefore: paragraph.properties.pageBreakBefore,
          numbering: paragraph.properties.numbering,
        },
        children,
      }
    }
  )
  return {
    ok: true,
    value: {
      type: "document",
      id: nodeId("docx:document:1"),
      source: document.source,
      numberingDefinitions: document.numberingDefinitions.map((definition) => ({
        id: definition.id,
        levels: definition.levels.map((level) => ({
          ...level,
          indentStart: twips(level.indentStart),
          firstLineIndent: twips(level.firstLineIndent),
        })),
      })),
      sections: [
        {
          type: "section",
          id: nodeId("docx:section:1"),
          source: document.source,
          properties: {
            pageWidth: twips(document.sectionProperties.pageWidth),
            pageHeight: twips(document.sectionProperties.pageHeight),
            margins: {
              top: twips(document.sectionProperties.marginTop),
              right: twips(document.sectionProperties.marginRight),
              bottom: twips(document.sectionProperties.marginBottom),
              left: twips(document.sectionProperties.marginLeft),
            },
          },
          blocks,
        },
      ],
    },
    diagnostics: [],
  }
}
