import { createContext, useContext } from 'react'
import type { FeedsPayload, MetaJson, BriefingJson } from '../lib/types'

export interface AppContextValue {
  feeds: FeedsPayload | null
  meta: MetaJson | null
  briefing: BriefingJson | null
  loading: boolean
  bookmarks: Set<string>
  toggleBookmark: (id: string) => void
  onSettingsOpen: () => void
  onPaletteOpen: () => void
}

export const AppContext = createContext<AppContextValue>({
  feeds: null,
  meta: null,
  briefing: null,
  loading: true,
  bookmarks: new Set(),
  toggleBookmark: () => {},
  onSettingsOpen: () => {},
  onPaletteOpen: () => {},
})

export function useAppContext(): AppContextValue {
  return useContext(AppContext)
}
