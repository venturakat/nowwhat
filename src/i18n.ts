// Translations. English is the source text: other languages are dictionaries keyed by the English string.
// tr('Pay {x}', { x: 'ZUS' }) → 'Pay ZUS'. The app name / logo "now what" is never translated.
import { uk } from './i18n/uk'

export type Lang = 'en' | 'uk'
type Dict = Record<string, string>
const DICTS: Partial<Record<Lang, Dict>> = { uk }
// Settings › Language: 'auto' follows the phone
export const LANGS: [string, string][] = [['auto', 'Phone language'], ['en', 'English'], ['uk', 'Українська']]
let lang: Lang = 'en'
export const getLang = () => lang
export const phoneLang = (): Lang => {
  const ls = typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language]
  return ls.some((x) => x?.toLowerCase().startsWith('uk')) ? 'uk' : 'en'
}
export const resolveLang = (pick?: string): Lang => (pick === 'en' || pick === 'uk' ? pick : phoneLang())
export const setLang = (l: Lang) => {
  lang = l
  if (typeof document !== 'undefined') document.documentElement.lang = l
}

const fill = (s: string, vars?: Record<string, string | number>) => {
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v))
  return s
}
export const tr = (en: string, vars?: Record<string, string | number>) => fill(DICTS[lang]?.[en] ?? en, vars)

// counts: trn(3, '{n} class', '{n} classes'). A dictionary keeps the forms under 'one|other' as
// 'one|few|many' (Ukrainian: 1 заняття | 2 заняття | 5 занять); {n} is filled in.
export const trn = (n: number, one: string, other: string, vars?: Record<string, string | number>) => {
  const v = { n, ...vars }
  const d = DICTS[lang]?.[`${one}|${other}`]
  if (!d) return fill(n === 1 ? one : other, v)
  const f = d.split('|')
  const r = new Intl.PluralRules(lang).select(n)
  return fill((r === 'one' ? f[0] : r === 'few' ? f[1] : r === 'many' ? f[2] : f[3] ?? f[1]) ?? f[0], v)
}

// month and weekday names
const NAMES: Record<Lang, { m: string[]; ml: string[]; wd: string[]; wdl: string[] }> = {
  en: {
    m: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    ml: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    wdl: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  },
  uk: {
    m: ['січ.', 'лют.', 'бер.', 'квіт.', 'трав.', 'черв.', 'лип.', 'серп.', 'вер.', 'жовт.', 'лист.', 'груд.'],
    ml: ['січень', 'лютий', 'березень', 'квітень', 'травень', 'червень', 'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень'],
    wd: ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
    wdl: ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', 'Пʼятниця', 'Субота']
  }
}
export const monthNames = (long = false) => (long ? NAMES[lang].ml : NAMES[lang].m)
export const weekdayNames = (long = false) => (long ? NAMES[lang].wdl : NAMES[lang].wd)
