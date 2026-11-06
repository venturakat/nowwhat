import { useEffect, useRef, useState, type ReactNode } from 'react'
import { addIncome, ensurePeriod, update, useSt, useStore } from '../store'
import type { Currency, Session, State } from '../types'
import { fitSize,
  diffDays, fmt, fmtCur, numText, periodFromKey, parseNum, revenueFromIncome, toMain, fmtClock, fmtDay, fmtHours, hours, monthKey, sessionMain, ensureFees, fmtSum, needsRate, monthName, nextMonth, periodOf, prevMonth, r2, sessionAmt, sessionCur, shiftPeriod, summarize, taxFor, today, uid,
  setTaxPaid, curOptions, curSign, fmtTax
} from '../lib'
import { C, Chips, closeSheet, Field, Header, Icon, List, openSheet, Row, Sheet, toast, registerSubs, useUi } from '../ui'
import { FormSheet, type FieldDef } from '../form'
import { Credits } from './Credits'
import { nbpRateForInvoice } from '../rates'
import { ord, Subscriptions } from './Subscriptions'
import { Classes } from './Classes'
import { Selfcare } from './Selfcare'

const SUBTABS: [string, string][] = [['budget', 'Budget'], ['work', 'Work'], ['taxes', 'Taxes'], ['selfcare', 'Selfcare'], ['classes', 'Classes'], ['subs', 'Subscriptions'], ['credits', 'Credits']]
registerSubs('money', SUBTABS.map((x) => x[0]))

export const Money = () => {
  const sub = useUi((u) => u.sub.money)
  const setSub = useUi((u) => u.setSub)
  const title = sub === 'work' ? 'Work' : sub === 'taxes' ? 'Taxes' : sub === 'credits' ? 'Credits' : sub === 'subs' ? 'Subscriptions' : sub === 'selfcare' ? 'Selfcare' : sub === 'classes' ? 'Classes' : 'Budget'
  return (
    <div className="screen">
      <Header sub="Money" title={title} />
      <Chips items={SUBTABS} value={sub as any} onChange={setSub} swipe />
      {sub === 'budget' && <Budget />}
      {sub === 'work' && <Work />}
      {sub === 'taxes' && <Taxes />}
      {sub === 'credits' && <Credits />}
      {sub === 'subs' && <Subscriptions />}
      {sub === 'selfcare' && <Selfcare />}
      {sub === 'classes' && <Classes />}
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
        initial={it ? { currency: st.settings.mainCur, ...it } : { kind, currency: st.settings.mainCur, date: kind === 'income' ? s.info.start : undefined }}
        fields={[
          { key: 'label', label: 'Name', type: 'text' },
          { key: 'amount', label: 'Amount', type: 'number' },
          { key: 'currency', label: 'Currency', type: 'select', options: curOptions(st.settings, it?.currency) },
          ...((it?.kind ?? kind) === 'income'
            ? ([{ key: 'date', label: 'Date', type: 'date' }, { key: 'taxable', label: 'Counts as business revenue (for taxes)?', type: 'toggle' }] as const)
            : [])
        ]}
        onSave={(v) => {
          // a dated entry always lives in the half its date belongs to, whichever half it was added from
          const target = v.date ? periodOf(v.date, st.settings).key : key
          update((d) => {
            const p = ensurePeriod(d, key)
            const data = { label: v.label, amount: v.amount ?? 0, currency: v.currency ?? d.settings.mainCur, date: v.date, taxable: v.taxable }
            const item = it ? { ...p.items.find((x) => x.id === it.id)!, ...data } : { id: uid(), kind, ...data }
            if (it) p.items = p.items.filter((x) => x.id !== it.id)
            ensurePeriod(d, target).items.push(item as any)
          })
          if (target !== key) toast(`Moved to ${periodFromKey(target, st.settings).label}`)
        }}
        onDelete={it ? () => update((d) => { const p = ensurePeriod(d, key); p.items = p.items.filter((x) => x.id !== it.id) }) : undefined}
      />
    )
  }
  const editSpend = (id?: string) => {
    const sp = st.spends.find((x) => x.id === id)
    openSheet(<SpendSheet id={id} initial={sp} />)
  }

  // foreign amounts: "€25.00" with the main-currency value under it (at the rate of its day)
  const amt = (x: { amount: number; currency?: Currency; date?: string }) => !x.currency || x.currency === st.settings.mainCur ? fmt(x.amount) : <span style={{ textAlign: 'right', display: 'block' }}>{fmtCur(x.amount, x.currency)}<br /><span className="t13 muted" style={{ fontWeight: 400 }}>{fmt(toMain(st.settings, x.amount, x.currency, x.date ?? s.info.end))}</span></span>
  const incomes = s.items.filter((i) => i.kind === 'income')
  const isBought = (i: { bought?: boolean; label: string }) => !!i.bought || i.label.endsWith(' (bought)')
  const expenses = s.items.filter((i) => i.kind === 'expense' && !isBought(i))
  const bought = s.items.filter((i) => i.kind === 'expense' && isBought(i))
  const boughtSum = bought.reduce((a, i) => a + toMain(st.settings, i.amount, i.currency, i.date ?? s.info.end), 0)
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
            <span className="t15 w5">Left this fortnight</span>
            <span className="big" style={{ fontSize: fitSize(fmt(s.left), 52, 8), color: s.left < 0 ? 'var(--alert)' : undefined }}>{fmt(s.left)}</span>
          </div>
          <div className="col" style={{ alignItems: 'flex-end' }}>
            <span className="t14 w5">{isNow ? `per day · ${s.daysLeft} d left` : 'per day'}</span>
            <span className="mid" style={{ fontSize: fitSize(fmt(isNow ? s.perDay : s.left / (diffDays(s.info.start, s.info.end) + 1)), 26, 8) }}>{fmt(isNow ? s.perDay : s.left / (diffDays(s.info.start, s.info.end) + 1))}</span>
          </div>
        </div>
        <div className="bar"><div style={{ width: `${pct * 100}%` }} /></div>
        <span className="t14">Spent {fmt(s.fixed + s.spent)} of {fmt(s.income)}</span>
      </div>
      {s.isTemplate && <div className="t14 muted" style={{ padding: '0 4px' }}>Copied from last month — edit anything and it becomes this fortnight's own plan.</div>}
      <List title="Came in" right={fmt(s.income)} empty="Nothing yet">
        {s.auto.filter((a) => a.income && !a.expected).map((a) => (
          <Row key={a.id} dot={C.work} title={a.label} meta={a.meta} trail={fmt(a.amount)} onClick={() => useUi.getState().go('money', 'work')} />
        ))}
        {incomes.map((i) => (
          <Row key={i.id} dot={i.fromClient ? C.work : C.money} title={i.label} meta={[i.date && fmtDay(i.date), i.taxable && 'business revenue'].filter(Boolean).join(' · ')} trail={amt(i)} onClick={() => editItem(i.id)} />
        ))}
        <Row title={<span className="muted">+ Add money in</span>} onClick={() => editItem(undefined, 'income')} />
      </List>
      {s.auto.some((a) => a.expected) && (
        <List title="Expected from clients" right={<span className="muted">{fmt(s.auto.filter((a) => a.expected).reduce((x, a) => x + a.amount, 0))}</span>}>
          {s.auto.filter((a) => a.expected).map((a) => (
            <Row key={a.id} dot={C.line} title={a.label} meta={a.meta} trail={a.counted ? fmt(a.amount) : <span className="muted">{fmt(a.amount)}</span>} onClick={() => useUi.getState().go('money', 'work')} />
          ))}
        </List>
      )}
      <List title="Fixed this fortnight" right={fmt(s.fixed - boughtSum)}>
        {s.auto.filter((a) => !a.income).map((a) => (
          <Row key={a.id} dot={a.kind === 'supplies' ? C.supplies : a.kind === 'care' ? C.closet : C.money} title={a.label} meta={a.meta} trail={fmt(a.amount)} onClick={() => a.kind === 'supplies' ? useUi.getState().go('supplies', a.id.replace('sup-', '')) : useUi.getState().go('money', a.kind === 'tax' ? 'taxes' : a.kind === 'subs' ? 'subs' : a.kind === 'care' ? 'selfcare' : a.kind === 'lessons' ? 'classes' : 'credits')} />
        ))}
        {expenses.map((i) => (
          <Row key={i.id} dot={C.line} title={i.label} trail={amt(i)} onClick={() => editItem(i.id)} />
        ))}
        <Row title={<span className="muted">+ Add fixed expense</span>} onClick={() => editItem(undefined, 'expense')} />
      </List>
      {bought.length > 0 && (
        <Fold title="Supplies bought" right={fmt(boughtSum)}>
          {bought.map((i) => (
            <Row key={i.id} dot={C.supplies} title={i.label.replace(/ \(bought\)$/, '')} meta={i.date ? fmtDay(i.date) : undefined} trail={amt(i)} onClick={() => editItem(i.id)} />
          ))}
        </Fold>
      )}
      <Fold title="Day-to-day spending" right={fmt(s.spent)}>
        {spends.length ? spends.map((x) => (
          <Row key={x.id} title={x.note || 'Spending'} meta={fmtDay(x.date)} trail={amt(x)} onClick={() => editSpend(x.id)} />
        )) : <div className="list-empty">Nothing logged yet.</div>}
        <MergeSpends spends={spends} date={isNow ? today() : s.info.end} />
      </Fold>
      <button className="btn full soft" onClick={() => editSpend()}>+ Log spending</button>
    </>
  )
}

