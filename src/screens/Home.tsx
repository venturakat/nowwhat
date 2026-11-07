import { useState } from 'react'
import { update, useSt } from '../store'
import type { Project } from '../types'
import { Cleaning } from './Cleaning'
import { Recipes } from './Recipes'
import { curSign, mainCur, fmt, numText, parseNum, splitList, uid } from '../lib'
import { tr, trn } from '../i18n'
import { C, Check, Chips, closeSheet, Field, Header, Icon, List, openSheet, Row, Sheet, toast, registerSubs, useUi } from '../ui'

const SUBTABS: [string, string][] = [['cleaning', 'Cleaning'], ['projects', 'Projects'], ['recipes', 'Recipes']]
registerSubs('home', SUBTABS.map((x) => x[0]))

export const Home = () => {
  const sub = useUi((u) => u.sub.home)
  const setSub = useUi((u) => u.setSub)
  const st = useSt()
  const open = st.projects.filter((p) => !p.done).length
  return (
    <div className="screen">
      <Header sub={sub === 'projects' ? `${tr('Home')} · ${tr('{n} open', { n: open })}` : 'Home'} title={sub === 'projects' ? 'Projects' : sub === 'recipes' ? 'Recipes' : 'Cleaning'} />
      <Chips items={SUBTABS} value={sub as any} onChange={setSub} swipe />
      {sub === 'cleaning' ? <Cleaning /> : sub === 'recipes' ? <Recipes /> : <Projects />}
    </div>
  )
}

// ================= PROJECTS =================
export const projectNext = (p: Project) => p.steps.find((x) => !x.done)

const Projects = () => {
  const st = useSt()
  const open = st.projects.filter((p) => !p.done)
  const done = st.projects.filter((p) => p.done)
  const buys = open.flatMap((p) => splitList(p.toBuy))
  const row = (p: Project) => {
    const next = projectNext(p)
    const n = p.steps.filter((x) => x.done).length
    const meta = [next ? tr('Next: {x}', { x: next.text }) : p.steps.length ? tr('All steps done') : tr('No steps planned yet'), p.steps.length ? `${n}/${p.steps.length}` : '', p.cost ? `~${fmt(p.cost)}` : ''].filter(Boolean).join(' · ')
    return <Row key={p.id} dot={p.kind === 'diy' ? C.home : C.ink} title={p.name} meta={meta} trail="→" onClick={() => openSheet(<ProjectSheet id={p.id} />)} />
  }
  return (
    <>
      <List title="DIY" right="I can do it myself" empty="Nothing here.">{open.filter((p) => p.kind === 'diy').map(row)}</List>
      <List title="Outsource" right="need someone for it" empty="Nothing here.">{open.filter((p) => p.kind === 'outsource').map(row)}</List>
      {buys.length > 0 && (
        <button className="card supplies" style={{ gap: 4, padding: 16 }} onClick={() => useUi.getState().go('supplies', 'home')}>
          <span className="t14 w5">{tr('On your Home shopping list')} · {buys.length}</span>
          <span className="t17">{buys.join(', ')}</span>
        </button>
      )}
      <button className="btn full dashed" onClick={() => openSheet(<ProjectSheet />)}>+ {tr('Add a project')}</button>
      {done.length > 0 && (
        <List title="Done" right={String(done.length)}>
          {done.map((p) => <Row key={p.id} done title={p.name} onClick={() => openSheet(<ProjectSheet id={p.id} />)} />)}
        </List>
      )}
    </>
  )
}

