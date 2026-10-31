import { useState } from 'react'
import { ensurePeriod, update, useSt } from '../store'
import type { Credit, Currency } from '../types'
import { CUR_SIGN, creditStatus, diffDays, fmt, fmtBoth, fmtCur, fmtDay, monthName, periodOf, toPln, today, uid } from '../lib'
import { CURRENCIES } from './Subscriptions'
import { C, closeSheet, List, openSheet, Row, Sheet, toast } from '../ui'
import { FormSheet } from '../form'

const monthYear = (d?: string) => (d ? `${monthName(d.slice(0, 7))} ${d.slice(0, 4)}` : '—')

// an extra or closing payment is real money leaving this half: log it in the budget
const logPayment = (date: string, label: string, amount: number, cur: Currency = 'PLN') =>
  update((d) => { ensurePeriod(d, periodOf(date, d.settings).key).items.push({ id: uid(), kind: 'expense', label, amount: Math.round(toPln(d.settings, amount, cur) * 100) / 100, date, oneOff: true }) })

export const Credits = () => {
  const st = useSt()
  const t = today()
  const all = (st.credits ?? []).map((c) => ({ c, s: creditStatus(c) }))
  const open = all.filter((x) => !x.s.closed).sort((a, b) => (a.s.next?.date ?? '').localeCompare(b.s.next?.date ?? ''))
  const closed = all.filter((x) => x.s.closed)
  const pl = (c: Credit, n: number) => toPln(st.settings, n, c.currency ?? 'PLN')
  const remaining = open.reduce((a, x) => a + pl(x.c, x.s.remaining), 0)
  const mk = t.slice(0, 7)
  const thisMonth = open.reduce((a, x) => a + pl(x.c, x.s.left.filter((p) => p.date.startsWith(mk)).reduce((b, p) => b + p.amount, 0)), 0)
  const lastEnd = open.map((x) => x.s.endsOn ?? '').sort().pop()
  return (
    <>
      {open.length > 0 && (
        <div className="card dark" style={{ gap: 6 }}>
          <span className="t15 w5">Still to repay · {open.length} {open.length === 1 ? 'credit' : 'credits'}</span>
          <span className="big" style={{ fontSize: 56 }}>{fmt(remaining)}</span>
          <span className="t15">{fmt(thisMonth)} left to pay this month · all clear by {monthYear(lastEnd)}</span>
        </div>
      )}
      <List title="Credits" empty="No credits — nice.">
        {open.map(({ c, s }) => {
          const n = s.next ? diffDays(t, s.next.date) : 0
          return (
            <Row key={c.id} dot={n <= 2 ? C.alert : C.money} title={c.name}
              meta={`Next ${s.next ? (n === 0 ? 'today' : n === 1 ? 'tomorrow' : fmtDay(s.next.date)) : '—'} · ${fmtCur(s.next?.amount ?? 0, c.currency)} · ${s.left.length} left`}
              trail={(c.currency ?? 'PLN') === 'PLN' ? fmt(s.remaining) : <span style={{ textAlign: 'right', display: 'block' }}>{fmtCur(s.remaining, c.currency, false)}<br /><span className="t13 muted">{fmt(pl(c, s.remaining))}</span></span>} onClick={() => openSheet(<CreditSheet id={c.id} />)} />
          )
        })}
      </List>
      <button className="btn full soft" onClick={() => openSheet(<CreditEdit />)}>+ Add a credit</button>
      {closed.length > 0 && (
        <List title="Paid off" right={String(closed.length)}>
          {closed.map(({ c }) => <Row key={c.id} done title={c.name} meta={c.closedOn ? `Closed early ${fmtDay(c.closedOn)}` : 'All payments done'} onClick={() => openSheet(<CreditSheet id={c.id} />)} />)}
        </List>
      )}
      <div className="t13 muted" style={{ padding: '0 4px' }}>Each payment shows up in the Budget’s fixed list for its half of the month, until the credit is paid off.</div>
    </>
  )
}

const CreditSheet = ({ id }: { id: string }) => {
  const st = useSt()
  const c = st.credits.find((x) => x.id === id)
  const [all, setAll] = useState(false)
  if (!c) return null
  const s = creditStatus(c)
  const cur = c.currency ?? 'PLN'
  const paidPct = s.total > 0 ? Math.min(1, 1 - s.remaining / s.total) : 1
  const shown = all ? s.left : s.left.slice(0, 4)
  return (
    <Sheet title={c.name}>
      <div className="card money" style={{ gap: 8 }}>
        <div className="between" style={{ alignItems: 'flex-end' }}>
          <div className="col"><span className="t14 w5">Left to repay</span><span className="mid">{fmtCur(s.remaining, cur)}</span>{cur !== 'PLN' && <span className="t14">{fmt(toPln(st.settings, s.remaining, cur))}</span>}</div>
          <div className="col" style={{ alignItems: 'flex-end' }}><span className="t14 w5">{s.closed ? 'Done' : 'Ends'}</span><span className="t17">{s.closed ? '✓' : monthYear(s.endsOn)}</span></div>
        </div>
        <div className="bar"><div style={{ width: `${paidPct * 100}%` }} /></div>
        <span className="t14">{s.left.length} of {c.count} payments left · {fmtBoth(st.settings, c.installment, cur)} a month</span>
      </div>
      <div className="t14 muted">
        Taken {fmtDay(c.takenOn)} {c.takenOn.slice(0, 4)}{c.borrowed ? ` · borrowed ${fmtCur(c.borrowed, cur)} · repaying ${fmtCur(s.total, cur)} in total` : ''}
        {c.extras.length ? ` · extra paid ${fmtCur(c.extras.reduce((a, x) => a + x.amount, 0), cur)}` : ''}
        {c.note ? <><br />{c.note}</> : null}
      </div>
      {!s.closed && (
        <>
          <List title="Coming payments" right={`${s.left.length}`}>
            {shown.map((p) => <Row key={p.n} dot={C.money} title={fmtDay(p.date) + ' ' + p.date.slice(0, 4)} meta={`Payment ${p.n} of ${c.count}${p.amount < c.installment - 0.004 && p.n !== c.count ? ' · partly covered by extra' : ''}`} trail={fmtCur(p.amount, cur)} />)}
            {!all && s.left.length > 4 && <Row title={<span className="muted">Show all</span>} onClick={() => setAll(true)} />}
          </List>
          <div className="btn2">
            <button className="btn" onClick={() => openSheet(<ExtraSheet id={c.id} />)}>Extra payment</button>
            <button className="btn ghost" onClick={() => openSheet(<CloseSheet id={c.id} />)}>Close it now</button>
          </div>
        </>
      )}
      {c.extras.length > 0 && (
        <List title="Extra payments">
          {c.extras.map((x) => <Row key={x.id} title={fmtCur(x.amount, cur)} meta={fmtDay(x.date) + ' ' + x.date.slice(0, 4)} trail={<span className="t14 muted">remove</span>} onClick={() => update((d) => { const cc = d.credits.find((y) => y.id === c.id)!; cc.extras = cc.extras.filter((y) => y.id !== x.id) })} />)}
        </List>
      )}
      {c.closedOn && <button className="btn full soft" onClick={() => update((d) => { delete d.credits.find((y) => y.id === c.id)!.closedOn })}>Reopen (undo closing)</button>}
      <button className="btn full soft" onClick={() => openSheet(<CreditEdit id={c.id} />)}>Edit details</button>
    </Sheet>
  )
}

