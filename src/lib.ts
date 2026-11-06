import { getLang, monthNames, weekdayNames } from './i18n'
import type { TaxEvery, TaxLine, TaxRule, BudgetItem, ClassRate, CookStep, Course, Credit, Nutri, Currency, PayCur, Recipe, SelfCare, Session, Settings, State, Subscription, Supply, SupplyCat } from './types'

// ---------- ids ----------
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

// ---------- dates (local, YYYY-MM-DD) ----------
export const pad = (n: number) => String(n).padStart(2, '0')
// '10:00' + 4 h -> '14:00' (stops at 23:59)
export const addHours = (hhmm: string, h: number) => { const [a, b] = hhmm.split(':').map(Number); const m = Math.min(23 * 60 + 59, a * 60 + b + h * 60); return `${pad(Math.floor(m / 60))}:${pad(m % 60)}` }
// '10:00–11:30', or just the start
export const timeSpan = (start?: string, end?: string) => (start ? (end ? `${start}–${end}` : start) : undefined)
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
// names follow the app's language (i18n)
export const fmtDay = (s: string) => {
  const d = parse(s)
  return `${d.getDate()} ${monthNames()[d.getMonth()]}`
}
export const fmtWeekday = (s: string) => {
  const d = parse(s)
  return `${weekdayNames()[d.getDay()]}, ${d.getDate()} ${monthNames()[d.getMonth()]}`
}
export const monthName = (mk: string, long = false) => monthNames(long)[Number(mk.slice(5, 7)) - 1]
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
// amounts in the main currency (Settings › Currencies)
export const fmt = (n: number, dec = false) => fmtCur(n, MAIN, dec)
// font size for a hero amount: long ones (pesos, big sums) shrink so they still fit — `fit` = how many
// characters fit at the full size
export const fitSize = (text: string, size: number, fit: number) => (text.length <= fit ? size : Math.max(Math.round(size * 0.5), Math.floor((size * fit) / text.length)))
export const fmtEur = (n: number) => fmtCur(n, 'EUR', n % 1 !== 0)
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
        .map((it) => ({ ...it, id: `${it.id.split('@')[0]}@${key}`, date: it.date ? key.slice(0, 7) + it.date.slice(7) : undefined }))
      return { items, isTemplate: true }
    }
  }
  return { items: [], isTemplate: true }
}

export interface AutoLine { id: string; label: string; amount: number; date: string; meta: string; kind: 'supplies' | 'tax' | 'credit' | 'subs' | 'fee' | 'lessons' | 'care'; income?: boolean; expected?: boolean; counted?: boolean /* expected, but already in the income sum (monthly fees) */ }

export const CAT_LABEL: Record<SupplyCat, string> = { meds: 'Meds', groceries: 'Groceries', pets: 'Pets', home: 'Home supplies', care: 'Care' }

// next planned buy date of a supply (never in the past)
// how many days ahead to shop for this kind of thing
export const leadFor = (s: Settings, cat: SupplyCat) => (cat === 'groceries' || cat === 'home' ? s.leadDaysShort ?? 2 : s.leadDays)
// planned shopping day: the lead time before it runs out (never in the past)
export const nextBuy = (sp: Supply, s: Settings, t = today()) => {
  const d = addDays(sp.enoughUntil, -leadFor(s, sp.cat))
  return d < t ? t : d
}

