import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { update, useSt, useStore } from './store'
import type { CalEvent, CalKey, State } from './types'
import { DayWeather, PlaceSheet, placeName } from './weather'
import {
  addDays, CAT_LABEL, careNext, classBatch, creditSchedule, daysInMonth, fmtCur, fmtDay, fmtWeekday, monthName, nextBuy, nextMonth, pad, parse,
  prevMonth, diffDays, subDate, taxPays, fmtTax, timeSpan, today, uid, classEnd, classTime, movedAway, toggleClass, rescheduleClass,
  taskGone, tickTask,
} from './lib'
import { MODE_HOURS, MODE_NAME, occurrences, onceKey, type Occurrence } from './cleaning'
import { moveOcc } from './screens/Cleaning'
import { getLang, monthNames, tr, trn, weekdayNames } from './i18n'
import { C, Check, closeSheet, Field, Header, Icon, List, openSheet, popSheet, pushSheet, Row, Sheet, TimeRange, toast, useUi, type Tab as UiTab } from './ui'
import { ShipmentSheet } from './screens/Shipments'
import { dotOf, TaskSheet } from './screens/Today'

// Calendar (its own page, to the left of Today): your own appointments, plus whatever you chose in
// its settings (the gear on the page) from the tabs. It only shows the tabs' things — they still live in their tabs,
// so it's never out of date. Tap one to go there; deliveries and classes can be ticked / cancelled here.

// 'Period' and 'Name' mean something else elsewhere in the dictionary (tax period, a thing's name)
const perWord = () => (getLang() === 'en' ? 'Period' : tr('Period (cycle)'))
const cleanName = (m: 1 | 2 | 3) => tr(`${MODE_NAME[m]} clean`)

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
  const n = Math.max(1, Math.round(e.every || 1))
  if (e.repeat === 'week' || e.repeat === 'day') {
    const step = (e.repeat === 'week' ? 7 : 1) * n
    let d = e.date
    if (d < from) d = addDays(d, Math.ceil((parse(from).getTime() - d0.getTime()) / 86400000 / step) * step)
    for (; d <= to; d = addDays(d, step)) if (d >= from) out.push(d)
  } else {
    const m0 = d0.getFullYear() * 12 + d0.getMonth()
    for (const mk of monthsIn(from, to)) {
      if (e.repeat === 'year' && +mk.slice(5, 7) !== d0.getMonth() + 1) continue
      if (e.repeat === 'month' && ((+mk.slice(0, 4) * 12 + +mk.slice(5, 7) - 1) - m0) % n) continue
      const d = dayIn(mk, d0.getDate())
      if (d >= e.date && d >= from && d <= to) out.push(d)
    }
  }
  return out
}


// Period tracking: first days you logged (or confirmed) plus predictions every cycle after the latest one
const PERIOD = '#E8798F'
export const periodCycle = (st: State) => Math.min(60, Math.max(15, Math.round(st.settings.period?.cycle || 28)))
const lastPeriod = (st: State) => (st.periodStarts ?? []).reduce((a, b) => (b > a ? b : a), '')
const predictedPeriods = (st: State, to: string) => {
  const last = lastPeriod(st), c = periodCycle(st), out: string[] = []
  if (last) for (let d = addDays(last, c); d <= to; d = addDays(d, c)) out.push(d)
  return out
}
export const periodDays = (st: State) => Math.min(10, Math.max(1, Math.round(st.settings.period?.days || 5))) // how long a period lasts, for the phases

