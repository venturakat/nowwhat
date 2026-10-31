import type { BudgetItem, Credit, Currency, Session, Settings, State, Subscription, Supply, SupplyCat } from './types'

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

export interface AutoLine { id: string; label: string; amount: number; date: string; meta: string; kind: 'supplies' | 'tax' | 'credit' | 'subs' }

export const CAT_LABEL: Record<SupplyCat, string> = { meds: 'Meds', groceries: 'Groceries', pets: 'Pets', home: 'Home supplies', care: 'Care' }

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
  // all credit payments falling in this half, summed into one fixed line
  const cr = (st.credits ?? []).map((c) => {
    const inP = creditSchedule(c).filter((x) => x.date >= p.start && x.date <= p.end)
    return { c, pln: inP.reduce((a, x) => a + toPln(st.settings, x.amount, c.currency ?? 'PLN'), 0), dates: inP.map((x) => x.date) }
  }).filter((x) => x.dates.length)
  if (cr.length) out.push({ id: 'credits', label: 'Credits', amount: cr.reduce((a, x) => a + x.pln, 0), date: cr.map((x) => x.dates[0]).sort()[0], meta: creditMeta(cr.flatMap((x) => x.dates)), kind: 'credit' })
  // subscriptions charged in this half, as one line
  const subs = (st.settings.subsFrom && p.key < st.settings.subsFrom ? [] : st.subscriptions ?? []).filter((x) => !x.paused).map((x) => ({ x, d: subDate(x, p.month) })).filter(({ d }) => d >= p.start && d <= p.end)
  if (subs.length) out.push({ id: 'subs', label: 'Subscriptions', amount: subs.reduce((a, { x }) => a + toPln(st.settings, x.amount, x.currency), 0), date: p.start, meta: subs.map(({ x }) => x.name).join(', '), kind: 'subs' })
  return out
}

// ---------- credits ----------
// "3 payments · 5–12 Nov" (or "1 payment · 5 Nov")
const creditMeta = (dates: string[]) => {
  const d = [...dates].sort()
  const a = parse(d[0]), b = parse(d[d.length - 1])
  const range = d[0] === d[d.length - 1] ? fmtDay(d[0]) : a.getMonth() === b.getMonth() ? `${a.getDate()}–${fmtDay(d[d.length - 1])}` : `${fmtDay(d[0])} – ${fmtDay(d[d.length - 1])}`
  return `${d.length} ${d.length === 1 ? 'payment' : 'payments'} · ${range}`
}
// same day each month (clamped to the month's last day)
export const monthlyDate = (first: string, i: number) => {
  const [y, m, d] = first.split('-').map(Number)
  const mm = m - 1 + i
  const yy = y + Math.floor(mm / 12)
  const m2 = (mm % 12) + 1
  return `${yy}-${pad(m2)}-${pad(Math.min(d, daysInMonth(yy, m2)))}`
}
// the payment plan after extra payments (taken off the end) and early closing
export const creditSchedule = (c: Credit) => {
  const sched = Array.from({ length: c.count }, (_, i) => ({ n: i + 1, date: monthlyDate(c.firstPayment, i), amount: i === c.count - 1 && c.lastAmount ? c.lastAmount : c.installment }))
  let extra = (c.extras ?? []).reduce((a, x) => a + x.amount, 0)
  for (let k = sched.length - 1; k >= 0 && extra > 0.004; k--) {
    const take = Math.min(extra, sched[k].amount)
    sched[k].amount = r2(sched[k].amount - take)
    extra = r2(extra - take)
  }
  return sched.filter((x) => x.amount > 0.004 && (!c.closedOn || x.date <= c.closedOn))
}
export const creditStatus = (c: Credit, t = today()) => {
  const sched = creditSchedule(c)
  const left = sched.filter((x) => x.date >= t)
  const remaining = left.reduce((a, x) => a + x.amount, 0)
  const total = c.installment * (c.count - 1) + (c.lastAmount || c.installment)
  return { sched, left, next: left[0], remaining: r2(remaining), total: r2(total), endsOn: sched[sched.length - 1]?.date, closed: !!c.closedOn || left.length === 0 }
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
  const pl = (x: { amount: number; currency?: Currency }) => toPln(st.settings, x.amount, x.currency ?? 'PLN')
  const income = items.filter((i) => i.kind === 'income').reduce((a, b) => a + pl(b), 0)
  const fixed = items.filter((i) => i.kind === 'expense').reduce((a, b) => a + pl(b), 0) + auto.reduce((a, b) => a + b.amount, 0)
  const spent = st.spends.filter((s) => s.date >= info.start && s.date <= info.end).reduce((a, b) => a + pl(b), 0)
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
    for (const it of p.items) if (it.kind === 'income' && it.taxable) sum += toPln(st.settings, it.amount, it.currency ?? 'PLN')
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

// ---------- currencies ----------
export const CUR_SIGN: Record<Currency, string> = { PLN: 'zł', EUR: '€', UAH: '₴' }
export const toPln = (s: Settings, amount: number, cur: Currency = 'PLN') => (cur === 'EUR' ? amount * s.eurPln : cur === 'UAH' ? amount * (s.uahPln ?? 0.0854) : amount)
export const fmtCur = (amount: number, cur: Currency = 'PLN', dec = true) => {
  if (cur === 'PLN') return fmt(amount, dec)
  const v = (Math.round(amount * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: dec ? 2 : 0, maximumFractionDigits: dec ? 2 : 0 })
  return cur === 'EUR' ? '€' + v : v + ' ₴'
}
// "25 € ≈ 110 zł" for foreign amounts, plain zł otherwise
export const fmtBoth = (s: Settings, amount: number, cur: Currency = 'PLN') => (cur === 'PLN' ? fmt(amount, true) : `${fmtCur(amount, cur)} ≈ ${fmt(toPln(s, amount, cur))}`)

// ---------- subscriptions ----------
export const subDate = (sub: Subscription, mk: string) => {
  const [y, m] = mk.split('-').map(Number)
  return `${mk}-${pad(Math.min(sub.day, daysInMonth(y, m)))}`
}
export const nextSubDate = (sub: Subscription, t = today()) => {
  const d = subDate(sub, t.slice(0, 7))
  return d >= t ? d : subDate(sub, nextMonth(t.slice(0, 7)))
}

// numbers typed by hand: "12,50", "12.50", "1 234,5", "1.234,56" -> number (undefined if empty / not a number)
export const parseNum = (x: unknown): number | undefined => {
  if (typeof x === 'number') return isFinite(x) ? x : undefined
  let t = String(x ?? '').replace(/\s/g, '')
  if (!t) return undefined
  if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '')
  const n = Number(t.replace(',', '.'))
  return isFinite(n) ? n : undefined
}
// show stored numbers with a comma, the way the bank does
export const numText = (n?: number) => (n === undefined || n === null ? '' : String(n).replace('.', ','))
