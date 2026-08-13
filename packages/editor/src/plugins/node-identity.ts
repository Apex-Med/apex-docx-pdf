import type { Node as ProseMirrorNode } from "prosemirror-model"
import { Plugin, type EditorState, type Transaction } from "prosemirror-state"

function supportsNodeIdentity(node: ProseMirrorNode): boolean {
  return Object.hasOwn(node.type.spec.attrs ?? {}, "nodeId")
}

/**
 * Assign stable, unique identities to nodes created by editing operations.
 * ProseMirror split/join commands may create blocks with a null nodeId; layout
 * and pagination require every source block to remain independently addressable.
 */
export function createNodeIdentityPlugin(): Plugin {
  let sequence = 0

  const normalize = (state: EditorState): Transaction | null => {
    const reserved = new Set<string>()
    state.doc.descendants((node) => {
      if (!supportsNodeIdentity(node)) return true
      const current =
        typeof node.attrs.nodeId === "string" ? node.attrs.nodeId.trim() : ""
      if (current) reserved.add(current)
      return true
    })
    const seen = new Set<string>()
    const transaction = state.tr
    let changed = false

    state.doc.descendants((node, position) => {
      if (!supportsNodeIdentity(node)) return true
      const current =
        typeof node.attrs.nodeId === "string" ? node.attrs.nodeId.trim() : ""
      if (current && !seen.has(current)) {
        seen.add(current)
        return true
      }

      let next: string
      do {
        sequence += 1
        next = `editor:${node.type.name}:${sequence}`
      } while (reserved.has(next) || seen.has(next))
      seen.add(next)
      transaction.setNodeMarkup(position, undefined, {
        ...node.attrs,
        nodeId: next,
      })
      changed = true
      return true
    })

    return changed ? transaction : null
  }

  return new Plugin({
    appendTransaction(_transactions, _oldState, newState) {
      return normalize(newState)
    },
    view(view) {
      let destroyed = false
      queueMicrotask(() => {
        if (destroyed) return
        const transaction = normalize(view.state)
        if (transaction) view.dispatch(transaction)
      })
      return {
        destroy() {
          destroyed = true
        },
      }
    },
  })
}
