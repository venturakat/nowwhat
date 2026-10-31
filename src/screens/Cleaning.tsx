import { useState } from 'react'
import { update, useSt } from '../store'
import type { CleanMode } from '../types'
import { addDays, diffDays, fmtDay, fmtWeekday, today, uid } from '../lib'
import { C, Check, Chips, closeSheet, List, openSheet, Row, Sheet, toast } from '../ui'
import { FormSheet } from '../form'
import { currentClean, extraStatus, MODE_NAME, occurrences, progress, sundayOnOrAfter, tasksFor, type Occurrence } from '../cleaning'

const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1)
const when = (o: Occurrence) => {
  const n = diffDays(today(), o.date)
  const day = n === 0 ? 'today' : n === 1 ? 'tomorrow' : n === -1 ? 'yesterday' : n < 0 ? `${fmtWeekday(o.date)} · still open` : fmtWeekday(o.date)
  const moved = o.sunday && o.sunday !== o.date ? ` (moved from ${fmtDay(o.sunday)})` : ''
  return day + moved
}

export const Cleaning = () => {
  const st = useSt()
  const cur = currentClean(st)
  const t = today()
  const upcoming = occurrences(st, t, addDays(t, 42)).filter((o) => o.key !== cur?.occ.key).slice(0, 4)
  const ex = extraStatus(st)
  return (
    <>
      {cur ? <Current occ={cur.occ} /> : <div className="card">No cleans planned.</div>}
      <List title="Coming up">
        {upcoming.map((o) => (
          <Row key={o.key} dot={o.mode === 3 ? C.ink : C.home} title={`${MODE_NAME[o.mode]} clean`} meta={when(o)} trail="→" onClick={() => openSheet(<OccSheet occ={o} />)} />
        ))}
      </List>
      <div className="card" style={{ gap: 6, padding: 16 }}>
        <span className="t14 w5 muted">Extra · once a season</span>
        <span className="t17">
          {ex.doneOn ? `Done this ${ex.season.name} on ${fmtDay(ex.doneOn)}` : ex.plannedOn ? `Planned for ${fmtWeekday(ex.plannedOn)}` : `Not done this ${ex.season.name} yet · ${ex.daysLeft} days left`}
        </span>
        {!ex.doneOn && (
          <button className="btn soft sm" style={{ alignSelf: 'flex-start', marginTop: 4 }} onClick={() => openSheet(<PlanExtra date={ex.plannedOn} />)}>
            {ex.plannedOn ? 'Change date' : 'Plan the Extra clean'}
          </button>
        )}
      </div>
      <button className="btn full soft" onClick={() => openSheet(<ListsSheet />)}>Edit lists & rotation</button>
    </>
  )
}

const Current = ({ occ }: { occ: Occurrence }) => {
  const st = useSt()
  const { tasks, done, finished } = progress(st, occ)
  const toggle = (id: string) =>
    update((d) => {
      const rec = (d.cleanDone[occ.key] ??= { mode: occ.mode, date: occ.date, done: [] })
      rec.done = rec.done.includes(id) ? rec.done.filter((x) => x !== id) : [...rec.done, id]
      const all = tasksFor(d, occ.mode).every((t) => rec.done.includes(t.id))
      if (all && !rec.finished) toast('All done. Go do something nice.')
      rec.finished = all
      rec.date = occ.date
    })
  return (
    <>
      <div className="card home" style={{ gap: 4 }}>
        <span className="t15 w5">{cap(when(occ))}</span>
        <span className="mid">{MODE_NAME[occ.mode]} clean</span>
        <span className="t15">{finished ? 'All done' : `${done.length} of ${tasks.length} done`}</span>
        <div className="btn2" style={{ paddingTop: 8 }}>
          <button className="btn" onClick={() => openSheet(<MoveSheet occ={occ} />)}>Move date</button>
          <button className="btn ghost" onClick={() => openSheet(<OccSheet occ={occ} />)}>More</button>
        </div>
      </div>
      <div className="list" style={{ padding: '6px 16px' }}>
        {tasks.map((t) => {
          const on = done.includes(t.id)
          return (
            <button key={t.id} className="row" style={{ width: '100%', padding: '11px 0', gap: 12 }} onClick={() => toggle(t.id)}>
              <Check on={on} />
              <span className="grow t17" style={{ fontWeight: 500, textDecoration: on ? 'line-through' : undefined, color: on ? 'var(--ink2)' : undefined }}>{t.name}</span>
            </button>
          )
        })}
        {!tasks.length && <div className="list-empty">This list is empty — add steps in “Edit lists”.</div>}
      </div>
    </>
  )
}

const moveOcc = (occ: Occurrence, date: string) =>
  update((d) => {
    if (occ.mode === 3 && !occ.sunday) {
      d.cleanPlan.extras = d.cleanPlan.extras.filter((x) => x !== occ.date).concat(date)
      if (d.cleanDone[occ.key]) { d.cleanDone['x-' + date] = d.cleanDone[occ.key]; delete d.cleanDone[occ.key] }
    } else if (occ.sunday) {
      if (date === occ.sunday) delete d.cleanPlan.moves[occ.sunday]
      else d.cleanPlan.moves[occ.sunday] = date
    }
  })