const ExtraSheet = ({ id }: { id: string }) => {
  const st = useSt()
  const c = st.credits.find((x) => x.id === id)!
  return (
    <FormSheet title="Extra payment" initial={{ date: today() }} saveLabel="Add extra payment"
      fields={[{ key: 'amount', label: `Amount (${CUR_SIGN[c.currency ?? 'PLN']})`, type: 'number' }, { key: 'date', label: 'Date', type: 'date' }]}
      extra={<span className="t14 muted">Your bank takes it off the end, so the last payments shrink or disappear. It’s also added to that half’s spending.</span>}
      onSave={(v) => {
        if (!v.amount) return
        update((d) => { d.credits.find((x) => x.id === id)!.extras.push({ id: uid(), date: v.date || today(), amount: v.amount }) })
        logPayment(v.date || today(), `Extra payment · ${c.name}`, v.amount, c.currency)
        const s = creditStatus({ ...c, extras: [...c.extras, { id: 'x', date: v.date, amount: v.amount }] })
        toast(s.left.length ? `Now ends ${monthYear(s.endsOn)}` : 'That pays it off!')
      }}
    />
  )
}

const CloseSheet = ({ id }: { id: string }) => {
  const st = useSt()
  const c = st.credits.find((x) => x.id === id)!
  const s = creditStatus(c)
  return (
    <FormSheet title="Close it now" initial={{ date: today(), amount: s.remaining }} saveLabel="Close the credit"
      fields={[{ key: 'amount', label: `Paid to close it (${CUR_SIGN[c.currency ?? 'PLN']}) — check the bank’s figure, early repayment is often less`, type: 'number' }, { key: 'date', label: 'Date', type: 'date' }]}
      onSave={(v) => {
        const date = v.date || today()
        update((d) => { d.credits.find((x) => x.id === id)!.closedOn = date })
        if (v.amount) logPayment(date, `Closing payment · ${c.name}`, v.amount, c.currency)
        toast('Paid off. Well done!')
      }}
    />
  )
}

const CreditEdit = ({ id }: { id?: string }) => {
  const st = useSt()
  const c = st.credits?.find((x) => x.id === id)
  return (
    <FormSheet title={c ? 'Edit credit' : 'New credit'} initial={c ?? { takenOn: today(), count: 12, currency: 'PLN' }}
      fields={[
        { key: 'name', label: 'Name (lender / what for)', type: 'text', placeholder: 'Phone, bank X…' },
        { key: 'takenOn', label: 'Taken on', type: 'date' },
        { key: 'currency', label: 'Currency', type: 'select', options: CURRENCIES },
        { key: 'borrowed', label: 'Amount borrowed (optional)', type: 'number' },
        { key: 'installment', label: 'Monthly payment', type: 'number' },
        { key: 'count', label: 'Number of payments', type: 'number', step: 1 },
        { key: 'firstPayment', label: 'First payment date (then the same day every month)', type: 'date' },
        { key: 'lastAmount', label: 'Last payment, if different (optional)', type: 'number' },
        { key: 'note', label: 'Note (contract no., account…)', type: 'text' }
      ]}
      onSave={(v) => {
        if (!v.installment || !v.count || !v.firstPayment) { toast('Monthly payment, number of payments and first date are needed'); return }
        update((d) => {
          d.credits ??= []
          const data: Omit<Credit, 'id' | 'extras'> = { name: v.name, currency: (v.currency ?? 'PLN') as Currency, takenOn: v.takenOn || today(), borrowed: v.borrowed, installment: v.installment, count: Math.round(v.count), firstPayment: v.firstPayment, lastAmount: v.lastAmount, note: v.note }
          if (c) Object.assign(d.credits.find((x) => x.id === c.id)!, data)
          else d.credits.push({ id: uid(), extras: [], ...data })
        })
      }}
      onDelete={c ? () => { update((d) => { d.credits = d.credits.filter((x) => x.id !== c.id) }); closeSheet() } : undefined}
    />
  )
}
