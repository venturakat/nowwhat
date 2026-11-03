import { useState, type ReactNode } from 'react'
import { update, useSt } from '../store'
import type { ID, PackItem, State, Trip } from '../types'
import { addDays, diffDays, fmtDay, today, uid } from '../lib'
import { C, Check, closeSheet, Field, Icon, List, openSheet, popSheet, pushSheet, Row, Sheet, toast } from '../ui'
import { byFormula, CATS, Tile } from './Closet'

// Travel (Closet › Travel): packing lists. A list mixes things from the wardrobe, from Supplies › Care
// and anything typed in by hand. Tick things off as they go into the suitcase.

const dates = (x: Trip) => {
  if (!x.start) return 'no dates yet'
  if (!x.end || x.end === x.start) return fmtDay(x.start)
  return `${fmtDay(x.start)} – ${fmtDay(x.end)}`
}
const isPast = (x: Trip, t: string) => !!(x.end ?? x.start) && (x.end ?? x.start)! < t
const when = (x: Trip, t: string) => {
  if (!x.start) return ''
  const n = diffDays(t, x.start)
  return n > 1 ? ` · in ${n} days` : n === 1 ? ' · tomorrow' : n === 0 ? ' · today' : ''
}
// the current name of what an item points to (the wardrobe thing or supply may have been renamed)
const nameOf = (st: State, i: PackItem) =>
  (i.src === 'closet' ? st.closet.find((c) => c.id === i.refId)?.name : i.src === 'care' ? st.supplies.find((s) => s.id === i.refId)?.name : undefined) ?? i.name
const count = (x: Trip) => `${x.items.filter((i) => i.packed).length} of ${x.items.length} packed`

export const Travel = () => {
  const st = useSt()
  const t = today()
  const all = (st.trips ?? []).slice().sort((a, b) => (a.start ?? '9999').localeCompare(b.start ?? '9999'))
  const coming = all.filter((x) => !isPast(x, t))
  const past = all.filter((x) => isPast(x, t)).reverse()
  const row = (x: Trip, done = false) => {
    return (
      <Row key={x.id} done={done} dot={done ? C.line : C.closet} title={x.name}
        meta={`${dates(x)}${done ? '' : when(x, t)}${x.items.length ? ` · ${count(x)}` : ' · empty'}`}
        trail={<Icon.chevR />} onClick={() => openSheet(<TripSheet id={x.id} />)} />
    )
  }
  return (
    <>
      <List title="Packing lists" empty="Make a list for your next trip: clothes from your wardrobe, care things from Supplies, and anything else.">
        {coming.map((x) => row(x))}
      </List>
      <button className="btn full soft" onClick={() => openSheet(<TripEdit />)}>+ New packing list</button>
      {past.length > 0 && <List title="Past trips">{past.map((x) => row(x, true))}</List>}
    </>
  )
}

