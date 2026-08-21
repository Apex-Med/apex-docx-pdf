import {
  Fragment,
  Slice,
  type Node as PMNode,
  type Schema,
} from "prosemirror-model"
import { Plugin } from "prosemirror-state"
import { dropPoint } from "prosemirror-transform"
import type { EditorView } from "prosemirror-view"

import { insertTemplateTag } from "../commands"
import {
  TEMPLATE_TAG_MIME,
  useTemplateTagStore,
  type TemplateTagDefinition,
} from "../tags"

export const TAG_DROP_CURSOR_CLASS = "apex-template-tag-drop-cursor"

const overlays = new WeakMap<EditorView, HTMLElement>()

/** Valid inline insert position for a tag dropped at `hitPos`, or null. */
export function resolveTagDropPosition(
  doc: PMNode,
  hitPos: number,
  schema: Schema
): number | null {
  const type = schema.nodes.template_tag
  if (!type) return null
  const clamped = Math.max(0, Math.min(hitPos, doc.content.size))
  const slice = new Slice(Fragment.from(type.create()), 0, 0)
  const point = dropPoint(doc, clamped, slice)
  if (point != null) {
    const $point = doc.resolve(point)
    if ($point.parent.inlineContent) return point
  }
  const $hit = doc.resolve(clamped)
  if ($hit.parent.inlineContent) return $hit.pos
  for (let depth = $hit.depth; depth > 0; depth -= 1) {
    const node = $hit.node(depth)
    if (node.inlineContent) return $hit.start(depth)
    if (node.type.name === "paragraph") {
      return $hit.start(depth) + Math.min($hit.parentOffset, node.content.size)
    }
  }
  let found: number | null = null
  doc.nodesBetween(
    Math.max(0, clamped - 1),
    Math.min(doc.content.size, clamped + 1),
    (node, pos) => {
      if (found !== null) return false
      if (node.type.name === "paragraph") {
        found = pos + 1
        return false
      }
      return true
    }
  )
  return found
}

export function resolveTagDropPositionFromEvent(
  view: EditorView,
  event: MouseEvent
): number | null {
  const hit = view.posAtCoords({ left: event.clientX, top: event.clientY })
  if (!hit) return null
  return resolveTagDropPosition(view.state.doc, hit.pos, view.state.schema)
}

export function createTemplateTagDropPlugin(): Plugin {
  return new Plugin({
    view(view) {
      return {
        destroy() {
          hideTagDropCaret(view)
        },
      }
    },
    props: {
      handleDOMEvents: {
        dragover(view, event) {
          if (!isActiveTagDrag(event)) return false
          event.preventDefault()
          if (event.dataTransfer) event.dataTransfer.dropEffect = "copy"
          setTagDraggingAttr(view, true)
          showTagDropCaret(view, resolveTagDropPositionFromEvent(view, event))
          return true
        },
        dragleave(view, event) {
          if (!isActiveTagDrag(event)) return false
          const related = event.relatedTarget
          if (related instanceof Node && view.dom.contains(related))
            return false
          hideTagDropCaret(view)
          setTagDraggingAttr(view, false)
          return false
        },
        drop(view, event) {
          if (!isActiveTagDrag(event)) return false
          const tag = tagFromDragEvent(event)
          const pos = resolveTagDropPositionFromEvent(view, event)
          hideTagDropCaret(view)
          setTagDraggingAttr(view, false)
          useTemplateTagStore.getState().setDraggingTagId(null)
          if (!tag) return false
          event.preventDefault()
          if (pos == null) return true
          insertTemplateTag(tag, pos)(view.state, view.dispatch.bind(view))
          view.focus()
          return true
        },
      },
    },
  })
}

function isActiveTagDrag(event: DragEvent): boolean {
  if (useTemplateTagStore.getState().draggingTagId) return true
  const types = event.dataTransfer ? Array.from(event.dataTransfer.types) : []
  return types.includes(TEMPLATE_TAG_MIME)
}

function tagFromDragEvent(event: DragEvent): TemplateTagDefinition | undefined {
  const store = useTemplateTagStore.getState()
  const raw =
    event.dataTransfer?.getData(TEMPLATE_TAG_MIME) ||
    store.draggingTagId ||
    parsePlainTagId(event.dataTransfer?.getData("text/plain") ?? "")
  if (!raw) return undefined
  return store.tags.find((entry) => entry.id === raw)
}

export function parsePlainTagId(value: string): string | null {
  const prefixed = /^apex-tag:(.+)$/u.exec(value)
  if (prefixed?.[1]) return prefixed[1]
  return null
}

function setTagDraggingAttr(view: EditorView, on: boolean): void {
  const root = view.dom.closest(".apex-editor-root")
  if (!(root instanceof HTMLElement)) return
  if (on) root.setAttribute("data-apex-tag-dragging", "true")
  else root.removeAttribute("data-apex-tag-dragging")
}

function showTagDropCaret(view: EditorView, pos: number | null): void {
  if (pos == null) {
    hideTagDropCaret(view)
    return
  }
  let coords: { left: number; top: number; bottom: number }
  try {
    coords = view.coordsAtPos(pos)
  } catch {
    hideTagDropCaret(view)
    return
  }
  const owner = view.dom.ownerDocument
  let element = overlays.get(view)
  if (!element) {
    element = owner.createElement("div")
    element.className = TAG_DROP_CURSOR_CLASS
    element.setAttribute("aria-hidden", "true")
    owner.body.append(element)
    overlays.set(view, element)
  }
  element.style.left = `${coords.left}px`
  element.style.top = `${coords.top}px`
  element.style.height = `${Math.max(1, coords.bottom - coords.top)}px`
}

function hideTagDropCaret(view: EditorView): void {
  const element = overlays.get(view)
  if (!element) return
  element.remove()
  overlays.delete(view)
}
