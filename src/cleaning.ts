import type { CleanMode, CleanPlan, CleanRepeat, CleanSchedule, CleanTask, State } from './types'
import { addDays, diffDays, parse, today, uid, ymd } from './lib'
import { tr, weekdayNames } from './i18n'

export const MODE_NAME: Record<CleanMode, string> = { 1: 'Light', 2: 'Regular', 3: 'Extra' }
export const MODE_HOURS: Record<CleanMode, number> = { 1: 2, 2: 4, 3: 8 } // how long each kind of clean takes
export const MODES: CleanMode[] = [1, 2, 3]
export { addHours } from './lib'

// starter lists for any home — people edit them to fit theirs
const LIGHT = ['Tidy up and put things away', 'Wash the dishes', 'Wipe the kitchen counters', 'Clean the kitchen sink', 'Wipe the table', 'Clean the bathroom sink', 'Clean the toilet', 'Vacuum', 'Take out the trash']
const REGULAR = ['Tidy up and put things away', 'Change the bedsheets', 'Wash the towels', 'Dust the surfaces', 'Clean the mirrors', 'Wipe the kitchen counters', 'Clean the stove top', 'Clean the microwave', 'Clean the kitchen sink', 'Wipe the table', 'Clean the shower or bath', 'Clean the bathroom sink', 'Clean the toilet', 'Vacuum', 'Mop the floors', 'Take out the trash']
const EXTRA = ['Declutter one area', 'Change the bedsheets', 'Wash the towels', 'Wash the curtains', 'Wash rugs and throws', 'Wash the windows', 'Dust lamps and light fittings', 'Dust the surfaces', 'Wipe doors and light switches', 'Clean the mirrors', 'Clean inside the fridge', 'Clean the oven', 'Wipe the kitchen cabinets', 'Descale the kettle', 'Wipe the kitchen counters', 'Clean the stove top', 'Clean the microwave', 'Clean the kitchen sink', 'Clean the washing machine', 'Clean the shower or bath', 'Clean the bathroom sink', 'Clean the toilet', 'Wipe the baseboards', 'Vacuum under the furniture', 'Vacuum', 'Mop the floors', 'Take out the trash']

export const defaultCleanTasks = (): CleanTask[] => [
  ...LIGHT.map((name) => ({ id: uid(), name, mode: 1 as CleanMode })),
  ...REGULAR.map((name) => ({ id: uid(), name, mode: 2 as CleanMode })),
  ...EXTRA.map((name) => ({ id: uid(), name, mode: 3 as CleanMode }))
]

const off = (): CleanSchedule => ({ every: 'off', day: 6, from: today() })
// nothing is planned until people say when they clean
export const defaultCleanPlan = (): CleanPlan => ({ sched: { 1: off(), 2: off(), 3: off() }, once: {}, moves: {}, extras: [], skips: [], start: today() })

export const onOrAfter = (d: string, day: number) => addDays(d, (day - parse(d).getDay() + 7) % 7)
export const schedOf = (p: CleanPlan, m: CleanMode): CleanSchedule => p.sched?.[m] ?? off()
const WEEKS: Partial<Record<CleanRepeat, number>> = { week: 1, '2weeks': 2, '3weeks': 3, '4weeks': 4 }
const nthOf = (d: string) => Math.min(4, Math.ceil(parse(d).getDate() / 7))
// the nth <weekday> of the month mk ('YYYY-MM')
const nthWeekday = (y: number, m: number, day: number, n: number) => addDays(onOrAfter(ymd(new Date(y, m, 1)), day), 7 * (n - 1))

// the dates a schedule puts a clean on, in [from, to]
export const schedDates = (s: CleanSchedule, from: string, to: string): string[] => {
  const out: string[] = []
  const first = onOrAfter(s.from, s.day)
  const w = WEEKS[s.every]
  if (w) {
    const step = 7 * w
    let d = first
    if (d < from) d = addDays(d, Math.ceil(diffDays(d, from) / step) * step)
    for (; d <= to; d = addDays(d, step)) out.push(d)
  } else if (s.every === 'month') {
    const n = nthOf(first), a = parse(from < first ? first : from)
    for (let y = a.getFullYear(), m = a.getMonth(); ; m++) {
      const d = nthWeekday(y, m, s.day, n)
      if (d > to) break
      if (d >= from && d >= first) out.push(d)
    }
  }
  return out
}

const ORD = ['1st', '2nd', '3rd', '4th']
export const schedLabel = (s: CleanSchedule) => {
  const wd = weekdayNames(true)[s.day]
  const w = WEEKS[s.every]
  if (w === 1) return tr('Every {wd}', { wd })
  if (w) return tr('Every {n} weeks · {wd}', { n: w, wd })
  if (s.every === 'month') { const n = nthOf(onOrAfter(s.from, s.day)); return tr('Monthly · {o} {wd}', { o: ORD[n - 1], n, wd }) }
  if (s.every === 'season') return tr('Once a season')
  return tr('Not planned')
}

