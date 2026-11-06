import { exportJson, importJson, update, useSt, useStore } from './store'
import { useState } from 'react'
import { C, Field, Icon, List, popSheet, pushSheet, Row, Sheet, toast } from './ui'
import { FormSheet } from './form'
import { seed } from './seed'
import { blueFits, OFFICIAL, refreshRates } from './rates'
import { uid, fmtCur, allCurrencies, autoProtein, curName, curOptions, curSign, dailyNeeds, fillCurs, fmtDay, fmtNum, hasRate, logRates, numText, parseNum, rateOf, travelUsual, usedCurs } from './lib'
import type { RateSrc, State, TaxEvery, TaxKind, TaxLine, TaxRule } from './types'
import { LAG_NAME, defaultPayDay, applyPreset, EVERY_NAME, KIND_NAME, PLACEHOLDERS, PRESETS, RULE_NAME, type PresetKey } from './taxes'
import { LANGS, tr } from './i18n'

export const SettingsSheet = () => {
  return (
    <Sheet title="Settings" full>
      <LanguageCard />
      <CurrenciesCard />
      <TaxesCard />
      <DaysCard />
      <AboutCard />
      <TravelCard />
      <button className="card" style={{ gap: 4 }} onClick={() => pushSheet(<BackupSheet />)}>
        <span className="t17">{tr('Backup')}</span>
        <span className="t14 muted">{tr('Save a backup file, restore one, or start fresh')}</span>
      </button>
    </Sheet>
  )
}

// Settings › Language: follows the phone unless one is picked
const LanguageCard = () => {
  const pick = useSt().settings.lang ?? 'auto'
  return (
    <div className="card" style={{ gap: 10 }}>
      <span className="t17">{tr('Language')}</span>
      <div className="seg">
        {LANGS.map(([k, l]) => <button key={k} type="button" className={'chip' + (pick === k ? ' on' : '')} onClick={() => update((d) => { d.settings.lang = k === 'auto' ? undefined : k })}>{k === 'auto' ? tr(l) : l}</button>)}
      </div>
    </div>
  )
}

