import { useRef, useState, type ReactNode } from 'react'
import { update, useSt } from './store'
import type { CalEvent, CalKey, State } from './types'
import {
  addDays, CAT_LABEL, careNext, classBatch, creditSchedule, daysInMonth, fmtCur, fmtDay, monthName, nextBuy, nextMonth, pad, parse,
  prevMonth, subDate, taxFor, today, uid
} from './lib'
import { addHours, MODE_HOURS, MODE_NAME, occurrences, type Occurrence } from './cleaning'
import { moveOcc } from './screens/Cleaning'
import { C, Check, closeSheet, Field, Icon, List, popSheet, pushSheet, Row, Sheet, toast, useUi, type Tab as UiTab } from './ui'
import { ShipmentSheet } from './screens/Shipments'

// Calendar (the icon next to Settings): your own appointments, plus whatever you chose in
// Settings › Calendar from the tabs. It only shows the tabs' things — they still live in their tabs,
// so it's never out of date. Tap one to go there; deliveries and classes can be ticked / cancelled here.

export const CAL_OPTIONS: [CalKey, string][] = [
  ['taxes', 'Taxes payments'], ['subs', 'Subscription charges'], ['credits', 'Credit payments'], ['classes', 'Classes'],
  ['selfcare', 'Selfcare events'], ['shopping', 'Shopping runs'], ['deliveries', 'Deliveries'], ['cleaning', 'Cleaning']
]

interface Item {
  id: string
  date: string
  title: string
  meta?: string
  time?: string
  dot: string
  done?: boolean
  go?: [UiTab, string?] // where it lives
  toggle?: { on: boolean; run: () => void; label?: [string, string] } // a tick right in the calendar (or a text button: [when on, when off])
  event?: CalEvent
  edit?: () => ReactNode // opens its own editor (changes go straight to the tab)
}

const monthsIn = (from: string, to: string) => {
  const out: string[] = []
  for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = nextMonth(m)) out.push(m)
  return out
}
const dayIn = (mk: string, day: number) => `${mk}-${pad(Math.min(day, daysInMonth(+mk.slice(0, 4), +mk.slice(5, 7))))}`

// own appointments, repeats included
const eventDates = (e: CalEvent, from: string, to: string) => {
  if (!e.repeat) return e.date >= from && e.date <= to ? [e.date] : []
  const out: string[] = []
  const d0 = parse(e.date)
  if (e.repeat === 'week') {
    let d = e.date
    if (d < from) d = addDays(d, Math.ceil((parse(from).getTime() - d0.getTime()) / 86400000 / 7) * 7)
    for (; d <= to; d = addDays(d, 7)) if (d >= from) out.push(d)
  } else {
    for (const mk of monthsIn(from, to)) {
      if (e.repeat === 'year' && +mk.slice(5, 7) !== d0.getMonth() + 1) continue
      const d = dayIn(mk, d0.getDate())
      if (d >= e.date && d >= from && d <= to) out.push(d)
    }
  }
  return out
}

