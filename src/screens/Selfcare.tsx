import { useState } from 'react'
import { ensurePeriod, update, useSt } from '../store'
import type { SelfCare } from '../types'
import { fitSize, curOptions, CUR_SIGN, timeSpan, addDays, careInMonth, careInPeriod, careNext, diffDays, fmt, fmtBoth, fmtDay, monthKey, monthName, numText, parseNum, periodOf, today, uid } from '../lib'
import { C, closeSheet, Field, List, openSheet, Row, Sheet, toast } from '../ui'
import { FormSheet } from '../form'
import { tr, trn } from '../i18n'

// quick starts for an empty tab (name, every N days)
const IDEAS: [string, number][] = [['Manicure', 21], ['Pedicure', 42], ['Massage', 30], ['Haircut', 60], ['Gym', 30], ['Yoga class', 7]]

export const everyText = (n: number) => (n === 1 ? tr('Every day') : n === 7 ? tr('Every week') : n % 7 === 0 ? trn(n / 7, 'Every {n} week', 'Every {n} weeks') : trn(n, 'Every {n} day', 'Every {n} days'))
const whenText = (d: string, t: string) => {
  const n = diffDays(t, d)
  return n < 0 ? trn(-n, '{n} day overdue', '{n} days overdue') : n === 0 ? tr('today') : n === 1 ? tr('tomorrow') : fmtDay(d)
}

export const Selfcare = () => {
  const st = useSt()
  const t = today()
  const all = (st.selfcare ?? []).slice().sort((a, b) => Number(!!a.paused) - Number(!!b.paused) || a.next.localeCompare(b.next))
  const p = periodOf(t, st.settings)
  const half = careInPeriod(st, p.start, p.end)
  const halfSum = half.reduce((a, c) => a + c.pln, 0)
  const active = all.filter((x) => !x.paused)
  const mk = monthKey(t)
  const month = careInMonth(st, mk)
  return (
    <>
      {active.length > 0 && (
        <div className="card closet" style={{ gap: 6 }}>
          <span className="t15 w5">{tr('Selfcare')} · {monthName(mk, true)} · {trn(month.length, '{n} time', '{n} times')}</span>
          <span className="big" style={{ fontSize: fitSize(fmt(month.reduce((a, c) => a + c.pln, 0)), 46, 10) }}>{fmt(month.reduce((a, c) => a + c.pln, 0))}</span>
          <span className="t14">{half.length ? tr('{x} planned this fortnight · already in your budget', { x: fmt(halfSum) }) : tr('Nothing planned this fortnight')}</span>
        </div>
      )}
      <List title="Coming up" right="next time" empty="Add what you do for yourself regularly.">
        {all.map((x) => {
          const late = diffDays(t, x.next) < 0
          return (
            <Row key={x.id} dot={x.paused ? C.line : late ? C.warn : C.closet} done={x.paused} title={x.name}
              meta={<>{x.details && <div className="details">{x.details}</div>}{x.paused ? tr('Paused') : `${everyText(x.everyDays)} · ${whenText(x.next, t)}${x.time ? ' ' + tr('at {t}', { t: timeSpan(x.time, x.endTime) ?? '' }) : ''}${month.filter((c) => c.x.id === x.id).length > 1 ? ' · ' + tr('{n}× in {m}', { n: month.filter((c) => c.x.id === x.id).length, m: monthName(mk, true) }) : ''}`}</>}
              trail={fmtBoth(st.settings, x.price, x.currency)} onClick={() => openSheet(<CareSheet id={x.id} />)} />
          )
        })}
      </List>
      {all.length === 0 && (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {IDEAS.map(([name, everyDays]) => <button key={name} className="chip" onClick={() => openSheet(<CareEdit preset={{ name: tr(name), everyDays }} />)}>+ {tr(name)}</button>)}
        </div>
      )}
      <button className="btn full soft" onClick={() => openSheet(<CareEdit />)}>{tr('+ Add selfcare')}</button>
      <div className="t13 muted" style={{ padding: '0 4px' }}>{tr('Planned times go into your budget. Tap one when it’s done to log what you paid.')}</div>
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
  const cur = x.currency ?? st.settings.mainCur
  const done = () => {
    const amount = parseNum(paid) ?? x.price
    update((d) => {
      const y = d.selfcare!.find((z) => z.id === id)!
      ensurePeriod(d, periodOf(date, d.settings).key).items.push({ id: uid(), kind: 'expense', label: x.name, amount, currency: cur, date, oneOff: true, paid: true })
      y.lastDone = date
      y.next = addDays(date, Math.max(1, y.everyDays))
      y.time = undefined; y.endTime = undefined // the booked time was for this visit
    })
    closeSheet(); toast(tr('Logged · next time {d}', { d: fmtDay(addDays(date, Math.max(1, x.everyDays))) }))
  }
  const skip = () => {
    const next = addDays(careNext(x, t), Math.max(1, x.everyDays))
    update((d) => { const y = d.selfcare!.find((z) => z.id === id)!; y.next = next; y.time = undefined; y.endTime = undefined })
    closeSheet(); toast(tr('Skipped · next time {d}', { d: fmtDay(next) }))
  }
  return (
    <Sheet title={x.name}>
      {x.details && <div className="t17" style={{ marginTop: -4 }}>{x.details}</div>}
      <div className="t15 muted">{x.paused ? tr('Paused') : `${everyText(x.everyDays)} · ${tr('next {d}', { d: whenText(x.next, t) })}${x.time ? ' ' + tr('at {t}', { t: timeSpan(x.time, x.endTime) ?? '' }) : ''}`}{x.lastDone ? ' · ' + tr('last time {d}', { d: fmtDay(x.lastDone) }) : ''}</div>
      {!x.paused && (
        <div className="card closet" style={{ gap: 10 }}>
          <span className="t15 w5">{tr('Done?')}</span>
          <div className="row" style={{ gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}><Field label={tr('Paid ({x})', { x: CUR_SIGN[cur] })}>
              <input className="input" type="text" inputMode="decimal" value={paid} onChange={(e) => setPaid(e.target.value.replace(/[^0-9.,\s]/g, ''))} />
            </Field></div>
            <div style={{ flex: 1, minWidth: 0 }}><Field label="When">
              <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value || today())} />
            </Field></div>
          </div>
          <button className="btn" onClick={done}>{tr('Done · log it')}</button>
        </div>
      )}
      {!x.paused && <button className="btn full soft" onClick={skip}>{tr('Skip this time')}</button>}
      <button className="btn full soft" onClick={() => openSheet(<CareEdit id={x.id} />)}>{tr('Edit')}</button>
    </Sheet>
  )
}

