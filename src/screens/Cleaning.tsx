import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { update, useSt } from '../store'
import type { CleanMode, CleanRepeat } from '../types'
import { addDays, diffDays, fmtDay, fmtWeekday, today, uid } from '../lib'
import { tr, trn, weekdayNames } from '../i18n'
import { C, Check, Chips, closeSheet, DragList, Icon, List, openSheet, popSheet, pushSheet, Row, Sheet, toast } from '../ui'
import { FormSheet } from '../form'
import { currentClean, MODE_NAME, MODES, occurrences, onceKey, onOrAfter, progress, schedDates, schedLabel, schedOf, seasonStatus, tasksFor, type Occurrence } from '../cleaning'

const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1)
const when = (o: Occurrence) => {
  const n = diffDays(today(), o.date)
  const day = n === 0 ? tr('today') : n === 1 ? tr('tomorrow') : n === -1 ? tr('yesterday') : n < 0 ? `${fmtWeekday(o.date)} · ${tr('still open')}` : fmtWeekday(o.date)
  const moved = o.sched && o.sched !== o.date ? ` (${tr('moved from {d}', { d: fmtDay(o.sched) })})` : ''
  return day + (o.start ? ` · ${o.start}${o.end ? `–${o.end}` : ''}` : '') + moved
}

export const Cleaning = () => {
  const st = useSt()
  const cur = currentClean(st)
  const t = today()
  const upcoming = occurrences(st, t, addDays(t, 120)).filter((o) => o.key !== cur?.occ.key).slice(0, 4)
  const seasonal = MODES.filter((m) => schedOf(st.cleanPlan, m).every === 'season')
  const planned = MODES.some((m) => schedOf(st.cleanPlan, m).every !== 'off')
  return (
    <>
      {cur ? <Current occ={cur.occ} /> : (
        <div className="card" style={{ gap: 6, padding: 16 }}>
          <span className="t17">{tr('No cleans planned')}</span>
          {!planned && <span className="t15 muted">{tr('Pick the day and how often for each list.')}</span>}
          {!planned && <button className="btn soft sm" style={{ alignSelf: 'flex-start', marginTop: 4 }} onClick={() => openSheet(<ListsSheet />)}>{tr('Plan cleaning')}</button>}
        </div>
      )}
      {upcoming.length > 0 && (
        <List title="Coming up">
          {upcoming.map((o) => (
            <Row key={o.key} dot={o.mode === 3 ? C.ink : C.home} title={tr(`${MODE_NAME[o.mode]} clean`)} meta={when(o)} trail="→" onClick={() => openSheet(<OccSheet occ={o} />)} />
          ))}
        </List>
      )}
      {seasonal.map((m) => <SeasonCard key={m} mode={m} />)}
      <div className="card" style={{ gap: 6, padding: 16 }}>
        <span className="t14 w5 muted">{tr('Cleaning presets')}</span>
        <span className="t17">{tr('Modify to make it suit your needs.')}</span>
        <button className="btn soft sm" style={{ alignSelf: 'flex-start', marginTop: 4 }} onClick={() => openSheet(<ListsSheet />)}>{tr('Edit lists')}</button>
      </div>
    </>
  )
}

const SeasonCard = ({ mode }: { mode: CleanMode }) => {
  const st = useSt()
  const ex = seasonStatus(st, mode)
  return (
    <div className="card" style={{ gap: 6, padding: 16 }}>
      <span className="t14 w5 muted">{tr(MODE_NAME[mode])} · {tr('once a season')}</span>
      <span className="t17">
        {ex.doneOn ? tr('Done this {s} on {d}', { s: ex.season.name, d: fmtDay(ex.doneOn) }) : ex.plannedOn ? tr('Planned for {d}', { d: fmtWeekday(ex.plannedOn) }) : trn(ex.daysLeft, 'Not done this {s} yet · {n} day left', 'Not done this {s} yet · {n} days left', { s: ex.season.name })}
      </span>
      {!ex.doneOn && (
        <button className="btn soft sm" style={{ alignSelf: 'flex-start', marginTop: 4 }} onClick={() => openSheet(<PlanOnce mode={mode} date={ex.plannedOn} />)}>
          {ex.plannedOn ? tr('Change date') : tr(`Plan the ${MODE_NAME[mode]} clean`)}
        </button>
      )}
    </div>
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
        <span className="mid">{tr(`${MODE_NAME[occ.mode]} clean`)}</span>
        <span className="t15">{finished ? tr('All done') : tr('{n} of {m} done', { n: done.length, m: tasks.length })}</span>
        <div className="btn2" style={{ paddingTop: 8 }}>
          <button className="btn" onClick={() => openSheet(<MoveSheet occ={occ} />)}>{tr('Move date')}</button>
          <button className="btn ghost" onClick={() => openSheet(<OccSheet occ={occ} />)}>{tr('More')}</button>
        </div>
      </div>
      <div className="list" style={{ padding: '6px 16px' }}>
        {tasks.map((t) => {
          const on = done.includes(t.id)
          return (
            <button key={t.id} className="row" style={{ width: '100%', padding: '11px 0', gap: 12 }} onClick={() => toggle(t.id)}>
              <Check on={on} />
              <span className="grow t17" style={{ fontWeight: 500, textDecoration: on ? 'line-through' : undefined, color: on ? 'var(--ink2)' : undefined }}>{tr(t.name)}</span>
            </button>
          )
        })}
        {!tasks.length && <div className="list-empty">{tr('This list is empty — add steps in “Edit lists”.')}</div>}
      </div>
    </>
  )
}

