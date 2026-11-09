import { useEffect, useRef, useState, type FocusEvent, type ReactNode } from 'react'
import { dismissToday, update, useSt } from '../store'
import type { State } from '../types'
import { fitSize, addDays, taxPays, timeSpan, creditStatus, classBatch, classPayIn, fmtPay, diffDays, fmt, fmtCur, fmtDay, fmtHours, fmtWeekday, hours, monthName, sessionMain, fmtSum, isSkipped, nextBuy, periodOf, prevMonth, shiftPeriod, recipeStatus, summarize, supplyStatus, taxFor, fmtTax, today, monthKey, uid } from '../lib'
import { Logo } from '../logo'
import { C, Check, Chips, closeSheet, Field, Header, Icon, openSettings, openSheet, popSheet, pushSheet, Row, Sheet, TimeRange, toast, useUi } from '../ui'
import { copyText, SpendSheet } from './Money'
import { RecipeSheet } from './Recipes'
import { ShipmentLog } from './Shipments'
import { currentClean, MODE_NAME, progress } from '../cleaning'
import { tr, trn } from '../i18n'
import { BackupSheet, CurrenciesSheet, TaxesSheet } from '../settings'

// Today › Fresh start: three setup buttons, each opens its Settings page and then hides; the block goes once all three were tapped
const SETUP: [string, string, () => ReactNode][] = [['backup', 'Restore', () => <BackupSheet />], ['currencies', 'Currencies', () => <CurrenciesSheet />], ['taxes', 'Taxes', () => <TaxesSheet />]]
const FreshStart = ({ done }: { done: string[] }) => (
  <div className="card money" style={{ gap: 6 }}>
    <span className="t17">{tr('Fresh start')}</span>
    <span className="t15">{tr('Have a backup? Restore it. Then pick your currencies and set up your taxes. All three stay in Settings for later.')}</span>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
      {SETUP.filter(([k]) => !done.includes(k)).map(([k, label, page]) => (
        <button key={k} className="btn" style={{ flex: '1 1 0' }} onClick={() => { update((d) => { d.settings.setup = [...(d.settings.setup ?? []).filter((x) => x !== k), k] }); openSettings(); pushSheet(page()) }}>{tr(label)}</button>
      ))}
    </div>
  </div>
)

interface Thing { id: string; dot: string; title: string; meta: string; trail?: ReactNode; go: () => void }

