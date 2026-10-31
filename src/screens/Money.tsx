import { useEffect, useRef, useState } from 'react'
import { addIncome, ensurePeriod, update, useSt } from '../store'
import type { Session, State } from '../types'
import {
  diffDays, fmt, fmtClock, fmtDay, fmtEur, fmtHours, hours, monthKey, monthName, nextMonth, periodOf, prevMonth, r2, sessionEur, shiftPeriod, summarize, taxFor, today, uid
} from '../lib'
import { C, Chips, closeSheet, Header, Icon, List, openSheet, Row, Sheet, toast, useUi } from '../ui'
import { FormSheet } from '../form'
import { Credits } from './Credits'
import { Subscriptions } from './Subscriptions'

export const Money = () => {
  const sub = useUi((u) => u.sub.money)
  const setSub = useUi((u) => u.setSub)
  const title = sub === 'work' ? 'Work' : sub === 'taxes' ? 'Taxes' : sub === 'credits' ? 'Credits' : sub === 'subs' ? 'Subscriptions' : 'Money'
  return (
    <div className="screen">
      <Header sub={sub === 'budget' ? 'Budget' : 'Money'} title={title} />
      <Chips items={[['budget', 'Budget'], ['work', 'Work'], ['taxes', 'Taxes'], ['credits', 'Credits'], ['subs', 'Subscriptions']]} value={sub as any} onChange={setSub} />
      {sub === 'budget' && <Budget />}
      {sub === 'work' && <Work />}
      {sub === 'taxes' && <Taxes />}
      {sub === 'credits' && <Credits />}
      {sub === 'subs' && <Subscriptions />}
    </div>
  )
}

