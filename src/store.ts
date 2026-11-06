import { create } from 'zustand'
import { get as idbGet, set as idbSet } from 'idb-keyval'
import type { BudgetItem, State } from './types'
import { seed } from './seed'
import { migrateTaxes } from './taxes'
import { defaultCleanPlan, defaultCleanTasks } from './cleaning'
import { fillCurs, leftToDurations, logRates, periodItems, periodOf, setMainCur, syncProjectBuys, today, uid } from './lib'

const KEY = 'now-what-state'

// bring older saved data / backups up to date
export const migrate = (s: State): State => {
  const out = { ...seed(), ...s }
  if ((s.version ?? 1) < 2) {
    // v2: Sunday cleaning rotation with separate Light / Regular / Extra lists
    out.cleanTasks = defaultCleanTasks()
    out.cleanPlan = defaultCleanPlan()
    out.cleanDone = {}
    delete out.cleanLog
    delete out.energy
    out.version = 2
  }
  if (out.version < 3) {
    // v3: supplies "cats" -> "pets"; projects become DIY / Outsource with planned steps
    out.supplies = out.supplies.map((x) => ((x.cat as string) === 'cats' ? { ...x, cat: 'pets' } : x))
    out.projects = out.projects.map((p: any) => ({
      id: p.id, name: p.name, toBuy: p.toBuy, cost: p.cost, done: p.done,
      kind: p.kind ?? (p.size === 'big' ? 'outsource' : 'diy'),
      steps: p.steps ?? (p.nextStep ? [{ id: uid(), text: p.nextStep }] : [])
    }))
    out.version = 3
  }
  if (out.version < 4) {
    // v4: supplies "beauty" -> "care"
    out.supplies = out.supplies.map((x) => ((x.cat as string) === 'beauty' ? { ...x, cat: 'care' } : x))
    out.version = 4
  }
  if (out.version < 5) {
    // v5: subscriptions get their own tab and flow into the budget automatically,
    // so the hand-written "Subscriptions" lines are dropped from this half on
    const now = periodOf(today(), out.settings).key
    for (const [key, p] of Object.entries(out.periods)) if (key >= now) p.items = p.items.filter((i) => !(i.kind === 'expense' && i.label.trim().toLowerCase() === 'subscriptions'))
    out.settings = { ...out.settings, uahPln: out.settings.uahPln ?? 0.0854, ratesAuto: out.settings.ratesAuto ?? true, subsFrom: now }
    out.version = 5
  }
  if (out.version < 6) {
    // v6: ZUS + PIT are paid at the start of the month
    out.settings = { ...out.settings, taxPayDay: out.settings.taxPayDay ?? 1 }
    out.version = 6
  }
  if (out.version < 7) {
    // v7: dated entries that were added to the wrong half move to the half of their date
    for (const [key, p] of Object.entries(out.periods)) {
      const keep = []
      for (const it of p.items) {
        const k = it.date ? periodOf(it.date, out.settings).key : key
        if (k === key) keep.push(it)
        else (out.periods[k] ??= { items: periodItems(out, k).items }).items.push(it)
      }
      p.items = keep
    }
    out.version = 7
  }
  if (out.version < 8) {
    // v8: fees marked invoiced in the edit form had no invoice date, so they never reached taxes —
    // use the entry's own date (open it to change)
    for (const x of out.sessions) if (x.fee !== undefined && x.invoiced && !x.invoiceDate) {
      const d = new Date(x.start)
      x.invoiceDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    out.version = 8
  }
  if (out.version < 9) {
    // v9: any currency. zł stays the main one; €, ₴, $ (and pesos, when a class uses them) are the others.
    // Today's rates start the rate log, so everything before today keeps today's rates from now on.
    const s0 = out.settings
    const ars = (out.classes ?? []).some((c) => (c.payIn ?? c.currency) === 'ARS') || !!out.lessons
    const curs = ['EUR', 'UAH', 'USD', ...(ars ? ['ARS'] : [])]
    const rates: Record<string, number> = { EUR: s0.eurPln ?? 4.3, UAH: s0.uahPln ?? 0.0854, USD: s0.usdPln ?? 4 }
    if (ars && s0.blueArs && s0.usdPln) rates.ARS = s0.usdPln / (s0.oficialArs ?? s0.blueArs)
    const src = s0.ratesAuto === false ? 'manual' : undefined
    out.settings = {
      ...s0, mainCur: 'PLN', curs, rates, taxCur: 'PLN',
      rateSrc: { EUR: src ?? 'official', USD: src ?? 'official', UAH: src ?? 'market', ...(ars ? { ARS: 'market' as const } : {}) }
    }
    delete out.settings.eurPln; delete out.settings.uahPln; delete out.settings.usdPln; delete out.settings.ratesAuto; delete out.settings.ratesNote
    for (const c of out.clients) c.cur ??= 'EUR'
    fillCurs(out, 'PLN')
    logRates(out.settings)
    out.version = 9
  }
  if (out.version < 10) {
    // v10: taxes become a list of tax lines; ZUS DRA, ZUS RCA and PIT-28 carry over with the same amounts, paid flags and own numbers
    migrateTaxes(out)
    out.version = 10
  }
  // Spanish classes (USD price paid in pesos) became one of the Classes
  if (out.lessons && !out.classes) {
    const l = out.lessons
    out.classes = [{
      id: uid(), name: 'Spanish', price: l.usd, currency: 'USD', payIn: 'ARS', rate: 'blue', fee: l.fee ?? 70, feeCurrency: 'PLN',
      days: l.days, time: l.time, payDay: l.payDay, since: l.since, extra: l.extra, skips: l.skips,
      pays: l.pays.map((p) => ({ id: p.id, date: p.date, dates: p.dates, price: p.usd, currency: 'USD', rate: p.blue, paid: p.ars, payIn: 'ARS', pln: p.pln, itemId: p.itemId }))
    }]
  }
  delete out.lessons
  for (const c of out.classes ?? []) { if ((c.payEvery as string) === 'week') c.payEvery = 'month'; delete (c as { payWeekday?: number }).payWeekday }
  fillCurs(out)
  syncProjectBuys(out) // project "need to buy" items → one-time supplies
  // nutrition: earlier lookups only searched basic foods — forget the "not found" ones so they're tried again everywhere
  if ((out.nutritionV ?? 1) < 2) { for (const k of Object.keys(out.nutrition ?? {})) if (out.nutrition![k] === null) delete out.nutrition![k]; out.nutritionV = 2 }
  // closet: "Tops" became Base (and Mid, for the layer over it) — old tops go to Base
  for (const list of [out.closet, out.saved, out.needs] as { cat: string }[][]) for (const x of list ?? []) if (x.cat === 'top') x.cat = 'base'
  // recipes: the old plain "steps" list becomes the Stove block
  for (const r of out.recipes ?? []) {
    if (r.steps) { if (r.steps.length && !r.stove?.length) r.stove = r.steps.map((text) => ({ text })); delete r.steps }
    // aerogrill steps used to be "minutes left"; now they're how long each step takes, like the stove
    if (r.air?.length && !r.airDur) r.air = leftToDurations(r.air)
    r.airDur = true
  }
  return out
}

interface Store {
  ready: boolean
  st: State
  update: (recipe: (d: State) => void) => void
  replace: (s: State) => void
}

let saveTimer: number | undefined
const persist = (s: State) => {
  clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => idbSet(KEY, s).catch(() => {}), 150)
}

