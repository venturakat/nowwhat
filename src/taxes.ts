import type { Settings, State, TaxLine, TaxRule, TransferRow } from './types'
import { monthName, uid } from './lib'
import { tr } from './i18n'

// Bank-friendly amount: 954,54 (comma, no thousands separator)
export const bankAmount = (n: number) => (Math.round(n * 100) / 100).toFixed(2).replace('.', ',')

// ---------- presets ("Start from…"): examples, every number editable ----------
export type PresetKey = 'pl' | 'ua' | 'ar' | 'custom'
export interface Preset { key: PresetKey; name: string; cur: string; rule: TaxRule; lines: () => TaxLine[]; transfer: () => TransferRow[] }
const row = (label: string, text = ''): TransferRow => ({ id: uid(), label, text })
export const PRESETS: Preset[] = [
  {
    key: 'pl', name: 'Poland · ryczałt', cur: 'PLN', rule: 'nbp',
    lines: () => [
      { id: 'dra', name: 'ZUS DRA', kind: 'fixed', amount: 0, every: 'month', payDay: 1, dueDay: 20, group: 'ZUS' },
      { id: 'rca', name: 'ZUS RCA', kind: 'fixed', amount: 0, every: 'month', payDay: 1, dueDay: 20, group: 'ZUS' },
      { id: 'pit', name: 'PIT-28', kind: 'pctLess', pct: 14, less: 'dra', lessPct: 50, every: 'month', payDay: 1, dueDay: 20 }
    ],
    transfer: () => [row('ZUS account'), row('PIT account'), row('NIP'), row('Basis'), row('Title', 'Składki za {miesiąc} {yyyy}')]
  },
  {
    key: 'ua', name: 'Ukraine', cur: 'UAH', rule: 'paid',
    lines: () => [
      { id: 'ua-tax', name: 'Single tax', kind: 'pct', pct: 5, every: 'quarter', payDay: 10, dueDay: 20 },
      { id: 'ua-esv', name: 'ЄСВ', kind: 'fixed', amount: 0, every: 'quarter', payDay: 10, dueDay: 20 }
    ],
    transfer: () => [row('IBAN'), row('РНОКПП'), row('Призначення', '{місяць} {yyyy}')]
  },
  {
    key: 'ar', name: 'Argentina', cur: 'ARS', rule: 'invoice',
    lines: () => [{ id: 'ar-mono', name: 'Monotributo', kind: 'fixed', amount: 0, every: 'month', payDay: 15, dueDay: 20 }],
    transfer: () => [row('CUIT'), row('Periodo', '{mes} {yyyy}')]
  },
  { key: 'custom', name: 'Custom', cur: '', rule: 'invoice', lines: () => [], transfer: () => [] }
]
// replace the tax lines with a preset's; the tax currency and invoice rule follow it,
// transfer rows only when nothing of yours is in them (empty, or only month templates)
export const applyPreset = (d: State, key: PresetKey) => {
  const p = PRESETS.find((x) => x.key === key)!
  const s = d.settings
  s.taxLines = p.lines()
  if (p.cur) { s.taxCur = p.cur; if (p.cur !== s.mainCur && !s.curs.includes(p.cur)) s.curs = [...s.curs, p.cur] }
  if (key !== 'custom') s.taxRule = p.rule
  if (!(s.transfer ?? []).some((r) => r.text.trim() && !r.text.includes('{'))) s.transfer = p.transfer()
}

// ---------- transfer text: {month} {miesiąc} {місяць} {mes} {mm} {yyyy} become the month paid for ----------
const PL = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień']
const UA = ['січень', 'лютий', 'березень', 'квітень', 'травень', 'червень', 'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень']
const ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export const PLACEHOLDERS = '{month} {miesiąc} {місяць} {mes} {mm} {yyyy}'
export const fillTransfer = (text: string, mk: string) => {
  const i = +mk.slice(5, 7) - 1
  return text.replace(/\{month\}/g, monthName(mk, true)).replace(/\{miesiąc\}/g, PL[i]).replace(/\{місяць\}/g, UA[i]).replace(/\{mes\}/g, ES[i])
    .replace(/\{mm\}/g, mk.slice(5, 7)).replace(/\{yyyy\}/g, mk.slice(0, 4))
}

// ---------- words ----------
export const KIND_NAME = () => ({ fixed: tr('Fixed amount'), pct: tr('% of revenue'), pctLess: tr('% of revenue minus part of another line') })
export const EVERY_NAME = () => ({ month: tr('Monthly'), quarter: tr('Quarterly'), year: tr('Yearly') })
export const RULE_NAME = () => ({
  nbp: tr('Invoice month · NBP rate of the day before'),
  invoice: tr('Invoice month · rate of that day'),
  paid: tr('When the money arrives · rate of that day')
})
// "PIT-28 = 14% × (revenue − 50% of ZUS DRA)"
export const lineFormula = (l: TaxLine, all: TaxLine[]) => {
  if (l.kind === 'pct') return `${l.name} = ${l.pct ?? 0}% ${tr('of revenue')}`
  if (l.kind === 'pctLess') return `${l.name} = ${l.pct ?? 0}% × (${tr('revenue')} − ${l.lessPct ?? 0}% ${tr('of')} ${all.find((x) => x.id === l.less)?.name ?? '—'})`
  return ''
}

// ---------- v10: ZUS DRA + RCA + PIT become tax lines; her numbers, paid flags and own amounts carry over unchanged ----------
export const migrateTaxes = (out: State) => {
  const s0 = out.settings as Settings
  const lines = PRESETS[0].lines()
  const pay = s0.taxPayDay ?? s0.taxDueDay ?? 1, due = s0.taxDueDay ?? 20
  for (const l of lines) { l.payDay = pay; l.dueDay = due }
  lines[0].amount = s0.dra ?? 0
  lines[1].amount = s0.rca ?? 0
  lines[2].pct = Math.round((s0.pitRate ?? 0.14) * 100000) / 1000
  const idKind = s0.taxIdKind ?? (s0.nip ? 'nip' : s0.regon ? 'regon' : s0.pesel ? 'pesel' : undefined)
  const ID_NAME = { nip: 'NIP', regon: 'REGON', pesel: 'PESEL' } as const
  const transfer = [
    row('ZUS account', s0.zusAccount?.trim() ?? ''),
    row('PIT account', s0.taxAccount?.trim() ?? ''),
    row(idKind ? ID_NAME[idKind] : 'NIP', (idKind ? s0[idKind] : '') ?? ''),
    row('Basis', s0.zusBasis ? bankAmount(s0.zusBasis) : ''),
    row('Title', 'Składki za {miesiąc} {yyyy}')
  ]
  out.settings = { ...s0, taxLines: lines, taxRule: (s0.taxCur ?? 'PLN') === 'PLN' ? 'nbp' : 'invoice', transfer: s0.transfer ?? transfer }
  for (const tm of Object.values(out.taxMonths ?? {})) {
    const z = !!(tm.paid || tm.zusPaid), p = !!(tm.paid || tm.pitPaid)
    const one = (paid: boolean, amount?: number) => ({ ...(paid ? { paid: true } : {}), ...(amount !== undefined ? { amount } : {}) })
    tm.lines = { dra: one(z, tm.draOverride), rca: one(z, tm.rcaOverride), pit: one(p, tm.pitOverride) }
    delete tm.draOverride; delete tm.rcaOverride; delete tm.pitOverride; delete tm.paid; delete tm.zusPaid; delete tm.pitPaid
  }
}
