import { useEffect, useState } from 'react'
import { ensurePeriod, update, useSt } from '../store'
import type { ClosetCat, ClosetItem, Currency, ID } from '../types'
import { diffDays, fmt, fmtBoth, fmtCur, fmtDay, toPln, fmtWeekday, addDays, periodOf, shiftPeriod, summarize, today, uid } from '../lib'
import { C, Chips, closeSheet, Field, Garment, Header, Icon, List, openSheet, popSheet, pushSheet, Row, Sheet, toast, registerSubs, useUi } from '../ui'
import { FormSheet } from '../form'
import { CURRENCIES } from './Subscriptions'
import { Travel } from './Travel'

// the outfit formula: pieces are always shown in this order
export const CATS: [ClosetCat, string][] = [['base', 'Base'], ['mid', 'Mid'], ['bottom', 'Bottoms'], ['dress', 'Dresses'], ['shoes', 'Shoes'], ['outer', 'Outer'], ['bag', 'Bags'], ['jewelry', 'Accessories'], ['underwear', 'Underwear'], ['other', 'Other']]
const ORDER = CATS.map(([k]) => k)
export const byFormula = <T extends { cat: ClosetCat }>(xs: T[]) => xs.slice().sort((a, b) => ORDER.indexOf(a.cat) - ORDER.indexOf(b.cat))
// which kinds of pieces to suggest next, depending on what the outfit starts from
const TURN: Partial<Record<ClosetCat, ClosetCat[]>> = {
  outer: ['bottom', 'dress', 'shoes', 'mid', 'base', 'bag', 'jewelry', 'underwear', 'other'],
  bag: ['outer', 'bottom', 'dress', 'shoes', 'mid', 'base', 'jewelry', 'underwear', 'other']
}
const turnFor = (cat: ClosetCat) => TURN[cat] ?? ORDER.filter((k) => k !== cat) // everything else: the formula order
const NO_START: ClosetCat[] = ['jewelry'] // an outfit never starts from an accessory
const MANY: ClosetCat[] = ['jewelry'] // kinds an outfit can have several of (accessories; stored as 'jewelry')
export const CAT1: Record<ClosetCat, string> = { base: 'Base', mid: 'Mid', bottom: 'Bottom', dress: 'Dress', outer: 'Outer', shoes: 'Shoes', bag: 'Bag', underwear: 'Underwear', jewelry: 'Accessory', other: 'Other' }

// shrink a photo (~480px JPEG by default) so storage stays small
const SUBTABS: [string, string][] = [['own', 'I own'], ['buy', 'To buy'], ['outfits', 'Outfits'], ['travel', 'Travel']]
registerSubs('closet', SUBTABS.map((x) => x[0]))

// "10–18 °C", "from 10 °C", "up to 18 °C"
const tempText = (o: { tempMin?: number; tempMax?: number }) =>
  o.tempMin !== undefined && o.tempMax !== undefined ? `${o.tempMin}–${o.tempMax} °C` : o.tempMin !== undefined ? `from ${o.tempMin} °C` : o.tempMax !== undefined ? `up to ${o.tempMax} °C` : ''
const num = (v: unknown) => (v === '' || v === undefined || v === null || isNaN(Number(v)) ? undefined : Number(v))

export const compress = (file: File, max = 480): Promise<string> =>
  new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height))
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

export const Tile = ({ it, meta, size, onClick, sel }: { it: { name: string; cat: ClosetCat; photo?: string; offSeason?: boolean }; meta?: string; size?: number; onClick?: () => void; sel?: boolean }) => (
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
      <Header sub={sub === 'own' ? `Closet · ${st.closet.length} things` : 'Closet'} title={sub === 'own' ? 'Wardrobe' : sub === 'buy' ? 'To buy' : sub === 'travel' ? 'Travel' : 'Outfits'} />
      <Chips items={SUBTABS} value={sub as any} onChange={setSub} swipe />
      {sub === 'own' && <Own />}
      {sub === 'buy' && <ToBuy />}
      {sub === 'outfits' && <Outfits />}
      {sub === 'travel' && <Travel />}
    </div>
  )
}

