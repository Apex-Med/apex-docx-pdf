import type { Node as PMNode } from "prosemirror-model"
import { Plugin, PluginKey } from "prosemirror-state"
import { Decoration, DecorationSet } from "prosemirror-view"

import { markerBalanceDiagnostics } from "@apexmed/forms"

import type { TemplateMarkerType } from "../tags/block-placeholder"

export const templateBlocksPluginKey = new PluginKey("apex-template-blocks")

export function createTemplateBlocksPlugin(): Plugin {
  return new Plugin({
    key: templateBlocksPluginKey,
    props: {
      decorations(state) {
        return decorationsForMarkers(state.doc)
      },
    },
  })
}

function decorationsForMarkers(doc: PMNode): DecorationSet {
  const markers: Array<{
    pos: number
    size: number
    type: TemplateMarkerType
    path: string
  }> = []
  doc.descendants((node, pos) => {
    if (node.type.name !== "template_marker") return
    markers.push({
      pos,
      size: node.nodeSize,
      type: node.attrs.marker as TemplateMarkerType,
      path: String(node.attrs.path ?? ""),
    })
  })
  const decorations: Decoration[] = []
  for (const marker of markers) {
    decorations.push(
      Decoration.node(marker.pos, marker.pos + marker.size, {
        class: `apex-template-marker apex-template-marker--${marker.type}`,
      })
    )
  }
  const diagnostics = markerBalanceDiagnostics(
    markers.map((marker) => ({
      type: marker.type,
      path: marker.path.length > 0 ? marker.path : undefined,
    }))
  )
  if (diagnostics.some((item) => item.severity === "error") && markers[0]) {
    const first = markers[0]
    decorations.push(
      Decoration.node(first.pos, first.pos + first.size, {
        class: "apex-template-marker--error",
      })
    )
  }
  return DecorationSet.create(doc, decorations)
}
