import type { Node as PMNode } from "prosemirror-model"
import type { EditorView, NodeView } from "prosemirror-view"

const TWIPS_PER_PX = 15

/**
 * Image node view with drag handles for width/height (preserving aspect when locked).
 */
export function createImageNodeView(
  node: PMNode,
  view: EditorView,
  getPos: () => number | undefined
): NodeView {
  const dom = document.createElement("span")
  dom.className = "apex-image-node"
  dom.setAttribute("data-apex-image", "true")

  const img = document.createElement("img")
  img.src = String(node.attrs.src ?? "")
  img.alt = String(node.attrs.altText ?? "")
  img.draggable = false
  applySize(img, node)

  const handleSe = document.createElement("span")
  handleSe.className = "apex-image-node__handle apex-image-node__handle--se"
  handleSe.contentEditable = "false"
  const handleE = document.createElement("span")
  handleE.className = "apex-image-node__handle apex-image-node__handle--e"
  handleE.contentEditable = "false"

  dom.append(img, handleSe, handleE)

  let selected = false

  const setSelected = (value: boolean): void => {
    selected = value
    dom.classList.toggle("is-selected", value)
    handleSe.style.display = value ? "block" : "none"
    handleE.style.display = value ? "block" : "none"
  }
  setSelected(false)

  const startResize = (event: PointerEvent, mode: "se" | "e"): void => {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startWidthTwips = Number(node.attrs.width) || 1440
    const startHeightTwips = Number(node.attrs.height) || 1440
    const ratio =
      Number(node.attrs.intrinsicRatio) ||
      (startHeightTwips > 0 ? startWidthTwips / startHeightTwips : 1)
    const preserve = node.attrs.preserve !== false

    const onMove = (moveEvent: PointerEvent): void => {
      const deltaPx = moveEvent.clientX - startX
      const deltaTwips = Math.round(deltaPx * TWIPS_PER_PX)
      const nextWidth = Math.max(240, startWidthTwips + deltaTwips)
      let nextHeight = startHeightTwips
      if (mode === "se" || preserve) {
        nextHeight = Math.max(240, Math.round(nextWidth / (ratio || 1)))
      }
      const pos = getPos()
      if (pos === undefined) return
      const tr = view.state.tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        width: nextWidth,
        height: nextHeight,
      })
      view.dispatch(tr)
    }

    const onUp = (): void => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }

  handleSe.addEventListener("pointerdown", (event) => startResize(event, "se"))
  handleE.addEventListener("pointerdown", (event) => startResize(event, "e"))

  img.addEventListener("dblclick", (event) => {
    event.preventDefault()
    event.stopPropagation()
    const next = window.prompt(
      "Image alt text",
      String(node.attrs.altText ?? "")
    )
    if (next === null) return
    const pos = getPos()
    if (pos === undefined) return
    view.dispatch(
      view.state.tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        altText: next,
      })
    )
  })

  return {
    dom,
    update(updated) {
      if (updated.type !== node.type) return false
      node = updated
      img.src = String(updated.attrs.src ?? "")
      img.alt = String(updated.attrs.altText ?? "")
      applySize(img, updated)
      return true
    },
    selectNode() {
      setSelected(true)
    },
    deselectNode() {
      setSelected(false)
    },
    stopEvent(event) {
      return (
        event.target === handleSe ||
        event.target === handleE ||
        (event.type.startsWith("pointer") && selected)
      )
    },
    ignoreMutation: () => true,
  }
}

function applySize(img: HTMLImageElement, node: PMNode): void {
  const widthPt = Number(node.attrs.width) / 20
  const heightPt = Number(node.attrs.height) / 20
  img.style.width = `${widthPt}pt`
  img.style.height = `${heightPt}pt`
}
