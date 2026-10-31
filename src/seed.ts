import type { State } from './types'
import { defaultCleanPlan, defaultCleanTasks } from './cleaning'

// Fresh start: no personal data. Your own data comes in via Settings → Restore from backup.
export const seed = (): State => ({
  version: 7,
  // Polish JDG defaults (ryczałt 14%); change them in Settings
  settings: { eurPln: 4.3, uahPln: 0.0854, ratesAuto: true, pitRate: 0.14, dra: 498.35, rca: 456.19, splitDay: 15, taxDueDay: 20, taxPayDay: 1, leadDays: 7, leadDaysShort: 2 },
  periods: {},
  spends: [],
  clients: [],
  sessions: [],
  timer: null,
  taxMonths: {},
  credits: [],
  subscriptions: [],
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
