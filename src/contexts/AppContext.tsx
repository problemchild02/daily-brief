import { createContext, useContext } from 'react'
import type { FeedsPayload, MetaJson, BriefingJson, Story, ThreadsMap } from '../lib/types'
import type { Ranked } from '../lib/ranking'
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
  bookmarksList: BookmarkMeta[]
  isBookmarked: (sourceUrl: string) => boolean
  toggleBookmark: (story: Story) => void
  onSettingsOpen: () => void
  onPaletteOpen: () => void
  sidebarCollapsed: boolean
  onSidebarToggle: () => void
  // Tapping a card opens it in-app (ArticleSheet) instead of redirecting straight to
  // the source site — the sheet itself has an explicit "Read full story" link for
  // when you actually want to leave. See App.tsx for where this state lives.
  onStoryOpen: (story: Story) => void
  /** Earlier coverage of running stories (story id -> reports), from threads.json. */
  threads: ThreadsMap
  /** How the paper was ranked when it was printed: reasons, new-since-last-visit, developing. */
  rankedById: Map<string, Ranked>
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
  sidebarCollapsed: false,
  onSidebarToggle: () => {},
  onStoryOpen: () => {},
  threads: {},
  rankedById: new Map(),
})

export function useAppContext(): AppContextValue {
  return useContext(AppContext)
}
