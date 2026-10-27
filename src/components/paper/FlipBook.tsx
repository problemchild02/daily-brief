import {
  forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect,
  useMemo, useRef, useState, type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { PageFlip } from 'page-flip/dist/js/page-flip.module.js'
import { playPageTurn } from '../../lib/pageSound'
import { haptic } from '../../lib/haptics'

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
// mousedown on its own block element, and its built-in check only looks at the
// event's direct target tag (so clicking the text span inside a button still
// starts a fold, and a textarea can never receive focus because the library calls
// preventDefault on mousedown). Stopping mousedown at the page element, before it
// bubbles up to the library, fixes both. Touch is handled by FlipBook itself.
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
      haptic('turn')
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
        haptic('turn')
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

  // Touch turning, Apple Books style: the moment a finger moves sideways the
  // page curls and follows it; let go past ~30% of the page (or flick) and it
  // turns, otherwise it settles back. Up/down movement is left to the browser,
  // so a long page still scrolls.
  //
  // page-flip's own touch handling can't do this on Android: it only starts
  // following the finger after a 250ms press-and-hold, and only while the
  // browser still allows the touch to be cancelled — once Chrome/Brave treat
  // the gesture as a possible scroll, the library gives up and the page just
  // scrolls. So touch events are caught here in the capture phase, kept from
  // reaching the library, and translated into its drag primitives
  // (startUserTouch / userMove / userStop). Mouse dragging on a laptop is
  // still the library's own.
  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return

    interface Drag {
      x0: number; y0: number; t0: number
      mode: 'pending' | 'turn' | 'ignore'
      dir: 1 | -1             // 1 = forward (finger moving left)
      origin: { x: number; y: number }
      portrait: boolean
      lastX: number; lastT: number; vx: number
      pos: { x: number; y: number }
    }
    let drag: Drag | null = null
    let settling = 0

    const blockRect = () =>
      outerRef.current?.querySelector('.stf__block')?.getBoundingClientRect() ?? null

    const onStart = (e: TouchEvent) => {
      e.stopPropagation()
      const t = e.touches[0]
      const book = bookRef.current
      if (e.touches.length !== 1 || !t || !book || settling || book.getState() !== 'read'
        || (e.target as Element | null)?.closest?.(INTERACTIVE)) {
        drag = null
        return
      }
      drag = {
        x0: t.clientX, y0: t.clientY, t0: e.timeStamp, mode: 'pending', dir: 1,
        origin: { x: 0, y: 0 }, portrait: false, lastX: t.clientX, lastT: e.timeStamp, vx: 0, pos: { x: 0, y: 0 },
      }
    }

    const onMove = (e: TouchEvent) => {
      e.stopPropagation()
      const d = drag
      const book = bookRef.current
      const t = e.touches[0]
      if (!d || !book || !t || d.mode === 'ignore') return
      const dx = t.clientX - d.x0
      const dy = t.clientY - d.y0

      if (d.mode === 'pending') {
        if (Math.hypot(dx, dy) < 8) return
        // Mostly vertical, or the browser has already claimed it as a scroll.
        if (Math.abs(dx) < Math.abs(dy) * 1.2 || !e.cancelable) { d.mode = 'ignore'; return }
        const dir = dx < 0 ? 1 : -1
        const index = book.getCurrentPageIndex()
        const last = book.getPageCount() - (book.getOrientation() === 'landscape' ? 2 : 1)
        const b = blockRect()
        if (!b || (dir === 1 && index >= last) || (dir === -1 && index <= 0)) { d.mode = 'ignore'; return }
        const r = book.getRender().getRect()
        const portrait = book.getOrientation() === 'portrait'
        // Grab the page by an outer edge at the finger's height: the right edge
        // to turn forward; to turn back, the left edge of what's showing (on a
        // single page that's the spine of the library's two-page geometry, its
        // left half being hidden), so the previous page folds in from the left.
        const y = Math.min(r.top + r.height - 2, Math.max(r.top + 2, d.y0 - b.top))
        d.dir = dir
        d.portrait = portrait
        d.origin = { x: dir === 1 ? r.left + r.width - 2 : r.left + (portrait ? r.pageWidth : 0) + 2, y }
        d.pos = d.origin
        d.mode = 'turn'
        haptic('tick')
        book.startUserTouch(d.origin)
      }

      e.preventDefault()
      const now = e.timeStamp
      const v = (t.clientX - d.lastX) / Math.max(1, now - d.lastT)
      d.vx = d.vx * 0.3 + v * 0.7
      d.lastX = t.clientX
      d.lastT = now
      d.pos = { x: d.origin.x + dx, y: d.origin.y + dy * 0.4 }
      book.userMove(d.pos, true)
    }

    const onEnd = (e: TouchEvent) => {
      e.stopPropagation()
      const d = drag
      drag = null
      const book = bookRef.current
      if (!d || !book || d.mode !== 'turn') return
      const r = book.getRender().getRect()
      const t = e.changedTouches[0]
      const travelled = t ? (d.x0 - t.clientX) * d.dir : 0
      // A flick: fast at release, or a short, quick gesture overall.
      const avg = travelled / Math.max(1, e.timeStamp - d.t0)
      const flick = travelled > 16 && (-d.vx * d.dir > 0.25 || (avg > 0.3 && e.timeStamp - d.t0 < 300))
      const complete = e.type === 'touchend' && (travelled > r.pageWidth * 0.3 || flick)
      // The library finishes a turn on release once the corner is past the
      // spine, and returns the page otherwise. Glide the corner to the right
      // side of that line over a few frames (not one jump), then release.
      // A single page turning back starts on the spine already, so letting
      // go early has to carry it back into the hidden half to cancel.
      const spine = r.left + r.width / 2
      let target: { x: number; y: number } | null = null
      if (complete) target = { x: spine + r.pageWidth * 0.25 * -d.dir, y: d.pos.y }
      else if (d.dir === -1 && d.portrait) target = { x: spine - r.pageWidth * 0.25, y: d.pos.y }
      if (!target) { book.userStop(d.pos); return }
      const to = target
      const from = d.pos
      const steps = 6
      let i = 0
      const step = () => {
        i++
        const k = i / steps
        const p = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k }
        book.userMove(p, true)
        if (i < steps) { settling = requestAnimationFrame(step); return }
        settling = 0
        book.userStop(p)
      }
      settling = requestAnimationFrame(step)
    }

    const opts = { capture: true, passive: false } as const
    frame.addEventListener('touchstart', onStart, opts)
    frame.addEventListener('touchmove', onMove, opts)
    frame.addEventListener('touchend', onEnd, opts)
    frame.addEventListener('touchcancel', onEnd, opts)
    return () => {
      cancelAnimationFrame(settling)
      frame.removeEventListener('touchstart', onStart, opts)
      frame.removeEventListener('touchmove', onMove, opts)
      frame.removeEventListener('touchend', onEnd, opts)
      frame.removeEventListener('touchcancel', onEnd, opts)
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
