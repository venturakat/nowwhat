import { useState } from 'react'
import { ensurePeriod, update, useSt } from '../store'
import type { Supply, SupplyCat } from '../types'
import { curSign, mainCur, addDays, CAT_LABEL, editProjectBuy, fmt, fmtDay, nextBuy, periodOf, relDays, supplyStatus, today, uid } from '../lib'
import { C, Chips, Field, Header, List, openSheet, Row, Sheet, closeSheet, toast, registerSubs, useUi } from '../ui'
import { addShipment, CourierPick } from './Shipments'
import { FormSheet } from '../form'
import { getLang, tr, trn } from '../i18n'

const CATS: [SupplyCat, string][] = [['meds', 'Meds'], ['groceries', 'Groceries'], ['pets', 'Pets'], ['home', 'Home'], ['care', 'Care']]
registerSubs('supplies', CATS.map((x) => x[0]))
// in Ukrainian «Дім» is the Home tab, so the supplies list says «Для дому»
const catItems = (): [SupplyCat, string][] => CATS.map(([k, l]) => [k, k === 'home' && getLang() !== 'en' ? tr('Home supplies') : l])
const EMPTY: Record<SupplyCat, string> = {
  meds: 'Add your meds with price and how long a pack lasts.',
  groceries: 'Add staples that run out: coffee, oats, oil…',
  pets: 'Add pet food, litter, treats…',
  home: 'Add dish soap, toilet paper, trash bags…',
  care: 'Add shampoo, cream, cotton pads…'
}

export const buySupply = (id: string, qty?: number) =>
  update((d) => {
    const sp = d.supplies.find((x) => x.id === id)!
    const q = qty ?? sp.buyQty
    const key = periodOf(today(), d.settings).key
    ensurePeriod(d, key).items.push({ id: uid(), kind: 'expense', label: tr('{name} (bought)', { name: sp.name }), bought: true, amount: Math.round(sp.pricePerUnit * q * 100) / 100, date: today(), oneOff: true })
    if (sp.once) { // one-time: done (and ticked off its project)
      d.supplies = d.supplies.filter((x) => x.id !== id)
      if (sp.projectId) editProjectBuy(d, sp.projectId, sp.name)
      return
    }
    const from = sp.enoughUntil < today() ? today() : sp.enoughUntil
    sp.enoughUntil = addDays(from, Math.round((sp.lastsDays * q) / Math.max(1, sp.buyQty)))
  })

// the dock's Supplies button turns into "Add new" while Supplies is open: adds to the list on screen
export const addSupply = () => openSheet(<SupplyEdit cat={(useUi.getState().sub.supplies || CATS[0][0]) as SupplyCat} />)

