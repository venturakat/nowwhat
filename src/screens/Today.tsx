import { useState, type ReactNode } from 'react'
import { dismissToday, update, useSt } from '../store'
import type { State } from '../types'
import { addDays, timeSpan, creditStatus, classBatch, classPayIn, fmtPay, diffDays, fmt, fmtCur, fmtDay, fmtEur, fmtHours, fmtWeekday, hours, monthName, sessionPln, fmtSum, nextBuy, periodOf, prevMonth, sessionEur, shiftPeriod, recipeStatus, summarize, supplyStatus, taxFor, today, monthKey, uid } from '../lib'
import { Logo } from '../logo'
import { C, Check, Chips, closeSheet, Header, Icon, openSettings, openSheet, Row, Sheet, toast, useUi } from '../ui'
import { SpendSheet } from './Money'
import { RecipeSheet } from './Recipes'
import { ShipmentLog } from './Shipments'
import { currentClean, MODE_NAME, progress } from '../cleaning'

interface Thing { id: string; dot: string; title: string; meta: string; trail?: ReactNode; go: () => void }

const things = (st: State): Thing[] => {
  const t = today()
  const go = useUi.getState().go
  const out: Thing[] = []
  // supplies running out (soonest first)
  // (one-time buys are grouped with the projects' shopping below)
  const sup = st.supplies.filter((s) => !s.once && !s.paused).map((s) => ({ s, ...supplyStatus(s, st.settings) })).filter((x) => x.state !== 'ok').sort((a, b) => a.daysLeft - b.daysLeft)
  // meds come before everything else, as soon as it's time to buy them
  const meds: Thing[] = sup.filter((x) => x.s.cat === 'meds').map(({ s, daysLeft }) => ({ id: 'sup-' + s.id, dot: daysLeft <= 2 ? C.alert : C.warn, title: `Buy ${s.name}`, meta: `${daysLeft <= 0 ? 'Ran out' : daysLeft === 1 ? 'Runs out tomorrow' : `Runs out in ${daysLeft} days`} · ${fmt(s.pricePerUnit * s.buyQty)}`, trail: '→', go: () => go('supplies', 'meds') }))
  for (const { s, daysLeft } of sup.filter((x) => x.daysLeft <= 2 && x.s.cat !== 'meds'))
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
  // clients: invoicing first (it's what gets the money moving), "paid yet?" checks go last
  const paidChecks: Thing[] = []
  for (const c of st.clients.filter((c) => !c.archived)) {
    const ss = st.sessions.filter((s) => s.clientId === c.id)
    // a monthly fee only needs invoicing once its day has come
    const unInv = ss.filter((s) => !s.invoiced && !s.paid && (!s.feeMonth || s.start.slice(0, 10) <= t))
    const unpaid = ss.filter((s) => s.invoiced && !s.paid)
    if (unInv.length) {
      const h = unInv.reduce((a, s) => a + hours(s), 0)
      const jobs = unInv.filter((s) => s.fee !== undefined)
      out.push({ id: 'inv-' + c.id, dot: C.work, title: `Invoice ${c.name}`,
        meta: (c.kind ?? 'hourly') === 'hourly' ? `${fmtHours(h)} not invoiced yet` : `${jobs.map((s) => s.task).filter(Boolean).slice(0, 2).join(', ') || `${jobs.length} ${jobs.length === 1 ? 'payment' : 'payments'}`}${jobs.length > 2 ? '…' : ''} · not invoiced yet`,
        trail: fmtSum(st, unInv), go: () => go('money', 'work') })
    }
    if (unpaid.length) {
      const since = unpaid.map((s) => s.invoiceDate ?? s.start.slice(0, 10)).sort()[0]
      paidChecks.push({ id: 'paid-' + c.id, dot: C.work, title: `${c.name} paid yet?`, meta: `Invoiced · waiting since ${fmtDay(since)}`, trail: fmt(unpaid.reduce((a, s) => a + sessionPln(st, s), 0)), go: () => go('money', 'work') })
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
  const soon = sup.filter((x) => x.daysLeft > 2 && x.s.cat !== 'meds')
  if (soon.length) out.push({ id: 'run-' + nextBuy(soon[0].s, st.settings), dot: C.supplies, title: `Shopping run · ${soon.length} ${soon.length === 1 ? 'thing' : 'things'}`, meta: `${soon.map((x) => x.s.name).slice(0, 3).join(', ')}${soon.length > 3 ? '…' : ''} · by ${fmtDay(soon[0].s.enoughUntil)}`, trail: '→', go: () => go('supplies', soon[0].s.cat) })
  // one-off things to buy: one-time supplies (projects' "need to buy" items are among them)
  const onceBuys = st.supplies.filter((s) => s.once && !s.paused)
  const names = onceBuys.map((s) => s.name)
  if (names.length) {
    const sum = onceBuys.reduce((a, s) => a + s.pricePerUnit * s.buyQty, 0)
    out.push({ id: 'tobuy-' + names.length, dot: C.home, title: `To buy · ${names.length} ${names.length === 1 ? 'thing' : 'things'}`, meta: `${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}`, trail: sum > 0 ? fmt(sum) : '→', go: () => go('supplies', onceBuys[0]?.cat ?? 'home') })
  }
  // classes: from 3 days before the payment day
  for (const c of st.classes ?? []) {
    const lb = classBatch(st, c)
    if (lb && t >= addDays(lb.due, -3))
      out.push({ id: `lessons-${c.id}-${lb.due}`, dot: C.money, title: `Pay for ${c.name}`, meta: [`${lb.dates.length} ${lb.dates.length === 1 ? 'class' : 'classes'}`, lb.paid !== undefined && classPayIn(c) !== 'PLN' ? fmtPay(lb.paid, classPayIn(c)) : '', `${lb.due < t ? 'since' : 'by'} ${fmtDay(lb.due)}`].filter(Boolean).join(' · '), trail: fmt(lb.pln), go: () => go('money', 'classes') })
  }
  // selfcare: from the day before until a week overdue
  for (const x of (st.selfcare ?? []).filter((x) => !x.paused)) {
    const n = diffDays(t, x.next)
    if (n <= 1 && n >= -7) out.push({ id: `care-${x.id}-${x.next}`, dot: C.closet, title: x.name, meta: `Selfcare · ${n < 0 ? `${-n} ${n === -1 ? 'day' : 'days'} overdue` : n === 0 ? 'today' : 'tomorrow'}${x.time && n >= 0 ? ` at ${timeSpan(x.time, x.endTime)}` : ''}`, trail: fmtCur(x.price, x.currency ?? 'PLN'), go: () => go('money', 'selfcare') })
  }
  out.push(...paidChecks)
  out.unshift(...meds)
  const dis = st.dismissed.date === t ? st.dismissed.ids : []
  return out.filter((x) => !dis.includes(x.id))
}

export const Today = () => {
  const st = useSt()
  const t = today()
  const s = summarize(st, periodOf(t, st.settings).key)
  const list = things(st)
  const top = list
  const nextP = summarize(st, shiftPeriod(s.info.key, 1))
  const nextIncome = nextP.items.filter((i) => i.kind === 'income').sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))[0]
  const pm = prevMonth(monthKey(t))
  const tx = taxFor(st, pm)
  const due = `${monthKey(t)}-${String(st.settings.taxPayDay ?? st.settings.taxDueDay).padStart(2, '0')}`
  return (
    <div className="screen withfab">
      <Header sub={fmtWeekday(t)} title={<Logo />} />
      {Object.keys(st.periods).length === 0 && st.clients.length === 0 && st.supplies.length === 0 && (
        <button className="card money" style={{ gap: 6 }} onClick={() => openSettings()}>
          <span className="t17">Fresh start</span>
          <span className="t15">Have a backup file? Open Settings → Backup → Restore from backup. Or just start adding money in, clients and supplies.</span>
        </button>
      )}
      <button className="card dark" style={{ gap: 6, paddingTop: 22, paddingBottom: 22 }} onClick={() => useUi.getState().go('money', 'budget')}>
        <span className="t15 w5">You can spend today</span>
        <span className="big" style={{ fontSize: 72, color: s.perDay < 0 ? 'var(--alert)' : undefined }}>{fmt(Math.max(s.perDay, s.perDay < 0 ? s.perDay : 0))}</span>
        <span className="t15">
          {s.daysLeft <= 1
            ? `Last day of this fortnight${nextIncome ? ` · ${nextIncome.label.toLowerCase()} lands ${nextIncome.date === shiftDay(t) ? 'tomorrow' : fmtDay(nextIncome.date ?? nextP.info.start)}` : ''}`
            : `${fmt(s.left)} left for ${s.daysLeft} days · ${s.perDay >= 0 ? 'on track' : 'over — go easy'}`}
        </span>
      </button>
      <div className="list" style={{ paddingTop: 12, paddingBottom: 8 }}>
        <div className="list-h" style={{ paddingBottom: 4 }}>
          <span className="t17">Reminders</span>
        </div>
        {top.length === 0 && <div className="list-empty">Nothing urgent. Rest counts too.</div>}
        {top.map((x) => (
          <div key={x.id} className="row" style={{ paddingRight: 8 }}>
            <div className="grow"><Row dot={x.dot} title={x.title} meta={x.meta} trail={x.trail} onClick={x.go} /></div>
            <button aria-label="Not today" title="Not today" onClick={() => { dismissToday(x.id); toast('Moved off today') }} style={{ padding: 6, color: 'var(--ink2)' }}><Icon.x /></button>
          </div>
        ))}
      </div>
      <OtherTasks />
      <CookToday />
      <ShipmentLog />
      <BrainDump />
      {tx.total > 0 && !tx.paid && diffDays(t, due) > 5 && (
        <div className="t14 muted" style={{ padding: '0 4px' }}>Coming up: ZUS + PIT on {fmtDay(due)} · {fmt(tx.total)} · already in your budget</div>
      )}
    </div>
  )
}
const shiftDay = (d: string) => addDays(d, 1)