// ================= OWN =================
const Own = () => {
  const st = useSt()
  const [cat, setCat] = useState<ClosetCat | 'all' | 'away'>('all')
  const [sort, setSort] = useState<'cat' | 'worn'>(() => { try { return localStorage.getItem('nw-closet-sort') === 'worn' ? 'worn' : 'cat' } catch { return 'cat' } })
  const flipSort = () => { const s = sort === 'cat' ? 'worn' : 'cat'; setSort(s); try { localStorage.setItem('nw-closet-sort', s) } catch { /* fine */ } }
  const counts = CATS.map(([k, l]) => [k, l, st.closet.filter((i) => i.cat === k).length] as const).filter((x) => x[2] > 0)
  const away = st.closet.filter((i) => i.offSeason).length
  const shown = st.closet.filter((i) => cat === 'all' || (cat === 'away' ? i.offSeason : i.cat === cat))
  // by category (the outfit formula order, then name) or most worn first
  const items = sort === 'worn' ? shown.slice().sort((a, b) => b.worn - a.worn || a.name.localeCompare(b.name)) : byFormula(shown.slice().sort((a, b) => a.name.localeCompare(b.name)))
  const stale = st.closet.filter((i) => diffDays(i.lastWorn ?? i.added ?? today(), today()) > 90)
  return (
    <>
      {st.closet.length > 0 && (
        <div className="row" style={{ gap: 16, padding: '0 4px', overflowX: 'auto' }}>
          <button className="t15 w5" style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }} onClick={flipSort} aria-label="Sort">
            <Icon.arrowDown />{sort === 'cat' ? 'Category' : 'Most worn'}
          </button>
          <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--line)' }} />
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

const ItemEdit = ({ id, from }: { id?: string; from?: { name: string; cat: ClosetCat; photo?: string; size?: string } }) => {
  const st = useSt()
  const it = st.closet.find((x) => x.id === id)
  const [photo, setPhoto] = useState(it?.photo ?? from?.photo)
  return (
    <FormSheet title={it ? 'Edit' : 'Add to wardrobe'} initial={it ?? { cat: from?.cat ?? 'base', name: from?.name, size: from?.size }}
      fields={[{ key: 'name', label: 'Name', type: 'text', placeholder: 'Black knit' }, { key: 'size', label: 'Size', type: 'text', placeholder: 'M, 38, 27/32…' }, { key: 'cat', label: 'Type', type: 'select', options: CATS }]}
      extra={<PhotoField value={photo} onChange={setPhoto} />}
      onSave={(v) => update((d) => {
        if (it) Object.assign(d.closet.find((x) => x.id === it.id)!, { name: v.name, cat: v.cat, photo, size: v.size?.trim() || undefined })
        else d.closet.push({ id: uid(), name: v.name, cat: v.cat ?? 'base', photo, size: v.size?.trim() || undefined, worn: 0, pairs: [], added: today() })
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
          <span className="t15 muted">{CAT1[it.cat]}{it.size ? ` · size ${it.size}` : ''} · worn {it.worn}×{it.lastWorn ? ` · last ${fmtDay(it.lastWorn)}` : ''}</span>
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
  const others = byFormula(st.closet.filter((x) => x.id !== id))
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
          <Row key={n.id} dot={n.urgent ? C.alert : C.closet} title={n.name} meta={[n.size ? `Size ${n.size}` : '', n.note, n.maxPrice ? `up to ${fmt(n.maxPrice)}` : ''].filter(Boolean).join(' · ') || undefined} trail={n.urgent ? 'Soon' : '→'} onClick={() => openSheet(<NeedEdit id={n.id} />)} />
        ))}
        <Row title={<span className="muted">+ Add a need</span>} onClick={() => openSheet(<NeedEdit />)} />
      </List>
      <div className="col" style={{ padding: '0 4px', gap: 4 }}>
        <span className="t17">Saved, maybe</span>
        <span className="t14 muted">Every saved thing waits here until you decide</span>
      </div>
      {saved.map((s) => {
        const age = diffDays(s.savedAt, t)
        return (
          <div key={s.id} className="card" style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: '18px 16px 18px 14px' }}>
            <div style={{ width: 72, flex: 'none' }} onClick={() => openSheet(<SavedEdit id={s.id} />)}><Tile it={{ ...s, name: '' }} /></div>
            <div className="col grow" style={{ gap: 3 }} onClick={() => openSheet(<SavedEdit id={s.id} />)}>
              <span className="t17">{s.name}{s.size && <span className="t14 muted"> · size {s.size}</span>}</span>
              <span className="t15 w5">{fmtBoth(st.settings, s.price, s.currency ?? 'PLN')}{fitsNote(st, toPln(st.settings, s.price, s.currency ?? 'PLN'))}</span>
              <span className="t13 muted">{age === 0 ? 'Saved today' : age === 1 ? 'Saved yesterday' : `Saved ${age} days ago`}</span>
              <div className="row" style={{ paddingTop: 6, gap: 6 }} onClick={(e) => e.stopPropagation()}>
                  <button className="btn sm" onClick={() => {
                    update((d) => {
                      d.saved = d.saved.filter((x) => x.id !== s.id)
                      d.closet.push({ id: uid(), name: s.name, cat: s.cat, photo: s.photo, size: s.size, worn: 0, pairs: [], added: today() })
                      ensurePeriod(d, periodOf(today(), d.settings).key).items.push({ id: uid(), kind: 'expense', label: `${s.name} (closet)`, amount: s.price, currency: s.currency ?? 'PLN', date: today(), oneOff: true })
                    })
                    toast('Enjoy it · in your wardrobe, with its photo, and in the budget')
                  }}>Bought it</button>
                  <LetGo onGo={() => { update((d) => { d.saved = d.saved.filter((x) => x.id !== s.id) }); toast(`Let go · ${fmtCur(s.price, s.currency ?? 'PLN')} saved`) }} />
                  {s.link && <a className="btn ghost sm" style={{ textDecoration: 'none', color: 'inherit' }} href={s.link} target="_blank" rel="noreferrer">Link</a>}
                </div>
            </div>
          </div>
        )
      })}
      <button className="btn full dashed" onClick={() => openSheet(<SavedEdit />)}>+ Save something I want</button>
    </>
  )
}

