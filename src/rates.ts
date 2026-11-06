import { update, useStore } from './store'
import { logRates, usedCurs } from './lib'
import type { Currency } from './types'

// Rates are kept as "how much main currency 1 unit is worth", per currency, from its own source:
// market — mid-market for any currency (open.er-api.com, Frankfurter/ECB as a fallback)
// official — the central bank of the main currency's country (NBP for zł, NBU for ₴, Banco Nación for pesos)
// manual — typed in, never touched
const MAX_AGE_H = 6

const getJson = async (url: string) => {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), 8000)
  try {
    const r = await fetch(url, { signal: ctl.signal })
    if (!r.ok) throw new Error(String(r.status))
    return await r.json()
  } finally {
    clearTimeout(t)
  }
}

type Got = Record<Currency, { v: number; src: string }>

// mid-market: everything against the main currency in one request
const fetchMarket = async (main: Currency): Promise<Got> => {
  const out: Got = {}
  try {
    const j = await getJson(`https://open.er-api.com/v6/latest/${main}`)
    if (j?.result === 'success') for (const [c, x] of Object.entries(j.rates as Record<string, number>)) if (x > 0) out[c] = { v: 1 / x, src: 'market' }
    if (Object.keys(out).length) return out
  } catch { /* fall back */ }
  const j = await getJson(`https://api.frankfurter.dev/v1/latest?base=${main}`)
  for (const [c, x] of Object.entries((j?.rates ?? {}) as Record<string, number>)) if (x > 0) out[c] = { v: 1 / x, src: 'ECB' }
  return out
}

// which main currencies have an official source, and its name
export const OFFICIAL: Record<string, string> = { PLN: 'NBP', UAH: 'NBU', ARS: 'Banco Nación' }
// the dólar blue (street rate) can be a currency's source: for pesos, or for dollars when pesos are the main currency
export const blueFits = (main: Currency, c: Currency) => (c === 'ARS' && main !== 'ARS') || (c === 'USD' && main === 'ARS')

const NBP = 'https://api.nbp.pl/api/exchangerates'
const fetchOfficial = async (main: Currency, want: Currency[]): Promise<Got> => {
  const out: Got = {}
  if (!want.length) return out
  if (main === 'PLN') {
    // table A (daily, main currencies), table B (weekly, the rest)
    for (const t of ['a', 'b']) {
      if (want.every((c) => out[c])) break
      try {
        const [tab] = await getJson(`${NBP}/tables/${t}/?format=json`)
        for (const r of tab?.rates ?? []) if (r.mid && !out[r.code]) out[r.code] = { v: r.mid, src: `NBP ${tab.no}` }
      } catch { /* the other table may still work */ }
    }
  } else if (main === 'UAH') {
    const j = (await getJson('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json')) as { cc: string; rate: number; exchangedate: string }[]
    for (const r of j) if (r.rate) out[r.cc] = { v: r.rate, src: `NBU ${r.exchangedate}` }
  } else if (main === 'ARS') {
    const [usd, rest] = await Promise.allSettled([getJson('https://dolarapi.com/v1/dolares/oficial'), getJson('https://dolarapi.com/v1/cotizaciones')])
    if (rest.status === 'fulfilled') for (const r of rest.value as { moneda: string; venta: number }[]) if (r.venta) out[r.moneda] = { v: r.venta, src: 'Banco Nación' }
    if (usd.status === 'fulfilled' && usd.value?.venta) out.USD = { v: usd.value.venta, src: 'dólar oficial' }
  }
  return out
}

const shift = (d: string, n: number) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10) }
// rate for an invoice: NBP mid rate (zł for 1 unit) from the last working day before the invoice date
export const nbpRateForInvoice = async (invoiceDate: string, cur: Currency = 'EUR'): Promise<{ rate: number; table: string; date: string }> => {
  for (const t of ['a', 'b']) {
    try {
      const j = await getJson(`${NBP}/rates/${t}/${cur.toLowerCase()}/${shift(invoiceDate, t === 'a' ? -12 : -20)}/${shift(invoiceDate, -1)}/?format=json`)
      const r = j?.rates?.[j.rates.length - 1]
      if (r?.mid) return { rate: r.mid, table: r.no, date: r.effectiveDate }
    } catch { /* try table B */ }
  }
  throw new Error('no rate')
}

