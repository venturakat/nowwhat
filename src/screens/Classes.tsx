import { useState } from 'react'
import { ensurePeriod, update, useSt } from '../store'
import type { Settings } from '../types'
import type { ClassRate, Course, Currency, PayCur } from '../types'
import { fitSize, addDays, classBatch, classMonthCost, paysPerClass, classEnd, classTime, movedAway, toggleClass, classPayIn, classRate, classRateKind, curOptions, curSign, fmt, fmtCur, fmtDay, fmtPay, fmtWeekday, monthName, numText, parseNum, perClassPaid, periodOf, r2, toMain, today, uid, weekdayName, pad, daysInMonth } from '../lib'
import { C, closeSheet, Field, Icon, List, openSheet, Row, Sheet, TimeRange, toast } from '../ui'
import { refreshRates } from '../rates'
import { copyText } from './Money'
import { tr, trn } from '../i18n'

// Classes (Money › Classes): any regular paid classes. Each has a price per class in one currency and can be
// paid in another (USD price sent as pesos at the dólar blue rate), plus a transfer fee in any currency.
// Paid once a month for that month's classes; the cost in the main currency goes into the budget.

// the app's currencies (+ pesos to pay in: they have the dólar blue / oficial rates)
const curs = (s: Settings, keep: Currency[]) => [...curOptions(s).map(([c]) => c), ...keep].filter((c, i, a) => a.indexOf(c) === i)
const sign = (c: PayCur) => curSign(c)
// whole amounts without the .00
const cur0 = (n: number, c: Currency) => fmtCur(n, c, n % 1 !== 0)
const RATE_NAME: Record<ClassRate, string> = { app: 'rate', blue: 'blue', oficial: 'oficial', manual: 'rate' }

export const Classes = () => {
  const st = useSt()
  const all = st.classes ?? []
  if (!all.length) return (
    <button className="card money" style={{ gap: 6, textAlign: 'left' }} onClick={() => openSheet(<ClassEdit />)}>
      <span className="t17">{tr('Set up your classes')}</span>
      <span className="t15">{tr('Price per class and its currency, the days you have them, and the first class you haven’t paid for yet.')}</span>
    </button>
  )
  return (
    <>
      {all.map((c) => <ClassBlock key={c.id} c={c} />)}
      <button className="btn full soft" onClick={() => openSheet(<ClassEdit />)}>{tr('+ Add a class')}</button>
    </>
  )
}

