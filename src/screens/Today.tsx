import type { ReactNode } from 'react'
import { dismissToday, update, useSt } from '../store'
import type { State } from '../types'
import { addDays, creditStatus, diffDays, fmt, fmtCur, fmtDay, fmtEur, fmtHours, fmtWeekday, hours, monthName, sessionPln, fmtSum, nextBuy, periodOf, prevMonth, sessionEur, shiftPeriod, summarize, supplyStatus, taxFor, today, monthKey } from '../lib'
import { C, Chips, Icon, openSettings, openSheet, Row, toast, useUi } from '../ui'
import { SpendSheet } from './Money'
import { currentClean, MODE_NAME, progress } from '../cleaning'

interface Thing { id: string; dot: string; title: string; meta: string; trail?: ReactNode; go: () => void }

const things = (st: State): Thing[] => {
  const t = today()
  const go = useUi.getState().go
  const out: Thing[] = []
  // supplies running out (soonest first)
  const sup = st.supplies.map((s) => ({ s, ...supplyStatus(s, st.settings) })).filter((x) => x.state !== 'ok').sort((a, b) => a.daysLeft - b.daysLeft)
  for (const { s, daysLeft } of sup.filter((x) => x.daysLeft <= 2))
    out.push({ id: 'sup-' + s.id, dot: daysLeft <= 0 ? C.alert : C.warn, title: `Buy ${s.name}`, meta: `${daysLeft <= 0 ? 'Ran out' : daysLeft === 1 ? 'Runs out tomorrow' : 'Runs out in 2 days'} · ${fmt(s.pricePerUnit * s.buyQty)}`, trail: '→', go: () => go('supplies', s.cat) })
  // taxes due within 5 days
  const pm = prevMonth(monthKey(t))
  const tx = taxFor(st, pm)
  const pay = `${monthKey(t)}-${String(st.settings.taxPayDay ?? st.settings.taxDueDay).padStart(2, '0')}`
  const deadline = `${monthKey(t)}-${String(st.settings.taxDueDay).padStart(2, '0')}`
  const dd = diffDays(t, pay)
  if (!tx.paid && tx.total > 0 && dd <= 2 && t <= deadline)
    out.push({ id: 'tax-' + pm, dot: C.money, title: 'Pay ZUS + PIT', meta: `For ${monthName(pm, true)} · ${dd > 0 ? (dd === 1 ? 'tomorrow' : `in ${dd} days`) : dd === 0 ? 'today' : `deadline ${fmtDay(deadline)}`}`, trail: fmt(tx.total), go: () => go('money', 'taxes') })
  else if (!tx.paid && tx.total > 0 && t > deadline && diffDays(deadline, t) <= 10)
    out.push({ id: 'tax-' + pm, dot: C.alert, title: 'Pay ZUS + PIT', meta: `For ${monthName(pm, true)} · late!`, trail: fmt(tx.total), go: () => go('money', 'taxes') })
  // credit payments due today / tomorrow
  for (const c of st.credits ?? []) {
    const n = creditStatus(c).next
    if (!n) continue
    const dd = diffDays(t, n.date)
    if (dd >= 0 && dd <= 1) out.push({ id: `credit-${c.id}-${n.date}`, dot: C.money, title: `Credit payment · ${c.name}`, meta: `${dd === 0 ? 'Due today' : 'Due tomorrow'} · payment ${n.n} of ${c.count}`, trail: fmtCur(n.amount, c.currency), go: () => go('money', 'credits') })
  }
  // clients
  for (const c of st.clients.filter((c) => !c.archived)) {
    const ss = st.sessions.filter((s) => s.clientId === c.id)
    const unInv = ss.filter((s) => !s.invoiced)
    const unpaid = ss.filter((s) => s.invoiced && !s.paid)
    if (unInv.length) {
      const h = unInv.reduce((a, s) => a + hours(s), 0)
      out.push({ id: 'inv-' + c.id, dot: C.work, title: `Invoice ${c.name}`, meta: (c.kind ?? "hourly") === "hourly" ? `${fmtHours(h)} not invoiced yet` : `${unInv.length} ${unInv.length === 1 ? "payment" : "payments"} not invoiced yet`, trail: fmtSum(st, unInv), go: () => go('money', 'work') })
    } else if (unpaid.length) {
      const since = unpaid.map((s) => s.start.slice(0, 10)).sort()[0]
      out.push({ id: 'paid-' + c.id, dot: C.work, title: `${c.name} paid yet?`, meta: `Invoiced · waiting since ${fmtDay(since)}`, trail: fmt(unpaid.reduce((a, s) => a + sessionPln(st, s), 0)), go: () => go('money', 'work') })
    }
  }
  // cleaning
  // cleaning: shows on its day (and stays until done, up to the next one), always first
  const cl = currentClean(st)
  if (cl?.due) {
    const pr = progress(st, cl.occ)
    const left = pr.tasks.length - pr.done.length
    const day = cl.occ.date === t ? 'Today' : `Since ${fmtWeekday(cl.occ.date)}`
    out.unshift({ id: 'clean-' + cl.occ.key, dot: C.home, title: `${MODE_NAME[cl.occ.mode]} clean`, meta: `${day} · ${left} of ${pr.tasks.length} steps left`, trail: '→', go: () => go('home', 'cleaning') })
  }
  // supplies soon (not urgent)
  const soon = sup.filter((x) => x.daysLeft > 2)
  if (soon.length) out.push({ id: 'run-' + nextBuy(soon[0].s, st.settings), dot: C.supplies, title: `Shopping run · ${soon.length} ${soon.length === 1 ? 'thing' : 'things'}`, meta: `${soon.map((x) => x.s.name).slice(0, 3).join(', ')}${soon.length > 3 ? '…' : ''} · by ${fmtDay(soon[0].s.enoughUntil)}`, trail: '→', go: () => go('supplies', soon[0].s.cat) })
  // closet: saved thing ready to decide
  const ready = st.saved.find((s) => diffDays(s.savedAt, t) >= 7)
  if (ready) out.push({ id: 'saved-' + ready.id, dot: C.closet, title: `Still want ${ready.name}?`, meta: 'Waited a week · buy or let go', trail: fmt(ready.price), go: () => go('closet', 'buy') })
  const dis = st.dismissed.date === t ? st.dismissed.ids : []
  return out.filter((x) => !dis.includes(x.id))
}

