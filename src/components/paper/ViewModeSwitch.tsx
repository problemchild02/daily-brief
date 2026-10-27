import { BookOpen, Rows3, type LucideIcon } from 'lucide-react'
import { setPreference, usePaperMode } from '../../hooks/usePreferences'

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
        onClick={() => { if (!active) setPreference('pageEffects', value) }}
        className={[
          'flex h-8 items-center justify-center gap-1.5 rounded-full text-[12px] font-medium transition-colors',
          labels === 'always' ? 'px-3' : 'w-8 sm:w-auto sm:px-3',
          active ? '' : 'text-ink-3 hover:text-ink',
        ].join(' ')}
        // Inline, because global.css's unlayered `button { background: none }`
        // beats a bg- utility class.
        style={active ? { background: 'var(--ink)', color: 'var(--canvas)' } : undefined}
      >
        <Icon size={15} aria-hidden />
        <span aria-hidden className={labels === 'always' ? '' : 'hidden sm:inline'}>{label}</span>
      </button>
    )
  }
  return (
    <div
      role="radiogroup"
      aria-label="Page layout"
      className="inline-flex shrink-0 items-center rounded-full border border-rule bg-surface p-0.5 print:hidden"
    >
      {option(true, BookOpen, 'Flip', 'Turn pages like a newspaper')}
      {option(false, Rows3, 'Scroll', 'Scroll through the stories')}
    </div>
  )
}
