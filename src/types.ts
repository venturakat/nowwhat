export type ID = string
export type Energy = 'low' | 'okay' | 'lots'
export type CleanMode = 1 | 2 | 3 // 1 light, 2 regular, 3 extra
export type SupplyCat = 'meds' | 'groceries' | 'pets' | 'home' | 'care'

export type Currency = 'PLN' | 'EUR' | 'UAH'

export interface Settings {
  eurPln: number // PLN for 1 EUR (live: mid-market via Frankfurter/ECB)
  uahPln?: number // PLN for 1 UAH (live: monobank)
  ratesAuto?: boolean // keep rates updated from the internet (default on)
  ratesAt?: string // when they were last updated
  ratesNote?: string
  subsFrom?: string // budget half from which subscriptions are added automatically
  pitRate: number // ryczałt, e.g. 0.14
  dra: number // ZUS health (DRA)
  rca: number // ZUS social (RCA)
  splitDay: number // second half starts on this day (15)
  taxDueDay: number // official deadline (20th)
  taxPayDay?: number // the day I actually pay — the budget puts ZUS + PIT on this day
  leadDays: number // meds, pets, care: shop this many days before running out
  leadDaysShort?: number // groceries, home: shop this many days before
  usdPln?: number // PLN for 1 USD (NBP table A)
  blueArs?: number // dólar blue (sell): pesos for 1 USD
  blueAt?: string
  taxAccount?: string // mikrorachunek podatkowy
  zusAccount?: string // rachunek składkowy
  // about you (for daily protein / fiber needs in Recipes)
  age?: number
  weightKg?: number
  activity?: 'low' | 'light' | 'active' | 'very'
  proteinGoal?: number // g a day, set by hand; empty = from weight and activity
  usdaKey?: string // own free key for USDA FoodData Central (DEMO_KEY otherwise)
}

export interface BudgetItem {
  id: ID
  kind: 'income' | 'expense'
  label: string
  amount: number // in `currency`
  currency?: Currency // default PLN; converted to zł with the current rate
  date?: string // YYYY-MM-DD
  taxable?: boolean // counts as revenue for PIT/ZUS
  fromClient?: ID
  fromSession?: ID // a client payment marked paid — removed again if it's unmarked
  bought?: boolean // a supply marked bought — listed under "Supplies bought"
  oneOff?: boolean // purchases logged from Supplies/Closet: not copied to next month
}

export interface Period {
  items: BudgetItem[]
}

export interface Spend {
  id: ID
  date: string
  amount: number
  currency?: Currency
  note: string
}

export interface Client {
  id: ID
  name: string
  rateEur: number // hourly clients
  kind?: 'hourly' | 'fixed' | 'job' // job = a fixed fee per piece of work, whenever it comes
  fixedEur?: number // fixed clients: monthly fee (in fixedCur)
  fixedCur?: 'EUR' | 'PLN' // default EUR
  payDay?: number // fixed clients: day of the month the fee is due
  since?: string // fixed clients: first month (YYYY-MM)
  archived?: boolean
}

export interface Session {
  id: ID
  clientId: ID
  task: string
  start: string // ISO datetime
  end: string // ISO datetime
  invoiced: boolean
  paid: boolean
  invoiceDate?: string
  paidDate?: string // when the money came in — the budget adds it to that half
  fee?: number // fixed fee (instead of hours × rate), in feeCur
  feeCur?: 'EUR' | 'PLN' // default EUR
  feeMonth?: string // YYYY-MM the fee is for
  nbpRate?: number // NBP table A mid rate from the last working day before the invoice date
  nbpTable?: string // e.g. 212/A/NBP/2026
}

export interface Timer {
  clientId: ID
  task: string
  startedAt: string
}

export interface TaxMonth {
  revenueOverride?: number
  draOverride?: number
  rcaOverride?: number
  pitOverride?: number
  paid: boolean
}

export interface Supply {
  id: ID
  cat: SupplyCat
  name: string
  pricePerUnit: number
  buyQty: number // units bought each time
  lastsDays: number // how long one buy lasts
  enoughUntil: string // YYYY-MM-DD
  unit?: string // "pack" by default
  details?: string // dosage, pack size, amount, flavour…
  once?: boolean // one-time purchase: on the list until bought, then it's gone
  projectId?: ID // came from a project's "need to buy" (kept in sync with it)
}

export interface CleanTask {
  id: ID
  name: string
  mode: CleanMode // which list it belongs to (each list is complete on its own)
  minutes?: number
}

export interface CleanPlan {
  anchor: string // a Sunday
  anchorMode: 1 | 2 // what that Sunday is; Light and Regular alternate weekly from there
  moves: Record<string, string> // scheduled Sunday -> date it was moved to
  extras: string[] // dates of planned Extra cleans (once a season)
  skips: string[] // scheduled Sundays that were skipped
  start: string // nothing before this date counts (when the rotation was set up)
}

export interface CleanDone {
  mode: CleanMode
  date: string
  done: ID[]
  finished?: boolean
}

export interface ProjectStep {
  id: ID
  text: string
  done?: boolean
}

export interface Project {
  id: ID
  name: string
  kind: 'diy' | 'outsource' // can I do it myself or not
  steps: ProjectStep[]
  toBuy?: string // comma-separated; each item lands on the Home shopping list separately
  cost?: number
  done?: boolean
}

