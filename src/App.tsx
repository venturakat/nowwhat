import { useEffect, useState } from 'react'
import { useSt, useStore } from './store'
import { Icon, openSheet, registerSettings, useUi, type Tab } from './ui'
import { CalendarPage } from './calendar'
import { closeCal, openCal } from './calpage'
import { SettingsSheet } from './settings'
import { Today } from './screens/Today'
import { Money, SpendSheet, StartTimerSheet, stopTimer } from './screens/Money'
import { Supplies } from './screens/Supplies'
import { Home } from './screens/Home'
import { Closet } from './screens/Closet'
import { fmtClock } from './lib'
import { Splash } from './Splash'

registerSettings(() => <SettingsSheet />)

const TABS: [Tab, string, () => JSX.Element][] = [
  ['today', 'Today', Icon.today], ['money', 'Money', Icon.money], ['supplies', 'Supplies', Icon.supplies], ['home', 'Home', Icon.home], ['closet', 'Closet', Icon.closet]
]

const TimerFab = () => {
  const st = useSt()
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!st.timer) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [st.timer])
  if (st.timer) {
    const c = st.clients.find((x) => x.id === st.timer!.clientId)
    return (
      <button className="fab" style={{ background: 'var(--ink)', color: '#fff' }} onClick={() => useUi.getState().go('money', 'work')}>
        <span>● {c?.name} · {fmtClock(now - new Date(st.timer.startedAt).getTime())}</span>
        <span onClick={(e) => { e.stopPropagation(); stopTimer(st) }} style={{ background: 'var(--work)', color: 'var(--ink)', borderRadius: 100, padding: '4px 10px', fontSize: 14 }}>Stop</span>
      </button>
    )
  }
  return <button className="fab" onClick={() => openSheet(<StartTimerSheet />)}><Icon.play /> Start work timer</button>
}

// the field you're typing in, inside a sheet: scroll the sheet so it sits above the keyboard.
// A field with a fall-down list (.combo) goes near the top, so the list has room under it.
const keepInView = (smooth = true) => {
  const el = document.activeElement as HTMLElement | null
  const page = el?.closest<HTMLElement>('.sheet > .page.top')
  if (!el || !page || !el.matches('input, textarea')) return
  const box = (el.closest<HTMLElement>('.combo') ?? el).getBoundingClientRect()
  const view = page.getBoundingClientRect()
  const combo = !!el.closest('.combo')
  // the visible part of the screen, in the same coordinates as the boxes (the page may be panned up by the keyboard)
  const vv = window.visualViewport
  const bottom = Math.min(view.bottom, vv ? vv.offsetTop + vv.height : innerHeight) - 16
  let by = 0
  if (combo) by = box.top - (view.top + 12)
  else if (box.bottom > bottom) by = box.bottom - bottom
  else if (box.top < view.top + 8) by = box.top - view.top - 8
  if (Math.abs(by) > 2) page.scrollBy({ top: by, behavior: smooth ? 'smooth' : 'auto' })
}

// the part of the screen you can actually see — shrinks when the keyboard opens,
// so sheets sit right above the keyboard instead of behind it
const useVisibleArea = () => {
  const [v, setV] = useState<{ top: number; h: number } | null>(null)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const f = () => { setV({ top: vv.offsetTop, h: vv.height }); requestAnimationFrame(() => keepInView()) }
    f()
    // the keyboard takes a moment to come up: check again once it has
    const onFocus = (e: FocusEvent) => { if ((e.target as HTMLElement).closest?.('.sheet')) { setTimeout(() => keepInView(), 60); setTimeout(() => keepInView(), 400) } }
    vv.addEventListener('resize', f); vv.addEventListener('scroll', f)
    document.addEventListener('focusin', onFocus)
    // while typing, too: iOS shifts things as the text changes — put the field back above the keyboard
    const onType = (e: Event) => { if ((e.target as HTMLElement).closest?.('.sheet')) requestAnimationFrame(() => keepInView(false)) }
    document.addEventListener('input', onType)
    // tapping a chip or a colour in a sheet while typing keeps the keyboard up (no jump)
    const keep = (e: Event) => {
      const a = document.activeElement as HTMLElement | null
      if (a?.matches('input, textarea') && a.closest('.sheet') && (e.target as HTMLElement).closest?.('.sheet .chip, .sheet .swatch')) e.preventDefault()
    }
    document.addEventListener('mousedown', keep)
    document.addEventListener('pointerdown', keep)
    return () => { vv.removeEventListener('resize', f); vv.removeEventListener('scroll', f); document.removeEventListener('focusin', onFocus); document.removeEventListener('input', onType); document.removeEventListener('mousedown', keep); document.removeEventListener('pointerdown', keep) }
  }, [])
  return v
}

export const App = () => {
  const ready = useStore((s) => s.ready)
  const { tab, sheet, under, toast, go, close, cal } = useUi()
  const area = useVisibleArea()
  const [splash, setSplash] = useState(true) // the loading animation, once per app start
  return (
    <div className="app">
      {splash && <Splash onDone={() => setSplash(false)} />}
      {tab === 'today' && <Today />}
      {tab === 'money' && <Money />}
      {tab === 'supplies' && <Supplies />}
      {tab === 'home' && <Home />}
      {tab === 'closet' && <Closet />}
      {tab === 'today' && (
        <div className="fabs">
          <button className="fab money" onClick={() => openSheet(<SpendSheet />)}><Icon.plus /> Log spending</button>
          <TimerFab />
        </div>
      )}
      {/* the calendar page, waiting to the left of Today; a little tab on the edge shows it's there */}
      <div className={'calpage' + (cal ? ' open' : '')} aria-hidden={!cal}>
        <div className="calscroll"><CalendarPage /></div>
        <button className="cal-tab back" aria-label="Back to Today" onClick={closeCal}><Icon.today /></button>
      </div>
      {tab === 'today' && !cal && <button className="cal-tab open" aria-label="Calendar" onClick={openCal}><Icon.calendar /></button>}
      <nav className="tabbar">
        {TABS.map(([k, label, I]) => (
          <button key={k} className={'tab' + (tab === k ? ' on' : '')} onClick={() => go(k)}>
            <I />
            {label}
          </button>
        ))}
      </nav>
      {sheet && (
        <div className="scrim" onClick={close} style={area ? { top: area.top, bottom: 'auto', height: area.h } : undefined}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} style={area ? { maxHeight: area.h - 24 } : undefined}>
            {/* pages stay mounted underneath (same key), so going back finds them as you left them */}
            {/* one list, so a page keeps its state when something is opened on top of it and closed again */}
            {[...under, sheet].map((n, i) => i < under.length
              ? <div key={i} className={'page under' + (i === under.length - 1 ? ' below' : '')} aria-hidden>{n}</div>
              : <div key={i} className={'page top' + (under.length ? ' pushed' : '')}>{n}</div>)}
          </div>
        </div>
      )}
      {/* the sheet's background carries on behind the keyboard, so the page underneath doesn't show through it */}
      {sheet && area && <div className="kb-fill" style={{ top: area.top + area.h }} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
