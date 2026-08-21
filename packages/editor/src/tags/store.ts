import { create } from "zustand"

import type {
  TemplateTagDefinition,
  TemplateTagValue,
  TemplateTagValues,
} from "./types"

export type TemplateTagStoreState = Readonly<{
  tags: readonly TemplateTagDefinition[]
  values: TemplateTagValues
  draggingTagId: string | null
}>

type TemplateTagStoreActions = Readonly<{
  reset: (
    tags: readonly TemplateTagDefinition[],
    values: TemplateTagValues
  ) => void
  upsertTag: (tag: TemplateTagDefinition) => void
  removeTag: (id: string) => void
  setValue: (id: string, value: TemplateTagValue | null) => void
  setDraggingTagId: (id: string | null) => void
}>

export type TemplateTagStore = TemplateTagStoreState & TemplateTagStoreActions

export const useTemplateTagStore = create<TemplateTagStore>((set, get) => ({
  tags: [],
  values: {},
  draggingTagId: null,
  reset: (tags, values) => set({ tags, values, draggingTagId: null }),
  setDraggingTagId: (draggingTagId) => set({ draggingTagId }),
  upsertTag: (tag) =>
    set({
      tags: [...get().tags.filter((entry) => entry.id !== tag.id), tag],
    }),
  removeTag: (id) => {
    const values = { ...get().values }
    delete values[id]
    set({
      tags: get().tags.filter((entry) => entry.id !== id),
      values,
    })
  },
  setValue: (id, value) => {
    const values = { ...get().values }
    if (value === null) delete values[id]
    else values[id] = value
    set({ values })
  },
}))