// One card for everything about a project: name, DIY/Outsource, planned steps, what to buy, cost
export const ProjectSheet = ({ id }: { id?: string }) => {
  const st = useSt()
  const orig = st.projects.find((x) => x.id === id)
  const [p, setP] = useState<Project>(() => orig ? structuredClone(orig) : { id: uid(), name: '', kind: 'diy', steps: [] })
  const [newStep, setNewStep] = useState('')
  const [costText, setCostText] = useState(numText(orig?.cost))
  const set = (patch: Partial<Project>) => setP((o) => ({ ...o, ...patch }))
  const addStep = () => { const t = newStep.trim(); if (!t) return; set({ steps: [...p.steps, { id: uid(), text: t }] }); setNewStep('') }
  const save = (extra: Partial<Project> = {}) => {
    const steps = newStep.trim() ? [...p.steps, { id: uid(), text: newStep.trim() }] : p.steps
    const out = { ...p, steps, ...extra, name: p.name.trim(), toBuy: splitList(p.toBuy).join(', ') || undefined }
    update((d) => { const i = d.projects.findIndex((x) => x.id === out.id); if (i >= 0) d.projects[i] = out; else d.projects.push(out) })
    closeSheet()
  }
  const items = splitList(p.toBuy)
  return (
    <Sheet title={orig ? 'Project' : 'New project'}>
      <Field label="Project"><input className="input" value={p.name} placeholder={tr('Kitchen rack')} onChange={(e) => set({ name: e.target.value })} /></Field>
      <div className="seg">
        <button className={'chip' + (p.kind === 'diy' ? ' on' : '')} onClick={() => set({ kind: 'diy' })}>{tr('DIY')}</button>
        <button className={'chip' + (p.kind === 'outsource' ? ' on' : '')} onClick={() => set({ kind: 'outsource' })}>{tr('Outsource')}</button>
      </div>
      <div className="field">
        <label>{tr('Plan')}</label>
        <div className="list" style={{ padding: '4px 14px' }}>
          {p.steps.map((x, i) => (
            <div key={x.id} className="row" style={{ padding: '9px 0', gap: 10 }}>
              <button onClick={() => set({ steps: p.steps.map((y) => (y.id === x.id ? { ...y, done: !y.done } : y)) })}><Check on={!!x.done} /></button>
              <input className="grow" value={x.text} onChange={(e) => set({ steps: p.steps.map((y) => (y.id === x.id ? { ...y, text: e.target.value } : y)) })}
                style={{ border: 0, outline: 'none', background: 'transparent', fontSize: 16, fontWeight: 500, textDecoration: x.done ? 'line-through' : undefined, color: x.done ? 'var(--ink2)' : undefined }} />
              {i > 0 && <button className="link" aria-label={tr('Move up')} style={{ padding: 4 }} onClick={() => { const s2 = [...p.steps]; [s2[i - 1], s2[i]] = [s2[i], s2[i - 1]]; set({ steps: s2 }) }}>↑</button>}
              <button aria-label={tr('Remove step')} style={{ padding: 4, color: 'var(--ink2)' }} onClick={() => set({ steps: p.steps.filter((y) => y.id !== x.id) })}><Icon.x /></button>
            </div>
          ))}
          <div className="row" style={{ padding: '9px 0', gap: 10 }}>
            <span className="check" style={{ borderStyle: 'dashed' }} />
            <input className="grow" value={newStep} placeholder={p.steps.length ? tr('Add a step') : tr('First step, e.g. measure the wall')} onChange={(e) => setNewStep(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addStep()}
              style={{ border: 0, outline: 'none', background: 'transparent', fontSize: 16 }} />
            {newStep.trim() && <button className="btn sm" onClick={addStep}>{tr('Add')}</button>}
          </div>
        </div>
      </div>
      <Field label="Need to buy (separate with commas)">
        <input className="input" value={p.toBuy ?? ''} placeholder={tr('mounting glue, screws, hooks')} onChange={(e) => set({ toBuy: e.target.value })} />
        {items.length > 0 && <span className="t13 muted">{trn(items.length, 'Goes to the Home shopping list as {n} item', 'Goes to the Home shopping list as {n} items')}</span>}
      </Field>
      <Field label={tr('Rough cost ({c})', { c: curSign(mainCur()) })}>
        <input className="input" type="text" inputMode="decimal" value={costText} onChange={(e) => { setCostText(e.target.value); set({ cost: parseNum(e.target.value) }) }} />
      </Field>
      <button className="btn full" disabled={!p.name.trim()} onClick={() => save()}>{tr('Save')}</button>
      {orig && !orig.done && <button className="btn full home" onClick={() => { save({ done: true }); toast('Project done!') }}>{tr('It’s finished')}</button>}
      {orig?.done && <button className="btn full soft" onClick={() => save({ done: false })}>{tr('Not finished after all')}</button>}
      {orig && <button className="btn full soft" onClick={() => { update((d) => { d.projects = d.projects.filter((x) => x.id !== orig.id) }); closeSheet() }}>{tr('Delete')}</button>}
    </Sheet>
  )
}