export const Today = () => {
  const st = useSt()
  const t = today()
  const s = summarize(st, periodOf(t, st.settings).key)
  const list = things(st)
  const top = list.slice(0, 3)
  const nextP = summarize(st, shiftPeriod(s.info.key, 1))
  const nextIncome = nextP.items.filter((i) => i.kind === 'income').sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))[0]
  const pm = prevMonth(monthKey(t))
  const tx = taxFor(st, pm)
  const due = `${monthKey(t)}-${String(st.settings.taxPayDay ?? st.settings.taxDueDay).padStart(2, '0')}`
  return (
    <div className="screen withfab">
      <div className="between" style={{ alignItems: 'baseline' }}>
        <h1 className="h1" style={{ margin: 0 }}>now what?</h1>
        <button className="row t15 w5 muted" onClick={() => openSettings()} style={{ gap: 6 }}>{fmtWeekday(t)} <Icon.gear /></button>
      </div>
      {Object.keys(st.periods).length === 0 && st.clients.length === 0 && st.supplies.length === 0 && (
        <button className="card money" style={{ gap: 6 }} onClick={() => openSettings()}>
          <span className="t17">Fresh start</span>
          <span className="t15">Have a backup file? Open Settings → Restore from backup. Or just start adding money in, clients and supplies.</span>
        </button>
      )}
      <button className="card dark" style={{ gap: 6, paddingTop: 22, paddingBottom: 22 }} onClick={() => useUi.getState().go('money', 'budget')}>
        <span className="t15 w5">You can spend today</span>
        <span className="big" style={{ fontSize: 72, color: s.perDay < 0 ? 'var(--alert)' : undefined }}>{fmt(Math.max(s.perDay, s.perDay < 0 ? s.perDay : 0))}</span>
        <span className="t15">
          {s.daysLeft <= 1
            ? `Last day of this half${nextIncome ? ` · ${nextIncome.label.toLowerCase()} lands ${nextIncome.date === shiftDay(t) ? 'tomorrow' : fmtDay(nextIncome.date ?? nextP.info.start)}` : ''}`
            : `${fmt(s.left)} left for ${s.daysLeft} days · ${s.perDay >= 0 ? 'on track' : 'over — go easy'}`}
        </span>
      </button>
      <div className="list" style={{ paddingTop: 12, paddingBottom: 8 }}>
        <div className="list-h" style={{ paddingBottom: 4 }}>
          <span className="t17">{top.length ? `Now, just ${top.length === 1 ? 'this' : top.length === 2 ? 'these 2' : 'these 3'}` : 'Nothing urgent'}</span>
          {list.length > 3 && <span className="t14 w5 muted">{list.length - 3} more later</span>}
        </div>
        {top.length === 0 && <div className="list-empty">You’re free. Rest counts too.</div>}
        {top.map((x) => (
          <div key={x.id} className="row" style={{ paddingRight: 8 }}>
            <div className="grow"><Row dot={x.dot} title={x.title} meta={x.meta} trail={x.trail} onClick={x.go} /></div>
            <button aria-label="Not today" title="Not today" onClick={() => { dismissToday(x.id); toast('Moved off today') }} style={{ padding: 6, color: 'var(--ink2)' }}><Icon.x /></button>
          </div>
        ))}
      </div>
      <button className="btn full soft" onClick={() => openSheet(<SpendSheet />)}>+ Log spending</button>
      {tx.total > 0 && !tx.paid && diffDays(t, due) > 5 && (
        <div className="t14 muted" style={{ padding: '0 4px' }}>Coming up: ZUS + PIT on {fmtDay(due)} · {fmt(tx.total)} · already in your budget</div>
      )}
    </div>
  )
}
const shiftDay = (d: string) => addDays(d, 1)