// name, dates, and (for a new one) which earlier list to start from
const TripEdit = ({ id }: { id?: string }) => {
  const st = useSt()
  const x = st.trips?.find((y) => y.id === id)
  const [name, setName] = useState(x?.name ?? '')
  const [start, setStart] = useState(x?.start ?? '')
  const [end, setEnd] = useState(x?.end ?? '')
  const [from, setFrom] = useState<ID | ''>('')
  const others = (st.trips ?? []).filter((y) => y.items.length)
  const save = () => {
    if (!name.trim()) return
    const nid = uid()
    update((d) => {
      d.trips ??= []
      const e = end && start && end < start ? start : end
      const data = { name: name.trim(), start: start || undefined, end: e || undefined }
      const y = d.trips.find((z) => z.id === id)
      if (y) Object.assign(y, data)
      else {
        const src = d.trips.find((z) => z.id === from)
        d.trips.push({ id: nid, ...data, items: (src?.items ?? []).map((i) => ({ ...i, id: uid(), packed: undefined })) })
      }
    })
    if (x) popSheet()
    else openSheet(<TripSheet id={nid} />)
  }
  return (
    <Sheet title={x ? 'Edit trip' : 'New packing list'} onBack={x ? () => popSheet() : undefined}>
      <Field label="Trip"><input className="input" autoFocus={!x} value={name} placeholder="Weekend in Kraków" onChange={(e) => setName(e.target.value)} /></Field>
      <div className="row" style={{ gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}><Field label="From"><input className="input" type="date" value={start} onChange={(e) => { setStart(e.target.value); if (e.target.value && (!end || end < e.target.value)) setEnd(addDays(e.target.value, 2)) }} /></Field></div>
        <div style={{ flex: 1, minWidth: 0 }}><Field label="To"><input className="input" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field></div>
      </div>
      {!x && others.length > 0 && (
        <Field label="Start from">
          <div className="seg">
            <button type="button" className={'chip' + (from === '' ? ' on' : '')} onClick={() => setFrom('')}>Empty list</button>
            {others.map((y) => <button key={y.id} type="button" className={'chip' + (from === y.id ? ' on' : '')} onClick={() => setFrom(y.id)}>{y.name}</button>)}
          </div>
        </Field>
      )}
      <button className="btn full" disabled={!name.trim()} onClick={save}>{x ? 'Save' : 'Create'}</button>
    </Sheet>
  )
}

const TripSheet = ({ id }: { id: string }) => {
  const st = useSt()
  const x = st.trips?.find((y) => y.id === id)
  const [text, setText] = useState('')
  if (!x) return null
  const edit = (f: (y: Trip) => void) => update((d) => { const y = d.trips?.find((z) => z.id === id); if (y) f(y) })
  const toggle = (iid: ID) => edit((y) => { const i = y.items.find((z) => z.id === iid); if (i) i.packed = !i.packed || undefined })
  // − at one piece takes it off the list
  const step = (iid: ID, by: 1 | -1) => edit((y) => {
    const i = y.items.find((z) => z.id === iid)
    if (!i) return
    const n = (i.qty ?? 1) + by
    if (n < 1) y.items = y.items.filter((z) => z.id !== iid)
    else i.qty = n > 1 ? n : undefined
  })
  const addOwn = () => {
    const names = text.split(',').map((s) => s.trim()).filter(Boolean)
    if (!names.length) return
    edit((y) => { for (const name of names) y.items.push({ id: uid(), src: 'own', name }) })
    setText('')
  }
  const clothes = byFormula(x.items.filter((i) => i.src === 'closet').map((i) => ({ i, cat: st.closet.find((c) => c.id === i.refId)?.cat ?? 'other' as const })))
  const groups = CATS.map(([cat, label]) => ({ cat, label, items: clothes.filter((c) => c.cat === cat).map((c) => c.i) })).filter((g) => g.items.length)
  const pieces = (xs: PackItem[]) => xs.reduce((a, i) => a + (i.qty ?? 1), 0) || undefined
  const care = x.items.filter((i) => i.src === 'care')
  const own = x.items.filter((i) => i.src === 'own')
  const btn = (label: string, onClick: () => void, child: ReactNode) => (
    <span role="button" aria-label={label} className="qbtn" onClick={(e) => { e.stopPropagation(); onClick() }}>{child}</span>
  )
  const item = (i: PackItem) => (
    <Row key={i.id} done={!!i.packed} title={nameOf(st, i)} onClick={() => toggle(i.id)}
      trail={<span className="row" style={{ gap: 12, alignItems: 'center' }}>
        <span className="qty">
          {btn((i.qty ?? 1) > 1 ? 'One less' : 'Remove', () => step(i.id, -1), (i.qty ?? 1) > 1 ? '−' : <Icon.x />)}
          <span className="n">{i.qty ?? 1}</span>
          {btn('One more', () => step(i.id, 1), '+')}
        </span>
        <Check on={!!i.packed} />
      </span>} />
  )
  const packed = x.items.filter((i) => i.packed).length
  return (
    <Sheet title={x.name}>
      <div className="t15 muted" style={{ marginTop: -4 }}>{dates(x)}{when(x, today())}{x.items.length ? ` · ${count(x)}` : ''}</div>
      <List title="Clothes" right={pieces(clothes.map((c) => c.i))}>
        {groups.map((g) => (
          <div key={g.cat} className="pgroup">
            <div className="list-sub">{g.label}</div>
            {g.items.map((i) => item(i))}
          </div>
        ))}
        <Row title={<span className="muted">+ Add from wardrobe</span>} onClick={() => pushSheet(<ClosetPick id={id} />)} />
      </List>
      <List title="Care" right={pieces(care)}>
        {care.length > 0 && <div className="pgroup">{care.map((i) => item(i))}</div>}
        <Row title={<span className="muted">+ Add from Supplies › Care</span>} onClick={() => pushSheet(<CarePick id={id} />)} />
      </List>
      <List title="Other" right={pieces(own)}>
        {own.length > 0 && <div className="pgroup">{own.map((i) => item(i))}</div>}
        <div className="row" style={{ gap: 8, padding: '6px 12px 10px' }}>
          <input className="input" style={{ flex: 1, minWidth: 0 }} value={text} placeholder="Charger, passport, book…" enterKeyHint="done"
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addOwn() }} />
          <button className="btn" disabled={!text.trim()} onClick={addOwn}>Add</button>
        </div>
      </List>
      {packed > 0 && <button className="btn full soft" onClick={() => { edit((y) => { for (const i of y.items) i.packed = undefined }); toast('Everything unticked') }}>Untick everything</button>}
      <button className="btn full soft" onClick={() => pushSheet(<TripEdit id={id} />)}>Edit trip</button>
      <button className="btn full soft" onClick={() => { update((d) => { d.trips = (d.trips ?? []).filter((z) => z.id !== id) }); closeSheet(); toast('Packing list deleted') }}>Delete list</button>
    </Sheet>
  )
}

