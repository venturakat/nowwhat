import { useState } from 'react'
import { update, useSt, useStore } from '../store'
import type { Currency, SavingsAccount, SavingsMove } from '../types'
import { conv, curOptions, curSign, fitSize, fmt, fmtCur, fmtDay, periodOf, r2, toMain, today, uid } from '../lib'
import { closeSheet, List, openSheet, popSheet, pushSheet, Row, Sheet, toast } from '../ui'
import { FormSheet } from '../form'
import { tr } from '../i18n'

// Money › Savings: accounts in their own currency. Money moved in from a fortnight's budget
// (Budget › Move to savings, or the "From the budget" switch) no longer counts in that fortnight's Left.
export const accTotal = (a: SavingsAccount) => r2(a.moves.reduce((x, m) => x + m.amount, 0))
const yearDay = (d: string) => fmtDay(d) + (d.slice(0, 4) === today().slice(0, 4) ? '' : ' ' + d.slice(0, 4))

// account amount, with the main-currency value under it when it's another currency
const Amount = ({ n, cur, size, fit }: { n: number; cur: Currency; size: number; fit: number }) => {
  const st = useSt()
  const s = fmtCur(n, cur)
  return (
    <div className="col">
      <span className="mid" style={{ fontSize: fitSize(s, size, fit) }}>{s}</span>
      {cur !== st.settings.mainCur && <span className="t14">{fmt(toMain(st.settings, n, cur))}</span>}
    </div>
  )
}

const Goal = ({ a }: { a: SavingsAccount }) => {
  if (!a.goal) return null
  const t = accTotal(a)
  return (
    <>
      <div className="bar"><div style={{ width: `${Math.max(0, Math.min(1, t / a.goal)) * 100}%` }} /></div>
      <span className="t14">{t >= a.goal ? tr('Goal reached: {g}', { g: fmtCur(a.goal, a.currency) }) : tr('{a} to go · goal {g}', { a: fmtCur(a.goal - t, a.currency), g: fmtCur(a.goal, a.currency) })}</span>
    </>
  )
}

export const Savings = () => {
  const st = useSt()
  const accs = st.savings ?? []
  const total = accs.reduce((x, a) => x + toMain(st.settings, accTotal(a), a.currency), 0)
  return (
    <>
      {accs.length > 1 && (
        <div className="card dark" style={{ gap: 6 }}>
          <span className="t15 w5">{tr('Saved in total')}</span>
          <span className="big" style={{ fontSize: fitSize(fmt(total), 49.5, 9) }}>{fmt(total)}</span>
        </div>
      )}
      {accs.map((a) => (
        <div key={a.id} className="card money" style={{ gap: 8 }}>
          <button className="col" style={{ gap: 4, textAlign: 'left', alignItems: 'stretch' }} onClick={() => openSheet(<AccountSheet id={a.id} />)}>
            <span className="t15 w5">{a.name}</span>
            <Amount n={accTotal(a)} cur={a.currency} size={26.5} fit={12} />
          </button>
          <Goal a={a} />
          <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => openSheet(<AddMoney id={a.id} />)}>{tr('Add money to account')}</button>
        </div>
      ))}
      {!accs.length && <List empty="No savings accounts yet." />}
      <button className="btn full soft" onClick={() => openSheet(<AccountEdit />)}>{tr('+ Add savings account')}</button>
      <div className="t13 muted" style={{ padding: '0 4px' }}>{tr('Money moved here from the Budget no longer counts in that fortnight’s Left.')}</div>
    </>
  )
}

