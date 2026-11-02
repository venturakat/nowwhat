import { create } from 'zustand'
import { useEffect, useRef, type ReactNode } from 'react'
import type { ClosetCat } from './types'

// ---------- navigation / sheets / toast ----------
export type Tab = 'today' | 'money' | 'supplies' | 'home' | 'closet'
interface Ui {
  tab: Tab
  sub: Record<Tab, string>
  sheet: ReactNode | null
  toast: string | null
  go: (tab: Tab, sub?: string) => void
  setSub: (sub: string) => void
  open: (n: ReactNode) => void
  close: () => void
  say: (msg: string) => void
}
export const useUi = create<Ui>((set, get) => ({
  tab: 'today',
  sub: { today: '', money: 'budget', supplies: 'meds', home: 'cleaning', closet: 'own' },
  sheet: null,
  toast: null,
  go: (tab, sub) => {
    set({ tab, sub: sub ? { ...get().sub, [tab]: sub } : get().sub })
    window.scrollTo({ top: 0 })
  },
  setSub: (sub) => set({ sub: { ...get().sub, [get().tab]: sub } }),
  open: (n) => set({ sheet: n }),
  close: () => set({ sheet: null }),
  say: (msg) => {
    set({ toast: msg })
    setTimeout(() => get().toast === msg && set({ toast: null }), 2200)
  }
}))
export const openSheet = (n: ReactNode) => useUi.getState().open(n)
export const closeSheet = () => useUi.getState().close()
export const toast = (m: string) => useUi.getState().say(m)

// Settings live in their own module; App registers how to build the sheet so every screen can open it
let settingsFactory: (() => ReactNode) | null = null
export const registerSettings = (f: () => ReactNode) => { settingsFactory = f }
export const openSettings = () => { if (settingsFactory) openSheet(settingsFactory()) }

