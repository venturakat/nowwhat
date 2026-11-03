import { flushSync } from 'react-dom'
import { canSwipe, closeSheet, popSheet, swipeSub, UNDER_SHIFT, useUi } from './ui'

// Sideways swipe between sub-tabs: the content follows your finger, then slides away
// and the next tab slides in. At the first/last tab it only stretches a little and springs back.
const content = () => {
  const screen = document.querySelector<HTMLElement>('.app .screen')
  if (!screen) return []
  const kids = [...screen.children] as HTMLElement[]
  const i = kids.findIndex((k) => k.classList.contains('chips'))
  return i < 0 ? [] : kids.slice(i + 1) // header and tab chips stay put
}
const set = (els: HTMLElement[], x: number, o: number, tr = 'none') => {
  for (const el of els) { el.style.transition = tr; el.style.transform = x ? `translateX(${x}px)` : ''; el.style.opacity = o === 1 ? '' : String(o) }
}

// is the finger on something that scrolls sideways by itself (a row of outfit pieces, chips…)? then leave it alone
const inSideScroll = (el: HTMLElement | null) => {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (n.scrollWidth > n.clientWidth + 1) { const ox = getComputedStyle(n).overflowX; if (ox === 'auto' || ox === 'scroll') return true }
  }
  return false
}

export const startSwipe = () => {
  let s: { x: number; y: number; t: number; lock?: 'h' | 'v'; els: HTMLElement[]; dx: number } | null = null
  document.addEventListener('touchstart', (e) => {
    const el = e.target as HTMLElement
    s = null
    if (useUi.getState().sheet || e.touches.length > 1 || el.closest('.chips, input, textarea, select, .noswipe, .tabbar, .fabs') || !el.closest('.app') || inSideScroll(el)) return
    s = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now(), els: [], dx: 0 }
  }, { passive: true })
  document.addEventListener('touchmove', (e) => {
    if (!s) return
    const dx = e.touches[0].clientX - s.x, dy = e.touches[0].clientY - s.y
    if (!s.lock) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      s.lock = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'h' : 'v'
      if (s.lock === 'h') s.els = content()
    }
    if (s.lock !== 'h') return
    e.preventDefault() // no page scrolling while swiping sideways
    s.dx = dx
    const can = canSwipe(dx < 0 ? 1 : -1)
    set(s.els, can ? dx : dx * 0.22, can ? 1 - Math.min(0.4, Math.abs(dx) / 800) : 1)
  }, { passive: false })
  const end = () => {
    const g = s; s = null
    if (!g || g.lock !== 'h') return
    const dir: 1 | -1 = g.dx < 0 ? 1 : -1
    const w = window.innerWidth
    const speed = Math.abs(g.dx) / Math.max(1, Date.now() - g.t)
    if (!canSwipe(dir) || !(Math.abs(g.dx) > w * 0.2 || (speed > 0.35 && Math.abs(g.dx) > 30))) {
      set(g.els, 0, 1, 'transform .22s cubic-bezier(.2,.9,.3,1.2), opacity .16s') // spring back
      return
    }
    set(g.els, -dir * w, 0, 'transform .11s ease-in, opacity .11s ease-in')
    setTimeout(() => {
      set(g.els, 0, 1)
      flushSync(() => swipeSub(dir))
      window.scrollTo({ top: 0 })
      const next = content()
      set(next, dir * w * 0.35, 0)
      requestAnimationFrame(() => requestAnimationFrame(() => set(next, 0, 1, 'transform .22s cubic-bezier(.2,.8,.2,1), opacity .18s ease-out')))
      setTimeout(() => set(next, 0, 1, ''), 270)
    }, 100)
  }
  document.addEventListener('touchend', end)
  document.addEventListener('touchcancel', end)
}

// Inside a sheet: pull down (from the top of its content) to close it, and on a page
// that was opened on top of another one, swipe right to drag it away and uncover the one below.
export const startSheetSwipe = () => {
  type G = { x: number; y: number; t: number; lock?: 'h' | 'v' | 'none'; sheet: HTMLElement; top: HTMLElement; below: HTMLElement | null; dx: number; dy: number }
  let g: G | null = null
  const tr = (el: HTMLElement | null, t: string, how = 'none') => { if (!el) return; el.style.transition = how; el.style.transform = t }
  const spring = 'transform .24s cubic-bezier(.2,.8,.2,1)'
  document.addEventListener('touchstart', (e) => {
    g = null
    const t = e.target as HTMLElement
    const sheet = t.closest<HTMLElement>('.sheet')
    const top = sheet?.querySelector<HTMLElement>(':scope > .page.top')
    // a field you're typing in keeps its own touches; an untouched field can still be swiped across
    const field = t.closest('input, textarea, select')
    if (!sheet || !top || e.touches.length > 1 || t.closest('.noswipe') || (field && field === document.activeElement) || inSideScroll(t)) return
    g = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now(), sheet, top, below: sheet.querySelector<HTMLElement>(':scope > .page.below'), dx: 0, dy: 0 }
  }, { passive: true })
  document.addEventListener('touchmove', (e) => {
    if (!g) return
    const dx = e.touches[0].clientX - g.x, dy = e.touches[0].clientY - g.y
    if (!g.lock) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      if (g.below && dx > 0 && Math.abs(dx) > Math.abs(dy) * 1.2) g.lock = 'h'
      else if (dy > 0 && Math.abs(dy) > Math.abs(dx) && g.top.scrollTop <= 0) g.lock = 'v'
      else g.lock = 'none'
    }
    if (g.lock === 'none') return
    e.preventDefault()
    g.dx = dx; g.dy = dy
    if (g.lock === 'h') {
      const w = g.top.offsetWidth, x = Math.max(0, dx)
      tr(g.top, `translateX(${x}px)`)
      tr(g.below, `translateX(${-UNDER_SHIFT * w * (1 - x / w)}px)`) // the page below follows, like on iOS
    } else tr(g.sheet, `translateY(${Math.max(0, dy)}px)`)
  }, { passive: false })
  const end = () => {
    const s = g; g = null
    if (!s || !s.lock || s.lock === 'none') return
    const ms = Math.max(1, Date.now() - s.t)
    if (s.lock === 'h') {
      const w = s.top.offsetWidth
      if (s.dx > w * 0.3 || (s.dx / ms > 0.35 && s.dx > 30)) {
        tr(s.top, `translateX(${w}px)`, spring)
        tr(s.below, 'translateX(0)', spring)
        setTimeout(() => {
          const below = s.below
          tr(below, 'translateX(0)')
          flushSync(() => popSheet(false))
          requestAnimationFrame(() => { if (below) { below.style.transform = ''; below.style.transition = '' } })
        }, 240)
      } else {
        tr(s.top, '', spring)
        tr(s.below, '', spring)
        setTimeout(() => { if (s.below) s.below.style.transition = '' }, 260)
      }
    } else {
      if (s.dy > 110 || (s.dy / ms > 0.5 && s.dy > 40)) {
        tr(s.sheet, 'translateY(100%)', 'transform .18s ease-in')
        setTimeout(() => { closeSheet(); tr(s.sheet, '') }, 170)
      } else tr(s.sheet, '', 'transform .22s cubic-bezier(.2,.9,.3,1.2)')
    }
  }
  document.addEventListener('touchend', end)
  document.addEventListener('touchcancel', end)
}
