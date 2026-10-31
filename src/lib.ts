import type { BudgetItem, Session, Settings, State, Supply, SupplyCat } from './types'

// ---------- ids ----------
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

// ---------- dates (local, YYYY-MM-DD) ----------
const pad = (n: number) => String(n).padStart(2, '0')
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const today = () => ymd(new Date())
export const addDays = (s: string, n: number) => {
  const d = parse(s)
  d.setDate(d.getDate() + n)
  return ymd(d)
}
export const diffDays = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000)
export const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate() // m is 1-based
export const monthKey = (s: string) => s.slice(0, 7)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const fmtDay = (s: string) => {
  const d = parse(s)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}
export const fmtWeekday = (s: string) => {
  const d = parse(s)
  return `${WD[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`
}
export const monthName = (mk: string, long = false) => {
  const m = Number(mk.slice(5, 7)) - 1
  return long ? MONTHS_LONG[m] : MONTHS[m]
}
export const prevMonth = (mk: string) => {
  let [y, m] = mk.split('-').map(Number)
  m -= 1
  if (m === 0) { m = 12; y -= 1 }
  return `${y}-${pad(m)}`
}
export const nextMonth = (mk: string) => {
  let [y, m] = mk.split('-').map(Number)
  m += 1
  if (m === 13) { m = 1; y += 1 }
  return `${y}-${pad(m)}`
}
export const relDays = (n: number) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : n === -1 ? 'yesterday' : n < 0 ? `${-n} days ago` : `in ${n} days`)

// ---------- money ----------
export const fmt = (n: number, dec = false) => {
  const v = dec ? Math.round(n * 100) / 100 : Math.round(n)
  return v.toLocaleString('en-US', { minimumFractionDigits: dec ? 2 : 0, maximumFractionDigits: dec ? 2 : 0 }) + ' zł'
}
export const fmtEur = (n: number) => '€' + (Math.round(n * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })
export const r2 = (n: number) => Math.round(n * 100) / 100

// ---------- budget periods ----------
// A = day 1 .. splitDay-1, B = splitDay .. end of month
export interface PeriodInfo { key: string; month: string; half: 'A' | 'B'; start: string; end: string; label: string }
export const periodOf = (date: string, s: Settings): PeriodInfo => {
  const mk = monthKey(date)
  const day = Number(date.slice(8, 10))
  return periodFromKey(`${mk}-${day >= s.splitDay ? 'B' : 'A'}`, s)
}
export const periodFromKey = (key: string, s: Settings): PeriodInfo => {
  const mk = key.slice(0, 7)
  const half = key.slice(8) as 'A' | 'B'
  const [y, m] = mk.split('-').map(Number)
  const dim = daysInMonth(y, m)
  const start = half === 'A' ? `${mk}-01` : `${mk}-${pad(s.splitDay)}`
  const end = half === 'A' ? `${mk}-${pad(s.splitDay - 1)}` : `${mk}-${pad(dim)}`
  const label = half === 'A' ? `1–${s.splitDay - 1} ${monthName(mk)}` : `${s.splitDay}–${dim} ${monthName(mk)}`
  return { key, month: mk, half, start, end, label }
}
export const shiftPeriod = (key: string, dir: 1 | -1) => {
  const mk = key.slice(0, 7)
  const half = key.slice(8)
  if (dir === 1) return half === 'A' ? `${mk}-B` : `${nextMonth(mk)}-A`
  return half === 'B' ? `${mk}-A` : `${prevMonth(mk)}-B`
}

// If a period was never opened, it starts as a copy of the same half of the latest earlier month that has one.
export const periodItems = (st: State, key: string): { items: BudgetItem[]; isTemplate: boolean } => {
  if (st.periods[key]) return { items: st.periods[key].items, isTemplate: false }
  const half = key.slice(8)
  let mk = key.slice(0, 7)
  for (let i = 0; i < 24; i++) {
    mk = prevMonth(mk)
    const p = st.periods[`${mk}-${half}`]
    if (p) {
      const items = p.items
        .filter((it) => !it.fromClient && !it.oneOff)
        .map((it) => ({ ...it, id: uid(), date: it.date ? key.slice(0, 7) + it.date.slice(7) : undefined }))
      return { items, isTemplate: true }
    }
  }
  return { items: [], isTemplate: true }
}

export interface AutoLine { id: string; label: string; amount: number; date: string; meta: string; kind: 'supplies' | 'tax' }

export const CAT_LABEL: Record<SupplyCat, string> = { meds: 'Meds', groceries: 'Groceries', pets: 'Pets', home: 'Home supplies', beauty: 'Beauty' }

// next planned buy date of a supply (never in the past)
export const nextBuy = (sp: Supply, t = today()) => (sp.enoughUntil < t ? t : sp.enoughUntil)

