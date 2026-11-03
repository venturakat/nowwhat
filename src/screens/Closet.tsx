import { useState } from 'react'
import { ensurePeriod, update, useSt } from '../store'
import type { ClosetCat, ClosetItem, ID } from '../types'
import { diffDays, fmt, fmtDay, fmtWeekday, addDays, periodOf, shiftPeriod, summarize, today, uid } from '../lib'
import { C, Chips, closeSheet, Field, Garment, Header, Icon, List, openSheet, popSheet, pushSheet, Row, Sheet, toast, useUi } from '../ui'
import { FormSheet } from '../form'

const CATS: [ClosetCat, string][] = [['base', 'Base'], ['mid', 'Mid'], ['bottom', 'Bottoms'], ['dress', 'Dresses'], ['outer', 'Outer'], ['shoes', 'Shoes'], ['bag', 'Bags'], ['underwear', 'Underwear'], ['jewelry', 'Jewelry'], ['other', 'Other']]
const CAT1: Record<ClosetCat, string> = { base: 'Base', mid: 'Mid', bottom: 'Bottom', dress: 'Dress', outer: 'Outer', shoes: 'Shoes', bag: 'Bag', underwear: 'Underwear', jewelry: 'Jewelry', other: 'Other' }
const WAIT = 7

// shrink a photo to ~480px JPEG so storage stays small
export const compress = (file: File): Promise<string> =>
  new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, 480 / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * k)
      c.height = Math.round(img.height * k)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      res(c.toDataURL('image/jpeg', 0.8))
      URL.revokeObjectURL(img.src)
    }
    img.onerror = rej
    img.src = URL.createObjectURL(file)
  })

const Tile = ({ it, meta, size, onClick, sel }: { it: { name: string; cat: ClosetCat; photo?: string; offSeason?: boolean }; meta?: string; size?: number; onClick?: () => void; sel?: boolean }) => (
  <button className={'tile' + (it.offSeason ? ' away' : '')} style={size ? { width: size, flex: 'none' } : undefined} onClick={onClick}>
    <div className={'sw' + (sel ? ' sel' : '')}>{it.photo ? <img src={it.photo} alt="" /> : <Garment cat={it.cat} size={size && size < 80 ? 30 : 40} />}</div>
    {it.name && <div className="nm" style={size && size < 80 ? { fontSize: 14 } : undefined}>{it.name}</div>}
    {meta && <div className="mt">{meta}</div>}
  </button>
)

export const Closet = () => {
  const sub = useUi((u) => u.sub.closet)
  const setSub = useUi((u) => u.setSub)
  const st = useSt()
  return (
    <div className="screen">
      <Header sub={sub === 'own' ? `Closet · ${st.closet.length} things` : 'Closet'} title={sub === 'own' ? 'Wardrobe' : sub === 'buy' ? 'To buy' : 'Outfits'} />
      <Chips items={[['own', 'I own'], ['buy', 'To buy'], ['outfits', 'Outfits']]} value={sub as any} onChange={setSub} swipe />
      {sub === 'own' && <Own />}
      {sub === 'buy' && <ToBuy />}
      {sub === 'outfits' && <Outfits />}
    </div>
  )
}