export const autoLines = (st: State, p: PeriodInfo): AutoLine[] => {
  const out: AutoLine[] = []
  const t = today()
  // supplies: every planned purchase that falls inside this period (repeats for short-lasting items)
  const byCat: Record<string, { amount: number; n: number }> = {}
  for (const sp of st.supplies) {
    if (sp.paused) continue
    let d = nextBuy(sp, st.settings, t)
    let guard = 0
    while (d <= p.end && guard++ < 40) {
      if (d >= p.start) {
        byCat[sp.cat] ??= { amount: 0, n: 0 }
        byCat[sp.cat].amount += sp.pricePerUnit * sp.buyQty
        byCat[sp.cat].n += 1
      }
      if (sp.once) break // bought once, never again
      d = addDays(d, Math.max(1, sp.lastsDays))
    }
  }
  for (const [cat, v] of Object.entries(byCat)) {
    out.push({ id: 'sup-' + cat, label: CAT_LABEL[cat as SupplyCat], amount: v.amount, date: p.start, meta: `${v.n} planned ${v.n === 1 ? 'buy' : 'buys'} · from Supplies`, kind: 'supplies' })
  }
  // taxes paid this month, on the days I pay them (official deadlines are later)
  {
    for (const x of taxPays(st, p.month)) if (x.amount > 0 && x.pay >= p.start && x.pay <= p.end) {
      const paidPart = x.groups.filter((g) => g.paid).map((g) => g.name).join(' + ')
      out.push({ id: `tax-${x.pay}`, label: x.name, amount: toMain(st.settings, x.amount, taxCur(st.settings), x.pay), date: x.pay, meta: `for ${x.forName} · ${x.paid ? 'paid' : paidPart ? `${paidPart} paid · ${x.leftName} ${fmtDay(x.pay)}` : 'pay ' + fmtDay(x.pay)}`, kind: 'tax' })
    }
  }
  // client fees (monthly or per job) expected in this half — shown, but not counted until they're paid (then they're real income)
  const localDay = (iso: string) => { const x = new Date(iso); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}` }
  // still unpaid from an earlier half → shows in the current half, so nothing gets lost
  const inHalf = (d: string) => (d >= p.start && d <= p.end) || (d < p.start && t >= p.start && t <= p.end)
  // invoiced hours, one line per client and invoice
  const hourly: Record<string, { c: string; d: string; h: number; amt: number; cur: Currency; pln: number; approx: boolean }> = {}
  for (const s of st.sessions) {
    if (s.fee !== undefined || !s.invoiced || s.paid) continue
    const c = st.clients.find((x) => x.id === s.clientId)
    if (!c || c.archived) continue
    const d = s.invoiceDate ?? localDay(s.start)
    if (!inHalf(d)) continue
    const k = `${c.id}@${s.invoiceDate ?? ''}`
    const g = (hourly[k] ??= { c: c.name, d, h: 0, amt: 0, cur: sessionCur(st, s), pln: 0, approx: false })
    g.h += hours(s); g.amt += sessionAmt(st, s); g.pln += sessionMain(st, s); g.approx ||= !s.nbpRate
    if (d > g.d) g.d = d
  }
  for (const [k, g] of Object.entries(hourly))
    out.push({ id: 'hrs-' + k, label: g.c, amount: g.pln, date: g.d, meta: `${fmtHours(g.h)} · ${fmtCur(g.amt, g.cur, g.amt % 1 !== 0)} · ${fmtDay(g.d)} · invoiced`, kind: 'fee', income: true, expected: true })
  for (const s of st.sessions) {
    if (s.fee === undefined || s.paid) continue
    const c = st.clients.find((x) => x.id === s.clientId)
    if (!c || c.archived) continue
    const d = !s.feeMonth && s.invoiceDate ? s.invoiceDate : localDay(s.start)
    if (!inHalf(d)) continue
    out.push({ id: 'fee-' + s.id, label: c.name, amount: sessionMain(st, s), date: d, meta: `${s.feeMonth ? 'monthly fee' : s.task} · ${fmtCur(s.fee ?? 0, s.feeCur ?? 'EUR')} · ${fmtDay(d)} · ${s.invoiced ? 'invoiced' : 'expected'}`, kind: 'fee', income: true, expected: true, counted: !!s.feeMonth })
  }
  // future months of monthly clients (their entry is only created when the month comes)
  for (const c of st.clients) {
    if (c.kind !== 'fixed' || c.archived || !c.fixedEur) continue
    const d = feeDate(c, p.month)
    if (d < p.start || d > p.end || (c.since && p.month < c.since)) continue
    if (st.sessions.some((x) => x.clientId === c.id && x.feeMonth === p.month)) continue
    out.push({ id: 'fee-' + c.id + p.month, label: c.name, amount: toMain(st.settings, c.fixedEur, c.fixedCur ?? 'EUR'), date: d, meta: `monthly fee · ${fmtCur(c.fixedEur, c.fixedCur ?? 'EUR')} · ${fmtDay(d)} · expected`, kind: 'fee', income: true, expected: true, counted: true })
  }
  // the next batch of classes to pay for, on the day of its first class (until it's paid)
  // per-class payers: like any regular expense — the classes held in this half, fee each time
  for (const c of st.classes ?? []) {
    if (!paysPerClass(c) || !c.price) continue
    const ds = classDates(c, p.start, p.end)
    if (!ds.length) continue
    const fee = c.fee ?? 0, feeCur = c.feeCurrency ?? st.settings.mainCur
    out.push({ id: 'lessons-' + c.id, label: c.name, amount: r2(ds.reduce((a, d) => a + toMain(st.settings, c.price, c.currency, d) + toMain(st.settings, fee, feeCur, d), 0)), date: ds[0], meta: `${ds.length} ${ds.length === 1 ? 'class' : 'classes'} · ${ds.length === 1 ? fmtDay(ds[0]) : `${fmtDay(ds[0])} – ${fmtDay(ds[ds.length - 1])}`}`, kind: 'lessons' })
  }
  for (const c of st.classes ?? []) {
    if (paysPerClass(c)) continue
    const lb = classBatch(st, c)
    if (lb && inHalf(lb.due)) out.push({ id: 'lessons-' + c.id, label: c.name, amount: lb.pln, date: lb.due, meta: `${lb.dates.length} ${lb.dates.length === 1 ? 'class' : 'classes'} · ${fmtDay(lb.due)}`, kind: 'lessons' })
  }
  // all credit payments falling in this half, summed into one fixed line
  const cr = (st.credits ?? []).map((c) => {
    const inP = creditSchedule(c).filter((x) => x.date >= p.start && x.date <= p.end)
    return { c, pln: inP.reduce((a, x) => a + toMain(st.settings, x.amount, c.currency, x.date), 0), dates: inP.map((x) => x.date) }
  }).filter((x) => x.dates.length)
  if (cr.length) out.push({ id: 'credits', label: 'Credits', amount: cr.reduce((a, x) => a + x.pln, 0), date: cr.map((x) => x.dates[0]).sort()[0], meta: creditMeta(cr.flatMap((x) => x.dates)), kind: 'credit' })
  // subscriptions charged in this half, as one line
  const subs = (st.settings.subsFrom && p.key < st.settings.subsFrom ? [] : st.subscriptions ?? []).filter((x) => !x.paused).map((x) => ({ x, d: subDate(x, p.month) })).filter(({ d }) => d >= p.start && d <= p.end)
  if (subs.length) out.push({ id: 'subs', label: 'Subscriptions', amount: subs.reduce((a, { x, d }) => a + toMain(st.settings, x.amount, x.currency, d), 0), date: p.start, meta: subs.map(({ x }) => x.name).join(', '), kind: 'subs' })
  // selfcare planned in this half (from today on; done ones are logged as spending instead)
  const care = careInPeriod(st, p.start, p.end)
  if (care.length) out.push({ id: 'care', label: 'Selfcare', amount: care.reduce((a, c) => a + c.pln, 0), date: care[0].date, meta: [...new Set(care.map((c) => c.x.name))].join(', '), kind: 'care' })
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
  // dated amounts at the rate of their day; undated ones at the rate of the half's last day
  const pl = (x: { amount: number; currency?: Currency; date?: string }) => toMain(st.settings, x.amount, x.currency, x.date ?? info.end)
  const income = items.filter((i) => i.kind === 'income').reduce((a, b) => a + pl(b), 0) + auto.filter((a) => a.income && (!a.expected || a.counted)).reduce((a, b) => a + b.amount, 0)
  const fixed = items.filter((i) => i.kind === 'expense').reduce((a, b) => a + pl(b), 0) + auto.filter((a) => !a.income).reduce((a, b) => a + b.amount, 0)
  const spent = st.spends.filter((s) => s.date >= info.start && s.date <= info.end).reduce((a, b) => a + pl(b), 0)
  const left = income - fixed - spent
  const t = today()
  const total = diffDays(info.start, info.end) + 1
  const daysLeft = t < info.start ? total : t > info.end ? 0 : diffDays(t, info.end) + 1
  const perDay = daysLeft > 0 ? left / daysLeft : 0
  return { info, items, isTemplate, auto, income, fixed, spent, left, daysLeft, perDay }
}

// ---------- taxes ----------
// taxes are worked out in their own currency (zł unless set)
export const taxCur = (s: Settings) => s.taxCur ?? 'PLN'
export const fmtTax = (s: Settings, n: number, dec = false) => fmtCur(n, taxCur(s), dec)
export const taxRule = (s: Settings): TaxRule => s.taxRule ?? (taxCur(s) === 'PLN' ? 'nbp' : 'invoice')
export const revenueFromIncome = (st: State, mk: string) => {
  const tc = taxCur(st.settings)
  let sum = 0
  for (const [key, p] of Object.entries(st.periods)) {
    if (!key.startsWith(mk)) continue
    for (const it of p.items) if (it.kind === 'income' && it.taxable) sum += conv(st.settings, it.amount, it.currency ?? st.settings.mainCur, tc, it.date ?? periodFromKey(key, st.settings).end)
  }
  // invoices count in the month of the invoice date (no need to wait for payment) — or, by the "when paid" rule, in the month the money arrives
  const paidRule = taxRule(st.settings) === 'paid'
  for (const s of st.sessions) if (s.invoiced && s.invoiceDate && (paidRule ? s.paid && s.paidDate?.startsWith(mk) : s.invoiceDate.startsWith(mk))) sum += sessionTax(st, s)
  return sum
}
export const monthRevenue = (st: State, mk: string) => st.taxMonths[mk]?.revenueOverride ?? revenueFromIncome(st, mk)
const PERIOD_LEN: Record<TaxEvery, number> = { month: 1, quarter: 3, year: 12 }
// does this line's period end in month mk? (it's paid the month after)
export const lineEndsIn = (l: TaxLine, mk: string) => +mk.slice(5, 7) % PERIOD_LEN[l.every] === 0
// the month in which the period containing mk ends
export const periodEnd = (l: TaxLine, mk: string) => {
  const n = PERIOD_LEN[l.every], m = +mk.slice(5, 7)
  return `${mk.slice(0, 4)}-${pad(Math.ceil(m / n) * n)}`
}
// months of the line's period that ends in mk
export const periodMonths = (l: TaxLine, mk: string) => {
  const out = [mk]
  while (out.length < PERIOD_LEN[l.every]) out.unshift(prevMonth(out[0]))
  return out
}
export const taxLinesOf = (s: Settings) => s.taxLines ?? []
// the lines' amounts for one period: own numbers first, then fixed, then % lines (a % line may take off part of another line)
export const lineAmounts = (lines: TaxLine[], revOf: (l: TaxLine) => number, own: Record<string, number | undefined>) => {
  const out: Record<string, number> = {}
  const calc: Record<string, number> = {}
  const get = (l: TaxLine, depth = 0): number => {
    if (out[l.id] !== undefined) return out[l.id]
    let c = 0
    if (l.kind === 'fixed') c = l.amount ?? 0
    else if (l.kind === 'pct') c = Math.max(0, r2(((l.pct ?? 0) / 100) * revOf(l)))
    else {
      const o = lines.find((x) => x.id === l.less && x.id !== l.id)
      const off = o && depth < 5 ? get(o, depth + 1) : 0
      c = Math.max(0, r2(((l.pct ?? 0) / 100) * (revOf(l) - ((l.lessPct ?? 0) / 100) * off)))
    }
    calc[l.id] = c
    return (out[l.id] = own[l.id] ?? c)
  }
  for (const l of lines) get(l)
  for (const l of lines) if (calc[l.id] === undefined) calc[l.id] = out[l.id]
  return { amounts: out, calc }
}
export interface TaxPart { line: TaxLine; end: string /* the period's last month (its state lives there) */; amount: number; calc: number; own: boolean; paid: boolean; revenue: number }
export interface TaxGroup { key: string; name: string; parts: TaxPart[]; amount: number; left: number; paid: boolean; payDay: number; dueDay: number }
// how many months after its period ends a line is paid (0 = the same month)
export const lagOf = (l: TaxLine) => l.lag ?? 1
export const addMonths = (mk: string, n: number) => { let m = mk; for (let i = 0; i < Math.abs(n); i++) m = n > 0 ? nextMonth(m) : prevMonth(m); return m }
const groupParts = (parts: TaxPart[]) => {
  const groups: TaxGroup[] = []
  for (const p of parts) {
    const key = p.line.group?.trim() || p.line.id
    let g = groups.find((x) => x.key === key)
    if (!g) groups.push((g = { key, name: p.line.group?.trim() || p.line.name, parts: [], amount: 0, left: 0, paid: true, payDay: p.line.payDay, dueDay: p.line.dueDay }))
    g.parts.push(p)
    g.amount = r2(g.amount + p.amount)
    if (!p.paid) { g.left = r2(g.left + p.amount); g.paid = false }
  }
  return groups
}
const sumUp = (parts: TaxPart[]) => {
  const groups = groupParts(parts)
  return { parts, groups, total: r2(parts.reduce((a, p) => a + p.amount, 0)), left: r2(groups.reduce((a, g) => a + g.left, 0)), paid: parts.length > 0 && groups.every((g) => g.paid) }
}
// the maths for the periods ending in month mk (whenever they're paid)
export const taxPeriod = (st: State, mk: string) => {
  const tm = st.taxMonths[mk]
  const revenue = monthRevenue(st, mk)
  const lines = taxLinesOf(st.settings).filter((l) => lineEndsIn(l, mk))
  const revOf = (l: TaxLine) => periodMonths(l, mk).reduce((a, m) => a + (m === mk ? revenue : monthRevenue(st, m)), 0)
  const own: Record<string, number | undefined> = {}
  for (const l of lines) own[l.id] = tm?.lines?.[l.id]?.amount
  const { amounts, calc } = lineAmounts(lines, revOf, own)
  const parts: TaxPart[] = lines.map((l) => ({ line: l, end: mk, amount: amounts[l.id], calc: calc[l.id], own: own[l.id] !== undefined, paid: !!tm?.lines?.[l.id]?.paid, revenue: revOf(l) }))
  return { revenue, ...sumUp(parts), override: tm?.revenueOverride !== undefined }
}
// everything paid in month pm (each line from the period that ended `lag` months before)
export const taxFor = (st: State, pm: string) => {
  const parts: TaxPart[] = []
  for (const lag of [0, 1, 2]) for (const p of taxPeriod(st, addMonths(pm, -lag)).parts) if (lagOf(p.line) === lag) parts.push(p)
  // the month the revenue / edit link speaks about: the period most of it is for
  const month = parts.find((p) => p.line.every === 'month')?.end ?? parts[0]?.end ?? prevMonth(pm)
  return { pm, month, revenue: monthRevenue(st, month), ...sumUp(parts) }
}
export type TaxInfo = ReturnType<typeof taxFor>
// "October", "Q3 2026", "2026" — or several, joined
export const periodLabel = (l: TaxLine, end: string) => (l.every === 'month' ? monthName(end, true) : l.every === 'quarter' ? `Q${+end.slice(5, 7) / 3} ${end.slice(0, 4)}` : end.slice(0, 4))
export const partsName = (parts: TaxPart[]) => [...new Set(parts.map((p) => periodLabel(p.line, p.end)))].join(' + ')
// "ZUS + PIT-28": what's still to pay (everything, once all is paid)
export const taxLeftName = (tx: { groups: TaxGroup[] }) => (tx.groups.some((g) => !g.paid) ? tx.groups.filter((g) => !g.paid) : tx.groups).map((g) => g.name).join(' + ')
export const taxAllName = (tx: { groups: TaxGroup[] }) => tx.groups.map((g) => g.name).join(' + ')
// mark a group (or everything) paid / not paid among the taxes paid in month pm
export const setTaxPaid = (d: State, pm: string, group: string | 'all', on: boolean) => {
  for (const g of taxFor(d, pm).groups) if (group === 'all' || g.key === group) for (const p of g.parts) {
    const ls = ((d.taxMonths[p.end] ??= {}).lines ??= {})
    const x = (ls[p.line.id] ??= {})
    if (on) x.paid = true; else delete x.paid
  }
}
// a day of a month, never past its end
export const dayOf = (mk: string, day: number) => { const [y, m] = mk.split('-').map(Number); return `${mk}-${pad(Math.min(Math.max(1, day || 1), daysInMonth(y, m)))}` }
// the payments made in month pm, one per pay day: names, amounts, paid
export const taxPays = (st: State, pm: string, tx = taxFor(st, pm)) => {
  const out: { pay: string; due: string; groups: TaxGroup[]; name: string; leftName: string; forName: string; amount: number; left: number; paid: boolean }[] = []
  for (const g of tx.groups) {
    const pay = dayOf(pm, g.payDay), due = dayOf(pm, g.dueDay)
    let x = out.find((o) => o.pay === pay)
    if (!x) out.push((x = { pay, due, groups: [], name: '', leftName: '', forName: '', amount: 0, left: 0, paid: true }))
    x.groups.push(g)
    if (due > x.due) x.due = due
  }
  for (const x of out) {
    x.amount = r2(x.groups.reduce((a, g) => a + g.amount, 0)); x.left = r2(x.groups.reduce((a, g) => a + g.left, 0))
    x.paid = x.groups.every((g) => g.paid)
    x.name = x.groups.map((g) => g.name).join(' + ')
    x.leftName = (x.paid ? x.groups : x.groups.filter((g) => !g.paid)).map((g) => g.name).join(' + ')
    x.forName = partsName(x.groups.flatMap((g) => g.parts))
  }
  return out.sort((a, b) => a.pay.localeCompare(b.pay))
}

// ---------- work ----------
export const hours = (s: Session) => (new Date(s.end).getTime() - new Date(s.start).getTime()) / 3600000
// an entry's currency and amount in it (hours × the client's rate, or the fee)
export const sessionCur = (st: State, s: Session): Currency => s.fee !== undefined ? s.feeCur ?? 'EUR' : st.clients.find((c) => c.id === s.clientId)?.cur ?? 'EUR'
export const sessionAmt = (st: State, s: Session) => {
  if (s.fee !== undefined) return s.fee
  const c = st.clients.find((c) => c.id === s.clientId)
  return hours(s) * (c?.rateEur ?? 0)
}
export const feeDate = (c: { payDay?: number }, mk: string) => {
  const [y, m] = mk.split('-').map(Number)
  return `${mk}-${pad(Math.min(c.payDay ?? 1, daysInMonth(y, m)))}`
}
// make sure every fixed-fee client has an entry for each month up to now (they get invoiced like hours)
// ticked tasks disappear the midnight after they were done
export const purgeTasks = (d: State) => {
  const t = today()
  if (d.tasks?.some((x) => x.doneAt && x.doneAt < t)) d.tasks = d.tasks.filter((x) => !x.doneAt || x.doneAt >= t)
}
export const ensureFees = (d: State) => {
  const cur = today().slice(0, 7)
  for (const c of d.clients) {
    if (c.kind !== 'fixed' || c.archived || !c.fixedEur) continue
    let mk = c.since ?? cur
    for (let i = 0; i < 60 && mk <= cur; i++, mk = nextMonth(mk)) {
      const ex = d.sessions.find((s) => s.clientId === c.id && s.feeMonth === mk)
      if (ex) { if (!ex.invoiced) { ex.fee = c.fixedEur; ex.feeCur = c.fixedCur ?? 'EUR' } continue }
      const at = new Date(feeDate(c, mk) + 'T12:00:00').toISOString()
      d.sessions.push({ id: uid(), clientId: c.id, task: `${monthName(mk, true)} fee`, start: at, end: at, invoiced: false, paid: false, fee: c.fixedEur, feeCur: c.fixedCur ?? 'EUR', feeMonth: mk })
    }
  }
}
// in the tax currency: invoices in zł taxes use their NBP rate, the rest the rate of the invoice day
export const sessionTax = (st: State, s: Session) => {
  const cur = sessionCur(st, s), amt = sessionAmt(st, s), tc = taxCur(st.settings)
  const rule = taxRule(st.settings)
  if (rule === 'nbp' && s.nbpRate && tc === 'PLN' && cur !== 'PLN') return amt * s.nbpRate
  return conv(st.settings, amt, cur, tc, rule === 'paid' ? s.paidDate ?? s.invoiceDate : s.invoiceDate ?? s.paidDate)
}
// in the main currency: invoiced ones via their NBP rate (exact when the main currency is zł),
// paid ones at the rate of their day, the rest at today's rate (an estimate)
export const sessionMain = (st: State, s: Session) => {
  const cur = sessionCur(st, s), amt = sessionAmt(st, s), d = s.paidDate ?? s.invoiceDate
  if (s.nbpRate && cur !== 'PLN') return toMain(st.settings, amt * s.nbpRate, 'PLN', d)
  return toMain(st.settings, amt, cur, d)
}
// a list's total in its own currencies: "€600", "1 200,00 zł" or "€600 + 1 200,00 zł"
export const fmtSum = (st: State, l: Session[]) => {
  const by = new Map<Currency, number>()
  for (const s of l) { const c = sessionCur(st, s); by.set(c, (by.get(c) ?? 0) + sessionAmt(st, s)) }
  if (!by.size) return fmtCur(0, 'EUR', false)
  return [...by].map(([c, n]) => fmtCur(n, c, n % 1 !== 0)).join(' + ')
}
// invoices outside zł need the NBP rate of the day before the invoice (Polish taxes)
export const needsRate = (st: State, s: Session) => taxRule(st.settings) === 'nbp' && taxCur(st.settings) === 'PLN' && sessionCur(st, s) !== 'PLN'
export const fmtHours = (h: number) => (Math.round(h * 10) / 10).toString().replace(/\.0$/, '') + ' h'
export const fmtClock = (ms: number) => {
  const t = Math.max(0, Math.floor(ms / 1000))
  return `${pad(Math.floor(t / 3600))}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}`
}

// ---------- supplies ----------
export const supplyStatus = (sp: Supply, s: Settings, t = today()) => {
  if (sp.once) return { daysLeft: 0, state: 'buy' as const } // one-time buys wait on the list until bought
  const left = diffDays(t, sp.enoughUntil)
  const state: 'out' | 'buy' | 'ok' = left <= 0 ? 'out' : left <= leadFor(s, sp.cat) ? 'buy' : 'ok'
  return { daysLeft: left, state }
}

// A project's "need to buy" items live on the Supplies list as one-time buys (so they can get a price).
// The project's text stays the source: new items appear, removed ones go, done projects take theirs away.
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
export const syncProjectBuys = (d: State) => {
  const open = new Map(d.projects.filter((p) => !p.done).map((p) => [p.id, splitList(p.toBuy)]))
  d.supplies = d.supplies.filter((s) => !s.projectId || (open.get(s.projectId) ?? []).some((n) => same(n, s.name)))
  for (const [pid, items] of open)
    for (const name of items)
      if (!d.supplies.some((s) => s.projectId === pid && same(s.name, name)))
        d.supplies.push({ id: uid(), cat: 'home', name, pricePerUnit: 0, buyQty: 1, lastsDays: 30, enoughUntil: today(), once: true, projectId: pid })
}
// change / drop one item in a project's "need to buy" text
export const editProjectBuy = (d: State, pid: string, name: string, to?: string) => {
  const p = d.projects.find((x) => x.id === pid)
  if (!p) return
  const items = splitList(p.toBuy).flatMap((n) => (same(n, name) ? (to?.trim() ? [to.trim()] : []) : [n]))
  p.toBuy = items.join(', ') || undefined
}

// "glue, screws ,  hooks" -> ['glue', 'screws', 'hooks']
export const splitList = (s?: string) => (s ?? '').split(',').map((x) => x.trim()).filter(Boolean)

// ---------- currencies ----------
// The main currency is kept here too, so fmt() can be used anywhere (store.ts keeps it in step with Settings).
let MAIN: Currency = 'PLN'
export const setMainCur = (c: Currency) => { MAIN = c }
export const mainCur = () => MAIN
// sign and where it goes; others come from the phone (Intl), or the code itself
const SIGNS: Record<string, [string, boolean]> = { PLN: ['zł', false], EUR: ['€', true], USD: ['$', true], GBP: ['£', true], UAH: ['₴', false], ARS: ['ARS', false], CHF: ['CHF', false], CZK: ['Kč', false], JPY: ['¥', true], CAD: ['CA$', true], AUD: ['A$', true] }
const signCache: Record<string, [string, boolean]> = {}
const signOf = (c: Currency): [string, boolean] => {
  if (SIGNS[c]) return SIGNS[c]
  if (signCache[c]) return signCache[c]
  let out: [string, boolean] = [c, false]
  try {
    const parts = new Intl.NumberFormat('en', { style: 'currency', currency: c, currencyDisplay: 'narrowSymbol' }).formatToParts(1)
    const sym = parts.find((x) => x.type === 'currency')?.value
    if (sym && sym !== c && !/^[$]$/.test(sym)) out = [sym, parts[0].type === 'currency']
  } catch { /* unknown code */ }
  return (signCache[c] = out)
}
export const curSign = (c: Currency) => signOf(c)[0]
export const CUR_SIGN = new Proxy({} as Record<string, string>, { get: (_, k: string) => curSign(k) })
// "Polish zloty" (in the app's language)
export const curName = (c: Currency) => {
  try { return new Intl.DisplayNames(getLang(), { type: 'currency' }).of(c) ?? c } catch { return c }
}
// currencies in use today (ISO 4217, 2026) — the phone's own list also has withdrawn ones (francs, marks, old roubles…),
// funds and metals, so the picker offers only these
const ACTIVE = ('AED AFN ALL AMD AOA ARS AUD AWG AZN BAM BBD BDT BHD BIF BMD BND BOB BRL BSD BTN BWP BYN BZD CAD CDF CHF CLP CNY COP CRC ' +
  'CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ISK JMD JOD ' +
  'JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MYR MZN NAD NGN NIO ' +
  'NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN SYP SZL THB TJS TMT ' +
  'TND TOP TRY TTD TWD TZS UAH UGX USD UYU UZS VES VND VUV WST XAF XCD XCG XOF XPF YER ZAR ZMW ZWG').split(' ')
export const allCurrencies = (): string[] => ACTIVE
// numbers the way the phone writes them
export const fmtNum = (n: number, dec = 2, minDec = dec) => n.toLocaleString(undefined, { minimumFractionDigits: minDec, maximumFractionDigits: dec })
export const fmtCur = (amount: number, cur: Currency = MAIN, dec = true) => {
  const whole = cur === 'ARS' // pesos: no cents
  const v = fmtNum(whole ? Math.round(amount) : Math.round(amount * 100) / 100, whole || !dec ? 0 : 2)
  const [sym, before] = signOf(cur)
  return before ? (v.startsWith('-') ? '-' + sym + v.slice(1) : sym + v) : `${v} ${sym}`
}
// the currencies to pick from: main first, then the others (plus the one already chosen, if it was removed since)
export const curOptions = (s: Settings, keep?: Currency): [Currency, string][] => {
  const l = [s.mainCur, ...(s.curs ?? []).filter((c) => c !== s.mainCur)]
  if (keep && !l.includes(keep)) l.push(keep)
  return l.map((c) => [c, curSign(c)])
}

// the rate log, searched by day (cached per log object)
const logKeys = new WeakMap<object, string[]>()
const loggedRate = (s: Settings, cur: Currency, date: string): number | undefined => {
  const log = s.rateLog
  if (!log) return undefined
  let keys = logKeys.get(log)
  if (!keys) { keys = Object.keys(log).sort(); logKeys.set(log, keys) }
  if (!keys.length) return undefined
  // the last day on or before the date; before the log began, its first day (rates were frozen from then)
  let k = keys[0]
  for (const x of keys) { if (x <= date) k = x; else break }
  const e = log[k]
  const one = (c: Currency) => (c === e.m ? 1 : e.r[c])
  const a = one(cur), b = one(s.mainCur)
  return a && b ? a / b : undefined
}
// how much main currency 1 unit of `cur` is worth: on a past day from the log (so past amounts stay put),
// otherwise today's rate
export const rateOf = (s: Settings, cur: Currency = s.mainCur, date?: string): number => {
  if (!cur || cur === s.mainCur) return 1
  if (date && date < today()) { const r = loggedRate(s, cur, date); if (r) return r }
  return s.rates?.[cur] ?? loggedRate(s, cur, today()) ?? 1
}
export const hasRate = (s: Settings, cur: Currency) => cur === s.mainCur || !!s.rates?.[cur]
export const toMain = (s: Settings, amount: number, cur: Currency = s.mainCur, date?: string) => amount * rateOf(s, cur, date)
export const conv = (s: Settings, amount: number, from: Currency, to: Currency, date?: string) => (from === to ? amount : (amount * rateOf(s, from, date)) / rateOf(s, to, date))
// today's rates into the log (one entry a day, the latest wins)
export const logRates = (s: Settings) => {
  const t = today()
  s.rateLog = { ...(s.rateLog ?? {}), [t]: { m: s.mainCur, r: { ...s.rates } } }
}
// "25 € · 110 zł" for foreign amounts, plain main currency otherwise
export const fmtBoth = (s: Settings, amount: number, cur: Currency = s.mainCur, date?: string) => (cur === s.mainCur ? fmtCur(amount, cur) : `${fmtCur(amount, cur)} · ${fmtCur(toMain(s, amount, cur, date), s.mainCur, false)}`)
// every currency the data uses (their rates are kept up to date even when not in the pickers)
export const usedCurs = (st: State): Currency[] => {
  const out = new Set<Currency>(st.settings.curs ?? [])
  const add = (c?: Currency) => { if (c) out.add(c) }
  for (const p of Object.values(st.periods)) for (const i of p.items) add(i.currency)
  for (const x of st.spends) add(x.currency)
  for (const x of st.subscriptions ?? []) add(x.currency)
  for (const x of st.selfcare ?? []) add(x.currency)
  for (const x of st.credits ?? []) add(x.currency)
  for (const x of st.saved ?? []) add(x.currency)
  for (const x of st.clients) { add(x.cur ?? 'EUR'); add(x.fixedCur) }
  for (const x of st.sessions) add(x.feeCur)
  for (const c of st.classes ?? []) { add(c.currency); add(c.payIn); add(c.feeCurrency); if ((c.payIn ?? c.currency) === 'ARS') add('USD') }
  add(st.settings.taxCur)
  out.delete(st.settings.mainCur)
  return [...out]
}
// amounts saved without a currency get the main one, so changing it later doesn't change what they were
export const fillCurs = (d: State, cur = d.settings.mainCur) => {
  for (const p of Object.values(d.periods)) for (const i of p.items) i.currency ??= cur
  for (const x of d.spends) x.currency ??= cur
  for (const x of d.subscriptions ?? []) x.currency ??= cur
  for (const x of d.selfcare ?? []) x.currency ??= cur
  for (const x of d.credits ?? []) x.currency ??= cur
  for (const x of d.saved ?? []) x.currency ??= cur
  for (const c of d.classes ?? []) { c.currency ??= cur; if (c.fee) c.feeCurrency ??= cur; for (const p of c.pays) p.plnCur ??= cur }
}

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

// ---------- classes ----------
export const fmtArs = (n: number) => fmtCur(n, 'ARS')
export const fmtPay = (n: number, cur: PayCur, dec = false) => fmtCur(n, cur, dec)
export const weekdayName = (i: number) => weekdayNames()[i]
export const classPayIn = (c: Course): PayCur => c.payIn ?? c.currency
// how the price becomes what's sent (none when it's paid in the price currency)
export const classRateKind = (c: Course): ClassRate | undefined => {
  const p = classPayIn(c)
  if (p === c.currency) return undefined
  // pesos follow the same rule as every currency: the app's rate (its source — blue, official… — is set in Settings › Currencies)
  // or typed in when paying; old 'blue' / 'oficial' choices count as the app's rate
  return c.rate === 'manual' ? 'manual' : 'app'
}
// 1 unit of the price currency in the pay-in currency, from today's rates (undefined: typed in when paying, or not loaded)
export const classRate = (s: Settings, c: Course): number | undefined => {
  const k = classRateKind(c), p = classPayIn(c)
  if (!k) return 1
  if (k === 'manual') return undefined
  if (p === 'ARS') {
    const ars = k === 'oficial' ? s.oficialArs : s.blueArs
    return ars ? (rateOf(s, c.currency) / rateOf(s, 'USD')) * ars : undefined
  }
  return rateOf(s, c.currency) / rateOf(s, p)
}
// what one class comes to in the pay-in currency (pesos: whole pesos per class)
export const perClassPaid = (c: Course, rate: number) => (classPayIn(c) === 'ARS' ? Math.round(c.price * rate) : r2(c.price * rate))
// scheduled classes (weekdays + extras, minus cancelled) between two dates
export const classDates = (l: Course, from: string, to: string) => {
  const out = new Set<string>()
  if (from < l.since) from = l.since
  for (let d = from, g = 0; d <= to && g < 800; d = addDays(d, 1), g++) if (l.days.includes(parse(d).getDay())) out.add(d)
  for (const x of l.extra) if (x >= from && x <= to) out.add(x)
  return [...out].filter((d) => !l.skips.includes(d)).sort()
}
export const paysPerClass = (c: Course) => c.payEvery === 'class'
// per-class payers: what a month's classes cost (same shape as classBatch; the fee is paid each time)
export const classMonthCost = (st: State, c: Course, mk = today().slice(0, 7)) => {
  if (!c.price) return undefined
  const dim = daysInMonth(+mk.slice(0, 4), +mk.slice(5, 7))
  const dates = classDates(c, `${mk}-01`, `${mk}-${pad(dim)}`)
  if (!dates.length) return undefined
  const rate = classRate(st.settings, c)
  const fee = c.fee ?? 0
  const feeCur = c.feeCurrency ?? st.settings.mainCur
  const total = c.price * dates.length
  return { month: mk, dates, first: dates[0], due: dates[0], total, rate, paid: rate === undefined ? undefined : perClassPaid(c, rate) * dates.length, fee, feeCur, pln: r2(toMain(st.settings, total, c.currency) + toMain(st.settings, fee * dates.length, feeCur)) }
}
// a class's time on a day ('17:00–18:00'): its own time if it was changed, else the usual one
export const classEnd = (c: Course) => c.endTime ?? (c.time ? addHours(c.time, 1) : undefined) // classes are an hour unless set
export const classTime = (c: Course, d: string) => (c.times?.[d] ? timeSpan(c.times[d].start, c.times[d].end) : timeSpan(c.time, classEnd(c)))
// dates of classes that were moved away (they don't show as cancelled where they used to be)
export const movedAway = (c: Course) => new Set(Object.entries(c.moved ?? {}).filter(([to]) => c.extra.includes(to)).map(([, from]) => from))
// cancel / bring back one class
export const toggleClass = (L: Course, d: string) => {
  const off = L.skips.includes(d)
  if (L.extra.includes(d) && !off && !L.moved?.[d]) L.extra = L.extra.filter((y) => y !== d)
  else L.skips = off ? L.skips.filter((y) => y !== d) : [...L.skips, d]
}
// move one class to another day and/or time (the weekly schedule stays as it is)
export const rescheduleClass = (L: Course, d: string, to: string, start: string, end: string) => {
  if (to !== d) {
    const own = L.moved?.[d] ?? (L.extra.includes(d) ? undefined : d) // the class's own scheduled date (extras have none)
    if (L.moved?.[d]) { delete L.moved[d]; L.extra = L.extra.filter((x) => x !== d) }
    else if (L.extra.includes(d)) L.extra = L.extra.filter((x) => x !== d)
    else L.skips = [...L.skips, d]
    L.skips = L.skips.filter((x) => x !== to || x === own)
    if (own && to === own) L.skips = L.skips.filter((x) => x !== own) // back on its own day
    else { if (!L.extra.includes(to)) L.extra.push(to); if (own) (L.moved ??= {})[to] = own }
    if (L.times?.[d]) delete L.times[d]
  }
  if (!start || (start === (L.time ?? '') && (end || '') === (classEnd(L) ?? ''))) { if (L.times) delete L.times[to] }
  else (L.times ??= {})[to] = { start, end: end || undefined }
}
// the next batch to pay for: the unpaid classes in the month of the first unpaid one
export const classBatch = (st: State, c: Course, t = today()) => {
  if (!c.price) return undefined
  const paid = new Set(c.pays.flatMap((p) => p.dates))
  const first = classDates(c, c.since, addDays(t, 400)).find((d) => !paid.has(d))
  if (!first) return undefined
  const mk = monthKey(first)
  const dim = daysInMonth(+mk.slice(0, 4), +mk.slice(5, 7))
  const dates = classDates(c, `${mk}-01`, `${mk}-${pad(dim)}`).filter((d) => !paid.has(d))
  const rate = classRate(st.settings, c)
  const fee = c.fee ?? 0
  const feeCur = c.feeCurrency ?? st.settings.mainCur
  const due = `${mk}-${pad(Math.min(c.payDay ?? st.settings.splitDay, dim))}`
  const total = c.price * dates.length // in the price currency
  return { month: mk, dates, first, due, total, rate, paid: rate === undefined ? undefined : perClassPaid(c, rate) * dates.length, fee, feeCur, pln: r2(toMain(st.settings, total, c.currency) + toMain(st.settings, fee, feeCur)) }
}

// ---------- selfcare ----------
// planned date of the next time (never in the past: overdue counts as today)
export const careNext = (c: SelfCare, t = today()) => (c.next < t ? t : c.next)
export const careInPeriod = (st: State, start: string, end: string, t = today()) => {
  const out: { x: SelfCare; date: string; pln: number }[] = []
  for (const x of st.selfcare ?? []) {
    if (x.paused) continue
    let d = careNext(x, t)
    let guard = 0
    while (d <= end && guard++ < 60) {
      if (d >= start) out.push({ x, date: d, pln: toMain(st.settings, x.price, x.currency, d) })
      d = addDays(d, Math.max(1, x.everyDays))
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}
// the times that actually fall in a calendar month on the schedule (counted through the next planned date,
// back and forth by the repeat), so it's "2 manicures in November", not an average
export const careInMonth = (st: State, mk: string) => {
  const start = `${mk}-01`, end = addDays(`${nextMonth(mk)}-01`, -1)
  const out: { x: SelfCare; date: string; pln: number }[] = []
  for (const x of st.selfcare ?? []) {
    if (x.paused) continue
    const step = Math.max(1, x.everyDays)
    let d = x.next
    const back = Math.ceil(diffDays(start, d) / step) // jump to the first time on/after the 1st
    if (back > 0) d = addDays(d, -back * step)
    else if (d < start) d = addDays(d, Math.ceil(diffDays(d, start) / step) * step)
    for (let g = 0; d <= end && g < 60; g++, d = addDays(d, step)) if (d >= start) out.push({ x, date: d, pln: toMain(st.settings, x.price, x.currency, d) })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

// ---------- recipes ----------
const UNITS = 'g|gr|grams?|kg|ml|l|litres?|liters?|tbsp|tablespoons?|tsp|teaspoons?|cups?|pcs|pieces?|cloves?|pinch(?:es)?|handfuls?|slices?|cans?|packs?|bunch(?:es)?|sprigs?|stalks?|x'
// "200 g chicken breast" -> "chicken breast" (what to look for in Groceries)
export const ingredientName = (line: string) => line
  .replace(/\(.*?\)/g, ' ')
  .replace(/^[\s•*\-–—]+/, '')
  .replace(new RegExp(`^[\\d.,/½¼¾⅓⅔\\s-]*(?:(?:${UNITS})\\b\\.?)?\\s*(?:of\\s+)?`, 'i'), '')
  .split(/[,;:]| - | – /)[0]
  .trim().toLowerCase()
const stem = (w: string) => w.toLowerCase().replace(/(es|s)$/, '')
// the Groceries item an ingredient line refers to (by name, either way round, singular/plural)
export const groceryFor = (st: State, line: string) => {
  const n = ingredientName(line)
  if (!n) return undefined
  const words = n.split(/\s+/).map(stem)
  return st.supplies.find((s) => {
    if (s.cat !== 'groceries' || s.paused) return false
    const g = s.name.toLowerCase().split(/\s+/).map(stem).join(' ')
    const w = words.join(' ')
    return g === w || w.includes(g) || g.includes(w)
  })
}
// per ingredient: at home / to buy (on the list) / unknown (not tracked in Groceries)
export const recipeStatus = (st: State, r: Recipe) => r.ingredients.map((line) => {
  const sp = groceryFor(st, line)
  const state: 'home' | 'buy' | 'none' = !sp ? 'none' : sp.once ? 'buy' : supplyStatus(sp, st.settings).state === 'ok' ? 'home' : 'buy'
  return { line, sp, state }
})
// aerogrill steps written as "minutes left on the timer" -> how long each step takes
export const leftToDurations = (steps: CookStep[]): CookStep[] => {
  const xs = steps.slice().sort((a, b) => (b.min ?? 0) - (a.min ?? 0))
  return xs.map((x, i) => ({ text: x.text, min: x.min === undefined ? undefined : x.min - (xs[i + 1]?.min ?? 0) || undefined }))
}

// turn pasted text (e.g. a recipe from a chat) into a recipe draft:
// headings Ingredients / Stove / Aerogrill (air fryer) / Glaze · Sauce / Notes; "12 min" in a step line becomes its time
export const parseRecipe = (text: string): Omit<Recipe, 'id'> => {
  const clean = (l: string) => l.replace(/\*\*|__|`/g, '').replace(/^#+\s*/, '').trim()
  const lines = text.split(/\r?\n/).map(clean).filter(Boolean)
  const name = (lines.shift() ?? 'New recipe').replace(/[:.]$/, '')
  const H: [RegExp, Sec][] = [
    [/^(ingredients|you('ll)? need|what you need|shopping list)\b/i, 'ing'],
    [/^(stove|stovetop|pan|pot|hob|on the stove)\b/i, 'stove'],
    [/^(aero ?grill|air ?fryer|airfryer|air-fryer|air fry|air-fry)\b/i, 'air'],
    [/^(glaze|sauce|marinade|dressing|glaze\s*\/\s*sauce)\b/i, 'sauce'],
    [/^(steps|method|instructions|directions|how to( make| cook)?|preparation|cooking)\b/i, 'stove'],
    [/^(notes?|tips?|serving|to serve)\b/i, 'note']
  ]
  type Sec = 'none' | 'ing' | 'stove' | 'air' | 'sauce' | 'note'
  const bullet = /^([-•*–—]|\d+[.)]|step\s*\d+[:.)]?)\s*/i
  let sec: Sec = 'none'
  const r = { ingredients: [] as string[], stove: [] as CookStep[], air: [] as CookStep[], sauce: [] as string[], notes: [] as string[] }
  let minutes: number | undefined, airTemp: number | undefined, airLeft = false
  const step = (b: string): CookStep => {
    const m = b.match(/(\d+)\s*(?:-\s*\d+\s*)?(min|mins|minutes)\b/i)
    // the time moves to the timeline, so drop "– 12 min" / ", 8 min left" / "(5 min)" from the end of the text
    const text = b.replace(/\s*[,–—-]?\s*\(?(?:for\s+)?\d+\s*(?:-\s*\d+\s*)?(?:min|mins|minutes)(?:\s+left)?\)?\.?\s*$/i, '').trim() || b
    return { text, min: m ? Number(m[1]) : undefined }
  }
  for (const l of lines) {
    const h = H.find(([re]) => re.test(l))
    if (h && l.length < 40) {
      sec = h[1]
      const rest = l.replace(h[0], '').replace(/^[\s:/–—-]+/, '')
      if (sec === 'air') { const t = l.match(/(\d{3})\s*°?\s*C/i); if (t) airTemp = Number(t[1]) }
      if (sec === 'note' && rest) r.notes.push(rest)
      continue
    }
    const body = l.replace(bullet, '').trim()
    if (!body) continue
    if (sec === 'ing') r.ingredients.push(body)
    else if (sec === 'stove') r.stove.push(step(body))
    else if (sec === 'air') { if (/\d+\s*(min|mins|minutes)\s+left\b/i.test(body)) airLeft = true; r.air.push(step(body)); const t = body.match(/(\d{3})\s*°\s*C/i); if (t && !airTemp) airTemp = Number(t[1]) }
    else if (sec === 'sauce') r.sauce.push(body)
    else if (sec === 'note') r.notes.push(body)
    else if (/^[-•*–—]/.test(l)) r.ingredients.push(body)
    else if (/^\d+[.)]/.test(l)) r.stove.push(step(body))
    else if (!minutes && /(\d+)\s*(min|minutes)\b/i.test(l)) minutes = Number(l.match(/(\d+)\s*(min|minutes)\b/i)![1])
    else r.notes.push(body)
  }
  // pasted aerogrill times written as "8 min left" become how long each step takes
  const air = airLeft ? leftToDurations(r.air) : r.air
  return { name, minutes, ingredients: r.ingredients, stove: r.stove, air, airTemp, airDur: true, sauce: r.sauce, notes: r.notes.join('\n') || undefined }
}

