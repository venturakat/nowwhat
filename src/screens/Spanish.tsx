import { useState } from 'react'
import { ensurePeriod, update, useSt } from '../store'
import type { Lessons } from '../types'
import { addDays, fmt, fmtArs, fmtDay, fmtWeekday, lessonBatch, monthName, numText, parseNum, periodOf, r2, today, uid, weekdayName } from '../lib'
import { C, closeSheet, Field, List, openSheet, Row, Sheet, toast } from '../ui'
import { refreshRates } from '../rates'
import { copyText } from './Money'

// Spanish classes: a USD price per class, paid in pesos at the dólar blue rate of the payment day
export const Spanish = () => {
  const st = useSt()
  const l = st.lessons
  const [busy, setBusy] = useState(false)
  if (!l) return (
    <button className="card money" style={{ gap: 6, textAlign: 'left' }} onClick={() => openSheet(<LessonSetup />)}>
      <span className="t17">Set up your classes</span>
      <span className="t15">Price per class in USD, the days you have them, and the first class you haven’t paid for yet.</span>
    </button>
  )
  const b = lessonBatch(st)
  const s = st.settings
  const refresh = async () => {
    setBusy(true)
    const ok = await refreshRates(true).catch(() => false)
    setBusy(false)
    toast(ok ? 'Rates updated' : 'Couldn’t reach the rates — type the blue rate when you pay')
  }
  const pays = [...l.pays].sort((a, c) => c.date.localeCompare(a.date))
  return (
    <>
      {b && (
        <div className="card money" style={{ gap: 6 }}>
          <span className="t15 w5">Next payment · {monthName(b.month, true)}</span>
          <button className="big" style={{ fontSize: 52, textAlign: 'left' }} onClick={() => b.ars && copyText(String(b.ars), `${fmtArs(b.ars)} copied`)}>{b.blue ? fmtArs(b.ars) : '—'}</button>
          <span className="t14">{b.dates.length} {b.dates.length === 1 ? 'class' : 'classes'} × {numText(l.usd)} USD{b.blue ? ` × ${numText(b.blue)} blue` : ''} · {fmt(b.pln)} with the {fmt(b.fee)} fee · pay {fmtDay(b.due)}</span>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn grow" onClick={() => openSheet(<PaySheet />)}>Paid…</button>
            <button className="btn soft" disabled={busy} onClick={refresh}>{busy ? 'Updating…' : 'Update rate'}</button>
          </div>
          <span className="t13">Tap the amount to copy it · dólar blue {s.blueArs ? `${numText(s.blueArs)}${s.blueAt ? ` · ${fmtDay(s.blueAt.slice(0, 10))} ${new Date(s.blueAt).toTimeString().slice(0, 5)}` : ''}` : 'not loaded yet'}</span>
        </div>
      )}
      {b && (
        <List title={`Classes in ${monthName(b.month, true)}`} right="tap to cancel">
          <MonthClasses month={b.month} />
          <Row title={<span className="muted">+ Extra class</span>} onClick={() => openSheet(<ExtraClass />)} />
        </List>
      )}
      <List title="Payments" empty="Nothing paid here yet">
        {pays.map((p) => (
          <Row key={p.id} dot={C.ok} title={fmtDay(p.date)} meta={`${p.dates.length} ${p.dates.length === 1 ? 'class' : 'classes'} · blue ${numText(p.blue)} · ${fmt(p.pln)}`} trail={fmtArs(p.ars)} onClick={() => openSheet(<PayView id={p.id} />)} />
        ))}
      </List>
      <button className="btn full soft" onClick={() => openSheet(<LessonSetup />)}>Class settings</button>
    </>
  )
}

// every scheduled class of the month; tapping one cancels it (or brings it back)
const MonthClasses = ({ month }: { month: string }) => {
  const st = useSt()
  const l = st.lessons!
  const paid = new Set(l.pays.flatMap((p) => p.dates))
  const all: string[] = []
  for (let d = `${month}-01`; d.startsWith(month); d = addDays(d, 1)) if (d >= l.since && (l.days.includes(new Date(d + 'T12:00:00').getDay()) || l.extra.includes(d))) all.push(d)
  return (
    <>
      {all.map((d) => {
        const off = l.skips.includes(d)
        const isPaid = paid.has(d)
        return (
          <Row key={d} dot={isPaid ? C.ok : off ? C.line : C.money} done={off} title={fmtWeekday(d)}
            meta={[l.time, l.extra.includes(d) && 'extra', isPaid ? 'paid' : off ? 'cancelled' : d < today() ? 'had it' : ''].filter(Boolean).join(' · ')}
            onClick={isPaid ? undefined : () => update((x) => {
              const L = x.lessons!
              if (L.extra.includes(d) && !off) L.extra = L.extra.filter((y) => y !== d)
              else L.skips = off ? L.skips.filter((y) => y !== d) : [...L.skips, d]
            })} />
        )
      })}
    </>
  )
}

const ExtraClass = () => {
  const [d, setD] = useState(today())
  return (
    <Sheet title="Extra class">
      <Field label="Date"><input className="input" type="date" value={d} onChange={(e) => setD(e.target.value)} /></Field>
      <button className="btn full" disabled={!d} onClick={() => { update((x) => { const L = x.lessons!; L.skips = L.skips.filter((y) => y !== d); if (!L.extra.includes(d)) L.extra.push(d) }); closeSheet() }}>Add</button>
    </Sheet>
  )
}