// dólar blue (sell) from DolarApi, Bluelytics as a fallback; dólar oficial — for classes paid in pesos
export const fetchBlue = async (): Promise<number | undefined> => {
  try {
    const j = await getJson('https://dolarapi.com/v1/dolares/blue')
    if (j?.venta) return j.venta
  } catch { /* fall back */ }
  const j = await getJson('https://api.bluelytics.com.ar/v2/latest')
  if (j?.blue?.value_sell) return j.blue.value_sell
}
export const fetchOficial = async (): Promise<number | undefined> => {
  const j = await getJson('https://dolarapi.com/v1/dolares/oficial')
  if (j?.venta) return j.venta
}

let running: Promise<boolean> | undefined
export const refreshRates = (force = false): Promise<boolean> => (force ? doRefresh(true) : (running ??= doRefresh(false).finally(() => { running = undefined })))

const doRefresh = async (force: boolean) => {
  const st = useStore.getState().st
  const s = st.settings
  const main = s.mainCur
  const src = (c: Currency) => s.rateSrc?.[c] ?? 'market'
  const auto = usedCurs(st).filter((c) => src(c) !== 'manual')
  const blueSrc = auto.filter((c) => src(c) === 'blue' && blueFits(main, c))
  const ars = (st.classes ?? []).some((c) => (c.payIn ?? c.currency) === 'ARS') || blueSrc.length > 0
  const missing = auto.some((c) => !s.rates?.[c]) || (ars && !s.blueArs)
  if (!force && !missing && s.ratesAt && Date.now() - new Date(s.ratesAt).getTime() < MAX_AGE_H * 3600000) return false
  const off = OFFICIAL[main] ? auto.filter((c) => src(c) === 'official') : []
  const [mk, of, blue, ofi] = await Promise.allSettled([
    auto.length ? fetchMarket(main) : Promise.resolve({} as Got),
    fetchOfficial(main, off),
    ars ? fetchBlue() : Promise.resolve(undefined),
    ars ? fetchOficial() : Promise.resolve(undefined)
  ])
  const market = mk.status === 'fulfilled' ? mk.value : {}
  const official = of.status === 'fulfilled' ? of.value : {}
  const got: Got = {}
  for (const c of auto) {
    if (src(c) === 'official' && official[c]) got[c] = official[c]
    else if (market[c]) got[c] = { v: market[c].v, src: src(c) === 'official' ? `${market[c].src} (${Object.keys(official).length ? `${OFFICIAL[main] ?? 'official source'} has no rate for it` : `${OFFICIAL[main] ?? 'official source'} not reachable`})` : market[c].src }
  }
  const b = blue.status === 'fulfilled' ? blue.value : undefined
  const o = ofi.status === 'fulfilled' ? ofi.value : undefined
  // dólar blue as the source: pesos = (dollar in the main currency) / blue; dollars (pesos main) = blue
  for (const c of blueSrc) {
    if (!b) { delete got[c]; continue }
    const usd = main === 'USD' ? 1 : got.USD?.v ?? market.USD?.v ?? s.rates.USD
    if (c === 'USD') got[c] = { v: b, src: 'dólar blue' }
    else if (usd) got[c] = { v: usd / b, src: 'dólar blue' }
    else delete got[c]
  }
  if (!Object.keys(got).length && !b && !o) return false
  update((d) => {
    if (d.settings.mainCur !== main) return // the main currency changed meanwhile: the next refresh fetches for it
    const rates = { ...d.settings.rates }, note = { ...(d.settings.rateNote ?? {}) }
    for (const c of auto) {
      if (got[c]) { rates[c] = Math.round(got[c].v * 1e6) / 1e6; note[c] = got[c].src }
      else note[c] = 'kept the last one'
    }
    d.settings.rates = rates
    d.settings.rateNote = note
    if (b) { d.settings.blueArs = b; d.settings.blueAt = new Date().toISOString() }
    if (o) d.settings.oficialArs = o
    if (Object.keys(got).length) d.settings.ratesAt = new Date().toISOString()
    logRates(d.settings)
  })
  return true
}

// refresh on start and whenever the app comes back to the screen
export const startRates = () => {
  refreshRates().catch(() => {})
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshRates().catch(() => {}) })
}