// ================= OWN =================
const Own = () => {
  const st = useSt()
  const [cat, setCat] = useState<ClosetCat | 'all' | 'away'>('all')
  const counts = CATS.map(([k, l]) => [k, l, st.closet.filter((i) => i.cat === k).length] as const).filter((x) => x[2] > 0)
  const away = st.closet.filter((i) => i.offSeason).length
  const items = st.closet.filter((i) => cat === 'all' || (cat === 'away' ? i.offSeason : i.cat === cat))
  const stale = st.closet.filter((i) => diffDays(i.lastWorn ?? i.added ?? today(), today()) > 90)
  return (
    <>
      {st.closet.length > 0 && (
        <div className="row" style={{ gap: 16, padding: '0 4px', overflowX: 'auto' }}>
          {[['all', 'All', st.closet.length] as const, ...counts, ...(away ? [['away', 'Out of season', away] as const] : [])].map(([k, l, n]) => (
            <button key={k} className="t15" style={{ fontWeight: cat === k ? 600 : 400, color: cat === k ? 'var(--ink)' : 'var(--ink2)', whiteSpace: 'nowrap' }} onClick={() => setCat(k as any)}>{l} {n}</button>
          ))}
        </div>
      )}
      {items.length === 0 ? (
        <div className="card" style={{ alignItems: 'center', textAlign: 'center', padding: 28 }}>
          <Garment cat="base" size={48} />
          <span className="t17">Start with what you wear most</span>
          <span className="t14 muted">Snap a photo or just type a name. 10 things is plenty to start.</span>
        </div>
      ) : (
        <div className="grid3">
          {items.map((i) => <Tile key={i.id} it={i} meta={i.offSeason ? `${CAT1[i.cat]} · out of season` : `${CAT1[i.cat]} · worn ${i.worn}×`} onClick={() => openSheet(<ItemSheet id={i.id} />)} />)}
        </div>
      )}
      <button className="btn full soft" onClick={() => openSheet(<ItemEdit />)}><Icon.camera /> Add something</button>
      {stale.length > 0 && (
        <div className="card closet" style={{ gap: 4, padding: 16 }}>
          <span className="t14 w5">Haven’t worn in 3 months</span>
          <span className="t17">{stale.length} {stale.length === 1 ? 'thing' : 'things'} — wear, sell or let go? {stale.slice(0, 3).map((s) => s.name).join(', ')}{stale.length > 3 ? '…' : ''}</span>
        </div>
      )}
    </>
  )
}

const PhotoField = ({ value, onChange }: { value?: string; onChange: (v?: string) => void }) => (
  <Field label="Photo (optional)">
    <div className="row" style={{ gap: 12 }}>
      <div className="sw" style={{ width: 72 }}>{value ? <img src={value} alt="" /> : <Icon.camera />}</div>
      <label className="btn soft sm" style={{ cursor: 'pointer' }}>
        {value ? 'Change' : 'Take / choose'}
        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={async (e) => { const f = e.target.files?.[0]; if (f) onChange(await compress(f)) }} />
      </label>
      {value && <button className="link" onClick={() => onChange(undefined)}>Remove</button>}
    </div>
  </Field>
)

const ItemEdit = ({ id, from }: { id?: string; from?: { name: string; cat: ClosetCat; photo?: string } }) => {
  const st = useSt()
  const it = st.closet.find((x) => x.id === id)
  const [photo, setPhoto] = useState(it?.photo ?? from?.photo)
  return (
    <FormSheet title={it ? 'Edit' : 'Add to wardrobe'} initial={it ?? { cat: from?.cat ?? 'base', name: from?.name }}
      fields={[{ key: 'name', label: 'Name', type: 'text', placeholder: 'Black knit' }, { key: 'cat', label: 'Type', type: 'select', options: CATS }]}
      extra={<PhotoField value={photo} onChange={setPhoto} />}
      onSave={(v) => update((d) => {
        if (it) Object.assign(d.closet.find((x) => x.id === it.id)!, { name: v.name, cat: v.cat, photo })
        else d.closet.push({ id: uid(), name: v.name, cat: v.cat ?? 'base', photo, worn: 0, pairs: [], added: today() })
      })}
      onDelete={it ? () => update((d) => {
        d.closet = d.closet.filter((x) => x.id !== it.id)
        d.closet.forEach((x) => (x.pairs = x.pairs.filter((p) => p !== it.id)))
        d.outfits.forEach((o) => (o.itemIds = o.itemIds.filter((p) => p !== it.id)))
      }) : undefined}
    />
  )
}

const wear = (ids: ID[]) => update((d) => { for (const i of d.closet) if (ids.includes(i.id)) { i.worn += 1; i.lastWorn = today() } })

