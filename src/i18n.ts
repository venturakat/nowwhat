// Translations. English is the source text: other languages are dictionaries keyed by the English string.
// tr('Pay {x}', { x: 'ZUS' }) → 'Pay ZUS'. The app name / logo "now what" is never translated.
import { uk } from './i18n/uk'
import { ru } from './i18n/ru'
import { es } from './i18n/es'

export type Lang = 'en' | 'uk' | 'ru' | 'es'
type Dict = Record<string, string>
const DICTS: Partial<Record<Lang, Dict>> = { uk, ru, es }
// Settings › Language. Until one is picked, the app starts in the phone's language if it has it, else English
export const LANGS: [string, string][] = [['en', 'English'], ['uk', 'Українська'], ['ru', 'Русский'], ['es', 'Español']]
let lang: Lang = 'en'
export const getLang = () => lang
export const phoneLang = (): Lang => {
  const ls = typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language]
  const hit = ls.map((x) => x?.toLowerCase().slice(0, 2)).find((x) => x === 'uk' || x === 'ru' || x === 'es')
  return (hit as Lang | undefined) ?? 'en'
}
export const resolveLang = (pick?: string): Lang => (pick === 'en' || pick === 'uk' || pick === 'ru' || pick === 'es' ? pick : phoneLang())
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
  },
  ru: {
    m: ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'],
    ml: ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'],
    wd: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
    wdl: ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота']
  },
  es: {
    m: ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sept.', 'oct.', 'nov.', 'dic.'],
    ml: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
    wd: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
    wdl: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
  }
}
export const monthNames = (long = false) => (long ? NAMES[lang].ml : NAMES[lang].m)
export const weekdayNames = (long = false) => (long ? NAMES[lang].wdl : NAMES[lang].wd)