export const AccountSheet = ({ id }: { id: string }) => {
  const st = useSt()
  const [all, setAll] = useState(false)
  const a = (st.savings ?? []).find((x) => x.id === id)
  if (!a) return null
  const moves = [...a.moves].sort((x, y) => y.date.localeCompare(x.date))
  const shown = all ? moves : moves.slice(0, 8)
  return (
    <Sheet title={a.name}>
      <div className="card money" style={{ gap: 8 }}>
        <span className="t14 w5">{tr('In the account')}</span>
        <Amount n={accTotal(a)} cur={a.currency} size={26.5} fit={12} />
        <Goal a={a} />
      </div>
      {a.note && <div className="t14 muted">{a.note}</div>}
      <div className="btn2">
        <button className="btn" onClick={() => pushSheet(<AddMoney id={a.id} back />)}>{tr('Add money')}</button>
        <button className="btn ghost" onClick={() => pushSheet(<AddMoney id={a.id} out back />)}>{tr('Take money out')}</button>
      </div>
      <List title="History" empty="Nothing added yet.">
        {shown.map((m) => <MoveRow key={m.id} a={a} m={m} />)}
        {!all && moves.length > 8 && <Row title={<span className="muted">{tr('Show all')}</span>} onClick={() => setAll(true)} />}
      </List>
      <button className="btn full soft" onClick={() => pushSheet(<AccountEdit id={a.id} back />)}>{tr('Edit account')}</button>
    </Sheet>
  )
}

const MoveRow = ({ a, m }: { a: SavingsAccount; m: SavingsMove }) => {
  const meta = [yearDay(m.date), m.budget ? tr(m.budget > 0 ? 'from the budget' : 'back to the budget') : '', m.note ?? ''].filter(Boolean).join(' · ')
  return <Row title={(m.amount < 0 ? '−' : '+') + fmtCur(Math.abs(m.amount), a.currency)} meta={meta} onClick={() => pushSheet(<MoveEdit acc={a.id} id={m.id} />)} />
}

// add money (or take it out); the switch also takes it from / gives it back to the fortnight's budget of that date
const AddMoney = ({ id, out, back }: { id: string; out?: boolean; back?: boolean }) => {
  const a = (useStore.getState().st.savings ?? []).find((x) => x.id === id)!
  return (
    <FormSheet title={out ? 'Take money out' : 'Add money to account'} initial={{ date: today() }} saveLabel={out ? 'Take out' : 'Add'}
      onBack={back ? () => popSheet() : undefined} full={false}
      fields={[
        { key: 'amount', label: tr('Amount ({x})', { x: curSign(a.currency) }), type: 'number' },
        { key: 'date', label: 'Date', type: 'date' },
        { key: 'budget', label: out ? 'Put it back into that fortnight’s budget' : 'Take it from that fortnight’s budget', type: 'toggle' },
        { key: 'note', label: 'Note (optional)', type: 'text' }
      ]}
      onSave={(v) => {
        if (!v.amount) return
        const date = v.date || today()
        const n = out ? -Math.abs(v.amount) : Math.abs(v.amount)
        update((d) => {
          const acc = (d.savings ?? []).find((x) => x.id === id)
          if (!acc) return
          const main = d.settings.mainCur
          acc.moves.push({ id: uid(), date, amount: n, note: v.note?.trim() || undefined, ...(v.budget ? { budget: r2(conv(d.settings, n, acc.currency, main, date)), budgetCur: main } : {}) })
        })
        toast(out ? 'Taken out' : 'Added')
      }}
    />
  )
}

