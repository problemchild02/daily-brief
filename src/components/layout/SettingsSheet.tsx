import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Eye, EyeOff, Play, Loader, Printer } from 'lucide-react'
import { clsx } from 'clsx'
import { useTheme } from '../../hooks/useTheme'
import { useDensity } from '../../hooks/useDensity'
import { usePreferences, setPreference, usePrefersReducedMotion, usePaperMode } from '../../hooks/usePreferences'
import type { ReadingFont, TextSize } from '../../hooks/usePreferences'
import { haptic, hapticsSupported } from '../../lib/haptics'
import { enterImmersive } from '../../hooks/useImmersive'
import { resetProfile, useProfile } from '../../hooks/useProfile'
import { summarise } from '../../lib/profile'
import { CATEGORIES } from '../../lib/categories'
import { readPat, writePat, dispatchWorkflow } from '../../lib/githubWorkflow'
import type { Theme } from '../../hooks/useTheme'
import type { Density } from '../../hooks/useDensity'

const HOME_CITY_KEY = 'daily-brief:home-city'
type HomeCity = 'Mumbai' | 'Noida'

function readHomeCity(): HomeCity {
  try {
    const v = localStorage.getItem(HOME_CITY_KEY)
    if (v === 'Mumbai' || v === 'Noida') return v
  } catch { /* ignore */ }
  return 'Mumbai'
}

function writeHomeCity(city: HomeCity) {
  try { localStorage.setItem(HOME_CITY_KEY, city) } catch { /* ignore */ }
}

interface RadioGroupProps<T extends string> {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  name: string
}

