import type { SemanticDocument } from "@apexmed/core"
import { dropCursor } from "prosemirror-dropcursor"
import { gapCursor } from "prosemirror-gapcursor"
import { history } from "prosemirror-history"
import type { Command, EditorState, Plugin } from "prosemirror-state"
import { columnResizing, tableEditing } from "prosemirror-tables"

import { createLinkKeymap, editorKeymap } from "../commands"
import { toSemanticDocument } from "../model/bridge"
import { ApexTableView } from "../node-views/table"
import {
  createLayoutClient,
  type LayoutClient,
} from "../pagination/layout-client"
import { createPaginationPlugin } from "../pagination/plugin"
import { createSelectionStatePlugin } from "./selection-state"
import { createTableCaretPlugin } from "./table-caret"
import { createTableContextMenuPlugin } from "./table-context-menu"
import { createImagePasteDropPlugin } from "./image-paste-drop"
import { createNodeIdentityPlugin } from "./node-identity"
import { createTemplateTagCaretPlugin } from "./template-tag-caret"
import { createTemplateTagDropPlugin } from "./template-tag-drop"
import { createTemplateBlocksPlugin } from "./template-blocks"

export type CreateEditorPluginsOptions = Readonly<{
  enablePagination?: boolean
  forceInProcessLayout?: boolean
  layoutClient?: LayoutClient
  toSemantic?: (state: EditorState) => SemanticDocument
  structuralOnly?: boolean
  /** When set, Mod-k opens the link UI via this command. */
  openLinkCommand?: Command
}>

/**
 * Full plugin stack: history, keymap (Enter/Backspace), tables, table caret,
 * gapcursor, dropcursor, and engine-authoritative pagination.
 */
export function createEditorPlugins(
  options: CreateEditorPluginsOptions = {}
): Plugin[] {
  const plugins: Plugin[] = [
    history(),
    ...(options.openLinkCommand
      ? [createLinkKeymap(options.openLinkCommand)]
      : []),
    // Owned keymap includes Enter, Backspace, formatting, tables, base arrows.
    editorKeymap,
    createNodeIdentityPlugin(),
    createSelectionStatePlugin(),
    columnResizing({
      handleWidth: 6,
      cellMinWidth: 48,
      defaultCellMinWidth: 1,
      View: ApexTableView,
    }),
    tableEditing({ allowTableNodeSelection: true }),
    createTableContextMenuPlugin(),
    createTableCaretPlugin(),
    createTemplateTagCaretPlugin(),
    createTemplateBlocksPlugin(),
    createImagePasteDropPlugin(),
    createTemplateTagDropPlugin(),
    gapCursor(),
    dropCursor({ color: "#2563eb", width: 2, class: "apex-pm-dropcursor" }),
  ]

  if (options.enablePagination !== false) {
    const layoutClient =
      options.layoutClient ??
      createLayoutClient({
        forceInProcess: options.forceInProcessLayout === true,
      })
    plugins.push(
      createPaginationPlugin({
        layoutClient,
        forceInProcess: options.forceInProcessLayout === true,
        toSemantic:
          options.toSemantic ?? ((state) => toSemanticDocument(state.doc)),
        structuralOnly: options.structuralOnly === true,
      })
    )
  }

  return plugins
}
