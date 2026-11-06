export type ID = string
export type Energy = 'low' | 'okay' | 'lots'
export type CleanMode = 1 | 2 | 3 // 1 light, 2 regular, 3 extra
export type SupplyCat = 'meds' | 'groceries' | 'pets' | 'home' | 'care'

export type Currency = 'PLN' | 'EUR' | 'UAH' | 'USD' // USD: for classes (rates: NBP table A)
export type PayCur = Currency | 'ARS' // what a class can be paid in

// Calendar: things from the tabs it can show (chosen in Settings) and your own appointments
export type CalKey = 'taxes' | 'subs' | 'credits' | 'classes' | 'selfcare' | 'shopping' | 'deliveries' | 'cleaning'
export interface CalEvent {
  id: ID
  title: string
  date: string // YYYY-MM-DD (first time, for repeating ones)
  time?: string // HH:MM
  end?: string // HH:MM
  note?: string
  repeat?: 'week' | 'month' | 'year'
}

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
  oficialArs?: number // dólar oficial (sell): pesos for 1 USD
  taxAccount?: string // mikrorachunek podatkowy
  zusAccount?: string // rachunek składkowy
  zusBasis?: number // podstawa wymiaru składek ZUS (shown in Taxes as Basis, to copy)
  nip?: string
  regon?: string
  pesel?: string
  taxIdKind?: 'nip' | 'regon' | 'pesel' // which one identifies you in tax transfers (shown in Taxes)
  // about you (for daily protein / fiber needs in Recipes)
  age?: number
  weightKg?: number
  activity?: 'low' | 'light' | 'active' | 'very'
  proteinGoal?: number // g a day, set by hand; empty = from weight and activity
  calendar?: Partial<Record<CalKey, boolean>> // what the calendar shows from the tabs (all off until chosen)
  travelUsual?: string[] // travel necessities offered under a packing list's Other field (not set = the starter list)
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
  paid: boolean // both paid
  zusPaid?: boolean // paid on their own (it happens)
  pitPaid?: boolean
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
  paused?: boolean // kept, but off the shopping lists, Today and the budget until resumed
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
  times?: Record<string, { start: string; end?: string }> // a clean's time, by its key (the scheduled Sunday, or x-<date> for an Extra)
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
  size?: string
  worn: number
  lastWorn?: string
  added?: string
  pairs: ID[]
  offSeason?: boolean // put away for now: not offered in the outfit constructor
}

export interface Need {
  id: ID
  name: string
  size?: string // e.g. M, 38, 27/32
  note?: string
  maxPrice?: number
  urgent?: boolean
}

export interface Saved {
  id: ID
  name: string
  size?: string
  price: number
  currency?: Currency // default PLN; shown with today's rate in zł too
  link?: string
  savedAt: string
  photo?: string
  cat: ClosetCat
}

export interface Outfit {
  id: ID
  name: string
  itemIds: ID[]
  tempMin?: number // comfortable from … °C
  tempMax?: number // … to °C
}

// Travel (Closet): packing lists made of wardrobe things, Supplies › Care things and anything typed in
export interface PackItem {
  id: ID
  src: 'closet' | 'care' | 'own'
  refId?: ID // the wardrobe thing / supply it points to
  name: string // its name when added (kept if the thing is later deleted)
  qty?: number // how many to take (1 if not set)
  packed?: boolean
}
export interface Trip {
  id: ID
  name: string
  start?: string // YYYY-MM-DD
  end?: string
  items: PackItem[]
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
  time?: string // HH:MM of the next time (set it when it's booked)
  endTime?: string
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
  photo?: string // a photo of the meal (small JPEG data URL)
  grams?: Record<string, number> // per ingredient line: grams you set by hand (otherwise guessed from the line)
}

// Shipment log (Today): parcels on their way, so they don't have to be kept in your head
export interface Shipment {
  id: ID
  name: string
  courier: string // InPost, DHL, DPD, Orlen or anything else
  eta?: string // YYYY-MM-DD expected delivery
  deliveredAt?: string // ticked off on this day (stays visible until the day ends)
  supplyId?: ID // came from marking a supply bought
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

// Classes (Money › Classes): a price per class in one currency, possibly paid in another
// (USD price sent as pesos at the dólar blue rate), plus a transfer fee in any currency.
// How the price turns into what's paid: 'app' = the app's own rates (zł/€/$/₴), 'blue' / 'oficial' =
// the dólar rates for pesos, 'manual' = typed in when paying.
export type ClassRate = 'app' | 'blue' | 'oficial' | 'manual'
export interface Course {
  id: ID
  name: string
  price: number // per class
  currency: Currency
  payIn?: PayCur // default: the price currency
  rate?: ClassRate // only when payIn differs (default: app, or blue for pesos)
  fee?: number // transfer fee added to every payment
  feeCurrency?: Currency // default PLN
  days: number[] // weekdays of the classes (0 Sun … 6 Sat)
  time?: string // e.g. 17:00
  endTime?: string // default: an hour after the start
  times?: Record<string, { start: string; end?: string }> // one class at a different time, by its date
  moved?: Record<string, string> // one class moved: new date -> its own date (that one is in skips, the new one in extra)
  payDay?: number // day of the month you pay (default: when the second fortnight starts)
  since: string // first class that isn't paid yet when this was set up
  extra: string[] // one-off extra classes
  skips: string[] // cancelled classes
  pays: CoursePay[]
}
export interface CoursePay {
  id: ID
  date: string
  dates: string[] // classes it covers
  price: number // per class, in the price currency then
  currency: Currency
  rate?: number // 1 price currency = this much of payIn (when they differ)
  paid: number // what was sent, in payIn
  payIn: PayCur
  pln: number // what it cost in zł, fee included (goes to the budget)
  itemId: ID // the budget entry
}
// v1 Spanish classes (moved into Course on load)
export interface Lessons {
  usd: number; days: number[]; time?: string; payDay?: number; fee?: number; since: string; extra: string[]; skips: string[]
  pays: { id: ID; date: string; dates: string[]; usd: number; blue: number; ars: number; pln: number; itemId: ID }[]
}

export interface Task {
  id: ID
  text: string
  color: string // one of TASK_COLORS
  doneAt?: string // YYYY-MM-DD it was ticked — gone after that midnight
  date?: string // on the calendar that day (optional)
  time?: string
  end?: string
}

export interface Note {
  id: ID
  title?: string
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
  nutritionV?: number // how lookups were done (2 = basic foods, then survey, then branded)
  lessons?: Lessons // old, moved into classes
  classes?: Course[]
  tasks?: Task[]
  shipments?: Shipment[]
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
  trips?: Trip[]
  events?: CalEvent[] // own appointments in the calendar
  shopPlans?: Record<string, { date: string; time?: string; end?: string }> // calendar-only: a shopping run moved / timed for planning the day (key: planned date|category)
  dismissed: { date: string; ids: string[] }
}
