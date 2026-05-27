import { useEffect, useRef, useState, useCallback } from 'react'

interface ArticleNoteProps {
  storyId: string    // used for legacy key migration
  sourceUrl: string  // used for new hash-based storage key
  storyTitle: string // stored alongside note for future Saved view
}

type SaveStatus = 'idle' | 'saving' | 'saved'

// Stable djb2-style hash — produces a short base-36 string from a URL.
function hashUrl(url: string): string {
  let h = 0
  for (let i = 0; i < url.length; i++) {
    h = ((h << 5) - h + url.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(36)
}

const NOTES_PREFIX = 'daily-brief:notes:'
const BACKUP_PREFIX = 'daily-brief:notes-backup:'
const LEGACY_PREFIX = 'dailybrief:note:'  // old app.js key format

function readNote(key: string): string {
  try { return localStorage.getItem(key) ? JSON.parse(localStorage.getItem(key)!).note ?? '' : '' }
  catch { return '' }
}

function readLegacyNote(storyId: string): string {
  try { return localStorage.getItem(LEGACY_PREFIX + storyId) ?? '' }
  catch { return '' }
}

function writeNote(key: string, url: string, title: string, note: string) {
  const backupKey = BACKUP_PREFIX + key.slice(NOTES_PREFIX.length)
  try {
    // Safety net: preserve previous value before overwriting.
    const prev = localStorage.getItem(key)
    if (prev) localStorage.setItem(backupKey, prev)

    if (note.trim() === '') {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, JSON.stringify({
        url,
        storyTitle: title,
        note,
        updatedAt: new Date().toISOString(),
      }))
    }
  } catch {
    // ignore localStorage quota / security errors
  }
}

export function ArticleNote({ storyId, sourceUrl, storyTitle }: ArticleNoteProps) {
  const hash = hashUrl(sourceUrl || storyId)
  const storageKey = NOTES_PREFIX + hash

  const [value, setValue] = useState<string>(() => {
    // 1. Check new key first.
    const stored = readNote(storageKey)
    if (stored) return stored
    // 2. Migrate from legacy key if present.
    const legacy = readLegacyNote(storyId)
    if (legacy) {
      // Immediately write to new format and remove old key.
      try {
        localStorage.setItem(storageKey, JSON.stringify({
          url: sourceUrl,
          storyTitle,
          note: legacy,
          updatedAt: new Date().toISOString(),
        }))
        localStorage.removeItem(LEGACY_PREFIX + storyId)
      } catch { /* ignore */ }
      return legacy
    }
    return ''
  })

  const [saveStatus, setSaveStatus] = useState<SaveStatus>(() =>
    value ? 'saved' : 'idle'
  )

  const timerRef = useRef<ReturnType<typeof setTimeout>>()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-grow on mount (for pre-populated notes after reload).
  useEffect(() => {
    const el = textareaRef.current
    if (el && value) grow(el)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const scheduleWrite = useCallback((note: string) => {
    setSaveStatus('saving')
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      writeNote(storageKey, sourceUrl, storyTitle, note)
      setSaveStatus(note.trim() ? 'saved' : 'idle')
    }, 500)
  }, [storageKey, sourceUrl, storyTitle])

  function grow(el: HTMLTextAreaElement) {
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const note = e.target.value
    grow(e.target)
    setValue(note)
    scheduleWrite(note)
  }

  return (
    <div className="mt-1">
      {/* Kicker row */}
      <div className="flex items-center justify-between mb-1.5">
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            fontWeight: 500,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--ink-3)',
            lineHeight: 1,
          }}
        >
          Your note
        </span>
        {saveStatus !== 'idle' && (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              color: 'var(--ink-3)',
              lineHeight: 1,
            }}
          >
            {saveStatus === 'saving' ? 'Saving…' : 'Saved ✓'}
          </span>
        )}
      </div>

      {/* Textarea — field-sizing:content is progressive enhancement; JS grow is the fallback */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        placeholder="Add a note — saved automatically…"
        rows={1}
        style={{
          display: 'block',
          width: '100%',
          fontFamily: 'var(--font-serif)',
          fontSize: '14px',
          lineHeight: 1.6,
          color: 'var(--ink)',
          background: 'var(--surface)',
          border: '1px solid var(--rule)',
          borderRadius: '8px',
          padding: '12px 14px',
          resize: 'none',
          outline: 'none',
          // Progressive enhancement — supported in Chrome 123+ / Firefox 130+
          fieldSizing: 'content',
          minHeight: '44px',
          overflow: 'hidden',
        } as React.CSSProperties}
        aria-label="Add a personal note for this story"
      />
    </div>
  )
}
