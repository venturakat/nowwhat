import { useEffect, useState } from 'react'
import { useSt, useStore } from './store'
import { Icon, openSheet, useUi, type Tab } from './ui'
import { Today } from './screens/Today'
import { Money, StartTimerSheet, stopTimer } from './screens/Money'
import { Supplies } from './screens/Supplies'
import { Home } from './screens/Home'
import { Closet } from './screens/Closet'
import { fmtClock } from './lib'

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

export const App = () => {
  const ready = useStore((s) => s.ready)
  const { tab, sheet, toast, go, close } = useUi()
  if (!ready) return null
  return (
    <div className="app">
      {tab === 'today' && <Today />}
      {tab === 'money' && <Money />}
      {tab === 'supplies' && <Supplies />}
      {tab === 'home' && <Home />}
      {tab === 'closet' && <Closet />}
      {tab === 'today' && <TimerFab />}
      <nav className="tabbar">
        {TABS.map(([k, label, I]) => (
          <button key={k} className={'tab' + (tab === k ? ' on' : '')} onClick={() => go(k)}>
            <I />
            {label}
          </button>
        ))}
      </nav>
      {sheet && (
        <div className="scrim" onClick={close}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>{sheet}</div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
