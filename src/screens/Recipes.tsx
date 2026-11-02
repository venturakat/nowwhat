import { useState } from 'react'
import { update, useSt } from '../store'
import type { CookStep, Recipe } from '../types'
import { fmtDay, ingredientName, parseRecipe, recipeStatus, today, uid } from '../lib'
import { C, closeSheet, Field, Icon, List, openSheet, Row, Sheet, toast, useUi } from '../ui'

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
  const [ing, setIng] = useState((src?.ingredients ?? []).join('\n'))
  const [stove, setStove] = useState<CookStep[]>(src?.stove ?? [])
  const [air, setAir] = useState<CookStep[]>(src?.air ?? [])
  const [airTemp, setAirTemp] = useState(src?.airTemp ? String(src.airTemp) : '')
  const [sauce, setSauce] = useState((src?.sauce ?? []).join('\n'))
  const [notes, setNotes] = useState(src?.notes ?? '')
  const save = () => {
    const tidy = (xs: CookStep[]) => xs.map((x) => ({ text: x.text.trim(), min: x.min })).filter((x) => x.text)
    const data = { name: name.trim(), minutes: Number(minutes) || undefined, ingredients: lines(ing), stove: tidy(stove), air: tidy(air), airDur: true, airTemp: Number(airTemp) || undefined, sauce: lines(sauce), notes: notes.trim() || undefined }
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
      <Field label="Name"><input className="input" value={name} placeholder="Lemon-soy chicken" onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Takes (minutes)"><input className="input" type="text" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))} /></Field>
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