const ItemSheet = ({ id }: { id: ID }) => {
  const st = useSt()
  const it = st.closet.find((x) => x.id === id)
  if (!it) return null
  const pairs = st.closet.filter((x) => it.pairs.includes(x.id))
  return (
    <Sheet title={it.name}>
      <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
        <div style={{ width: 120 }}><Tile it={{ ...it, name: '' }} /></div>
        <div className="col grow" style={{ gap: 6 }}>
          <span className="t15 muted">{CAT1[it.cat]} · worn {it.worn}×{it.lastWorn ? ` · last ${fmtDay(it.lastWorn)}` : ''}</span>
          <button className="btn closet" onClick={() => { wear([it.id]); toast('Counted') }}>Wore it today</button>
        </div>
      </div>
      <button className="card" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: '14px 16px' }} onClick={() => update((d) => { const x = d.closet.find((y) => y.id === it.id)!; x.offSeason = x.offSeason ? undefined : true })}>
        <div className="col grow" style={{ gap: 2, textAlign: 'left' }}>
          <span className="t17">In season</span>
          <span className="t13 muted">{it.offSeason ? 'Put away for now — not offered when you build outfits' : 'Offered when you build outfits'}</span>
        </div>
        <span className={'switch' + (it.offSeason ? '' : ' on')} role="switch" aria-checked={!it.offSeason}><i /></span>
      </button>
      <div className="between"><span className="t17">Goes well with</span><button className="link" onClick={() => openSheet(<PairsSheet id={it.id} />)}>Edit pairs</button></div>
      {pairs.length ? <div className="hscroll">{pairs.map((p) => <Tile key={p.id} it={p} size={72} onClick={() => openSheet(<ItemSheet id={p.id} />)} />)}</div> : <span className="t14 muted">No pairs yet — you decide what goes together.</span>}
      <button className="btn full soft" onClick={() => openSheet(<ItemEdit id={it.id} />)}>Edit</button>
    </Sheet>
  )
}

const PairsSheet = ({ id, back }: { id: ID; back?: () => void }) => {
  const st = useSt()
  const it = st.closet.find((x) => x.id === id)!
  const [sel, setSel] = useState<ID[]>(it.pairs)
  const others = st.closet.filter((x) => x.id !== id)
  return (
    <Sheet title="Goes well with">
      <span className="t15 muted">Tap what goes with <b>{it.name}</b>. Pairs work both ways.</span>
      <div className="grid3">{others.map((o) => <Tile key={o.id} it={o} sel={sel.includes(o.id)} onClick={() => setSel(sel.includes(o.id) ? sel.filter((x) => x !== o.id) : [...sel, o.id])} />)}</div>
      {!others.length && <span className="t14 muted">Add more things to your wardrobe first.</span>}
      <button className="btn full" onClick={() => {
        update((d) => {
          for (const x of d.closet) {
            if (x.id === id) x.pairs = sel
            else if (sel.includes(x.id)) { if (!x.pairs.includes(id)) x.pairs.push(id) }
            else x.pairs = x.pairs.filter((p) => p !== id)
          }
        })
        back ? back() : openSheet(<ItemSheet id={id} />)
      }}>Save pairs</button>
    </Sheet>
  )
}

// ================= TO BUY =================
const ToBuy = () => {
  const st = useSt()
  const t = today()
  const saved = [...st.saved].sort((a, b) => a.savedAt.localeCompare(b.savedAt))
  return (
    <>
      <List title="Need" right="real gaps" empty="Nothing missing right now.">
        {st.needs.map((n) => (
          <Row key={n.id} dot={n.urgent ? C.alert : C.closet} title={n.name} meta={[n.note, n.maxPrice ? `up to ${fmt(n.maxPrice)}` : ''].filter(Boolean).join(' · ') || undefined} trail={n.urgent ? 'Soon' : '→'} onClick={() => openSheet(<NeedEdit id={n.id} />)} />
        ))}
        <Row title={<span className="muted">+ Add a need</span>} onClick={() => openSheet(<NeedEdit />)} />
      </List>
      <div className="col" style={{ padding: '0 4px', gap: 4 }}>
        <span className="t17">Saved, maybe</span>
        <span className="t14 muted">Every saved thing waits {WAIT} days before you can buy it. Still want it after a week? Then it’s real.</span>
      </div>
      {saved.map((s) => {
        const age = diffDays(s.savedAt, t)
        const ready = age >= WAIT
        return (
          <div key={s.id} className={'card' + (ready ? ' closet' : '')} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: '18px 16px 18px 14px' }}>
            <div style={{ width: 72, flex: 'none' }} onClick={() => openSheet(<SavedEdit id={s.id} />)}><Tile it={{ ...s, name: '' }} /></div>
            <div className="col grow" style={{ gap: 3 }} onClick={() => openSheet(<SavedEdit id={s.id} />)}>
              <span className="t17">{s.name}</span>
              <span className="t15 w5">{fmt(s.price)}{ready ? fitsNote(st, s.price) : ''}</span>
              <span className="t13 muted">{age === 0 ? 'Saved today' : `Saved ${age} days ago`}{ready ? ' — ready to decide' : ` · decide in ${WAIT - age} days`}</span>
              {ready && (
                <div className="row" style={{ paddingTop: 6 }} onClick={(e) => e.stopPropagation()}>
                  <button className="btn sm" onClick={() => {
                    update((d) => {
                      d.saved = d.saved.filter((x) => x.id !== s.id)
                      d.closet.push({ id: uid(), name: s.name, cat: s.cat, photo: s.photo, worn: 0, pairs: [], added: today() })
                      ensurePeriod(d, periodOf(today(), d.settings).key).items.push({ id: uid(), kind: 'expense', label: `${s.name} (closet)`, amount: s.price, date: today(), oneOff: true })
                    })
                    toast('Enjoy it · added to wardrobe and budget')
                  }}>Buy</button>
                  <button className="btn ghost sm" onClick={() => { update((d) => { d.saved = d.saved.filter((x) => x.id !== s.id) }); toast(`Let go · ${fmt(s.price)} saved`) }}>Let it go</button>
                </div>
              )}
              {!ready && s.link && <a className="t13 muted" href={s.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Open link</a>}
            </div>
          </div>
        )
      })}
      <button className="btn full dashed" onClick={() => openSheet(<SavedEdit />)}>+ Save something I want</button>
    </>
  )
}