const things = (st: State): Thing[] => {
  const t = today()
  const go = useUi.getState().go
  const out: Thing[] = []
  // supplies running out (soonest first)
  // (one-time buys are grouped with the projects' shopping below)
  const sup = st.supplies.filter((s) => !s.once && !s.paused).map((s) => ({ s, ...supplyStatus(s, st.settings) })).filter((x) => x.state !== 'ok').sort((a, b) => a.daysLeft - b.daysLeft)
  // meds come before everything else, as soon as it's time to buy them
  const meds: Thing[] = sup.filter((x) => x.s.cat === 'meds').map(({ s, daysLeft }) => ({ id: 'sup-' + s.id, dot: daysLeft <= 2 ? C.alert : C.warn, title: tr('Buy {x}', { x: s.name }), meta: `${daysLeft <= 0 ? tr('Ran out') : daysLeft === 1 ? tr('Runs out tomorrow') : trn(daysLeft, 'Runs out in {n} day', 'Runs out in {n} days')} · ${fmt(s.pricePerUnit * s.buyQty)}`, trail: '→', go: () => go('supplies', 'meds') }))
  for (const { s, daysLeft } of sup.filter((x) => x.daysLeft <= 2 && x.s.cat !== 'meds'))
    out.push({ id: 'sup-' + s.id, dot: daysLeft <= 0 ? C.alert : C.warn, title: tr('Buy {x}', { x: s.name }), meta: `${daysLeft <= 0 ? tr('Ran out') : daysLeft === 1 ? tr('Runs out tomorrow') : trn(2, 'Runs out in {n} day', 'Runs out in {n} days')} · ${fmt(s.pricePerUnit * s.buyQty)}`, trail: '→', go: () => go('supplies', s.cat) })
  // taxes: a reminder from 2 days before the pay day until the deadline, then "late!" for 10 days
  for (const x of [...taxPays(st, prevMonth(monthKey(t))), ...taxPays(st, monthKey(t))]) {
    if (x.paid || x.left <= 0) continue
    const dd = diffDays(t, x.pay)
    if (dd <= 2 && t <= x.due)
      out.push({ id: `tax-${x.pay}`, dot: C.money, title: tr('Pay {x}', { x: x.leftName }), meta: `${tr('For {x}', { x: x.forName })} · ${dd > 0 ? (dd === 1 ? tr('tomorrow') : trn(dd, 'in {n} day', 'in {n} days')) : dd === 0 ? tr('today') : tr('deadline {d}', { d: fmtDay(x.due) })}`, trail: fmtTax(st.settings, x.left), go: () => go('money', 'taxes') })
    else if (t > x.due && diffDays(x.due, t) <= 10)
      out.push({ id: `tax-${x.pay}`, dot: C.alert, title: tr('Pay {x}', { x: x.leftName }), meta: `${tr('For {x}', { x: x.forName })} · ${tr('late!')}`, trail: fmtTax(st.settings, x.left), go: () => go('money', 'taxes') })
  }
  // credit payments due today / tomorrow
  for (const c of st.credits ?? []) {
    const n = creditStatus(c).next
    if (!n) continue
    const dd = diffDays(t, n.date)
    if (dd >= 0 && dd <= 1) out.push({ id: `credit-${c.id}-${n.date}`, dot: C.money, title: `${tr('Credit payment')} · ${c.name}`, meta: `${dd === 0 ? tr('Due today') : tr('Due tomorrow')} · ${tr('payment {n} of {m}', { n: n.n, m: c.count })}`, trail: fmtCur(n.amount, c.currency), go: () => go('money', 'credits') })
  }
  // clients: invoicing first (it's what gets the money moving), "paid yet?" checks go last
  const paidChecks: Thing[] = []
  for (const c of st.clients.filter((c) => !c.archived)) {
    const ss = st.sessions.filter((s) => s.clientId === c.id)
    // a monthly fee only needs invoicing once its day has come
    const unInv = ss.filter((s) => !s.invoiced && !s.paid && !isSkipped(s) && (!s.feeMonth || s.start.slice(0, 10) <= t))
    const unpaid = ss.filter((s) => s.invoiced && !s.paid)
    if (unInv.length) {
      const h = unInv.reduce((a, s) => a + hours(s), 0)
      const jobs = unInv.filter((s) => s.fee !== undefined)
      out.push({ id: 'inv-' + c.id, dot: C.work, title: tr('Invoice {x}', { x: c.name }),
        meta: (c.kind ?? 'hourly') === 'hourly' ? tr('{h} not invoiced yet', { h: fmtHours(h) }) : `${jobs.map((s) => s.task).filter(Boolean).slice(0, 2).join(', ') || trn(jobs.length, '{n} payment', '{n} payments')}${jobs.length > 2 ? '…' : ''} · ${tr('not invoiced yet')}`,
        trail: fmtSum(st, unInv), go: () => go('money', 'work') })
    }
    if (unpaid.length) {
      const since = unpaid.map((s) => s.invoiceDate ?? s.start.slice(0, 10)).sort()[0]
      paidChecks.push({ id: 'paid-' + c.id, dot: C.work, title: tr('{x} paid yet?', { x: c.name }), meta: tr('Invoiced · waiting since {d}', { d: fmtDay(since) }), trail: fmt(unpaid.reduce((a, s) => a + sessionMain(st, s), 0)), go: () => go('money', 'work') })
    }
  }
  // cleaning
  // cleaning: shows on its day (and stays until done, up to the next one), always first
  const cl = currentClean(st)
  if (cl?.due) {
    const pr = progress(st, cl.occ)
    const left = pr.tasks.length - pr.done.length
    const day = cl.occ.date === t ? tr('Today') : tr('Since {d}', { d: fmtWeekday(cl.occ.date) })
    out.unshift({ id: 'clean-' + cl.occ.key, dot: C.home, title: tr(`${MODE_NAME[cl.occ.mode]} clean`), meta: `${day} · ${trn(left, '{n} of {m} step left', '{n} of {m} steps left', { m: pr.tasks.length })}`, trail: '→', go: () => go('home', 'cleaning') })
  }
  // supplies soon (not urgent)
  const soon = sup.filter((x) => x.daysLeft > 2 && x.s.cat !== 'meds')
  if (soon.length) out.push({ id: 'run-' + nextBuy(soon[0].s, st.settings), dot: C.supplies, title: `${tr('Shopping run')} · ${trn(soon.length, '{n} thing', '{n} things')}`, meta: `${soon.map((x) => x.s.name).slice(0, 3).join(', ')}${soon.length > 3 ? '…' : ''} · ${tr('by {d}', { d: fmtDay(soon[0].s.enoughUntil) })}`, trail: '→', go: () => go('supplies', soon[0].s.cat) })
  // one-off things to buy: one-time supplies (projects' "need to buy" items are among them)
  const onceBuys = st.supplies.filter((s) => s.once && !s.paused)
  const names = onceBuys.map((s) => s.name)
  if (names.length) {
    const sum = onceBuys.reduce((a, s) => a + s.pricePerUnit * s.buyQty, 0)
    out.push({ id: 'tobuy-' + names.length, dot: C.home, title: `${tr('To buy')} · ${trn(names.length, '{n} thing', '{n} things')}`, meta: `${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}`, trail: sum > 0 ? fmt(sum) : '→', go: () => go('supplies', onceBuys[0]?.cat ?? 'home') })
  }
  // classes: from 3 days before the payment day
  // per class: no reminder (it's a regular planned expense); per month: the month's batch
  for (const c of st.classes ?? []) {
    if (c.payEvery === 'class') continue
    const lb = classBatch(st, c)
    if (lb && t >= addDays(lb.due, -3))
      out.push({ id: `lessons-${c.id}-${lb.due}`, dot: C.money, title: tr('Pay for {x}', { x: c.name }), meta: [trn(lb.dates.length, '{n} class', '{n} classes'), lb.paid !== undefined && classPayIn(c) !== st.settings.mainCur ? fmtPay(lb.paid, classPayIn(c)) : '', tr(lb.due < t ? 'since {d}' : 'by {d}', { d: fmtDay(lb.due) })].filter(Boolean).join(' · '), trail: fmt(lb.pln), go: () => go('money', 'classes') })
  }
  // selfcare: from the day before until a week overdue
  for (const x of (st.selfcare ?? []).filter((x) => !x.paused)) {
    const n = diffDays(t, x.next)
    if (n <= 1 && n >= -7) out.push({ id: `care-${x.id}-${x.next}`, dot: C.closet, title: x.name, meta: `${tr('Selfcare')} · ${n < 0 ? trn(-n, '{n} day overdue', '{n} days overdue') : n === 0 ? tr('today') : tr('tomorrow')}${x.time && n >= 0 ? ' ' + tr('at {t}', { t: timeSpan(x.time, x.endTime) ?? '' }) : ''}`, trail: fmtCur(x.price, x.currency), go: () => go('money', 'selfcare') })
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
  const setup = st.settings.setup ?? []
  const nextTax = taxPays(st, monthKey(t)).find((x) => !x.paid && x.left > 0 && diffDays(t, x.pay) > 5)
  return (
    <div className="screen withfab">
      <Header sub="Your daily hub app" title={<Logo />} />
      {setup.length < SETUP.length && (setup.length > 0 || (Object.keys(st.periods).length === 0 && st.clients.length === 0 && st.supplies.length === 0)) && <FreshStart done={setup} />}
      <button className="card dark" style={{ gap: 6, paddingTop: 22, paddingBottom: 22 }} onClick={() => useUi.getState().go('money', 'budget')}>
        <span className="t15 w5">{tr('You can spend today')}</span>
        <span className="big" style={{ fontSize: fitSize(fmt(Math.max(s.perDay, s.perDay < 0 ? s.perDay : 0)), 63.5, 8), color: s.perDay < 0 ? 'var(--alert)' : undefined }}>{fmt(Math.max(s.perDay, s.perDay < 0 ? s.perDay : 0))}</span>
        <span className="t15">
          {s.daysLeft <= 1
            ? `${tr('Last day of this fortnight')}${nextIncome ? ` · ${tr('{x} lands {d}', { x: nextIncome.label.toLowerCase(), d: nextIncome.date === shiftDay(t) ? tr('tomorrow') : fmtDay(nextIncome.date ?? nextP.info.start) })}` : ''}`
            : `${trn(s.daysLeft, '{x} left for {n} day', '{x} left for {n} days', { x: fmt(s.left) })} · ${s.perDay >= 0 ? tr('on track') : tr('over — go easy')}`}
        </span>
      </button>
      <div className="list" style={{ paddingTop: 12, paddingBottom: 8 }}>
        <div className="list-h" style={{ paddingBottom: 4 }}>
          <span className="t17">{tr('Reminders')}</span>
        </div>
        {top.length === 0 && <div className="list-empty">{tr('Nothing urgent. Rest counts too.')}</div>}
        {top.map((x) => (
          <div key={x.id} className="row" style={{ paddingRight: 8 }}>
            <div className="grow"><Row dot={x.dot} title={x.title} meta={x.meta} trail={x.trail} onClick={x.go} /></div>
            <button aria-label={tr('Not today')} title={tr('Not today')} onClick={() => { dismissToday(x.id); toast(tr('Moved off today')) }} style={{ padding: 6, color: 'var(--ink2)' }}><Icon.x /></button>
          </div>
        ))}
      </div>
      <OtherTasks />
      <CookToday />
      <ShipmentLog />
      <BrainDump />
      {nextTax && (
        <div className="t14 muted" style={{ padding: '0 4px' }}>{tr('Coming up: {x} on {d}', { x: nextTax.leftName, d: fmtDay(nextTax.pay) })} · {fmtTax(st.settings, nextTax.left)} · {tr('already in your budget')}</div>
      )}
    </div>
  )
}
const shiftDay = (d: string) => addDays(d, 1)


// ---------- other tasks: a plain checklist with my own colour dots ----------
export const TASK_COLORS: [string, string][] = [['money', C.money], ['work', C.work], ['supplies', C.supplies], ['closet', C.closet], ['home', C.home], ['alert', C.alert]]
export const dotOf = (c: string) => TASK_COLORS.find((x) => x[0] === c)?.[1] ?? C.line

const OtherTasks = () => {
  const st = useSt()
  const t = today()
  const tasks = (st.tasks ?? []).filter((x) => !x.doneAt || x.doneAt >= t)
  const open = tasks.filter((x) => !x.doneAt)
  const done = tasks.filter((x) => x.doneAt)
  const toggle = (id: string) => update((d) => { const x = d.tasks?.find((y) => y.id === id); if (x) x.doneAt = x.doneAt ? undefined : today() })
  return (
    <div className="list">
      <div className="list-h"><span className="t17">{tr('Parking lot')}</span></div>
      {[...open, ...done].map((x) => (
        <Row key={x.id} done={!!x.doneAt} title={x.text} dot={dotOf(x.color)} meta={x.date ? [fmtWeekday(x.date), timeSpan(x.time, x.end)].filter(Boolean).join(' · ') : undefined}
          trail={<span onClick={(e) => { e.stopPropagation(); toggle(x.id) }} style={{ display: 'flex', padding: 4, margin: -4 }}><Check on={!!x.doneAt} /></span>}
          onClick={() => openSheet(<TaskSheet id={x.id} />)} />
      ))}
      <Row title={<span className="muted">+ {tr('Add a task')}</span>} onClick={() => openSheet(<TaskSheet />)} />
    </div>
  )
}

// back: opened from the calendar (go back this many pages instead of closing); date: a new task for that day
export const TaskSheet = ({ id, back, date }: { id?: string; back?: number; date?: string }) => {
  const st = useSt()
  const x = st.tasks?.find((y) => y.id === id)
  const [text, setText] = useState(x?.text ?? '')
  const [color, setColor] = useState(x?.color ?? 'money')
  const [onCal, setOnCal] = useState(!!(x?.date ?? date))
  const [d, setD] = useState(x?.date ?? date ?? today())
  const [time, setTime] = useState(x?.time ?? '')
  const [end, setEnd] = useState(x?.end ?? '')
  const done = () => { if (back) for (let i = 0; i < back; i++) popSheet(false); else closeSheet() }
  const save = () => {
    if (!text.trim()) return
    update((s) => {
      s.tasks ??= []
      const y = s.tasks.find((z) => z.id === id)
      const data = { text: text.trim(), color, date: onCal ? d : undefined, time: onCal && time ? time : undefined, end: onCal && time && end ? end : undefined }
      if (y) Object.assign(y, data)
      else s.tasks.push({ id: uid(), ...data })
    })
    done()
  }
  return (
    <Sheet title={x ? 'Task' : 'New task'} onBack={back ? popSheet : undefined}>
      <input className="input" autoFocus={!x} value={text} placeholder={tr('What needs doing')} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save() }} />
      <div className="row" style={{ gap: 10 }}>
        {TASK_COLORS.map(([k, c]) => (
          <button key={k} aria-label={k} className="swatch" onClick={() => setColor(k)} style={{ width: 34, height: 34, borderRadius: '50%', background: c, outline: color === k ? '2px solid var(--ink)' : 'none', outlineOffset: 3 }} />
        ))}
      </div>
      <button className="row" style={{ gap: 12, padding: '4px 0' }} onClick={() => setOnCal(!onCal)}>
        <span className="t15 grow" style={{ textAlign: 'left' }}>{tr('Put it in the calendar')}</span>
        <span className={'switch' + (onCal ? ' on' : '')} role="switch" aria-checked={onCal} aria-label={tr('Put it in the calendar')}><i /></span>
      </button>
      {onCal && (
        <>
          <Field label="Date"><input className="input" type="date" value={d} onChange={(e) => setD(e.target.value || today())} /></Field>
          <TimeRange start={time} end={end} onChange={(a, b) => { setTime(a); setEnd(b) }} />
        </>
      )}
      <button className="btn full" disabled={!text.trim()} onClick={save}>{tr('Save')}</button>
      {x && <button className="btn full soft" onClick={() => { update((s) => { s.tasks = s.tasks!.filter((z) => z.id !== id) }); done() }}>{tr('Delete')}</button>}
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
      <div className="list-h"><span className="t17">{tr('What to cook today')}</span></div>
      {ready.length === 0 && <div className="list-empty">{tr('Nothing has everything at home right now.')}</div>}
      {ready.map((r) => (
        <Row key={r.id} dot={C.home} title={r.name}
          meta={[r.minutes ? tr('{n} min', { n: r.minutes }) : '', tr('all at home'), r.lastCooked ? tr('cooked {d}', { d: fmtDay(r.lastCooked) }) : ''].filter(Boolean).join(' · ')}
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
      <div className="list-h"><span className="t17">{tr('Brain dump')}</span></div>
      {notes.map((n) => (
        <div key={n.id} className="row" style={{ alignItems: 'flex-start', paddingRight: 8 }}>
          <button className="note grow" onClick={() => openSheet(<NoteSheet id={n.id} />)}>
            {n.title && <span className="t17">{n.title}</span>}
            {n.text && <span className="note-text">{n.text}</span>}
            <span className="t13 muted">{fmtDay(localDay(n.at))}</span>
          </button>
          <button aria-label={tr('Delete note')} onClick={() => { update((d) => { d.notes = d.notes!.filter((y) => y.id !== n.id) }); toast(tr('Note deleted')) }} style={{ padding: 6, marginTop: 6, color: 'var(--ink2)' }}><Icon.trash /></button>
        </div>
      ))}
      <Row title={<span className="muted">+ {tr('Add a note')}</span>} onClick={() => openSheet(<NoteSheet />)} />
    </div>
  )
}

// a timestamp's date on the phone's own clock
const localDay = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

const NoteSheet = ({ id }: { id?: string }) => {
  const st = useSt()
  const [nid, setNid] = useState(id)
  const n = st.notes?.find((x) => x.id === nid)
  // an existing note opens to read; a new one opens to write
  const [editing, setEditing] = useState(!n)
  const [title, setTitle] = useState(n?.title ?? '')
  const [text, setText] = useState(n?.text ?? '')
  const filled = !!(title.trim() || text.trim())
  const save = () => {
    if (!editing || !filled) return
    const t = text.trim(), h = title.trim() || undefined
    let newId = nid
    update((d) => {
      d.notes ??= []
      const x = d.notes.find((y) => y.id === nid)
      if (x) { if (x.text !== t || x.title !== h) Object.assign(x, { title: h, text: t, at: new Date().toISOString() }) }
      else { newId = uid(); d.notes.push({ id: newId, title: h, text: t, at: new Date().toISOString() }) }
    })
    setNid(newId); setTitle(h ?? ''); setText(t); setEditing(false)
  }
  // auto-save: the keyboard's Done tick (field loses focus) and pulling the sheet down both save
  const latest = useRef(save); latest.current = save
  useEffect(() => () => latest.current(), [])
  const onBlur = (e: FocusEvent) => {
    const to = e.relatedTarget as Node | null
    if (to && (to as HTMLElement).matches?.('[data-note-field]')) return // hopping between title and text
    if (document.visibilityState !== 'visible') return
    save()
  }
  // view mode: one tap copies, two taps open editing
  const tapT = useRef<number>()
  const tap = () => {
    if (tapT.current) { clearTimeout(tapT.current); tapT.current = undefined; setEditing(true); return }
    tapT.current = window.setTimeout(() => {
      tapT.current = undefined
      const c = n?.text || n?.title
      if (c) copyText(c, tr('Note copied'))
    }, 280)
  }
  useEffect(() => () => clearTimeout(tapT.current), [])
  const round = (bg: string, on: boolean) => ({ width: 40, height: 40, borderRadius: '50%', background: bg, color: '#1d1d1f', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: on ? 1 : 0.45 })
  return (
    <Sheet full={!!n} title={editing
      // the title is typed right into the header; empty = just "Note"
      ? <input value={title} placeholder={tr(n ? 'Note' : 'New note')} onChange={(e) => setTitle(e.target.value)} onBlur={onBlur} data-note-field="" aria-label={tr('Title')} style={{ font: 'inherit', letterSpacing: 'inherit', color: 'inherit', background: 'none', border: 0, outline: 'none', padding: 0, width: '100%' }} />
      : n?.title || tr('Note')} actions={
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        {n && <button aria-label={tr('Edit')} style={round('#E3D2FF', !editing)} onClick={() => setEditing(true)}><Icon.edit /></button>}
        <button aria-label={tr('Save')} style={round('#D6EE7A', editing && filled)} onClick={save}><Icon.check color="#1d1d1f" size={20} /></button>
      </div>
    }>
      {editing
        ? <>
            <textarea className="input" autoFocus={!n} rows={11} value={text} placeholder={tr('Whatever’s on your mind')} onChange={(e) => setText(e.target.value)} onBlur={onBlur} data-note-field="" style={{ resize: 'none', minHeight: 'calc(min(52vh, 420px) - 3 * 1.35em)', lineHeight: 1.35 }} />
          </>
        : n && <div onClick={tap} style={{ padding: '4px 0 12px', minHeight: '40vh', touchAction: 'manipulation', userSelect: 'none', WebkitUserSelect: 'none', cursor: 'pointer' }}>
            <div className="t13 muted">{fmtWeekday(localDay(n.at))}</div>
            {n.text && <div style={{ fontSize: 14, lineHeight: 1.35, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginTop: 14 }}>{n.text}</div>}
          </div>}
    </Sheet>
  )
}