// backup lives on its own page, so "Erase everything" can't be tapped by accident from the main menu
const BackupSheet = () => (
  <Sheet title="Backup" full onBack={popSheet}>
    <span className="t15 muted">{tr('Everything lives only on this phone. Save a backup file now and then (e.g. to iCloud Drive).')}</span>
    <button className="btn" onClick={exportJson}>{tr('Save backup file')}</button>
    <label className="btn soft" style={{ cursor: 'pointer' }}>
      {tr('Restore from backup')}
      <input type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { await importJson(f); toast(tr('Restored')) } catch { toast(tr('That file is not a backup')) } }} />
    </label>
    <div style={{ marginTop: 'auto', paddingTop: 32, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span className="t13 muted">{tr('Removes all your data from this phone. Save a backup first if you need it.')}</span>
      <button className="btn soft" style={{ color: 'var(--alert)' }} onClick={() => { if (confirm(tr('Erase everything on this phone and start fresh? This can’t be undone.'))) { const lang = useStore.getState().st.settings.lang; const s = seed(); s.settings.lang = lang; useStore.getState().replace(s); toast(tr('Fresh start')) } }}>{tr('Erase everything')}</button>
    </div>
  </Sheet>
)

const TaxesCard = () => {
  const st = useSt()
  const ls = st.settings.taxLines ?? []
  return (
    <button className="card" style={{ gap: 4 }} onClick={() => pushSheet(<TaxesSheet />)}>
      <span className="t17">{tr('Taxes')}</span>
      <span className="t14 muted">{ls.length ? ls.map((l) => l.name).join(', ') : tr('Tax lines, pay days, transfer details')}</span>
    </button>
  )
}

const TaxesSheet = () => {
  const st = useSt()
  const s = st.settings
  const lines = s.taxLines ?? []
  const tc = s.taxCur ?? 'PLN'
  const rule = s.taxRule ?? (tc === 'PLN' ? 'nbp' : 'invoice')
  const [armed, setArmed] = useState<PresetKey | null>(null) // a preset replaces the lines: first tap arms it (3 s), second applies
  const RN = RULE_NAME(), EN = EVERY_NAME()
  const lineMeta = (l: TaxLine) => [l.kind === 'fixed' ? fmtCur(l.amount ?? 0, tc, true) : l.kind === 'pct' ? `${l.pct ?? 0}%` : `${l.pct ?? 0}% − ${l.lessPct ?? 0}% ${tr('of')} ${lines.find((x) => x.id === l.less)?.name ?? '—'}`, EN[l.every], (l.lag ?? 1) !== 1 && LAG_NAME()[l.lag ?? 1].toLowerCase(), tr('pay day {d}', { d: l.payDay }), l.group && tr('with {g}', { g: l.group })].filter(Boolean).join(' · ')
  return (
    <Sheet title={tr('Taxes')} full onBack={popSheet}>
      <Field label={tr('Start from')}>
        <div className="seg">
          {PRESETS.map((p) => (
            <button key={p.key} type="button" className="chip" style={armed === p.key ? { color: 'var(--alert)', borderColor: 'var(--alert)' } : undefined} onClick={() => {
              if (armed !== p.key) { setArmed(p.key); setTimeout(() => setArmed((a) => (a === p.key ? null : a)), 3000); return }
              update((d) => applyPreset(d, p.key)); setArmed(null); toast(tr('Started from {x}', { x: tr(p.name) }))
            }}>{armed === p.key ? tr('Replace lines') : tr(p.name)}</button>
          ))}
        </div>
      </Field>
      <Field label={tr('Taxes are in')}>
        <div className="seg">
          {curOptions(s, tc).map(([k, l]) => <button key={k} type="button" className={'chip' + (tc === k ? ' on' : '')} onClick={() => update((d) => { d.settings.taxCur = k; if (k !== 'PLN' && d.settings.taxRule === 'nbp') d.settings.taxRule = 'invoice' })}>{l}</button>)}
        </div>
      </Field>
      <Field label={tr('Invoices count')}>
        <div className="seg">
          {(Object.keys(RN) as TaxRule[]).filter((k) => k !== 'nbp' || tc === 'PLN').map((k) => <button key={k} type="button" className={'chip' + (rule === k ? ' on' : '')} onClick={() => update((d) => { d.settings.taxRule = k })}>{RN[k]}</button>)}
        </div>
      </Field>
      <span className="t15 w5" style={{ padding: '8px 4px 0' }}>{tr('Tax lines')}</span>
      {lines.length > 0 && (
        <List>
          {lines.map((l) => <Row key={l.id} dot={C.money} title={l.name} meta={lineMeta(l)} onClick={() => pushSheet(<TaxLineSheet id={l.id} />)} />)}
        </List>
      )}
      <button className="btn soft" onClick={() => pushSheet(<TaxLineSheet />)}>{tr('Add tax line')}</button>
      <span className="t15 w5" style={{ padding: '8px 4px 0' }}>{tr('Transfer details')}</span>
      {(s.transfer ?? []).length > 0 && (
        <List>
          {(s.transfer ?? []).map((r) => <Row key={r.id} dot={C.ink} title={r.label} meta={r.text || tr('empty')} onClick={() => pushSheet(<TransferRowSheet id={r.id} />)} />)}
        </List>
      )}
      <button className="btn soft" onClick={() => pushSheet(<TransferRowSheet />)}>{tr('Add row')}</button>
      <span className="t13 muted" style={{ padding: '0 4px' }}>{tr('In the text, {p} become the month you pay for.', { p: PLACEHOLDERS })}</span>
    </Sheet>
  )
}

const TaxLineSheet = ({ id }: { id?: string }) => {
  const st = useSt()
  const lines = st.settings.taxLines ?? []
  const l = lines.find((x) => x.id === id)
  const others = lines.filter((x) => x.id !== id)
  const groups = [...new Set(lines.map((x) => x.group?.trim()).filter(Boolean))] as string[]
  const KN = KIND_NAME(), EN = EVERY_NAME()
  return (
    <FormSheet title={l ? l.name : tr('New tax line')} onBack={popSheet} twoTap
      initial={l ? { ...l, lag: String(l.lag ?? 1) } : { lag: '1', kind: 'fixed', every: 'month', payDay: lines[0]?.payDay ?? defaultPayDay(lines[0]?.dueDay ?? 20), dueDay: lines[0]?.dueDay ?? 20, lessPct: 50, less: others[0]?.id }}
      fields={[
        { key: 'name', label: tr('Name'), type: 'text', placeholder: 'ZUS, ЄСВ, Monotributo…' },
        { key: 'kind', label: tr('How it’s worked out'), type: 'select', options: (Object.keys(KN) as TaxKind[]).filter((k) => k !== 'pctLess' || others.length).map((k) => [k, KN[k]]) },
        { key: 'amount', label: tr('Amount per period'), type: 'number', hide: (v) => v.kind !== 'fixed' },
        { key: 'pct', label: tr('Rate, %'), type: 'number', hide: (v) => v.kind === 'fixed' },
        { key: 'less', label: tr('Minus part of'), type: 'select', options: others.map((x) => [x.id, x.name]), hide: (v) => v.kind !== 'pctLess' },
        { key: 'lessPct', label: tr('How much of it, %'), type: 'number', hide: (v) => v.kind !== 'pctLess' },
        { key: 'every', label: tr('Period'), type: 'select', options: (Object.keys(EN) as TaxEvery[]).map((k) => [k, EN[k]]) },
        { key: 'lag', label: tr('Paid in'), type: 'select', options: LAG_NAME().map((n, i) => [String(i), n]) },
        { key: 'payDay', label: tr('I pay on day (puts it in the budget)'), type: 'number', step: 1, placeholder: (v) => String(defaultPayDay(parseNum(String(v.dueDay ?? '')) ?? 20)) },
        { key: 'dueDay', label: tr('Official deadline, day'), type: 'number', step: 1 },
        { key: 'group', label: tr('Paid together as (optional)'), type: 'text', suggest: groups }
      ]}
      onSave={(v) => update((d) => {
        const day = (n: number | undefined, dflt: number) => Math.min(31, Math.max(1, Math.round(n ?? dflt)))
        const x: TaxLine = {
          id: l?.id ?? uid(), name: String(v.name).trim(), kind: v.kind, every: v.every, lag: Number(v.lag ?? 1),
          dueDay: day(v.dueDay, 20), payDay: day(v.payDay, defaultPayDay(day(v.dueDay, 20))), group: String(v.group ?? '').trim() || undefined,
          ...(v.kind === 'fixed' ? { amount: v.amount ?? 0 } : { pct: v.pct ?? 0 }),
          ...(v.kind === 'pctLess' ? { less: v.less ?? others[0]?.id, lessPct: v.lessPct ?? 0 } : {})
        }
        const ls = d.settings.taxLines ?? []
        d.settings.taxLines = l ? ls.map((y) => (y.id === l.id ? x : y)) : [...ls, x]
      })}
      onDelete={l ? () => { update((d) => { d.settings.taxLines = (d.settings.taxLines ?? []).filter((y) => y.id !== l.id) }) } : undefined}
    />
  )
}

const TransferRowSheet = ({ id }: { id?: string }) => {
  const st = useSt()
  const r = (st.settings.transfer ?? []).find((x) => x.id === id)
  return (
    <FormSheet title={r ? r.label : tr('New row')} onBack={popSheet} twoTap initial={r ? { ...r } : {}}
      fields={[
        { key: 'label', label: tr('Label'), type: 'text', placeholder: tr('Account, NIP, Title…') },
        { key: 'text', label: tr('Text to copy'), type: 'text' }
      ]}
      extra={<span className="t13 muted">{tr('{p} become the month you pay for.', { p: PLACEHOLDERS })}</span>}
      onSave={(v) => update((d) => {
        const x = { id: r?.id ?? uid(), label: String(v.label).trim(), text: String(v.text ?? '').trim() }
        const rs = d.settings.transfer ?? []
        d.settings.transfer = r ? rs.map((y) => (y.id === r.id ? x : y)) : [...rs, x]
      })}
      onDelete={r ? () => { update((d) => { d.settings.transfer = (d.settings.transfer ?? []).filter((y) => y.id !== r.id) }) } : undefined}
    />
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
          { key: 'activity', label: 'Activity', type: 'select', options: [['low', 'Mostly sitting'], ['light', 'Light activity'], ['active', 'Active'], ['very', 'Very active']] },
          { key: 'proteinGoal', label: 'Protein goal (g a day)', type: 'number', step: 1, placeholder: (v) => { const a = autoProtein(parseNum(v.weightKg), v.activity, parseNum(v.age)); return a ? tr('{n} — from your weight and activity', { n: a }) : tr('Add your weight to work it out') } }
        ]}
        extra={<span className="t13 muted">{tr('Recipes show how much of your daily protein and fiber one portion covers. Protein goal left empty = worked out from your weight: 0.83 g per kg when mostly sitting or no activity chosen (the official minimum), 1.0 light, 1.3 active, 1.6 very active (at least 1.0 from 65). Fiber: 25 g a day (EFSA). A general guide, not medical advice. Stays on this phone.')}</span>}
        onSave={(v) => update((d) => { d.settings = { ...d.settings, age: v.age || undefined, weightKg: v.weightKg || undefined, activity: v.activity, proteinGoal: v.proteinGoal || undefined } })}
      />
    )}>
      <span className="t17">{tr('About you')}</span>
      <span className="t14 muted">{s.weightKg || s.proteinGoal ? [s.age ? tr('{n} y', { n: s.age }) : '', s.weightKg ? tr('{n} kg', { n: s.weightKg }) : '', s.activity ? tr({ low: 'mostly sitting', light: 'light activity', active: 'active', very: 'very active' }[s.activity]) : '', dailyNeeds(s) ? tr('protein {n} g a day', { n: dailyNeeds(s)!.protein }) : ''].filter(Boolean).join(' · ') : tr('Age, weight, activity, protein goal — for recipes')}</span>
    </button>
  )
}

