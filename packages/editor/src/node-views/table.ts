import type { Node as PMNode } from "prosemirror-model"
import { TableView } from "prosemirror-tables"
import type { EditorView } from "prosemirror-view"

import { applyAuthoredTableGeometry } from "../schema/table-geometry"

/**
 * Table node view that keeps Word-authored grid geometry after
 * prosemirror-tables installs its colgroup.
 */
export class ApexTableView extends TableView {
  constructor(node: PMNode, defaultCellMinWidth: number, _view?: EditorView) {
    super(node, defaultCellMinWidth)
    this.syncAuthoredGeometry(node)
  }

  override update(node: PMNode): boolean {
    if (!super.update(node)) return false
    this.syncAuthoredGeometry(node)
    return true
  }

  private syncAuthoredGeometry(node: PMNode): void {
    applyAuthoredTableGeometry(this.table, this.colgroup, node.attrs)
  }
}
