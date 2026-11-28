import { useState } from 'react'
import { update, useSt, useStore } from '../store'
import type { Currency, SavingsAccount, SavingsMove } from '../types'
import { conv, curOptions, curSign, fitSize, fmt, fmtCur, fmtDay, parseNum, periodOf, r2, toMain, today, uid } from '../lib'
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
      {(st.savings ?? []).length > 1 && <button className="btn full soft" onClick={() => pushSheet(<MoveBetween id={a.id} />)}>{tr('Move to another account')}</button>}
      <List title="History" empty="Nothing added yet.">
        {shown.map((m) => <MoveRow key={m.id} a={a} m={m} />)}
        {!all && moves.length > 8 && <Row title={<span className="muted">{tr('Show all')}</span>} onClick={() => setAll(true)} />}
      </List>
      <button className="btn full soft" onClick={() => pushSheet(<AccountEdit id={a.id} back />)}>{tr('Edit account')}</button>
    </Sheet>
  )
}

const MoveRow = ({ a, m }: { a: SavingsAccount; m: SavingsMove }) => {
  const st = useSt()
  const other = m.link ? (st.savings ?? []).find((x) => x.id === m.link!.acc)?.name : undefined
  const meta = [yearDay(m.date), other ? tr(m.amount < 0 ? 'to {x}' : 'from {x}', { x: other }) : '', m.budget ? tr(m.budget > 0 ? 'from the budget' : 'back to the budget') : '', m.note ?? ''].filter(Boolean).join(' · ')
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

// move money from one account to another: two linked moves, converted at the rate of the date when currencies differ
const MoveBetween = ({ id }: { id: string }) => {
  const st = useStore.getState().st
  const accs = st.savings ?? []
  const a = accs.find((x) => x.id === id)!
  const others = accs.filter((x) => x.id !== id)
  return (
    <FormSheet title="Move to another account" initial={{ to: others[0]?.id, date: today() }} saveLabel="Move" onBack={() => popSheet()} full={false}
      fields={[
        { key: 'to', label: 'To account', type: 'select', options: others.map((x) => [x.id, x.name] as [string, string]) },
        { key: 'amount', label: tr('Amount ({x})', { x: curSign(a.currency) }), type: 'number' },
        { key: 'date', label: 'Date', type: 'date' },
        { key: 'note', label: 'Note (optional)', type: 'text' }
      ]}
      extra={(v) => {
        const b = others.find((x) => x.id === v.to)
        const n = parseNum(v.amount)
        if (!b || !n || b.currency === a.currency) return null
        return <span className="t14 muted">{tr('Arrives as {x}', { x: fmtCur(r2(conv(st.settings, Math.abs(n), a.currency, b.currency, v.date || today())), b.currency) })}</span>
      }}
      onSave={(v) => {
        const b = others.find((x) => x.id === v.to)
        if (!v.amount || !b) return
        const date = v.date || today()
        const n = Math.abs(v.amount)
        const note = v.note?.trim() || undefined
        update((d) => {
          const from = (d.savings ?? []).find((x) => x.id === a.id)
          const to = (d.savings ?? []).find((x) => x.id === b.id)
          if (!from || !to) return
          const m1 = uid(), m2 = uid()
          from.moves.push({ id: m1, date, amount: -n, note, link: { acc: to.id, move: m2 } })
          to.moves.push({ id: m2, date, amount: r2(conv(d.settings, n, from.currency, to.currency, date)), note, link: { acc: from.id, move: m1 } })
        })
        toast(tr('Moved to {x}', { x: b.name }))
      }}
    />
  )
}

const MoveEdit = ({ acc, id }: { acc: string; id: string }) => {
  const a = (useStore.getState().st.savings ?? []).find((x) => x.id === acc)
  const m = a?.moves.find((x) => x.id === id)
  if (!a || !m) return null
  return (
    <FormSheet title="Edit" initial={{ amount: Math.abs(m.amount), date: m.date, note: m.note, budget: !!m.budget }} onBack={() => popSheet()} full={false} twoTap
      fields={[
        { key: 'amount', label: tr('Amount ({x})', { x: curSign(a.currency) }), type: 'number' },
        { key: 'date', label: 'Date', type: 'date' },
        { key: 'budget', label: m.amount < 0 ? 'Put it back into that fortnight’s budget' : 'Take it from that fortnight’s budget', type: 'toggle', hide: () => !!m.link },
        { key: 'note', label: 'Note (optional)', type: 'text' }
      ]}
      onSave={(v) => {
        if (!v.amount) return
        update((d) => {
          const acc0 = (d.savings ?? []).find((y) => y.id === acc)
          const x = acc0?.moves.find((y) => y.id === id)
          if (!acc0 || !x) return
          const n = Math.sign(x.amount || 1) * Math.abs(v.amount)
          const date = v.date || x.date
          // the budget switch: on = this move also leaves / goes back into the fortnight's budget of its date
          if (!v.budget) { delete x.budget; delete x.budgetCur }
          else if (x.budget && x.amount && date === x.date) x.budget = r2((x.budget * n) / x.amount)
          else { const main = d.settings.mainCur; x.budget = r2(conv(d.settings, n, acc0.currency, main, date)); x.budgetCur = main }
          x.amount = n
          x.date = date
          x.note = v.note?.trim() || undefined
          // a move between accounts: the other side follows (amount converted at the date's rate)
          const pa = x.link && (d.savings ?? []).find((y) => y.id === x.link!.acc)
          const p = pa && pa.moves.find((y) => y.id === x.link!.move)
          if (pa && p) { p.amount = r2(-Math.sign(n) * conv(d.settings, Math.abs(n), acc0.currency, pa.currency, date)); p.date = date; p.note = x.note }
        })
      }}
      onDelete={() => update((d) => {
        const y = (d.savings ?? []).find((z) => z.id === acc)
        if (y) y.moves = y.moves.filter((z) => z.id !== id)
        // deleting one side of a move between accounts deletes the other side too
        if (m.link) { const o = (d.savings ?? []).find((z) => z.id === m.link!.acc); if (o) o.moves = o.moves.filter((z) => z.id !== m.link!.move) }
      })}
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
      // changing the currency of an account with money in it converts its amounts (and goal) at today's rate — second tap
      confirmSave={(v) => (a && v.currency && v.currency !== a.currency && a.moves.length ? tr('Tap again to convert amounts to {c}', { c: v.currency }) : undefined)}
      onSave={(v) => {
        const data = { name: String(v.name).trim(), currency: v.currency ?? s.settings.mainCur, goal: v.goal || undefined, note: v.note?.trim() || undefined }
        update((d) => {
          d.savings ??= []
          const x = d.savings.find((y) => y.id === id)
          if (x && x.currency !== data.currency) {
            for (const m of x.moves) m.amount = r2(conv(d.settings, m.amount, x.currency, data.currency))
            // a goal left as it was is converted too; a goal typed anew is kept as typed
            if (data.goal && a && data.goal === a.goal) data.goal = r2(conv(d.settings, data.goal, x.currency, data.currency))
          }
          if (x) Object.assign(x, data)
          else d.savings.push({ id: uid(), ...data, moves: [] })
        })
      }}
      onDelete={a ? () => { gone = true; update((d) => {
        d.savings = (d.savings ?? []).filter((y) => y.id !== id)
        for (const y of d.savings) for (const z of y.moves) if (z.link?.acc === id) delete z.link // moves from/to a deleted account stay, unlinked
      }) } : undefined}
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