export const onceKey = (m: CleanMode, date: string) => (m === 3 ? 'x-' : `x${m}-`) + date

export interface Occurrence {
  key: string // stable id: the scheduled date, or x-<date> (x2-<date>…) for one planned by hand
  date: string // when it actually happens (after moves)
  mode: CleanMode
  sched?: string // the date the schedule put it on (missing for one planned by hand)
  start?: string // HH:MM, when it's planned
  end?: string
}

// all cleans whose date falls in [from, to]
export const occurrences = (st: State, from: string, to: string): Occurrence[] => {
  const p = st.cleanPlan
  const out: Occurrence[] = []
  const handDates = new Set(MODES.flatMap((m) => p.once?.[m] ?? []))
  // the bigger clean wins when two lists fall on the same day
  const byDate = new Map<string, CleanMode>()
  // look a bit wider so moved ones are found too
  for (const m of MODES) for (const s of schedDates(schedOf(p, m), addDays(from, -21), addDays(to, 21))) if ((byDate.get(s) ?? 0) < m) byDate.set(s, m)
  for (const [s, mode] of byDate) {
    if (p.skips.includes(s) || s < (p.start ?? '')) continue
    const date = p.moves[s] ?? s
    if (date < from || date > to) continue
    if (handDates.has(date)) continue // one planned by hand on that day takes the place of the scheduled one
    out.push({ key: s, date, mode, sched: s, ...p.times?.[s] })
  }
  for (const m of MODES) for (const x of p.once?.[m] ?? []) if (x >= from && x <= to) out.push({ key: onceKey(m, x), date: x, mode: m, ...p.times?.[onceKey(m, x)] })
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

export const tasksFor = (st: State, mode: CleanMode) => st.cleanTasks.filter((t) => t.mode === mode)

export const progress = (st: State, o: Occurrence) => {
  const tasks = tasksFor(st, o.mode)
  const rec = st.cleanDone[o.key]
  const done = (rec?.done ?? []).filter((id) => tasks.some((t) => t.id === id))
  return { tasks, done, finished: !!rec?.finished || (tasks.length > 0 && done.length === tasks.length) }
}

// The clean to show now: an unfinished one from the last 6 days (or today), otherwise the next one
export const currentClean = (st: State) => {
  const t = today()
  const recent = occurrences(st, addDays(t, -6), t).filter((o) => !progress(st, o).finished)
  const open = recent[recent.length - 1]
  if (open) return { occ: open, due: true }
  const next = occurrences(st, addDays(t, 1), addDays(t, 120))[0]
  return next ? { occ: next, due: false } : null
}

// meteorological seasons
export const seasonOf = (d: string) => {
  const m = Number(d.slice(5, 7))
  const y = Number(d.slice(0, 4))
  if (m === 12) return { name: 'winter', start: `${y}-12-01`, end: ymd(new Date(y + 1, 2, 0)) }
  if (m <= 2) return { name: 'winter', start: `${y - 1}-12-01`, end: ymd(new Date(y, 2, 0)) }
  if (m <= 5) return { name: 'spring', start: `${y}-03-01`, end: `${y}-05-31` }
  if (m <= 8) return { name: 'summer', start: `${y}-06-01`, end: `${y}-08-31` }
  return { name: 'autumn', start: `${y}-09-01`, end: `${y}-11-30` }
}

// a once-a-season list: done this season? planned?
export const seasonStatus = (st: State, mode: CleanMode) => {
  const s = seasonOf(today())
  const doneThis = Object.entries(st.cleanDone).filter(([, r]) => r.mode === mode && r.finished && r.date >= s.start && r.date <= s.end).map(([, r]) => r.date).sort()
  const planned = (st.cleanPlan.once?.[mode] ?? []).filter((d) => d >= today() && d <= s.end).sort()
  return { season: s, doneOn: doneThis[doneThis.length - 1], plannedOn: planned[0], daysLeft: diffDays(today(), s.end) }
}

// before schedules: Light and Regular took turns every Sunday from `anchor`, Extra was planned by hand once a season
export const migrateCleanPlan = (p: CleanPlan) => {
  if (!p.once) { p.once = { 3: [...(p.extras ?? [])] }; p.extras = [] }
  if (p.sched) return
  if (!p.anchor) { p.sched = defaultCleanPlan().sched; return }
  const start = p.start || today()
  const back = (d: string) => { while (d > start) d = addDays(d, -14); return d }
  const a = back(p.anchor), b = back(addDays(p.anchor, 7))
  const [light, regular] = p.anchorMode === 2 ? [b, a] : [a, b]
  p.sched = { 1: { every: '2weeks', day: 0, from: light }, 2: { every: '2weeks', day: 0, from: regular }, 3: { every: 'season', day: 0, from: start } }
  delete p.anchor; delete p.anchorMode
}
