import { useState } from 'react'
import { ensurePeriod, update, useSt } from '../store'
import type { Supply, SupplyCat } from '../types'
import { addDays, CAT_LABEL, fmt, fmtDay, nextBuy, periodOf, relDays, supplyStatus, today, uid } from '../lib'
import { C, Chips, Header, List, openSheet, Row, Sheet, closeSheet, toast, useUi } from '../ui'
import { FormSheet } from '../form'

const CATS: [SupplyCat, string][] = [['meds', 'Meds'], ['groceries', 'Groceries'], ['cats', 'Cats'], ['home', 'Home'], ['beauty', 'Beauty']]
const EMPTY: Record<SupplyCat, string> = {
  meds: 'Add your meds with price and how long a pack lasts.',
  groceries: 'Add staples that run out: coffee, oats, oil…',
  cats: 'Add cat food, litter, treats…',
  home: 'Add dish soap, toilet paper, trash bags…',
  beauty: 'Add shampoo, cream, cotton pads…'
}

export const buySupply = (id: string, qty?: number) =>
  update((d) => {
    const sp = d.supplies.find((x) => x.id === id)!
    const q = qty ?? sp.buyQty
    const from = sp.enoughUntil < today() ? today() : sp.enoughUntil
    sp.enoughUntil = addDays(from, Math.round((sp.lastsDays * q) / Math.max(1, sp.buyQty)))
    const key = periodOf(today(), d.settings).key
    ensurePeriod(d, key).items.push({ id: uid(), kind: 'expense', label: `${sp.name} (bought)`, amount: Math.round(sp.pricePerUnit * q * 100) / 100, date: today(), oneOff: true })
  })

export const Supplies = () => {
  const st = useSt()
  const cat = useUi((u) => u.sub.supplies) as SupplyCat
  const setSub = useUi((u) => u.setSub)
  const items = st.supplies.filter((s) => s.cat === cat)
  const withStatus = items.map((s) => ({ s, ...supplyStatus(s, st.settings) })).sort((a, b) => a.daysLeft - b.daysLeft)
  const buy = withStatus.filter((x) => x.state !== 'ok')
  const ok = withStatus.filter((x) => x.state === 'ok')
  const total = buy.reduce((a, x) => a + x.s.pricePerUnit * x.s.buyQty, 0)
  const runDate = buy.length ? buy.map((x) => nextBuy(x.s)).sort()[0] : null
  const projectBuys = cat === 'home' ? st.projects.filter((p) => !p.done && p.toBuy) : []
  return (
    <div className="screen">
      <Header sub="Everything that runs out" title="Supplies" />
      <Chips items={CATS} value={cat} onChange={setSub} />
      {buy.length > 0 && (
        <div className="card supplies" style={{ gap: 6 }}>
          <span className="t15 w5">Shopping run · {runDate === today() ? 'today' : fmtDay(runDate!)} · already in budget</span>
          <span className="mid">{buy.length} {buy.length === 1 ? 'thing' : 'things'} · {fmt(total)}</span>
          <button className="btn" style={{ marginTop: 6 }} onClick={() => { buy.forEach((x) => buySupply(x.s.id)); toast(`Bought ${buy.length} · budget updated`) }}>Bought them all</button>
        </div>
      )}
      <List title="Buy now" empty={items.length ? 'Nothing to buy — you’re covered.' : undefined}>
        {buy.map(({ s, daysLeft, state }) => (
          <Row key={s.id} dot={state === 'out' || daysLeft <= 2 ? C.alert : C.supplies} title={s.name}
            meta={`${daysLeft <= 0 ? 'Ran out' : 'Runs out'} ${fmtDay(s.enoughUntil)} · ${s.buyQty} ${s.unit ?? (s.buyQty === 1 ? 'pack' : 'packs')}`}
            trail={fmt(s.pricePerUnit * s.buyQty)} onClick={() => openSheet(<SupplySheet id={s.id} />)} />
        ))}
        {projectBuys.map((p) => <Row key={p.id} dot={C.home} title={p.toBuy!} meta={`For project: ${p.name}`} onClick={() => useUi.getState().go('home', 'projects')} />)}
      </List>
      <List title="You’re fine" empty={items.length ? undefined : EMPTY[cat]}>
        {ok.map(({ s, daysLeft }) => (
          <Row key={s.id} dot={C.ok} title={s.name} meta={`Enough till ${fmtDay(s.enoughUntil)} · then ${s.buyQty} × ${fmt(s.pricePerUnit, true)}`} trail={`${daysLeft} d`} onClick={() => openSheet(<SupplySheet id={s.id} />)} />
        ))}
      </List>
      <button className="btn full soft" onClick={() => openSheet(<SupplyEdit cat={cat} />)}>+ Add to {CAT_LABEL[cat]}</button>
    </div>
  )
}