export const calItems = (st: State, from: string, to: string): Item[] => {
  const on = st.settings.calendar ?? {}
  const out: Item[] = []
  const t = today()
  // Parking lot tasks given a day (always shown, like your own appointments);
  // not ticked done and its day has passed → it rolls on to today, day by day, until ticked
  for (const x of st.tasks ?? []) {
    if (!x.date || taskGone(x)) continue
    const late = !x.doneAt && x.date < t
    const d = late ? t : x.date
    if (d < from || d > to) continue
    out.push({
    id: 'task-' + x.id, date: d, title: x.text, time: timeSpan(x.time, x.end), meta: late ? `${tr('Parking lot')} · ${tr('overdue')}` : tr('Parking lot'), dot: dotOf(x.color), done: !!x.doneAt,
    edit: () => <TaskSheet id={x.id} back={1} />,
    toggle: { on: !!x.doneAt, run: () => update((s) => { const y = s.tasks?.find((z) => z.id === x.id); if (!y) return; if (late) y.date = d; tickTask(y) }) }
  }) }
  // birthdays: every year on their day (29 Feb falls on the 28th in other years)
  for (const b of st.birthdays ?? []) for (let y = +from.slice(0, 4); y <= +to.slice(0, 4); y++) {
    const d = dayIn(`${y}-${b.md.slice(0, 2)}`, +b.md.slice(3))
    if (d >= from && d <= to) out.push({ id: `bd-${b.id}-${y}`, date: d, title: tr('{name}’s birthday', { name: b.name }), meta: b.year && y > b.year ? tr('Turns {n}', { n: y - b.year }) : tr('Birthday'), dot: C.warn, edit: () => <BirthdayEdit id={b.id} /> })
  }
  if (st.settings.period?.on) {
    for (const d of st.periodStarts ?? []) if (d >= from && d <= to) out.push({ id: 'per-' + d, date: d, title: perWord(), meta: tr('First day'), dot: PERIOD, edit: () => <PeriodEdit date={d} /> })
    for (const d of predictedPeriods(st, to)) if (d >= from) out.push({ id: 'perp-' + d, date: d, title: perWord(), meta: tr('Predicted'), dot: PERIOD, edit: () => <PeriodEdit date={d} predicted /> })
  }
  for (const e of st.events ?? []) for (const d of eventDates(e, from, to)) out.push({ id: `ev-${e.id}-${d}`, date: d, title: e.title, time: timeSpan(e.time, e.end), meta: e.note, dot: C.ink, event: e })
  if (on.taxes) for (const mk of monthsIn(from, to)) {
    for (const x of taxPays(st, mk)) {
      if (x.amount <= 0) continue
      const paidPart = x.groups.filter((g) => g.paid).map((g) => g.name).join(' + ')
      if (x.pay >= from && x.pay <= to) out.push({ id: `tax-${x.pay}`, date: x.pay, title: x.paid ? x.name : x.leftName, meta: `${tr('for {x}', { x: x.forName })} · ${fmtTax(st.settings, x.paid ? x.amount : x.left, true)}${x.paid ? ` · ${tr('paid')}` : paidPart ? ` · ${tr('{x} paid', { x: paidPart })}` : ''}`, dot: C.money, done: x.paid, go: ['money', 'taxes'] })
      if (!x.paid && x.due !== x.pay && x.due >= from && x.due <= to) out.push({ id: `taxdl-${x.pay}`, date: x.due, title: tr('Tax deadline'), meta: tr('{x} for {y}', { x: x.leftName, y: x.forName }), dot: C.alert, go: ['money', 'taxes'] })
    }
  }
  if (on.subs) for (const s of st.subscriptions.filter((x) => !x.paused)) for (const mk of monthsIn(from, to)) {
    const d = subDate(s, mk)
    if (d >= from && d <= to) out.push({ id: `sub-${s.id}-${d}`, date: d, title: s.name, meta: `${tr('Subscription')} · ${fmtCur(s.amount, s.currency)}`, dot: C.money, go: ['money', 'subs'] })
  }
  if (on.credits) for (const c of st.credits ?? []) for (const x of creditSchedule(c)) {
    if (x.date >= from && x.date <= to) out.push({ id: `cr-${c.id}-${x.n}`, date: x.date, title: c.name, meta: `${tr('Credit · payment {n} of {c}', { n: x.n, c: c.count })} · ${fmtCur(x.amount, c.currency)}`, dot: C.money, done: x.date < t, go: ['money', 'credits'] })
  }
  if (on.classes) for (const c of st.classes ?? []) {
    const paid = new Set(c.pays.flatMap((p) => p.dates))
    const dates = new Set<string>()
    for (let d = from < c.since ? c.since : from; d <= to; d = addDays(d, 1)) if (c.days.includes(parse(d).getDay())) dates.add(d)
    for (const x of c.extra) if (x >= from && x <= to && x >= c.since) dates.add(x)
    const away = movedAway(c)
    for (const d of dates) {
      if (away.has(d)) continue
      const off = c.skips.includes(d)
      out.push({
        id: `cl-${c.id}-${d}`, date: d, title: c.name, time: classTime(c, d), dot: C.money, done: off, go: ['money', 'classes'],
        meta: [tr('Class'), c.moved?.[d] ? tr('moved from {d}', { d: fmtDay(c.moved[d]) }) : c.extra.includes(d) ? tr('extra') : '', off ? tr('cancelled') : paid.has(d) ? tr('paid') : ''].filter(Boolean).join(' · '),
        edit: off ? undefined : () => <ClassWhen id={c.id} date={d} />,
        toggle: paid.has(d) ? undefined : { on: !off, label: [tr('Cancel'), tr('Bring back')], run: () => update((s) => { const L = s.classes?.find((y) => y.id === c.id); if (L) toggleClass(L, d) }) }
      })
    }
    if (c.payEvery !== 'class') {
      const b = classBatch(st, c)
      if (b && b.due >= from && b.due <= to) out.push({ id: `clpay-${c.id}`, date: b.due, title: tr('Pay for {x}', { x: c.name }), meta: `${trn(b.dates.length, '{n} class', '{n} classes')} · ${monthName(b.month, true)}`, dot: C.money, go: ['money', 'classes'] })
    }
  }
  if (on.selfcare) {
    // only the next time of each (the one date the Selfcare tab keeps); overdue ones sit on today
    for (const x of st.selfcare ?? []) {
      if (x.paused) continue
      const d = careNext(x, t)
      if (d >= from && d <= to) out.push({ id: `care-${x.id}`, date: d, title: x.name, time: timeSpan(x.time, x.endTime), meta: x.next < t ? `${tr('Selfcare')} · ${tr('overdue')}` : tr('Selfcare'), dot: C.closet, go: ['money', 'selfcare'], edit: () => <CareWhen id={x.id} /> })
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
      const title = `${tr('Shopping')} · ${tr(CAT_LABEL[r.cat])}`
      out.push({ id: 'shop-' + key, date: d, time: timeSpan(plan?.time, plan?.end), title, meta: r.names.slice(0, 3).join(', ') + (r.names.length > 3 ? ` +${r.names.length - 3}` : ''), dot: C.supplies, go: ['supplies', r.cat], edit: () => <ShopWhen k={key} planned={r.date} title={title} cat={r.cat} /> })
    }
  }
  if (on.deliveries) for (const x of st.shipments ?? []) {
    // not ticked as delivered/collected yet and its day has passed → it rolls on to today, day by day, until ticked
    const late = !x.deliveredAt && !!x.eta && x.eta < t
    const d = late ? t : x.eta ?? x.deliveredAt
    if (!d || d < from || d > to) continue
    out.push({
      id: 'sh-' + x.id, date: d, title: x.name, meta: `${tr('Delivery')} · ${x.courier || tr('courier')}${x.deliveredAt ? ` · ${tr('delivered')}` : late ? ` · ${tr('overdue')}` : ''}`, dot: C.supplies, done: !!x.deliveredAt, go: ['today'], edit: () => <ShipmentSheet id={x.id} back={1} />,
      toggle: { on: !!x.deliveredAt, run: () => update((s) => { const y = s.shipments?.find((z) => z.id === x.id); if (y) y.deliveredAt = y.deliveredAt ? undefined : today() }) }
    })
  }
  if (on.cleaning) for (const o of occurrences(st, from, to)) out.push({ id: 'cln-' + o.key, date: o.date, time: timeSpan(o.start, o.end), title: cleanName(o.mode), meta: o.sched && o.sched !== o.date ? `${tr('Cleaning')} · ${tr('moved from {d}', { d: fmtDay(o.sched) })}` : tr('Cleaning'), dot: C.home, go: ['home', 'cleaning'], edit: () => <CleanWhen occ={o} /> })
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '99').localeCompare(b.time ?? '99') || a.title.localeCompare(b.title))
}

