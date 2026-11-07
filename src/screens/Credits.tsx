import { useState } from 'react'
import { ensurePeriod, update, useSt, useStore } from '../store'
import type { Credit, Currency } from '../types'
import { fitSize, curOptions, CUR_SIGN, creditStatus, diffDays, fmt, fmtBoth, fmtCur, fmtDay, monthName, periodOf, toMain, today, uid } from '../lib'
import { C, closeSheet, List, openSheet, Row, Sheet, toast } from '../ui'
import { FormSheet } from '../form'
import { tr, trn } from '../i18n'

const monthYear = (d?: string) => (d ? `${monthName(d.slice(0, 7))} ${d.slice(0, 4)}` : '—')

// an extra or closing payment is real money leaving this half: log it in the budget
const logPayment = (date: string, label: string, amount: number, cur?: Currency) =>
  update((d) => { ensurePeriod(d, periodOf(date, d.settings).key).items.push({ id: uid(), kind: 'expense', label, amount, currency: cur ?? d.settings.mainCur, date, oneOff: true }) })

export const Credits = () => {
  const st = useSt()
  const t = today()
  const all = (st.credits ?? []).map((c) => ({ c, s: creditStatus(c) }))
  const open = all.filter((x) => !x.s.closed).sort((a, b) => (a.s.next?.date ?? '').localeCompare(b.s.next?.date ?? ''))
  const closed = all.filter((x) => x.s.closed)
  const pl = (c: Credit, n: number) => toMain(st.settings, n, c.currency)
  const remaining = open.reduce((a, x) => a + pl(x.c, x.s.remaining), 0)
  const mk = t.slice(0, 7)
  const thisMonth = open.reduce((a, x) => a + pl(x.c, x.s.left.filter((p) => p.date.startsWith(mk)).reduce((b, p) => b + p.amount, 0)), 0)
  const lastEnd = open.map((x) => x.s.endsOn ?? '').sort().pop()
  return (
    <>
      {open.length > 0 && (
        <div className="card dark" style={{ gap: 6 }}>
          <span className="t15 w5">{tr('Still to repay')} · {trn(open.length, '{n} credit', '{n} credits')}</span>
          <span className="big" style={{ fontSize: fitSize(fmt(remaining), 49.5, 9) }}>{fmt(remaining)}</span>
          <span className="t15">{tr('{a} left to pay this month · all clear by {d}', { a: fmt(thisMonth), d: monthYear(lastEnd) })}</span>
        </div>
      )}
      <List title="Credits" empty="No credits — nice.">
        {open.map(({ c, s }) => {
          const n = s.next ? diffDays(t, s.next.date) : 0
          return (
            <Row key={c.id} dot={n <= 2 ? C.alert : C.money} title={c.name}
              meta={`${tr('Next {d}', { d: s.next ? (n === 0 ? tr('today') : n === 1 ? tr('tomorrow') : fmtDay(s.next.date)) : '—' })} · ${fmtCur(s.next?.amount ?? 0, c.currency)} · ${tr('{n} left', { n: s.left.length })}`}
              trail={(c.currency ?? st.settings.mainCur) === st.settings.mainCur ? fmt(s.remaining) : <span style={{ textAlign: 'right', display: 'block' }}>{fmtCur(s.remaining, c.currency, false)}<br /><span className="t13 muted">{fmt(pl(c, s.remaining))}</span></span>} onClick={() => openSheet(<CreditSheet id={c.id} />)} />
          )
        })}
      </List>
      <button className="btn full soft" onClick={() => openSheet(<CreditEdit />)}>{tr('+ Add a credit')}</button>
      {closed.length > 0 && (
        <List title="Paid off" right={String(closed.length)}>
          {closed.map(({ c }) => <Row key={c.id} done title={c.name} meta={c.closedOn ? tr('Closed early {d}', { d: fmtDay(c.closedOn) }) : tr('All payments done')} onClick={() => openSheet(<CreditSheet id={c.id} />)} />)}
        </List>
      )}
      <div className="t13 muted" style={{ padding: '0 4px' }}>{tr('Each payment shows up in the Budget’s fixed list for its fortnight, until the credit is paid off.')}</div>
    </>
  )
}

