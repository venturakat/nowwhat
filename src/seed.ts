import type { State } from './types'
import { uid } from './lib'

// Fresh start: no personal data. Your own data comes in via Settings → Restore from backup.
export const seed = (): State => ({
  version: 1,
  // Polish JDG defaults (ryczałt 14%); change them in Settings
  settings: { eurPln: 4.3, pitRate: 0.14, dra: 498.35, rca: 456.19, splitDay: 15, taxDueDay: 20, leadDays: 7 },
  periods: {},
  spends: [],
  clients: [],
  sessions: [],
  timer: null,
  taxMonths: {},
  supplies: [],
  cleanTasks: [
    { id: uid(), name: 'Dishes & counters', minutes: 10, mode: 1 },
    { id: uid(), name: 'Trash out', minutes: 2, mode: 1 },
    { id: uid(), name: 'Quick tidy', minutes: 5, mode: 1 },
    { id: uid(), name: 'Bathroom sink & mirror', minutes: 5, mode: 2 },
    { id: uid(), name: 'Vacuum main room', minutes: 10, mode: 2 },
    { id: uid(), name: 'Laundry load', minutes: 5, mode: 2 },
    { id: uid(), name: 'Mop floors', minutes: 20, mode: 3 },
    { id: uid(), name: 'Toilet & shower', minutes: 20, mode: 3 },
    { id: uid(), name: 'Change bed sheets', minutes: 10, mode: 3 },
    { id: uid(), name: 'Dust shelves', minutes: 15, mode: 3 },
    { id: uid(), name: 'Fridge check', minutes: 10, mode: 3 }
  ],
  cleanLog: null,
  projects: [],
  closet: [],
  needs: [],
  saved: [],
  outfits: [],
  planned: null,
  dismissed: { date: '', ids: [] }
})