const ClassBlock = ({ c }: { c: Course }) => {
  const st = useSt()
  const [busy, setBusy] = useState(false)
  const per = paysPerClass(c)
  const b = per ? classMonthCost(st, c) : classBatch(st, c)
  const s = st.settings
  const payIn = classPayIn(c)
  const kind = classRateKind(c)
  const refresh = async () => {
    setBusy(true)
    const ok = await refreshRates(true).catch(() => false)
    setBusy(false)
    toast(ok ? tr('Rates updated') : tr('Couldn’t reach the rates — type the rate when you pay'))
  }
  const rateLine = kind === 'blue' || kind === 'oficial'
    ? `dólar ${kind} ${kind === 'blue' ? (s.blueArs ? `${numText(s.blueArs)}${s.blueAt ? ` · ${fmtDay(s.blueAt.slice(0, 10))} ${new Date(s.blueAt).toTimeString().slice(0, 5)}` : ''}` : tr('not loaded yet')) : s.oficialArs ? numText(s.oficialArs) : tr('not loaded yet')}`
    : ''
  return (
    <>
      {b ? (
        <div className="card money" style={{ gap: 6 }}>
          <span className="t15 w5">{c.name} · {per ? tr('cost this month') : `${tr('next payment')} · ${monthName(b.month, true)}`}</span>
          {per && b.paid !== undefined
            ? <span className="big" style={{ fontSize: fitSize(fmtPay(b.paid, payIn), 46, 10) }}>{fmtPay(b.paid, payIn)}</span>
            : b.paid !== undefined
            ? <button className="big" style={{ fontSize: fitSize(fmtPay(b.paid, payIn), 46, 10), textAlign: 'left' }} onClick={() => copyText(String(b.paid), tr('{x} copied', { x: fmtPay(b.paid!, payIn, payIn !== 'ARS') }))}>{fmtPay(b.paid, payIn)}</button>
            : <span className="big" style={{ fontSize: fitSize(fmtCur(b.total, c.currency, false), 46, 10) }}>{fmtCur(b.total, c.currency, false)}</span>}
          <span className="t14">
            {trn(b.dates.length, '{n} class', '{n} classes')} × {cur0(c.price, c.currency)}
            {kind && b.rate !== undefined ? ` × ${numText(r2(b.rate))} ${tr(RATE_NAME[kind])}` : kind ? ' · ' + tr('paid in {x}, rate typed when you pay', { x: payIn }) : ''}
            {` · ${fmt(b.pln)}${b.fee ? ' ' + tr(per ? 'with the {x} fee each time' : 'with the {x} fee', { x: cur0(b.fee, b.feeCur) }) : ''}${per ? '' : ' · ' + tr('pay {d}', { d: fmtDay(b.due) })}`}
          </span>
          {(!per || (kind && kind !== 'manual')) && <div className="row" style={{ gap: 8 }}>
            {!per && <button className="btn grow" onClick={() => openSheet(<PaySheet id={c.id} />)}>{tr('Paid')}</button>}
            {kind && kind !== 'manual' && <button className={'btn soft' + (per ? ' grow' : '')} disabled={busy} onClick={refresh}>{busy ? tr('Updating…') : tr('Update rate')}</button>}
          </div>}
          {!per && b.paid !== undefined && <span className="t13">{tr('Tap the amount to copy it')}{rateLine ? ` · ${rateLine}` : ''}</span>}
        </div>
      ) : (
        <div className="card money" style={{ gap: 4 }}>
          <span className="t15 w5">{c.name}</span>
          <span className="t14">{tr(!c.days.length ? 'No class days set yet' : per ? 'No classes this month' : 'Nothing to pay right now')}</span>
        </div>
      )}
      <List title={b ? tr('{x} in {m}', { x: c.name, m: monthName(b.month, true) }) : c.name} right={b ? 'tap to cancel' : undefined}>
        {b && <MonthClasses c={c} month={b.month} />}
        <Row title={<span className="muted">{tr('+ Extra class')}</span>} onClick={() => openSheet(<ExtraClass id={c.id} />)} />
        {(!per || c.pays.length > 0) && <Row title={tr('Payments')} meta={c.pays.length ? tr('{n} so far · last {d}', { n: c.pays.length, d: fmtDay([...c.pays].sort((a, x) => x.date.localeCompare(a.date))[0].date) }) : tr('Nothing paid here yet')} trail={<Icon.chevR />} onClick={() => openSheet(<PaysSheet id={c.id} />)} />}
        <Row title={tr('Class settings')} trail={<Icon.chevR />} onClick={() => openSheet(<ClassEdit id={c.id} />)} />
      </List>
    </>
  )
}

// every scheduled class of the month; tapping one cancels it (or brings it back)
const MonthClasses = ({ c, month }: { c: Course; month: string }) => {
  const paid = new Set(c.pays.flatMap((p) => p.dates))
  const away = movedAway(c)
  const all: string[] = []
  for (let d = `${month}-01`; d.startsWith(month); d = addDays(d, 1)) if (d >= c.since && (c.days.includes(new Date(d + 'T12:00:00').getDay()) || c.extra.includes(d))) all.push(d)
  return (
    <>
      {all.filter((d) => !away.has(d)).map((d) => {
        const off = c.skips.includes(d)
        const isPaid = paid.has(d)
        return (
          <Row key={d} dot={isPaid ? C.ok : off ? C.line : C.money} done={off} title={fmtWeekday(d)}
            meta={[classTime(c, d), c.moved?.[d] ? tr('moved from {d}', { d: fmtDay(c.moved[d]) }) : c.extra.includes(d) && tr('extra'), isPaid ? tr('paid') : off ? tr('cancelled') : d < today() ? tr('had it') : ''].filter(Boolean).join(' · ')}
            onClick={isPaid ? undefined : () => editClass(c.id, (L) => toggleClass(L, d))} />
        )
      })}
    </>
  )
}
const editClass = (id: string, f: (c: Course) => void) => update((d) => { const c = d.classes?.find((x) => x.id === id); if (c) f(c) })

