import { update, useSt } from '../store'
import type { Currency } from '../types'
import { diffDays, fmt, fmtBoth, fmtDay, nextSubDate, toPln, today, uid } from '../lib'
import { C, List, openSheet, Row } from '../ui'
import { FormSheet } from '../form'

export const CURRENCIES: [Currency, string][] = [['PLN', 'zł'], ['EUR', '€'], ['UAH', '₴']]
export const ord = (n: number) => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th')

export const Subscriptions = () => {
  const st = useSt()
  const t = today()
  const subs = (st.subscriptions ?? []).map((x) => ({ x, next: nextSubDate(x) })).sort((a, b) => a.next.localeCompare(b.next))
  const active = subs.filter(({ x }) => !x.paused)
  const monthly = active.reduce((a, { x }) => a + toPln(st.settings, x.amount, x.currency), 0)
  const split = st.settings.splitDay
  const firstHalf = active.filter(({ x }) => x.day < split).reduce((a, { x }) => a + toPln(st.settings, x.amount, x.currency), 0)
  return (
    <>
      {active.length > 0 && (
        <div className="card money" style={{ gap: 6 }}>
          <span className="t15 w5">Every month · {active.length} subscriptions</span>
          <span className="big" style={{ fontSize: 52 }}>{fmt(monthly)}</span>
          <span className="t14">{fmt(firstHalf)} in the 1st fortnight · {fmt(monthly - firstHalf)} in the 2nd · already in your budget</span>
        </div>
      )}
      <List title="Subscriptions" right="next charge" empty="Add what you pay for monthly.">
        {subs.map(({ x, next }) => {
          const n = diffDays(t, next)
          return (
            <Row key={x.id} dot={x.paused ? C.line : n <= 2 ? C.alert : C.money} done={x.paused} title={x.name}
              meta={x.paused ? 'Paused' : `${ord(x.day)} of the month · ${n === 0 ? 'today' : n === 1 ? 'tomorrow' : fmtDay(next)}`}
              trail={<span style={{ textAlign: 'right' }}>{fmtBoth(st.settings, x.amount, x.currency)}</span>} onClick={() => openSheet(<SubEdit id={x.id} />)} />
          )
        })}
      </List>
      <button className="btn full soft" onClick={() => openSheet(<SubEdit />)}>+ Add a subscription</button>
      <div className="t13 muted" style={{ padding: '0 4px' }}>€ and ₴ are converted with today’s rate (Settings → Exchange rates).</div>
    </>
  )
}

const SubEdit = ({ id }: { id?: string }) => {
  const st = useSt()
  const x = st.subscriptions?.find((y) => y.id === id)
  return (
    <FormSheet title={x ? x.name : 'New subscription'} initial={x ?? { currency: 'PLN', day: 1 }}
      fields={[
        { key: 'name', label: 'Name', type: 'text', placeholder: 'Spotify' },
        { key: 'amount', label: 'Amount', type: 'number' },
        { key: 'currency', label: 'Currency', type: 'select', options: CURRENCIES },
        { key: 'day', label: 'Charged on day of the month', type: 'number', step: 1 },
        ...(x ? ([{ key: 'paused', label: 'Paused', type: 'toggle' }] as const) : [])
      ]}
      onSave={(v) => update((d) => {
        d.subscriptions ??= []
        const data = { name: v.name, amount: v.amount ?? 0, currency: (v.currency ?? 'PLN') as Currency, day: Math.min(31, Math.max(1, Math.round(v.day ?? 1))), paused: !!v.paused }
        if (x) Object.assign(d.subscriptions.find((y) => y.id === x.id)!, data)
        else d.subscriptions.push({ id: uid(), ...data })
      })}
      onDelete={x ? () => update((d) => { d.subscriptions = d.subscriptions.filter((y) => y.id !== x.id) }) : undefined}
    />
  )
}
