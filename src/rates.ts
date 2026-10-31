import { update, useStore } from './store'

// EUR: mid-market rate (ECB-based, via Frankfurter). Revolut has no public rates API, but on weekdays
// it converts at the mid-market rate, so this is as close as a public source gets.
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

const fetchEur = async (): Promise<number | undefined> => {
  const j = await getJson(EUR_URL)
  return j?.rates?.PLN
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

export const refreshRates = async (force = false) => {
  const s = useStore.getState().st.settings
  if (s.ratesAuto === false && !force) return false
  if (!force && s.ratesAt && Date.now() - new Date(s.ratesAt).getTime() < MAX_AGE_H * 3600000) return false
  const [eur, uah] = await Promise.allSettled([fetchEur(), fetchUah()])
  const e = eur.status === 'fulfilled' ? eur.value : undefined
  const u = uah.status === 'fulfilled' ? uah.value : undefined
  if (!e && !u) return false
  update((d) => {
    if (e) d.settings.eurPln = Math.round(e * 10000) / 10000
    if (u) d.settings.uahPln = Math.round(u.v * 1000000) / 1000000
    d.settings.ratesAt = new Date().toISOString()
    d.settings.ratesNote = [e ? 'EUR mid-market' : 'EUR kept', u ? `UAH ${u.src}` : 'UAH kept'].join(' · ')
  })
  return true
}

// refresh on start and whenever the app comes back to the screen
export const startRates = () => {
  refreshRates().catch(() => {})
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshRates().catch(() => {}) })
}
