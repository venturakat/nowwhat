import type { State } from './types'
import { PRESETS } from './taxes'
import { defaultCleanPlan, defaultCleanTasks } from './cleaning'

// Fresh start: no personal data. Your own data comes in via Settings → Restore from backup.
export const seed = (): State => ({
  version: 10,
  // Polish JDG defaults (ryczałt 14%); add your ZUS amounts in Settings › Taxes
  settings: { mainCur: 'PLN', curs: ['EUR', 'USD'], rates: { EUR: 4.3, USD: 4 }, taxCur: 'PLN', taxRule: 'nbp', taxLines: PRESETS[0].lines(), transfer: PRESETS[0].transfer(), splitDay: 15, leadDays: 7, leadDaysShort: 2 },
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
