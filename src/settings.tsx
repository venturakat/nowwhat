import { exportJson, importJson, update, useSt, useStore } from './store'
import { useState } from 'react'
import { Field, Icon, List, popSheet, pushSheet, Row, Sheet, toast } from './ui'
import { FormSheet } from './form'
import { seed } from './seed'
import { blueFits, OFFICIAL, refreshRates } from './rates'
import { allCurrencies, autoProtein, curName, curOptions, curSign, dailyNeeds, fillCurs, fmtDay, fmtNum, hasRate, logRates, numText, parseNum, rateOf, travelUsual, usedCurs } from './lib'
import type { RateSrc, State } from './types'

export const SettingsSheet = () => {
  return (
    <Sheet title="Settings" full>
      <CurrenciesCard />
      <TaxesCard />
      <DaysCard />
      <AboutCard />
      <TravelCard />
      <button className="card" style={{ gap: 4 }} onClick={() => pushSheet(<BackupSheet />)}>
        <span className="t17">Backup</span>
        <span className="t14 muted">Save a backup file, restore one, or start fresh</span>
      </button>
    </Sheet>
  )
}

// backup lives on its own page, so "Erase everything" can't be tapped by accident from the main menu
const BackupSheet = () => (
  <Sheet title="Backup" full onBack={popSheet}>
    <span className="t15 muted">Everything lives only on this phone. Save a backup file now and then (e.g. to iCloud Drive).</span>
    <button className="btn" onClick={exportJson}>Save backup file</button>
    <label className="btn soft" style={{ cursor: 'pointer' }}>
      Restore from backup
      <input type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { await importJson(f); toast('Restored') } catch { toast('That file is not a backup') } }} />
    </label>
    <div style={{ marginTop: 'auto', paddingTop: 32, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span className="t13 muted">Removes all your data from this phone. Save a backup first if you need it.</span>
      <button className="btn soft" style={{ color: 'var(--alert)' }} onClick={() => { if (confirm('Erase everything on this phone and start fresh? This can’t be undone.')) { useStore.getState().replace(seed()); toast('Fresh start') } }}>Erase everything</button>
    </div>
  </Sheet>
)

const TaxesCard = () => {
  const st = useSt()
  return (
    <button className="card" style={{ gap: 4 }} onClick={() => pushSheet(
      <FormSheet title="Taxes & accounts" onBack={popSheet} initial={{ ...st.settings, taxCur: st.settings.taxCur ?? 'PLN', pitPct: Math.round(st.settings.pitRate * 1000) / 10 }}
        fields={[
          { key: 'taxCur', label: 'Taxes are in', type: 'select', options: curOptions(st.settings, st.settings.taxCur ?? 'PLN') },
          { key: 'pitPct', label: 'PIT-28 ryczałt %', type: 'number' },
          { key: 'dra', label: 'ZUS DRA (health) per month', type: 'number' },
          { key: 'rca', label: 'ZUS RCA (social) per month', type: 'number' },
          { key: 'zusBasis', label: 'ZUS contribution basis (podstawa wymiaru składek)', type: 'number' },
          { key: 'taxPayDay', label: 'I pay ZUS + PIT on day (puts it in the budget)', type: 'number', step: 1 },
          { key: 'taxDueDay', label: 'Official deadline, day', type: 'number', step: 1 },
          { key: 'zusAccount', label: 'ZUS account (rachunek składkowy)', type: 'text' },
          { key: 'taxAccount', label: 'Tax account (mikrorachunek)', type: 'text' },
          { key: 'nip', label: 'NIP', type: 'text' },
          { key: 'regon', label: 'REGON', type: 'text' },
          { key: 'pesel', label: 'PESEL', type: 'text' },
          { key: 'taxIdKind', label: 'Identify me in tax transfers with', type: 'select', options: [['nip', 'NIP'], ['regon', 'REGON'], ['pesel', 'PESEL']] }
        ]}
        onSave={(v) => update((d) => {
          const { pitPct, ...rest } = v
          const clean = (x?: string) => x?.replace(/\s/g, '') || undefined // numbers without spaces, the way the transfer form wants them
          d.settings = { ...d.settings, ...rest, zusBasis: v.zusBasis || undefined, nip: clean(v.nip), regon: clean(v.regon), pesel: clean(v.pesel), pitRate: (pitPct ?? 14) / 100 }
        })}
      />
    )}>
      <span className="t17">Taxes & accounts</span>
      <span className="t14 muted">ZUS amounts, PIT %, pay days, account numbers, NIP / REGON / PESEL</span>
    </button>
  )
}

const AboutCard = () => {
  const st = useSt()
  const s = st.settings
  return (
    <button className="card" style={{ gap: 4 }} onClick={() => pushSheet(
      <FormSheet title="About you" onBack={popSheet} initial={{ age: s.age, weightKg: s.weightKg, activity: s.activity, proteinGoal: s.proteinGoal }}
        fields={[
          { key: 'age', label: 'Age', type: 'number', step: 1 },
          { key: 'weightKg', label: 'Weight (kg)', type: 'number' },
          { key: 'activity', label: 'Activity', type: 'select', options: [['low', 'Mostly sitting'], ['light', 'Light'], ['active', 'Active'], ['very', 'Very active']] },
          { key: 'proteinGoal', label: 'Protein goal (g a day)', type: 'number', step: 1, placeholder: (v) => { const a = autoProtein(parseNum(v.weightKg), v.activity, parseNum(v.age)); return a ? `${a} — from your weight and activity` : 'Add your weight to work it out' } }
        ]}
        extra={<span className="t13 muted">Recipes show how much of your daily protein and fiber one portion covers. Protein goal left empty = worked out from your weight: 0.83 g per kg when mostly sitting or no activity chosen (the official minimum), 1.0 light, 1.3 active, 1.6 very active (at least 1.0 from 65). Fiber: 25 g a day (EFSA). A general guide, not medical advice. Stays on this phone.</span>}
        onSave={(v) => update((d) => { d.settings = { ...d.settings, age: v.age || undefined, weightKg: v.weightKg || undefined, activity: v.activity, proteinGoal: v.proteinGoal || undefined } })}
      />
    )}>
      <span className="t17">About you</span>
      <span className="t14 muted">{s.weightKg || s.proteinGoal ? [s.age ? `${s.age} y` : '', s.weightKg ? `${s.weightKg} kg` : '', s.activity ? { low: 'mostly sitting', light: 'light activity', active: 'active', very: 'very active' }[s.activity] : '', dailyNeeds(s) ? `protein ${dailyNeeds(s)!.protein} g a day` : ''].filter(Boolean).join(' · ') : 'Age, weight, activity, protein goal — for recipes'}</span>
    </button>
  )
}

const TravelCard = () => {
  const st = useSt()
  const all = travelUsual(st.settings)
  return (
    <button className="card" style={{ gap: 4 }} onClick={() => pushSheet(<TravelSheet />)}>
      <span className="t17">Travel necessities</span>
      <span className="t14 muted">{all.length ? all.slice(0, 4).join(', ') + (all.length > 4 ? ` and ${all.length - 4} more` : '') : 'What you always take — offered on packing lists'}</span>
    </button>
  )
}

// the things offered in a packing list's Other field, so they don't have to be remembered
const TravelSheet = () => {
  const st = useSt()
  const all = travelUsual(st.settings)
  const [text, setText] = useState('')
  const set = (xs: string[]) => update((d) => { d.settings = { ...d.settings, travelUsual: xs } })
  const add = () => {
    const have = new Set(all.map((x) => x.toLowerCase()))
    const names = text.split(',').map((x) => x.trim()).filter((x) => x && !have.has(x.toLowerCase())).map((x) => x[0].toUpperCase() + x.slice(1))
    if (names.length) set([...all, ...new Set(names)])
    setText('')
  }
  return (
    <Sheet title="Travel necessities" full onBack={popSheet}>
      <span className="t15 muted">Offered in the Other field of every packing list — pick them instead of remembering. Each one hides once it’s on that list.</span>
      <List empty="Nothing yet — add what you always take.">
        {all.map((x) => (
          <div key={x} className="lrow" style={{ paddingTop: 9, paddingBottom: 9 }}>
            <span className="grow"><div className="title">{x}</div></span>
            <button aria-label={`Remove ${x}`} className="muted" style={{ display: 'flex', padding: 4, margin: -4 }} onClick={() => set(all.filter((y) => y !== x))}><Icon.x /></button>
          </div>
        ))}
      </List>
      <div className="row" style={{ gap: 8 }}>
        <input className="input" style={{ flex: 1, minWidth: 0 }} value={text} placeholder="Sunglasses, adapter…" enterKeyHint="done"
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
        <button className="btn" disabled={!text.trim()} onClick={add}>Add</button>
      </div>
    </Sheet>
  )
}

const DaysCard = () => {
  const st = useSt()
  return (
    <button className="card" style={{ gap: 4 }} onClick={() => pushSheet(
      <FormSheet title="Budget & shopping days" onBack={popSheet} initial={{ ...st.settings }}
        fields={[
          { key: 'splitDay', label: 'Second fortnight starts on day', type: 'number', step: 1 },
          { key: 'leadDays', label: 'Shop meds, pets & care this many days before they run out', type: 'number', step: 1 },
          { key: 'leadDaysShort', label: 'Shop groceries & home this many days before', type: 'number', step: 1 }
        ]}
        onSave={(v) => update((d) => { d.settings = { ...d.settings, ...v } })}
      />
    )}>
      <span className="t17">Budget & shopping days</span>
      <span className="t14 muted">When the second fortnight starts, how early to restock supplies</span>
    </button>
  )
}

// ---------- Currencies ----------
// main currency (totals, budget), the others to pick from, and where each rate comes from
const CurrenciesCard = () => {
  const s = useSt().settings
  return (
    <button className="card" style={{ gap: 4 }} onClick={() => pushSheet(<CurrenciesSheet />)}>
      <span className="t17">Currencies</span>
      <span className="t14 muted">Main: {curName(s.mainCur)}{s.curs.length ? ` · also ${s.curs.map(curSign).join(', ')}` : ''}</span>
    </button>
  )
}

const fmtRate = (n?: number) => (n ? fmtNum(n, n < 0.1 ? 6 : 4, 2) : '—')

const CurrenciesSheet = () => {
  const st = useSt()
  const s = st.settings
  const [busy, setBusy] = useState(false)
  const at = s.ratesAt ? new Date(s.ratesAt) : null
  const when = at ? `${fmtDay(at.toISOString().slice(0, 10))}, ${at.toTimeString().slice(0, 5)}` : 'not yet'
  const src = (c: string) => s.rateSrc?.[c] ?? 'market'
  return (
    <Sheet title="Currencies" full onBack={popSheet}>
      <Field label="Main currency">
        <button className="card" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: '14px 16px' }} onClick={() => pushSheet(<CurPicker main />)}>
          <span className="t17 grow" style={{ textAlign: 'left' }}>{curSign(s.mainCur)} · {curName(s.mainCur)}</span>
          <span className="t14 muted">Change</span>
        </button>
        <span className="t13 muted">Totals, the budget and per-day money are shown in it. Everything keeps its own currency.</span>
      </Field>
      <List title="Other currencies">
        {s.curs.map((c) => (
          <Row key={c} title={`${curSign(c)} · ${curName(c)}`}
            meta={src(c) === 'manual' ? 'typed in' : src(c) === 'blue' ? 'dólar blue' : `${src(c) === 'official' ? OFFICIAL[s.mainCur] ?? 'official' : 'market'}${s.rateNote?.[c] && src(c) !== 'manual' && s.rateNote[c] !== 'market' ? ' · ' + s.rateNote[c] : ''}`}
            trail={<span className="t15">{fmtRate(s.rates[c])} {curSign(s.mainCur)}</span>}
            onClick={() => pushSheet(<CurSheet c={c} />)} />
        ))}
        <Row title={<span className="muted">+ Add currency</span>} onClick={() => pushSheet(<CurPicker />)} />
      </List>
      <span className="t13 muted" style={{ padding: '0 4px' }}>Rates: how much {curSign(s.mainCur)} one unit is worth. Updated {when}. Past amounts keep the rate of their day.</span>
      <button className="btn soft" disabled={busy} onClick={async () => {
        setBusy(true)
        const ok = await refreshRates(true).catch(() => false)
        setBusy(false)
        toast(ok ? 'Rates updated' : 'Could not reach the rate sources — kept the last ones')
      }}>{busy ? 'Updating…' : 'Update now'}</button>
    </Sheet>
  )
}