export const moveOcc = (occ: Occurrence, date: string) =>
  update((d) => {
    if (!occ.sched) {
      const once = (d.cleanPlan.once ??= {})
      once[occ.mode] = (once[occ.mode] ?? []).filter((x) => x !== occ.date).concat(date)
      const to = onceKey(occ.mode, date)
      if (d.cleanDone[occ.key] && occ.key !== to) { d.cleanDone[to] = d.cleanDone[occ.key]; delete d.cleanDone[occ.key] }
      const tm = d.cleanPlan.times?.[occ.key]
      if (tm && occ.key !== to) { d.cleanPlan.times![to] = tm; delete d.cleanPlan.times![occ.key] }
    } else {
      if (date === occ.sched) delete d.cleanPlan.moves[occ.sched]
      else d.cleanPlan.moves[occ.sched] = date
    }
  })

const MoveSheet = ({ occ }: { occ: Occurrence }) => (
  <FormSheet title={tr(`Move ${MODE_NAME[occ.mode]} clean`)} initial={{ date: occ.date }} saveLabel="Move"
    fields={[{ key: 'date', label: 'New date', type: 'date' }]}
    extra={occ.sched && occ.sched !== occ.date ? <button className="btn full soft" onClick={() => { moveOcc(occ, occ.sched!); closeSheet() }}>{tr('Back to {d}', { d: fmtWeekday(occ.sched) })}</button> : undefined}
    onSave={(v) => { if (v.date) { moveOcc(occ, v.date); toast(tr('Moved to {d}', { d: fmtWeekday(v.date) })) } }}
  />
)

const OccSheet = ({ occ }: { occ: Occurrence }) => (
  <Sheet title={tr(`${MODE_NAME[occ.mode]} clean`)}>
    <span className="t15 muted">{when(occ)}</span>
    <button className="btn full" onClick={() => openSheet(<MoveSheet occ={occ} />)}>{tr('Move date')}</button>
    {occ.sched ? (
      <button className="btn full soft" onClick={() => { update((d) => { d.cleanPlan.skips.push(occ.sched!) }); closeSheet(); toast('Skipped this one') }}>{tr('Skip this one')}</button>
    ) : (
      <button className="btn full soft" onClick={() => { update((d) => { const o = d.cleanPlan.once ?? {}; o[occ.mode] = (o[occ.mode] ?? []).filter((x) => x !== occ.date) }); closeSheet() }}>{tr('Remove this one')}</button>
    )}
  </Sheet>
)

const PlanOnce = ({ mode, date }: { mode: CleanMode; date?: string }) => {
  const drop = (d: { cleanPlan: { once?: Partial<Record<CleanMode, string[]>> } }) => { const o = (d.cleanPlan.once ??= {}); o[mode] = (o[mode] ?? []).filter((x) => x !== date); return o }
  return (
    <FormSheet title={tr(`Plan the ${MODE_NAME[mode]} clean`)} initial={{ date: date ?? addDays(today(), 1) }} saveLabel="Plan it"
      fields={[{ key: 'date', label: 'Date (on a cleaning day it takes that clean’s place)', type: 'date' }]}
      onSave={(v) => { if (v.date) update((d) => { const o = drop(d); o[mode] = o[mode]!.concat(v.date) }) }}
      onDelete={date ? () => update((d) => { drop(d) }) : undefined}
    />
  )
}