export const calItems = (st: State, from: string, to: string): Item[] => {
  const on = st.settings.calendar ?? {}
  const out: Item[] = []
  const t = today()
  for (const e of st.events ?? []) for (const d of eventDates(e, from, to)) out.push({ id: `ev-${e.id}-${d}`, date: d, title: e.title, time: e.time, meta: e.note, dot: C.ink, event: e })
  if (on.taxes) for (const mk of monthsIn(from, to)) {
    const forMonth = prevMonth(mk)
    const tx = taxFor(st, forMonth)
    const pay = dayIn(mk, st.settings.taxPayDay ?? st.settings.taxDueDay)
    const paid = !!st.taxMonths[forMonth]?.paid
    if (tx.total > 0 && pay >= from && pay <= to) out.push({ id: 'tax-' + mk, date: pay, title: 'ZUS + PIT', meta: `for ${monthName(forMonth, true)} · ${fmtCur(tx.total)}${paid ? ' · paid' : ''}`, dot: C.money, done: paid, go: ['money', 'taxes'] })
    const dl = dayIn(mk, st.settings.taxDueDay)
    if (tx.total > 0 && !paid && dl !== pay && dl >= from && dl <= to) out.push({ id: 'taxdl-' + mk, date: dl, title: 'Tax deadline', meta: `ZUS + PIT for ${monthName(forMonth, true)}`, dot: C.alert, go: ['money', 'taxes'] })
  }
  if (on.subs) for (const s of st.subscriptions.filter((x) => !x.paused)) for (const mk of monthsIn(from, to)) {
    const d = subDate(s, mk)
    if (d >= from && d <= to) out.push({ id: `sub-${s.id}-${d}`, date: d, title: s.name, meta: `Subscription · ${fmtCur(s.amount, s.currency)}`, dot: C.money, go: ['money', 'subs'] })
  }
  if (on.credits) for (const c of st.credits ?? []) for (const x of creditSchedule(c)) {
    if (x.date >= from && x.date <= to) out.push({ id: `cr-${c.id}-${x.n}`, date: x.date, title: c.name, meta: `Credit · payment ${x.n} of ${c.count} · ${fmtCur(x.amount, c.currency ?? 'PLN')}`, dot: C.money, done: x.date < t, go: ['money', 'credits'] })
  }
  if (on.classes) for (const c of st.classes ?? []) {
    const paid = new Set(c.pays.flatMap((p) => p.dates))
    const dates = new Set<string>()
    for (let d = from < c.since ? c.since : from; d <= to; d = addDays(d, 1)) if (c.days.includes(parse(d).getDay())) dates.add(d)
    for (const x of c.extra) if (x >= from && x <= to && x >= c.since) dates.add(x)
    for (const d of dates) {
      const off = c.skips.includes(d)
      out.push({
        id: `cl-${c.id}-${d}`, date: d, title: c.name, time: c.time, dot: C.money, done: off, go: ['money', 'classes'],
        meta: ['Class', c.extra.includes(d) ? 'extra' : '', off ? 'cancelled' : paid.has(d) ? 'paid' : ''].filter(Boolean).join(' · '),
        toggle: paid.has(d) ? undefined : { on: !off, label: ['Cancel', 'Bring back'], run: () => update((s) => { const L = s.classes?.find((y) => y.id === c.id); if (!L) return; if (L.extra.includes(d) && !off) L.extra = L.extra.filter((y) => y !== d); else L.skips = off ? L.skips.filter((y) => y !== d) : [...L.skips, d] }) }
      })
    }
    const b = classBatch(st, c)
    if (b && b.due >= from && b.due <= to) out.push({ id: `clpay-${c.id}`, date: b.due, title: `Pay for ${c.name}`, meta: `${b.dates.length} ${b.dates.length === 1 ? 'class' : 'classes'} · ${monthName(b.month, true)}`, dot: C.money, go: ['money', 'classes'] })
  }
  if (on.selfcare) {
    // only the next time of each (the one date the Selfcare tab keeps); overdue ones sit on today
    for (const x of st.selfcare ?? []) {
      if (x.paused) continue
      const d = careNext(x, t)
      if (d >= from && d <= to) out.push({ id: `care-${x.id}`, date: d, title: x.name, time: x.time, meta: x.next < t ? 'Selfcare · overdue' : 'Selfcare', dot: C.closet, go: ['money', 'selfcare'], edit: () => <CareWhen id={x.id} /> })
    }
  }
  if (on.shopping) {
    const runs = new Map<string, { date: string; cat: keyof typeof CAT_LABEL; names: string[] }>()
    for (const sp of st.supplies) {
      if (sp.paused) continue
      // a little wider than the view: a run moved in the calendar may land inside it
      for (let d = nextBuy(sp, st.settings, t), g = 0; d <= addDays(to, 31) && g < 80; d = addDays(d, Math.max(1, sp.lastsDays)), g++) {
        if (d >= addDays(from, -31)) { const k = d + sp.cat; const r = runs.get(k) ?? { date: d, cat: sp.cat, names: [] }; r.names.push(sp.name); runs.set(k, r) }
        if (sp.once) break
      }
    }
    for (const r of runs.values()) {
      const key = `${r.date}|${r.cat}`
      const plan = st.shopPlans?.[key]
      const d = plan?.date ?? r.date
      if (d < from || d > to) continue
      const title = `Shopping · ${CAT_LABEL[r.cat]}`
      out.push({ id: 'shop-' + key, date: d, time: plan?.time, title, meta: r.names.slice(0, 3).join(', ') + (r.names.length > 3 ? ` +${r.names.length - 3}` : ''), dot: C.supplies, go: ['supplies', r.cat], edit: () => <ShopWhen k={key} planned={r.date} title={title} cat={r.cat} /> })
    }
  }
  if (on.deliveries) for (const x of st.shipments ?? []) {
    const d = x.eta ?? x.deliveredAt
    if (!d || d < from || d > to) continue
    out.push({
      id: 'sh-' + x.id, date: d, title: x.name, meta: `Delivery · ${x.courier || 'courier'}${x.deliveredAt ? ' · delivered' : ''}`, dot: C.supplies, done: !!x.deliveredAt, go: ['today'], edit: () => <ShipmentSheet id={x.id} back={1} />,
      toggle: { on: !!x.deliveredAt, run: () => update((s) => { const y = s.shipments?.find((z) => z.id === x.id); if (y) y.deliveredAt = y.deliveredAt ? undefined : today() }) }
    })
  }
  if (on.cleaning) for (const o of occurrences(st, from, to)) out.push({ id: 'cln-' + o.key, date: o.date, time: o.start ? `${o.start}${o.end ? `–${o.end}` : ''}` : undefined, title: `${MODE_NAME[o.mode]} clean`, meta: o.sunday && o.sunday !== o.date ? `Cleaning · moved from ${fmtDay(o.sunday)}` : 'Cleaning', dot: C.home, go: ['home', 'cleaning'], edit: () => <CleanWhen occ={o} /> })
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '99').localeCompare(b.time ?? '99') || a.title.localeCompare(b.title))
}

