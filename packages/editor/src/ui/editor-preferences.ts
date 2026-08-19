import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import { readDarkPagesPreference } from "./chrome-types"
import type { PageSetupUnit } from "./PageSetupDialog"

export const EDITOR_PREFERENCES_STORAGE_KEY = "apex-editor-preferences"

export const DEFAULT_TAGS_SIDEBAR_WIDTH = 320
export const MIN_TAGS_SIDEBAR_WIDTH = 240
export const MAX_TAGS_SIDEBAR_WIDTH = 480
export const DEFAULT_TABLE_OPTIONS_WIDTH = 340
export const MIN_TABLE_OPTIONS_WIDTH = 260
export const MAX_TABLE_OPTIONS_WIDTH = 520

export type EditorPreferenceValues = Readonly<{
  zoom: number
  rulerVisible: boolean
  darkPages: boolean
  pageUnit: PageSetupUnit
  tagsSidebarOpen: boolean
  tagsSidebarWidth: number
  tableOptionsWidth: number
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
  setTagsSidebarWidth: (width: number) => void
  setTableOptionsWidth: (width: number) => void
}>

export type EditorPreferencesState = EditorPreferenceValues &
  EditorPreferenceActions

type MutableEditorPreferenceValues = {
  -readonly [Key in keyof EditorPreferenceValues]: EditorPreferenceValues[Key]
}

function isPageSetupUnit(value: unknown): value is PageSetupUnit {
  return value === "in" || value === "cm" || value === "pt"
}

function isBoundedWidth(
  value: unknown,
  minWidth: number,
  maxWidth: number
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minWidth &&
    value <= maxWidth
  )
}

function clampWidth(width: number, minWidth: number, maxWidth: number): number {
  if (!Number.isFinite(width)) return minWidth
  return Math.round(Math.min(maxWidth, Math.max(minWidth, width)))
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
  if (
    isBoundedWidth(
      candidate.tagsSidebarWidth,
      MIN_TAGS_SIDEBAR_WIDTH,
      MAX_TAGS_SIDEBAR_WIDTH
    )
  ) {
    normalized.tagsSidebarWidth = Math.round(candidate.tagsSidebarWidth)
  }
  if (
    isBoundedWidth(
      candidate.tableOptionsWidth,
      MIN_TABLE_OPTIONS_WIDTH,
      MAX_TABLE_OPTIONS_WIDTH
    )
  ) {
    normalized.tableOptionsWidth = Math.round(candidate.tableOptionsWidth)
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
      tagsSidebarWidth: DEFAULT_TAGS_SIDEBAR_WIDTH,
      tableOptionsWidth: DEFAULT_TABLE_OPTIONS_WIDTH,
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
      setTagsSidebarWidth: (tagsSidebarWidth) =>
        set({
          tagsSidebarWidth: clampWidth(
            tagsSidebarWidth,
            MIN_TAGS_SIDEBAR_WIDTH,
            MAX_TAGS_SIDEBAR_WIDTH
          ),
        }),
      setTableOptionsWidth: (tableOptionsWidth) =>
        set({
          tableOptionsWidth: clampWidth(
            tableOptionsWidth,
            MIN_TABLE_OPTIONS_WIDTH,
            MAX_TABLE_OPTIONS_WIDTH
          ),
        }),
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
        tagsSidebarWidth,
        tableOptionsWidth,
      }) => ({
        zoom,
        rulerVisible,
        darkPages,
        pageUnit,
        tagsSidebarOpen,
        tagsSidebarWidth,
        tableOptionsWidth,
      }),
      merge: (persisted, current) => ({
        ...current,
        ...normalizeEditorPreferences(persisted),
      }),
    }
  )
)
