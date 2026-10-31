import type { State } from './types'
import { defaultCleanPlan, defaultCleanTasks } from './cleaning'

// Fresh start: no personal data. Your own data comes in via Settings → Restore from backup.
export const seed = (): State => ({
  version: 4,
  // Polish JDG defaults (ryczałt 14%); change them in Settings
  settings: { eurPln: 4.3, pitRate: 0.14, dra: 498.35, rca: 456.19, splitDay: 15, taxDueDay: 20, leadDays: 7 },
  periods: {},
  spends: [],
  clients: [],
  sessions: [],
  timer: null,
  taxMonths: {},
  supplies: [],
  cleanTasks: defaultCleanTasks(),
  cleanPlan: defaultCleanPlan(),
  cleanDone: {},
  projects: [],
  closet: [],
  needs: [],
  saved: [],
  outfits: [],
  planned: null,
  dismissed: { date: '', ids: [] }
})