// ================= BUDGET =================
const Budget = () => {
  const st = useSt()
  const [key, setKey] = useState(() => periodOf(today(), st.settings).key)
  const s = summarize(st, key)
  const isNow = today() >= s.info.start && today() <= s.info.end
  const pct = s.income > 0 ? Math.min(1, (s.fixed + s.spent) / s.income) : 0

  const editItem = (id?: string, kind: 'income' | 'expense' = 'expense') => {
    const it = s.items.find((i) => i.id === id)
    openSheet(
      <FormSheet
        title={it ? 'Edit' : kind === 'income' ? 'Money in' : 'Fixed expense'}
        initial={it ?? { kind, date: kind === 'income' ? s.info.start : undefined }}
        fields={[
          { key: 'label', label: 'Name', type: 'text' },
          { key: 'amount', label: 'Amount (zł)', type: 'number' },
          ...((it?.kind ?? kind) === 'income'
            ? ([{ key: 'date', label: 'Date', type: 'date' }, { key: 'taxable', label: 'Counts as business revenue (for taxes)?', type: 'toggle' }] as const)
            : [])
        ]}
        onSave={(v) =>
          update((d) => {
            const p = ensurePeriod(d, key)
            if (it) Object.assign(p.items.find((x) => x.id === it.id)!, { label: v.label, amount: v.amount ?? 0, date: v.date, taxable: v.taxable })
            else p.items.push({ id: uid(), kind, label: v.label, amount: v.amount ?? 0, date: v.date, taxable: v.taxable })
          })
        }
        onDelete={it ? () => update((d) => { const p = ensurePeriod(d, key); p.items = p.items.filter((x) => x.id !== it.id) }) : undefined}
      />
    )
  }
  const editSpend = (id?: string) => {
    const sp = st.spends.find((x) => x.id === id)
    openSheet(<SpendSheet id={id} initial={sp} />)
  }

  const incomes = s.items.filter((i) => i.kind === 'income')
  const expenses = s.items.filter((i) => i.kind === 'expense')
  const spends = st.spends.filter((x) => x.date >= s.info.start && x.date <= s.info.end).sort((a, b) => b.date.localeCompare(a.date))
  return (
    <>
      <div className="between">
        <button className="btn soft sm" onClick={() => setKey(shiftPeriod(key, -1))}><Icon.chevL /></button>
        <div className="t17">{s.info.label}{isNow ? ' · now' : ''}</div>
        <button className="btn soft sm" onClick={() => setKey(shiftPeriod(key, 1))}><Icon.chevR /></button>
      </div>
      <div className="card money" style={{ gap: 8 }}>
        <div className="between" style={{ alignItems: 'flex-end' }}>
          <div className="col">
            <span className="t15 w5">Left this half</span>
            <span className="big" style={{ fontSize: 52, color: s.left < 0 ? 'var(--alert)' : undefined }}>{fmt(s.left)}</span>
          </div>
          <div className="col" style={{ alignItems: 'flex-end' }}>
            <span className="t14 w5">{isNow ? `per day · ${s.daysLeft} d left` : 'per day'}</span>
            <span className="mid" style={{ fontSize: 26 }}>{fmt(isNow ? s.perDay : s.left / (diffDays(s.info.start, s.info.end) + 1))}</span>
          </div>
        </div>
        <div className="bar"><div style={{ width: `${pct * 100}%` }} /></div>
        <span className="t14">Spent {fmt(s.fixed + s.spent)} of {fmt(s.income)}</span>
      </div>
      {s.isTemplate && <div className="t14 muted" style={{ padding: '0 4px' }}>Copied from last month — edit anything and it becomes this half's own plan.</div>}
      <List title="Came in" right={fmt(s.income)} empty="Nothing yet">
        {incomes.map((i) => (
          <Row key={i.id} dot={i.fromClient ? C.work : C.money} title={i.label} meta={[i.date && fmtDay(i.date), i.taxable && 'business revenue'].filter(Boolean).join(' · ')} trail={fmt(i.amount)} onClick={() => editItem(i.id)} />
        ))}
        <Row title={<span className="muted">+ Add money in</span>} onClick={() => editItem(undefined, 'income')} />
      </List>
      <List title="Fixed this half" right={fmt(s.fixed)}>
        {s.auto.map((a) => (
          <Row key={a.id} dot={a.kind === 'supplies' ? C.supplies : C.money} title={a.label} meta={a.meta} trail={fmt(a.amount)} onClick={() => a.kind === 'supplies' ? useUi.getState().go('supplies') : useUi.getState().go('money', a.kind === 'tax' ? 'taxes' : a.kind === 'subs' ? 'subs' : 'credits')} />
        ))}
        {expenses.map((i) => (
          <Row key={i.id} dot={C.line} title={i.label} trail={fmt(i.amount)} onClick={() => editItem(i.id)} />
        ))}
        <Row title={<span className="muted">+ Add fixed expense</span>} onClick={() => editItem(undefined, 'expense')} />
      </List>
      <List title="Day-to-day spending" right={fmt(s.spent)} empty="Nothing logged. Tap “Log spending” on Today.">
        {spends.map((x) => (
          <Row key={x.id} title={x.note || 'Spending'} meta={fmtDay(x.date)} trail={fmt(x.amount)} onClick={() => editSpend(x.id)} />
        ))}
      </List>
      <button className="btn full soft" onClick={() => editSpend()}>+ Log spending</button>
    </>
  )
}

export const SpendSheet = ({ id, initial }: { id?: string; initial?: any }) => (
  <FormSheet
    title={id ? 'Edit spending' : 'Log spending'}
    initial={initial ?? { date: today() }}
    fields={[
      { key: 'amount', label: 'How much (zł)', type: 'number' },
      { key: 'note', label: 'What for (optional)', type: 'text', placeholder: 'coffee, taxi…' },
      { key: 'date', label: 'Date', type: 'date' }
    ]}
    onSave={(v) => {
      if (!v.amount) return
      update((d) => {
        if (id) Object.assign(d.spends.find((x) => x.id === id)!, { amount: v.amount, note: v.note ?? '', date: v.date })
        else d.spends.push({ id: uid(), amount: v.amount, note: v.note ?? '', date: v.date || today() })
      })
      toast('Logged')
    }}
    onDelete={id ? () => update((d) => { d.spends = d.spends.filter((x) => x.id !== id) }) : undefined}
  />
)

// ================= WORK =================
const useNow = (on: boolean) => {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!on) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [on])
  return now
}