const CreditSheet = ({ id }: { id: string }) => {
  const st = useSt()
  const c = st.credits.find((x) => x.id === id)
  const [all, setAll] = useState(false)
  if (!c) return null
  const s = creditStatus(c)
  const cur = c.currency ?? st.settings.mainCur
  const paidPct = s.total > 0 ? Math.min(1, 1 - s.remaining / s.total) : 1
  const shown = all ? s.left : s.left.slice(0, 4)
  return (
    <Sheet title={c.name}>
      <div className="card money" style={{ gap: 8 }}>
        <div className="between" style={{ alignItems: 'flex-end' }}>
          <div className="col"><span className="t14 w5">{tr('Left to repay')}</span><span className="mid">{fmtCur(s.remaining, cur)}</span>{cur !== st.settings.mainCur && <span className="t14">{fmt(toMain(st.settings, s.remaining, cur))}</span>}</div>
          <div className="col" style={{ alignItems: 'flex-end' }}><span className="t14 w5">{s.closed ? tr('Done') : tr('Ends')}</span><span className="t17">{s.closed ? '✓' : monthYear(s.endsOn)}</span></div>
        </div>
        <div className="bar"><div style={{ width: `${paidPct * 100}%` }} /></div>
        <span className="t14">{tr('{n} of {m} payments left · {x} a month', { n: s.left.length, m: c.count, x: fmtBoth(st.settings, c.installment, cur) })}</span>
      </div>
      <div className="t14 muted">
        {tr('Taken {d}', { d: fmtDay(c.takenOn) + ' ' + c.takenOn.slice(0, 4) })}{c.borrowed ? ' · ' + tr('borrowed {a} · repaying {b} in total', { a: fmtCur(c.borrowed, cur), b: fmtCur(s.total, cur) }) : ''}
        {c.extras.length ? ' · ' + tr('extra paid {x}', { x: fmtCur(c.extras.reduce((a, x) => a + x.amount, 0), cur) }) : ''}
        {c.note ? <><br />{c.note}</> : null}
      </div>
      {!s.closed && (
        <>
          <List title="Coming payments" right={`${s.left.length}`}>
            {shown.map((p) => <Row key={p.n} dot={C.money} title={fmtDay(p.date) + ' ' + p.date.slice(0, 4)} meta={`${tr('Payment {n} of {m}', { n: p.n, m: c.count })}${p.amount < c.installment - 0.004 && p.n !== c.count ? ' · ' + tr('partly covered by extra') : ''}`} trail={fmtCur(p.amount, cur)} />)}
            {!all && s.left.length > 4 && <Row title={<span className="muted">{tr('Show all')}</span>} onClick={() => setAll(true)} />}
          </List>
          <div className="btn2">
            <button className="btn" onClick={() => openSheet(<ExtraSheet id={c.id} />)}>{tr('Extra payment')}</button>
            <button className="btn ghost" onClick={() => openSheet(<CloseSheet id={c.id} />)}>{tr('Close it now')}</button>
          </div>
        </>
      )}
      {c.extras.length > 0 && (
        <List title="Extra payments">
          {c.extras.map((x) => <Row key={x.id} title={fmtCur(x.amount, cur)} meta={fmtDay(x.date) + ' ' + x.date.slice(0, 4)} trail={<span className="t14 muted">{tr('remove')}</span>} onClick={() => update((d) => { const cc = d.credits.find((y) => y.id === c.id)!; cc.extras = cc.extras.filter((y) => y.id !== x.id) })} />)}
        </List>
      )}
      {c.closedOn && <button className="btn full soft" onClick={() => update((d) => { delete d.credits.find((y) => y.id === c.id)!.closedOn })}>{tr('Reopen (undo closing)')}</button>}
      <button className="btn full soft" onClick={() => openSheet(<CreditEdit id={c.id} />)}>{tr('Edit details')}</button>
    </Sheet>
  )
}

const ExtraSheet = ({ id }: { id: string }) => {
  const st = useSt()
  const c = st.credits.find((x) => x.id === id)!
  return (
    <FormSheet title="Extra payment" initial={{ date: today() }} saveLabel="Add extra payment"
      fields={[{ key: 'amount', label: tr('Amount ({x})', { x: CUR_SIGN[c.currency ?? useStore.getState().st.settings.mainCur] }), type: 'number' }, { key: 'date', label: 'Date', type: 'date' }]}
      extra={<span className="t14 muted">{tr('Your bank takes it off the end, so the last payments shrink or disappear. It’s also added to that fortnight’s spending.')}</span>}
      onSave={(v) => {
        if (!v.amount) return
        update((d) => { d.credits.find((x) => x.id === id)!.extras.push({ id: uid(), date: v.date || today(), amount: v.amount }) })
        logPayment(v.date || today(), `${tr('Extra payment')} · ${c.name}`, v.amount, c.currency)
        const s = creditStatus({ ...c, extras: [...c.extras, { id: 'x', date: v.date, amount: v.amount }] })
        toast(s.left.length ? tr('Now ends {d}', { d: monthYear(s.endsOn) }) : 'That pays it off!')
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
      fields={[{ key: 'amount', label: tr('Paid to close it ({x}) — check the bank’s figure, early repayment is often less', { x: CUR_SIGN[c.currency ?? useStore.getState().st.settings.mainCur] }), type: 'number' }, { key: 'date', label: 'Date', type: 'date' }]}
      onSave={(v) => {
        const date = v.date || today()
        update((d) => { d.credits.find((x) => x.id === id)!.closedOn = date })
        if (v.amount) logPayment(date, `${tr('Closing payment')} · ${c.name}`, v.amount, c.currency)
        toast('Paid off. Well done!')
      }}
    />
  )
}

const CreditEdit = ({ id }: { id?: string }) => {
  const st = useSt()
  const c = st.credits?.find((x) => x.id === id)
  return (
    <FormSheet title={c ? 'Edit credit' : 'New credit'} initial={c ?? { takenOn: today(), count: 12, currency: useStore.getState().st.settings.mainCur }}
      fields={[
        { key: 'name', label: 'Name (lender / what for)', type: 'text', placeholder: 'Phone, bank X…' },
        { key: 'takenOn', label: 'Taken on', type: 'date' },
        { key: 'currency', label: 'Currency', type: 'select', options: curOptions(useStore.getState().st.settings, c?.currency) },
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
          const data: Omit<Credit, 'id' | 'extras'> = { name: v.name, currency: v.currency ?? useStore.getState().st.settings.mainCur, takenOn: v.takenOn || today(), borrowed: v.borrowed, installment: v.installment, count: Math.round(v.count), firstPayment: v.firstPayment, lastAmount: v.lastAmount, note: v.note }
          if (c) Object.assign(d.credits.find((x) => x.id === c.id)!, data)
          else d.credits.push({ id: uid(), extras: [], ...data })
        })
      }}
      onDelete={c ? () => { update((d) => { d.credits = d.credits.filter((x) => x.id !== c.id) }); closeSheet() } : undefined}
    />
  )
}
