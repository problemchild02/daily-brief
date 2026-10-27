import {
  forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect,
  useMemo, useRef, useState, type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { PageFlip } from 'page-flip/dist/js/page-flip.module.js'
import { playPageTurn } from '../../lib/pageSound'

export interface FlipBookHandle {
  next: () => void
  prev: () => void
  goTo: (index: number) => void
}

interface FlipBookProps {
  pages: ReactNode[]
  /** Show two facing pages side by side (iPad landscape / laptop). */
  spread: boolean
  startPage?: number
  /** `initial` is true for the report of the page the book opened on, as
      opposed to a page the reader turned to. */
  onFlip?: (index: number, initial: boolean) => void
  /** The size of one page, whenever it changes. */
  onPageSize?: (width: number, height: number) => void
  /** Play the synthesized paper sound when a page turns. */
  sound?: boolean
  /** Accessible name for the whole book. */
  label: string
  className?: string
}

// Anything a reader taps to *do* something inside a page — follow a link, save a
// story, type a note — must not also start a page curl. page-flip listens for
// mousedown/touchstart on its own block element, and its built-in check only looks
// at the event's direct target tag (so tapping the text span inside a button still
// starts a fold, and a textarea can never receive focus because the library calls
// preventDefault on mousedown). Stopping these events at the page element, before
// they bubble up to the library, fixes both.
const INTERACTIVE = 'a, button, input, textarea, select, label, [role="button"], [data-no-flip]'

// page-flip's own flipPrev() is broken in single-page mode: it aims the turn at a
// point in the invisible left half of its virtual two-page book, which then fails
// its "is this on a page corner?" check whenever click-to-flip is disabled (and it
// has to be, or tapping a story would turn the page). So for this one programmatic
// call, lift that check; flip() reads the setting synchronously before animating.
function turnBack(book: PageFlip) {
  const settings = book.getSettings()
  const before = settings.disableFlipByClick
  settings.disableFlipByClick = false
  try { book.flipPrev('bottom') } finally { settings.disableFlipByClick = before }
}

function guardInteractive(e: Event) {
  const target = e.target as Element | null
  if (target?.closest?.(INTERACTIVE)) e.stopPropagation()
}

// The library renders pages by repositioning and clip-path-masking the exact DOM
// nodes it's given, and it moves them into its own wrapper. Handing it React-owned
// nodes would leave React reconciling elements that the library has moved, so these
// page nodes are created by hand and React renders each page's content into one
// through a portal. Portals track their container node, not where it sits in the
// tree, so the library can move the nodes freely without breaking React.
function makePageElements(count: number): HTMLDivElement[] {
  return Array.from({ length: count }, (_, i) => {
    const el = document.createElement('div')
    el.className = 'paper-page'
    el.dataset.density = 'soft'
    el.dataset.index = String(i)
    el.setAttribute('role', 'group')
    el.setAttribute('aria-roledescription', 'page')
    el.setAttribute('aria-label', `Page ${i + 1} of ${count}`)
    el.addEventListener('mousedown', guardInteractive)
    el.addEventListener('touchstart', guardInteractive, { passive: true })
    return el
  })
}

export const FlipBook = forwardRef<FlipBookHandle, FlipBookProps>(function FlipBook(
  { pages, spread, startPage = 0, onFlip, onPageSize, sound = false, label, className },
  ref,
) {
  const outerRef = useRef<HTMLDivElement>(null)
  const bookRef = useRef<PageFlip | null>(null)
  const currentRef = useRef(startPage)
  const soundRef = useRef(sound)
  const onFlipRef = useRef(onFlip)
  soundRef.current = sound
  onFlipRef.current = onFlip

  const pageCount = pages.length
  const pageEls = useMemo(() => makePageElements(pageCount), [pageCount])
  const [current, setCurrent] = useState(startPage)

  // Container size drives page size: pages fill the space they're given, rather
  // than a fixed aspect ratio, so a phone page is phone-shaped and a laptop spread
  // is laptop-shaped. Rounded to avoid rebuilding the book on sub-pixel jitter.
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  useLayoutEffect(() => {
    const el = outerRef.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      const w = Math.round(r.width / 4) * 4
      const h = Math.round(r.height / 4) * 4
      setSize(prev => (prev && prev.w === w && prev.h === h ? prev : { w, h }))
    }
    measure()
    let t: ReturnType<typeof setTimeout> | undefined
    const ro = new ResizeObserver(() => {
      clearTimeout(t)
      t = setTimeout(measure, 120)
    })
    ro.observe(el)
    return () => { ro.disconnect(); clearTimeout(t) }
  }, [])

  // Tell the parent the exact page size the library will use, so anything it
  // lays out to fit a page is measured against the real thing.
  const onPageSizeRef = useRef(onPageSize)
  onPageSizeRef.current = onPageSize
  useEffect(() => {
    if (size) onPageSizeRef.current?.(spread ? Math.floor(size.w / 2) : size.w, size.h)
  }, [size, spread])

  const markInk = useCallback((index: number, isSpread: boolean) => {
    const targets = [pageEls[index], isSpread ? pageEls[index + 1] : undefined]
    for (const el of targets) {
      if (!el) continue
      el.removeAttribute('data-ink')
      // Force a reflow so re-adding the attribute restarts the animation.
      void el.offsetWidth
      el.setAttribute('data-ink', 'settle')
    }
  }, [pageEls])

  // (Re)build the book whenever its size or layout changes, resuming on the page
  // the reader was on. The host node is created fresh per build and removed on
  // cleanup, because the library adds classes, wrappers and inline sizing to it
  // that it never undoes on destroy().
  useEffect(() => {
    const outer = outerRef.current
    if (!outer || !size || size.w < 50 || size.h < 50 || pageCount === 0) return

    const host = document.createElement('div')
    host.className = 'paper-book'
    outer.appendChild(host)

    const pageW = spread ? Math.floor(size.w / 2) : size.w
    const book = new PageFlip(host, {
      size: 'stretch',
      width: pageW,
      height: size.h,
      // In stretch mode the library goes single-page when the container is
      // narrower than 2 × minWidth. Pinning minWidth to the full width (single)
      // or just under half (spread) makes the layout ours to choose, not its.
      minWidth: spread ? Math.max(100, pageW - 2) : size.w,
      maxWidth: pageW,
      minHeight: 100,
      maxHeight: size.h,
      usePortrait: true,
      autoSize: false,
      startPage: Math.min(currentRef.current, pageCount - 1),
      drawShadow: true,
      maxShadowOpacity: 0.45,
      flippingTime: 820,
      showCover: false,
      mobileScrollSupport: true,
      swipeDistance: 26,
      showPageCorners: true,
      disableFlipByClick: true,
      clickEventForward: true,
    })
    host.style.height = `${size.h}px`

    // While loadFromHTML runs, the library briefly shows page 0 as it settles
    // orientation and emits a 'flip' for it before turning to startPage. Those
    // aren't the reader's turns; the real opening page is reported once below.
    let loading = true
    book.on('flip', e => {
      if (loading) return
      currentRef.current = e.data
      setCurrent(e.data)
      markInk(e.data, book.getOrientation() === 'landscape')
      onFlipRef.current?.(e.data, false)
    })
    book.on('changeState', e => {
      if (e.data === 'flipping' && soundRef.current) playPageTurn()
    })

    book.loadFromHTML(pageEls)
    loading = false
    bookRef.current = book
    const opened = book.getCurrentPageIndex()
    currentRef.current = opened
    setCurrent(opened)
    markInk(opened, spread)
    onFlipRef.current?.(opened, true)

    return () => {
      bookRef.current = null
      try { book.destroy() } catch { /* already torn down */ }
      host.remove()
    }
  }, [size, spread, pageCount, pageEls, markInk])

  useImperativeHandle(ref, () => ({
    next: () => bookRef.current?.flipNext('bottom'),
    prev: () => { if (bookRef.current) turnBack(bookRef.current) },
    goTo: (index: number) => {
      const book = bookRef.current
      if (!book) return
      // On a spread, pages pair up (0–1, 2–3, …) and the book reports the
      // left-hand one, so compare spreads: a page already showing on the right
      // needs no turn.
      const clamp = (i: number) => Math.max(0, Math.min(i, pageCount - 1))
      const view = (i: number) => (spread ? i - (i % 2) : i)
      const target = view(clamp(index))
      const here = view(book.getCurrentPageIndex())
      // A long jump (e.g. from the section index) turns straight to the page
      // instead of animating one curl per page in between.
      if (Math.abs(target - here) > (spread ? 2 : 1)) {
        book.turnToPage(target)
        currentRef.current = target
        setCurrent(target)
        markInk(target, spread)
        onFlipRef.current?.(target, false)
      } else if (target > here) {
        book.flipNext('bottom')
      } else if (target < here) {
        turnBack(book)
      }
    },
  }), [pageCount, spread, markInk])

  // Arrow keys turn pages, unless the reader is typing somewhere or a dialog the
  // book isn't part of is open on top of it (Settings, search, or — for the paper
  // edition underneath — the story reader). Closed sheets stay mounted with
  // aria-hidden on a parent, so those don't count as open.
  const frameRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const openDialogs = Array.from(document.querySelectorAll('[role="dialog"][aria-modal="true"]'))
        .filter(d => !d.closest('[aria-hidden="true"]'))
      const frame = frameRef.current
      if (openDialogs.length && !(frame && openDialogs.some(d => d.contains(frame)))) return
      if (openDialogs.length > 1 && frame && !openDialogs[openDialogs.length - 1].contains(frame)) return
      if (e.key === 'ArrowRight') { e.preventDefault(); bookRef.current?.flipNext('bottom') }
      if (e.key === 'ArrowLeft' && bookRef.current) { e.preventDefault(); turnBack(bookRef.current) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Forgiving swipe. page-flip only counts a swipe finished within 250ms, and only
  // starts a finger-drag curl after a 250ms hold — so an ordinary, unhurried swipe
  // (300–700ms) lands in the gap between the two and does nothing. This catches
  // that gap: a clearly horizontal swipe the library didn't act on turns the page.
  // It runs after the library's own touchend handling, and backs off if the
  // library already started a turn or the page already changed.
  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    let start: { x: number; y: number; t: number; page: number } | null = null
    const onStart = (e: TouchEvent) => {
      const t = e.changedTouches[0]
      const book = bookRef.current
      start = t && book ? { x: t.clientX, y: t.clientY, t: Date.now(), page: book.getCurrentPageIndex() } : null
    }
    const onEnd = (e: TouchEvent) => {
      const s = start
      start = null
      const t = e.changedTouches[0]
      if (!s || !t) return
      const dx = t.clientX - s.x
      const dy = t.clientY - s.y
      if (Math.abs(dx) < 45 || Math.abs(dy) > Math.abs(dx) * 0.7 || Date.now() - s.t > 900) return
      setTimeout(() => {
        const book = bookRef.current
        if (!book || book.getState() !== 'read' || book.getCurrentPageIndex() !== s.page) return
        if (dx < 0) book.flipNext('bottom')
        else turnBack(book)
      }, 40)
    }
    frame.addEventListener('touchstart', onStart, { passive: true })
    frame.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      frame.removeEventListener('touchstart', onStart)
      frame.removeEventListener('touchend', onEnd)
    }
  }, [])

  const leftCount = current
  const rightCount = Math.max(0, pageCount - current - (spread ? 2 : 1))

  return (
    <div
      ref={frameRef}
      className={['paper-book-frame', className].filter(Boolean).join(' ')}
      data-spread={spread}
      role="region"
      aria-roledescription="newspaper"
      aria-label={label}
    >
      {/* Page edges: a sliver of stacked paper on each side, thicker the more
          pages sit on that side — reads as a physical paper with pages left. */}
      <PageEdges side="left" count={leftCount} />
      <div ref={outerRef} className="paper-book-stage" />
      <PageEdges side="right" count={rightCount} />
      {pageEls.map((el, i) => createPortal(pages[i], el, `page-${i}`))}
    </div>
  )
})

function PageEdges({ side, count }: { side: 'left' | 'right'; count: number }) {
  const layers = Math.min(6, Math.ceil(count / 2))
  return (
    <div
      aria-hidden
      className={`paper-edges paper-edges--${side}`}
      style={{ ['--edge-layers' as string]: layers }}
      data-empty={layers === 0 || undefined}
    />
  )
}
