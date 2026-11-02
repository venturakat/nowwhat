import { flushSync } from 'react-dom'
import { canSwipe, swipeSub, useUi } from './ui'

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

export const startSwipe = () => {
  let s: { x: number; y: number; t: number; lock?: 'h' | 'v'; els: HTMLElement[]; dx: number } | null = null
  document.addEventListener('touchstart', (e) => {
    const el = e.target as HTMLElement
    s = null
    if (useUi.getState().sheet || e.touches.length > 1 || el.closest('.chips, input, textarea, select, .noswipe, .tabbar, .fabs') || !el.closest('.app')) return
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
    if (!canSwipe(dir) || !(Math.abs(g.dx) > w * 0.25 || (speed > 0.35 && Math.abs(g.dx) > 30))) {
      set(g.els, 0, 1, 'transform .28s cubic-bezier(.2,.9,.3,1.2), opacity .2s') // spring back
      return
    }
    set(g.els, -dir * w, 0, 'transform .16s ease-in, opacity .16s ease-in')
    setTimeout(() => {
      set(g.els, 0, 1)
      flushSync(() => swipeSub(dir))
      window.scrollTo({ top: 0 })
      const next = content()
      set(next, dir * w * 0.35, 0)
      requestAnimationFrame(() => requestAnimationFrame(() => set(next, 0, 1, 'transform .3s cubic-bezier(.2,.8,.2,1), opacity .25s ease-out')))
      setTimeout(() => set(next, 0, 1, ''), 360)
    }, 150)
  }
  document.addEventListener('touchend', end)
  document.addEventListener('touchcancel', end)
}