// ---------- other tasks: a plain checklist with my own colour dots ----------
const TASK_COLORS: [string, string][] = [['money', C.money], ['work', C.work], ['supplies', C.supplies], ['closet', C.closet], ['home', C.home], ['alert', C.alert]]
const dotOf = (c: string) => TASK_COLORS.find((x) => x[0] === c)?.[1] ?? C.line

const OtherTasks = () => {
  const st = useSt()
  const t = today()
  const tasks = (st.tasks ?? []).filter((x) => !x.doneAt || x.doneAt >= t)
  const open = tasks.filter((x) => !x.doneAt)
  const done = tasks.filter((x) => x.doneAt)
  const toggle = (id: string) => update((d) => { const x = d.tasks?.find((y) => y.id === id); if (x) x.doneAt = x.doneAt ? undefined : today() })
  return (
    <div className="list">
      <div className="list-h"><span className="t17">Parking lot</span></div>
      {[...open, ...done].map((x) => (
        <Row key={x.id} done={!!x.doneAt} title={x.text} dot={dotOf(x.color)}
          trail={<span onClick={(e) => { e.stopPropagation(); toggle(x.id) }} style={{ display: 'flex', padding: 4, margin: -4 }}><Check on={!!x.doneAt} /></span>}
          onClick={() => openSheet(<TaskSheet id={x.id} />)} />
      ))}
      <Row title={<span className="muted">+ Add a task</span>} onClick={() => openSheet(<TaskSheet />)} />
    </div>
  )
}

