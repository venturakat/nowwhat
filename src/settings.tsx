import { exportJson, importJson, update, useSt, useStore } from './store'
import { popSheet, pushSheet, Sheet, toast } from './ui'
import { FormSheet } from './form'
import { seed } from './seed'
import { refreshRates } from './rates'
import { autoProtein, dailyNeeds, fmtDay, parseNum } from './lib'

export const SettingsSheet = () => {
  const st = useSt()
  const s = st.settings
  return (
    <Sheet title="Settings" full>
      <RatesCard />
      <TaxesCard />
      <DaysCard />
      <AboutCard />
      <button className="card" style={{ gap: 4 }} onClick={() => pushSheet(<BackupSheet />)}>
        <span className="t17">Backup</span>
        <span className="t14 muted">Save a backup file, restore one, or start fresh</span>
      </button>
      <span className="t13 muted">PIT {Math.round(s.pitRate * 100)}% · DRA {s.dra} · RCA {s.rca}</span>
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
      <FormSheet title="Taxes & accounts" onBack={popSheet} initial={{ ...st.settings, pitPct: Math.round(st.settings.pitRate * 1000) / 10 }}
        fields={[
          { key: 'pitPct', label: 'PIT-28 ryczałt %', type: 'number' },
          { key: 'dra', label: 'ZUS DRA (health) per month', type: 'number' },
          { key: 'rca', label: 'ZUS RCA (social) per month', type: 'number' },
          { key: 'taxPayDay', label: 'I pay ZUS + PIT on day (puts it in the budget)', type: 'number', step: 1 },
          { key: 'taxDueDay', label: 'Official deadline, day', type: 'number', step: 1 },
          { key: 'zusAccount', label: 'ZUS account (rachunek składkowy)', type: 'text' },
          { key: 'taxAccount', label: 'Tax account (mikrorachunek)', type: 'text' }
        ]}
        onSave={(v) => update((d) => {
          const { pitPct, ...rest } = v
          d.settings = { ...d.settings, ...rest, pitRate: (pitPct ?? 14) / 100 }
        })}
      />
    )}>
      <span className="t17">Taxes & accounts</span>
      <span className="t14 muted">ZUS amounts, PIT %, pay days, account numbers for transfers</span>
    </button>
  )
}

const AboutCard = () => {
  const st = useSt()
  const s = st.settings
  return (
    <button className="card" style={{ gap: 4 }} onClick={() => pushSheet(
      <FormSheet title="About you" onBack={popSheet} initial={{ age: s.age, weightKg: s.weightKg, activity: s.activity, proteinGoal: s.proteinGoal, usdaKey: s.usdaKey }}
        fields={[
          { key: 'age', label: 'Age', type: 'number', step: 1 },
          { key: 'weightKg', label: 'Weight (kg)', type: 'number' },
          { key: 'activity', label: 'Activity', type: 'select', options: [['low', 'Mostly sitting'], ['light', 'Light'], ['active', 'Active'], ['very', 'Very active']] },
          { key: 'proteinGoal', label: 'Protein goal (g a day)', type: 'number', step: 1, placeholder: (v) => { const a = autoProtein(parseNum(v.weightKg), v.activity, parseNum(v.age)); return a ? `${a} — from your weight and activity` : 'Add your weight to work it out' } },
          { key: 'usdaKey', label: 'USDA FoodData key (optional)', type: 'text', placeholder: 'Uses a shared demo key if empty' }
        ]}
        extra={<span className="t13 muted">Recipes show how much of your daily protein and fiber one portion covers. Protein goal left empty = worked out from your weight: 0.83 g per kg when mostly sitting or no activity chosen (the official minimum), 1.0 light, 1.3 active, 1.6 very active (at least 1.0 from 65). Fiber: 25 g a day (EFSA). A general guide, not medical advice. Stays on this phone.</span>}
        onSave={(v) => update((d) => { d.settings = { ...d.settings, age: v.age || undefined, weightKg: v.weightKg || undefined, activity: v.activity, proteinGoal: v.proteinGoal || undefined, usdaKey: v.usdaKey?.trim() || undefined } })}
      />
    )}>
      <span className="t17">About you</span>
      <span className="t14 muted">{s.weightKg || s.proteinGoal ? [s.age ? `${s.age} y` : '', s.weightKg ? `${s.weightKg} kg` : '', s.activity ? { low: 'mostly sitting', light: 'light activity', active: 'active', very: 'very active' }[s.activity] : '', dailyNeeds(s) ? `protein ${dailyNeeds(s)!.protein} g a day` : ''].filter(Boolean).join(' · ') : 'Age, weight, activity, protein goal — for recipes'}</span>
    </button>
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

const RatesCard = () => {
  const s = useSt().settings
  const at = s.ratesAt ? new Date(s.ratesAt) : null
  const when = at ? `${fmtDay(at.toISOString().slice(0, 10))}, ${at.toTimeString().slice(0, 5)}` : 'not yet'
  return (
    <div className="card" style={{ gap: 6 }}>
      <span className="t17">Exchange rates</span>
      <span className="t15">1 € = {s.eurPln.toFixed(4)} zł · 1 ₴ = {(s.uahPln ?? 0).toFixed(4)} zł <span className="muted">(100 ₴ = {((s.uahPln ?? 0) * 100).toFixed(2)} zł)</span></span>
      <span className="t13 muted">{s.ratesAuto === false ? 'Set by hand' : `Updated ${when}${s.ratesNote ? ' · ' + s.ratesNote : ''}`}</span>
      <div className="row" style={{ gap: 8, marginTop: 4 }}>
        <button className="btn soft sm" onClick={async () => {
          // back to automatic: NBP for €, monobank for ₴
          update((d) => { d.settings.ratesAuto = true })
          toast('Updating…')
          const ok = await refreshRates(true).catch(() => false)
          toast(ok ? 'Rates updated' : 'Could not reach the rate sources — kept the last ones')
        }}>Update now</button>
        <button className="btn soft sm" onClick={() => pushSheet(
          <FormSheet title="Exchange rates" onBack={popSheet} initial={{ eurPln: s.eurPln, uahPln: s.uahPln }}
            fields={[
              { key: 'eurPln', label: '1 € in zł', type: 'number' },
              { key: 'uahPln', label: '1 ₴ in zł', type: 'number' }
            ]}
            extra={<span className="t13 muted">Your rates stay until you tap Update now.</span>}
            onSave={(v) => update((d) => {
              if (v.eurPln) d.settings.eurPln = v.eurPln
              if (v.uahPln) d.settings.uahPln = v.uahPln
              d.settings.ratesAuto = false
            })}
          />
        )}>Add manually</button>
      </div>
    </div>
  )
}