const MoveSheet = ({ occ }: { occ: Occurrence }) => (
  <FormSheet title={`Move ${MODE_NAME[occ.mode]} clean`} initial={{ date: occ.date }} saveLabel="Move"
    fields={[{ key: 'date', label: 'New date', type: 'date' }]}
    extra={occ.sunday && occ.sunday !== occ.date ? <button className="btn full soft" onClick={() => { moveOcc(occ, occ.sunday!); closeSheet() }}>Back to Sunday {fmtDay(occ.sunday)}</button> : undefined}
    onSave={(v) => { if (v.date) { moveOcc(occ, v.date); toast(`Moved to ${fmtWeekday(v.date)}`) } }}
  />
)

const OccSheet = ({ occ }: { occ: Occurrence }) => (
  <Sheet title={`${MODE_NAME[occ.mode]} clean`}>
    <span className="t15 muted">{when(occ)}</span>
    <button className="btn full" onClick={() => openSheet(<MoveSheet occ={occ} />)}>Move date</button>
    {occ.sunday ? (
      <button className="btn full soft" onClick={() => { update((d) => { d.cleanPlan.skips.push(occ.sunday!) }); closeSheet(); toast('Skipped this one') }}>Skip this week</button>
    ) : (
      <button className="btn full soft" onClick={() => { update((d) => { d.cleanPlan.extras = d.cleanPlan.extras.filter((x) => x !== occ.date) }); closeSheet() }}>Remove this Extra</button>
    )}
    {occ.sunday && (
      <button className="btn full soft" onClick={() => {
        update((d) => { d.cleanPlan.anchor = occ.sunday!; d.cleanPlan.anchorMode = occ.mode === 1 ? 2 : 1 })
        closeSheet(); toast('Rotation flipped from this Sunday on')
      }}>Make it {occ.mode === 1 ? 'Regular' : 'Light'} (flips the rotation)</button>
    )}
  </Sheet>
)

const PlanExtra = ({ date }: { date?: string }) => (
  <FormSheet title="Plan the Extra clean" initial={{ date: date ?? sundayOnOrAfter(addDays(today(), 1)) }} saveLabel="Plan it"
    fields={[{ key: 'date', label: 'Date (on a Sunday it replaces that week’s clean)', type: 'date' }]}
    onSave={(v) => { if (v.date) update((d) => { d.cleanPlan.extras = d.cleanPlan.extras.filter((x) => x !== date).concat(v.date) }) }}
    onDelete={date ? () => update((d) => { d.cleanPlan.extras = d.cleanPlan.extras.filter((x) => x !== date) }) : undefined}
  />
)

const ListsSheet = () => {
  const st = useSt()
  const [mode, setMode] = useState<CleanMode>(1)
  const nextSun = sundayOnOrAfter(today())
  const nextMode = occurrences(st, nextSun, nextSun).find((o) => o.sunday === nextSun)?.mode ?? 1
  const tasks = tasksFor(st, mode)
  const edit = (id?: string) => {
    const t = st.cleanTasks.find((x) => x.id === id)
    openSheet(
      <FormSheet title={t ? 'Edit step' : `New step in ${MODE_NAME[mode]}`} initial={t ?? {}}
        fields={[{ key: 'name', label: 'Step', type: 'text' }]}
        onSave={(v) => { update((d) => { if (t) d.cleanTasks.find((x) => x.id === t.id)!.name = v.name; else d.cleanTasks.push({ id: uid(), name: v.name, mode }) }); setTimeout(() => openSheet(<ListsSheet />)) }}
        onDelete={t ? () => { update((d) => { d.cleanTasks = d.cleanTasks.filter((x) => x.id !== t.id) }); setTimeout(() => openSheet(<ListsSheet />)) } : undefined}
      />
    )
  }
  const moveUp = (id: string) => update((d) => {
    const same = d.cleanTasks.filter((x) => x.mode === mode)
    const i = same.findIndex((x) => x.id === id)
    if (i <= 0) return
    const a = d.cleanTasks.indexOf(same[i - 1]), b = d.cleanTasks.indexOf(same[i])
    ;[d.cleanTasks[a], d.cleanTasks[b]] = [d.cleanTasks[b], d.cleanTasks[a]]
  })
  return (
    <Sheet title="Cleaning lists">
      <div className="card" style={{ gap: 8, padding: 16 }}>
        <span className="t15 w5">Every Sunday, Light and Regular take turns.</span>
        <span className="t14 muted">This Sunday ({fmtDay(nextSun)}) is:</span>
        <div className="seg">
          {([1, 2] as const).map((m) => (
            <button key={m} className={'chip' + (nextMode === m ? ' on' : '')} onClick={() => update((d) => { d.cleanPlan.anchor = nextSun; d.cleanPlan.anchorMode = m })}>{MODE_NAME[m]}</button>
          ))}
        </div>
      </div>
      <Chips items={[['1', 'Light'], ['2', 'Regular'], ['3', 'Extra']]} value={String(mode)} onChange={(v) => setMode(Number(v) as CleanMode)} />
      <List title={`${MODE_NAME[mode]} · ${tasks.length} steps`}>
        {tasks.map((t, i) => (
          <div key={t.id} className="row" style={{ paddingRight: 10 }}>
            <div className="grow"><Row title={t.name} onClick={() => edit(t.id)} /></div>
            {i > 0 && <button className="link" aria-label="Move up" onClick={() => moveUp(t.id)} style={{ padding: 6 }}>↑</button>}
          </div>
        ))}
      </List>
      <button className="btn full" onClick={() => edit()}>+ Add step to {MODE_NAME[mode]}</button>
      <button className="btn full soft" onClick={closeSheet}>Done</button>
    </Sheet>
  )
}