const ExtraClass = ({ id }: { id: string }) => {
  const [d, setD] = useState(today())
  return (
    <Sheet title="Extra class">
      <Field label="Date"><input className="input" type="date" value={d} onChange={(e) => setD(e.target.value)} /></Field>
      <button className="btn full" disabled={!d} onClick={() => { editClass(id, (L) => { L.skips = L.skips.filter((y) => y !== d); if (!L.extra.includes(d)) L.extra.push(d) }); closeSheet() }}>{tr('Add')}</button>
    </Sheet>
  )
}

const PaySheet = ({ id }: { id: string }) => {
  const st = useSt()
  const c = st.classes!.find((x) => x.id === id)!
  const b = classBatch(st, c)!
  const payIn = classPayIn(c)
  const kind = classRateKind(c)
  const [date, setDate] = useState(today())
  const [rateText, setRateText] = useState(b.rate !== undefined && kind ? numText(r2(b.rate)) : '')
  const rate = kind ? parseNum(rateText) ?? 0 : 1
  const sent = rate ? perClassPaid(c, rate) * b.dates.length : 0
  const est = b.pln
  const [pln, setPln] = useState('')
  const zl = parseNum(pln) ?? est
  return (
    <Sheet title={`${c.name} · ${monthName(b.month, true)}`}>
      <span className="t15 muted">{trn(b.dates.length, '{n} class', '{n} classes')}: {b.dates.map((d) => fmtDay(d).split(' ')[0]).join(', ')} {monthName(b.month)}</span>
      <Field label="Paid on"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      {kind && <Field label={tr('{r} that day: 1 {a} in {b}', { r: kind === 'blue' ? 'Dólar blue' : kind === 'oficial' ? 'Dólar oficial' : tr('Rate'), a: c.currency, b: payIn })}><input className="input" inputMode="decimal" value={rateText} onChange={(e) => setRateText(e.target.value)} /></Field>}
      <div className="card money" style={{ gap: 2, padding: 16 }}><span className="t14 w5">{tr('Sent')}</span><span className="mid">{rate ? fmtPay(sent, payIn, payIn !== 'ARS') : '—'}</span></div>
      <Field label={b.fee ? tr('It cost you in {c}, with the {x} fee', { c: curSign(st.settings.mainCur), x: cur0(b.fee, b.feeCur) }) : tr('It cost you in {c}', { c: curSign(st.settings.mainCur) })}><input className="input" inputMode="decimal" value={pln} placeholder={numText(est)} onChange={(e) => setPln(e.target.value)} /></Field>
      <button className="btn full" disabled={!rate || !date} onClick={() => {
        update((d) => {
          const L = d.classes!.find((x) => x.id === id)!
          const itemId = uid()
          ensurePeriod(d, periodOf(date, d.settings).key).items.push({ id: itemId, kind: 'expense', label: `${L.name} (paid)`, amount: zl, currency: d.settings.mainCur, date, oneOff: true })
          L.pays.push({ id: uid(), date, dates: b.dates, price: L.price, currency: L.currency, rate: kind ? rate : undefined, paid: sent, payIn, pln: zl, plnCur: d.settings.mainCur, itemId })
        })
        closeSheet(); toast(tr('Paid · {x} added to the budget', { x: fmt(zl) }))
      }}>{tr('Save payment')}</button>
    </Sheet>
  )
}

const PaysSheet = ({ id }: { id: string }) => {
  const st = useSt()
  const c = st.classes?.find((x) => x.id === id)
  if (!c) return null
  const pays = [...c.pays].sort((a, x) => x.date.localeCompare(a.date))
  return (
    <Sheet title={`${c.name} · ${tr('payments')}`}>
      <List empty="Nothing paid here yet">
        {pays.map((p) => (
          <Row key={p.id} dot={C.ok} title={fmtDay(p.date)} meta={`${trn(p.dates.length, '{n} class', '{n} classes')}${p.rate ? ' · ' + tr('rate {x}', { x: numText(r2(p.rate)) }) : ''} · ${fmtCur(p.pln, p.plnCur ?? 'PLN', false)}`} trail={fmtPay(p.paid, p.payIn)}
            onClick={() => openSheet(<PayView cid={c.id} id={p.id} />)} />
        ))}
      </List>
    </Sheet>
  )
}

