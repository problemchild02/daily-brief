import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Eye, EyeOff, Play, Loader } from 'lucide-react'
import { clsx } from 'clsx'
import { useTheme } from '../../hooks/useTheme'
import { useDensity } from '../../hooks/useDensity'
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
          onClick={() => onChange(opt.value)}
          className={clsx(
            'px-3 py-1.5 rounded-lg transition-colors',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent',
            value === opt.value
              ? 'bg-accent text-canvas'
              : 'bg-surface-2 text-ink-2 hover:text-ink',
          )}
          style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 500 }}
        >
          {opt.label}
        </button>
      ))}
    </div>
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
              <RadioGroup<Theme>
                name="Theme"
                value={theme}
                onChange={setTheme}
                options={[
                  { value: 'auto', label: 'Auto' },
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
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
