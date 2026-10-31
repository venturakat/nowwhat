import { create } from 'zustand'
import { get as idbGet, set as idbSet } from 'idb-keyval'
import type { BudgetItem, State } from './types'
import { seed } from './seed'
import { periodItems, today, uid } from './lib'

const KEY = 'now-what-state'

interface Store {
  ready: boolean
  st: State
  update: (recipe: (d: State) => void) => void
  replace: (s: State) => void
}

let saveTimer: number | undefined
const persist = (s: State) => {
  clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => idbSet(KEY, s).catch(() => {}), 150)
}

export const useStore = create<Store>((set, get) => ({
  ready: false,
  st: seed(),
  update: (recipe) => {
    const d = structuredClone(get().st)
    recipe(d)
    set({ st: d })
    persist(d)
  },
  replace: (s) => {
    set({ st: s })
    persist(s)
  }
}))

export const hydrate = async () => {
  try {
    const saved = (await idbGet(KEY)) as State | undefined
    if (saved && saved.version) useStore.setState({ st: { ...seed(), ...saved }, ready: true })
    else {
      const s = seed()
      useStore.setState({ st: s, ready: true })
      persist(s)
    }
  } catch {
    useStore.setState({ ready: true })
  }
}

export const useSt = () => useStore((s) => s.st)
export const update = (recipe: (d: State) => void) => useStore.getState().update(recipe)

// make sure a period exists (materialise its template copy) before editing it
export const ensurePeriod = (d: State, key: string) => {
  if (!d.periods[key]) d.periods[key] = { items: periodItems(d, key).items }
  return d.periods[key]
}

export const addIncome = (d: State, key: string, item: Omit<BudgetItem, 'id' | 'kind'>) => {
  ensurePeriod(d, key).items.push({ id: uid(), kind: 'income', ...item })
}

export const dismissToday = (id: string) =>
  update((d) => {
    const t = today()
    if (d.dismissed.date !== t) d.dismissed = { date: t, ids: [] }
    d.dismissed.ids.push(id)
  })

export const exportJson = () => {
  const s = useStore.getState().st
  const blob = new Blob([JSON.stringify(s)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `now-what-backup-${today()}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

export const importJson = async (file: File) => {
  const text = await file.text()
  const s = JSON.parse(text) as State
  if (!s || !s.version || !s.settings) throw new Error('Not a now what? backup')
  useStore.getState().replace({ ...seed(), ...s })
}
