import { useState, useCallback } from 'react'
import { hashUrl } from '../lib/urlHash'
import type { Story, CategoryKey } from '../lib/types'

export interface BookmarkMeta {
  urlHash: string
  url: string
  headline: string
  source: string
  category: CategoryKey
  savedAt: string  // ISO datetime — used for Today/This-week/Earlier/Older grouping
}

type BookmarkStore = Record<string, BookmarkMeta>  // keyed by urlHash

const STORAGE_KEY = 'daily-brief:bookmarks'

function readStore(): BookmarkStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    // Migrate: old format was a JSON array of story IDs — can't preserve without URLs.
    if (Array.isArray(parsed)) return {}
    if (typeof parsed === 'object' && parsed !== null) return parsed as BookmarkStore
    return {}
  } catch {
    return {}
  }
}

function writeStore(store: BookmarkStore) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)) }
  catch { /* ignore quota / security errors */ }
}

export function useBookmarks() {
  const [store, setStore] = useState<BookmarkStore>(readStore)

  const toggle = useCallback((story: Story) => {
    const hash = hashUrl(story.sourceUrl)
    setStore(prev => {
      const next = { ...prev }
      if (next[hash]) {
        delete next[hash]
      } else {
        next[hash] = {
          urlHash: hash,
          url: story.sourceUrl,
          headline: story.headline,
          source: story.source,
          category: story.section as CategoryKey,
          savedAt: new Date().toISOString(),
        }
      }
      writeStore(next)
      return next
    })
  }, [])

  const isBookmarked = useCallback(
    (sourceUrl: string): boolean => hashUrl(sourceUrl) in store,
    [store],
  )

  const bookmarksList: BookmarkMeta[] = Object.values(store).sort(
    (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
  )

  return { toggle, isBookmarked, bookmarksList }
}
