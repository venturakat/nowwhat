export type ID = string
export type Energy = 'low' | 'okay' | 'lots'
export type CleanMode = 1 | 2 | 3 // 1 light, 2 regular, 3 extra
export type SupplyCat = 'meds' | 'groceries' | 'cats' | 'home' | 'beauty'

export interface Settings {
  eurPln: number
  pitRate: number // ryczałt, e.g. 0.14
  dra: number // ZUS health (DRA)
  rca: number // ZUS social (RCA)
  splitDay: number // second half starts on this day (15)
  taxDueDay: number // 20
  leadDays: number // warn this many days before supplies run out
  taxAccount?: string // mikrorachunek podatkowy
  zusAccount?: string // rachunek składkowy
}

export interface BudgetItem {
  id: ID
  kind: 'income' | 'expense'
  label: string
  amount: number
  date?: string // YYYY-MM-DD
  taxable?: boolean // counts as revenue for PIT/ZUS
  fromClient?: ID
  oneOff?: boolean // purchases logged from Supplies/Closet: not copied to next month
}

export interface Period {
  items: BudgetItem[]
}

export interface Spend {
  id: ID
  date: string
  amount: number
  note: string
}

export interface Client {
  id: ID
  name: string
  rateEur: number
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
}

export interface CleanTask {
  id: ID
  name: string
  minutes: number
  mode: CleanMode // included in this mode and all bigger ones
}

export interface Project {
  id: ID
  name: string
  size: 'quick' | 'shop' | 'big'
  nextStep: string
  cost?: number
  doFirst?: boolean
  done?: boolean
  toBuy?: string // things to add to next shopping run
}

export type ClosetCat = 'top' | 'bottom' | 'outer' | 'shoes' | 'dress' | 'bag' | 'other'

export interface ClosetItem {
  id: ID
  name: string
  cat: ClosetCat
  photo?: string // data URL
  worn: number
  lastWorn?: string
  added?: string
  pairs: ID[]
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
  supplies: Supply[]
  cleanTasks: CleanTask[]
  cleanLog: { date: string; mode: CleanMode; done: ID[] } | null
  projects: Project[]
  closet: ClosetItem[]
  needs: Need[]
  saved: Saved[]
  outfits: Outfit[]
  planned: { date: string; itemIds: ID[] } | null
  dismissed: { date: string; ids: string[] }
}