// footer of Day-to-day spending: spends with the same "what for" and currency become one, dated the day they're merged (two taps)
const spendKey = (x: { note: string; currency?: Currency }) => (x.note || 'Spending').trim().toLowerCase() + '|' + (x.currency ?? '')
const MergeSpends = ({ spends, date }: { spends: State['spends']; date: string }) => {
  const [sure, setSure] = useState(false)
  const counts = new Map<string, number>()
  for (const x of spends) counts.set(spendKey(x), (counts.get(spendKey(x)) ?? 0) + 1)
  if (![...counts.values()].some((n) => n > 1)) return null
  const merge = () => {
    const ids = new Set(spends.map((x) => x.id))
    update((d) => {
      const groups = new Map<string, typeof d.spends>()
      for (const x of d.spends) if (ids.has(x.id) && counts.get(spendKey(x))! > 1) groups.set(spendKey(x), [...(groups.get(spendKey(x)) ?? []), x])
      const gone = new Set([...groups.values()].flat().map((x) => x.id))
      d.spends = d.spends.filter((x) => !gone.has(x.id))
      for (const g of groups.values()) d.spends.push({ id: uid(), amount: Math.round(g.reduce((a, x) => a + x.amount, 0) * 100) / 100, currency: g[0].currency, note: g[0].note, date })
    })
    setSure(false)
    toast('Merged')
  }
  return <Row title={<span className={sure ? undefined : 'muted'}>{sure ? 'Tap again to merge' : 'Merge identical spends'}</span>} onClick={() => sure ? merge() : setSure(true)} />
}

// a list that opens on tap — closed by default
const Fold = ({ title, right, children }: { title: string; right: ReactNode; children: ReactNode }) => {
  const [open, setOpen] = useState(false)
  return (
    <div className="list">
      <button className="list-h" style={{ width: '100%', paddingBottom: open ? undefined : 8 }} onClick={() => setOpen(!open)}>
        <span className="t17 row" style={{ gap: 6 }}>{title} <span className="muted" style={{ display: 'inline-flex', transform: open ? 'rotate(90deg)' : undefined, transition: 'transform .15s' }}><Icon.chevR /></span></span>
        <span className="t14 w5 muted">{right}</span>
      </button>
      {open && children}
    </div>
  )
}