const TaskSheet = ({ id }: { id?: string }) => {
  const st = useSt()
  const x = st.tasks?.find((y) => y.id === id)
  const [text, setText] = useState(x?.text ?? '')
  const [color, setColor] = useState(x?.color ?? 'money')
  const save = () => {
    if (!text.trim()) return
    update((d) => {
      d.tasks ??= []
      const y = d.tasks.find((z) => z.id === id)
      if (y) Object.assign(y, { text: text.trim(), color })
      else d.tasks.push({ id: uid(), text: text.trim(), color })
    })
    closeSheet()
  }
  return (
    <Sheet title={x ? 'Task' : 'New task'}>
      <input className="input" autoFocus value={text} placeholder="What needs doing" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save() }} />
      <div className="row" style={{ gap: 10 }}>
        {TASK_COLORS.map(([k, c]) => (
          <button key={k} aria-label={k} className="swatch" onClick={() => setColor(k)} style={{ width: 34, height: 34, borderRadius: '50%', background: c, outline: color === k ? '2px solid var(--ink)' : 'none', outlineOffset: 3 }} />
        ))}
      </div>
      <button className="btn full" disabled={!text.trim()} onClick={save}>Save</button>
      {x && <button className="btn full soft" onClick={() => { update((d) => { d.tasks = d.tasks!.filter((z) => z.id !== id) }); closeSheet() }}>Delete</button>}
    </Sheet>
  )
}