const REPEATS: [CleanRepeat, string][] = [['off', 'Not planned'], ['week', 'Every week'], ['2weeks', 'Every 2 weeks'], ['3weeks', 'Every 3 weeks'], ['4weeks', 'Every 4 weeks'], ['month', 'Once a month'], ['season', 'Once a season (I pick the date)']]
const noDay = (v: Record<string, any>) => v.every === 'off' || v.every === 'season'

const ScheduleSheet = ({ mode }: { mode: CleanMode }) => {
  const st = useSt()
  const s = schedOf(st.cleanPlan, mode)
  const wd = weekdayNames(true)
  return (
    <FormSheet title={tr(`${MODE_NAME[mode]} clean`)} onBack={() => popSheet()} full={false}
      initial={{ every: s.every, day: String(s.day), from: s.from < today() ? today() : s.from }}
      fields={[
        { key: 'every', label: 'Repeats', type: 'select', options: REPEATS },
        { key: 'day', label: 'Day', type: 'select', options: [1, 2, 3, 4, 5, 6, 0].map((i) => [String(i), wd[i]] as [string, string]), hide: noDay },
        { key: 'from', label: 'Starting from', type: 'date', hide: noDay }
      ]}
      onSave={(v) => update((d) => {
        const day = Number(v.day ?? s.day)
        const from = noDay(v) ? s.from : onOrAfter(v.from || today(), day)
        ;(d.cleanPlan.sched ??= {})[mode] = { every: v.every, day, from }
      })}
    />
  )
}