const PaySheet = () => {
  const st = useSt()
  const b = lessonBatch(st)!
  const l = st.lessons!
  const [date, setDate] = useState(today())
  const [blue, setBlue] = useState(b.blue ? numText(b.blue) : '')
  const bl = parseNum(blue) ?? 0
  const ars = Math.round(l.usd * bl) * b.dates.length
  const est = r2(l.usd * b.dates.length * (st.settings.usdPln ?? 4) + b.fee)
  const [pln, setPln] = useState('')
  const zl = parseNum(pln) ?? est
  return (
    <Sheet title={`Paid for ${monthName(b.month, true)}`}>
      <span className="t15 muted">{b.dates.length} {b.dates.length === 1 ? 'class' : 'classes'}: {b.dates.map((d) => fmtDay(d).split(' ')[0]).join(', ')} {monthName(b.month)}</span>
      <Field label="Paid on"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label="Dólar blue that day"><input className="input" inputMode="decimal" value={blue} onChange={(e) => setBlue(e.target.value)} /></Field>
      <div className="card money" style={{ gap: 2, padding: 16 }}><span className="t14 w5">Sent</span><span className="mid">{fmtArs(ars)}</span></div>
      <Field label={`It cost you in zł, with the ${fmt(b.fee)} fee`}><input className="input" inputMode="decimal" value={pln} placeholder={numText(est)} onChange={(e) => setPln(e.target.value)} /></Field>
      <button className="btn full" disabled={!bl || !date} onClick={() => {
        update((d) => {
          const L = d.lessons!
          const itemId = uid()
          ensurePeriod(d, periodOf(date, d.settings).key).items.push({ id: itemId, kind: 'expense', label: 'Spanish classes (paid)', amount: zl, date, oneOff: true })
          L.pays.push({ id: uid(), date, dates: b.dates, usd: L.usd, blue: bl, ars, pln: zl, itemId })
        })
        closeSheet(); toast(`Paid · ${fmt(zl)} added to the budget`)
      }}>Save payment</button>
    </Sheet>
  )
}

const PayView = ({ id }: { id: string }) => {
  const st = useSt()
  const p = st.lessons!.pays.find((x) => x.id === id)!
  return (
    <Sheet title={`Paid ${fmtDay(p.date)}`}>
      <span className="t15">{fmtArs(p.ars)} · {fmt(p.pln)}</span>
      <span className="t15 muted">{p.dates.length} classes × {numText(p.usd)} USD × blue {numText(p.blue)}</span>
      <span className="t14 muted">{p.dates.map(fmtDay).join(', ')}</span>
      <button className="btn full soft" onClick={() => {
        update((d) => {
          d.lessons!.pays = d.lessons!.pays.filter((x) => x.id !== id)
          for (const per of Object.values(d.periods)) per.items = per.items.filter((i) => i.id !== p.itemId)
        })
        closeSheet()
      }}>Delete payment</button>
    </Sheet>
  )
}

export const LessonSetup = () => {
  const st = useSt()
  const l = st.lessons
  const [usd, setUsd] = useState(l ? numText(l.usd) : '')
  const [days, setDays] = useState<number[]>(l?.days ?? [])
  const [time, setTime] = useState(l?.time ?? '')
  const [fee, setFee] = useState(numText(l?.fee ?? 70))
  const [since, setSince] = useState(l?.since ?? today())
  const u = parseNum(usd)
  return (
    <Sheet title="Spanish classes">
      <Field label="Price per class (USD)"><input className="input" inputMode="decimal" value={usd} onChange={(e) => setUsd(e.target.value)} /></Field>
      <Field label="Class days">
        <div className="seg" style={{ flexWrap: 'wrap' }}>
          {[1, 2, 3, 4, 5, 6, 0].map((i) => (
            <button key={i} type="button" className={'chip' + (days.includes(i) ? ' on' : '')} onClick={() => setDays(days.includes(i) ? days.filter((x) => x !== i) : [...days, i])}>{weekdayName(i)}</button>
          ))}
        </div>
      </Field>
      <Field label="Transfer fee each time (zł)"><input className="input" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} /></Field>
      <Field label="Time (yours)"><input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
      {!l?.pays.length && <Field label="First class you haven’t paid for yet"><input className="input" type="date" value={since} onChange={(e) => setSince(e.target.value)} /></Field>}
      <button className="btn full" disabled={!u || !days.length} onClick={() => {
        update((d) => {
          const base: Lessons = d.lessons ?? { usd: 0, days: [], since, extra: [], skips: [], pays: [] }
          d.lessons = { ...base, usd: u!, days: [...days].sort(), time: time || undefined, fee: parseNum(fee) ?? 0, since: base.pays.length ? base.since : since }
        })
        closeSheet()
        if (!st.lessons) refreshRates(true).catch(() => {})
      }}>Save</button>
      {l && (
        <button className="btn full soft" onClick={() => { if (confirmTwice()) { update((d) => { delete d.lessons }); closeSheet() } }}>Remove classes</button>
      )}
    </Sheet>
  )
}
// a plain second tap instead of a browser dialog
let armed = 0
const confirmTwice = () => {
  if (Date.now() - armed < 3000) return true
  armed = Date.now(); toast('Tap again to remove')
  return false
}