export const stopTimer = (st: State) => {
  if (!st.timer) return
  const t = st.timer
  const end = new Date().toISOString()
  update((d) => {
    if ((new Date(end).getTime() - new Date(t.startedAt).getTime()) / 60000 >= 1)
      d.sessions.push({ id: uid(), clientId: t.clientId, task: t.task, start: t.startedAt, end, invoiced: false, paid: false })
    d.timer = null
  })
  toast('Saved to ' + (st.clients.find((c) => c.id === t.clientId)?.name ?? 'client'))
}

export const StartTimerSheet = () => {
  const st = useSt()
  const clients = st.clients.filter((c) => !c.archived)
  const last = [...st.sessions].sort((a, b) => b.start.localeCompare(a.start))[0]
  const [cid, setCid] = useState(last?.clientId ?? clients[0]?.id)
  const lastTask = [...st.sessions].filter((s) => s.clientId === cid).sort((a, b) => b.start.localeCompare(a.start))[0]?.task
  const [task, setTask] = useState('')
  return (
    <Sheet title="Start work timer">
      {!clients.length && <div className="t15 muted">No clients yet. Add one in Money → Work → “+ Add client”.</div>}
      <div className="field"><label>Client</label>
        <div className="seg">{clients.map((c) => <button key={c.id} className={'chip' + (cid === c.id ? ' on' : '')} onClick={() => setCid(c.id)}>{c.name}</button>)}</div>
      </div>
      <div className="field"><label>Task</label>
        <input className="input" value={task} placeholder={lastTask ?? 'What are you working on?'} onChange={(e) => setTask(e.target.value)} />
        {lastTask && !task && <span className="t13 muted">Leave empty to continue “{lastTask}”</span>}
      </div>
      <button className="btn full work" disabled={!cid} onClick={() => {
        update((d) => {
          if (d.timer) {
            const t = d.timer
            d.sessions.push({ id: uid(), clientId: t.clientId, task: t.task, start: t.startedAt, end: new Date().toISOString(), invoiced: false, paid: false })
          }
          d.timer = { clientId: cid!, task: task.trim() || lastTask || 'Work', startedAt: new Date().toISOString() }
        })
        closeSheet()
        useUi.getState().go('money', 'work')
      }}><Icon.play /> Start</button>
    </Sheet>
  )
}

const Work = () => {
  const st = useSt()
  const now = useNow(!!st.timer)
  const mk = monthKey(today())
  const t = st.timer
  const tc = t && st.clients.find((c) => c.id === t.clientId)
  const elapsed = t ? now - new Date(t.startedAt).getTime() : 0
  const clientStats = st.clients.filter((c) => !c.archived).map((c) => {
    const ss = st.sessions.filter((s) => s.clientId === c.id)
    const month = ss.filter((s) => monthKey(toLocalDate(s.start)) === mk)
    const mh = month.reduce((a, s) => a + hours(s), 0)
    const unInv = ss.filter((s) => !s.invoiced)
    const unpaid = ss.filter((s) => s.invoiced && !s.paid)
    const eur = (l: Session[]) => l.reduce((a, s) => a + sessionEur(st, s), 0)
    return { c, mh, monthEur: eur(month), unInv, unpaid, unInvEur: eur(unInv), unpaidEur: eur(unpaid) }
  })
  const next = clientStats.find((x) => x.unpaid.length) ?? clientStats.find((x) => x.unInv.length)
  return (
    <>
      {t ? (
        <div className="card dark" style={{ gap: 6 }}>
          <div className="between t15 w5"><span>● Running · {tc?.name}</span><span>{fmtEur(tc?.rateEur ?? 0)} / h</span></div>
          <div className="big">{fmtClock(elapsed)}</div>
          <div className="t15">{t.task} · {fmtEur((elapsed / 3600000) * (tc?.rateEur ?? 0))} so far</div>
          <div className="row" style={{ paddingTop: 8 }}>
            <button className="btn work grow" onClick={() => stopTimer(st)}>Stop & save</button>
            <button className="btn ghost grow" onClick={() => openSheet(<StartTimerSheet />)}>Switch task</button>
          </div>
        </div>
      ) : (
        <button className="card work" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }} onClick={() => openSheet(<StartTimerSheet />)}>
          <Icon.play size={22} />
          <span className="grow"><div className="t17">Start work timer</div><div className="t14 muted">Hours go straight onto the client’s invoice</div></span>
        </button>
      )}
      <List title="Clients" right={monthName(mk, true)}>
        {clientStats.map(({ c, mh, monthEur, unInv, unpaid, unpaidEur, unInvEur }) => (
          <Row key={c.id} dot={C.work} title={c.name}
            meta={[mh ? `${fmtHours(mh)} · ${fmtEur(monthEur)}` : 'No hours this month', unInv.length ? `${fmtEur(unInvEur)} to invoice` : '', unpaid.length ? `${fmtEur(unpaidEur)} not paid yet` : ''].filter(Boolean).join(' · ')}
            trail={mh ? fmt(monthEur * st.settings.eurPln, true) : '—'} onClick={() => openSheet(<ClientSheet id={c.id} />)} />
        ))}
        <Row title={<span className="muted">+ Add client</span>} onClick={() => openSheet(<ClientEdit />)} />
      </List>
      {next && (
        <button className="card work" style={{ gap: 6 }} onClick={() => openSheet(<ClientSheet id={next.c.id} />)}>
          <span className="t14 w5">Next step</span>
          <span className="t17">
            {next.unpaid.length
              ? `${next.c.name} paid? Tap to mark it — ${fmt(next.unpaidEur * st.settings.eurPln, true)} moves to income.`
              : `Invoice ${next.c.name}: ${fmtHours(next.unInv.reduce((a, s) => a + hours(s), 0))} · ${fmtEur(next.unInvEur)}`}
          </span>
        </button>
      )}
    </>
  )
}
const toLocalDate = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const timeOf = (iso: string) => new Date(iso).toTimeString().slice(0, 5)
const toLocalInput = (iso: string) => `${toLocalDate(iso)}T${timeOf(iso)}`

