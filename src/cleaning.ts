import type { CleanMode, CleanPlan, CleanTask, State } from './types'
import { addDays, diffDays, parse, today, uid, ymd } from './lib'

export const MODE_NAME: Record<CleanMode, string> = { 1: 'Light', 2: 'Regular', 3: 'Extra' }
export const MODE_HOURS: Record<CleanMode, number> = { 1: 2, 2: 4, 3: 8 } // how long each kind of clean takes
// '10:00' + 4 h -> '14:00' (stops at 23:59)
export const addHours = (hhmm: string, h: number) => { const [a, b] = hhmm.split(':').map(Number); const m = Math.min(23 * 60 + 59, a * 60 + b + h * 60); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` }

const LIGHT = ['Kitchen sink', 'Window boards', 'Table', 'Bedsheets change', 'Bedsheets laundry', 'Ironing', 'WC', 'Bathroom sink', 'Vacuuming', 'Floors', 'Towels laundry', 'Trash out']
const REGULAR = ['Vacuuming', 'Rugs laundry', 'Showering plants', 'Dusting the kitchen', 'Kitchen surfaces', 'Kitchen sink', 'Window boards', 'Table', 'Mirrors', 'Lamps', 'Dusting the rooms', 'Bedsheets change', 'Bedsheets laundry', 'Baseboards', 'Ironing', 'WC', 'Litter boxes', 'Shower', 'Vanity area', 'Bathroom sink', 'Vacuuming extra', 'Floors', 'Towels laundry', 'Trash out']
const EXTRA = ['Vacuuming', 'Rugs laundry', 'Showering plants', 'Curtains laundry', 'Cat bed laundry', 'Decorative textile laundry', 'Dusting the kitchen', 'Wine glasses wash', 'Kitchen cabinets', 'Under the sink cabinets', 'Fridge', 'Airfryer', 'Toaster', 'Coffee maker', 'Kitchen surfaces', 'Kitchen sink', 'Window boards', 'Table', 'Mirrors', 'Lamps', 'Dusting the rooms', 'Dusting the books', 'Bedsheets change', 'Bedsheets laundry', 'Baseboards', 'Ironing', 'WC', 'Litter boxes', 'Washing machine', 'Shower', 'Vanity area', 'Bathroom sink', 'Vacuuming extra', 'Floors', 'Towels laundry', 'Trash out']

export const defaultCleanTasks = (): CleanTask[] => [
  ...LIGHT.map((name) => ({ id: uid(), name, mode: 1 as CleanMode })),
  ...REGULAR.map((name) => ({ id: uid(), name, mode: 2 as CleanMode })),
  ...EXTRA.map((name) => ({ id: uid(), name, mode: 3 as CleanMode }))
]

export const isSunday = (d: string) => parse(d).getDay() === 0
export const sundayOnOrAfter = (d: string) => {
  const x = parse(d)
  x.setDate(x.getDate() + ((7 - x.getDay()) % 7))
  return ymd(x)
}
export const defaultCleanPlan = (): CleanPlan => ({ anchor: sundayOnOrAfter(today()), anchorMode: 1, moves: {}, extras: [], skips: [], start: today() })

// Light/Regular for a scheduled Sunday, alternating weekly from the anchor
export const modeForSunday = (p: CleanPlan, sunday: string): 1 | 2 => {
  const weeks = Math.round(diffDays(p.anchor, sunday) / 7)
  return Math.abs(weeks) % 2 === 0 ? p.anchorMode : p.anchorMode === 1 ? 2 : 1
}

export interface Occurrence {
  key: string // stable id: the scheduled Sunday, or x-<date> for an Extra
  date: string // when it actually happens (after moves)
  mode: CleanMode
  sunday?: string
  start?: string // HH:MM, when it's planned
  end?: string
}

// all cleans whose date falls in [from, to]
export const occurrences = (st: State, from: string, to: string): Occurrence[] => {
  const p = st.cleanPlan
  const out: Occurrence[] = []
  const extraDates = new Set(p.extras)
  // look a bit wider so moved Sundays are found too
  for (let s = sundayOnOrAfter(addDays(from, -21)); s <= addDays(to, 21); s = addDays(s, 7)) {
    if (p.skips.includes(s) || s < (p.start ?? '')) continue
    const date = p.moves[s] ?? s
    if (date < from || date > to) continue
    if (extraDates.has(date)) continue // an Extra on that day replaces the usual clean
    out.push({ key: s, date, mode: modeForSunday(p, s), sunday: s, ...p.times?.[s] })
  }
  for (const x of p.extras) if (x >= from && x <= to) out.push({ key: 'x-' + x, date: x, mode: 3, ...p.times?.['x-' + x] })
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
  const next = occurrences(st, addDays(t, 1), addDays(t, 60))[0]
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

export const extraStatus = (st: State) => {
  const s = seasonOf(today())
  const doneThis = Object.entries(st.cleanDone).filter(([, r]) => r.mode === 3 && r.finished && r.date >= s.start && r.date <= s.end).map(([, r]) => r.date).sort()
  const planned = st.cleanPlan.extras.filter((d) => d >= today() && d <= s.end).sort()
  return { season: s, doneOn: doneThis[doneThis.length - 1], plannedOn: planned[0], daysLeft: diffDays(today(), s.end) }
}
