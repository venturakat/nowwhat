// Small translation helper. English for now; other languages add a dictionary keyed by the English text.
// tr('Pay {x}', { x: 'ZUS' }) → 'Pay ZUS'
type Dict = Record<string, string>
const DICTS: Record<string, Dict> = {}
let lang = 'en'
export const setLang = (l: string) => { lang = l }
export const tr = (en: string, vars?: Record<string, string | number>) => {
  let out = DICTS[lang]?.[en] ?? en
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v))
  return out
}
