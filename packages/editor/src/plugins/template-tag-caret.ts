import type { Node as PMNode } from "prosemirror-model"
import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
  type Transaction,
} from "prosemirror-state"
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view"

import { TEMPLATE_TAG_CARET_ZWSP } from "../tags"

export const templateTagCaretPluginKey = new PluginKey<DecorationSet>(
  "apexTemplateTagCaret"
)

export const TEMPLATE_TAG_IN_SELECTION_CLASS = "apex-template-tag--in-selection"

export type TemplateTagClickSide = "before" | "after"

/** Which side of a tag chip a click should place the caret on. */
export function templateTagClickSide(
  clickX: number,
  rect: Readonly<{ left: number; width: number }>
): TemplateTagClickSide {
  return clickX >= rect.left + rect.width / 2 ? "after" : "before"
}

function tagFromEvent(event: MouseEvent): HTMLElement | null {
  const target = event.target
  if (!(target instanceof Element)) return null
  return target.closest("[data-template-tag], .apex-template-tag")
}

function placeCaretBesideTag(
  view: EditorView,
  nodePos: number,
  nodeSize: number,
  side: TemplateTagClickSide
): boolean {
  const pos = side === "after" ? nodePos + nodeSize : nodePos
  const $pos = view.state.doc.resolve(
    Math.max(0, Math.min(pos, view.state.doc.content.size))
  )
  if (!$pos.parent.inlineContent && $pos.parent.type.name !== "paragraph") {
    const near = TextSelection.near($pos, side === "after" ? 1 : -1)
    view.dispatch(view.state.tr.setSelection(near).scrollIntoView())
    return true
  }
  view.dispatch(
    view.state.tr
      .setSelection(TextSelection.near($pos, side === "after" ? 1 : -1))
      .scrollIntoView()
  )
  return true
}

export function isTemplateTagCaretAnchor(
  node: PMNode | null | undefined
): boolean {
  return Boolean(node?.isText && node.text === TEMPLATE_TAG_CARET_ZWSP)
}

/**
 * Keep a zero-width text node on each side of a tag when there is no other
 * text there. Chrome cannot place a caret against a contenteditable=false
 * inline atom; the ZWSP is the inline seat for the caret.
 */
export function ensureTemplateTagCaretAnchors(
  state: EditorState
): Transaction | null {
  const inserts: number[] = []
  const deletes: Array<readonly [number, number]> = []
  state.doc.descendants((node, pos) => {
    if (node.type.name !== "paragraph") return true
    node.forEach((child, offset, index) => {
      const childPos = pos + 1 + offset
      if (isTemplateTagCaretAnchor(child)) {
        const prev = index > 0 ? node.child(index - 1) : null
        const next = index < node.childCount - 1 ? node.child(index + 1) : null
        if (
          prev?.type.name !== "template_tag" &&
          next?.type.name !== "template_tag"
        ) {
          deletes.push([childPos, childPos + child.nodeSize])
        }
        return
      }
      if (child.type.name !== "template_tag") return
      const prev = index > 0 ? node.child(index - 1) : null
      const next = index < node.childCount - 1 ? node.child(index + 1) : null
      if (!prev?.isText) inserts.push(childPos)
      if (!next?.isText) inserts.push(childPos + child.nodeSize)
    })
    return false
  })
  if (inserts.length === 0 && deletes.length === 0) return null
  let tr = state.tr
  for (const [from, to] of deletes.sort((left, right) => right[0] - left[0])) {
    tr = tr.delete(from, to)
  }
  const zwsp = state.schema.text(TEMPLATE_TAG_CARET_ZWSP)
  for (const pos of inserts.sort((left, right) => right - left)) {
    const mapped = tr.mapping.map(pos)
    tr = tr.insert(mapped, zwsp)
  }
  return tr.setMeta("addToHistory", false)
}

/** Positions of template tags that fall inside a non-empty selection. */
export function templateTagPositionsInSelection(
  state: EditorState
): readonly number[] {
  const { from, to } = state.selection
  if (from === to) return []
  const positions: number[] = []
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name === "template_tag") positions.push(pos)
  })
  return positions
}

export function tagSelectionDecorations(state: EditorState): DecorationSet {
  const decorations = templateTagPositionsInSelection(state).map((pos) => {
    const node = state.doc.nodeAt(pos)
    const size = node?.nodeSize ?? 1
    return Decoration.node(pos, pos + size, {
      class: TEMPLATE_TAG_IN_SELECTION_CLASS,
    })
  })
  return DecorationSet.create(state.doc, decorations)
}

/**
 * Clicks on a tag chip place a text caret before/after it so the chip stays
 * in the line instead of becoming a node selection that swallows the caret.
 */
export function createTemplateTagCaretPlugin(): Plugin {
  return new Plugin({
    key: templateTagCaretPluginKey,
    state: {
      init: (_config, state) => tagSelectionDecorations(state),
      apply(tr, value, _oldState, newState) {
        if (tr.docChanged || tr.selectionSet) {
          return tagSelectionDecorations(newState)
        }
        return value.map(tr.mapping, tr.doc)
      },
    },
    appendTransaction(_transactions, _oldState, newState) {
      return ensureTemplateTagCaretAnchors(newState)
    },
    props: {
      decorations(state) {
        return templateTagCaretPluginKey.getState(state)
      },
      handleClickOn(view, _pos, node, nodePos, event, direct) {
        if (!direct || node.type.name !== "template_tag") return false
        const chip = tagFromEvent(event)
        const rect = (chip ?? view.nodeDOM(nodePos)) as HTMLElement | null
        if (!rect || typeof rect.getBoundingClientRect !== "function") {
          return false
        }
        const side = templateTagClickSide(
          event.clientX,
          rect.getBoundingClientRect()
        )
        return placeCaretBesideTag(view, nodePos, node.nodeSize, side)
      },
      handleClick(view, _pos, event) {
        const chip = tagFromEvent(event)
        if (!chip) return false
        const pos = view.posAtDOM(chip, 0)
        const $pos = view.state.doc.resolve(pos)
        const node =
          $pos.nodeAfter?.type.name === "template_tag"
            ? $pos.nodeAfter
            : $pos.nodeBefore?.type.name === "template_tag"
              ? $pos.nodeBefore
              : null
        const nodePos =
          $pos.nodeAfter?.type.name === "template_tag"
            ? $pos.pos
            : $pos.nodeBefore?.type.name === "template_tag"
              ? $pos.pos - $pos.nodeBefore.nodeSize
              : -1
        if (!node || nodePos < 0) return false
        const side = templateTagClickSide(
          event.clientX,
          chip.getBoundingClientRect()
        )
        return placeCaretBesideTag(view, nodePos, node.nodeSize, side)
      },
    },
  })
}
