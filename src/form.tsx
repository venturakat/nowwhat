import { useState } from 'react'
import { closeSheet, Field, Sheet } from './ui'
import { numText, parseNum } from './lib'

export type FieldDef =
  | { key: string; label: string; type: 'text' | 'date' | 'datetime' | 'url'; placeholder?: string }
  | { key: string; label: string; type: 'number'; step?: number; placeholder?: string }
  | { key: string; label: string; type: 'select'; options: [string, string][] }
  | { key: string; label: string; type: 'toggle' }

type Vals = Record<string, any>

// Generic bottom-sheet form. Number fields come back as numbers (or undefined when empty).
export const FormSheet = (p: { title: string; fields: FieldDef[]; initial?: Vals; onSave: (v: Vals) => void; onDelete?: () => void; saveLabel?: string; extra?: React.ReactNode }) => {
  // number fields are kept as typed text (so "12,50" works) and parsed on save
  const [v, setV] = useState<Vals>(() => {
    const o: Vals = { ...(p.initial ?? {}) }
    for (const f of p.fields) if (f.type === 'number' && typeof o[f.key] === 'number') o[f.key] = numText(o[f.key])
    return o
  })
  const set = (k: string, val: any) => setV((o) => ({ ...o, [k]: val }))
  const firstText = p.fields[0]?.type === 'text' ? p.fields[0] : undefined
  const can = !firstText || String(v[firstText.key] ?? '').trim().length > 0
  return (
    <Sheet title={p.title}>
      {p.fields.map((f) => (
        <Field key={f.key} label={f.label}>
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
          ) : (
            <input
              className="input"
              type={f.type === 'datetime' ? 'datetime-local' : f.type === 'number' ? 'text' : f.type}
              inputMode={f.type === 'number' ? (f.step === 1 ? 'numeric' : 'decimal') : undefined}
              placeholder={'placeholder' in f ? f.placeholder : undefined}
              value={v[f.key] ?? ''}
              onChange={(e) => set(f.key, f.type === 'number' ? e.target.value.replace(/[^0-9.,\-\s]/g, '') : e.target.value)}
            />
          )}
        </Field>
      ))}
      {p.extra}
      <button className="btn full" disabled={!can} onClick={() => {
        const out: Vals = { ...v }
        for (const f of p.fields) if (f.type === 'number') out[f.key] = parseNum(v[f.key])
        p.onSave(out); closeSheet()
      }}>
        {p.saveLabel ?? 'Save'}
      </button>
      {p.onDelete && (
        <button className="btn full soft" onClick={() => { p.onDelete!(); closeSheet() }}>
          Delete
        </button>
      )}
    </Sheet>
  )
}