const ClientEdit = ({ id }: { id?: string }) => {
  const st = useSt()
  const c = st.clients.find((x) => x.id === id)
  return (
    <FormSheet title={c ? 'Edit client' : 'New client'} initial={c ?? { rateEur: 12 }}
      fields={[{ key: 'name', label: 'Name', type: 'text' }, { key: 'rateEur', label: 'Rate (€ per hour)', type: 'number' }]}
      onSave={(v) => update((d) => {
        if (c) Object.assign(d.clients.find((x) => x.id === c.id)!, { name: v.name, rateEur: v.rateEur ?? 0 })
        else d.clients.push({ id: uid(), name: v.name, rateEur: v.rateEur ?? 0 })
      })}
      onDelete={c ? () => update((d) => { d.clients.find((x) => x.id === c.id)!.archived = true }) : undefined}
    />
  )
}

const SessionEdit = ({ clientId, id }: { clientId: string; id?: string }) => {
  const st = useSt()
  const s = st.sessions.find((x) => x.id === id)
  const now = new Date()
  const init = s ? { task: s.task, start: toLocalInput(s.start), end: toLocalInput(s.end), invoiced: s.invoiced, paid: s.paid }
    : { start: toLocalInput(new Date(now.getTime() - 3600000).toISOString()), end: toLocalInput(now.toISOString()), invoiced: false, paid: false }
  return (
    <FormSheet title={s ? 'Edit hours' : 'Add hours'} initial={init}
      fields={[{ key: 'task', label: 'Task', type: 'text' }, { key: 'start', label: 'Start', type: 'datetime' }, { key: 'end', label: 'Stop', type: 'datetime' }, { key: 'invoiced', label: 'Invoiced', type: 'toggle' }, { key: 'paid', label: 'Paid', type: 'toggle' }]}
      onSave={(v) => update((d) => {
        const data = { task: v.task, start: new Date(v.start).toISOString(), end: new Date(v.end).toISOString(), invoiced: !!v.invoiced, paid: !!v.paid }
        if (s) Object.assign(d.sessions.find((x) => x.id === s.id)!, data)
        else d.sessions.push({ id: uid(), clientId, ...data })
      })}
      onDelete={s ? () => update((d) => { d.sessions = d.sessions.filter((x) => x.id !== s.id) }) : undefined}
    />
  )
}

