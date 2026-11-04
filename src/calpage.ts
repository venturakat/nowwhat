import { flushSync } from 'react-dom'
import { useUi } from './ui'

// The calendar page lives to the left of Today: swipe right on Today (or pull the little tab on the
// left edge) and it follows the finger in; swipe left on it to put it away.
const page = () => document.querySelector<HTMLElement>('.calpage')
const EASE = 'transform .26s cubic-bezier(.2,.8,.2,1)'
const put = (x: number, how = 'none') => { const el = page(); if (!el) return; el.style.transition = how; el.style.transform = `translateX(${x}px)`; el.style.visibility = 'visible' }
const clear = () => { const el = page(); if (el) { el.style.transition = ''; el.style.transform = ''; el.style.visibility = '' } }
const settle = (open: boolean, x: number) => {
  put(x, EASE)
  setTimeout(() => { flushSync(() => useUi.getState().setCal(open)); clear() }, 260)
}
// dx: how far the finger moved right (opening) or left (closing, negative)
export const calOpenDrag = (dx: number) => put(Math.min(0, -innerWidth + Math.max(0, dx)))
export const calOpenEnd = (dx: number, ms: number) => {
  const go = dx > innerWidth * 0.3 || (dx / Math.max(1, ms) > 0.35 && dx > 30)
  settle(go, go ? 0 : -innerWidth)
}
export const calCloseDrag = (dx: number) => put(Math.min(0, dx))
export const calCloseEnd = (dx: number, ms: number) => {
  const go = -dx > innerWidth * 0.3 || (-dx / Math.max(1, ms) > 0.35 && dx < -30)
  settle(!go, go ? -innerWidth : 0)
}
export const openCal = () => { put(-innerWidth); requestAnimationFrame(() => requestAnimationFrame(() => settle(true, 0))) }
export const closeCal = () => settle(false, -innerWidth)
