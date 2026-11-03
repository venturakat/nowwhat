import { update, useStore } from './store'

// EUR: NBP table A mid rate (what Polish accounting — e.g. inFakt — uses); Frankfurter (ECB) as a fallback.
// UAH: monobank's public rates (rateCross for PLN = hryvnias per 1 zł).
const EUR_URL = 'https://api.frankfurter.dev/v1/latest?base=EUR&symbols=PLN'
const MONO_URL = 'https://api.monobank.ua/bank/currency'
const UAH_FALLBACK_URL = 'https://api.frankfurter.dev/v2/rate/pln/uah'
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

const NBP = 'https://api.nbp.pl/api/exchangerates/rates/a/eur'
const fetchEur = async (): Promise<{ v: number; src: string } | undefined> => {
  try {
    const j = await getJson(`${NBP}/?format=json`)
    const r = j?.rates?.[0]
    if (r?.mid) return { v: r.mid, src: `NBP ${r.no}` }
  } catch { /* fall back */ }
  const j = await getJson(EUR_URL)
  if (j?.rates?.PLN) return { v: j.rates.PLN, src: 'ECB' }
}

const shift = (d: string, n: number) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10) }
// rate for an invoice: NBP table A from the last working day before the invoice date
export const nbpRateForInvoice = async (invoiceDate: string): Promise<{ rate: number; table: string; date: string }> => {
  const j = await getJson(`${NBP}/${shift(invoiceDate, -12)}/${shift(invoiceDate, -1)}/?format=json`)
  const r = j?.rates?.[j.rates.length - 1]
  if (!r?.mid) throw new Error('no rate')
  return { rate: r.mid, table: r.no, date: r.effectiveDate }
}

const fetchUah = async (): Promise<{ v: number; src: string } | undefined> => {
  try {
    const j = (await getJson(MONO_URL)) as { currencyCodeA: number; currencyCodeB: number; rateCross?: number; rateBuy?: number; rateSell?: number }[]
    const pln = j.find((x) => x.currencyCodeA === 985 && x.currencyCodeB === 980)
    const uahPerPln = pln?.rateCross ?? (pln?.rateBuy && pln?.rateSell ? (pln.rateBuy + pln.rateSell) / 2 : undefined)
    if (uahPerPln) return { v: 1 / uahPerPln, src: 'monobank' }
  } catch { /* monobank limits requests; fall back below */ }
  const j = await getJson(UAH_FALLBACK_URL)
  if (j?.rate) return { v: 1 / j.rate, src: 'mid-market' }
}

// USD: NBP table A; dólar blue (sell) from DolarApi, Bluelytics as a fallback
const fetchUsd = async () => {
  const j = await getJson('https://api.nbp.pl/api/exchangerates/rates/a/usd/?format=json')
  const r = j?.rates?.[0]
  if (r?.mid) return r.mid as number
}
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

export const refreshRates = async (force = false) => {
  const s = useStore.getState().st.settings
  if (s.ratesAuto === false && !force) return false
  // pesos only when a class is paid in them (USD from NBP always: classes and amounts can be in dollars)
  const ars = (useStore.getState().st.classes ?? []).some((c) => (c.payIn ?? c.currency) === 'ARS')
  const missing = (ars && !s.blueArs) || !s.usdPln // a class just started needing them
  if (!force && !missing && s.ratesAt && Date.now() - new Date(s.ratesAt).getTime() < MAX_AGE_H * 3600000) return false
  const [eur, uah, usd, blue, ofi] = await Promise.allSettled([fetchEur(), fetchUah(), fetchUsd(), ars ? fetchBlue() : Promise.resolve(undefined), ars ? fetchOficial() : Promise.resolve(undefined)])
  const e = eur.status === 'fulfilled' ? eur.value : undefined
  const u = uah.status === 'fulfilled' ? uah.value : undefined
  if (!e && !u) return false
  // rates added manually stay put until "Update now" switches back to automatic
  const manual = useStore.getState().st.settings.ratesAuto === false
  update((d) => {
    if (e && !manual) d.settings.eurPln = Math.round(e.v * 10000) / 10000
    if (u && !manual) d.settings.uahPln = Math.round(u.v * 1000000) / 1000000
    if (usd.status === 'fulfilled' && usd.value) d.settings.usdPln = usd.value
    if (blue.status === 'fulfilled' && blue.value) { d.settings.blueArs = blue.value; d.settings.blueAt = new Date().toISOString() }
    if (ofi.status === 'fulfilled' && ofi.value) d.settings.oficialArs = ofi.value
    if (manual) return
    d.settings.ratesAt = new Date().toISOString()
    d.settings.ratesNote = [e ? `EUR ${e.src}` : 'EUR kept', u ? `UAH ${u.src}` : 'UAH kept'].join(' · ')
  })
  return true
}

// refresh on start and whenever the app comes back to the screen
export const startRates = () => {
  refreshRates().catch(() => {})
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshRates().catch(() => {}) })
}