const ListsSheet = ({ start = 1 }: { start?: CleanMode }) => {
  const st = useSt()
  const [mode, setMode] = useState<CleanMode>(start)
  const [armed, setArmed] = useState<string | null>(null) // bin tapped once: tap again to delete
  const tasks = tasksFor(st, mode)
  const s = schedOf(st.cleanPlan, mode)
  const next = schedDates(s, today(), addDays(today(), 120))[0]
  const edit = (id?: string) => {
    const t = st.cleanTasks.find((x) => x.id === id)
    pushSheet(
      <FormSheet title={t ? tr('Edit step') : tr('New step in {x}', { x: tr(MODE_NAME[mode]) })} initial={t ? { ...t, name: tr(t.name) } : {}} onBack={() => popSheet()} full={false}
        fields={[{ key: 'name', label: 'Step', type: 'text' }]}
        onSave={(v) => update((d) => { if (t) d.cleanTasks.find((x) => x.id === t.id)!.name = v.name; else d.cleanTasks.push({ id: uid(), name: v.name, mode }) })}
      />
    )
  }
  const bin = (id: string) => {
    if (armed !== id) { setArmed(id); setTimeout(() => setArmed((a) => (a === id ? null : a)), 3000); return }
    setArmed(null)
    update((d) => { d.cleanTasks = d.cleanTasks.filter((x) => x.id !== id) })
  }
  // reorder within this list; the other lists keep their places in cleanTasks
  const move = (from: number, to: number) => update((d) => {
    const slots = d.cleanTasks.map((x, i) => (x.mode === mode ? i : -1)).filter((i) => i >= 0)
    const same = slots.map((i) => d.cleanTasks[i])
    const [x] = same.splice(from, 1)
    same.splice(to, 0, x)
    slots.forEach((i, k) => { d.cleanTasks[i] = same[k] })
  })
  // swipe left / right anywhere on the sheet to go to the next / previous list — the content follows the finger,
  // slides away and the next list slides in, like the tab swipes (swipe.ts); at the first / last list it just springs back
  const mark = useRef<HTMLSpanElement>(null)
  const modeRef = useRef(mode)
  modeRef.current = mode
  useEffect(() => {
    const page = mark.current?.closest<HTMLElement>('.page') ?? mark.current?.parentElement
    if (!page) return
    const els = () => { const k = [...page.children] as HTMLElement[]; const i = k.findIndex((x) => x.classList.contains('chips')); return k.slice(i + 1) }
    const put = (xs: HTMLElement[], x: number, o: number, tr = 'none') => { for (const el of xs) { el.style.transition = tr; el.style.transform = x ? `translateX(${x}px)` : ''; el.style.opacity = o === 1 ? '' : String(o) } }
    const can = (dir: 1 | -1) => { const i = MODES.indexOf(modeRef.current) + dir; return i >= 0 && i < MODES.length }
    let g: { x: number; y: number; t: number; dx: number; lock?: 'h' | 'v'; xs: HTMLElement[] } | null = null
    const start = (e: TouchEvent) => {
      const t = e.target as HTMLElement
      g = e.touches.length === 1 && !t.closest('.noswipe, input, textarea, .chips') && page.classList.contains('top') ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now(), dx: 0, xs: [] } : null
    }
    const move = (e: TouchEvent) => {
      if (!g) return
      const dx = e.touches[0].clientX - g.x, dy = e.touches[0].clientY - g.y
      if (!g.lock) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
        g.lock = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'h' : 'v'
        if (g.lock === 'h') g.xs = els()
      }
      if (g.lock !== 'h') return
      e.preventDefault()
      g.dx = dx
      const ok = can(dx < 0 ? 1 : -1)
      put(g.xs, ok ? dx : dx * 0.22, ok ? 1 - Math.min(0.4, Math.abs(dx) / 800) : 1)
    }
    const end = () => {
      const s = g; g = null
      if (!s || s.lock !== 'h') return
      const dir: 1 | -1 = s.dx < 0 ? 1 : -1, w = page.offsetWidth
      const speed = Math.abs(s.dx) / Math.max(1, Date.now() - s.t)
      if (!can(dir) || !(Math.abs(s.dx) > w * 0.2 || (speed > 0.35 && Math.abs(s.dx) > 30))) {
        put(s.xs, 0, 1, 'transform .22s cubic-bezier(.2,.9,.3,1.2), opacity .16s')
        return
      }
      put(s.xs, -dir * w, 0, 'transform .11s ease-in, opacity .11s ease-in')
      setTimeout(() => {
        put(s.xs, 0, 1)
        flushSync(() => { setMode(MODES[MODES.indexOf(modeRef.current) + dir]); setArmed(null) })
        const next = els()
        put(next, dir * w * 0.35, 0)
        requestAnimationFrame(() => requestAnimationFrame(() => put(next, 0, 1, 'transform .22s cubic-bezier(.2,.8,.2,1), opacity .18s ease-out')))
        setTimeout(() => put(next, 0, 1, ''), 270)
      }, 100)
    }
    page.addEventListener('touchstart', start, { passive: true })
    page.addEventListener('touchmove', move, { passive: false })
    page.addEventListener('touchend', end)
    page.addEventListener('touchcancel', end)
    return () => { page.removeEventListener('touchstart', start); page.removeEventListener('touchmove', move); page.removeEventListener('touchend', end); page.removeEventListener('touchcancel', end) }
  }, [])
  return (
    <Sheet title="Cleaning lists">
      <span ref={mark} hidden />
      <Chips items={[['1', 'Light'], ['2', 'Regular'], ['3', 'Extra']]} value={String(mode)} onChange={(v) => { setMode(Number(v) as CleanMode); setArmed(null) }} />
      <List>
        <Row title={schedLabel(s)} meta={s.every === 'season' ? tr('You pick the date on the Cleaning screen') : next ? tr('Next: {x}', { x: fmtWeekday(next) }) : tr('Set the day and how often')} trail="→" onClick={() => pushSheet(<ScheduleSheet mode={mode} />)} />
      </List>
      <List roomy title={MODE_NAME[mode]} right={trn(tasks.length, '{n} step', '{n} steps')} empty="No steps yet">
        {tasks.length > 0 && (
          <DragList ids={tasks.map((t) => t.id)} onMove={move}>
            {(id, grip) => {
              const t = tasks.find((x) => x.id === id)!
              const on = armed === id
              return (
                <div className="row" style={{ paddingRight: 8 }}>
                  {grip}
                  <button className="lrow grow" style={{ paddingLeft: 4, paddingRight: 8 }} onClick={() => edit(id)}>
                    <span className="grow title" style={{ textAlign: 'left' }}>{tr(t.name)}</span>
                  </button>
                  <button aria-label={tr('Delete')} onClick={() => bin(id)} style={{ padding: 6, color: on ? 'var(--alert)' : 'var(--ink2)' }}><Icon.trash /></button>
                </div>
              )
            }}
          </DragList>
        )}
      </List>
      <button className="btn full" onClick={() => edit()}>+ {tr('Add step to {x}', { x: tr(MODE_NAME[mode]) })}</button>
      <button className="btn full soft" onClick={closeSheet}>{tr('Done')}</button>
    </Sheet>
  )
}
