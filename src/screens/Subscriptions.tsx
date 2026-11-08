import { update, useSt } from '../store'
import { fitSize, curOptions, diffDays, fmt, fmtBoth, fmtDay, nextSubDate, toMain, today, uid } from '../lib'
import { C, List, openSheet, Row } from '../ui'
import { FormSheet } from '../form'
import { getLang, tr, trn } from '../i18n'

// '5th' (Ukrainian: '5-го', used as '5-го числа')
export const ord = (n: number) => getLang() === 'es' ? String(n) : getLang() !== 'en' ? `${n}-го` : n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th')

export const Subscriptions = () => {
  const st = useSt()
  const t = today()
  const subs = (st.subscriptions ?? []).map((x) => ({ x, next: nextSubDate(x) })).sort((a, b) => a.next.localeCompare(b.next))
  const active = subs.filter(({ x }) => !x.paused)
  const monthly = active.reduce((a, { x }) => a + toMain(st.settings, x.amount, x.currency), 0)
  const split = st.settings.splitDay
  const firstHalf = active.filter(({ x }) => x.day < split).reduce((a, { x }) => a + toMain(st.settings, x.amount, x.currency), 0)
  return (
    <>
      {active.length > 0 && (
        <div className="card money" style={{ gap: 6 }}>
          <span className="t15 w5">{tr('Every month')} · {trn(active.length, '{n} subscription', '{n} subscriptions')}</span>
          <span className="big" style={{ fontSize: fitSize(fmt(monthly), 46, 10) }}>{fmt(monthly)}</span>
          <span className="t14">{tr('{a} in the 1st fortnight · {b} in the 2nd · already in your budget', { a: fmt(firstHalf), b: fmt(monthly - firstHalf) })}</span>
        </div>
      )}
      <List title="Subscriptions" right="next charge" empty="Add what you pay for monthly.">
        {subs.map(({ x, next }) => {
          const n = diffDays(t, next)
          return (
            <Row key={x.id} dot={x.paused ? C.line : n <= 2 ? C.alert : C.money} done={x.paused} title={x.name}
              meta={x.paused ? tr('Paused') : `${tr('{d} of the month', { d: ord(x.day) })} · ${n === 0 ? tr('today') : n === 1 ? tr('tomorrow') : fmtDay(next)}`}
              trail={<span style={{ textAlign: 'right' }}>{fmtBoth(st.settings, x.amount, x.currency)}</span>} onClick={() => openSheet(<SubEdit id={x.id} />)} />
          )
        })}
      </List>
      <button className="btn full soft" onClick={() => openSheet(<SubEdit />)}>{tr('+ Add a subscription')}</button>
      <div className="t13 muted" style={{ padding: '0 4px' }}>{tr('Other currencies are converted with today’s rate (Settings › Currencies).')}</div>
    </>
  )
}

const SubEdit = ({ id }: { id?: string }) => {
  const st = useSt()
  const x = st.subscriptions?.find((y) => y.id === id)
  return (
    <FormSheet title={x ? x.name : 'New subscription'} initial={x ?? { currency: st.settings.mainCur, day: 1 }}
      fields={[
        { key: 'name', label: 'Name', type: 'text', placeholder: 'Spotify' },
        { key: 'amount', label: 'Amount', type: 'number' },
        { key: 'currency', label: 'Currency', type: 'select', options: curOptions(st.settings, x?.currency) },
        { key: 'day', label: 'Charged on day of the month', type: 'number', step: 1 },
        ...(x ? ([{ key: 'paused', label: 'Paused', type: 'toggle' }] as const) : [])
      ]}
      onSave={(v) => update((d) => {
        d.subscriptions ??= []
        const data = { name: v.name, amount: v.amount ?? 0, currency: v.currency ?? st.settings.mainCur, day: Math.min(31, Math.max(1, Math.round(v.day ?? 1))), paused: !!v.paused }
        if (x) Object.assign(d.subscriptions.find((y) => y.id === x.id)!, data)
        else d.subscriptions.push({ id: uid(), ...data })
      })}
      onDelete={x ? () => update((d) => { d.subscriptions = d.subscriptions.filter((y) => y.id !== x.id) }) : undefined}
    />
  )
}