const ClientSheet = ({ id }: { id: string }) => {
  const st = useSt()
  const c = st.clients.find((x) => x.id === id)!
  const rate = st.settings.eurPln
  const ss = st.sessions.filter((s) => s.clientId === id).sort((a, b) => b.start.localeCompare(a.start))
  const unInv = ss.filter((s) => !s.invoiced)
  const unpaid = ss.filter((s) => s.invoiced && !s.paid)
  const eur = (l: Session[]) => l.reduce((a, s) => a + sessionEur(st, s), 0)
  const [all, setAll] = useState(false)
  const shown = all ? ss : ss.slice(0, 8)
  const markPaid = () => {
    const pln = r2(eur(unpaid) * rate)
    const tax = r2(pln * st.settings.pitRate)
    update((d) => {
      for (const s of d.sessions) if (s.clientId === id && s.invoiced && !s.paid) s.paid = true
      const key = periodOf(today(), d.settings).key
      addIncome(d, key, { label: c.name, amount: pln, date: today(), taxable: true, fromClient: id })
    })
    toast(`${fmt(pln, true)} added to income · ~${fmt(tax, true)} goes to taxes`)
  }
  return (
    <Sheet title={c.name}>
      <div className="t15 muted">{fmtEur(c.rateEur)} per hour · 1 € = {rate} zł</div>
      {unInv.length > 0 && (
        <div className="card work" style={{ gap: 6 }}>
          <span className="t14 w5">Not invoiced yet</span>
          <span className="mid">{fmtHours(unInv.reduce((a, s) => a + hours(s), 0))} · {fmtEur(eur(unInv))}</span>
          <span className="t14">{fmt(eur(unInv) * rate, true)}</span>
          <button className="btn" onClick={() => {
            const text = unInv.map((s) => `${toLocalDate(s.start)}  ${s.task}  ${fmtHours(hours(s))}  ${fmtEur(sessionEur(st, s))}`).join('\n') + `\nTotal: ${fmtHours(unInv.reduce((a, s) => a + hours(s), 0))} · ${fmtEur(eur(unInv))}`
            navigator.clipboard?.writeText(text).catch(() => {})
            update((d) => { for (const s of d.sessions) if (s.clientId === id && !s.invoiced) s.invoiced = true })
            toast('Marked invoiced · lines copied for your invoice')
          }}>Mark invoiced (copies the lines)</button>
        </div>
      )}
      {unpaid.length > 0 && (
        <div className="card money" style={{ gap: 6 }}>
          <span className="t14 w5">Invoiced, waiting for payment</span>
          <span className="mid">{fmt(eur(unpaid) * rate, true)}</span>
          <span className="t14">{fmtEur(eur(unpaid))} · {unpaid.length} entries</span>
          <button className="btn" onClick={markPaid}>They paid → add to income</button>
        </div>
      )}
      <List title="Hours" right={`${ss.length} entries`} empty="No hours yet">
        {shown.map((s) => (
          <Row key={s.id} title={s.task} meta={`${fmtDay(toLocalDate(s.start))} · ${timeOf(s.start)}–${timeOf(s.end)} · ${s.paid ? 'paid' : s.invoiced ? 'invoiced' : 'not invoiced'}`}
            trail={`${fmtHours(hours(s))}`} dot={s.paid ? C.ok : s.invoiced ? C.money : C.work} onClick={() => openSheet(<SessionEdit clientId={id} id={s.id} />)} />
        ))}
        {!all && ss.length > 8 && <Row title={<span className="muted">Show all</span>} onClick={() => setAll(true)} />}
      </List>
      <div className="row">
        <button className="btn soft grow" onClick={() => openSheet(<SessionEdit clientId={id} />)}>+ Add hours</button>
        <button className="btn soft grow" onClick={() => openSheet(<ClientEdit id={id} />)}>Edit client</button>
      </div>
    </Sheet>
  )
}