export const SpendSheet = ({ id, initial }: { id?: string; initial?: any }) => (
  <FormSheet
    title={id ? 'Edit spending' : 'Log spending'}
    initial={initial ? { currency: useStore.getState().st.settings.mainCur, ...initial } : { date: today(), currency: useStore.getState().st.settings.mainCur }}
    fields={[
      { key: 'amount', label: 'How much', type: 'number' },
      { key: 'currency', label: 'Currency', type: 'select', options: curOptions(useStore.getState().st.settings, initial?.currency) },
      { key: 'note', label: 'What for (optional)', type: 'text', placeholder: 'coffee, taxi…', suggest: ['Eat out', 'Taxi', 'Coffee', 'Movies', 'Books', 'Gifts', 'Travel'] },
      { key: 'date', label: 'Date', type: 'date' }
    ]}
    onSave={(v) => {
      if (!v.amount) return
      update((d) => {
        if (id) Object.assign(d.spends.find((x) => x.id === id)!, { amount: v.amount, currency: v.currency ?? d.settings.mainCur, note: v.note ?? '', date: v.date })
        else d.spends.push({ id: uid(), amount: v.amount, currency: v.currency ?? d.settings.mainCur, note: v.note ?? '', date: v.date || today() })
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
  const clients = st.clients.filter((c) => !c.archived && (c.kind ?? 'hourly') === 'hourly')
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
    const eur = (l: Session[]) => fmtSum(st, l)
    const pln = (l: Session[]) => l.reduce((a, s) => a + sessionMain(st, s), 0)
    return { c, mh, monthEur: eur(month), monthPln: pln(month), unInv, unpaid, unInvEur: eur(unInv), unpaidEur: eur(unpaid), unpaidPln: pln(unpaid) }
  })
  const next = clientStats.find((x) => x.unpaid.length) ?? clientStats.find((x) => x.unInv.length)
  return (
    <>
      {t ? (
        <div className="card dark" style={{ gap: 6 }}>
          <div className="between t15 w5"><span>● Running · {tc?.name}</span><span>{fmtCur(tc?.rateEur ?? 0, tc?.cur ?? 'EUR', (tc?.rateEur ?? 0) % 1 !== 0)} / h</span></div>
          <div className="big">{fmtClock(elapsed)}</div>
          <div className="t15">{t.task} · {fmtCur((elapsed / 3600000) * (tc?.rateEur ?? 0), tc?.cur ?? 'EUR')} so far</div>
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
        {clientStats.map(({ c, mh, monthEur, monthPln, unInv, unpaid, unpaidEur, unInvEur }) => (
          <Row key={c.id} dot={C.work} title={c.name}
            meta={[c.kind === 'fixed' ? `${fmtCur(c.fixedEur ?? 0, c.fixedCur ?? 'EUR')} / month · on the ${ord(c.payDay ?? 1)}` : c.kind === 'job' ? (monthPln ? `Jobs this month · ${monthEur}` : 'No jobs this month') : mh ? `${fmtHours(mh)} · ${monthEur}` : 'No hours this month', unInv.length ? `${unInvEur} to invoice` : '', unpaid.length ? `${unpaidEur} not paid yet` : ''].filter(Boolean).join(' · ')}
            trail={mh || monthPln ? fmt(monthPln, true) : '—'} onClick={() => openSheet(<ClientSheet id={c.id} />)} />
        ))}
        <Row title={<span className="muted">+ Add client</span>} onClick={() => openSheet(<ClientEdit />)} />
      </List>
      {next && (
        <button className="card work" style={{ gap: 6 }} onClick={() => openSheet(<ClientSheet id={next.c.id} />)}>
          <span className="t14 w5">Next step</span>
          <span className="t17">
            {next.unpaid.length
              ? `${next.c.name} paid? Tap to mark it — ${fmt(next.unpaidPln, true)} moves to income.`
              : `Invoice ${next.c.name}: ${fmtHours(next.unInv.reduce((a, s) => a + hours(s), 0))} · ${next.unInvEur}`}
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

type ClientKind = 'hourly' | 'fixed' | 'job'
const KINDS: [ClientKind, string, string][] = [
  ['hourly', 'By the hour', 'Track hours with the timer, invoice them in their currency.'],
  ['fixed', 'Fixed monthly fee', 'Same amount every month — an entry appears each month by itself.'],
  ['job', 'Fee per job', 'Irregular work: add each job with its amount when it comes.']
]

// new client: pick the type first, then a short form with only what that type needs
const ClientEdit = ({ id, kind }: { id?: string; kind?: ClientKind }) => {
  const st = useSt()
  const c = st.clients.find((x) => x.id === id)
  const k: ClientKind | undefined = kind ?? c?.kind ?? (c ? 'hourly' : undefined)
  if (!k) return (
    <Sheet title="New client">
      <span className="t15 muted">How do they pay you?</span>
      {KINDS.map(([key, name, hint]) => (
        <button key={key} className="card" style={{ gap: 4, textAlign: 'left', padding: 16, background: 'var(--card)' }} onClick={() => openSheet(<ClientEdit kind={key} />)}>
          <span className="t17">{name}</span>
          <span className="t14 muted">{hint}</span>
        </button>
      ))}
    </Sheet>
  )
  const fields: FieldDef[] = [{ key: 'name', label: 'Name', type: 'text' }]
  if (k === 'hourly') fields.push({ key: 'rateEur', label: 'Per hour', type: 'number' }, { key: 'cur', label: 'Currency', type: 'select', options: curOptions(st.settings, c?.cur ?? 'EUR') })
  if (k === 'fixed') fields.push(
    { key: 'fixedEur', label: 'Amount per month', type: 'number' },
    { key: 'fixedCur', label: 'Currency', type: 'select', options: curOptions(st.settings, c?.fixedCur ?? 'EUR') },
    { key: 'payDay', label: 'Due on day of the month', type: 'number', step: 1 },
    { key: 'since', label: 'First month (any day in it)', type: 'date' }
  )
  const hint = k === 'hourly' ? 'Invoiced with the NBP rate of the invoice date.'
    : k === 'fixed' ? 'Each month gets its own entry. It shows in the budget as expected until you mark it paid.'
    : 'Add jobs in the client’s card, in any currency, whenever they come.'
  return (
    <FormSheet title={c ? `${c.name} · ${KINDS.find((x) => x[0] === k)![1].toLowerCase()}` : KINDS.find((x) => x[0] === k)![1]}
      initial={c ? { fixedCur: 'EUR', cur: 'EUR', payDay: 1, ...c, since: c.since ? c.since + '-01' : today().slice(0, 8) + '01' } : { rateEur: 12, cur: 'EUR', fixedCur: 'EUR', payDay: 1, since: today().slice(0, 8) + '01' }}
      fields={fields}
      extra={<>
        <span className="t13 muted">{hint}</span>
        {c && <button type="button" className="t14 w5 muted" style={{ alignSelf: 'flex-start', padding: '4px 0' }} onClick={() => openSheet(<KindPick id={c.id} />)}>Change how they pay →</button>}
      </>}
      onSave={(v) => update((d) => {
        const data = { name: v.name, kind: k, rateEur: v.rateEur ?? c?.rateEur ?? 0, fixedEur: v.fixedEur ?? c?.fixedEur, cur: v.cur ?? c?.cur ?? 'EUR', fixedCur: v.fixedCur ?? c?.fixedCur ?? 'EUR', payDay: Math.min(31, Math.max(1, Math.round(v.payDay ?? c?.payDay ?? 1))), since: v.since ? String(v.since).slice(0, 7) : c?.since }
        if (c) Object.assign(d.clients.find((x) => x.id === c.id)!, data)
        else d.clients.push({ id: uid(), ...data })
        ensureFees(d)
      })}
      onDelete={c ? () => update((d) => { d.clients.find((x) => x.id === c.id)!.archived = true }) : undefined}
    />
  )
}
const KindPick = ({ id }: { id: string }) => (
  <Sheet title="How do they pay you?">
    {KINDS.map(([key, name, hint]) => (
      <button key={key} className="card" style={{ gap: 4, textAlign: 'left', padding: 16, background: 'var(--card)' }} onClick={() => openSheet(<ClientEdit id={id} kind={key} />)}>
        <span className="t17">{name}</span>
        <span className="t14 muted">{hint}</span>
      </button>
    ))}
  </Sheet>
)

const SessionEdit = ({ clientId, id }: { clientId: string; id?: string }) => {
  const st = useSt()
  const s = st.sessions.find((x) => x.id === id)
  const c = st.clients.find((x) => x.id === clientId)
  const paidAt = s?.paid ? s.paidDate ?? Object.values(st.periods).flatMap((p) => p.items).find((i) => i.fromSession === s.id)?.date ?? s.invoiceDate ?? toLocalDate(s.start) : undefined
  // fee entries (monthly or per job) have an amount and a date instead of start/stop times
  if (s?.fee !== undefined || (!s && c?.kind && c.kind !== 'hourly')) {
    const init = s ? { task: s.task, fee: s.fee, feeCur: s.feeCur ?? 'EUR', invoiceDate: s.invoiceDate, paidDate: paidAt } : { feeCur: c?.kind === 'job' ? ([...st.sessions].reverse().find((x) => x.clientId === c.id && x.fee != null)?.feeCur ?? st.settings.mainCur) : (c?.fixedCur ?? 'EUR') }
    return (
      <FormSheet title={s ? (s.feeMonth ? 'Edit monthly fee' : 'Edit job') : 'New job'} initial={init}
        fields={[{ key: 'task', label: 'What for', type: 'text', placeholder: 'Logo redesign' }, { key: 'fee', label: 'Amount', type: 'number' }, { key: 'feeCur', label: 'Currency', type: 'select', options: curOptions(st.settings, init.feeCur) }, { key: 'invoiceDate', label: 'Invoice date', type: 'date', clearable: true }, { key: 'paidDate', label: 'Paid on', type: 'date', clearable: true }]}
        extra={<span className="t13 muted">Leave a date empty until it happens. Invoice date → counts for taxes that month. Paid on → goes into the budget as income on that day.</span>}
        onSave={(v) => update((d) => {
          const data = { task: v.task, fee: v.fee ?? 0, feeCur: (v.feeCur ?? 'EUR') as Currency }
          const sid = s?.id ?? uid()
          if (s) {
            const x = d.sessions.find((y) => y.id === s.id)!
            if (x.fee !== data.fee || (x.feeCur ?? 'EUR') !== data.feeCur) { delete x.nbpRate; delete x.nbpTable }
            Object.assign(x, data)
          } else {
            const at = new Date((v.invoiceDate || v.paidDate || today()) + 'T12:00:00').toISOString()
            d.sessions.push({ id: sid, clientId, ...data, start: at, end: at, invoiced: false, paid: false })
          }
          // a job sits in the month it was invoiced (monthly fees keep their due date)
          const x = d.sessions.find((y) => y.id === sid)!
          if (!x.feeMonth && v.invoiceDate) x.start = x.end = new Date(v.invoiceDate + 'T12:00:00').toISOString()
          setStatus(d, sid, { invoiced: !!v.invoiceDate, invoiceDate: v.invoiceDate || undefined, paid: !!v.paidDate, paidDate: v.paidDate || undefined })
          setTimeout(() => fetchMissingRates([sid]))
        })}
        onDelete={s ? () => update((d) => { d.sessions = d.sessions.filter((x) => x.id !== s.id) }) : undefined}
      />
    )
  }
  const now = new Date()
  const init = s ? { task: s.task, start: toLocalInput(s.start), end: toLocalInput(s.end), invoiceDate: s.invoiceDate, paidDate: paidAt }
    : { start: toLocalInput(new Date(now.getTime() - 3600000).toISOString()), end: toLocalInput(now.toISOString()) }
  // older hours invoiced before invoice dates existed stay invoiced (they count for taxes when paid)
  const oldInvoiced = !!s?.invoiced && !s.invoiceDate
  return (
    <FormSheet title={s ? 'Edit hours' : 'Add hours'} initial={init}
      fields={[{ key: 'task', label: 'Task', type: 'text' }, { key: 'start', label: 'Start', type: 'datetime' }, { key: 'end', label: 'Stop', type: 'datetime' }, { key: 'invoiceDate', label: oldInvoiced ? 'Invoice date (invoiced earlier)' : 'Invoice date', type: 'date', clearable: true }, { key: 'paidDate', label: 'Paid on', type: 'date', clearable: true }]}
      extra={<span className="t13 muted">Leave a date empty until it happens. Invoice date → counts for taxes that month. Paid on → goes into the budget as income on that day.</span>}
      onSave={(v) => update((d) => {
        const data = { task: v.task, start: new Date(v.start).toISOString(), end: new Date(v.end).toISOString() }
        const sid = s?.id ?? uid()
        if (s) Object.assign(d.sessions.find((x) => x.id === s.id)!, data)
        else d.sessions.push({ id: sid, clientId, ...data, invoiced: false, paid: false })
        setStatus(d, sid, { invoiced: !!v.invoiceDate || oldInvoiced, invoiceDate: v.invoiceDate || undefined, paid: !!v.paidDate, paidDate: v.paidDate || undefined })
        setTimeout(() => fetchMissingRates([sid]))
      })}
      onDelete={s ? () => update((d) => { d.sessions = d.sessions.filter((x) => x.id !== s.id) }) : undefined}
    />
  )
}

// set invoiced / paid on one entry and keep taxes and the budget in step:
// invoiced → revenue in the invoice month (needs an invoice date); paid → income in today's half
const setStatus = (d: State, id: string, o: { invoiced: boolean; invoiceDate?: string; paid: boolean; paidDate?: string }) => {
  const s = d.sessions.find((x) => x.id === id)
  if (!s) return
  if (o.invoiced) {
    if (o.invoiceDate && o.invoiceDate !== s.invoiceDate) { s.invoiceDate = o.invoiceDate; delete s.nbpRate; delete s.nbpTable }
    if (!s.invoiced) s.invoiceDate ??= today()
  } else { delete s.invoiceDate; delete s.nbpRate; delete s.nbpTable }
  s.invoiced = o.invoiced
  const items = () => Object.values(d.periods).flatMap((p) => p.items).filter((i) => i.fromSession === s.id)
  const drop = () => { for (const p of Object.values(d.periods)) p.items = p.items.filter((i) => i.fromSession !== s.id) }
  if (o.paid) {
    const day = o.paidDate ?? s.paidDate ?? today()
    const had = items()
    // payment moved to another day → move its budget line too
    if (s.paid && had.length && had[0].date !== day) drop()
    if (!s.paid || (had.length && had[0].date !== day)) {
      const c = d.clients.find((x) => x.id === s.clientId)
      // already counted as revenue in its invoice month → plain income; paid without an invoice → revenue now
      addIncome(d, periodOf(day, d.settings).key, { label: c?.name ?? 'Client', amount: r2(sessionMain(d, s)), currency: d.settings.mainCur, date: day, taxable: !s.invoiceDate, fromClient: s.clientId, fromSession: s.id })
    }
    s.paid = true
    s.paidDate = day
  } else {
    if (s.paid) drop()
    s.paid = false
    delete s.paidDate
  }
}
// € entries invoiced from the form get their NBP rate in the background
const fetchMissingRates = (ids: string[]) => {
  const st = useStore.getState().st
  for (const s of st.sessions.filter((x) => ids.includes(x.id) && x.invoiced && x.invoiceDate && !x.nbpRate && needsRate(st, x)))
    nbpRateForInvoice(s.invoiceDate!, sessionCur(st, s)).then((r) => update((d) => {
      const x = d.sessions.find((y) => y.id === s.id)
      if (x && x.invoiceDate === s.invoiceDate) { x.nbpRate = r.rate; x.nbpTable = r.table }
    })).catch(() => {})
}

const invoiceLines = (st: State, l: Session[]) =>
  l.map((s) => `${toLocalDate(s.start)}  ${s.task}  ${s.fee !== undefined ? '' : fmtHours(hours(s)) + '  '}${fmtSum(st, [s])}`).join('\n') +
  `\nTotal: ${fmtHours(l.reduce((a, s) => a + hours(s), 0))} · ${fmtSum(st, l)}`

// Mark hours as invoiced with the invoice date: the zł amount uses the NBP rate (table A) from the
// last working day before that date — the same one inFakt puts on the invoice.
const InvoiceSheet = ({ ids, fix }: { ids: string[]; fix?: boolean }) => {
  const st = useSt()
  const ss = st.sessions.filter((s) => ids.includes(s.id))
  const first = ss.find((s) => s.invoiceDate)
  const [date, setDate] = useState(first?.invoiceDate ?? today())
  const [rate, setRate] = useState(first?.nbpRate ? numText(first.nbpRate) : '')
  const [table, setTable] = useState(first?.nbpTable ?? '')
  const [state, setState] = useState<'idle' | 'loading' | 'fail'>('idle')
  const load = async (d: string, rateCur: string) => {
    setState('loading')
    try {
      const r = await nbpRateForInvoice(d, rateCur)
      setRate(numText(r.rate)); setTable(`${r.table} (${fmtDay(r.date)})`); setState('idle')
    } catch { setState('fail'); setTable('') }
  }
  const foreign = ss.filter((s) => needsRate(st, s)) // zł fees need no exchange rate
  const anyEur = foreign.length > 0
  const rateCur = foreign[0] ? sessionCur(st, foreign[0]) : 'EUR'
  useEffect(() => { if (anyEur && !first?.nbpRate) load(date, rateCur) }, [])
  const eur = foreign.reduce((a, s) => a + sessionAmt(st, s), 0)
  const plnPart = ss.filter((s) => !needsRate(st, s)).reduce((a, s) => a + sessionAmt(st, s), 0)
  const r = parseNum(rate)
  const ok = !!date && (!anyEur || !!r)
  return (
    <Sheet title={fix ? (anyEur ? 'Invoice date & rate' : 'Invoice date') : 'Mark invoiced'}>
      <span className="t15 muted">{ss.length} {ss.length === 1 ? 'entry' : 'entries'} · {fmtSum(st, ss)}</span>
      <Field label="Invoice date"><input className="input" type="date" value={date} onChange={(e) => { setDate(e.target.value); if (e.target.value && anyEur) load(e.target.value, rateCur) }} /></Field>
      {anyEur && <Field label={`1 ${curSign(rateCur)} in zł — NBP, last working day before the invoice`}>
        <input className="input" inputMode="decimal" value={rate} placeholder={state === 'loading' ? 'Getting the NBP rate…' : 'e.g. 4,3955'} onChange={(e) => { setRate(e.target.value); setTable('typed by hand') }} />
        <span className="t13 muted">{state === 'loading' ? 'Getting the rate from NBP…' : state === 'fail' ? 'Couldn’t reach NBP — type the rate from the invoice' : table ? `Table ${table}` : ''}</span>
      </Field>}
      {ok ? <div className="card money" style={{ gap: 2, padding: 16 }}><span className="t14 w5">On the invoice</span><span className="mid">{fmtCur(r2(eur * (r ?? 0) + plnPart), 'PLN')}</span></div> : null}
      <button className="btn full" disabled={!ok} onClick={() => {
        if (!fix) copyText(invoiceLines(st, ss), 'Marked invoiced · lines copied for your invoice')
        update((d) => { for (const s of d.sessions) if (ids.includes(s.id)) Object.assign(s, needsRate(d, s) ? { invoiced: true, invoiceDate: date, nbpRate: r, nbpTable: table.split(' (')[0] } : { invoiced: true, invoiceDate: date }) })
        closeSheet()
      }}>{fix ? 'Save' : 'Mark invoiced (copies the lines)'}</button>
    </Sheet>
  )
}

const ClientSheet = ({ id }: { id: string }) => {
  const st = useSt()
  const c = st.clients.find((x) => x.id === id)!
  const ss = st.sessions.filter((s) => s.clientId === id).sort((a, b) => b.start.localeCompare(a.start))
  const unInv = ss.filter((s) => !s.invoiced)
  const unpaid = ss.filter((s) => s.invoiced && !s.paid)
  const eur = (l: Session[]) => fmtSum(st, l)
  const pln = (l: Session[]) => l.reduce((a, s) => a + sessionMain(st, s), 0)
  const noRate = unpaid.filter((s) => !s.nbpRate && needsRate(st, s))
  const tables = [...new Set(unpaid.filter((s) => s.nbpTable).map((s) => s.nbpTable))]
  const [all, setAll] = useState(false)
  const shown = all ? ss : ss.slice(0, 8)
  const markPaid = () => {
    const amount = r2(pln(unpaid))
    // hours with an invoice date are already counted as revenue (in their invoice month), so that part
    // of the payment is plain income; older hours without one still count as revenue when paid
    const old = r2(pln(unpaid.filter((s) => !s.invoiceDate)))
    if (c.kind && c.kind !== 'hourly') {
      update((d) => { for (const s of unpaid) setStatus(d, s.id, { invoiced: true, paid: true, paidDate: today() }) })
      toast(`${fmt(amount, true)} added to income`)
      return
    }
    update((d) => {
      for (const s of d.sessions) if (s.clientId === id && s.invoiced && !s.paid) { s.paid = true; s.paidDate = today() }
      const key = periodOf(today(), d.settings).key
      if (amount - old > 0.004) addIncome(d, key, { label: c.name, amount: r2(amount - old), currency: d.settings.mainCur, date: today(), taxable: false, fromClient: id })
      if (old > 0) addIncome(d, key, { label: c.name, amount: old, currency: d.settings.mainCur, date: today(), taxable: true, fromClient: id })
    })
    toast(`${fmt(amount, true)} added to income`)
  }
  return (
    <Sheet title={c.name} full>
      <div className="t15 muted">{c.kind === 'job' ? 'Fixed fee per job' : c.kind === 'fixed' ? `${fmtCur(c.fixedEur ?? 0, c.fixedCur ?? 'EUR')} a month, due on the ${ord(c.payDay ?? 1)}` : `${fmtCur(c.rateEur, c.cur ?? 'EUR', c.rateEur % 1 !== 0)} per hour`}</div>
      {unInv.length > 0 && (
        <div className="card work" style={{ gap: 6 }}>
          <span className="t14 w5">Not invoiced yet</span>
          <span className="mid">{c.kind && c.kind !== 'hourly' ? eur(unInv) : `${fmtHours(unInv.reduce((a, s) => a + hours(s), 0))} · ${eur(unInv)}`}</span>
          <span className="t14">{fmt(pln(unInv), true)} at today’s rate</span>
          <button className="btn" onClick={() => openSheet(<InvoiceSheet ids={unInv.map((s) => s.id)} />)}>Mark invoiced…</button>
        </div>
      )}
      {unpaid.length > 0 && (
        <div className="card money" style={{ gap: 6 }}>
          <span className="t14 w5">Invoiced, waiting for payment</span>
          <span className="mid" style={{ fontSize: fitSize(fmt(pln(unpaid), true), 30, 14) }}>{fmt(pln(unpaid), true)}</span>
          <span className="t14">{eur(unpaid)} · {unpaid.length} entries{tables.length ? ` · NBP ${tables.join(', ')}` : ''}</span>
          {noRate.length > 0 && <button className="btn soft sm" style={{ alignSelf: 'flex-start' }} onClick={() => openSheet(<InvoiceSheet ids={noRate.map((s) => s.id)} fix />)}>Set invoice date for the NBP rate</button>}
          <button className="btn" onClick={markPaid}>They paid → add to income</button>
        </div>
      )}
      <List title="Hours" right={`${ss.length} entries`} empty="No hours yet">
        {shown.map((s) => (
          <Row key={s.id} title={s.task} meta={`${fmtDay(toLocalDate(s.start))} · ${timeOf(s.start)}–${timeOf(s.end)} · ${s.paid ? 'paid' : s.invoiced ? 'invoiced' : 'not invoiced'}`}
            trail={s.fee !== undefined ? fmtSum(st, [s]) : `${fmtHours(hours(s))}`} dot={s.paid ? C.ok : s.invoiced ? C.money : C.work} onClick={() => openSheet(<SessionEdit clientId={id} id={s.id} />)} />
        ))}
        {!all && ss.length > 8 && <Row title={<span className="muted">Show all</span>} onClick={() => setAll(true)} />}
      </List>
      <div className="row">
        <button className="btn soft grow" onClick={() => openSheet(<SessionEdit clientId={id} />)}>{c.kind === 'job' ? '+ Add a job' : c.kind === 'fixed' ? '+ Add extra payment' : '+ Add hours'}</button>
        <button className="btn soft grow" onClick={() => openSheet(<ClientEdit id={id} />)}>Edit client</button>
      </div>
    </Sheet>
  )
}

// ================= TAXES =================
const Taxes = () => {
  const st = useSt()
  const ft = (n: number, dec = false) => fmtTax(st.settings, n, dec) // taxes are in their own currency
  const t = today()
  const curM = monthKey(t)
  const year = curM.slice(0, 4)
  // the payment to show: the earliest unpaid month before the current month
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
  // only months since taxes were first tracked here (ZUS is due every month, so older months would all look unpaid)
  const since = Object.keys(st.taxMonths).sort()[0] ?? prevMonth(curM)
  const candidates = [...months, ...Object.keys(st.taxMonths)].filter((m, i, a) => a.indexOf(m) === i && m < curM && m >= since).sort()
  // earliest unpaid past month; if everything is paid, the month that is accruing now
  const due = candidates.find((m) => !taxFor(st, m).paid && taxFor(st, m).total > 0) ?? curM
  const tx = taxFor(st, due)
  const [dy, dm] = due.split('-').map(Number)
  const dueDate = `${dm === 12 ? dy + 1 : dy}-${String(dm === 12 ? 1 : dm + 1).padStart(2, '0')}-${String(st.settings.taxDueDay).padStart(2, '0')}`
  const inDays = diffDays(t, dueDate)
  const payDate = dueDate.slice(0, 8) + String(st.settings.taxPayDay ?? st.settings.taxDueDay).padStart(2, '0')
  const revs = months.map((m) => taxFor(st, m).revenue)
  const past = months.map((m, i) => (m <= curM ? revs[i] : 0))
  const ytd = past.reduce((a, b) => a + b, 0)
  const nonZero = past.filter((r) => r > 0).length || 1
  const max = Math.max(...revs, 1)
  // the footer always speaks about this calendar month (its PIT is paid next month)
  const after = curM
  const afterTx = taxFor(st, after)
  const afterDue = `${nextMonth(curM)}-${String(st.settings.taxDueDay).padStart(2, '0')}`
  const yearPit = months.reduce((a, m) => a + taxFor(st, m).pit, 0)

  const zus = r2(tx.dra + tx.rca)
  const [details, setDetails] = useState(false) // transfer details, closed until it's time to pay
  const editMonth = (m: string) => openSheet(<TaxMonthSheet m={m} />)
  // the number that identifies me on the tax transfer (chosen in Settings › Taxes & accounts)
  const s = st.settings
  const idKind = s.taxIdKind ?? (s.nip ? 'nip' : s.regon ? 'regon' : s.pesel ? 'pesel' : undefined)
  const idNum = idKind ? s[idKind] : undefined
  const ID_NAME = { nip: 'NIP', regon: 'REGON', pesel: 'PESEL' } as const
  return (
    <>
      <div className="card dark" style={{ gap: 6 }}>
        <div className="between">
          <span className="t15 w5">{monthName(due, true)} · {inDays < 0 ? `${-inDays} days late` : `you pay ${fmtDay(payDate)} · deadline ${fmtDay(dueDate)}`}</span>
          {(tx.zusPaid || tx.pitPaid) && <span className="pill"><Icon.check color="#1E1E1E" size={13} /> {tx.paid ? 'paid' : tx.zusPaid ? 'ZUS paid' : 'PIT paid'}</span>}
        </div>
        <div className="big" style={{ fontSize: fitSize(ft(tx.paid ? tx.total : tx.left), 60, 9) }}>{ft(tx.paid ? tx.total : tx.left)}</div>
        <div className="parts" style={{ paddingTop: 6 }}>
          <Quota label="ZUS (DRA + RCA)" amount={zus} paid={tx.zusPaid} />
          <Quota label="PIT-28" amount={tx.pit} paid={tx.pitPaid} />
        </div>
        <span className="t13" style={{ opacity: 0.7 }}>Tap an amount to copy it</span>
        {/* ZUS and PIT are sometimes paid on different days */}
        <div className="btn2" style={{ paddingTop: 4 }}>
          <button className={'btn ' + (tx.zusPaid ? 'ghost' : 'money')} onClick={() => update((d) => setTaxPaid(d, due, 'zus', !tx.zusPaid))}>{tx.zusPaid ? 'Undo ZUS paid' : 'Mark ZUS paid'}</button>
          <button className={'btn ' + (tx.pitPaid ? 'ghost' : 'money')} onClick={() => update((d) => setTaxPaid(d, due, 'pit', !tx.pitPaid))}>{tx.pitPaid ? 'Undo PIT paid' : 'Mark PIT paid'}</button>
        </div>
        <span className="t13" style={{ opacity: 0.7 }}>Already in your budget for {fmtDay(payDate)}. Revenue {ft(tx.revenue, true)} · <u onClick={() => editMonth(due)}>edit</u></span>
      </div>
      {/* everything typed into the transfer form, once a month (or twice, when paid on different days) */}
      <div className="card" style={{ gap: 0, padding: '4px 0' }}>
        <button className="between" style={{ padding: '14px 20px', alignItems: 'center' }} onClick={() => setDetails(!details)}>
          <span className="t17">Transfer details</span>
          <span style={{ display: 'flex', transform: details ? 'rotate(-90deg)' : 'rotate(90deg)', transition: 'transform .15s', color: 'var(--ink2)' }}><Icon.chevR /></span>
        </button>
        {details && (
          <div className="copylist">
            {([
              ['ZUS account', s.zusAccount?.trim()],
              ['PIT account', s.taxAccount?.trim()],
              [idKind ? ID_NAME[idKind] : 'NIP', idNum],
              ['Basis', s.zusBasis ? bankAmount(s.zusBasis) : undefined],
              ['Title', zusTitle(due)]
            ] as [string, string | undefined][]).map(([label, value]) => (
              <button key={label} className="copyrow" disabled={!value} onClick={() => value && copyText(value, `${label} copied`)}>
                <span className="k">{label}</span>
                <span className="v">{value ?? 'add in Settings'}</span>
                {value && <span className="c" aria-hidden><Icon.copy /></span>}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="card" style={{ gap: 10, paddingTop: 16, paddingBottom: 16 }}>
        <div className="between" style={{ alignItems: 'flex-end' }}>
          <button className="col" style={{ textAlign: 'left' }} onClick={() => copyText(bankAmount(ytd), `${bankAmount(ytd)} copied`)}><span className="t14 w5 muted">Revenue {year} so far</span><span className="mid" style={{ fontSize: fitSize(ft(ytd), 30, 9) }}>{ft(ytd)}</span></button>
          <div className="col" style={{ alignItems: 'flex-end' }}><span className="t14 w5 muted">avg / month</span><span className="t17" style={{ fontSize: 20 }}>{ft(ytd / nonZero)}</span></div>
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
        <Row dot={C.money} title={`${monthName(after, true)} cash flow`} meta="Revenue so far · grows as you invoice" trail={ft(afterTx.revenue)} onClick={() => editMonth(after)} />
        {/* what next month's PIT will roughly be, from the revenue counted so far (even before this month is paid) */}
        <Row dot={C.money} title={`Estimated PIT-28 for ${monthName(after, true)}`} meta={`So far · to be paid by ${fmtDay(afterDue)}`} trail={ft(afterTx.pit)} onClick={() => editMonth(after)} />
        <Row dot={C.money} title={`Annual PIT-28`} meta={`By 30 Apr ${Number(year) + 1} · ${ft(yearPit)} paid monthly this year`} onClick={() => editMonth(curM)} />
      </List>
      <div className="t13 muted" style={{ padding: '0 4px' }}>PIT = {Math.round(st.settings.pitRate * 100)}% × (revenue − ½ DRA). Tap any month to check or correct it. Rates are in Settings.</div>
    </>
  )
}

const TaxMonthSheet = ({ m }: { m: string }) => {
  const st = useSt()
  const ft = (n: number, dec = false) => fmtTax(st.settings, n, dec) // taxes are in their own currency
  const tm = st.taxMonths[m]
  const tx = taxFor(st, m)
  const fromIncome = revenueFromIncome(st, m)
  // both fields start filled in; PIT follows the revenue until you type your own number
  const [rev, setRev] = useState(numText(r2(tx.revenue)))
  const [pit, setPit] = useState(numText(r2(tx.pit)))
  const [pitOwn, setPitOwn] = useState(tm?.pitOverride !== undefined)
  const [zusPaid, setZusPaid] = useState(tx.zusPaid)
  const [pitPaid, setPitPaid] = useState(tx.pitPaid)
  const calcPit = (r: number) => Math.max(0, r2(st.settings.pitRate * (r - 0.5 * tx.dra)))
  const revNum = parseNum(rev) ?? 0
  const pitNum = pitOwn ? parseNum(pit) ?? 0 : calcPit(revNum)
  return (
    <Sheet title={`${monthName(m, true)} ${m.slice(0, 4)}`}>
      <Field label={`Revenue (invoices + business income: ${ft(fromIncome, true)})`}>
        <input className="input" inputMode="decimal" value={rev} onChange={(e) => { setRev(e.target.value); if (!pitOwn) setPit(numText(calcPit(parseNum(e.target.value) ?? 0))) }} />
      </Field>
      <Field label={pitOwn ? 'PIT-28 (your number)' : `PIT-28 (calculated: ${Math.round(st.settings.pitRate * 100)}% × (revenue − ½ DRA))`}>
        <input className="input" inputMode="decimal" value={pitOwn ? pit : numText(pitNum)} onChange={(e) => { setPit(e.target.value); setPitOwn(true) }} />
        {pitOwn && <button className="link" style={{ alignSelf: 'flex-start' }} onClick={() => { setPitOwn(false); setPit(numText(calcPit(revNum))) }}>Use the calculated amount</button>}
      </Field>
      <div className="seg">
        <button className={'chip' + (zusPaid ? ' on' : '')} onClick={() => setZusPaid(!zusPaid)}>{zusPaid ? '✓ ' : ''}ZUS paid</button>
        <button className={'chip' + (pitPaid ? ' on' : '')} onClick={() => setPitPaid(!pitPaid)}>{pitPaid ? '✓ ' : ''}PIT paid</button>
      </div>
      <div className="t14 muted">DRA {ft(tx.dra, true)} · RCA {ft(tx.rca, true)} · PIT {ft(pitNum, true)} = <b>{ft(r2(tx.dra + tx.rca + pitNum), true)}</b></div>
      <button className="btn full" onClick={() => {
        update((d) => {
          d.taxMonths[m] = {
            ...(d.taxMonths[m] ?? {}),
            revenueOverride: Math.abs(revNum - fromIncome) < 0.005 ? undefined : revNum,
            pitOverride: pitOwn ? pitNum : undefined,
            paid: zusPaid && pitPaid, zusPaid: zusPaid || undefined, pitPaid: pitPaid || undefined
          }
        })
        closeSheet()
      }}>Save</button>
    </Sheet>
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
const Quota = ({ label, amount, paid }: { label: string; amount: number; paid?: boolean }) => (
  <button className="quota" onClick={() => copyText(bankAmount(amount), `${bankAmount(amount)} copied`)}>
    <span className="t13 w5">{label}{paid ? ' · paid' : ''}</span>
    <span className="t17" style={paid ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}>{fmtTax(useStore.getState().st.settings, amount, true)}</span>
  </button>
)
// the title of the ZUS transfer: "Składki za listopad 2026" (the month the contributions are for)
const PL_MONTHS = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień']
const zusTitle = (mk: string) => `Składki za ${PL_MONTHS[+mk.slice(5, 7) - 1]} ${mk.slice(0, 4)}`