export const Supplies = () => {
  const st = useSt()
  const cat = useUi((u) => u.sub.supplies) as SupplyCat
  const setSub = useUi((u) => u.setSub)
  const items = st.supplies.filter((s) => s.cat === cat && !s.paused)
  const paused = st.supplies.filter((s) => s.cat === cat && s.paused).sort((a, b) => a.name.localeCompare(b.name))
  const withStatus = items.map((s) => ({ s, ...supplyStatus(s, st.settings) })).sort((a, b) => a.daysLeft - b.daysLeft)
  const buy = withStatus.filter((x) => x.state !== 'ok')
  const ok = withStatus.filter((x) => x.state === 'ok')
  const total = buy.reduce((a, x) => a + x.s.pricePerUnit * x.s.buyQty, 0)
  const runDate = buy.length ? buy.map((x) => nextBuy(x.s, st.settings)).sort()[0] : null
  const projName = (pid?: string) => st.projects.find((p) => p.id === pid)?.name
  return (
    <div className="screen">
      <Header sub="Everything that runs out" title="Supplies" />
      <Chips items={catItems()} value={cat} onChange={setSub} swipe />
      {buy.length > 0 && (
        <div className="card supplies" style={{ gap: 6 }}>
          <span className="t15 w5">{tr('Shopping run · {d} · already in budget', { d: runDate === today() ? tr('today') : fmtDay(runDate!) })}</span>
          <span className="mid">{trn(buy.length, '{n} thing', '{n} things')} · {fmt(total)}</span>
          <button className="btn" style={{ marginTop: 6 }} onClick={() => { buy.forEach((x) => buySupply(x.s.id)); toast(tr('Bought {n} · budget updated', { n: buy.length })) }}>{tr('Bought them all')}</button>
        </div>
      )}
      {(items.length > 0 || !paused.length) && <>
      <List title="Buy now" empty={items.length ? 'Nothing to buy — you’re covered.' : undefined}>
        {buy.map(({ s, daysLeft, state }) => (
          <Row key={s.id} dot={s.once ? C.home : state === 'out' ? C.alert : C.warn} title={s.name}
            meta={<>{s.details && <div className="details">{s.details}</div>}{s.once ? (s.projectId ? tr('For project: {p}', { p: projName(s.projectId) ?? '' }) : tr('One-time buy')) : `${tr(daysLeft <= 0 ? 'Ran out {d}' : 'Runs out {d}', { d: fmtDay(s.enoughUntil) })} · ${s.unit ? `${s.buyQty} ${s.unit}` : trn(s.buyQty, '{n} item', '{n} items')}`}</>}
            trail={s.pricePerUnit ? fmt(s.pricePerUnit * s.buyQty) : s.once ? tr('add price') : fmt(0)} onClick={() => openSheet(<SupplySheet id={s.id} />)} />
        ))}
      </List>
      <List title="You’re fine" empty={items.length || paused.length ? undefined : EMPTY[cat]}>
        {ok.map(({ s, daysLeft }) => (
          <Row key={s.id} dot={C.ok} title={s.name} meta={<>{s.details && <div className="details">{s.details}</div>}{tr('Enough till {d} · then {q} × {p}', { d: fmtDay(s.enoughUntil), q: s.buyQty, p: fmt(s.pricePerUnit, true) })}</>} trail={tr('{n} d', { n: daysLeft })} onClick={() => openSheet(<SupplySheet id={s.id} />)} />
        ))}
      </List>
      </>}
      {paused.length > 0 && (
        <List title="Paused" right="not bought for now">
          {paused.map((s) => <Row key={s.id} dot={C.line} title={<span className="muted">{s.name}</span>} meta={s.details} onClick={() => openSheet(<SupplySheet id={s.id} />)} />)}
        </List>
      )}
    </div>
  )
}

const SupplySheet = ({ id }: { id: string }) => {
  const st = useSt()
  const s = st.supplies.find((x) => x.id === id)
  const [qty, setQty] = useState(s?.buyQty ?? 1)
  const [online, setOnline] = useState(false)
  const [courier, setCourier] = useState('InPost')
  const [eta, setEta] = useState(addDays(today(), 2))
  if (!s) return null
  const { daysLeft } = supplyStatus(s, st.settings)
  const pause = (on: boolean) => {
    update((d) => { const x = d.supplies.find((y) => y.id === id); if (x) x.paused = on || undefined })
    closeSheet(); toast(tr(on ? 'Paused · off the lists and the budget' : 'Back on the list'))
  }
  if (s.paused) return (
    <Sheet title={s.name}>
      {s.details && <div className="t17" style={{ marginTop: -4 }}>{s.details}</div>}
      <div className="t15 muted">{tr('Paused — not on the shopping list, Today or in the budget. Everything about it is kept.')}</div>
      <button className="btn full" onClick={() => pause(false)}>{tr('Resume')}</button>
      <button className="btn full soft" onClick={() => openSheet(<SupplyEdit id={s.id} cat={s.cat} />)}>{tr('Edit')}</button>
    </Sheet>
  )
  return (
    <Sheet title={s.name}>
      {s.details && <div className="t17" style={{ marginTop: -4 }}>{s.details}</div>}
      <div className="t15 muted">{s.once ? `${s.projectId ? tr('For project: {p}', { p: st.projects.find((p) => p.id === s.projectId)?.name ?? '' }) : tr('One-time buy')} · ${s.pricePerUnit ? tr('{p} each', { p: fmt(s.pricePerUnit, true) }) : tr('no price yet')}` : <>{daysLeft <= 0 ? tr('Ran out {d}', { d: relDays(daysLeft) }) : tr('Enough till {d} ({rel})', { d: fmtDay(s.enoughUntil), rel: relDays(daysLeft) })} · {trn(s.lastsDays, 'one buy = {q} × {p}, lasts {n} day', 'one buy = {q} × {p}, lasts {n} days', { q: s.buyQty, p: fmt(s.pricePerUnit, true) })}</>}</div>
      <div className="card supplies" style={{ gap: 10 }}>
        <span className="t15 w5">{tr('Just bought it?')}</span>
        <div className="between">
          <div className="stepper">
            <button onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
            <span className="mid" style={{ minWidth: 30, textAlign: 'center' }}>{qty}</span>
            <button onClick={() => setQty(qty + 1)}>+</button>
          </div>
          <span className="t17">{fmt(s.pricePerUnit * qty, true)}</span>
        </div>
        {s.cat !== 'groceries' && (
          // ordered online? then it also goes on the Shipment log (Today) with the courier and delivery date
          <>
            <button className="row" style={{ gap: 12, padding: '4px 0' }} onClick={() => setOnline(!online)}>
              <span className="t15 grow" style={{ textAlign: 'left' }}>{tr('Ordered online · track the delivery')}</span>
              <span className={'switch' + (online ? ' on' : '')} role="switch" aria-checked={online}><i /></span>
            </button>
            {online && (
              <>
                <CourierPick value={courier} onChange={setCourier} />
                <Field label="Delivery date"><input className="input" type="date" value={eta} onChange={(e) => setEta(e.target.value)} /></Field>
              </>
            )}
          </>
        )}
        <button className="btn" onClick={() => {
          buySupply(s.id, qty)
          if (online && s.cat !== 'groceries') addShipment(qty > 1 ? `${s.name} × ${qty}` : s.name, courier.trim(), eta, s.id)
          closeSheet()
          toast(tr(online && s.cat !== 'groceries' ? 'Got it · on the Shipment log' : s.once ? 'Got it · off the list, added to spending' : 'Got it · added to this fortnight’s spending'))
        }}>{tr('Bought {n}', { n: qty })}</button>
      </div>
      <button className="btn full soft" onClick={() => openSheet(<SupplyEdit id={s.id} cat={s.cat} />)}>{tr(s.once && !s.pricePerUnit ? 'Add price & details' : 'Edit')}</button>
      <button className="btn full soft" onClick={() => pause(true)}>{tr('Pause for now')}</button>
      {s.projectId && <button className="btn full soft" onClick={() => { closeSheet(); useUi.getState().go('home', 'projects') }}>{tr('Open projects')}</button>}
    </Sheet>
  )
}