// one currency: where its rate comes from, or the rate typed in
const CurSheet = ({ c }: { c: string }) => {
  const st = useSt()
  const s = st.settings
  const [srcNow, setSrc] = useState<RateSrc>(s.rateSrc?.[c] ?? 'market')
  const [rate, setRate] = useState(numText(s.rates[c]))
  const [armed, setArmed] = useState(false)
  const off = OFFICIAL[s.mainCur]
  const opts: [RateSrc, string][] = [['market', 'Market'], ...(off ? [['official', `Official · ${off}`] as [RateSrc, string]] : []), ...(blueFits(s.mainCur, c) ? [['blue', 'Dólar blue'] as [RateSrc, string]] : []), ['manual', 'Type it in']]
  const used = usedCurs({ ...st, settings: { ...s, curs: [] } }).includes(c)
  return (
    <Sheet title={`${curSign(c)} · ${curName(c)}`} full onBack={popSheet}>
      <Field label="Rate from">
        <div className="seg">{opts.map(([k, l]) => <button key={k} type="button" className={'chip' + (srcNow === k ? ' on' : '')} onClick={() => setSrc(k)}>{l}</button>)}</div>
      </Field>
      {srcNow === 'manual'
        ? <Field label={`1 ${curSign(c)} in ${curSign(s.mainCur)}`}><input className="input" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} /></Field>
        : <span className="t14 muted">Now 1 {curSign(c)} = {fmtRate(s.rates[c])} {curSign(s.mainCur)}. {srcNow === 'official' ? `${off}’s rate, the one used in accounting.` : srcNow === 'blue' ? 'The street rate (sell), from DolarApi.' : 'Mid-market, updated a few times a day.'}</span>}
      <button className="btn full" disabled={srcNow === 'manual' && !parseNum(rate)} onClick={() => {
        update((d) => {
          d.settings.rateSrc = { ...(d.settings.rateSrc ?? {}), [c]: srcNow }
          if (srcNow === 'manual') { d.settings.rates = { ...d.settings.rates, [c]: parseNum(rate)! }; d.settings.rateNote = { ...(d.settings.rateNote ?? {}), [c]: 'typed in' }; logRates(d.settings) }
        })
        popSheet()
        if (srcNow !== 'manual') refreshRates(true).catch(() => {})
      }}>Save</button>
      <button className={'btn full ' + (armed ? 'ghost' : 'soft')} style={armed ? { color: 'var(--alert)', borderColor: 'var(--alert)' } : undefined} onClick={() => {
        if (!armed) { setArmed(true); toast(used ? 'Still used by some amounts — its rate stays updated. Tap again to remove it from the pickers' : 'Tap again to remove'); return }
        update((d) => { d.settings.curs = d.settings.curs.filter((x) => x !== c) })
        popSheet()
      }}>{armed ? 'Tap again to remove' : 'Remove from the pickers'}</button>
    </Sheet>
  )
}