function RadioGroup<T extends string>({ value, options, onChange, name }: RadioGroupProps<T>) {
  return (
    <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label={name}>
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          onClick={() => { haptic('select'); onChange(opt.value) }}
          className="rounded-lg transition-colors active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          // Inline, not Tailwind: the unlayered global `button { padding:0; background:none }`
          // reset beats layered utilities, which left the selected option with no
          // background (its canvas-coloured text vanished) and no padding.
          style={{
            fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 500,
            padding: '6px 12px',
            background: value === opt.value ? 'var(--accent)' : 'var(--surface-2)',
            color: value === opt.value ? 'var(--canvas)' : 'var(--ink-2)',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// Preview colours for the swatch picker only: [page, ink, accent]. The real palettes
// live in tokens.css; keep these in step when one changes.
const THEME_SWATCHES: { value: Theme; label: string; page: string; ink: string; accent: string }[] = [
  { value: 'paper',    label: 'Paper',    page: '#FFFDF8', ink: '#111111', accent: '#A8321F' },
  { value: 'sepia',    label: 'Sepia',    page: '#F8F0DD', ink: '#2E241A', accent: '#9A3B1C' },
  { value: 'mist',     label: 'Mist',     page: '#F4F7FA', ink: '#17212B', accent: '#1F5FA8' },
  { value: 'sage',     label: 'Sage',     page: '#F0F4E8', ink: '#1E2A1B', accent: '#2F6B3A' },
  { value: 'blush',    label: 'Blush',    page: '#FAF1EF', ink: '#2B1B1C', accent: '#A32D4A' },
  { value: 'dark',     label: 'Dark',     page: '#1B1814', ink: '#EDE7DC', accent: '#E8745B' },
  { value: 'slate',    label: 'Slate',    page: '#171E26', ink: '#E3E9EF', accent: '#6FB0F0' },
  { value: 'midnight', label: 'Midnight', page: '#0E1428', ink: '#DDE3F5', accent: '#8EA2FF' },
  { value: 'night',    label: 'Night',    page: '#121110', ink: '#D6CFC2', accent: '#D9775E' },
  { value: 'amoled',   label: 'Black',    page: '#000000', ink: '#E6E1D6', accent: '#E8745B' },
]

function ThemePicker({ value, onChange }: { value: Theme; onChange: (v: Theme) => void }) {
  const items = [
    { value: 'auto' as Theme, label: 'Auto', page: '', ink: '', accent: '' },
    { value: 'clock' as Theme, label: 'Clock', page: '', ink: '', accent: '' },
    ...THEME_SWATCHES,
  ]
  return (
    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 w-full" role="radiogroup" aria-label="Theme">
      {items.map(t => {
        const selected = value === t.value
        return (
          <button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => { haptic('select'); onChange(t.value) }}
            className="flex flex-col items-center gap-1.5 rounded-xl active:scale-95 transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            style={{ padding: 6, boxShadow: selected ? 'inset 0 0 0 2px var(--accent)' : 'inset 0 0 0 1px var(--rule)' }}
          >
            <span
              aria-hidden="true"
              className="flex h-11 w-full items-end justify-between overflow-hidden rounded-lg px-1.5 pb-1"
              style={{
                background: t.value === 'auto' ? 'linear-gradient(105deg, #FBFAF7 50%, #1B1814 50%)'
                  : t.value === 'clock' ? 'linear-gradient(105deg, #FFFDF8 34%, #F8F0DD 34% 67%, #121110 67%)' : t.page,
                boxShadow: 'inset 0 0 0 1px rgba(128,128,128,0.25)',
              }}
            >
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '17px', lineHeight: 1, fontWeight: 600, color: t.value === 'auto' || t.value === 'clock' ? '#B8442A' : t.ink }}>Aa</span>
              <span style={{ height: 8, width: 8, borderRadius: 999, background: t.value === 'auto' || t.value === 'clock' ? '#8EA2FF' : t.accent }} />
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 500, color: selected ? 'var(--ink)' : 'var(--ink-3)' }}>
              {t.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function LearnedRow() {
  const profile = useProfile()
  const [sure, setSure] = useState(false)
  const s = summarise(profile)
  const names = (xs: string[]) => xs.join(', ')
  return (
    <SettingRow label="Learned">
      <div className="min-w-0 flex-1">
        {s.storiesRead === 0 && s.votes === 0 ? (
          <p className="font-mono text-[11px] leading-relaxed text-ink-3">Nothing yet. The paper learns from the stories you open and stay with, and from More / Less like this.</p>
        ) : (
          <ul className="space-y-1 font-mono text-[11px] leading-relaxed text-ink-2">
            <li>{s.storiesRead} {s.storiesRead === 1 ? 'story' : 'stories'} read{s.votes ? `, ${s.votes} ${s.votes === 1 ? 'vote' : 'votes'}` : ''}</li>
            {s.topTopics.length > 0 && <li>Leaning towards: {names(s.topTopics)}</li>}
            {s.topSections.length > 0 && <li>Sections you read: {names(s.topSections.map(k => (CATEGORIES as Record<string, { label: string }>)[k]?.label ?? k))}</li>}
            {s.fewer.length > 0 && <li>Showing less of: {names(s.fewer)}</li>}
          </ul>
        )}
        <p className="mt-2 font-mono text-[10px] leading-relaxed text-ink-3">Stays on this device. Each device learns on its own.</p>
        <button
          type="button"
          onClick={() => { if (sure) { resetProfile(); setSure(false) } else setSure(true) }}
          onBlur={() => setSure(false)}
          className="mt-2 rounded-lg transition-colors active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 500, padding: '6px 12px', background: sure ? 'var(--accent)' : 'var(--surface-2)', color: sure ? 'var(--canvas)' : 'var(--ink-2)' }}
        >
          {sure ? 'Tap again to forget everything' : 'Forget what it learned'}
        </button>
      </div>
    </SettingRow>
  )
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-3 border-b border-rule last:border-0">
      <span
        className="shrink-0 sm:w-28"
        style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 500, color: 'var(--ink-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}
      >
        {label}
      </span>
      {children}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="mt-6 mb-2 first:mt-0"
      style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-3)' }}
    >
      {children}
    </p>
  )
}

type WorkflowStatus = 'idle' | 'running' | 'ok' | 'error'

interface SettingsSheetProps {
  open: boolean
  onClose: () => void
}

export function SettingsSheet({ open, onClose }: SettingsSheetProps) {
  const { theme, setTheme } = useTheme()
  const { density, setDensity } = useDensity()
  const prefs = usePreferences()
  const reducedMotion = usePrefersReducedMotion()
  const paperMode = usePaperMode()
  const [homeCity, setHomeCityState] = useState<HomeCity>(readHomeCity)
  const [pat, setPat] = useState(readPat)
  const [showPat, setShowPat] = useState(false)
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus>('idle')
  const [workflowError, setWorkflowError] = useState('')
  const [pdfName, setPdfName] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleHomeCityChange(city: HomeCity) {
    setHomeCityState(city)
    writeHomeCity(city)
  }

  function handlePatChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    setPat(v)
    writePat(v)
  }

  const handleRunWorkflow = useCallback(async () => {
    setWorkflowStatus('running')
    setWorkflowError('')
    const result = await dispatchWorkflow(pat)
    if (result.ok) {
      setWorkflowStatus('ok')
    } else {
      setWorkflowStatus('error')
      setWorkflowError(result.error ?? 'Unknown error')
    }
  }, [pat])

  // Focus first focusable element when opened; restore on close.
  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => closeRef.current?.focus(), 50)
    return () => clearTimeout(timer)
  }, [open])

  // Escape key to close + focus trap.
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab') return
      const el = panelRef.current
      if (!el) return
      const focusable = Array.from(
        el.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  // Body scroll lock.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  return (
    <div
      className={clsx(
        'fixed inset-0 z-50 flex items-end sm:items-center justify-center',
        open ? 'pointer-events-auto' : 'pointer-events-none',
      )}
      aria-hidden={!open}
    >
      {/* Backdrop */}
      <div
        className={clsx(
          'absolute inset-0 bg-black/40 transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0',
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        className={clsx(
          'relative z-10 bg-canvas border border-rule shadow-2xl',
          'w-full sm:max-w-md',
          'rounded-t-2xl sm:rounded-2xl',
          'max-h-[88vh] overflow-y-auto',
          'transition-all duration-300',
          open ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0',
        )}
      >
        {/* Drag handle (mobile only) */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-rule" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-4 pb-2 sm:pt-5">
          <h2
            className="font-serif font-semibold text-[18px] text-ink"
          >
            Settings
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 pb-8">

          {/* ── Reading ─────────────────────────────────── */}
          <SectionLabel>Reading</SectionLabel>
          <div className="border border-rule rounded-xl px-4">
            <SettingRow label="Theme">
              <ThemePicker value={theme} onChange={setTheme} />
            </SettingRow>

            <SettingRow label="Font">
              <RadioGroup<ReadingFont>
                name="Reading font"
                value={prefs.font}
                onChange={v => setPreference('font', v)}
                options={[
                  { value: 'serif', label: 'Serif' },
                  { value: 'sans', label: 'Sans' },
                  { value: 'legible', label: 'Hyperlegible' },
                ]}
              />
            </SettingRow>

            <SettingRow label="Text size">
              <RadioGroup<TextSize>
                name="Text size"
                value={prefs.textSize}
                onChange={v => setPreference('textSize', v)}
                options={[
                  { value: 's', label: 'A−' },
                  { value: 'm', label: 'A' },
                  { value: 'l', label: 'A+' },
                  { value: 'xl', label: 'A++' },
                ]}
              />
            </SettingRow>

            <SettingRow label="Density">
              <RadioGroup<Density>
                name="Density"
                value={density}
                onChange={setDensity}
                options={[
                  { value: 'comfortable', label: 'Comfortable' },
                  { value: 'compact', label: 'Compact' },
                  { value: 'dense', label: 'Dense' },
                ]}
              />
            </SettingRow>

            <SettingRow label="Home city">
              <RadioGroup<HomeCity>
                name="Home city"
                value={homeCity}
                onChange={handleHomeCityChange}
                options={[
                  { value: 'Mumbai', label: 'Mumbai' },
                  { value: 'Noida', label: 'Noida' },
                ]}
              />
            </SettingRow>
          </div>

          {/* ── Personal ────────────────────────────────── */}
          <SectionLabel>Personal</SectionLabel>
          <div className="border border-rule rounded-xl px-4">
            <SettingRow label="Ranking">
              <RadioGroup<'on' | 'off'>
                name="Personal ranking"
                value={prefs.personalise ? 'on' : 'off'}
                onChange={v => setPreference('personalise', v === 'on')}
                options={[
                  { value: 'on', label: 'For me' },
                  { value: 'off', label: 'Publisher order' },
                ]}
              />
            </SettingRow>
            {prefs.personalise && (
              <SettingRow label="Emphasis">
                <RadioGroup<'retail' | 'balanced'>
                  name="Ranking emphasis"
                  value={prefs.lens}
                  onChange={v => setPreference('lens', v)}
                  options={[
                    { value: 'retail', label: 'Retail & Reliance' },
                    { value: 'balanced', label: 'Balanced legal desk' },
                  ]}
                />
              </SettingRow>
            )}
            <LearnedRow />
          </div>

          {/* ── Paper ───────────────────────────────────── */}
          <SectionLabel>Paper</SectionLabel>
          <div className="border border-rule rounded-xl px-4">
            <SettingRow label="Page turns">
              <RadioGroup<'on' | 'off'>
                name="Page turns"
                value={paperMode ? 'on' : 'off'}
                onChange={v => setPreference('pageEffects', v === 'on')}
                options={[
                  { value: 'on', label: 'Flip pages' },
                  { value: 'off', label: 'Scroll' },
                ]}
              />
            </SettingRow>
            <SettingRow label="Full screen">
              <button
                type="button"
                onClick={() => { haptic('select'); onClose(); enterImmersive() }}
                className="rounded-lg transition-colors active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 500, padding: '6px 12px', background: 'var(--surface-2)', color: 'var(--ink-2)', alignSelf: 'flex-start' }}
              >
                Read full screen
              </button>
            </SettingRow>
            <SettingRow label="Page sound">
              <RadioGroup<'on' | 'off'>
                name="Page sound"
                value={prefs.pageSound ? 'on' : 'off'}
                onChange={v => setPreference('pageSound', v === 'on')}
                options={[
                  { value: 'off', label: 'Off' },
                  { value: 'on', label: 'On' },
                ]}
              />
            </SettingRow>
            <SettingRow label="Haptics">
              <RadioGroup<'on' | 'off'>
                name="Haptics"
                value={prefs.haptics ? 'on' : 'off'}
                onChange={v => setPreference('haptics', v === 'on')}
                options={[
                  { value: 'on', label: 'On' },
                  { value: 'off', label: 'Off' },
                ]}
              />
            </SettingRow>
            {!hapticsSupported() && (
              <p className="pb-3" style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--ink-3)', lineHeight: 1.5 }}>
                This browser can't vibrate (iPhone browsers don't allow it), so haptics only work on Android.
              </p>
            )}
            {reducedMotion && prefs.pageEffects === null && (
              <p className="pb-3" style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--ink-3)', lineHeight: 1.5 }}>
                Your device asks for reduced motion, so pages scroll by default. Choose Flip pages to turn them anyway.
              </p>
            )}
          </div>

          {/* ── Automation ──────────────────────────────── */}
          <SectionLabel>Automation</SectionLabel>
          <div className="border border-rule rounded-xl px-4">
            <SettingRow label="GitHub PAT">
              <div className="flex-1 flex items-center gap-2 min-w-0">
                <div className="relative flex-1 min-w-0">
                  <input
                    type={showPat ? 'text' : 'password'}
                    value={pat}
                    onChange={handlePatChange}
                    placeholder="ghp_…"
                    autoComplete="off"
                    spellCheck={false}
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '12px',
                      background: 'var(--surface-2)',
                      border: '1px solid var(--rule)',
                      borderRadius: '8px',
                      padding: '8px 36px 8px 10px',
                      color: 'var(--ink)',
                      width: '100%',
                      outline: 'none',
                    }}
                    className="focus:border-accent transition-colors"
                    aria-label="GitHub personal access token"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPat(p => !p)}
                    aria-label={showPat ? 'Hide PAT' : 'Show PAT'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink transition-colors"
                  >
                    {showPat ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            </SettingRow>

            <div className="py-3">
              <p
                className="mb-3"
                style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--ink-3)', lineHeight: 1.5 }}
              >
                Needs <code>workflow</code> scope. Stored locally in your browser only.
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleRunWorkflow}
                  disabled={!pat.trim() || workflowStatus === 'running'}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors text-[12px] font-medium',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent',
                    !pat.trim() || workflowStatus === 'running'
                      ? 'bg-surface-2 text-ink-3 cursor-not-allowed'
                      : 'bg-accent text-canvas hover:opacity-90',
                  )}
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {workflowStatus === 'running' ? (
                    <Loader size={12} className="animate-spin" />
                  ) : (
                    <Play size={12} />
                  )}
                  Run workflow now
                </button>

                {workflowStatus === 'ok' && (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--ink-3)' }}>
                    Triggered ✓
                  </span>
                )}
                {workflowStatus === 'error' && (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#c0392b' }}>
                    {workflowError || 'Failed — check PAT scope.'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ── Export ──────────────────────────────────── */}
          <SectionLabel>Export</SectionLabel>
          <div className="border border-rule rounded-xl px-4 py-3">
            <p
              className="mb-3"
              style={{ fontFamily: 'var(--font-serif)', fontSize: '13px', lineHeight: 1.5, color: 'var(--ink-2)' }}
            >
              Save today's brief as a printable PDF.
            </p>
            <button
              type="button"
              onClick={() => { onClose(); setTimeout(() => window.print(), 200) }}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-2 rounded-lg border border-rule text-[12px] font-medium',
                'hover:bg-surface-2 hover:border-ink-3/40 transition-colors',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent',
              )}
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-2)' }}
            >
              <Printer size={13} />
              Export to PDF
            </button>
          </div>

          {/* ── Papers ──────────────────────────────────── */}
          <SectionLabel>Papers</SectionLabel>
          <div className="border border-rule rounded-xl px-4 py-3">
            <p
              className="mb-3"
              style={{ fontFamily: 'var(--font-serif)', fontSize: '13px', lineHeight: 1.5, color: 'var(--ink-2)' }}
            >
              Upload a PDF newspaper for in-browser text extraction and AI-powered story briefing.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="sr-only"
              aria-label="Upload PDF newspaper"
              onChange={e => {
                const file = e.target.files?.[0]
                setPdfName(file?.name ?? null)
                // Reset so the same file can be re-selected
                e.target.value = ''
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={clsx(
                'px-3 py-2 rounded-lg border border-rule text-[12px] font-medium',
                'hover:bg-surface-2 hover:border-ink-3/40 transition-colors',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent',
              )}
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-2)' }}
            >
              Upload PDF…
            </button>
            {pdfName && (
              <p
                className="mt-2"
                style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--ink-3)' }}
              >
                Selected: {pdfName}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