export type ClosetCat = 'base' | 'mid' | 'bottom' | 'outer' | 'shoes' | 'dress' | 'bag' | 'underwear' | 'jewelry' | 'other'

export interface ClosetItem {
  id: ID
  name: string
  cat: ClosetCat
  photo?: string // data URL
  worn: number
  lastWorn?: string
  added?: string
  pairs: ID[]
  offSeason?: boolean // put away for now: not offered in the outfit constructor
}

export interface Need {
  id: ID
  name: string
  note?: string
  maxPrice?: number
  urgent?: boolean
}

export interface Saved {
  id: ID
  name: string
  price: number
  link?: string
  savedAt: string
  photo?: string
  cat: ClosetCat
}

export interface Outfit {
  id: ID
  name: string
  itemIds: ID[]
}

export interface CreditExtra {
  id: ID
  date: string
  amount: number
}

export interface Subscription {
  id: ID
  name: string
  amount: number
  currency: Currency
  day: number // day of the month it's charged
  paused?: boolean
}

// Selfcare: things done regularly for yourself (manicure, massage, gym, a hobby…)
export interface SelfCare {
  id: ID
  name: string
  price: number // per time, in `currency`
  currency?: Currency // default PLN
  everyDays: number // days between two times
  next: string // YYYY-MM-DD, next planned time
  lastDone?: string
  details?: string // place, master, what exactly
  paused?: boolean
}

// Recipes (Home → Recipes). Ingredients are plain lines ("200 g chicken breast");
// they're matched to Groceries by name to show what's at home and what to buy.
// one step in a cooking block (Stove or Aerogrill): min = how long the step takes until the next one.
// Both are shown as a countdown: one timer for the whole block, each step at the minutes left.
export interface CookStep { text: string; min?: number }
export interface Nutri { food: string; protein: number; fiber: number; id?: number } // per 100 g
export interface Recipe {
  id: ID
  name: string
  minutes?: number
  ingredients: string[]
  stove?: CookStep[]
  air?: CookStep[]
  airTemp?: number // °C
  airDur?: boolean // aerogrill steps hold how long each step takes (older ones held "minutes left"; converted on load)
  sauce?: string[] // glaze / sauce: just what to mix, with amounts
  steps?: string[] // old format, moved into `stove` on load
  notes?: string
  lastCooked?: string
  cooked?: number // how many times
  portions?: number // how many portions the recipe makes (default 1)
  grams?: Record<string, number> // per ingredient line: grams you set by hand (otherwise guessed from the line)
}

export interface Credit {
  id: ID
  name: string // lender / what it's for
  currency?: Currency // default PLN
  takenOn: string
  borrowed?: number // amount received (optional, for reference)
  installment: number // monthly payment
  count: number // number of monthly payments in the contract
  firstPayment: string // date of the 1st payment; the rest follow monthly on the same day
  lastAmount?: number // if the final payment differs
  extras: CreditExtra[] // extra payments — the bank takes them off the END of the schedule
  closedOn?: string // paid off early on this date
  note?: string // contract number, account, anything to remember
}

// language classes paid in pesos: a USD price per class at the dólar blue rate of the payment day
export interface Lessons {
  usd: number // price per class in USD
  days: number[] // weekdays of the classes (0 Sun … 6 Sat)
  time?: string // your local time, e.g. 17:00
  payDay?: number // day of the month you pay (default: when the second fortnight starts)
  fee?: number // transfer fee in zł added to every payment (default 70, WU)
  since: string // first class that isn't paid yet when this was set up
  extra: string[] // one-off extra classes
  skips: string[] // cancelled classes
  pays: LessonPay[]
}
export interface LessonPay {
  id: ID
  date: string
  dates: string[] // classes it covers
  usd: number // per class
  blue: number
  ars: number
  pln: number // what it cost you in zł
  itemId?: ID // its line in the budget
}

export interface Task {
  id: ID
  text: string
  color: string // one of TASK_COLORS
  doneAt?: string // YYYY-MM-DD it was ticked — gone after that midnight
}

export interface Note {
  id: ID
  text: string
  at: string // last edited (ISO)
}

export interface State {
  version: number
  settings: Settings
  periods: Record<string, Period>
  spends: Spend[]
  energy?: { date: string; level: Energy }
  clients: Client[]
  sessions: Session[]
  timer: Timer | null
  taxMonths: Record<string, TaxMonth>
  credits: Credit[]
  subscriptions: Subscription[]
  selfcare?: SelfCare[]
  recipes?: Recipe[]
  // nutrition per 100 g looked up online (USDA FoodData Central), by ingredient name; null = not found
  nutrition?: Record<string, Nutri | null>
  lessons?: Lessons
  tasks?: Task[]
  notes?: Note[]
  supplies: Supply[]
  cleanTasks: CleanTask[]
  cleanPlan: CleanPlan
  cleanDone: Record<string, CleanDone> // key = occurrence id
  cleanLog?: unknown // v1 leftover
  projects: Project[]
  closet: ClosetItem[]
  needs: Need[]
  saved: Saved[]
  outfits: Outfit[]
  planned: { date: string; itemIds: ID[] } | null
  dismissed: { date: string; ids: string[] }
}