// pick a currency to add, or the new main one
const CurPicker = ({ main }: { main?: boolean }) => {
  const s = useSt().settings
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const skip = new Set([s.mainCur, ...(main ? [] : s.curs)])
  const ql = q.trim().toLowerCase()
  const list = allCurrencies().filter((c) => !skip.has(c) && (!ql || c.toLowerCase().includes(ql) || curName(c).toLowerCase().includes(ql)))
  // the ones already in use first when changing the main one
  if (main) list.sort((a, b) => Number(s.curs.includes(b)) - Number(s.curs.includes(a)))
  const pick = async (c: string) => {
    if (!main) {
      update((d) => { d.settings.curs = [...d.settings.curs, c]; d.settings.rateSrc = { ...(d.settings.rateSrc ?? {}), [c]: OFFICIAL[d.settings.mainCur] ? 'official' : 'market' } })
      popSheet()
      refreshRates(true).catch(() => {})
      return
    }
    setBusy(true)
    if (!hasRate(useStore.getState().st.settings, c)) {
      update((d) => { if (!d.settings.curs.includes(c)) d.settings.curs = [...d.settings.curs, c] })
      await refreshRates(true).catch(() => false)
    }
    setBusy(false)
    if (!hasRate(useStore.getState().st.settings, c)) { toast(`Couldn’t get a rate for ${c} — try again when online`); return }
    update((d) => switchMain(d, c))
    popSheet()
    toast(`Main currency: ${curName(c)}`)
    refreshRates(true).catch(() => {})
  }
  return (
    <Sheet title={main ? 'Main currency' : 'Add currency'} full onBack={popSheet}>
      <input className="input" value={q} placeholder="Search: euro, USD, hryvnia…" onChange={(e) => setQ(e.target.value)} />
      {main && <span className="t13 muted">Amounts keep their own currency. Supply prices, project costs and “up to” prices switch over at today’s rate.</span>}
      <List>
        {list.map((c) => <Row key={c} title={`${curSign(c)} · ${curName(c)}`} meta={c} onClick={() => !busy && pick(c)} />)}
      </List>
    </Sheet>
  )
}