const PayView = ({ cid, id }: { cid: string; id: string }) => {
  const st = useSt()
  const c = st.classes?.find((x) => x.id === cid)
  const p = c?.pays.find((x) => x.id === id)
  if (!c || !p) return null
  return (
    <Sheet title={`${c.name} · ${tr('paid {d}', { d: fmtDay(p.date) })}`}>
      <span className="t15">{fmtPay(p.paid, p.payIn, p.payIn !== 'ARS')} · {fmtCur(p.pln, p.plnCur ?? 'PLN', false)}</span>
      <span className="t15 muted">{trn(p.dates.length, '{n} class', '{n} classes')} × {cur0(p.price, p.currency)}{p.rate ? ` × ${numText(r2(p.rate))}` : ''}</span>
      <span className="t14 muted">{p.dates.map(fmtDay).join(', ')}</span>
      <button className="btn full soft" onClick={() => {
        update((d) => {
          const L = d.classes!.find((x) => x.id === cid)!
          L.pays = L.pays.filter((x) => x.id !== id)
          for (const per of Object.values(d.periods)) per.items = per.items.filter((i) => i.id !== p.itemId)
        })
        openSheet(<PaysSheet id={cid} />)
      }}>{tr('Delete payment')}</button>
    </Sheet>
  )
}

const CurPick = <T extends PayCur>({ value, options, onChange }: { value: T; options: T[]; onChange: (c: T) => void }) => (
  <div className="seg">{options.map((o) => <button key={o} type="button" className={'chip' + (value === o ? ' on' : '')} onClick={() => onChange(o)}>{sign(o)}</button>)}</div>
)

