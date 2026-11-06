import { useEffect, useState, type ReactNode } from 'react'
import { update, useSt } from './store'
import type { Place } from './types'
import { addDays, today } from './lib'
import { Icon, List, popSheet, pushSheet, Row, Sheet, toast } from './ui'

// A basic forecast for a day in the calendar, from Open-Meteo (free, no key). The place lives in
// settings on the phone only. Forecast reaches ~15 days ahead; the last month is kept too.

export interface Wx { code: number; max: number; min: number; rain: number | null }

const PAST = 31, AHEAD = 16
let cache: { key: string; at: number; days: Record<string, Wx> } | null = null
let pending: Promise<void> | null = null
const keyOf = (p: Place) => `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`

const load = (p: Place) => {
  const key = keyOf(p)
  if (cache?.key === key && Date.now() - cache.at < 3600_000) return Promise.resolve()
  if (pending) return pending
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&past_days=${PAST}&forecast_days=${AHEAD}`
  pending = fetch(url).then((r) => r.json()).then((j) => {
    const d = j.daily ?? {}
    const days: Record<string, Wx> = {}
    ;(d.time ?? []).forEach((t: string, i: number) => {
      if (d.temperature_2m_max?.[i] == null) return
      days[t] = { code: d.weather_code?.[i] ?? 0, max: d.temperature_2m_max[i], min: d.temperature_2m_min?.[i] ?? d.temperature_2m_max[i], rain: d.precipitation_probability_max?.[i] ?? null }
    })
    cache = { key, at: Date.now(), days }
  }).catch(() => {}).finally(() => { pending = null })
  return pending
}

const useWeather = (p: Place | undefined) => {
  const [, bump] = useState(0)
  useEffect(() => { if (p) load(p).then(() => bump((n) => n + 1)) }, [p?.lat, p?.lon])
  return p && cache?.key === keyOf(p) ? cache.days : null
}

// WMO weather codes → words + a picture
type Kind = 'sun' | 'part' | 'cloud' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm'
const kindOf = (c: number): [Kind, string] =>
  c === 0 ? ['sun', 'Clear'] : c === 1 ? ['sun', 'Mostly clear'] : c === 2 ? ['part', 'Partly cloudy'] : c === 3 ? ['cloud', 'Cloudy']
  : c === 45 || c === 48 ? ['fog', 'Fog'] : c >= 51 && c <= 57 ? ['drizzle', 'Drizzle']
  : c === 66 || c === 67 ? ['rain', 'Freezing rain'] : c >= 61 && c <= 65 ? ['rain', c === 65 ? 'Heavy rain' : 'Rain']
  : c >= 71 && c <= 77 ? ['snow', 'Snow'] : c >= 80 && c <= 82 ? ['rain', 'Showers'] : c === 85 || c === 86 ? ['snow', 'Snow showers']
  : c >= 95 ? ['storm', 'Thunderstorm'] : ['cloud', 'Cloudy']

const W = ({ children }: { children: ReactNode }) => (
  <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
)
const CLOUD = 'M7 18h10a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 7 11a3.5 3.5 0 0 0 0 7z'
const PIC: Record<Kind, ReactNode> = {
  sun: <W><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></W>,
  part: <W><path d="M8 3v1.5M3.5 8H2M4.6 4.6l1 1M12.4 5.6l-1 1" /><path d="M5.2 10.5A3.5 3.5 0 0 1 11 6.4" /><path d="M9 20h8a3.5 3.5 0 0 0 .4-6.98A4.5 4.5 0 0 0 9 13.5a3.25 3.25 0 0 0 0 6.5z" /></W>,
  cloud: <W><path d={CLOUD} /></W>,
  fog: <W><path d="M4 9h16M3 13h18M5 17h14" /></W>,
  drizzle: <W><path d="M7 15h10a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 7 8a3.5 3.5 0 0 0 0 7z" /><path d="M9 18.5v.5M13 19.5v.5M17 18.5v.5" /></W>,
  rain: <W><path d="M7 15h10a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 7 8a3.5 3.5 0 0 0 0 7z" /><path d="M9 18l-1 3M13 18l-1 3M17 18l-1 3" /></W>,
  snow: <W><path d="M7 15h10a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 7 8a3.5 3.5 0 0 0 0 7z" /><path d="M9 19h.01M13 20h.01M17 19h.01M11 22h.01M15 22h.01" /></W>,
  storm: <W><path d="M7 15h10a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 7 8a3.5 3.5 0 0 0 0 7z" /><path d="M12.5 15l-2 3.5h3l-2 3.5" /></W>
}

// the block under a day's list in the calendar
export const DayWeather = ({ date }: { date: string }) => {
  const st = useSt()
  const p = st.settings.weather
  const days = useWeather(p ?? undefined)
  if (st.settings.weatherOff) return null
  const t = today()
  if (date < addDays(t, -PAST) || date > addDays(t, AHEAD - 1)) return null
  if (!p) return <List><Row title="Weather" meta="Choose your city" trail={<Icon.chevR />} onClick={() => pushSheet(<PlaceSheet />)} /></List>
  const w = days?.[date]
  if (!w) return null
  const [k, words] = kindOf(w.code)
  return (
    <List>
      <Row lead={<span style={{ display: 'flex' }}>{PIC[k]}</span>} title={words}
        meta={[p.name, w.rain != null && w.rain > 0 ? `rain ${w.rain}%` : ''].filter(Boolean).join(' · ')}
        trail={`${Math.round(w.max)}° / ${Math.round(w.min)}°`} onClick={() => pushSheet(<PlaceSheet />)} />
    </List>
  )
}

// where the weather is for: search a city, or use where the phone is
export const PlaceSheet = () => {
  const st = useSt()
  const [q, setQ] = useState('')
  const [found, setFound] = useState<(Place & { where: string })[] | null>(null)
  useEffect(() => {
    if (q.trim().length < 2) { setFound(null); return }
    const t = setTimeout(() => {
      fetch(`https://geocoding-api.open-meteo.com/v1/search?count=8&language=en&name=${encodeURIComponent(q.trim())}`)
        .then((r) => r.json())
        .then((j) => setFound((j.results ?? []).map((x: { name: string; latitude: number; longitude: number; admin1?: string; country?: string }) => ({ name: x.name, lat: x.latitude, lon: x.longitude, where: [x.admin1, x.country].filter(Boolean).join(', ') }))))
        .catch(() => setFound([]))
    }, 300)
    return () => clearTimeout(t)
  }, [q])
  const pick = (p: Place) => { update((s) => { s.settings = { ...s.settings, weather: p, weatherOff: undefined } }); popSheet() }
  const here = () => navigator.geolocation?.getCurrentPosition(
    (g) => pick({ name: 'Where I am', lat: g.coords.latitude, lon: g.coords.longitude }),
    () => toast('Couldn’t get your location'))
  return (
    <Sheet title="Weather" onBack={popSheet}>
      {st.settings.weather && <span className="t15 muted">Now for {st.settings.weather.name}.</span>}
      <input className="input" autoFocus value={q} placeholder="City" onChange={(e) => setQ(e.target.value)} />
      {found && (
        <List empty={found.length ? undefined : 'No city by that name.'}>
          {found.map((x) => <Row key={`${x.lat},${x.lon}`} title={x.name} meta={x.where || undefined} onClick={() => pick(x)} />)}
        </List>
      )}
      <button className="btn full soft" onClick={here}>Use where I am</button>
    </Sheet>
  )
}
