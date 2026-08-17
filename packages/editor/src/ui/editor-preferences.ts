import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import { readDarkPagesPreference } from "./chrome-types"
import type { PageSetupUnit } from "./PageSetupDialog"

export const EDITOR_PREFERENCES_STORAGE_KEY = "apex-editor-preferences"

export type EditorPreferenceValues = Readonly<{
  zoom: number
  rulerVisible: boolean
  darkPages: boolean
  pageUnit: PageSetupUnit
  tagsSidebarOpen: boolean
}>

type EditorPreferenceActions = Readonly<{
  setZoom: (zoom: number) => void
  setRulerVisible: (visible: boolean) => void
  toggleRulerVisible: () => void
  setDarkPages: (enabled: boolean) => void
  toggleDarkPages: () => void
  setPageUnit: (unit: PageSetupUnit) => void
  setTagsSidebarOpen: (open: boolean) => void
  toggleTagsSidebarOpen: () => void
}>

export type EditorPreferencesState = EditorPreferenceValues &
  EditorPreferenceActions

type MutableEditorPreferenceValues = {
  -readonly [Key in keyof EditorPreferenceValues]: EditorPreferenceValues[Key]
}

function isPageSetupUnit(value: unknown): value is PageSetupUnit {
  return value === "in" || value === "cm" || value === "pt"
}

export function normalizeEditorPreferences(
  value: unknown
): Partial<EditorPreferenceValues> {
  if (!value || typeof value !== "object") return {}
  const candidate = value as Record<string, unknown>
  const normalized: Partial<MutableEditorPreferenceValues> = {}

  if (
    typeof candidate.zoom === "number" &&
    Number.isFinite(candidate.zoom) &&
    candidate.zoom >= 25 &&
    candidate.zoom <= 500
  ) {
    normalized.zoom = candidate.zoom
  }
  if (typeof candidate.rulerVisible === "boolean") {
    normalized.rulerVisible = candidate.rulerVisible
  }
  if (typeof candidate.darkPages === "boolean") {
    normalized.darkPages = candidate.darkPages
  }
  if (isPageSetupUnit(candidate.pageUnit)) {
    normalized.pageUnit = candidate.pageUnit
  }
  if (typeof candidate.tagsSidebarOpen === "boolean") {
    normalized.tagsSidebarOpen = candidate.tagsSidebarOpen
  }

  return normalized
}

export const useEditorPreferences = create<EditorPreferencesState>()(
  persist(
    (set) => ({
      zoom: 100,
      rulerVisible: true,
      // Preserve the original standalone preference on first migration.
      darkPages: readDarkPagesPreference(),
      pageUnit: "in",
      tagsSidebarOpen: true,
      setZoom: (zoom) => set({ zoom }),
      setRulerVisible: (rulerVisible) => set({ rulerVisible }),
      toggleRulerVisible: () =>
        set((state) => ({ rulerVisible: !state.rulerVisible })),
      setDarkPages: (darkPages) => set({ darkPages }),
      toggleDarkPages: () => set((state) => ({ darkPages: !state.darkPages })),
      setPageUnit: (pageUnit) => set({ pageUnit }),
      setTagsSidebarOpen: (tagsSidebarOpen) => set({ tagsSidebarOpen }),
      toggleTagsSidebarOpen: () =>
        set((state) => ({ tagsSidebarOpen: !state.tagsSidebarOpen })),
    }),
    {
      name: EDITOR_PREFERENCES_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: ({
        zoom,
        rulerVisible,
        darkPages,
        pageUnit,
        tagsSidebarOpen,
      }) => ({
        zoom,
        rulerVisible,
        darkPages,
        pageUnit,
        tagsSidebarOpen,
      }),
      merge: (persisted, current) => ({
        ...current,
        ...normalizeEditorPreferences(persisted),
      }),
    }
  )
)