// ---------- icons ----------
const S = (p: { children: ReactNode; size?: number; color?: string; fill?: boolean }) => (
  <svg width={p.size ?? 22} height={p.size ?? 22} viewBox="0 0 24 24" fill={p.fill ? p.color ?? 'currentColor' : 'none'} stroke={p.fill ? 'none' : p.color ?? 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {p.children}
  </svg>
)
export const Icon = {
  today: () => <S><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></S>,
  money: () => <S><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></S>,
  supplies: () => <S><path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 7v10l9 4 9-4V7" /><path d="M12 11v10" /></S>,
  home: () => <S><path d="M3 10l9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V10z" /></S>,
  closet: () => <S><path d="M12 6a2 2 0 1 1 2-2" /><path d="M12 6v2L3 16h18l-9-8" /></S>,
  play: (p: { size?: number }) => <S size={p.size ?? 18} fill><path d="M7 4l13 8-13 8z" /></S>,
  arrow: () => <S size={20}><path d="M5 12h14M13 6l6 6-6 6" /></S>,
  check: (p: { color?: string; size?: number }) => <S size={p.size ?? 16} color={p.color ?? '#fff'}><path d="M5 12.5l4.5 4.5L19 7.5" /></S>,
  plus: () => <S size={20}><path d="M12 5v14M5 12h14" /></S>,
  x: () => <S size={20}><path d="M6 6l12 12M18 6L6 18" /></S>,
  trash: () => <S size={20}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></S>,
  gear: () => <S size={20}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></S>,
  chevL: () => <S size={20}><path d="M15 18l-6-6 6-6" /></S>,
  chevR: () => <S size={20}><path d="M9 18l6-6-6-6" /></S>,
  camera: () => <S size={22}><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></S>
}

const GARMENT: Record<ClosetCat, string> = {
  top: 'M8 3 3 6l2 4 3-1v12h8V9l3 1 2-4-5-3c-1 2-2 3-4 3S9 5 8 3z',
  bottom: 'M6 3h12l1 18h-5l-2-11-2 11H5z',
  outer: 'M8 3 4 6v15h5v-9h6v9h5V6l-4-3-4 4z',
  shoes: 'M2 17v-6l5 1 3-3 4 4 6 2 2 2v3H2z',
  dress: 'M9 3h6l-1 5 6 13H4l6-13z',
  bag: 'M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2',
  underwear: 'M3 6h18v3c-3.5 1-5.5 4-6.5 9h-5C8.5 13 6.5 10 3 9z',
  jewelry: 'M7 4h10l4 5-9 12L3 9z',
  other: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z'
}
export const Garment = ({ cat, size = 40 }: { cat: ClosetCat; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24"><path d={GARMENT[cat]} fill="#6B6862" fillOpacity="0.55" /></svg>
)

// ---------- primitives ----------
export const Header = ({ sub, title, right }: { sub: string; title: string; right?: ReactNode }) => (
  <div className="between" style={{ alignItems: 'flex-end' }}>
    <div className="col" style={{ gap: 2 }}>
      <div className="sub">{sub}</div>
      <h1 className="h1">{title}</h1>
    </div>
    {right ?? <button className="hdr-gear" aria-label="Settings" onClick={openSettings}><Icon.gear /></button>}
  </div>
)

// the sub-tabs of the current screen, so a sideways swipe can switch them
let swipeTabs: { keys: string[]; value: string; onChange: (v: string) => void; owner: object } | null = null
export const canSwipe = (dir: 1 | -1) => {
  if (!swipeTabs) return false
  const i = swipeTabs.keys.indexOf(swipeTabs.value) + dir
  return i >= 0 && i < swipeTabs.keys.length
}
export const swipeSub = (dir: 1 | -1) => {
  if (!swipeTabs) return
  const i = swipeTabs.keys.indexOf(swipeTabs.value) + dir
  if (i >= 0 && i < swipeTabs.keys.length) swipeTabs.onChange(swipeTabs.keys[i])
}

export const Chips = <T extends string>({ items, value, onChange, swipe }: { items: [T, string][]; value: T; onChange: (v: T) => void; swipe?: boolean }) => {
  const ref = useRef<HTMLDivElement>(null)
  const me = useRef({})
  if (swipe) swipeTabs = { keys: items.map((x) => x[0]), value, onChange: onChange as (v: string) => void, owner: me.current }
  // a screen that's leaving only clears its own tabs (the next screen may have registered already)
  useEffect(() => () => { if (swipeTabs?.owner === me.current) swipeTabs = null }, [])
  // keep the chosen chip in view when the row scrolls sideways
  useEffect(() => {
    const row = ref.current, on = row?.querySelector<HTMLElement>('.chip.on')
    if (row && on) row.scrollTo({ left: on.offsetLeft - row.clientWidth / 2 + on.offsetWidth / 2, behavior: 'smooth' })
  }, [value])
  return (
    <div className="chips" ref={ref}>
      {items.map(([k, l]) => (
        <button key={k} className={'chip' + (k === value ? ' on' : '')} onClick={() => onChange(k)}>
          {l}
        </button>
      ))}
    </div>
  )
}

export const Row = (p: { title: ReactNode; meta?: ReactNode; trail?: ReactNode; dot?: string; onClick?: () => void; done?: boolean; lead?: ReactNode }) => (
  <button className={'lrow' + (p.done ? ' done' : '')} onClick={p.onClick} disabled={!p.onClick} style={{ cursor: p.onClick ? 'pointer' : 'default' }}>
    {p.lead}
    {p.dot && <span className="dot" style={{ background: p.dot }} />}
    <span className="grow">
      <div className="title">{p.title}</div>
      {p.meta && <div className="meta">{p.meta}</div>}
    </span>
    {p.trail !== undefined && <span className="trail">{p.trail}</span>}
  </button>
)

export const List = ({ title, right, children, empty, roomy }: { title?: ReactNode; right?: ReactNode; children?: ReactNode; empty?: string; roomy?: boolean }) => {
  const has = Array.isArray(children) ? children.flat().filter(Boolean).length > 0 : !!children
  return (
    <div className="list">
      {title && (
        <div className="list-h" style={roomy ? { paddingBottom: 12 } : undefined}>
          <span className="t17">{title}</span>
          {right && <span className="t14 w5 muted">{right}</span>}
        </div>
      )}
      {has ? children : empty ? <div className="list-empty">{empty}</div> : null}
    </div>
  )
}

export const Check = ({ on }: { on: boolean }) => <span className={'check' + (on ? ' on' : '')}>{on && <Icon.check />}</span>

export const Sheet = ({ title, children }: { title: string; children: ReactNode }) => (
  <>
    <div className="grab" />
    <div className="between">
      <div className="mid">{title}</div>
      <button onClick={closeSheet} aria-label="Close"><Icon.x /></button>
    </div>
    {children}
  </>
)

export const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="field">
    <label>{label}</label>
    {children}
  </div>
)

export const C = {
  money: 'var(--money)', supplies: 'var(--supplies)', home: 'var(--home)', closet: 'var(--closet)', work: 'var(--work)', alert: 'var(--alert)', warn: 'var(--warn)', ok: 'var(--ok)', ink: 'var(--ink)', line: 'var(--line)'
}
