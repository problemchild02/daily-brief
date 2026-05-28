import { createContext, useContext } from 'react'
import type { FeedsPayload, MetaJson, BriefingJson, Story } from '../lib/types'
import type { Density } from '../hooks/useDensity'
import type { BookmarkMeta } from '../hooks/useBookmarks'

export interface AppContextValue {
  feeds: FeedsPayload | null
  meta: MetaJson | null
  briefing: BriefingJson | null
  loading: boolean
  feedsError: boolean
  retryFeeds: () => void
  density: Density
  // Bookmarks (keyed by URL hash for cross-refresh persistence)
  bookmarksList: BookmarkMeta[]
  isBookmarked: (sourceUrl: string) => boolean
  toggleBookmark: (story: Story) => void
  onSettingsOpen: () => void
  onPaletteOpen: () => void
}

export const AppContext = createContext<AppContextValue>({
  feeds: null,
  meta: null,
  briefing: null,
  loading: true,
  feedsError: false,
  retryFeeds: () => {},
  density: 'comfortable',
  bookmarksList: [],
  isBookmarked: () => false,
  toggleBookmark: () => {},
  onSettingsOpen: () => {},
  onPaletteOpen: () => {},
})

export function useAppContext(): AppContextValue {
  return useContext(AppContext)
}
