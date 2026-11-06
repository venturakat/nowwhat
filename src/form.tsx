import { useState } from 'react'
import { Check, closeSheet, Field, Sheet } from './ui'
import { addDays, numText, parseNum, today } from './lib'

export type FieldDef =
  | { key: string; label: string; type: 'text' | 'date' | 'time' | 'datetime' | 'url'; placeholder?: string; clearable?: boolean; suggest?: string[] } // suggest: pill buttons under a text field that fill it in
  | { key: string; label: string; type: 'number'; step?: number; placeholder?: string | ((v: Record<string, any>) => string) } // a function: placeholder follows the other fields
  | { key: string; label: string; type: 'select'; options: [string, string][] }
  | { key: string; label: string; type: 'toggle' }
  | { key: string; label: string; type: 'check' } // a tick box with its label next to it

type Vals = Record<string, any>
// off: the field is greyed out and can't be changed while this returns true (e.g. one-time purchase ticked)
type Def = FieldDef & { off?: (v: Vals) => boolean }

// Generic bottom-sheet form. Number fields come back as numbers (or undefined when empty).
export const FormSheet = (p: { title: string; fields: Def[]; initial?: Vals; onSave: (v: Vals) => void; onDelete?: () => void; saveLabel?: string; extra?: React.ReactNode; onBack?: () => void; full?: boolean; twoTap?: boolean }) => {
  const [armed, setArmed] = useState(false) // twoTap: first Delete tap arms (3 s), second deletes
  const full = p.full ?? !!p.onBack
  // number fields are kept as typed text (so "12,50" works) and parsed on save
  const [v, setV] = useState<Vals>(() => {
    const o: Vals = { ...(p.initial ?? {}) }
    for (const f of p.fields) if (f.type === 'number' && typeof o[f.key] === 'number') o[f.key] = numText(o[f.key])
    return o
  })
  const set = (k: string, val: any) => setV((o) => ({ ...o, [k]: val }))
  const firstText = p.fields[0]?.type === 'text' ? p.fields[0] : undefined
  const can = !firstText || String(v[firstText.key] ?? '').trim().length > 0
  const buttons = (
    <>
    <button className="btn full" disabled={!can} onClick={() => {
      const out: Vals = { ...v }
      for (const f of p.fields) if (f.type === 'number') out[f.key] = parseNum(v[f.key])
      p.onSave(out)
      // from a sub-page, saving takes you back to where you came from
      if (p.onBack) p.onBack(); else closeSheet()
    }}>
      {p.saveLabel ?? 'Save'}
    </button>
    {p.onDelete && (
      <button className="btn full soft" style={armed ? { color: 'var(--alert)', borderColor: 'var(--alert)' } : undefined} onClick={() => {
        if (p.twoTap && !armed) { setArmed(true); setTimeout(() => setArmed(false), 3000); return }
        p.onDelete!(); closeSheet()
      }}>
        Delete
      </button>
    )}
    </>
  )
  return (
    <Sheet title={p.title} onBack={p.onBack} full={full}>
      {p.fields.map((f) => f.type === 'check' ? (
        <button key={f.key} type="button" className="row" style={{ gap: 10, alignSelf: 'flex-start', marginTop: -4 }} onClick={() => set(f.key, !v[f.key])}>
          <Check on={!!v[f.key]} /><span className="t15">{f.label}</span>
        </button>
      ) : (
        <fieldset key={f.key} className="fset" disabled={!!f.off?.(v)}>
        <Field label={f.label}>
          {f.type === 'select' ? (
            <div className="seg">
              {f.options.map(([k, l]) => (
                <button key={k} type="button" className={'chip' + (v[f.key] === k ? ' on' : '')} onClick={() => set(f.key, k)}>
                  {l}
                </button>
              ))}
            </div>
          ) : f.type === 'toggle' ? (
            <div className="seg">
              <button type="button" className={'chip' + (v[f.key] ? ' on' : '')} onClick={() => set(f.key, true)}>Yes</button>
              <button type="button" className={'chip' + (!v[f.key] ? ' on' : '')} onClick={() => set(f.key, false)}>No</button>
            </div>
          ) : 'clearable' in f && f.clearable && f.type === 'date' ? (
            // optional date: "Not yet" until it happens, then the date with a way back
            v[f.key] ? (
              <div className="row" style={{ gap: 8 }}>
                <input className="input grow" type="date" value={v[f.key]} onChange={(e) => set(f.key, e.target.value)} />
                <button type="button" className="btn soft sm" onClick={() => set(f.key, '')}>Clear</button>
              </div>
            ) : (
              <div className="seg">
                <button type="button" className="chip on">Not yet</button>
                <button type="button" className="chip" onClick={() => set(f.key, today())}>Today</button>
                <button type="button" className="chip" onClick={() => set(f.key, addDays(today(), -1))}>Other day…</button>
              </div>
            )
          ) : 'suggest' in f && f.suggest ? (
            <>
              <input className="input" type="text" placeholder={f.placeholder} value={v[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} />
              <div className="seg" style={{ marginTop: 8 }}>
                {f.suggest.map((o) => (
                  <button key={o} type="button" className={'chip' + (v[f.key] === o ? ' on' : '')} onClick={() => set(f.key, v[f.key] === o ? '' : o)}>{o}</button>
                ))}
              </div>
            </>
          ) : (
            <input
              className="input"
              type={f.type === 'datetime' ? 'datetime-local' : f.type === 'number' ? 'text' : f.type}
              inputMode={f.type === 'number' ? (f.step === 1 ? 'numeric' : 'decimal') : undefined}
              placeholder={'placeholder' in f ? (typeof f.placeholder === 'function' ? f.placeholder(v) : f.placeholder) : undefined}
              value={v[f.key] ?? ''}
              onChange={(e) => set(f.key, f.type === 'number' ? e.target.value.replace(/[^0-9.,\-\s]/g, '') : e.target.value)}
            />
          )}
        </Field>
        </fieldset>
      ))}
      {p.extra}
      {full ? <div className="sheet-foot">{buttons}</div> : buttons}
    </Sheet>
  )
}