const TravelCard = () => {
  const st = useSt()
  const all = travelUsual(st.settings)
  return (
    <button className="card" style={{ gap: 4 }} onClick={() => pushSheet(<TravelSheet />)}>
      <span className="t17">{tr('Travel necessities')}</span>
      <span className="t14 muted">{all.length ? all.slice(0, 4).join(', ') + (all.length > 4 ? ' ' + tr('and {n} more', { n: all.length - 4 }) : '') : tr('What you always take — offered on packing lists')}</span>
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
      <span className="t15 muted">{tr('Offered in the Other field of every packing list — pick them instead of remembering. Each one hides once it’s on that list.')}</span>
      <List empty="Nothing yet — add what you always take.">
        {all.map((x) => (
          <div key={x} className="lrow" style={{ paddingTop: 9, paddingBottom: 9 }}>
            <span className="grow"><div className="title">{x}</div></span>
            <button aria-label={tr('Remove {x}', { x })} className="muted" style={{ display: 'flex', padding: 4, margin: -4 }} onClick={() => set(all.filter((y) => y !== x))}><Icon.x /></button>
          </div>
        ))}
      </List>
      <div className="row" style={{ gap: 8 }}>
        <input className="input" style={{ flex: 1, minWidth: 0 }} value={text} placeholder={tr('Sunglasses, adapter…')} enterKeyHint="done"
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
        <button className="btn" disabled={!text.trim()} onClick={add}>{tr('Add')}</button>
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
      <span className="t17">{tr('Budget & shopping days')}</span>
      <span className="t14 muted">{tr('When the second fortnight starts, how early to restock supplies')}</span>
    </button>
  )
}