// ================= TAXES =================
const Taxes = () => {
  const st = useSt()
  const t = today()
  const curM = monthKey(t)
  const year = curM.slice(0, 4)
  // the payment to show: the earliest unpaid month before the current month
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
  const candidates = [...months, ...Object.keys(st.taxMonths)].filter((m, i, a) => a.indexOf(m) === i && m < curM).sort()
  // earliest unpaid past month; if everything is paid, the month that is accruing now
  const due = candidates.find((m) => !taxFor(st, m).paid && taxFor(st, m).total > 0) ?? curM
  const tx = taxFor(st, due)
  const [dy, dm] = due.split('-').map(Number)
  const dueDate = `${dm === 12 ? dy + 1 : dy}-${String(dm === 12 ? 1 : dm + 1).padStart(2, '0')}-${String(st.settings.taxDueDay).padStart(2, '0')}`
  const inDays = diffDays(t, dueDate)
  const revs = months.map((m) => taxFor(st, m).revenue)
  const past = months.map((m, i) => (m <= curM ? revs[i] : 0))
  const ytd = past.reduce((a, b) => a + b, 0)
  const nonZero = past.filter((r) => r > 0).length || 1
  const max = Math.max(...revs, 1)
  const after = nextMonth(due)
  const afterTx = taxFor(st, after)
  const yearPit = months.reduce((a, m) => a + taxFor(st, m).pit, 0)

  const [pick, setPick] = useState<'zus' | 'pit'>('zus')
  const zus = r2(tx.dra + tx.rca)
  const copyAccount = () => {
    const acc = pick === 'zus' ? st.settings.zusAccount : st.settings.taxAccount
    if (!acc) { toast(`Add the ${pick === 'zus' ? 'ZUS' : 'tax (PIT)'} account in Settings first`); return }
    copyText(acc.trim(), `${pick === 'zus' ? 'ZUS' : 'PIT'} account copied`)
  }
  const editMonth = (m: string) => openSheet(<TaxMonthSheet m={m} />)
  return (
    <>
      <div className="card dark" style={{ gap: 6 }}>
        <div className="between">
          <span className="t15 w5">{monthName(due, true)} · pay by {fmtDay(dueDate)} ({inDays < 0 ? `${-inDays} days late` : `in ${inDays} days`})</span>
          {tx.paid && <span className="pill"><Icon.check color="#1E1E1E" size={13} /> paid</span>}
        </div>
        <div className="big" style={{ fontSize: 60 }}>{fmt(tx.total)}</div>
        <div className="parts" style={{ paddingTop: 6 }}>
          <Quota label="ZUS (DRA + RCA)" amount={zus} on={pick === 'zus'} onPick={() => setPick('zus')} />
          <Quota label="PIT-28" amount={tx.pit} on={pick === 'pit'} onPick={() => setPick('pit')} />
        </div>
        <span className="t13" style={{ opacity: 0.7 }}>Tap to choose · hold to copy the amount</span>
        <div className="btn2" style={{ paddingTop: 4 }}>
          <button className="btn money" onClick={() => update((d) => { d.taxMonths[due] = { ...(d.taxMonths[due] ?? {}), paid: !tx.paid } })}>{tx.paid ? 'Undo paid' : 'Mark as paid'}</button>
          <button className="btn ghost" onClick={copyAccount}>Copy {pick === 'zus' ? 'ZUS' : 'PIT'} account</button>
        </div>
        <span className="t13" style={{ opacity: 0.7 }}>Already in your budget for {fmtDay(dueDate)}. Revenue {fmt(tx.revenue, true)} · <u onClick={() => editMonth(due)}>edit</u></span>
      </div>
      <div className="card" style={{ gap: 10, paddingTop: 16, paddingBottom: 16 }}>
        <div className="between" style={{ alignItems: 'flex-end' }}>
          <div className="col"><span className="t14 w5 muted">Revenue {year} so far</span><span className="mid">{fmt(ytd)}</span></div>
          <div className="col" style={{ alignItems: 'flex-end' }}><span className="t14 w5 muted">avg / month</span><span className="t17" style={{ fontSize: 20 }}>{fmt(ytd / nonZero)}</span></div>
        </div>
        <div className="chart">
          {months.map((m, i) => (
            <button key={m} className="c" onClick={() => editMonth(m)}>
              <div className={'b' + (m === due ? ' cur' : revs[i] ? '' : ' zero')} data-future={m > curM ? '1' : undefined} style={{ height: Math.max(4, Math.round((revs[i] / max) * 64)) }} />
              <span className="t13" style={{ fontWeight: m === due ? 600 : 400, color: m === due ? 'var(--ink)' : 'var(--ink2)' }}>{monthName(m)[0]}</span>
            </button>
          ))}
        </div>
      </div>
      <List>
        <Row dot={C.money} title={`${fmtDay(nextDue(dueDate))} · ${monthName(after, true)}`} meta={after > curM ? 'Grows as business income comes in' : 'Revenue so far'} trail={`${fmt(afterTx.revenue)}${after > curM ? ' planned' : ''}`} onClick={() => editMonth(after)} />
        <Row dot={C.money} title={`Annual PIT-28`} meta={`By 30 Apr ${Number(year) + 1} · ${fmt(yearPit)} paid monthly this year`} onClick={() => editMonth(curM)} />
      </List>
      <div className="t13 muted" style={{ padding: '0 4px' }}>PIT = {Math.round(st.settings.pitRate * 100)}% × (revenue − ½ DRA). Tap any month to check or correct it. Rates are in Settings.</div>
    </>
  )
}
const nextDue = (d: string) => {
  const [y, m, dd] = d.split('-').map(Number)
  return m === 12 ? `${y + 1}-01-${String(dd).padStart(2, '0')}` : `${y}-${String(m + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
}

const TaxMonthSheet = ({ m }: { m: string }) => {
  const st = useSt()
  const tm = st.taxMonths[m]
  const tx = taxFor(st, m)
  return (
    <FormSheet title={`${monthName(m, true)} ${m.slice(0, 4)}`}
      initial={{ revenueOverride: tm?.revenueOverride, pitOverride: tm?.pitOverride, paid: tm?.paid ?? false }}
      fields={[
        { key: 'revenueOverride', label: `Revenue (empty = from business income: ${fmt(tx.override ? 0 : tx.revenue, true)})`, type: 'number' },
        { key: 'pitOverride', label: `PIT-28 (empty = calculated)`, type: 'number' },
        { key: 'paid', label: 'Paid', type: 'toggle' }
      ]}
      extra={<div className="t14 muted">Now: DRA {fmt(tx.dra, true)} · RCA {fmt(tx.rca, true)} · PIT {fmt(tx.pit, true)} = <b>{fmt(tx.total, true)}</b></div>}
      onSave={(v) => update((d) => { d.taxMonths[m] = { ...(d.taxMonths[m] ?? {}), revenueOverride: v.revenueOverride, pitOverride: v.pitOverride, paid: !!v.paid } })}
    />
  )
}

// Bank-friendly amount: 954,54 (comma, no thousands separator)
export const bankAmount = (n: number) => (Math.round(n * 100) / 100).toFixed(2).replace('.', ',')

export const copyText = (text: string, msg: string) => {
  const done = () => { toast(msg); navigator.vibrate?.(15) }
  const fallback = () => {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    ta.remove()
    ok ? done() : toast('Could not copy')
  }
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, fallback)
  else fallback()
}

// Tap = choose this quota, hold (~0.5 s) = copy its amount as 954,54
const Quota = ({ label, amount, on, onPick }: { label: string; amount: number; on: boolean; onPick: () => void }) => {
  const [holding, setHolding] = useState(false)
  const start = useRef(0)
  const timer = useRef<number>()
  const begin = () => {
    start.current = Date.now()
    timer.current = window.setTimeout(() => setHolding(true), 450)
  }
  const end = () => {
    clearTimeout(timer.current)
    const long = Date.now() - start.current >= 450
    setHolding(false)
    start.current = 0
    if (long) copyText(bankAmount(amount), `${bankAmount(amount)} copied`)
    else onPick()
  }
  const cancel = () => { clearTimeout(timer.current); setHolding(false); start.current = 0 }
  return (
    <button
      className={'quota' + (on ? ' on' : '') + (holding ? ' hold' : '')}
      onPointerDown={begin}
      onPointerUp={() => start.current && end()}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="t13 w5">{label}</span>
      <span className="t17">{fmt(amount, true)}</span>
    </button>
  )
}
