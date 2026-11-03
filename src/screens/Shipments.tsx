import { useState } from 'react'
import { update, useSt } from '../store'
import { addDays, diffDays, fmtDay, fmtWeekday, today, uid } from '../lib'
import { C, Check, closeSheet, Field, List, openSheet, Row, Sheet } from '../ui'

export const COURIERS = ['InPost', 'DHL', 'DPD'] // anything else goes under Other

// when it's due, in words
const due = (eta: string | undefined, t: string) => {
  if (!eta) return { text: 'no date yet', late: false }
  const n = diffDays(t, eta)
  if (n < 0) return { text: `expected ${fmtDay(eta)}`, late: true }
  return { text: n === 0 ? 'arrives today' : n === 1 ? 'arrives tomorrow' : n < 7 ? `arrives ${fmtWeekday(eta)}` : `arrives ${fmtDay(eta)}`, late: false }
}

// courier picker: the usual four as chips, anything else typed in
export const CourierPick = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
  const other = !COURIERS.includes(value)
  return (
    <div className="col" style={{ gap: 8 }}>
      <div className="seg">
        {COURIERS.map((c) => <button key={c} type="button" className={'chip' + (value === c ? ' on' : '')} onClick={() => onChange(c)}>{c}</button>)}
        <button type="button" className={'chip' + (other ? ' on' : '')} onClick={() => onChange(other ? value : '')}>Other</button>
      </div>
      {other && <input className="input" value={value} placeholder="Courier" onChange={(e) => onChange(e.target.value)} />}
    </div>
  )
}

// Today block: parcels on their way, soonest first; tick when it's delivered (like the Parking lot)
export const ShipmentLog = () => {
  const st = useSt()
  const t = today()
  const all = (st.shipments ?? []).filter((x) => !x.deliveredAt || x.deliveredAt >= t)
  const open = all.filter((x) => !x.deliveredAt).sort((a, b) => (a.eta ?? '9999').localeCompare(b.eta ?? '9999'))
  const done = all.filter((x) => x.deliveredAt)
  const toggle = (id: string) => update((d) => { const x = d.shipments?.find((y) => y.id === id); if (x) x.deliveredAt = x.deliveredAt ? undefined : today() })
  return (
    <div className="list">
      <div className="list-h"><span className="t17">Shipment log</span></div>
      {[...open, ...done].map((x) => {
        const w = due(x.eta, t)
        return (
          <Row key={x.id} done={!!x.deliveredAt} title={x.name} dot={w.late && !x.deliveredAt ? C.alert : C.supplies}
            meta={x.deliveredAt ? `${x.courier || 'Courier'} · delivered` : `${x.courier || 'Courier'} · ${w.text}`}
            trail={<span onClick={(e) => { e.stopPropagation(); toggle(x.id) }} style={{ display: 'flex', padding: 4, margin: -4 }}><Check on={!!x.deliveredAt} /></span>}
            onClick={() => openSheet(<ShipmentSheet id={x.id} />)} />
        )
      })}
      <Row title={<span className="muted">+ Add a shipment</span>} onClick={() => openSheet(<ShipmentSheet />)} />
    </div>
  )
}

export const ShipmentSheet = ({ id }: { id?: string }) => {
  const st = useSt()
  const x = st.shipments?.find((y) => y.id === id)
  const [name, setName] = useState(x?.name ?? '')
  const [courier, setCourier] = useState(x?.courier ?? 'InPost')
  const [eta, setEta] = useState(x?.eta ?? addDays(today(), 2))
  const save = () => {
    if (!name.trim()) return
    update((d) => {
      d.shipments ??= []
      const y = d.shipments.find((z) => z.id === id)
      const data = { name: name.trim(), courier: courier.trim(), eta: eta || undefined }
      if (y) Object.assign(y, data)
      else d.shipments.push({ id: uid(), ...data })
    })
    closeSheet()
  }
  return (
    <Sheet title={x ? 'Shipment' : 'New shipment'}>
      <Field label="What’s coming"><input className="input" autoFocus={!x} value={name} placeholder="Cat litter" onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Courier"><CourierPick value={courier} onChange={setCourier} /></Field>
      <Field label="Delivery date"><input className="input" type="date" value={eta} onChange={(e) => setEta(e.target.value)} /></Field>
      <button className="btn full" disabled={!name.trim()} onClick={save}>Save</button>
      {x && !x.deliveredAt && <button className="btn full soft" onClick={() => { update((d) => { const y = d.shipments!.find((z) => z.id === id)!; y.deliveredAt = today() }); closeSheet() }}>Delivered</button>}
      {x && <button className="btn full soft" onClick={() => { update((d) => { d.shipments = d.shipments!.filter((z) => z.id !== id) }); closeSheet() }}>Delete</button>}
    </Sheet>
  )
}

// a shipment for a supply that was just bought online
export const addShipment = (name: string, courier: string, eta?: string, supplyId?: string) =>
  update((d) => { (d.shipments ??= []).push({ id: uid(), name, courier, eta: eta || undefined, supplyId }) })
