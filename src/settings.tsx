import { exportJson, importJson, update, useSt, useStore } from './store'
import { openSheet, Sheet, toast } from './ui'
import { FormSheet } from './form'
import { seed } from './seed'
import { refreshRates } from './rates'
import { fmtDay } from './lib'

export const SettingsSheet = () => {
  const st = useSt()
  const s = st.settings
  return (
    <Sheet title="Settings">
      <RatesCard />
      <FormInline />
      <div className="card" style={{ gap: 10 }}>
        <span className="t17">Backup</span>
        <span className="t14 muted">Everything lives only on this phone. Save a backup file now and then (e.g. to iCloud Drive).</span>
        <button className="btn" onClick={exportJson}>Save backup file</button>
        <label className="btn soft" style={{ cursor: 'pointer' }}>
          Restore from backup
          <input type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { await importJson(f); toast('Restored') } catch { toast('That file is not a backup') } }} />
        </label>
        <button className="btn soft" onClick={() => { if (confirm('Erase everything on this phone and start fresh? Save a backup first if you need it.')) { useStore.getState().replace(seed()); toast('Fresh start') } }}>Erase everything</button>
      </div>
      <span className="t13 muted">PIT {Math.round(s.pitRate * 100)}% · DRA {s.dra} · RCA {s.rca}</span>
    </Sheet>
  )
}

const FormInline = () => {
  const st = useSt()
  return (
    <button className="card" style={{ gap: 4 }} onClick={() => openSheet(
      <FormSheet title="Numbers" initial={{ ...st.settings, pitPct: Math.round(st.settings.pitRate * 1000) / 10 }}
        fields={[
          { key: 'eurPln', label: '1 € in zł', type: 'number' },
          { key: 'uahPln', label: '1 ₴ in zł', type: 'number' },
          { key: 'ratesAuto', label: 'Update exchange rates automatically', type: 'toggle' },
          { key: 'pitPct', label: 'PIT-28 ryczałt %', type: 'number' },
          { key: 'dra', label: 'ZUS DRA (health) per month', type: 'number' },
          { key: 'rca', label: 'ZUS RCA (social) per month', type: 'number' },
          { key: 'splitDay', label: 'Second fortnight starts on day', type: 'number', step: 1 },
          { key: 'taxPayDay', label: 'I pay ZUS + PIT on day (puts it in the budget)', type: 'number', step: 1 },
          { key: 'taxDueDay', label: 'Official deadline, day', type: 'number', step: 1 },
          { key: 'leadDays', label: 'Shop meds, pets & care this many days before they run out', type: 'number', step: 1 },
          { key: 'leadDaysShort', label: 'Shop groceries & home this many days before', type: 'number', step: 1 },
          { key: 'zusAccount', label: 'ZUS account (rachunek składkowy)', type: 'text' },
          { key: 'taxAccount', label: 'Tax account (mikrorachunek)', type: 'text' }
        ]}
        onSave={(v) => update((d) => {
          const { pitPct, ...rest } = v
          d.settings = { ...d.settings, ...rest, pitRate: (pitPct ?? 14) / 100 }
        })}
      />
    )}>
      <span className="t17">Rates, taxes & accounts</span>
      <span className="t14 muted">Exchange rates by hand, ZUS amounts, PIT %, account numbers for transfers</span>
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
      <button className="btn soft sm" style={{ alignSelf: 'flex-start', marginTop: 4 }} onClick={async () => { toast('Updating…'); const ok = await refreshRates(true).catch(() => false); toast(ok ? 'Rates updated' : 'Could not reach the rate sources — kept the last ones') }}>Update now</button>
    </div>
  )
}
