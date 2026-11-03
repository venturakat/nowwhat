import { useEffect, useState } from 'react'
import { update, useSt } from '../store'
import type { CookStep, Recipe } from '../types'
import { dailyNeeds, fmtDay, ingredientName, parseRecipe, recipeNutrition, recipeStatus, today, uid } from '../lib'
import { fetchNutrition } from '../nutrition'
import { FormSheet } from '../form'
import { compress } from './Closet'
import { C, closeSheet, Field, Icon, List, openSheet, popSheet, pushSheet, Row, Sheet, toast, useUi } from '../ui'

const lines = (t: string) => t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export const Recipes = () => {
  const st = useSt()
  const all = (st.recipes ?? []).slice().sort((a, b) => (b.lastCooked ?? '').localeCompare(a.lastCooked ?? '') || a.name.localeCompare(b.name))
  return (
    <>
      <List title="Recipes" empty="Add what you cook, so it’s one tap away.">
        {all.map((r) => {
          const ing = recipeStatus(st, r)
          const buy = ing.filter((x) => x.state === 'buy').length
          const meta = [r.minutes ? `${r.minutes} min` : '', buy ? `${buy} to buy` : ing.length && ing.every((x) => x.state === 'home') ? 'all at home' : '', r.lastCooked ? `cooked ${fmtDay(r.lastCooked)}` : ''].filter(Boolean).join(' · ')
          return <Row key={r.id} dot={buy ? C.warn : C.home} title={r.name} meta={meta || undefined} trail="→" onClick={() => openSheet(<RecipeSheet id={r.id} />)} />
        })}
      </List>
      <div className="btn2">
        <button className="btn soft" onClick={() => openSheet(<RecipeEdit />)}>+ Add a recipe</button>
        <button className="btn soft" onClick={() => openSheet(<PasteSheet />)}>Paste a recipe</button>
      </div>
      <div className="t13 muted" style={{ padding: '0 4px' }}>Ingredients are matched with your Groceries by name: you’ll see what’s at home and can put the rest on the shopping list.</div>
    </>
  )
}