// ---------- Currencies ----------
// main currency (totals, budget), the others to pick from, and where each rate comes from
const CurrenciesCard = () => {
  const s = useSt().settings
  return (
    <button className="card" style={{ gap: 4 }} onClick={() => pushSheet(<CurrenciesSheet />)}>
      <span className="t17">{tr('Currencies')}</span>
      <span className="t14 muted">{tr('Main: {x}', { x: curName(s.mainCur) })}{s.curs.length ? ` · ${tr('also {x}', { x: s.curs.map(curSign).join(', ') })}` : ''}</span>
    </button>
  )
}

const fmtRate = (n?: number) => (n ? fmtNum(n, n < 0.1 ? 6 : 4, 2) : '—')

const CurrenciesSheet = () => {
  const st = useSt()
  const s = st.settings
  const [busy, setBusy] = useState(false)
  const at = s.ratesAt ? new Date(s.ratesAt) : null
  const when = at ? `${fmtDay(at.toISOString().slice(0, 10))}, ${at.toTimeString().slice(0, 5)}` : tr('not yet')
  const src = (c: string) => s.rateSrc?.[c] ?? 'market'
  return (
    <Sheet title="Currencies" full onBack={popSheet}>
      <Field label="Main currency">
        <button className="card" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: '14px 16px' }} onClick={() => pushSheet(<CurPicker main />)}>
          <span className="t17 grow" style={{ textAlign: 'left' }}>{curSign(s.mainCur)} · {curName(s.mainCur)}</span>
          <span className="t14 muted">{tr('Change')}</span>
        </button>
        <span className="t13 muted">{tr('Totals, the budget and per-day money are shown in it. Everything keeps its own currency.')}</span>
      </Field>
      <List title="Other currencies">
        {s.curs.map((c) => (
          <Row key={c} title={`${curSign(c)} · ${curName(c)}`}
            meta={src(c) === 'manual' ? tr('typed in') : src(c) === 'blue' ? 'dólar blue' : `${src(c) === 'official' ? OFFICIAL[s.mainCur] ?? tr('official') : tr('market')}${s.rateNote?.[c] && src(c) !== 'manual' && s.rateNote[c] !== 'market' ? ' · ' + tr(s.rateNote[c]) : ''}`}
            trail={<span className="t15">{fmtRate(s.rates[c])} {curSign(s.mainCur)}</span>}
            onClick={() => pushSheet(<CurSheet c={c} />)} />
        ))}
        <Row title={<span className="muted">+ {tr('Add currency')}</span>} onClick={() => pushSheet(<CurPicker />)} />
      </List>
      <span className="t13 muted" style={{ padding: '0 4px' }}>{tr('Rates: how much {x} one unit is worth. Updated {when}. Past amounts keep the rate of their day.', { x: curSign(s.mainCur), when })}</span>
      <button className="btn soft" disabled={busy} onClick={async () => {
        setBusy(true)
        const ok = await refreshRates(true).catch(() => false)
        setBusy(false)
        toast(tr(ok ? 'Rates updated' : 'Could not reach the rate sources — kept the last ones'))
      }}>{tr(busy ? 'Updating…' : 'Update now')}</button>
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
  const opts: [RateSrc, string][] = [['market', tr('Market')], ...(off ? [['official', `${tr('Official')} · ${off}`] as [RateSrc, string]] : []), ...(blueFits(s.mainCur, c) ? [['blue', 'Dólar blue'] as [RateSrc, string]] : []), ['manual', tr('Type it in')]]
  const used = usedCurs({ ...st, settings: { ...s, curs: [] } }).includes(c)
  return (
    <Sheet title={`${curSign(c)} · ${curName(c)}`} full onBack={popSheet}>
      <Field label="Rate from">
        <div className="seg">{opts.map(([k, l]) => <button key={k} type="button" className={'chip' + (srcNow === k ? ' on' : '')} onClick={() => setSrc(k)}>{l}</button>)}</div>
      </Field>
      {srcNow === 'manual'
        ? <Field label={tr('1 {a} in {b}', { a: curSign(c), b: curSign(s.mainCur) })}><input className="input" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} /></Field>
        : <span className="t14 muted">{tr('Now')} 1 {curSign(c)} = {fmtRate(s.rates[c])} {curSign(s.mainCur)}. {srcNow === 'official' ? tr('{x}’s rate, the one used in accounting.', { x: off ?? '' }) : srcNow === 'blue' ? tr('The street rate (sell), from DolarApi.') : tr('Mid-market, updated a few times a day.')}</span>}
      <button className="btn full" disabled={srcNow === 'manual' && !parseNum(rate)} onClick={() => {
        update((d) => {
          d.settings.rateSrc = { ...(d.settings.rateSrc ?? {}), [c]: srcNow }
          if (srcNow === 'manual') { d.settings.rates = { ...d.settings.rates, [c]: parseNum(rate)! }; d.settings.rateNote = { ...(d.settings.rateNote ?? {}), [c]: 'typed in' }; logRates(d.settings) }
        })
        popSheet()
        if (srcNow !== 'manual') refreshRates(true).catch(() => {})
      }}>{tr('Save')}</button>
      <button className={'btn full ' + (armed ? 'ghost' : 'soft')} style={armed ? { color: 'var(--alert)', borderColor: 'var(--alert)' } : undefined} onClick={() => {
        if (!armed) { setArmed(true); toast(tr(used ? 'Still used by some amounts — its rate stays updated. Tap again to remove it from the pickers' : 'Tap again to remove')); return }
        update((d) => { d.settings.curs = d.settings.curs.filter((x) => x !== c) })
        popSheet()
      }}>{tr(armed ? 'Tap again to remove' : 'Remove from the pickers')}</button>
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
    if (!hasRate(useStore.getState().st.settings, c)) { toast(tr('Couldn’t get a rate for {x} — try again when online', { x: c })); return }
    update((d) => switchMain(d, c))
    popSheet()
    toast(tr('Main currency: {x}', { x: curName(c) }))
    refreshRates(true).catch(() => {})
  }
  return (
    <Sheet title={main ? 'Main currency' : 'Add currency'} full onBack={popSheet}>
      <input className="input" value={q} placeholder={tr('Search: euro, USD, hryvnia…')} onChange={(e) => setQ(e.target.value)} />
      {main && <span className="t13 muted">{tr('Amounts keep their own currency. Supply prices, project costs and “up to” prices switch over at today’s rate.')}</span>}
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
