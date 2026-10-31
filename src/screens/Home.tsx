import { dismissToday, update, useSt } from '../store'
import type { Project, State } from '../types'
import { Cleaning } from './Cleaning'
import { fmt, today, uid } from '../lib'
import { C, Chips, closeSheet, Header, List, openSheet, Row, toast, useUi } from '../ui'
import { FormSheet } from '../form'

export const Home = () => {
  const sub = useUi((u) => u.sub.home)
  const setSub = useUi((u) => u.setSub)
  const st = useSt()
  const open = st.projects.filter((p) => !p.done).length
  return (
    <div className="screen">
      <Header sub={sub === 'projects' ? `Home · ${open} open` : 'Home'} title={sub === 'projects' ? 'Projects' : 'Cleaning'} />
      <Chips items={[['cleaning', 'Cleaning'], ['projects', 'Projects']]} value={sub as any} onChange={setSub} />
      {sub === 'cleaning' ? <Cleaning /> : <Projects />}
    </div>
  )
}

// ================= PROJECTS =================
export const doFirstProject = (st: State) => {
  const open = st.projects.filter((p) => !p.done)
  return open.find((p) => p.doFirst) ?? open.find((p) => p.size === 'quick') ?? open[0]
}

const Projects = () => {
  const st = useSt()
  const open = st.projects.filter((p) => !p.done)
  const first = doFirstProject(st)
  const dismissed = st.dismissed.date === today() && first && st.dismissed.ids.includes('proj-' + first.id)
  const rest = open.filter((p) => p.id !== first?.id || dismissed)
  const done = st.projects.filter((p) => p.done)
  const buys = open.filter((p) => p.toBuy)
  return (
    <>
      {first && !dismissed && (
        <div className="card dark" style={{ gap: 6 }}>
          <span className="t14 w5">Do this one first</span>
          <span className="mid" style={{ fontSize: 26 }}>{first.name}</span>
          <span className="t15">Next step: {first.nextStep}</span>
          <div className="row" style={{ paddingTop: 8 }}>
            <button className="btn home grow" onClick={() => openSheet(<ProjectStep id={first.id} />)}>Did a step</button>
            <button className="btn ghost grow" onClick={() => dismissToday('proj-' + first.id)}>Not today</button>
          </div>
        </div>
      )}
      <ProjList title="Quick fixes" right="under 30 min" items={rest.filter((p) => p.size === 'quick')} />
      <ProjList title="Need a measure + shop" right="an afternoon each" items={rest.filter((p) => p.size === 'shop')} />
      {rest.some((p) => p.size === 'big') && <div className="t17" style={{ padding: '0 4px' }}>Big ones · plan & save up</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {rest.filter((p) => p.size === 'big').map((p) => (
          <button key={p.id} className="card home" style={{ padding: 16, gap: 6, borderRadius: 20 }} onClick={() => openSheet(<ProjectEdit id={p.id} />)}>
            <span className="t17" style={{ fontSize: 18 }}>{p.name}</span>
            <span className="t14">Next: {p.nextStep}</span>
            <span className="t13 w5 muted" style={{ paddingTop: 4 }}>{p.cost ? `~${fmt(p.cost)}` : '+ add cost'}</span>
          </button>
        ))}
      </div>
      {buys.length > 0 && (
        <button className="card supplies" style={{ gap: 4, padding: 16 }} onClick={() => useUi.getState().go('supplies', 'home')}>
          <span className="t14 w5">On your Home shopping list</span>
          <span className="t17">{buys.map((p) => p.toBuy).join(', ')}</span>
        </button>
      )}
      <button className="btn full dashed" onClick={() => openSheet(<ProjectEdit />)}>+ Add a project</button>
      {done.length > 0 && (
        <List title="Done" right={String(done.length)}>
          {done.map((p) => <Row key={p.id} done title={p.name} onClick={() => openSheet(<ProjectEdit id={p.id} />)} />)}
        </List>
      )}
    </>
  )
}

const ProjList = ({ title, right, items }: { title: string; right: string; items: Project[] }) =>
  items.length ? (
    <List title={title} right={right}>
      {items.map((p) => <Row key={p.id} dot={C.home} title={p.name} meta={`Next: ${p.nextStep}`} trail="→" onClick={() => openSheet(<ProjectEdit id={p.id} />)} />)}
    </List>
  ) : null

const ProjectStep = ({ id }: { id: string }) => {
  const st = useSt()
  const p = st.projects.find((x) => x.id === id)!
  return (
    <FormSheet title="Nice. What’s next?" initial={{ nextStep: '' }} saveLabel="Save next step"
      fields={[{ key: 'nextStep', label: `Next step for “${p.name}”`, type: 'text', placeholder: p.nextStep }]}
      extra={<button className="btn full home" onClick={() => { update((d) => { const x = d.projects.find((x) => x.id === id)!; x.done = true; x.doFirst = false }); closeSheet(); toast('Project done!') }}>It’s finished</button>}
      onSave={(v) => update((d) => { d.projects.find((x) => x.id === id)!.nextStep = v.nextStep })}
    />
  )
}

const ProjectEdit = ({ id }: { id?: string }) => {
  const st = useSt()
  const p = st.projects.find((x) => x.id === id)
  return (
    <FormSheet title={p ? 'Project' : 'New project'} initial={p ?? { size: 'quick' }}
      fields={[
        { key: 'name', label: 'Project', type: 'text' },
        { key: 'nextStep', label: 'Next tiny step', type: 'text' },
        { key: 'size', label: 'Size', type: 'select', options: [['quick', 'Quick fix'], ['shop', 'Measure + shop'], ['big', 'Big one']] },
        { key: 'toBuy', label: 'Need to buy (goes to Home shopping list)', type: 'text' },
        { key: 'cost', label: 'Rough cost (zł)', type: 'number' },
        { key: 'doFirst', label: 'Do this one first?', type: 'toggle' },
        ...(p ? ([{ key: 'done', label: 'Finished', type: 'toggle' }] as const) : [])
      ]}
      onSave={(v) => update((d) => {
        if (v.doFirst) d.projects.forEach((x) => (x.doFirst = false))
        const data = { name: v.name, nextStep: v.nextStep || 'Decide the first step', size: v.size || 'quick', toBuy: v.toBuy || undefined, cost: v.cost, doFirst: !!v.doFirst, done: !!v.done }
        if (p) Object.assign(d.projects.find((x) => x.id === p.id)!, data)
        else d.projects.push({ id: uid(), ...data })
      })}
      onDelete={p ? () => update((d) => { d.projects = d.projects.filter((x) => x.id !== p.id) }) : undefined}
    />
  )
}
