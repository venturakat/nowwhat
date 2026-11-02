import type { State } from './types'
import { defaultCleanPlan, defaultCleanTasks } from './cleaning'

// Fresh start: no personal data. Your own data comes in via Settings → Restore from backup.
export const seed = (): State => ({
  version: 8,
  // Polish JDG defaults (ryczałt 14%); add your ZUS amounts in Settings
  settings: { eurPln: 4.3, uahPln: 0.0854, ratesAuto: true, pitRate: 0.14, dra: 0, rca: 0, splitDay: 15, taxDueDay: 20, taxPayDay: 1, leadDays: 7, leadDaysShort: 2 },
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