const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const LONG_WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export const CalendarSheet = () => {
  const st = useSt()
  const t = today()
  const [mk, setMk] = useState(t.slice(0, 7))
  const [sel, setSel] = useState(t)
  // the grid: Monday-first weeks covering the month
  const first = `${mk}-01`
  const lead = (parse(first).getDay() + 6) % 7
  const start = addDays(first, -lead)
  const dim = daysInMonth(+mk.slice(0, 4), +mk.slice(5, 7))
  const weeks = Math.ceil((lead + dim) / 7)
  const end = addDays(start, weeks * 7 - 1)
  const items = calItems(st, start < sel ? start : sel, end > sel ? end : sel)
  const byDay = new Map<string, Item[]>()
  for (const i of items) { const a = byDay.get(i.date) ?? []; a.push(i); byDay.set(i.date, a) }
  const dayItems = byDay.get(sel) ?? []
  const anyOn = Object.values(st.settings.calendar ?? {}).some(Boolean)
  const go = (m: string) => { setMk(m); setSel(m === t.slice(0, 7) ? t : `${m}-01`) }
  // swipe the grid sideways for the next / previous month
  const touch = useRef<{ x: number; y: number } | null>(null)
  const open = (i: Item) => {
    if (i.event) { pushSheet(<EventEdit id={i.event.id} />); return }
    if (i.edit) { pushSheet(i.edit()); return }
    if (!i.go) return
    closeSheet(); useUi.getState().go(i.go[0], i.go[1])
  }
  const sd = parse(sel)
  return (
    <Sheet title="Calendar" full>
      <div className="between" style={{ alignItems: 'center' }}>
        <button className="cal-nav" aria-label="Previous month" onClick={() => go(prevMonth(mk))}><Icon.chevL /></button>
        <button className="mid" onClick={() => go(t.slice(0, 7))}>{MONTH_LONG[+mk.slice(5, 7) - 1]}{mk.slice(0, 4) !== t.slice(0, 4) ? ` ${mk.slice(0, 4)}` : ''}</button>
        <button className="cal-nav" aria-label="Next month" onClick={() => go(nextMonth(mk))}><Icon.chevR /></button>
      </div>
      <div className="cal noswipe"
        onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }}
        onTouchEnd={(e) => {
          const s = touch.current; touch.current = null
          if (!s) return
          const dx = e.changedTouches[0].clientX - s.x, dy = e.changedTouches[0].clientY - s.y
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? nextMonth(mk) : prevMonth(mk))
        }}>
        {WD.map((w) => <span key={w} className="cal-wd">{w}</span>)}
        {Array.from({ length: weeks * 7 }, (_, i) => {
          const d = addDays(start, i)
          const its = byDay.get(d) ?? []
          const dots = [...new Set(its.filter((x) => !x.done).map((x) => x.dot))].slice(0, 3)
          return (
            <button key={d} className={'cal-day' + (d.slice(0, 7) !== mk ? ' out' : '') + (d === t ? ' today' : '') + (d === sel ? ' sel' : '')} onClick={() => setSel(d)}>
              <span className="n">{+d.slice(8)}</span>
              <span className="dots">{dots.map((c) => <i key={c} style={{ background: c }} />)}</span>
            </button>
          )
        })}
      </div>
      <List title={`${LONG_WD[sd.getDay()]}, ${fmtDay(sel)}`} right={sel === t ? 'today' : undefined}
        empty={dayItems.length ? undefined : 'Nothing planned.'}>
        {dayItems.map((i) => (
          <Row key={i.id} dot={i.dot} done={i.done} title={i.title}
            meta={[i.time, i.meta].filter(Boolean).join(' · ') || undefined}
            trail={i.toggle
              ? i.toggle.label
                ? <span role="button" className="t15 w5 muted" onClick={(e) => { e.stopPropagation(); i.toggle!.run() }} style={{ padding: '6px 2px', margin: '-6px -2px' }}>{i.toggle.on ? i.toggle.label[0] : i.toggle.label[1]}</span>
                : <span onClick={(e) => { e.stopPropagation(); i.toggle!.run() }} style={{ display: 'flex', padding: 4, margin: -4 }}><Check on={i.toggle.on} /></span>
              : i.go || i.event ? <Icon.chevR /> : undefined}
            onClick={i.go || i.event ? () => open(i) : undefined} />
        ))}
        <Row title={<span className="muted">+ Add on {fmtDay(sel)}</span>} onClick={() => pushSheet(<AddSheet date={sel} />)} />
      </List>
      {!anyOn && <span className="t13 muted" style={{ padding: '0 4px' }}>Want taxes, classes, deliveries and more here too? Choose them in Settings › Calendar.</span>}
    </Sheet>
  )
}