const CareEdit = ({ id, preset }: { id?: string; preset?: Partial<SelfCare> }) => {
  const st = useSt()
  const x = st.selfcare?.find((y) => y.id === id)
  const init = x ?? { currency: st.settings.mainCur, everyDays: 30, next: today(), ...preset }
  return (
    <FormSheet title={x ? x.name : 'New selfcare'} initial={init}
      fields={[
        { key: 'name', label: 'Name', type: 'text', placeholder: 'Manicure' },
        { key: 'details', label: 'Details', type: 'text', placeholder: 'Place, master, what exactly…' },
        { key: 'price', label: 'Price per time', type: 'number' },
        { key: 'currency', label: 'Currency', type: 'select', options: curOptions(st.settings, x?.currency) },
        { key: 'everyDays', label: 'Repeat every (days)', type: 'number', step: 1 },
        { key: 'next', label: 'Next time', type: 'date' },
        { key: 'time', label: 'Starts (when it’s booked)', type: 'time' },
        { key: 'endTime', label: 'Ends', type: 'time' },
        ...(x ? ([{ key: 'paused', label: 'Paused', type: 'toggle' }] as const) : [])
      ]}
      onSave={(v) => update((d) => {
        d.selfcare ??= []
        const data = { name: v.name.trim(), details: v.details?.trim() || undefined, price: v.price ?? 0, currency: v.currency ?? st.settings.mainCur, everyDays: Math.max(1, Math.round(v.everyDays || 30)), next: v.next || today(), time: v.time || undefined, endTime: (v.time && v.endTime) || undefined, paused: !!v.paused || undefined }
        if (x) Object.assign(d.selfcare.find((y) => y.id === x.id)!, data)
        else d.selfcare.push({ id: uid(), ...data })
      })}
      twoTap
      onDelete={x ? () => update((d) => { d.selfcare = (d.selfcare ?? []).filter((y) => y.id !== x.id) }) : undefined}
    />
  )
}