const fitsNote = (st: ReturnType<typeof useSt>, price: number) => {
  // first half (now or the next two) that still has room for it after planned spending
  let key = periodOf(today(), st.settings).key
  for (let i = 0; i < 3; i++) {
    const s = summarize(st, key)
    if (s.left >= price) return ` · fits ${s.info.label}`
    key = shiftPeriod(key, 1)
  }
  return ' · no room in the next 3 fortnights'
}

const NeedEdit = ({ id }: { id?: string }) => {
  const st = useSt()
  const n = st.needs.find((x) => x.id === id)
  return (
    <FormSheet title={n ? 'Need' : 'Something I need'} initial={n ?? {}}
      fields={[{ key: 'name', label: 'What', type: 'text', placeholder: 'Black ankle boots' }, { key: 'note', label: 'Why / note', type: 'text', placeholder: 'Current pair is worn out' }, { key: 'maxPrice', label: 'Up to (zł)', type: 'number' }, { key: 'urgent', label: 'Soon?', type: 'toggle' }]}
      extra={n && <button className="btn full closet" onClick={() => { update((d) => { d.needs = d.needs.filter((x) => x.id !== n.id) }); openSheet(<ItemEdit from={{ name: n.name, cat: 'other' }} />) }}>Got it → add to wardrobe</button>}
      onSave={(v) => update((d) => {
        const data = { name: v.name, note: v.note, maxPrice: v.maxPrice, urgent: !!v.urgent }
        if (n) Object.assign(d.needs.find((x) => x.id === n.id)!, data)
        else d.needs.push({ id: uid(), ...data })
      })}
      onDelete={n ? () => update((d) => { d.needs = d.needs.filter((x) => x.id !== n.id) }) : undefined}
    />
  )
}

const SavedEdit = ({ id }: { id?: string }) => {
  const st = useSt()
  const s = st.saved.find((x) => x.id === id)
  const [photo, setPhoto] = useState(s?.photo)
  return (
    <FormSheet title={s ? 'Saved' : 'Save for later'} initial={s ?? { cat: 'base' }}
      fields={[{ key: 'name', label: 'What', type: 'text' }, { key: 'price', label: 'Price (zł)', type: 'number' }, { key: 'link', label: 'Link (optional)', type: 'url' }, { key: 'cat', label: 'Type', type: 'select', options: CATS }]}
      extra={<><PhotoField value={photo} onChange={setPhoto} />{s && <span className="t13 muted">Saved {fmtDay(s.savedAt)} · ready on {fmtDay(addDays(s.savedAt, WAIT))}</span>}</>}
      onSave={(v) => update((d) => {
        const data = { name: v.name, price: v.price ?? 0, link: v.link, cat: v.cat ?? 'base', photo }
        if (s) Object.assign(d.saved.find((x) => x.id === s.id)!, data)
        else d.saved.push({ id: uid(), savedAt: today(), ...data })
      })}
      onDelete={s ? () => update((d) => { d.saved = d.saved.filter((x) => x.id !== s.id) }) : undefined}
    />
  )
}

