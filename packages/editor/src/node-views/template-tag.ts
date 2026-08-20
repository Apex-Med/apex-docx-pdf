import type { Node as PMNode } from "prosemirror-model"
import type { NodeView } from "prosemirror-view"

import {
  definitionFromNodeAttrs,
  isPrintedAtTag,
  resolveTemplateTagValue,
  subscribeNowClock,
  templateTagBadgeText,
  templateTagExportText,
  useTemplateTagStore,
} from "../tags"

export function createTemplateTagNodeView(node: PMNode): NodeView {
  let currentNode = node
  // Outer wrapper stays contenteditable so Chrome can park the caret
  // immediately before/after the chip on the same line.
  const dom = document.createElement("span")
  dom.setAttribute("data-template-tag", String(node.attrs.slug ?? ""))
  dom.setAttribute("data-tag-id", String(node.attrs.tagId ?? ""))
  const chip = document.createElement("span")
  chip.className = "apex-template-tag__chip"
  chip.contentEditable = "false"
  chip.spellcheck = false
  dom.append(chip)

  const paint = (current: PMNode): void => {
    const tag = definitionFromNodeAttrs(current.attrs)
    const value = resolveTemplateTagValue(
      tag,
      useTemplateTagStore.getState().values
    )
    const filled = value !== undefined
    const keep = ["apex-template-tag--in-selection", "is-selected"].filter(
      (name) => dom.classList.contains(name)
    )
    dom.className = filled
      ? "apex-template-tag apex-template-tag--filled"
      : "apex-template-tag apex-template-tag--empty"
    for (const name of keep) dom.classList.add(name)
    if (isPrintedAtTag(tag)) {
      dom.setAttribute("data-tag-live", "printed_at")
    } else {
      dom.removeAttribute("data-tag-live")
    }
    chip.textContent = templateTagBadgeText(tag, value)
    chip.title = `{{${tag.slug}:${tag.kind}}}`
    applyTagStyle(dom, current)
  }

  paint(currentNode)
  const unsubscribeStore = useTemplateTagStore.subscribe(() => {
    paint(currentNode)
  })
  const unsubscribeClock = isPrintedAtTag(definitionFromNodeAttrs(node.attrs))
    ? subscribeNowClock(() => paint(currentNode))
    : null

  return {
    dom,
    update(updated: PMNode) {
      if (updated.type.name !== "template_tag") return false
      currentNode = updated
      paint(updated)
      return true
    },
    selectNode() {
      dom.classList.add("is-selected")
    },
    deselectNode() {
      dom.classList.remove("is-selected")
    },
    ignoreMutation: () => true,
    stopEvent: (event) => event.type === "dragstart",
    destroy() {
      unsubscribeStore()
      unsubscribeClock?.()
    },
  }
}

function applyTagStyle(dom: HTMLElement, node: PMNode): void {
  const decorations: string[] = []
  if (node.attrs.underline) decorations.push("underline")
  if (node.attrs.strikethrough) decorations.push("line-through")
  dom.style.fontFamily = String(node.attrs.fontFamily ?? "Inter")
  dom.style.fontSize = `${Number(node.attrs.fontSize ?? 220) / 20}pt`
  dom.style.fontWeight = String(node.attrs.fontWeight ?? 400)
  dom.style.fontStyle = String(node.attrs.fontStyle ?? "normal")
  dom.style.color = String(node.attrs.color ?? "#000000")
  dom.style.textDecoration = decorations.join(" ")
  dom.style.backgroundColor =
    typeof node.attrs.highlightColor === "string" && node.attrs.highlightColor
      ? node.attrs.highlightColor
      : ""
  const vertical = String(node.attrs.verticalAlignment ?? "baseline")
  dom.style.verticalAlign =
    vertical === "superscript"
      ? "super"
      : vertical === "subscript"
        ? "sub"
        : "baseline"
}

export function templateTagLayoutText(node: PMNode): string {
  const tag = definitionFromNodeAttrs(node.attrs)
  const value = resolveTemplateTagValue(
    tag,
    useTemplateTagStore.getState().values
  )
  return templateTagExportText(tag, value)
}