// keep what's already on the list (and its tick), add the newly chosen ones, drop the unchosen ones
const syncRefs = (id: ID, src: 'closet' | 'care', ids: ID[], nameFor: (rid: ID) => string) =>
  update((d) => {
    const y = d.trips?.find((z) => z.id === id)
    if (!y) return
    const had = new Set(y.items.filter((i) => i.src === src).map((i) => i.refId))
    y.items = y.items.filter((i) => i.src !== src || ids.includes(i.refId!))
    for (const rid of ids) if (!had.has(rid)) y.items.push({ id: uid(), src, refId: rid, name: nameFor(rid) })
  })

// choose wardrobe things, by category (or a whole saved outfit at once)
const ClosetPick = ({ id }: { id: ID }) => {
  const st = useSt()
  const x = st.trips?.find((y) => y.id === id)
  const [ids, setIds] = useState<ID[]>(() => (x?.items ?? []).filter((i) => i.src === 'closet' && i.refId).map((i) => i.refId!))
  const toggle = (cid: ID) => setIds(ids.includes(cid) ? ids.filter((z) => z !== cid) : [...ids, cid])
  const outfits = st.outfits.filter((o) => o.itemIds.some((i) => st.closet.some((c) => c.id === i)))
  return (
    <Sheet title="From wardrobe" onBack={() => popSheet()}>
      {!st.closet.length && <span className="t15 muted">Your wardrobe is empty — add things in Closet › I own.</span>}
      {outfits.length > 0 && (
        <div className="col" style={{ gap: 8 }}>
          <span className="t14 w5">Whole outfits</span>
          <div className="seg">
            {outfits.map((o) => {
              const its = o.itemIds.filter((i) => st.closet.some((c) => c.id === i))
              const on = its.every((i) => ids.includes(i))
              return <button key={o.id} className={'chip' + (on ? ' on' : '')} onClick={() => setIds(on ? ids.filter((z) => !its.includes(z)) : [...new Set([...ids, ...its])])}>{o.name}</button>
            })}
          </div>
        </div>
      )}
      {CATS.map(([cat, label]) => {
        const items = st.closet.filter((c) => c.cat === cat)
        if (!items.length) return null
        return (
          <div key={cat} className="col" style={{ gap: 8 }}>
            <span className="t14 w5">{label}</span>
            <div className="hscroll">{items.map((i) => <Tile key={i.id} it={i} size={72} sel={ids.includes(i.id)} onClick={() => toggle(i.id)} />)}</div>
          </div>
        )
      })}
      <div className="sheet-foot">
        <button className="btn full" onClick={() => { syncRefs(id, 'closet', ids, (r) => st.closet.find((c) => c.id === r)?.name ?? ''); popSheet() }}>
          {ids.length ? `Pack ${ids.length} ${ids.length === 1 ? 'thing' : 'things'}` : 'Save'}
        </button>
      </div>
    </Sheet>
  )
}

// choose from Supplies › Care
const CarePick = ({ id }: { id: ID }) => {
  const st = useSt()
  const x = st.trips?.find((y) => y.id === id)
  const [ids, setIds] = useState<ID[]>(() => (x?.items ?? []).filter((i) => i.src === 'care' && i.refId).map((i) => i.refId!))
  const care = st.supplies.filter((s) => s.cat === 'care').sort((a, b) => a.name.localeCompare(b.name))
  return (
    <Sheet title="From Care" onBack={() => popSheet()}>
      <List empty="Nothing in Supplies › Care yet.">
        {care.map((s) => (
          <Row key={s.id} title={s.name} meta={s.details} lead={<Check on={ids.includes(s.id)} />}
            onClick={() => setIds(ids.includes(s.id) ? ids.filter((z) => z !== s.id) : [...ids, s.id])} />
        ))}
      </List>
      <div className="sheet-foot">
        <button className="btn full" onClick={() => { syncRefs(id, 'care', ids, (r) => st.supplies.find((s) => s.id === r)?.name ?? ''); popSheet() }}>
          {ids.length ? `Pack ${ids.length} ${ids.length === 1 ? 'thing' : 'things'}` : 'Save'}
        </button>
      </div>
    </Sheet>
  )
}