// ================= OUTFITS =================
const Outfits = () => {
  const st = useSt()
  const now = st.closet.filter((x) => !x.offSeason) // out-of-season things stay out of the constructor
  const [startId, setStartId] = useState<ID | undefined>(st.planned?.itemIds.find((i) => now.some((x) => x.id === i)) ?? now[0]?.id)
  const start = now.find((x) => x.id === startId) ?? now[0]
  const pairs = start ? now.filter((x) => start.pairs.includes(x.id)) : []
  const tomorrow = addDays(today(), 1)
  const planIds = st.planned && st.planned.date >= today() ? st.planned.itemIds : []
  const plan = planIds.map((id) => st.closet.find((x) => x.id === id)).filter(Boolean) as ClosetItem[]
  const setPlan = (ids: ID[]) => update((d) => { d.planned = { date: d.planned && d.planned.date >= today() ? d.planned.date : tomorrow, itemIds: ids } })
  const togglePlan = (id: ID) => setPlan(planIds.includes(id) ? planIds.filter((x) => x !== id) : [...planIds, id])
  const shuffle = () => {
    const withPairs = now.filter((x) => x.pairs.some((p) => now.some((y) => y.id === p)))
    if (!withPairs.length) { toast('Add some pairs first'); return }
    const s = withPairs[Math.floor(Math.random() * withPairs.length)]
    const ids = [s.id]
    const used = new Set([s.cat])
    for (const p of [...s.pairs].sort(() => Math.random() - 0.5)) {
      const it = now.find((x) => x.id === p)
      if (it && !used.has(it.cat)) { ids.push(it.id); used.add(it.cat) }
    }
    setStartId(s.id)
    setPlan(ids)
  }
  if (!now.length)
    return <div className="card" style={{ textAlign: 'center', alignItems: 'center', padding: 28 }}><span className="t17">Add a few things to your wardrobe first</span><button className="btn" onClick={() => useUi.getState().setSub('own')}>Go to wardrobe</button></div>
  return (
    <>
      <div className="card" style={{ gap: 12, paddingTop: 16, paddingBottom: 16 }}>
        <div className="row" style={{ gap: 14 }}>
          {start && <div style={{ width: 64 }}><Tile it={{ ...start, name: '' }} /></div>}
          <div className="col grow"><span className="t13 w5 muted">Start from</span><span className="mid" style={{ fontSize: 22 }}>{start?.name}</span></div>
          <button className="link" onClick={() => openSheet(<PickSheet title="Start from" onPick={(id) => { setStartId(id); closeSheet() }} />)}>Change</button>
        </div>
        <div className="between">
          <div className="col" style={{ gap: 0 }}><span className="t15 w6">Goes well with</span><span className="t13 muted">Your pairs · {pairs.length}</span></div>
          {start && <button className="link" onClick={() => openSheet(<PairsSheet id={start.id} back={closeSheet} />)}>Edit pairs</button>}
        </div>
        {pairs.length ? (
          <div className="hscroll">{pairs.map((p) => <Tile key={p.id} it={p} size={72} sel={planIds.includes(p.id)} onClick={() => togglePlan(p.id)} />)}</div>
        ) : <span className="t14 muted">No pairs yet. Tap “Edit pairs”.</span>}
        {start && !planIds.includes(start.id) && <button className="btn soft sm" style={{ alignSelf: 'flex-start' }} onClick={() => setPlan([start.id, ...planIds])}>Use {start.name} in the outfit</button>}
      </div>
      <div className="card closet" style={{ gap: 12, paddingTop: 16, paddingBottom: 16 }}>
        <div className="between"><span className="t17">Tomorrow’s outfit</span><span className="t14 w5 muted">{fmtWeekday(st.planned?.date && st.planned.date >= today() ? st.planned.date : tomorrow)}</span></div>
        {plan.length ? <div className="hscroll">{plan.map((p) => <Tile key={p.id} it={p} size={72} onClick={() => togglePlan(p.id)} />)}</div> : <span className="t14">Tap pieces above to build it, or shuffle your pairs.</span>}
        <div className="row">
          <button className="btn grow" disabled={!plan.length} onClick={() => openSheet(<FormSheet title="Save outfit" fields={[{ key: 'name', label: 'Name', type: 'text', placeholder: 'Office day' }]} onSave={(v) => update((d) => { d.outfits.push({ id: uid(), name: v.name, itemIds: planIds }) })} />)}>Save outfit</button>
          <button className="btn ghost grow" onClick={shuffle}>Shuffle my pairs</button>
        </div>
      </div>
      <List title="Saved outfits" right={String(st.outfits.length)} empty="Nothing saved yet.">
        {st.outfits.map((o) => {
          const its = o.itemIds.map((id) => st.closet.find((x) => x.id === id)).filter(Boolean) as ClosetItem[]
          return <Row key={o.id} dot={C.closet} title={o.name} meta={its.map((i) => i.name).join(' · ')} trail={<span className="t15 w6" onClick={(e) => { e.stopPropagation(); wear(o.itemIds); toast(`Wearing ${o.name}`) }}>Wear</span>}
            onClick={() => openSheet(<OutfitSheet id={o.id} onPlan={setPlan} />)} />
        })}
      </List>
    </>
  )
}