// first tap asks, a second one within 3 seconds lets it go
const LetGo = ({ onGo }: { onGo: () => void }) => {
  const [armed, setArmed] = useState(false)
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 3000); return () => clearTimeout(t) }, [armed])
  return <button className="btn ghost sm" style={armed ? { color: 'var(--alert)', borderColor: 'var(--alert)' } : undefined} onClick={() => (armed ? onGo() : setArmed(true))}>{armed ? 'Delete' : 'Let it go'}</button>
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
      fields={[{ key: 'name', label: 'What', type: 'text', placeholder: 'Black ankle boots' }, { key: 'size', label: 'Size', type: 'text', placeholder: 'M, 38, 27/32…' }, { key: 'note', label: 'Why / note', type: 'text', placeholder: 'Current pair is worn out' }, { key: 'maxPrice', label: 'Up to (zł)', type: 'number' }, { key: 'urgent', label: 'Soon?', type: 'toggle' }]}
      extra={n && <button className="btn full closet" onClick={() => pushSheet(<GotNeed id={n.id} />)}>Got it → budget and wardrobe</button>}
      onSave={(v) => update((d) => {
        const data = { name: v.name, size: v.size?.trim() || undefined, note: v.note, maxPrice: v.maxPrice, urgent: !!v.urgent }
        if (n) Object.assign(d.needs.find((x) => x.id === n.id)!, data)
        else d.needs.push({ id: uid(), ...data })
      })}
      onDelete={n ? () => update((d) => { d.needs = d.needs.filter((x) => x.id !== n.id) }) : undefined}
    />
  )
}

