import { useState } from 'react'
import { closeSheet, Field, Sheet } from './ui'

export type FieldDef =
  | { key: string; label: string; type: 'text' | 'date' | 'datetime' | 'url'; placeholder?: string }
  | { key: string; label: string; type: 'number'; step?: number; placeholder?: string }
  | { key: string; label: string; type: 'select'; options: [string, string][] }
  | { key: string; label: string; type: 'toggle' }

type Vals = Record<string, any>

// Generic bottom-sheet form. Number fields come back as numbers (or undefined when empty).
export const FormSheet = (p: { title: string; fields: FieldDef[]; initial?: Vals; onSave: (v: Vals) => void; onDelete?: () => void; saveLabel?: string; extra?: React.ReactNode }) => {
  const [v, setV] = useState<Vals>({ ...(p.initial ?? {}) })
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
              type={f.type === 'datetime' ? 'datetime-local' : f.type === 'number' ? 'number' : f.type}
              inputMode={f.type === 'number' ? 'decimal' : undefined}
              step={f.type === 'number' ? f.step ?? 'any' : undefined}
              placeholder={'placeholder' in f ? f.placeholder : undefined}
              value={v[f.key] ?? ''}
              onChange={(e) => set(f.key, f.type === 'number' ? (e.target.value === '' ? undefined : Number(e.target.value)) : e.target.value)}
            />
          )}
        </Field>
      ))}
      {p.extra}
      <button className="btn full" disabled={!can} onClick={() => { p.onSave(v); closeSheet() }}>
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