const SupplySheet = ({ id }: { id: string }) => {
  const st = useSt()
  const s = st.supplies.find((x) => x.id === id)
  const [qty, setQty] = useState(s?.buyQty ?? 1)
  if (!s) return null
  const { daysLeft } = supplyStatus(s, st.settings)
  return (
    <Sheet title={s.name}>
      <div className="t15 muted">{daysLeft <= 0 ? `Ran out ${relDays(daysLeft)}` : `Enough till ${fmtDay(s.enoughUntil)} (${relDays(daysLeft)})`} · one buy = {s.buyQty} × {fmt(s.pricePerUnit, true)}, lasts {s.lastsDays} days</div>
      <div className="card supplies" style={{ gap: 10 }}>
        <span className="t15 w5">Just bought it?</span>
        <div className="between">
          <div className="stepper">
            <button onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
            <span className="mid" style={{ minWidth: 30, textAlign: 'center' }}>{qty}</span>
            <button onClick={() => setQty(qty + 1)}>+</button>
          </div>
          <span className="t17">{fmt(s.pricePerUnit * qty, true)}</span>
        </div>
        <button className="btn" onClick={() => { buySupply(s.id, qty); closeSheet(); toast('Got it · added to this half’s spending') }}>Bought {qty}</button>
      </div>
      <button className="btn full soft" onClick={() => openSheet(<SupplyEdit id={s.id} cat={s.cat} />)}>Edit</button>
    </Sheet>
  )
}

const SupplyEdit = ({ id, cat }: { id?: string; cat: SupplyCat }) => {
  const st = useSt()
  const s = st.supplies.find((x) => x.id === id)
  const init: Partial<Supply> = s ?? { cat, buyQty: 1, lastsDays: 30, enoughUntil: addDays(today(), 14) }
  return (
    <FormSheet title={s ? 'Edit' : `New in ${CAT_LABEL[cat]}`} initial={init}
      fields={[
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'pricePerUnit', label: 'Price per pack (zł)', type: 'number' },
        { key: 'buyQty', label: 'Packs per buy', type: 'number', step: 1 },
        { key: 'lastsDays', label: 'One buy lasts (days)', type: 'number', step: 1 },
        { key: 'enoughUntil', label: 'Enough until', type: 'date' },
        { key: 'cat', label: 'List', type: 'select', options: CATS }
      ]}
      onSave={(v) => update((d) => {
        const data = { name: v.name, pricePerUnit: v.pricePerUnit ?? 0, buyQty: v.buyQty || 1, lastsDays: v.lastsDays || 30, enoughUntil: v.enoughUntil || today(), cat: v.cat || cat }
        if (s) Object.assign(d.supplies.find((x) => x.id === s.id)!, data)
        else d.supplies.push({ id: uid(), ...data })
      })}
      onDelete={s ? () => update((d) => { d.supplies = d.supplies.filter((x) => x.id !== s.id) }) : undefined}
    />
  )
}