const MoveEdit = ({ acc, id }: { acc: string; id: string }) => {
  const a = (useStore.getState().st.savings ?? []).find((x) => x.id === acc)
  const m = a?.moves.find((x) => x.id === id)
  if (!a || !m) return null
  return (
    <FormSheet title="Edit" initial={{ amount: Math.abs(m.amount), date: m.date, note: m.note }} onBack={() => popSheet()} full={false} twoTap
      fields={[
        { key: 'amount', label: tr('Amount ({x})', { x: curSign(a.currency) }), type: 'number' },
        { key: 'date', label: 'Date', type: 'date' },
        { key: 'note', label: 'Note (optional)', type: 'text' }
      ]}
      extra={m.budget ? <span className="t14 muted">{tr(m.budget > 0 ? 'Taken from the budget of that fortnight.' : 'Given back to the budget of that fortnight.')}</span> : undefined}
      onSave={(v) => {
        if (!v.amount) return
        update((d) => {
          const x = (d.savings ?? []).find((y) => y.id === acc)?.moves.find((y) => y.id === id)
          if (!x) return
          const n = Math.sign(x.amount || 1) * Math.abs(v.amount)
          if (x.budget && x.amount) x.budget = r2((x.budget * n) / x.amount)
          x.amount = n
          x.date = v.date || x.date
          x.note = v.note?.trim() || undefined
        })
      }}
      onDelete={() => update((d) => { const y = (d.savings ?? []).find((z) => z.id === acc); if (y) y.moves = y.moves.filter((z) => z.id !== id) })}
    />
  )
}

export const AccountEdit = ({ id, back }: { id?: string; back?: boolean }) => {
  const s = useStore.getState().st
  const a = (s.savings ?? []).find((x) => x.id === id)
  let gone = false
  return (
    <FormSheet title={a ? 'Edit account' : 'New savings account'} initial={a ?? { currency: s.settings.mainCur }} twoTap
      onBack={back ? () => (gone ? closeSheet() : popSheet()) : undefined} full={false}
      fields={[
        { key: 'name', label: 'Name', type: 'text', placeholder: tr('Holiday, rainy day…') },
        { key: 'currency', label: 'Currency', type: 'select', options: curOptions(s.settings, a?.currency) },
        { key: 'goal', label: 'Goal (optional)', type: 'number' },
        { key: 'note', label: 'Note (optional)', type: 'text' }
      ]}
      onSave={(v) => {
        const data = { name: String(v.name).trim(), currency: v.currency ?? s.settings.mainCur, goal: v.goal || undefined, note: v.note?.trim() || undefined }
        update((d) => {
          d.savings ??= []
          const x = d.savings.find((y) => y.id === id)
          if (x) Object.assign(x, data)
          else d.savings.push({ id: uid(), ...data, moves: [] })
        })
      }}
      onDelete={a ? () => { gone = true; update((d) => { d.savings = (d.savings ?? []).filter((y) => y.id !== id) }) } : undefined}
    />
  )
}

// Budget › Left this fortnight › Move to savings: an amount in the main currency leaves the budget for an account
export const MoveToSavings = ({ date, left }: { date: string; left: number }) => {
  const st = useSt()
  const accs = st.savings ?? []
  const main = st.settings.mainCur
  if (!accs.length) return (
    <Sheet title="Move to savings">
      <div className="t15">{tr('Add a savings account first, then pick it here.')}</div>
      <button className="btn full" onClick={() => pushSheet(<AccountEdit back />)}>{tr('+ Add savings account')}</button>
    </Sheet>
  )
  return (
    <FormSheet key={accs.length} title="Move to savings" initial={{ acc: accs[accs.length - 1].id }} saveLabel="Move"
      fields={[
        { key: 'acc', label: 'To account', type: 'select', options: accs.map((a) => [a.id, a.name] as [string, string]) },
        { key: 'amount', label: tr('Amount ({x})', { x: curSign(main) }), type: 'number' }
      ]}
      extra={<span className="t14 muted">{tr('Left this fortnight: {a}. Once moved, the money no longer counts in the budget.', { a: fmt(left) })}</span>}
      onSave={(v) => {
        const a = accs.find((x) => x.id === v.acc)
        if (!v.amount || !a) return
        update((d) => {
          const acc = (d.savings ?? []).find((x) => x.id === a.id)
          if (acc) acc.moves.push({ id: uid(), date, amount: r2(conv(d.settings, v.amount, main, acc.currency, date)), budget: v.amount, budgetCur: main })
        })
        toast(tr('Moved to {x}', { x: a.name }))
      }}
    />
  )
}
