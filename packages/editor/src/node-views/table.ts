import type { Node as PMNode } from "prosemirror-model"
import { TableView } from "prosemirror-tables"
import type { EditorView } from "prosemirror-view"

import { applyAuthoredTableGeometry } from "../schema/table-geometry"

/**
 * Table node view that keeps Word-authored grid geometry after
 * prosemirror-tables installs its colgroup.
 *
 * Fill columns use `table-layout: fixed` leftover space, so Hug columns
 * have to be measured from live cell content. The table node does not
 * update when someone types in a cell, so we remasure from tbody mutations.
 */
export class ApexTableView extends TableView {
  private readonly hugObserver: MutationObserver
  private hugFrame = 0

  constructor(node: PMNode, defaultCellMinWidth: number, _view?: EditorView) {
    super(node, defaultCellMinWidth)
    this.syncAuthoredGeometry()
    this.hugObserver = new MutationObserver(() => this.scheduleHugMeasure())
    this.hugObserver.observe(this.contentDOM, {
      subtree: true,
      childList: true,
      characterData: true,
    })
  }

  override update(node: PMNode): boolean {
    if (!super.update(node)) return false
    this.syncAuthoredGeometry()
    return true
  }

  destroy(): void {
    this.hugObserver.disconnect()
    if (this.hugFrame) cancelAnimationFrame(this.hugFrame)
  }

  private scheduleHugMeasure(): void {
    if (this.hugFrame) return
    this.hugFrame = requestAnimationFrame(() => {
      this.hugFrame = 0
      this.syncAuthoredGeometry()
    })
  }

  private syncAuthoredGeometry(): void {
    applyAuthoredTableGeometry(this.table, this.colgroup, this.node.attrs)
  }
}