// a saved outfit: plan it, edit it (name + pieces) or delete it
const OutfitSheet = ({ id, onPlan }: { id: ID; onPlan: (ids: ID[]) => void }) => {
  const st = useSt()
  const o = st.outfits.find((x) => x.id === id)
  if (!o) return null
  const its = o.itemIds.map((i) => st.closet.find((x) => x.id === i)).filter(Boolean) as ClosetItem[]
  return (
    <Sheet title={o.name}>
      <div className="hscroll">{its.map((i) => <Tile key={i.id} it={i} size={72} />)}</div>
      <button className="btn full" onClick={() => { onPlan(o.itemIds); closeSheet() }}>Plan it for tomorrow</button>
      <button className="btn full soft" onClick={() => pushSheet(<OutfitEdit id={o.id} />)}>Edit</button>
      <button className="btn full soft" onClick={() => { if (confirm(`Delete ${o.name}?`)) { update((d) => { d.outfits = d.outfits.filter((x) => x.id !== o.id) }); closeSheet() } }}>Delete</button>
    </Sheet>
  )
}

// change an outfit's name and which pieces are in it (tap to add / take out)
const OutfitEdit = ({ id }: { id: ID }) => {
  const st = useSt()
  const o = st.outfits.find((x) => x.id === id)!
  const [name, setName] = useState(o.name)
  const [ids, setIds] = useState<ID[]>(o.itemIds)
  const toggle = (i: ID) => setIds(ids.includes(i) ? ids.filter((x) => x !== i) : [...ids, i])
  return (
    <Sheet title="Edit outfit" onBack={popSheet} full>
      <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <span className="t14 w5 muted">Pieces · {ids.length} · tap to add or take out</span>
      {CATS.map(([cat, label]) => {
        const items = st.closet.filter((x) => x.cat === cat && (!x.offSeason || ids.includes(x.id))) // out-of-season only if already in it
        if (!items.length) return null
        return (
          <div key={cat} className="col" style={{ gap: 8 }}>
            <span className="t14 w5">{label}</span>
            <div className="hscroll">{items.map((i) => <Tile key={i.id} it={i} size={72} sel={ids.includes(i.id)} onClick={() => toggle(i.id)} />)}</div>
          </div>
        )
      })}
      <div className="sheet-foot">
        <button className="btn full" disabled={!name.trim() || !ids.length} onClick={() => {
          update((d) => { const x = d.outfits.find((y) => y.id === id); if (x) { x.name = name.trim(); x.itemIds = ids } })
          popSheet(); toast('Outfit saved')
        }}>Save</button>
      </div>
    </Sheet>
  )
}

const PickSheet = ({ title, onPick }: { title: string; onPick: (id: ID) => void }) => {
  const st = useSt()
  return (
    <Sheet title={title}>
      <div className="grid3">{st.closet.filter((i) => !i.offSeason).map((i) => <Tile key={i.id} it={i} onClick={() => onPick(i.id)} />)}</div>
    </Sheet>
  )
}
