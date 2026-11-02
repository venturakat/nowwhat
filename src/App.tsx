import { useEffect, useState } from 'react'
import { useSt, useStore } from './store'
import { Icon, openSheet, registerSettings, useUi, type Tab } from './ui'
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

// the part of the screen you can actually see — shrinks when the keyboard opens,
// so sheets sit right above the keyboard instead of behind it
const useVisibleArea = () => {
  const [v, setV] = useState<{ top: number; h: number } | null>(null)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const f = () => setV({ top: vv.offsetTop, h: vv.height })
    f()
    vv.addEventListener('resize', f); vv.addEventListener('scroll', f)
    return () => { vv.removeEventListener('resize', f); vv.removeEventListener('scroll', f) }
  }, [])
  return v
}

export const App = () => {
  const ready = useStore((s) => s.ready)
  const { tab, sheet, under, toast, go, close } = useUi()
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
            {under.map((n, i) => <div key={i} className={'page under' + (i === under.length - 1 ? ' below' : '')} aria-hidden>{n}</div>)}
            <div key={under.length} className={'page top' + (under.length ? ' pushed' : '')}>{sheet}</div>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
