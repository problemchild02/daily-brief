// page-flip ships TypeScript source but no compiled .d.ts in dist — this declares
// only the surface FlipBook.tsx actually uses.
declare module 'page-flip/dist/js/page-flip.module.js' {
  export type FlipCorner = 'top' | 'bottom'

  export interface FlipSettings {
    startPage?: number
    size?: 'fixed' | 'stretch'
    width: number
    height: number
    minWidth?: number
    maxWidth?: number
    minHeight?: number
    maxHeight?: number
    drawShadow?: boolean
    flippingTime?: number
    usePortrait?: boolean
    startZIndex?: number
    autoSize?: boolean
    maxShadowOpacity?: number
    showCover?: boolean
    mobileScrollSupport?: boolean
    clickEventForward?: boolean
    useMouseEvents?: boolean
    swipeDistance?: number
    showPageCorners?: boolean
    disableFlipByClick?: boolean
  }

  export interface FlipEvent<T> {
    data: T
    object: PageFlip
  }

  export class PageFlip {
    constructor(element: HTMLElement, settings: FlipSettings)
    loadFromHTML(items: HTMLElement[]): void
    destroy(): void
    update(): void
    flipNext(corner?: FlipCorner): void
    flipPrev(corner?: FlipCorner): void
    flip(page: number, corner?: FlipCorner): void
    turnToPage(page: number): void
    getCurrentPageIndex(): number
    getPageCount(): number
    getOrientation(): 'portrait' | 'landscape'
    getState(): 'user_fold' | 'fold_corner' | 'flipping' | 'read'
    getSettings(): FlipSettings
    /** Book geometry in coordinates relative to the .stf__block element. The
        virtual book is always two pages wide; a single (portrait) page is its
        right half. */
    getRender(): { getRect(): { left: number; top: number; width: number; height: number; pageWidth: number } }
    /** The library's own drag primitives (what its mouse/touch handlers call),
        in .stf__block coordinates. */
    startUserTouch(pos: { x: number; y: number }): void
    userMove(pos: { x: number; y: number }, isTouch: boolean): void
    userStop(pos: { x: number; y: number }, isSwipe?: boolean): void
    on(event: 'flip', cb: (e: FlipEvent<number>) => void): PageFlip
    on(event: 'changeState', cb: (e: FlipEvent<string>) => void): PageFlip
    on(event: 'changeOrientation', cb: (e: FlipEvent<string>) => void): PageFlip
    on(event: 'init' | 'update', cb: (e: FlipEvent<unknown>) => void): PageFlip
  }
}