export const autoLines = (st: State, p: PeriodInfo): AutoLine[] => {
  const out: AutoLine[] = []
  const t = today()
  // supplies: every planned purchase that falls inside this period (repeats for short-lasting items)
  const byCat: Record<string, { amount: number; n: number }> = {}
  for (const sp of st.supplies) {
    let d = nextBuy(sp, t)
    let guard = 0
    while (d <= p.end && guard++ < 40) {
      if (d >= p.start) {
        byCat[sp.cat] ??= { amount: 0, n: 0 }
        byCat[sp.cat].amount += sp.pricePerUnit * sp.buyQty
        byCat[sp.cat].n += 1
      }
      d = addDays(d, Math.max(1, sp.lastsDays))
    }
  }
  for (const [cat, v] of Object.entries(byCat)) {
    out.push({ id: 'sup-' + cat, label: CAT_LABEL[cat as SupplyCat], amount: v.amount, date: p.start, meta: `${v.n} planned ${v.n === 1 ? 'buy' : 'buys'} · from Supplies`, kind: 'supplies' })
  }
  // taxes for previous month, due on taxDueDay
  const due = `${p.month}-${pad(st.settings.taxDueDay)}`
  if (due >= p.start && due <= p.end) {
    const forMonth = prevMonth(p.month)
    const tx = taxFor(st, forMonth)
    if (tx.total > 0) out.push({ id: 'tax-' + forMonth, label: 'ZUS + PIT', amount: tx.total, date: due, meta: `for ${monthName(forMonth, true)} · ${st.taxMonths[forMonth]?.paid ? 'paid' : 'due ' + fmtDay(due)}`, kind: 'tax' })
  }
  return out
}

export interface PeriodSummary {
  info: PeriodInfo
  items: BudgetItem[]
  isTemplate: boolean
  auto: AutoLine[]
  income: number
  fixed: number
  spent: number
  left: number
  daysLeft: number
  perDay: number
}

export const summarize = (st: State, key: string): PeriodSummary => {
  const info = periodFromKey(key, st.settings)
  const { items, isTemplate } = periodItems(st, key)
  const auto = autoLines(st, info)
  const income = items.filter((i) => i.kind === 'income').reduce((a, b) => a + b.amount, 0)
  const fixed = items.filter((i) => i.kind === 'expense').reduce((a, b) => a + b.amount, 0) + auto.reduce((a, b) => a + b.amount, 0)
  const spent = st.spends.filter((s) => s.date >= info.start && s.date <= info.end).reduce((a, b) => a + b.amount, 0)
  const left = income - fixed - spent
  const t = today()
  const total = diffDays(info.start, info.end) + 1
  const daysLeft = t < info.start ? total : t > info.end ? 0 : diffDays(t, info.end) + 1
  const perDay = daysLeft > 0 ? left / daysLeft : 0
  return { info, items, isTemplate, auto, income, fixed, spent, left, daysLeft, perDay }
}

// ---------- taxes ----------
export const revenueFromIncome = (st: State, mk: string) => {
  let sum = 0
  for (const [key, p] of Object.entries(st.periods)) {
    if (!key.startsWith(mk)) continue
    for (const it of p.items) if (it.kind === 'income' && it.taxable) sum += it.amount
  }
  return sum
}
export const taxFor = (st: State, mk: string) => {
  const tm = st.taxMonths[mk]
  const s = st.settings
  const revenue = tm?.revenueOverride ?? revenueFromIncome(st, mk)
  const dra = tm?.draOverride ?? s.dra
  const rca = tm?.rcaOverride ?? s.rca
  const pit = tm?.pitOverride ?? Math.max(0, r2(s.pitRate * (revenue - 0.5 * dra)))
  const active = revenue > 0 || tm !== undefined
  const total = active ? r2(dra + rca + pit) : 0
  return { revenue, dra: active ? dra : 0, rca: active ? rca : 0, pit: active ? pit : 0, total, paid: !!tm?.paid, override: tm?.revenueOverride !== undefined }
}

// ---------- work ----------
export const hours = (s: Session) => (new Date(s.end).getTime() - new Date(s.start).getTime()) / 3600000
export const sessionEur = (st: State, s: Session) => {
  const c = st.clients.find((c) => c.id === s.clientId)
  return hours(s) * (c?.rateEur ?? 0)
}
export const fmtHours = (h: number) => (Math.round(h * 10) / 10).toString().replace(/\.0$/, '') + ' h'
export const fmtClock = (ms: number) => {
  const t = Math.max(0, Math.floor(ms / 1000))
  return `${pad(Math.floor(t / 3600))}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}`
}

// ---------- supplies ----------
export const supplyStatus = (sp: Supply, s: Settings, t = today()) => {
  const left = diffDays(t, sp.enoughUntil)
  const state: 'out' | 'buy' | 'ok' = left <= 0 ? 'out' : left <= s.leadDays ? 'buy' : 'ok'
  return { daysLeft: left, state }
}

// "glue, screws ,  hooks" -> ['glue', 'screws', 'hooks']
export const splitList = (s?: string) => (s ?? '').split(',').map((x) => x.trim()).filter(Boolean)
