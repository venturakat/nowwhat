import { exportJson, importJson, update, useSt, useStore } from './store'
import { openSheet, Sheet, toast } from './ui'
import { FormSheet } from './form'
import { seed } from './seed'

export const SettingsSheet = () => {
  const st = useSt()
  const s = st.settings
  return (
    <Sheet title="Settings">
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
      <span className="t13 muted">EUR→PLN {s.eurPln} · PIT {Math.round(s.pitRate * 100)}% · DRA {s.dra} · RCA {s.rca}</span>
    </Sheet>
  )
}

const FormInline = () => {
  const st = useSt()
  return (
    <button className="card" style={{ gap: 4 }} onClick={() => openSheet(
      <FormSheet title="Numbers" initial={{ ...st.settings, pitPct: Math.round(st.settings.pitRate * 1000) / 10 }}
        fields={[
          { key: 'eurPln', label: '1 € in zł (for invoices)', type: 'number' },
          { key: 'pitPct', label: 'PIT-28 ryczałt %', type: 'number' },
          { key: 'dra', label: 'ZUS DRA (health) per month', type: 'number' },
          { key: 'rca', label: 'ZUS RCA (social) per month', type: 'number' },
          { key: 'splitDay', label: 'Second half of the month starts on day', type: 'number', step: 1 },
          { key: 'taxDueDay', label: 'Taxes due on day', type: 'number', step: 1 },
          { key: 'leadDays', label: 'Warn about supplies this many days ahead', type: 'number', step: 1 },
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
      <span className="t14 muted">Exchange rate, ZUS amounts, PIT %, account numbers for transfers</span>
    </button>
  )
}