export const ClassEdit = ({ id }: { id?: string }) => {
  const st = useSt()
  const c = st.classes?.find((x) => x.id === id)
  const [name, setName] = useState(c?.name ?? '')
  const [price, setPrice] = useState(c ? numText(c.price) : '')
  const [cur, setCur] = useState<Currency>(c?.currency ?? st.settings.mainCur)
  const [payIn, setPayIn] = useState<PayCur>(c ? classPayIn(c) : st.settings.mainCur)
  const [rate, setRate] = useState<ClassRate>(c ? classRateKind(c) ?? 'app' : 'app')
  const [fee, setFee] = useState(numText(c?.fee))
  const [feeCur, setFeeCur] = useState<Currency>(c?.feeCurrency ?? st.settings.mainCur)
  const CURS = curs(st.settings, [cur, feeCur])
  const PAY_CURS = curs(st.settings, [payIn])
  const [days, setDays] = useState<number[]>(c?.days ?? [])
  const [time, setTime] = useState(c?.time ?? '')
  const [endTime, setEndTime] = useState(c ? classEnd(c) ?? '' : '')
  const [every, setEvery] = useState<'class' | 'month'>(c?.payEvery === 'class' ? 'class' : 'month')
  const [armed, setArmed] = useState(false)
  const [payDay, setPayDay] = useState(() => { const t = today(); return `${t.slice(0, 8)}${pad(Math.min(c?.payDay ?? st.settings.splitDay, daysInMonth(+t.slice(0, 4), +t.slice(5, 7))))}` })
  const [since, setSince] = useState(c?.since ?? today())
  const p = parseNum(price)
  const differs = payIn !== cur
  const ars = payIn === 'ARS'
  // keep the rate choice sensible for the pay-in currency
  const rateNow: ClassRate = rate === 'manual' ? 'manual' : 'app'
  const preview = differs && p ? classRate(st.settings, { ...(c ?? { id: '', name: '', days: [], since: today(), extra: [], skips: [], pays: [] }), price: p, currency: cur, payIn, rate: rateNow }) : undefined
  return (
    <Sheet title={c ? c.name : 'New class'}>
      <Field label="Name"><input className="input" value={name} placeholder={tr('Spanish, yoga, piano…')} autoFocus={!c} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Price per class"><input className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
      <Field label="Price currency"><CurPick value={cur} options={CURS} onChange={(x) => { if (payIn === cur) setPayIn(x); setCur(x) }} /></Field>
      <Field label="Payment currency"><CurPick value={payIn} options={PAY_CURS} onChange={setPayIn} /></Field>
      {differs && (
        <Field label={tr('From {a} to {b}', { a: cur, b: payIn })}>
          <div className="seg">
            {(['app', 'manual'] as ClassRate[]).map((r) => (
              <button key={r} type="button" className={'chip' + (rateNow === r ? ' on' : '')} onClick={() => setRate(r)}>{r === 'blue' ? 'Dólar blue' : r === 'oficial' ? 'Dólar oficial' : r === 'app' ? tr('Today’s rate') : tr('I type it when paying')}</button>
            ))}
          </div>
          {preview !== undefined && p ? <span className="t13 muted">{tr('Now about {x} a class', { x: fmtPay(perClassPaid({ price: p, payIn } as Course, preview), payIn, !ars) })}</span> : null}
        </Field>
      )}
      <Field label="Transfer fee each time">
        <div className="col" style={{ gap: 8 }}>
          <input className="input" inputMode="decimal" value={fee} placeholder="0" onChange={(e) => setFee(e.target.value)} />
          <CurPick value={feeCur} options={CURS} onChange={setFeeCur} />
        </div>
      </Field>
      <Field label="Class days">
        <div className="seg" style={{ flexWrap: 'wrap' }}>
          {[1, 2, 3, 4, 5, 6, 0].map((i) => (
            <button key={i} type="button" className={'chip' + (days.includes(i) ? ' on' : '')} onClick={() => setDays(days.includes(i) ? days.filter((x) => x !== i) : [...days, i])}>{weekdayName(i)}</button>
          ))}
        </div>
      </Field>
      <TimeRange start={time} end={endTime} onChange={(a, b) => { setTime(a); setEndTime(b) }} />
      <Field label="I pay">
        <div className="seg">
          {(['class', 'month'] as const).map((k) => (
            <button key={k} type="button" className={'chip' + (every === k ? ' on' : '')} onClick={() => setEvery(k)}>{k === 'class' ? tr('Per class') : tr('Per month')}</button>
          ))}
        </div>
      </Field>
      {every === 'month' && <Field label="Payment day"><input className="input" type="date" value={payDay} onChange={(e) => setPayDay(e.target.value)} /></Field>}
      {!c?.pays.length && <Field label="First class you haven’t paid for yet"><input className="input" type="date" value={since} onChange={(e) => setSince(e.target.value)} /></Field>}
      {p && !differs && cur !== st.settings.mainCur ? <span className="t13 muted">{tr('About {x} a class', { x: fmt(toMain(st.settings, p, cur)) })}</span> : null}
      <button className="btn full" disabled={!name.trim() || !p || !days.length} onClick={() => {
        const needsArs = payIn === 'ARS'
        update((d) => {
          d.classes ??= []
          const data = {
            name: name.trim(), price: p!, currency: cur, payIn: payIn === cur ? undefined : payIn, rate: payIn === cur ? undefined : rateNow,
            fee: parseNum(fee) || undefined, feeCurrency: parseNum(fee) ? feeCur : undefined,
            days: [...days].sort(), time: time || undefined, endTime: (time && endTime) || undefined, payEvery: every,
            payDay: Math.min(31, Math.max(1, Number(payDay.slice(8, 10)) || d.settings.splitDay))
          }
          const x = d.classes.find((y) => y.id === id)
          if (x) Object.assign(x, data, x.pays.length ? {} : { since })
          else d.classes.push({ id: uid(), ...data, since, extra: [], skips: [], pays: [] })
        })
        closeSheet()
        if (needsArs) refreshRates(true).catch(() => {})
      }}>{tr('Save')}</button>
      {c && <button className="btn full soft" style={armed ? { color: 'var(--alert)', borderColor: 'var(--alert)' } : undefined} onClick={() => {
        if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 3000); return }
        update((d) => { d.classes = (d.classes ?? []).filter((x) => x.id !== id) }); closeSheet()
      }}>{armed ? tr('Delete') : tr('Remove this class')}</button>}
    </Sheet>
  )
}