// a new main currency: today's rates are turned around to it, the old main becomes one of the others,
// and plain amounts that have no currency of their own (supply prices, project costs, "up to") are converted
const switchMain = (d: State, c: string) => {
  const s = d.settings, old = s.mainCur
  if (c === old) return
  const f = rateOf(s, c) // old main for 1 new
  fillCurs(d, old)
  const rates: Record<string, number> = {}
  for (const [k, v] of Object.entries(s.rates)) if (k !== c) rates[k] = Math.round((v / f) * 1e6) / 1e6
  rates[old] = Math.round((1 / f) * 1e6) / 1e6
  const srcs = { ...(s.rateSrc ?? {}) }
  for (const k of Object.keys(srcs)) if ((srcs[k] === 'official' && !OFFICIAL[c]) || (srcs[k] === 'blue' && !blueFits(c, k))) srcs[k] = 'market'
  if (!srcs[old]) srcs[old] = OFFICIAL[c] ? 'official' : 'market'
  delete srcs[c]
  const conv1 = (n: number) => Math.round((n / f) * 100) / 100
  for (const x of d.supplies) if (x.pricePerUnit) x.pricePerUnit = conv1(x.pricePerUnit)
  for (const x of d.projects) if (x.cost) x.cost = conv1(x.cost)
  for (const x of d.needs) if (x.maxPrice) x.maxPrice = conv1(x.maxPrice)
  d.settings = { ...s, mainCur: c, curs: [old, ...s.curs.filter((x) => x !== c && x !== old)], rates, rateSrc: srcs, ratesAt: undefined }
  logRates(d.settings)
}