export const useStore = create<Store>((set, get) => ({
  ready: false,
  st: seed(),
  update: (recipe) => {
    const d = structuredClone(get().st)
    recipe(d)
    fillCurs(d)
    syncProjectBuys(d)
    set({ st: d })
    persist(d)
  },
  replace: (s) => {
    set({ st: s })
    persist(s)
  }
}))

export const hydrate = async () => {
  try {
    const saved = (await idbGet(KEY)) as State | undefined
    if (saved && saved.version) { const m = migrate(saved); useStore.setState({ st: m, ready: true }); if (m !== saved) persist(m) }
    else {
      const s = seed()
      useStore.setState({ st: s, ready: true })
      persist(s)
    }
  } catch {
    useStore.setState({ ready: true })
  }
}

// fmt() and friends show the main currency
useStore.subscribe((s) => setMainCur(s.st.settings.mainCur))

export const useSt = () => useStore((s) => s.st)
export const update = (recipe: (d: State) => void) => useStore.getState().update(recipe)

// make sure a period exists (materialise its template copy) before editing it
export const ensurePeriod = (d: State, key: string) => {
  if (!d.periods[key]) d.periods[key] = { items: periodItems(d, key).items }
  return d.periods[key]
}

export const addIncome = (d: State, key: string, item: Omit<BudgetItem, 'id' | 'kind'>) => {
  ensurePeriod(d, key).items.push({ id: uid(), kind: 'income', ...item })
}

export const dismissToday = (id: string) =>
  update((d) => {
    const t = today()
    if (d.dismissed.date !== t) d.dismissed = { date: t, ids: [] }
    d.dismissed.ids.push(id)
  })

export const exportJson = () => {
  const s = useStore.getState().st
  const blob = new Blob([JSON.stringify(s)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `now-what-backup-${today()}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

export const importJson = async (file: File) => {
  const text = await file.text()
  const s = JSON.parse(text) as State
  if (!s || !s.version || !s.settings) throw new Error('Not a Now what? backup')
  useStore.getState().replace(migrate(s))
}