// Monday first; names in the app language
const WD = () => { const w = weekdayNames(); return [...w.slice(1), w[0]] }
const LONG_WD = () => weekdayNames(true)
// the month title above the grid starts with a capital (Ukrainian month names are lowercase elsewhere)
const cap = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1)

export const CalendarPage = () => {
  const st = useSt()
  const t = today()
  const [mk, setMk] = useState(t.slice(0, 7))
  const [sel, setSel] = useState(t)
  // the three months on the track: previous, this one, next (the grid follows the finger between them)
  const span = (m: string) => {
    const first = `${m}-01`
    const start = addDays(first, -((parse(first).getDay() + 6) % 7))
    const weeks = 6 // always six rows, so the grid never changes height between months
    return { start, weeks, end: addDays(start, weeks * 7 - 1) }
  }
  const months = [prevMonth(mk), mk, nextMonth(mk)]
  const from = span(months[0]).start, to = span(months[2]).end
  const items = calItems(st, from < sel ? from : sel, to > sel ? to : sel)
  const byDay = new Map<string, Item[]>()
  for (const i of items) { const a = byDay.get(i.date) ?? []; a.push(i); byDay.set(i.date, a) }
  const dayItems = byDay.get(sel) ?? []
  const anyOn = Object.values(st.settings.calendar ?? {}).some(Boolean)
  const go = (m: string) => { setMk(m); setSel(m === t.slice(0, 7) ? t : `${m}-01`) }
  const view = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; t: number; lock?: 'h' | 'v'; dx: number } | null>(null)
  const busy = useRef(false)
  const GAP = 0 // the months sit edge to edge, like one long strip
  const place = (dx: number, how = 'none') => { const el = track.current; if (!el) return; el.style.transition = how; el.style.transform = `translateX(${-((view.current?.offsetWidth ?? 360) + GAP) + dx}px)` }
  // slide to the next / previous month (or back to this one), then make that month the middle one
  const slide = (dir: -1 | 0 | 1) => {
    const w = view.current?.offsetWidth ?? 360
    if (busy.current) return
    if (!dir) { place(0, 'transform .22s cubic-bezier(.2,.8,.2,1)'); return }
    busy.current = true
    place(-dir * (w + GAP), 'transform .24s cubic-bezier(.2,.8,.2,1)')
    setTimeout(() => {
      flushSync(() => go(dir > 0 ? nextMonth(mk) : prevMonth(mk)))
      place(0)
      busy.current = false
    }, 240)
  }
  useLayoutEffect(() => { if (!busy.current && !drag.current) place(0) })
  const open = (i: Item) => {
    if (i.event) { pushSheet(<EventEdit id={i.event.id} />); return }
    if (i.edit) { pushSheet(i.edit()); return }
    if (!i.go) return
    useUi.getState().go(i.go[0], i.go[1]) // closes the calendar too
  }
  const sd = parse(sel)
  return (
    <div className="calscreen">
      <Header sub={`${LONG_WD()[parse(t).getDay()]}, ${fmtDay(t)}`} title="Calendar" right={<button className="hdr-gear" aria-label={tr('Calendar settings')} onClick={() => openSheet(<CalendarSettings />)}><Icon.gear /></button>} />
      <div className="between" style={{ alignItems: 'center' }}>
        <button className="cal-nav" aria-label={tr('Previous month')} onClick={() => slide(-1)}><Icon.chevL /></button>
        <button className="mid" onClick={() => go(t.slice(0, 7))}>{cap(monthNames(true)[+mk.slice(5, 7) - 1])}{mk.slice(0, 4) !== t.slice(0, 4) ? ` ${mk.slice(0, 4)}` : ''}</button>
        <button className="cal-nav" aria-label={tr('Next month')} onClick={() => slide(1)}><Icon.chevR /></button>
      </div>
      <div className="cal-view noswipe" ref={view}
        onTouchStart={(e) => { if (!busy.current) drag.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now(), dx: 0 } }}
        onTouchMove={(e) => {
          const g = drag.current
          if (!g) return
          const dx = e.touches[0].clientX - g.x, dy = e.touches[0].clientY - g.y
          if (!g.lock) { if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; g.lock = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v' }
          if (g.lock !== 'h') return
          g.dx = dx; place(dx)
        }}
        onTouchEnd={() => {
          const g = drag.current; drag.current = null
          if (!g || g.lock !== 'h') return
          const w = view.current?.offsetWidth ?? 360
          const fast = Math.abs(g.dx) / Math.max(1, Date.now() - g.t) > 0.4 && Math.abs(g.dx) > 30
          slide(Math.abs(g.dx) > w * 0.25 || fast ? (g.dx < 0 ? 1 : -1) : 0)
        }}>
        <div className="cal-track" ref={track}>
          {months.map((m) => {
            const { start, weeks } = span(m)
            return (
              <div key={m} className="cal">
                {WD().map((w) => <span key={w} className="cal-wd">{w}</span>)}
                {Array.from({ length: weeks * 7 }, (_, i) => {
                  const d = addDays(start, i)
                  const dots = [...new Set((byDay.get(d) ?? []).filter((x) => !x.done).map((x) => x.dot))].slice(0, 3)
                  return (
                    <button key={d} className={'cal-day' + (d.slice(0, 7) !== m ? ' out' : '') + (d === t ? ' today' : '') + (d === sel && m === mk ? ' sel' : '')} onClick={() => setSel(d)}>
                      <span className="n">{+d.slice(8)}</span>
                      <span className="dots">{dots.map((c) => <i key={c} style={{ background: c }} />)}</span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
      <List title={`${LONG_WD()[sd.getDay()]}, ${fmtDay(sel)}`} right={sel === t ? 'today' : undefined}
        empty={dayItems.length ? undefined : 'Nothing planned.'}>
        {dayItems.map((i) => (
          <Row key={i.id} dot={i.dot} done={i.done} title={i.title}
            meta={[i.time, i.meta].filter(Boolean).join(' · ') || undefined}
            trail={i.toggle
              ? i.toggle.label
                ? <span role="button" className="t15 w5 muted" onClick={(e) => { e.stopPropagation(); i.toggle!.run() }} style={{ padding: '6px 2px', margin: '-6px -2px' }}>{i.toggle.on ? i.toggle.label[0] : i.toggle.label[1]}</span>
                : <span onClick={(e) => { e.stopPropagation(); i.toggle!.run() }} style={{ display: 'flex', padding: 4, margin: -4 }}><Check on={i.toggle.on} /></span>
              : i.go || i.event || i.edit ? <Icon.chevR /> : undefined}
            onClick={i.go || i.event || i.edit ? () => open(i) : undefined} />
        ))}
        <Row title={<span className="muted">{tr('+ Add on {d}', { d: fmtDay(sel) })}</span>} onClick={() => pushSheet(<AddSheet date={sel} />)} />
      </List>
      <CyclePhase date={sel} />
      <DayWeather date={sel} />
      {!anyOn && <span className="t13 muted" style={{ padding: '0 4px' }}>{tr('Want taxes, classes, deliveries and more here too? Choose them with the gear above.')}</span>}
    </div>
  )
}

// + on a day: your own appointment, or something that lives in a tab
const AddSheet = ({ date }: { date: string }) => {
  const st = useSt()
  const classes = st.classes ?? []
  const open = (st.tasks ?? []).filter((x) => !x.doneAt && x.date !== date)
  const opt = (title: string, meta: string, run: () => void) => <Row title={tr(title)} meta={tr(meta)} trail={<Icon.chevR />} onClick={run} />
  return (
    <Sheet title={tr('Add on {d}', { d: fmtDay(date) })} onBack={popSheet}>
      <List>
        {opt('Appointment', 'Your own — not tied to any tab', () => pushSheet(<EventEdit date={date} />))}
        {opt('Parking lot task', 'New, or one already on the Parking lot', () => pushSheet(open.length ? <TaskPick date={date} /> : <TaskSheet date={date} back={2} />))}
        {opt('Birthday', 'Here every year on that day', () => pushSheet(<BirthdayEdit date={date} />))}
        {st.settings.period?.on && opt('Period started', 'First day — the predictions move with it', () => pushSheet(<PeriodEdit date={date} add />))}
        {opt('Delivery', 'Goes on the Shipment log', () => pushSheet(<ShipmentSheet eta={date} back={2} />))}
        {classes.map((c) => opt(tr('Extra {x} class', { x: c.name }), c.time ? tr('At {t}', { t: timeSpan(c.time, classEnd(c)) ?? '' }) : 'One extra class that day', () => {
          update((d) => { const L = d.classes?.find((y) => y.id === c.id); if (!L) return; L.skips = L.skips.filter((y) => y !== date); if (!L.extra.includes(date)) L.extra.push(date) })
          popSheet(); toast(tr('Extra {x} class on {d}', { x: c.name, d: fmtDay(date) }))
        }))}
      </List>
    </Sheet>
  )
}

// Parking lot task on a day: one that's already there, or a new one
const TaskPick = ({ date }: { date: string }) => {
  const st = useSt()
  const open = (st.tasks ?? []).filter((x) => !x.doneAt && x.date !== date)
  const put = (id: string) => {
    update((s) => { const y = s.tasks?.find((z) => z.id === id); if (y) y.date = date })
    popSheet(false); popSheet(false)
    toast(tr('On {d}', { d: fmtDay(date) }))
  }
  return (
    <Sheet title="Parking lot task" onBack={popSheet}>
      <List>
        {open.map((x) => <Row key={x.id} dot={dotOf(x.color)} title={x.text} meta={x.date ? tr('On {d}', { d: fmtDay(x.date) }) : undefined} onClick={() => put(x.id)} />)}
        <Row title={<span className="muted">{tr('+ New task')}</span>} onClick={() => pushSheet(<TaskSheet date={date} back={3} />)} />
      </List>
    </Sheet>
  )
}

// a birthday: there every year; with the year it shows how old they turn
const BirthdayEdit = ({ id, date }: { id?: string; date?: string }) => {
  const st = useSt()
  const b = st.birthdays?.find((x) => x.id === id)
  const [name, setName] = useState(b?.name ?? '')
  const [d, setD] = useState(b ? `${b.year ?? today().slice(0, 4)}-${b.md}` : date ?? today())
  const [age, setAge] = useState(!!b?.year)
  const [armed, setArmed] = useState(false)
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 3000); return () => clearTimeout(t) }, [armed])
  const save = () => {
    if (!name.trim() || !d) return
    update((s) => {
      s.birthdays ??= []
      const data = { name: name.trim(), md: d.slice(5), year: age ? +d.slice(0, 4) : undefined }
      const x = s.birthdays.find((y) => y.id === id)
      if (x) Object.assign(x, data)
      else s.birthdays.push({ id: uid(), ...data })
    })
    if (b) popSheet()
    else { popSheet(false); popSheet(false) }
  }
  return (
    <Sheet title={b ? 'Birthday' : 'New birthday'} onBack={popSheet}>
      <Field label="Whose"><input className="input" autoFocus={!b} value={name} placeholder={getLang() === 'en' ? 'Name' : tr('Name (person)')} onChange={(x) => setName(x.target.value)} /></Field>
      <Field label="Date"><input className="input" type="date" value={d} onChange={(x) => setD(x.target.value)} /></Field>
      <button className="row" style={{ gap: 12, padding: '4px 0' }} onClick={() => setAge(!age)}>
        <span className="t15 grow" style={{ textAlign: 'left' }}>{tr('Show their age (the year above is the year they were born)')}</span>
        <span className={'switch' + (age ? ' on' : '')} role="switch" aria-checked={age} aria-label={tr('Show their age')}><i /></span>
      </button>
      <button className="btn full" disabled={!name.trim() || !d} onClick={save}>{tr('Save')}</button>
      {b && <button className="btn full soft" style={armed ? { color: 'var(--alert)', borderColor: 'var(--alert)' } : undefined} onClick={() => {
        if (!armed) { setArmed(true); return }
        update((s) => { s.birthdays = (s.birthdays ?? []).filter((y) => y.id !== id) }); popSheet()
      }}>{tr('Delete')}</button>}
    </Sheet>
  )
}

// a selfcare's next time, right from the calendar: the same date (and time) the Selfcare tab shows
const CareWhen = ({ id }: { id: string }) => {
  const st = useSt()
  const x = st.selfcare?.find((y) => y.id === id)
  const [d, setD] = useState(x ? careNext(x) : today())
  const [time, setTime] = useState(x?.time ?? '')
  const [end, setEnd] = useState(x?.endTime ?? '')
  if (!x) return null
  return (
    <Sheet title={x.name} onBack={popSheet}>
      <span className="t15 muted">{tr('Next time — changing it here changes it in Selfcare too.')}</span>
      <Field label="Date"><input className="input" type="date" value={d} onChange={(e) => setD(e.target.value)} /></Field>
      <TimeRange start={time} end={end} onChange={(a, b) => { setTime(a); setEnd(b) }} />
      <button className="btn full" disabled={!d} onClick={() => { update((s) => { const y = s.selfcare?.find((z) => z.id === id); if (y) { y.next = d; y.time = time || undefined; y.endTime = (time && end) || undefined } }); popSheet() }}>{tr('Save')}</button>
      <button className="btn full soft" onClick={() => { closeSheet(); useUi.getState().go('money', 'selfcare') }}>{tr('Open in Selfcare')}</button>
    </Sheet>
  )
}

// one class: another day or time, just this once (the weekly schedule stays as it is)
const ClassWhen = ({ id, date }: { id: string; date: string }) => {
  const st = useSt()
  const c = st.classes?.find((x) => x.id === id)
  const [d, setD] = useState(date)
  const [start, setStart] = useState(c?.times?.[date]?.start ?? c?.time ?? '')
  const [end, setEnd] = useState(c?.times?.[date] ? c.times[date].end ?? '' : c ? classEnd(c) ?? '' : '')
  if (!c) return null
  const paid = c.pays.some((p) => p.dates.includes(date))
  const own = c.moved?.[date]
  return (
    <Sheet title={c.name} onBack={popSheet}>
      <span className="t15 muted">{tr('Just this class — the weekly schedule stays as it is.')}{paid ? ' ' + tr('It’s paid for already, so it keeps its date.') : ''}</span>
      <Field label="Date"><input className="input" type="date" value={d} disabled={paid} onChange={(e) => setD(e.target.value || date)} /></Field>
      <TimeRange start={start} end={end} onChange={(a, b) => { setStart(a); setEnd(b) }} />
      {own && <button className="btn full soft" onClick={() => { setD(own); setStart(c.time ?? ''); setEnd(classEnd(c) ?? '') }}>{c.time ? tr('Back to {d} at {t}', { d: fmtDay(own), t: c.time }) : tr('Back to {d}', { d: fmtDay(own) })}</button>}
      <button className="btn full" onClick={() => { update((s) => { const L = s.classes?.find((y) => y.id === id); if (L) rescheduleClass(L, date, d, start, end) }); popSheet() }}>{tr('Save')}</button>
      <button className="btn full soft" onClick={() => { closeSheet(); useUi.getState().go('money', 'classes') }}>{tr('Open Classes')}</button>
    </Sheet>
  )
}

// this one clean: its day and time (the schedule stays as it is)
const CleanWhen = ({ occ }: { occ: Occurrence }) => {
  const hours = MODE_HOURS[occ.mode]
  const [d, setD] = useState(occ.date)
  const [start, setStart] = useState(occ.start ?? '')
  const [end, setEnd] = useState(occ.end ?? '')
  const save = () => {
    moveOcc(occ, d)
    const key = occ.sched ?? onceKey(occ.mode, d)
    update((s) => {
      const tm = (s.cleanPlan.times ??= {})
      if (start) tm[key] = { start, end: end || undefined }
      else delete tm[key]
    })
    popSheet()
  }
  return (
    <Sheet title={cleanName(occ.mode)} onBack={popSheet}>
      <span className="t15 muted">{tr('Just this clean — the schedule stays as it is.')} {trn(hours, 'A {m} takes about {n} hour.', 'A {m} takes about {n} hours.', { m: cleanName(occ.mode) })}</span>
      <Field label="Date"><input className="input" type="date" value={d} onChange={(e) => setD(e.target.value || occ.date)} /></Field>
      <TimeRange start={start} end={end} hours={hours} onChange={(a, b) => { setStart(a); setEnd(b) }} />
      {occ.sched && occ.sched !== occ.date && <button className="btn full soft" onClick={() => setD(occ.sched!)}>{tr('Back to {d}', { d: fmtWeekday(occ.sched) })}</button>}
      <button className="btn full" onClick={save}>{tr('Save')}</button>
      <button className="btn full soft" onClick={() => { closeSheet(); useUi.getState().go('home', 'cleaning') }}>{tr('Open Cleaning')}</button>
    </Sheet>
  )
}

// a shopping run, for planning the day only: moving it here doesn't change anything in Supplies
const ShopWhen = ({ k, planned, title, cat }: { k: string; planned: string; title: string; cat: string }) => {
  const st = useSt()
  const plan = st.shopPlans?.[k]
  const [d, setD] = useState(plan?.date ?? planned)
  const [time, setTime] = useState(plan?.time ?? '')
  const [end, setEnd] = useState(plan?.end ?? '')
  const save = () => {
    update((s) => {
      const all = (s.shopPlans ??= {})
      for (const key of Object.keys(all)) if (key.split('|')[0] < addDays(today(), -31)) delete all[key] // old ones
      if (d === planned && !time) delete all[k]
      else all[k] = { date: d, time: time || undefined, end: (time && end) || undefined }
    })
    popSheet()
  }
  return (
    <Sheet title={title} onBack={popSheet}>
      <span className="t15 muted">{tr('Planned for {d}. Moving it here is just for planning your day — Supplies stays as it is.', { d: fmtDay(planned) })}</span>
      <Field label="Date"><input className="input" type="date" value={d} onChange={(e) => setD(e.target.value || planned)} /></Field>
      <TimeRange start={time} end={end} onChange={(a, b) => { setTime(a); setEnd(b) }} />
      {(d !== planned || time) && <button className="btn full soft" onClick={() => { setD(planned); setTime(''); setEnd('') }}>{tr('Back to {d}, no time', { d: fmtDay(planned) })}</button>}
      <button className="btn full" onClick={save}>{tr('Save')}</button>
      <button className="btn full soft" onClick={() => { closeSheet(); useUi.getState().go('supplies', cat) }}>{tr('Open in Supplies')}</button>
    </Sheet>
  )
}

const REPEATS: [CalEvent['repeat'] | '', string][] = [['', 'Once'], ['week', 'Every week'], ['month', 'Every month'], ['year', 'Every year']]
const UNITS: ['day' | 'week' | 'month', string, string][] = [['day', 'day', 'days'], ['week', 'week', 'weeks'], ['month', 'month', 'months']]

const EventEdit = ({ id, date }: { id?: string; date?: string }) => {
  const st = useSt()
  const e = st.events?.find((x) => x.id === id)
  const [title, setTitle] = useState(e?.title ?? '')
  const [d, setD] = useState(e?.date ?? date ?? today())
  const [time, setTime] = useState(e?.time ?? '')
  const [end, setEnd] = useState(e?.end ?? '')
  const [repeat, setRepeat] = useState<CalEvent['repeat'] | ''>(e?.repeat ?? '')
  const [every, setEvery] = useState(Math.max(1, e?.every ?? 1))
  const [other, setOther] = useState(e?.repeat === 'day' || (e?.every ?? 1) > 1) // the Other chip: every N days / weeks / months
  const [note, setNote] = useState(e?.note ?? '')
  const [armed, setArmed] = useState(false)
  const save = () => {
    if (!title.trim() || !d) return
    update((s) => {
      s.events ??= []
      const data = { title: title.trim(), date: d, time: time || undefined, end: (time && end) || undefined, repeat: repeat || undefined, every: (other && repeat !== 'year' && every > 1) ? every : undefined, note: note.trim() || undefined }
      const x = s.events.find((y) => y.id === id)
      if (x) Object.assign(x, data)
      else s.events.push({ id: uid(), ...data })
    })
    if (e) popSheet()
    else { popSheet(false); popSheet(false) } // back past the Add page to the calendar
  }
  return (
    <Sheet title={e ? 'Appointment' : 'New appointment'} onBack={popSheet}>
      <Field label="What"><input className="input" autoFocus={!e} value={title} placeholder={tr('Dentist, call with Ana…')} onChange={(x) => setTitle(x.target.value)} /></Field>
      <Field label="Date"><input className="input" type="date" value={d} onChange={(x) => setD(x.target.value)} /></Field>
      <TimeRange start={time} end={end} onChange={(a, b) => { setTime(a); setEnd(b) }} />
      <Field label="Repeats">
        <div className="seg">
          {REPEATS.map(([k, l]) => <button key={l} type="button" className={'chip' + (!other && repeat === k ? ' on' : '')} onClick={() => { setRepeat(k); setOther(false) }}>{tr(l)}</button>)}
          <button type="button" className={'chip' + (other ? ' on' : '')} onClick={() => { setOther(true); if (!repeat || repeat === 'year') setRepeat('week'); if (every < 2) setEvery(2) }}>{tr('Other')}</button>
        </div>
        {other && (
          <div className="row" style={{ gap: 12, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="stepper">
              <button type="button" onClick={() => setEvery(Math.max(1, every - 1))}>−</button>
              <span className="mid" style={{ minWidth: 30, textAlign: 'center' }}>{every}</span>
              <button type="button" onClick={() => setEvery(Math.min(99, every + 1))}>+</button>
            </div>
            <div className="seg">{UNITS.map(([k, one, many]) => <button key={k} type="button" className={'chip' + (repeat === k ? ' on' : '')} onClick={() => setRepeat(k)}>{trn(every, one, many)}</button>)}</div>
          </div>
        )}
      </Field>
      <Field label="Note"><input className="input" value={note} placeholder={tr('Address, what to bring…')} onChange={(x) => setNote(x.target.value)} /></Field>
      <button className="btn full" disabled={!title.trim() || !d} onClick={save}>{tr('Save')}</button>
      {e && <button className="btn full soft" style={armed ? { color: 'var(--alert)' } : undefined} onClick={() => {
        if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 3000); return }
        update((s) => { s.events = (s.events ?? []).filter((y) => y.id !== id) }); popSheet()
      }}>{tr(armed ? 'Tap again to delete' : e.repeat ? 'Delete (every time)' : 'Delete')}</button>}
    </Sheet>
  )
}

// one period's first day: a logged one (change or delete it) or a predicted one (confirm it, or set the day it really started)
const PeriodEdit = ({ date, predicted, add }: { date: string; predicted?: boolean; add?: boolean }) => {
  const st = useSt()
  const [d, setD] = useState(date)
  const [armed, setArmed] = useState(false)
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 3000); return () => clearTimeout(t) }, [armed])
  const logged = !predicted && !add
  const save = () => {
    if (!d) return
    update((s) => { const L = (s.periodStarts ?? []).filter((x) => !logged || x !== date); if (!L.includes(d)) L.push(d); s.periodStarts = L.sort() })
    if (add) { popSheet(false); popSheet(false) } else popSheet()
  }
  return (
    <Sheet title={add ? tr('Period started') : perWord()} onBack={popSheet}>
      <span className="t15 muted">{predicted
        ? trn(periodCycle(st), 'Predicted from your last period and a {n}-day cycle. If it starts earlier or later, set the day it started — the next ones move with it.', 'Predicted from your last period and a {n}-day cycle. If it starts earlier or later, set the day it started — the next ones move with it.')
        : tr('The first day of your period. The next ones are predicted from your latest one.')}</span>
      <Field label="First day"><input className="input" type="date" value={d} onChange={(e) => setD(e.target.value)} /></Field>
      <button className="btn full" disabled={!d} onClick={save}>{tr(predicted ? 'It started on this day' : 'Save')}</button>
      {logged && <button className="btn full soft" style={armed ? { color: 'var(--alert)', borderColor: 'var(--alert)' } : undefined} onClick={() => {
        if (!armed) { setArmed(true); return }
        update((s) => { s.periodStarts = (s.periodStarts ?? []).filter((x) => x !== date) }); popSheet()
      }}>{tr('Delete')}</button>}
    </Sheet>
  )
}

// the day's cycle phase, under the day list (Settings › Calendar › Show cycle phases on calendar)
const CyclePhase = ({ date }: { date: string }) => {
  const st = useSt()
  const p = st.settings.period
  if (!p?.on || !p.phases) return null
  const c = periodCycle(st)
  const all = [...(st.periodStarts ?? []), ...predictedPeriods(st, addDays(date, c))].sort()
  const start = all.filter((x) => x <= date).pop()
  if (!start) return null
  const n = diffDays(start, date) + 1
  const pd = periodDays(st)
  const ov = Math.max(pd + 2, c - 14) // ovulation day
  const [name, words] = n <= pd ? ['Menstrual phase', perWord()]
    : n < ov - 1 ? ['Follicular phase', 'Energy building up']
    : n <= ov + 1 ? ['Ovulation', 'Peak energy']
    : ['Luteal phase', 'Winding down']
  const next = all.find((x) => x > date)
  return (
    <List>
      <Row dot={PERIOD} title={tr(name)} meta={[tr('Day {n} of {c}', { n, c }), tr(words), next ? tr('next period {d}', { d: fmtDay(next) }) : ''].filter(Boolean).join(' · ')} />
    </List>
  )
}

// Settings › Calendar: what the calendar shows from the tabs
export const CalendarSettings = () => {
  const st = useSt()
  const on = st.settings.calendar ?? {}
  const flip = (k: CalKey) => update((d) => { d.settings = { ...d.settings, calendar: { ...(d.settings.calendar ?? {}), [k]: !on[k] || undefined } } })
  return (
    <Sheet title="Calendar settings">
      <span className="t15 muted">{tr('Your own appointments and birthdays are always there. Choose what else the calendar shows from the tabs.')}</span>
      <div className="list">
        {CAL_OPTIONS.map(([k, label]) => (
          <button key={k} className="lrow" onClick={() => flip(k)}>
            <span className="grow" style={{ textAlign: 'left' }}><div className="title">{tr(label)}</div></span>
            <span className={'switch' + (on[k] ? ' on' : '')} role="switch" aria-checked={!!on[k]} aria-label={tr(label)}><i /></span>
          </button>
        ))}
      </div>
      <div className="list">
        <button className="lrow" onClick={() => update((d) => { d.settings = { ...d.settings, weatherOff: d.settings.weatherOff ? undefined : true } })}>
          <span className="grow" style={{ textAlign: 'left' }}><div className="title">{tr('Weather')}</div>{st.settings.weather && <div className="meta">{placeName(st.settings.weather)}</div>}</span>
          <span className={'switch' + (!st.settings.weatherOff ? ' on' : '')} role="switch" aria-checked={!st.settings.weatherOff} aria-label={tr('Weather')}><i /></span>
        </button>
        {!st.settings.weatherOff && <Row title={tr(st.settings.weather ? 'Change city' : 'Choose your city')} trail={<Icon.chevR />} onClick={() => pushSheet(<PlaceSheet />)} />}
      </div>
      <PeriodSettings />
    </Sheet>
  )
}

// Settings › Calendar › Period tracking
const PeriodSettings = () => {
  const st = useSt()
  const p = st.settings.period ?? {}
  const setP = (x: Partial<NonNullable<State['settings']['period']>>) => update((d) => { d.settings = { ...d.settings, period: { ...(d.settings.period ?? {}), ...x } } })
  const last = lastPeriod(st)
  const [cyc, setCyc] = useState(String(periodCycle(st)))
  const [len, setLen] = useState(String(periodDays(st)))
  const sw = (on: boolean, label: string, run: () => void, meta?: string) => (
    <button className="lrow" onClick={run}>
      <span className="grow" style={{ textAlign: 'left' }}><div className="title">{tr(label)}</div>{meta && <div className="meta">{tr(meta)}</div>}</span>
      <span className={'switch' + (on ? ' on' : '')} role="switch" aria-checked={on} aria-label={tr(label)}><i /></span>
    </button>
  )
  return (
    <List title="Period tracking">
      {sw(!!p.on, 'Track my period', () => setP({ on: !p.on || undefined }))}
      {p.on && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 16px 10px' }}>
          <Field label="First day of last period">
            <input className="input" type="date" value={last} onChange={(e) => {
              const v = e.target.value
              if (!v) return
              update((s) => { const L = (s.periodStarts ?? []).filter((x) => x !== last); if (!L.includes(v)) L.push(v); s.periodStarts = L.sort() })
            }} />
          </Field>
          <Field label="Cycle length, days">
            <input className="input" inputMode="numeric" value={cyc} onChange={(e) => {
              const v = e.target.value.replace(/[^0-9]/g, '')
              setCyc(v)
              if (+v >= 15 && +v <= 60) setP({ cycle: +v })
            }} onBlur={() => setCyc(String(periodCycle(useStore.getState().st)))} />
          </Field>
          <Field label="Period length, days">
            <input className="input" inputMode="numeric" value={len} onChange={(e) => {
              const v = e.target.value.replace(/[^0-9]/g, '')
              setLen(v)
              if (+v >= 1 && +v <= 10) setP({ days: +v })
            }} onBlur={() => setLen(String(periodDays(useStore.getState().st)))} />
          </Field>
        </div>
      )}
      {p.on && sw(!!p.phases, 'Show cycle phases on calendar', () => setP({ phases: !p.phases || undefined }), 'Under the day in the calendar')}
    </List>
  )
}
