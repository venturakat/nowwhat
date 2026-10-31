import { dismissToday, update, useSt } from '../store'
import type { CleanMode, Project, State } from '../types'
import { fmt, today, uid } from '../lib'
import { C, Check, Chips, closeSheet, Header, List, openSheet, Row, Sheet, toast, useUi } from '../ui'
import { FormSheet } from '../form'

export const MODES: { m: CleanMode; name: string }[] = [{ m: 1, name: 'Light' }, { m: 2, name: 'Regular' }, { m: 3, name: 'Extra' }]
export const energyMode = (st: State): CleanMode => {
  const e = st.energy?.date === today() ? st.energy.level : 'okay'
  return e === 'low' ? 1 : e === 'lots' ? 3 : 2
}
export const currentClean = (st: State) => {
  const log = st.cleanLog?.date === today() ? st.cleanLog : null
  const mode = log?.mode ?? energyMode(st)
  const tasks = st.cleanTasks.filter((t) => t.mode <= mode)
  const done = log?.done ?? []
  const minutes = tasks.reduce((a, t) => a + t.minutes, 0)
  return { mode, tasks, done, minutes, fromEnergy: !log }
}
const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}` : `${m} min`)

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

const Cleaning = () => {
  const st = useSt()
  const c = currentClean(st)
  const setMode = (m: CleanMode) => update((d) => { d.cleanLog = { date: today(), mode: m, done: d.cleanLog?.date === today() ? d.cleanLog.done : [] } })
  const toggle = (id: string) => update((d) => {
    if (d.cleanLog?.date !== today()) d.cleanLog = { date: today(), mode: c.mode, done: [] }
    const l = d.cleanLog!
    l.done = l.done.includes(id) ? l.done.filter((x) => x !== id) : [...l.done, id]
    const total = d.cleanTasks.filter((t) => t.mode <= l.mode).length
    if (l.done.length === total) toast('All done. Go do something nice.')
  })
  const nDone = c.tasks.filter((t) => c.done.includes(t.id)).length
  const energy = st.energy?.date === today() ? st.energy.level : null
  return (
    <>
      <div className="row">
        {MODES.map(({ m, name }) => {
          const mins = st.cleanTasks.filter((t) => t.mode <= m).reduce((a, t) => a + t.minutes, 0)
          return (
            <button key={m} className="card grow" style={{ padding: 14, gap: 2, borderRadius: 20, background: c.mode === m ? 'var(--home)' : 'var(--card)' }} onClick={() => setMode(m)}>
              <span className="t17" style={{ fontSize: 18 }}>{name}</span>
              <span className="t14 muted">{fmtMin(mins)}</span>
            </button>
          )
        })}
      </div>
      <div className="t14 muted" style={{ padding: '0 4px' }}>
        {c.fromEnergy ? (energy ? `Picked because your energy is “${energy}”.` : 'Set your energy on Today and I’ll pick for you.') : 'Your pick for today.'} Switch anytime — no penalties.
      </div>
      <div className="list" style={{ padding: '14px 16px 8px' }}>
        <div className="between" style={{ paddingBottom: 6 }}>
          <span className="t17">{MODES[c.mode - 1].name} clean</span>
          <span className="t15 w5 muted">{nDone} / {c.tasks.length}</span>
        </div>
        {c.tasks.map((t) => {
          const on = c.done.includes(t.id)
          return (
            <button key={t.id} className="row" style={{ width: '100%', padding: '11px 0', gap: 12 }} onClick={() => toggle(t.id)}>
              <Check on={on} />
              <span className="grow t17 w5" style={{ fontWeight: 500, textDecoration: on ? 'line-through' : undefined, color: on ? 'var(--ink2)' : undefined }}>{t.name}</span>
              <span className="t14 muted">{t.minutes} min</span>
            </button>
          )
        })}
      </div>
      <button className="btn full soft" onClick={() => openSheet(<CleanEdit />)}>Edit cleaning list</button>
    </>
  )
}

const CleanEdit = () => {
  const st = useSt()
  const edit = (id?: string) => {
    const t = st.cleanTasks.find((x) => x.id === id)
    openSheet(
      <FormSheet title={t ? 'Edit step' : 'New step'} initial={t ? { ...t, mode: String(t.mode) } : { minutes: 10, mode: '2' }}
        fields={[{ key: 'name', label: 'Step', type: 'text' }, { key: 'minutes', label: 'Minutes', type: 'number', step: 1 }, { key: 'mode', label: 'Smallest mode it belongs to', type: 'select', options: [['1', 'Light'], ['2', 'Regular'], ['3', 'Extra']] }]}
        onSave={(v) => { update((d) => {
          const data = { name: v.name, minutes: v.minutes ?? 5, mode: Number(v.mode ?? 2) as CleanMode }
          if (t) Object.assign(d.cleanTasks.find((x) => x.id === t.id)!, data)
          else d.cleanTasks.push({ id: uid(), ...data })
        }); setTimeout(() => openSheet(<CleanEdit />)) }}
        onDelete={t ? () => { update((d) => { d.cleanTasks = d.cleanTasks.filter((x) => x.id !== t.id) }); setTimeout(() => openSheet(<CleanEdit />)) } : undefined}
      />
    )
  }
  return (
    <Sheet title="Cleaning list">
      <div className="t14 muted">Light is the minimum. Regular adds to Light, Extra adds to both.</div>
      {MODES.map(({ m, name }) => (
        <List key={m} title={name}>
          {st.cleanTasks.filter((t) => t.mode === m).map((t) => <Row key={t.id} title={t.name} trail={<span className="t15 muted">{t.minutes} min</span>} onClick={() => edit(t.id)} />)}
        </List>
      ))}
      <button className="btn full" onClick={() => edit()}>+ Add step</button>
      <button className="btn full soft" onClick={closeSheet}>Done</button>
    </Sheet>
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