// a recipe: what's at home, what to buy, the steps, and "cooked it"
export const RecipeSheet = ({ id }: { id: string }) => {
  const st = useSt()
  const r = st.recipes?.find((x) => x.id === id)
  if (!r) return null
  const ing = recipeStatus(st, r)
  const missing = ing.filter((x) => x.state === 'none')
  const addToList = (only?: string) => {
    const add = only ? [only] : missing.map((x) => x.line)
    update((d) => {
      for (const line of add) {
        const name = cap(ingredientName(line) || line)
        if (d.supplies.some((s) => s.once && s.name.toLowerCase() === name.toLowerCase())) continue
        d.supplies.push({ id: uid(), cat: 'groceries', name, details: `For ${r.name}`, pricePerUnit: 0, buyQty: 1, lastsDays: 30, enoughUntil: today(), once: true })
      }
    })
    toast(add.length === 1 ? 'On your Groceries list' : `${add.length} things on your Groceries list`)
  }
  const meta = [r.minutes ? `${r.minutes} min` : '', r.cooked ? `cooked ${r.cooked} ${r.cooked === 1 ? 'time' : 'times'}` : 'not cooked yet', r.lastCooked ? `last ${fmtDay(r.lastCooked)}` : ''].filter(Boolean).join(' · ')
  return (
    <Sheet title={r.name}>
      <span className="t15 muted" style={{ marginTop: -4 }}>{meta}</span>
      <MealPhoto r={r} />
      <NutriTiles r={r} />
      <List title="Ingredients" right={missing.length ? `${missing.length} not in Groceries` : undefined}>
        {ing.map(({ line, sp, state }, i) => (
          <Row key={i} dot={state === 'home' ? C.ok : state === 'buy' ? C.warn : C.line} title={line}
            meta={state === 'home' ? `At home · till ${fmtDay(sp!.enoughUntil)}` : state === 'buy' ? 'On your shopping list' : 'Tap to put on the shopping list'}
            onClick={state === 'none' ? () => addToList(line) : () => { closeSheet(); useUi.getState().go('supplies', 'groceries') }} />
        ))}
      </List>
      {missing.length > 1 && <button className="btn soft" onClick={() => addToList()}>Put all {missing.length} on the shopping list</button>}
      {(r.stove?.length ?? 0) > 0 && <TimerBlock title="Stove" steps={r.stove!} />}
      {(r.air?.length ?? 0) > 0 && <TimerBlock title="Aerogrill" steps={r.air!} temp={r.airTemp} />}
      {(r.sauce?.length ?? 0) > 0 && (
        <div className="card" style={{ gap: 8 }}>
          <span className="t17">Glaze / Sauce</span>
          <span className="t13 muted" style={{ marginTop: -4 }}>Mix together</span>
          {r.sauce!.map((l, i) => <div key={i} className="row" style={{ gap: 10 }}><span style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--ink2)', flex: 'none' }} /><span className="t15">{l}</span></div>)}
        </div>
      )}
      {r.notes && <div className="t15 muted" style={{ whiteSpace: 'pre-wrap', padding: '0 4px' }}>{r.notes}</div>}
      <button className="btn full home" onClick={() => { update((d) => { const x = d.recipes!.find((y) => y.id === id)!; x.lastCooked = today(); x.cooked = (x.cooked ?? 0) + 1 }); closeSheet(); toast('Cooked · nice') }}>Cooked it</button>
      <button className="btn full soft" onClick={() => openSheet(<RecipeEdit id={r.id} />)}>Edit</button>
    </Sheet>
  )
}

// the meal's photo: a page-wide picture under the title; any photo works, it's cropped to fit automatically
const setRecipePhoto = (id: string, photo?: string) => update((d) => { const x = d.recipes!.find((y) => y.id === id); if (x) x.photo = photo })
const PhotoPick = ({ onPhoto, children, className }: { onPhoto: (p: string) => void; children: React.ReactNode; className?: string }) => (
  <label className={className} style={{ cursor: 'pointer' }}>
    {children}
    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={async (e) => { const f = e.target.files?.[0]; if (f) onPhoto(await compress(f, 1080)) }} />
  </label>
)
const MealPhoto = ({ r }: { r: Recipe }) => r.photo ? (
  <div className="hero">
    <img src={r.photo} alt="" />
    <PhotoPick className="hero-btn" onPhoto={(p) => setRecipePhoto(r.id, p)}><Icon.camera /> Change</PhotoPick>
  </div>
) : (
  <PhotoPick className="hero empty" onPhoto={(p) => setRecipePhoto(r.id, p)}><Icon.camera /><span className="t15 w5">Add a photo of the meal</span></PhotoPick>
)

// Protein and fiber for one portion (USDA data) and how much of your day it covers
const r0 = (x: number) => (x < 10 ? Math.round(x * 10) / 10 : Math.round(x))
const NutriTiles = ({ r }: { r: Recipe }) => {
  const st = useSt()
  const nu = recipeNutrition(st, r)
  const need = dailyNeeds(st.settings)
  const [look, setLook] = useState<'idle' | 'busy' | 'off' | 'limit'>('idle')
  const [open, setOpen] = useState(false)
  const key = nu.pending.join('|')
  useEffect(() => {
    if (!key || look === 'off' || look === 'limit') return
    setLook('busy')
    fetchNutrition(nu.pending).then((res) => setLook(res === 'ok' ? 'idle' : res))
  }, [key])
  if (!r.ingredients.length) return null
  const tile = (label: string, g: number, norm: number | undefined, bg: string) => {
    const pct = norm ? Math.round((g / norm) * 100) : undefined
    return (
      <div className="ntile" style={{ background: bg }}>
        <span className="t14 w5">{label}</span>
        <span className="ntile-v">{look === 'busy' && !g ? '…' : `${r0(g)} g`}</span>
        {pct !== undefined ? (
          <div className="col" style={{ gap: 6 }}>
            <div className="nbar"><i style={{ width: `${Math.min(100, pct)}%` }} /></div>
            <span className="t13">{pct}% of your day · {norm} g</span>
          </div>
        ) : <span className="t13">per portion</span>}
      </div>
    )
  }
  const por = Math.max(1, r.portions ?? 1)
  const note = look === 'busy' ? 'Looking up nutrition…' : look === 'limit' ? 'USDA’s hourly lookup limit is reached — the rest fills in when you open this again in an hour' : look === 'off' ? 'Couldn’t reach the nutrition data — try again later' : `Per portion${por > 1 ? ` (makes ${por})` : ''} · USDA data${nu.guessed ? ' · some weights guessed' : ''}${nu.notFound ? ` · ${nu.notFound} not found` : ''}`
  return (
    <>
      <div className="ntiles">
        {tile('Protein', nu.protein, need?.protein, 'var(--work)')}
        {tile('Fiber', nu.fiber, need?.fiber, 'var(--money)')}
      </div>
      <div className="between" style={{ gap: 8, marginTop: -4, padding: '0 4px' }}>
        <span className="t13 muted">{note}{!need ? ' · add your weight in Settings → About you to see %' : ''}</span>
        <button className="t13 w5" style={{ flex: 'none', textDecoration: 'underline' }} onClick={() => setOpen(!open)}>{open ? 'Hide' : 'How it’s counted'}</button>
      </div>
      {open && (
        <List>
          {nu.items.map((x) => (
            <Row key={x.line} dot={x.n ? C.ok : x.n === null ? C.alert : C.line} title={x.line}
              meta={<>{x.n ? <div className="details">USDA: {x.n.food}</div> : x.n === null ? <div className="details">Not found in USDA data</div> : null}{`${r0(x.g)} g${x.guessed ? ' (guessed)' : ''} · ${r0(x.protein / por)} g protein · ${r0(x.fiber / por)} g fiber per portion`}</>}
              trail="→" onClick={() => pushSheet(<GramsEdit id={r.id} line={x.line} g={x.g} />)} />
          ))}
        </List>
      )}
    </>
  )
}

// correct how many grams of an ingredient go into the whole recipe
const GramsEdit = ({ id, line, g }: { id: string; line: string; g: number }) => (
  <FormSheet title={line} onBack={popSheet} initial={{ g: Math.round(g) }}
    fields={[{ key: 'g', label: 'Grams in the whole recipe', type: 'number', step: 1 }]}
    extra={<span className="t13 muted">Used to count protein and fiber. Leave empty to go back to the guess from the line.</span>}
    onSave={(v) => update((d) => {
      const x = d.recipes!.find((y) => y.id === id)!
      const grams = { ...(x.grams ?? {}) }
      if (v.g) grams[line] = v.g; else delete grams[line]
      x.grams = Object.keys(grams).length ? grams : undefined
    })} />
)

// Stove and Aerogrill: a countdown like the aerogrill's display — set one timer for the whole block,
// then each next step shows how many minutes are left on it (steps hold how long each one takes)
const TimerBlock = ({ title, steps, temp }: { title: string; steps: CookStep[]; temp?: number }) => {
  let at = 0
  const total = steps.reduce((a, x) => a + (x.min ?? 0), 0)
  const head = [temp ? `${temp} °C` : '', total ? `timer ${total} min` : ''].filter(Boolean).join(' · ')
  return (
    <div className="card" style={{ gap: 12 }}>
      <div className="between"><span className="t17">{title}</span>{head && <span className="t14 muted">{head}</span>}</div>
      <div className="pipe">
        {steps.map((x, i) => {
          const left = total - at
          const same = i > 0 && (steps[i - 1].min ?? 0) === 0 // previous step took no time: same moment, no second time label
          at += x.min ?? 0
          return (
            <div key={i} className="pstep">
              <span className="ptime">{same || !total ? '' : <>{left}<small>{left === total ? ' min' : ' left'}</small></>}</span>
              <span className={'pdot' + (i === 0 ? ' first' : '')} />
              <div className="ptext"><span className="t15">{x.text}</span>{i === 0 && total ? <span className="t13 muted">set the timer to {total} min</span> : x.min ? <span className="t13 muted">takes {x.min} min</span> : null}</div>
            </div>
          )
        })}
        {total > 0 && (
          <div className="pstep end">
            <span className="ptime">0<small> left</small></span>
            <span className="pdot" />
            <div className="ptext"><span className="t15 muted">Done</span></div>
          </div>
        )}
      </div>
    </div>
  )
}

// editable list of steps: minutes + what to do
const StepsEdit = ({ value, onChange, minLabel, placeholder }: { value: CookStep[]; onChange: (v: CookStep[]) => void; minLabel: string; placeholder: string }) => {
  const set = (i: number, patch: Partial<CookStep>) => onChange(value.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  return (
    <div className="col" style={{ gap: 8 }}>
      {value.map((x, i) => (
        <div key={i} className="row" style={{ gap: 8 }}>
          <input className="input" style={{ width: 64, flex: 'none', textAlign: 'center', padding: '13px 6px' }} type="text" inputMode="numeric" placeholder={minLabel} value={x.min ?? ''} onChange={(e) => set(i, { min: e.target.value === '' ? undefined : Number(e.target.value.replace(/\D/g, '')) })} />
          <input className="input grow" value={x.text} placeholder={placeholder} onChange={(e) => set(i, { text: e.target.value })} />
          <button type="button" aria-label="Remove" style={{ color: 'var(--ink2)', padding: 4 }} onClick={() => onChange(value.filter((_, j) => j !== i))}><Icon.x /></button>
        </div>
      ))}
      <button type="button" className="btn soft sm" style={{ alignSelf: 'flex-start' }} onClick={() => onChange([...value, { text: '' }])}>+ Add a step</button>
    </div>
  )
}

const Area = (p: { value: string; onChange: (v: string) => void; placeholder: string; rows?: number }) => (
  <textarea className="input" rows={p.rows ?? 5} value={p.value} placeholder={p.placeholder} onChange={(e) => p.onChange(e.target.value)} style={{ resize: 'vertical', lineHeight: 1.4 }} />
)

// add / edit (also used to review a pasted recipe before saving)
export const RecipeEdit = ({ id, draft }: { id?: string; draft?: Omit<Recipe, 'id'> }) => {
  const st = useSt()
  const orig = st.recipes?.find((x) => x.id === id)
  const src = orig ?? draft
  const [name, setName] = useState(src?.name ?? '')
  const [minutes, setMinutes] = useState(src?.minutes ? String(src.minutes) : '')
  const [portions, setPortions] = useState(src?.portions ? String(src.portions) : '')
  const [ing, setIng] = useState((src?.ingredients ?? []).join('\n'))
  const [stove, setStove] = useState<CookStep[]>(src?.stove ?? [])
  const [air, setAir] = useState<CookStep[]>(src?.air ?? [])
  const [airTemp, setAirTemp] = useState(src?.airTemp ? String(src.airTemp) : '')
  const [sauce, setSauce] = useState((src?.sauce ?? []).join('\n'))
  const [notes, setNotes] = useState(src?.notes ?? '')
  const [photo, setPhoto] = useState(src?.photo)
  const save = () => {
    const tidy = (xs: CookStep[]) => xs.map((x) => ({ text: x.text.trim(), min: x.min })).filter((x) => x.text)
    const data = { name: name.trim(), minutes: Number(minutes) || undefined, portions: Number(portions) > 1 ? Number(portions) : undefined, ingredients: lines(ing), stove: tidy(stove), air: tidy(air), airDur: true, airTemp: Number(airTemp) || undefined, sauce: lines(sauce), notes: notes.trim() || undefined, photo }
    update((d) => {
      d.recipes ??= []
      const x = orig && d.recipes.find((y) => y.id === orig.id)
      if (x) Object.assign(x, data)
      else d.recipes.push({ id: uid(), ...data })
    })
    closeSheet(); toast(orig ? 'Saved' : 'Recipe added')
  }
  return (
    <Sheet title={orig ? 'Edit recipe' : draft ? 'Check & save' : 'New recipe'}>
      <Field label="Photo of the meal">
        <div className="row" style={{ gap: 12 }}>
          <div className="sw" style={{ width: 72, flex: 'none' }}>{photo ? <img src={photo} alt="" /> : <Icon.camera />}</div>
          <label className="btn soft sm" style={{ cursor: 'pointer' }}>
            {photo ? 'Change' : 'Take / choose'}
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPhoto(await compress(f, 1080)) }} />
          </label>
          {photo && <button className="link" onClick={() => setPhoto(undefined)}>Remove</button>}
        </div>
      </Field>
      <Field label="Name"><input className="input" value={name} placeholder="Lemon-soy chicken" onChange={(e) => setName(e.target.value)} /></Field>
      <div className="row" style={{ gap: 8 }}>
        <div className="grow"><Field label="Takes (minutes)"><input className="input" type="text" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))} /></Field></div>
        <div className="grow"><Field label="Portions"><input className="input" type="text" inputMode="numeric" value={portions} placeholder="1" onChange={(e) => setPortions(e.target.value.replace(/\D/g, ''))} /></Field></div>
      </div>
      <Field label="Ingredients · one per line"><Area value={ing} onChange={setIng} placeholder={'200 g chicken breast\n2 tbsp soy sauce\n½ lemon'} /></Field>
      <Field label="Stove · minutes each step takes"><StepsEdit value={stove} onChange={setStove} minLabel="min" placeholder="Boil the rice" /></Field>
      <Field label="Aerogrill · minutes each step takes"><StepsEdit value={air} onChange={setAir} minLabel="min" placeholder="Chicken in" /></Field>
      <Field label="Aerogrill temperature (°C)"><input className="input" type="text" inputMode="numeric" value={airTemp} placeholder="200" onChange={(e) => setAirTemp(e.target.value.replace(/\D/g, ''))} /></Field>
      <Field label="Glaze / Sauce · one per line"><Area rows={3} value={sauce} onChange={setSauce} placeholder={'2 tbsp soy sauce\n1 tsp honey\n½ lemon, juiced'} /></Field>
      <Field label="Notes"><Area rows={2} value={notes} onChange={setNotes} placeholder="Serve with rice, tastes better with more lemon…" /></Field>
      <button className="btn full" disabled={!name.trim()} onClick={save}>Save</button>
      {orig && <button className="btn full soft" onClick={() => { if (confirm(`Delete ${orig.name}?`)) { update((d) => { d.recipes = (d.recipes ?? []).filter((y) => y.id !== orig.id) }); closeSheet() } }}>Delete</button>}
    </Sheet>
  )
}

// paste a whole recipe (e.g. from a chat) and it's split into name, ingredients and steps
const PasteSheet = () => {
  const [text, setText] = useState('')
  return (
    <Sheet title="Paste a recipe">
      <span className="t15 muted" style={{ marginTop: -4 }}>Paste the whole thing: name on the first line, then Ingredients, Stove, Aerogrill and Glaze / Sauce. You can check it before saving.</span>
      <textarea className="input" autoFocus rows={10} value={text} onChange={(e) => setText(e.target.value)} style={{ resize: 'vertical', minHeight: 200, lineHeight: 1.35 }} />
      <button className="btn full" disabled={!text.trim()} onClick={() => openSheet(<RecipeEdit draft={parseRecipe(text)} />)}>Next</button>
    </Sheet>
  )
}
