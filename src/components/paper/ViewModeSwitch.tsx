import { BookOpen, Rows3, type LucideIcon } from 'lucide-react'
import { setPreference, usePaperMode } from '../../hooks/usePreferences'
import { haptic } from '../../lib/haptics'

/**
 * Flip | Scroll — switches the Front and section pages between the page-turning
 * paper and the scrolling layout. The choice is saved, and wins over the
 * device's reduced-motion setting (which only picks the default).
 */
export function ViewModeSwitch({ labels = 'always' }: {
  /** 'wide' hides the words on a phone, where the paper's toolbar is tight. */
  labels?: 'always' | 'wide'
}) {
  const paper = usePaperMode()
  const option = (value: boolean, Icon: LucideIcon, label: string, hint: string) => {
    const active = paper === value
    return (
      <button
        type="button"
        role="radio"
        aria-checked={active}
        aria-label={label}
        title={hint}
        onClick={() => {
          if (active) return
          haptic('select')
          setPreference('pageEffects', value)
        }}
        className={[
          'relative h-8 rounded-full font-medium transition-colors active:scale-95',
          active ? '' : 'text-ink-3 hover:text-ink',
        ].join(' ')}
        // Inline, because global.css's unlayered `button { padding: 0; font: inherit }`
        // reset beats the layered padding, text-size and colour utilities — so
        // spacing lives on the inner span, and size/colour are set here.
        style={{ fontSize: 12, lineHeight: 1, ...(active ? { color: 'var(--canvas)' } : null) }}
      >
        {/* The pill is a plain CSS crossfade, not a framer-motion layoutId: a
            shared-layout element inside this subtree kept the old paper view
            from ever finishing its route exit, leaving both layouts mounted. */}
        <span
          aria-hidden
          className="absolute inset-0 rounded-full transition-[opacity,transform] duration-200 ease-out"
          style={{
            background: 'var(--ink)',
            boxShadow: '0 1px 3px rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.12)',
            opacity: active ? 1 : 0,
            transform: active ? 'scale(1)' : 'scale(0.82)',
          }}
        />
        <span
          className={[
            'relative flex h-full items-center justify-center gap-1.5',
            labels === 'always' ? 'px-3' : 'w-8 sm:w-auto sm:px-3',
          ].join(' ')}
        >
          <Icon size={15} aria-hidden />
          <span aria-hidden className={labels === 'always' ? '' : 'hidden sm:inline'}>{label}</span>
        </span>
      </button>
    )
  }
  return (
    <div
      role="radiogroup"
      aria-label="Page layout"
      className="inline-flex shrink-0 items-center rounded-full border border-rule bg-surface p-0.5 shadow-[inset_0_1px_2px_rgba(0,0,0,.06)] print:hidden"
    >
      {option(true, BookOpen, 'Flip', 'Turn pages like a newspaper')}
      {option(false, Rows3, 'Scroll', 'Scroll through the stories')}
    </div>
  )
}
