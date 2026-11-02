import { useState } from 'react'
import { ensurePeriod, update, useSt } from '../store'
import type { Currency, SelfCare } from '../types'
import { addDays, careInPeriod, careNext, carePerMonth, diffDays, fmt, fmtBoth, fmtDay, numText, parseNum, periodOf, today, uid } from '../lib'
import { C, closeSheet, Field, List, openSheet, Row, Sheet, toast } from '../ui'
import { FormSheet } from '../form'
import { CURRENCIES } from './Subscriptions'

// quick starts for an empty tab (name, every N days)
const IDEAS: [string, number][] = [['Manicure', 21], ['Pedicure', 42], ['Massage', 30], ['Haircut', 60], ['Gym', 30], ['Yoga class', 7]]

export const everyText = (n: number) => (n === 1 ? 'Every day' : n === 7 ? 'Every week' : n % 7 === 0 ? `Every ${n / 7} weeks` : `Every ${n} days`)
const whenText = (d: string, t: string) => {
  const n = diffDays(t, d)
  return n < 0 ? `${-n} ${n === -1 ? 'day' : 'days'} overdue` : n === 0 ? 'today' : n === 1 ? 'tomorrow' : fmtDay(d)
}

export const Selfcare = () => {
  const st = useSt()
  const t = today()
  const all = (st.selfcare ?? []).slice().sort((a, b) => Number(!!a.paused) - Number(!!b.paused) || a.next.localeCompare(b.next))
  const p = periodOf(t, st.settings)
  const half = careInPeriod(st, p.start, p.end)
  const halfSum = half.reduce((a, c) => a + c.pln, 0)
  const active = all.filter((x) => !x.paused)
  return (
    <>
      {active.length > 0 && (
        <div className="card closet" style={{ gap: 6 }}>
          <span className="t15 w5">Selfcare · about a month</span>
          <span className="big" style={{ fontSize: 52 }}>{fmt(carePerMonth(st))}</span>
          <span className="t14">{half.length ? `${fmt(halfSum)} planned this fortnight · already in your budget` : 'Nothing planned this fortnight'}</span>
        </div>
      )}
      <List title="Coming up" right="next time" empty="Add what you do for yourself regularly.">
        {all.map((x) => {
          const late = diffDays(t, x.next) < 0
          return (
            <Row key={x.id} dot={x.paused ? C.line : late ? C.warn : C.closet} done={x.paused} title={x.name}
              meta={<>{x.details && <div className="details">{x.details}</div>}{x.paused ? 'Paused' : `${everyText(x.everyDays)} · ${whenText(x.next, t)}`}</>}
              trail={fmtBoth(st.settings, x.price, x.currency ?? 'PLN')} onClick={() => openSheet(<CareSheet id={x.id} />)} />
          )
        })}
      </List>
      {all.length === 0 && (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {IDEAS.map(([name, everyDays]) => <button key={name} className="chip" onClick={() => openSheet(<CareEdit preset={{ name, everyDays }} />)}>+ {name}</button>)}
        </div>
      )}
      <button className="btn full soft" onClick={() => openSheet(<CareEdit />)}>+ Add selfcare</button>
      <div className="t13 muted" style={{ padding: '0 4px' }}>Planned times go into your budget. Tap one when it’s done to log what you paid.</div>
    </>
  )
}

// one thing: mark it done (logs the spending, plans the next time), skip it, or edit
const CareSheet = ({ id }: { id: string }) => {
  const st = useSt()
  const x = st.selfcare?.find((y) => y.id === id)
  const [paid, setPaid] = useState(numText(x?.price))
  const [date, setDate] = useState(today())
  if (!x) return null
  const t = today()
  const cur = x.currency ?? 'PLN'
  const done = () => {
    const amount = parseNum(paid) ?? x.price
    update((d) => {
      const y = d.selfcare!.find((z) => z.id === id)!
      ensurePeriod(d, periodOf(date, d.settings).key).items.push({ id: uid(), kind: 'expense', label: x.name, amount, currency: cur, date, oneOff: true })
      y.lastDone = date
      y.next = addDays(date, Math.max(1, y.everyDays))
    })
    closeSheet(); toast(`Logged · next time ${fmtDay(addDays(date, Math.max(1, x.everyDays)))}`)
  }
  const skip = () => {
    const next = addDays(careNext(x, t), Math.max(1, x.everyDays))
    update((d) => { d.selfcare!.find((z) => z.id === id)!.next = next })
    closeSheet(); toast(`Skipped · next time ${fmtDay(next)}`)
  }
  return (
    <Sheet title={x.name}>
      {x.details && <div className="t17" style={{ marginTop: -4 }}>{x.details}</div>}
      <div className="t15 muted">{x.paused ? 'Paused' : `${everyText(x.everyDays)} · next ${whenText(x.next, t)}`}{x.lastDone ? ` · last time ${fmtDay(x.lastDone)}` : ''}</div>
      {!x.paused && (
        <div className="card closet" style={{ gap: 10 }}>
          <span className="t15 w5">Done?</span>
          <div className="row" style={{ gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}><Field label={`Paid (${cur === 'PLN' ? 'zł' : cur === 'EUR' ? '€' : '₴'})`}>
              <input className="input" type="text" inputMode="decimal" value={paid} onChange={(e) => setPaid(e.target.value.replace(/[^0-9.,\s]/g, ''))} />
            </Field></div>
            <div style={{ flex: 1, minWidth: 0 }}><Field label="When">
              <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value || today())} />
            </Field></div>
          </div>
          <button className="btn" onClick={done}>Done · log it</button>
        </div>
      )}
      {!x.paused && <button className="btn full soft" onClick={skip}>Skip this time</button>}
      <button className="btn full soft" onClick={() => openSheet(<CareEdit id={x.id} />)}>Edit</button>
    </Sheet>
  )
}

const CareEdit = ({ id, preset }: { id?: string; preset?: Partial<SelfCare> }) => {
  const st = useSt()
  const x = st.selfcare?.find((y) => y.id === id)
  const init = x ?? { currency: 'PLN', everyDays: 30, next: today(), ...preset }
  return (
    <FormSheet title={x ? x.name : 'New selfcare'} initial={init}
      fields={[
        { key: 'name', label: 'Name', type: 'text', placeholder: 'Manicure' },
        { key: 'details', label: 'Details', type: 'text', placeholder: 'Place, master, what exactly…' },
        { key: 'price', label: 'Price per time', type: 'number' },
        { key: 'currency', label: 'Currency', type: 'select', options: CURRENCIES },
        { key: 'everyDays', label: 'Repeat every (days)', type: 'number', step: 1 },
        { key: 'next', label: 'Next time', type: 'date' },
        ...(x ? ([{ key: 'paused', label: 'Paused', type: 'toggle' }] as const) : [])
      ]}
      onSave={(v) => update((d) => {
        d.selfcare ??= []
        const data = { name: v.name.trim(), details: v.details?.trim() || undefined, price: v.price ?? 0, currency: (v.currency ?? 'PLN') as Currency, everyDays: Math.max(1, Math.round(v.everyDays || 30)), next: v.next || today(), paused: !!v.paused || undefined }
        if (x) Object.assign(d.selfcare.find((y) => y.id === x.id)!, data)
        else d.selfcare.push({ id: uid(), ...data })
      })}
      onDelete={x ? () => update((d) => { d.selfcare = (d.selfcare ?? []).filter((y) => y.id !== x.id) }) : undefined}
    />
  )
}