// a need that was bought: what it cost goes into this fortnight's spending, then it's added to the wardrobe
const GotNeed = ({ id }: { id: string }) => {
  const st = useSt()
  const n = st.needs.find((x) => x.id === id)
  const [price, setPrice] = useState(n?.maxPrice ? String(n.maxPrice).replace('.', ',') : '')
  const [cur, setCur] = useState<Currency>('PLN')
  if (!n) return null
  const paid = Number(price.replace(/\s/g, '').replace(',', '.'))
  const done = (log: boolean) => {
    update((d) => {
      d.needs = d.needs.filter((x) => x.id !== n.id)
      if (log && paid > 0) ensurePeriod(d, periodOf(today(), d.settings).key).items.push({ id: uid(), kind: 'expense', label: `${n.name} (closet)`, amount: paid, currency: cur, date: today(), oneOff: true })
    })
    toast(log && paid > 0 ? `${fmtCur(paid, cur)} added to spending` : 'Off the list')
    openSheet(<ItemEdit from={{ name: n.name, cat: 'other', size: n.size }} />)
  }
  return (
    <Sheet title={`Got ${n.name}`} onBack={popSheet}>
      <Field label="Paid">
        <div className="col" style={{ gap: 8 }}>
          <input className="input" inputMode="decimal" autoFocus value={price} placeholder="0" onChange={(e) => setPrice(e.target.value.replace(/[^0-9.,\s]/g, ''))} />
          <div className="seg">{CURRENCIES.map(([k, l]) => <button key={k} type="button" className={'chip' + (cur === k ? ' on' : '')} onClick={() => setCur(k)}>{l}</button>)}</div>
        </div>
      </Field>
      <button className="btn full" disabled={!(paid > 0)} onClick={() => done(true)}>Add to spending · then to wardrobe</button>
      <button className="btn full soft" onClick={() => done(false)}>It was a gift / already logged</button>
    </Sheet>
  )
}