export const SupplyEdit = ({ id, cat }: { id?: string; cat: SupplyCat }) => {
  const st = useSt()
  const s = st.supplies.find((x) => x.id === id)
  const init: Partial<Supply> = s ?? { cat, buyQty: 1, lastsDays: 30, enoughUntil: addDays(today(), 14) }
  return (
    <FormSheet title={s ? 'Edit' : tr('New in {list}', { list: tr(CAT_LABEL[cat]) })} initial={init}
      fields={[
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'details', label: 'Details', type: 'text', placeholder: 'Dosage, pack size, amount, flavour…' },
        { key: 'pricePerUnit', label: tr('Price per item ({c})', { c: curSign(mainCur()) }), type: 'number' },
        { key: 'once', label: 'One-time purchase', type: 'check' },
        { key: 'buyQty', label: 'Items per buy', type: 'number', step: 1, off: (v) => !!v.once },
        { key: 'lastsDays', label: 'One buy lasts (days)', type: 'number', step: 1, off: (v) => !!v.once },
        { key: 'enoughUntil', label: 'Enough until', type: 'date', off: (v) => !!v.once },
        { key: 'cat', label: 'List', type: 'select', options: catItems() }
      ]}
      onSave={(v) => update((d) => {
        const once = !!v.once
        const data = { name: v.name, details: v.details?.trim() || undefined, pricePerUnit: v.pricePerUnit ?? 0, buyQty: once ? 1 : v.buyQty || 1, lastsDays: v.lastsDays || 30, enoughUntil: once ? today() : v.enoughUntil || today(), cat: v.cat || cat, once: once || undefined }
        if (s?.projectId && data.name.trim() !== s.name) editProjectBuy(d, s.projectId, s.name, data.name) // renamed: rename it in the project too
        if (s) Object.assign(d.supplies.find((x) => x.id === s.id)!, data)
        else d.supplies.push({ id: uid(), ...data })
      })}
      onDelete={s ? () => update((d) => { d.supplies = d.supplies.filter((x) => x.id !== s.id); if (s.projectId) editProjectBuy(d, s.projectId, s.name) }) : undefined}
    />
  )
}