// ---------- what to cook today: two recipes with everything at home ----------
// (ingredients matched to Groceries; the ones not cooked for the longest come first, for variety)
const CookToday = () => {
  const st = useSt()
  const all = st.recipes ?? []
  if (!all.length) return null
  const ready = all
    .filter((r) => { const ing = recipeStatus(st, r); return ing.length > 0 && ing.every((x) => x.state === 'home') })
    .sort((a, b) => (a.lastCooked ?? '').localeCompare(b.lastCooked ?? '') || a.name.localeCompare(b.name))
    .slice(0, 2)
  return (
    <div className="list">
      <div className="list-h"><span className="t17">What to cook today</span></div>
      {ready.length === 0 && <div className="list-empty">Nothing has everything at home right now.</div>}
      {ready.map((r) => (
        <Row key={r.id} dot={C.home} title={r.name}
          meta={[r.minutes ? `${r.minutes} min` : '', 'all at home', r.lastCooked ? `cooked ${fmtDay(r.lastCooked)}` : ''].filter(Boolean).join(' · ')}
          trail="→" onClick={() => openSheet(<RecipeSheet id={r.id} />)} />
      ))}
    </div>
  )
}

// ---------- brain dump: loose notes, newest first ----------
const BrainDump = () => {
  const st = useSt()
  const notes = [...(st.notes ?? [])].sort((a, b) => b.at.localeCompare(a.at))
  return (
    <div className="list">
      <div className="list-h"><span className="t17">Brain dump</span></div>
      {notes.map((n) => (
        <div key={n.id} className="row" style={{ alignItems: 'flex-start', paddingRight: 8 }}>
          <button className="note grow" onClick={() => openSheet(<NoteSheet id={n.id} />)}>
            <span className="note-text">{n.text}</span>
            <span className="t13 muted">{fmtDay(n.at.slice(0, 10))}</span>
          </button>
          <button aria-label="Delete note" onClick={() => { update((d) => { d.notes = d.notes!.filter((y) => y.id !== n.id) }); toast('Note deleted') }} style={{ padding: 6, marginTop: 6, color: 'var(--ink2)' }}><Icon.trash /></button>
        </div>
      ))}
      <Row title={<span className="muted">+ Add a note</span>} onClick={() => openSheet(<NoteSheet />)} />
    </div>
  )
}

const NoteSheet = ({ id }: { id?: string }) => {
  const st = useSt()
  const n = st.notes?.find((x) => x.id === id)
  const [text, setText] = useState(n?.text ?? '')
  return (
    <Sheet title={n ? 'Note' : 'New note'}>
      <textarea className="input" autoFocus rows={7} value={text} placeholder="Whatever’s on your mind" onChange={(e) => setText(e.target.value)} style={{ resize: 'vertical', minHeight: 150, lineHeight: 1.35 }} />
      <button className="btn full" disabled={!text.trim()} onClick={() => {
        update((d) => {
          d.notes ??= []
          const x = d.notes.find((y) => y.id === id)
          if (x) { if (x.text !== text.trim()) Object.assign(x, { text: text.trim(), at: new Date().toISOString() }) }
          else d.notes.push({ id: uid(), text: text.trim(), at: new Date().toISOString() })
        })
        closeSheet()
      }}>Save</button>
      {n && <button className="btn full soft" onClick={() => { update((d) => { d.notes = d.notes!.filter((y) => y.id !== id) }); closeSheet() }}>Delete</button>}
    </Sheet>
  )
}