const SavedEdit = ({ id }: { id?: string }) => {
  const st = useSt()
  const s = st.saved.find((x) => x.id === id)
  const [photo, setPhoto] = useState(s?.photo)
  return (
    <FormSheet title={s ? 'Saved' : 'Save for later'} initial={s ? { currency: 'PLN', ...s } : { cat: 'base', currency: 'PLN' }}
      fields={[{ key: 'name', label: 'What', type: 'text' }, { key: 'size', label: 'Size', type: 'text', placeholder: 'M, 38, 27/32…' }, { key: 'price', label: 'Price', type: 'number' }, { key: 'currency', label: 'Currency', type: 'select', options: CURRENCIES }, { key: 'link', label: 'Link (optional)', type: 'url' }, { key: 'cat', label: 'Type', type: 'select', options: CATS }]}
      extra={<><PhotoField value={photo} onChange={setPhoto} />{s && <span className="t13 muted">Saved {fmtDay(s.savedAt)}</span>}</>}
      onSave={(v) => update((d) => {
        const data = { name: v.name, size: v.size?.trim() || undefined, price: v.price ?? 0, currency: (v.currency ?? 'PLN') as Currency, link: v.link, cat: v.cat ?? 'base', photo }
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
  const starters = now.filter((x) => !NO_START.includes(x.cat))
  const [startId, setStartId] = useState<ID | undefined>(starters[0]?.id)
  const [pick, setPick] = useState<ID[]>([]) // pieces chosen from "Goes well with"
  const start = starters.find((x) => x.id === startId) ?? starters[0]
  // suggestions: all the start's pairs, kind by kind in the right turn — except the start's own kind
  // (starting from a bottom never suggests other bottoms)
  const order = start ? turnFor(start.cat) : ORDER
  const pairs = start
    ? now.filter((x) => start.pairs.includes(x.id) && x.cat !== start.cat).sort((a, b) => order.indexOf(a.cat) - order.indexOf(b.cat))
    : []
  // one piece per kind in the outfit: picking another of the same kind swaps it
  const togglePick = (id: ID) => {
    if (pick.includes(id)) { setPick(pick.filter((x) => x !== id)); return }
    const cat = now.find((x) => x.id === id)?.cat
    if (cat && MANY.includes(cat)) { setPick([...pick, id]); return } // accessories: add as many as you like
    setPick([...pick.filter((p) => now.find((x) => x.id === p)?.cat !== cat), id])
  }
  const choose = (id: ID) => { setStartId(id); setPick([]) }
  // "Try on next": the outfit you're trying, kept until you save or delete it
  const planIds = st.planned?.itemIds ?? []
  const plan = byFormula(planIds.map((id) => st.closet.find((x) => x.id === id)).filter(Boolean) as ClosetItem[])
  const setPlan = (ids: ID[]) => update((d) => { d.planned = ids.length ? { date: today(), itemIds: ids } : null })
  const shuffle = () => {
    const withPairs = starters.filter((x) => x.pairs.some((p) => now.some((y) => y.id === p && y.cat !== x.cat)))
    if (!withPairs.length) { toast('Add some pairs first'); return }
    const s = withPairs[Math.floor(Math.random() * withPairs.length)]
    const ids: ID[] = []
    for (const cat of turnFor(s.cat)) {
      const options = now.filter((x) => x.cat === cat && s.pairs.includes(x.id))
      if (options.length) ids.push(options[Math.floor(Math.random() * options.length)].id)
    }
    setStartId(s.id); setPick(ids)
  }
  if (!starters.length)
    return <div className="card" style={{ textAlign: 'center', alignItems: 'center', padding: 28 }}><span className="t17">Add a few things to your wardrobe first</span><button className="btn" onClick={() => useUi.getState().setSub('own')}>Go to wardrobe</button></div>
  return (
    <>
      <div className="card" style={{ gap: 12, paddingTop: 16, paddingBottom: 16 }}>
        <div className="row" style={{ gap: 14 }}>
          {start && <div style={{ width: 64 }}><Tile it={{ ...start, name: '' }} /></div>}
          <div className="col grow"><span className="t13 w5 muted">Start from · {start ? CAT1[start.cat] : ''}</span><span className="mid" style={{ fontSize: 22 }}>{start?.name}</span></div>
          <button className="link" onClick={() => openSheet(<PickSheet title="Start from" onPick={(id) => { choose(id); closeSheet() }} />)}>Change</button>
        </div>
        <div className="between">
          <div className="col" style={{ gap: 0 }}><span className="t15 w6">Goes well with</span><span className="t13 muted">{pairs.length ? 'Tap to add · another of the same kind swaps it (accessories add up)' : 'Your pairs'}</span></div>
          {start && <button className="link" onClick={() => openSheet(<PairsSheet id={start.id} back={closeSheet} />)}>Edit pairs</button>}
        </div>
        {pairs.length ? (
          <div className="hscroll">{pairs.map((p) => <Tile key={p.id} it={p} meta={CAT1[p.cat]} size={72} sel={pick.includes(p.id)} onClick={() => togglePick(p.id)} />)}</div>
        ) : <span className="t14 muted">{start?.pairs.length ? 'Nothing else to add.' : 'No pairs yet. Tap “Edit pairs”.'}</span>}
        <div className="btn2">
          <button className="btn" disabled={!start} onClick={() => { setPlan([start!.id, ...pick]); toast('In Try on next') }}>Try on next</button>
          <button className="btn ghost" onClick={shuffle}>Shuffle my pairs</button>
        </div>
      </div>
      <div className="card closet" style={{ gap: 12, paddingTop: 16, paddingBottom: 16 }}>
        <span className="t17">Try on next</span>
        {plan.length ? <div className="hscroll">{plan.map((p) => <Tile key={p.id} it={p} meta={CAT1[p.cat]} size={72} onClick={() => setPlan(planIds.filter((x) => x !== p.id))} />)}</div> : <span className="t14">Build an outfit above and tap “Try on next”.</span>}
        <div className="btn2">
          <button className="btn" disabled={!plan.length} onClick={() => openSheet(<FormSheet title="Save outfit" fields={[{ key: 'name', label: 'Name', type: 'text', placeholder: 'Office day' }, { key: 'tempMin', label: 'Temperature of comfort: from (°C)', type: 'number', step: 1 }, { key: 'tempMax', label: 'to (°C)', type: 'number', step: 1 }]} onSave={(v) => update((d) => { d.outfits.push({ id: uid(), name: v.name, itemIds: plan.map((x) => x.id), tempMin: num(v.tempMin), tempMax: num(v.tempMax) }) })} />)}>Save outfit</button>
          <button className="btn ghost" disabled={!plan.length} onClick={() => setPlan([])}>Delete outfit</button>
        </div>
      </div>
      <List title="Saved outfits" right={String(st.outfits.length)} empty="Nothing saved yet.">
        {st.outfits.map((o) => {
          const its = byFormula(o.itemIds.map((id) => st.closet.find((x) => x.id === id)).filter(Boolean) as ClosetItem[])
          return <Row key={o.id} dot={C.closet} title={<>{o.name}{tempText(o) && <span className="t15 muted" style={{ fontWeight: 400 }}> · {tempText(o)}</span>}</>} meta={its.map((i) => i.name).join(' · ')} trail={<span className="t15 w6" onClick={(e) => { e.stopPropagation(); wear(o.itemIds); toast(`Wearing ${o.name}`) }}>Wear</span>}
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
  const its = byFormula(o.itemIds.map((i) => st.closet.find((x) => x.id === i)).filter(Boolean) as ClosetItem[])
  return (
    <Sheet title={o.name}>
      {tempText(o) && <span className="t15 muted" style={{ marginTop: -4 }}>Comfortable at {tempText(o)}</span>}
      <div className="hscroll">{its.map((i) => <Tile key={i.id} it={i} size={72} />)}</div>
      <button className="btn full" onClick={() => { onPlan(o.itemIds); closeSheet() }}>Try it on next</button>
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
  const [tMin, setTMin] = useState(o.tempMin === undefined ? '' : String(o.tempMin))
  const [tMax, setTMax] = useState(o.tempMax === undefined ? '' : String(o.tempMax))
  const toggle = (i: ID) => setIds(ids.includes(i) ? ids.filter((x) => x !== i) : [...ids, i])
  return (
    <Sheet title="Edit outfit" onBack={popSheet} full>
      <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Temperature of comfort (°C)">
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <input className="input" inputMode="numeric" placeholder="from" value={tMin} onChange={(e) => setTMin(e.target.value.replace(/[^0-9-]/g, ''))} />
          <span className="muted">–</span>
          <input className="input" inputMode="numeric" placeholder="to" value={tMax} onChange={(e) => setTMax(e.target.value.replace(/[^0-9-]/g, ''))} />
        </div>
      </Field>
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
          update((d) => { const x = d.outfits.find((y) => y.id === id); if (x) { x.name = name.trim(); x.itemIds = ids; x.tempMin = num(tMin); x.tempMax = num(tMax) } })
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
      <div className="grid3">{byFormula(st.closet.filter((i) => !i.offSeason && !NO_START.includes(i.cat))).map((i) => <Tile key={i.id} it={i} meta={CAT1[i.cat]} onClick={() => onPick(i.id)} />)}</div>
    </Sheet>
  )
}