// + on a day: your own appointment, or something that lives in a tab
const AddSheet = ({ date }: { date: string }) => {
  const st = useSt()
  const classes = st.classes ?? []
  const opt = (title: ReactNode, meta: string, run: () => void) => <Row title={title} meta={meta} trail={<Icon.chevR />} onClick={run} />
  return (
    <Sheet title={`Add on ${fmtDay(date)}`} onBack={popSheet}>
      <List>
        {opt('Appointment', 'Your own — not tied to any tab', () => pushSheet(<EventEdit date={date} />))}
        {opt('Delivery', 'Goes on the Shipment log', () => pushSheet(<ShipmentSheet eta={date} back={2} />))}
        {classes.map((c) => opt(`Extra ${c.name} class`, c.time ? `At ${c.time}` : 'One extra class that day', () => {
          update((d) => { const L = d.classes?.find((y) => y.id === c.id); if (!L) return; L.skips = L.skips.filter((y) => y !== date); if (!L.extra.includes(date)) L.extra.push(date) })
          popSheet(); toast(`Extra ${c.name} class on ${fmtDay(date)}`)
        }))}
      </List>
    </Sheet>
  )
}

// a selfcare's next time, right from the calendar: the same date (and time) the Selfcare tab shows
const CareWhen = ({ id }: { id: string }) => {
  const st = useSt()
  const x = st.selfcare?.find((y) => y.id === id)
  const [d, setD] = useState(x ? careNext(x) : today())
  const [time, setTime] = useState(x?.time ?? '')
  if (!x) return null
  return (
    <Sheet title={x.name} onBack={popSheet}>
      <span className="t15 muted">Next time — changing it here changes it in Selfcare too.</span>
      <div className="row" style={{ gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}><Field label="Date"><input className="input" type="date" value={d} onChange={(e) => setD(e.target.value)} /></Field></div>
        <div style={{ flex: 1, minWidth: 0 }}><Field label="Time"><input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field></div>
      </div>
      <button className="btn full" disabled={!d} onClick={() => { update((s) => { const y = s.selfcare?.find((z) => z.id === id); if (y) { y.next = d; y.time = time || undefined } }); popSheet() }}>Save</button>
      <button className="btn full soft" onClick={() => { closeSheet(); useUi.getState().go('money', 'selfcare') }}>Open in Selfcare</button>
    </Sheet>
  )
}

// this one clean: its day and time (the rotation stays as it is)
const CleanWhen = ({ occ }: { occ: Occurrence }) => {
  const hours = MODE_HOURS[occ.mode]
  const [d, setD] = useState(occ.date)
  const [start, setStart] = useState(occ.start ?? '')
  const [end, setEnd] = useState(occ.end ?? '')
  const [endSet, setEndSet] = useState(!!occ.end && !!occ.start && occ.end !== addHours(occ.start, hours)) // changed by hand: stop following the start
  const save = () => {
    moveOcc(occ, d)
    const key = occ.sunday ?? 'x-' + d
    update((s) => {
      const tm = (s.cleanPlan.times ??= {})
      if (start) tm[key] = { start, end: end || undefined }
      else delete tm[key]
    })
    popSheet()
  }
  return (
    <Sheet title={`${MODE_NAME[occ.mode]} clean`} onBack={popSheet}>
      <span className="t15 muted">Just this clean — the Sunday rotation stays as it is. A {MODE_NAME[occ.mode]} clean takes about {hours} hours.</span>
      <Field label="Date"><input className="input" type="date" value={d} onChange={(e) => setD(e.target.value || occ.date)} /></Field>
      <div className="row" style={{ gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}><Field label="Starts"><input className="input" type="time" value={start} onChange={(e) => { const v = e.target.value; setStart(v); if (!endSet) setEnd(v ? addHours(v, hours) : '') }} /></Field></div>
        <div style={{ flex: 1, minWidth: 0 }}><Field label="Ends"><input className="input" type="time" value={end} onChange={(e) => { setEnd(e.target.value); setEndSet(!!e.target.value) }} /></Field></div>
      </div>
      {occ.sunday && occ.sunday !== occ.date && <button className="btn full soft" onClick={() => setD(occ.sunday!)}>Back to Sunday {fmtDay(occ.sunday)}</button>}
      <button className="btn full" onClick={save}>Save</button>
      <button className="btn full soft" onClick={() => { closeSheet(); useUi.getState().go('home', 'cleaning') }}>Open Cleaning</button>
    </Sheet>
  )
}

// a shopping run, for planning the day only: moving it here doesn't change anything in Supplies
const ShopWhen = ({ k, planned, title, cat }: { k: string; planned: string; title: string; cat: string }) => {
  const st = useSt()
  const plan = st.shopPlans?.[k]
  const [d, setD] = useState(plan?.date ?? planned)
  const [time, setTime] = useState(plan?.time ?? '')
  const save = () => {
    update((s) => {
      const all = (s.shopPlans ??= {})
      for (const key of Object.keys(all)) if (key.split('|')[0] < addDays(today(), -31)) delete all[key] // old ones
      if (d === planned && !time) delete all[k]
      else all[k] = { date: d, time: time || undefined }
    })
    popSheet()
  }
  return (
    <Sheet title={title} onBack={popSheet}>
      <span className="t15 muted">Planned for {fmtDay(planned)}. Moving it here is just for planning your day — Supplies stays as it is.</span>
      <div className="row" style={{ gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}><Field label="Date"><input className="input" type="date" value={d} onChange={(e) => setD(e.target.value || planned)} /></Field></div>
        <div style={{ flex: 1, minWidth: 0 }}><Field label="Time"><input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field></div>
      </div>
      {(d !== planned || time) && <button className="btn full soft" onClick={() => { setD(planned); setTime('') }}>Back to {fmtDay(planned)}, no time</button>}
      <button className="btn full" onClick={save}>Save</button>
      <button className="btn full soft" onClick={() => { closeSheet(); useUi.getState().go('supplies', cat) }}>Open in Supplies</button>
    </Sheet>
  )
}

const REPEATS: [CalEvent['repeat'] | '', string][] = [['', 'Once'], ['week', 'Every week'], ['month', 'Every month'], ['year', 'Every year']]

const EventEdit = ({ id, date }: { id?: string; date?: string }) => {
  const st = useSt()
  const e = st.events?.find((x) => x.id === id)
  const [title, setTitle] = useState(e?.title ?? '')
  const [d, setD] = useState(e?.date ?? date ?? today())
  const [time, setTime] = useState(e?.time ?? '')
  const [repeat, setRepeat] = useState<CalEvent['repeat'] | ''>(e?.repeat ?? '')
  const [note, setNote] = useState(e?.note ?? '')
  const [armed, setArmed] = useState(false)
  const save = () => {
    if (!title.trim() || !d) return
    update((s) => {
      s.events ??= []
      const data = { title: title.trim(), date: d, time: time || undefined, repeat: repeat || undefined, note: note.trim() || undefined }
      const x = s.events.find((y) => y.id === id)
      if (x) Object.assign(x, data)
      else s.events.push({ id: uid(), ...data })
    })
    if (e) popSheet()
    else { popSheet(false); popSheet(false) } // back past the Add page to the calendar
  }
  return (
    <Sheet title={e ? 'Appointment' : 'New appointment'} onBack={popSheet}>
      <Field label="What"><input className="input" autoFocus={!e} value={title} placeholder="Dentist, call with Ana…" onChange={(x) => setTitle(x.target.value)} /></Field>
      <div className="row" style={{ gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}><Field label="Date"><input className="input" type="date" value={d} onChange={(x) => setD(x.target.value)} /></Field></div>
        <div style={{ flex: 1, minWidth: 0 }}><Field label="Time"><input className="input" type="time" value={time} onChange={(x) => setTime(x.target.value)} /></Field></div>
      </div>
      <Field label="Repeats">
        <div className="seg">{REPEATS.map(([k, l]) => <button key={l} type="button" className={'chip' + (repeat === k ? ' on' : '')} onClick={() => setRepeat(k)}>{l}</button>)}</div>
      </Field>
      <Field label="Note"><input className="input" value={note} placeholder="Address, what to bring…" onChange={(x) => setNote(x.target.value)} /></Field>
      <button className="btn full" disabled={!title.trim() || !d} onClick={save}>Save</button>
      {e && <button className="btn full soft" style={armed ? { color: 'var(--alert)' } : undefined} onClick={() => {
        if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 3000); return }
        update((s) => { s.events = (s.events ?? []).filter((y) => y.id !== id) }); popSheet()
      }}>{armed ? 'Tap again to delete' : e.repeat ? 'Delete (every time)' : 'Delete'}</button>}
    </Sheet>
  )
}

// Settings › Calendar: what the calendar shows from the tabs
export const CalendarSettings = () => {
  const st = useSt()
  const on = st.settings.calendar ?? {}
  const flip = (k: CalKey) => update((d) => { d.settings = { ...d.settings, calendar: { ...(d.settings.calendar ?? {}), [k]: !on[k] || undefined } } })
  return (
    <Sheet title="Calendar" full onBack={popSheet}>
      <span className="t15 muted">Your own appointments are always there. Choose what else the calendar shows from the tabs.</span>
      <div className="list">
        {CAL_OPTIONS.map(([k, label]) => (
          <button key={k} className="lrow" onClick={() => flip(k)}>
            <span className="grow" style={{ textAlign: 'left' }}><div className="title">{label}</div></span>
            <span className={'switch' + (on[k] ? ' on' : '')} role="switch" aria-checked={!!on[k]} aria-label={label}><i /></span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}