// ---------- nutrition (recipes) ----------
// rough weight of one piece when a line gives a count, not grams ("1 chicken breast", "2 eggs")
const PIECE_G: [RegExp, number][] = [
  [/chicken breast|chicken fillet/, 200], [/chicken thigh/, 120], [/egg/, 50], [/lemon/, 100], [/lime/, 65], [/orange/, 150],
  [/garlic/, 4], [/onion|shallot/, 100], [/tomato/, 120], [/cherry tomato/, 15], [/(bell )?pepper/, 150], [/potato/, 170],
  [/sweet potato/, 200], [/carrot/, 60], [/banana/, 120], [/apple/, 180], [/avocado/, 150], [/cucumber/, 300],
  [/broccoli/, 300], [/cauliflower/, 500], [/zucchini|courgette/, 200], [/aubergine|eggplant/, 300], [/tortilla|wrap/, 60],
  [/bread|slice/, 35], [/salmon|fillet/, 130], [/burrata|mozzarella/, 125], [/can|tin/, 240]
]
const UNIT_G: [RegExp, number][] = [[/^kg$/, 1000], [/^(g|gr|grams?)$/, 1], [/^(l|litres?|liters?)$/, 1000], [/^ml$/, 1], [/^(tbsp|tablespoons?)$/, 15], [/^(tsp|teaspoons?)$/, 5], [/^cups?$/, 240], [/^(pinch(es)?)$/, 0.5], [/^handfuls?$/, 30], [/^cloves?$/, 4], [/^slices?$/, 30], [/^(cans?|tins?)$/, 240], [/^(packs?)$/, 250]]
const frac = (s: string) => s.replace('½', '0.5').replace('¼', '0.25').replace('¾', '0.75').replace('⅓', '0.33').replace('⅔', '0.67')
export const ingredientGrams = (line: string): { g: number; guessed: boolean } => {
  const l = frac(line.toLowerCase().replace(/^[\s•*\-–—]+/, ''))
  const m = l.match(/^(\d+(?:[.,]\d+)?)(?:\s*\/\s*(\d+))?(?:\s*-\s*\d+(?:[.,]\d+)?)?\s*([a-z]+)?/)
  const name = ingredientName(line)
  if (m) {
    let n = Number(m[1].replace(',', '.'))
    if (m[2]) n = n / Number(m[2])
    const unit = UNIT_G.find(([re]) => m[3] && re.test(m[3]))
    if (unit) return { g: n * unit[1], guessed: unit[1] !== 1 && unit[1] !== 1000 }
    const piece = PIECE_G.find(([re]) => re.test(name))
    return { g: n * (piece?.[1] ?? 100), guessed: true }
  }
  if (/salt|pepper|spice|herb|to taste/.test(name)) return { g: 1, guessed: true }
  const piece = PIECE_G.find(([re]) => re.test(name))
  return { g: piece?.[1] ?? 100, guessed: true }
}
// protein & fiber for one portion, from the looked-up values and the grams of each ingredient
export const recipeNutrition = (st: State, r: Recipe) => {
  const items = r.ingredients.map((line) => {
    const name = ingredientName(line)
    const n = st.nutrition?.[name]
    const auto = ingredientGrams(line)
    const own = r.grams?.[line]
    const g = own ?? auto.g
    return { line, name, n, g, guessed: own === undefined && auto.guessed, protein: n ? (n.protein * g) / 100 : 0, fiber: n ? (n.fiber * g) / 100 : 0 }
  })
  const por = Math.max(1, r.portions ?? 1)
  return {
    items,
    protein: items.reduce((a, x) => a + x.protein, 0) / por,
    fiber: items.reduce((a, x) => a + x.fiber, 0) / por,
    pending: items.filter((x) => x.name && x.n === undefined).map((x) => x.name), // not looked up yet
    notFound: items.filter((x) => x.n === null).length,
    guessed: items.some((x) => x.n && x.guessed)
  }
}
// daily needs: protein by body weight and activity (EFSA 0.83 g/kg as the floor, more when active; 1.0 from 65),
// fiber 25 g (EFSA adequate intake for adults)
export const PROTEIN_PER_KG = { low: 0.83, light: 1.0, active: 1.3, very: 1.6 } as const
// protein a day from weight + activity (no activity chosen = the minimum)
export const autoProtein = (weightKg?: number, activity?: Settings['activity'], age?: number) => {
  if (!weightKg) return undefined
  let k: number = PROTEIN_PER_KG[activity ?? 'low']
  if ((age ?? 0) >= 65) k = Math.max(k, 1.0)
  return Math.round(weightKg * k)
}
export const dailyNeeds = (s: Settings) => {
  const protein = s.proteinGoal || autoProtein(s.weightKg, s.activity, s.age) // your own goal wins
  return protein ? { protein, fiber: 25 } : undefined
}

// travel necessities: offered under a packing list's Other field; edited in Settings
const TRAVEL_STARTER = ['Passport', 'Residence permit', 'Charger', 'MacBook', 'Powerbank', 'AirPods', 'Meds', 'Book', 'Umbrella', 'Hairbrush', 'Hairclip', 'Hairdryer']
export const travelUsual = (s: { travelUsual?: string[] }) => s.travelUsual ?? TRAVEL_STARTER
