import { update, useStore } from './store'
import type { Nutri } from './types'

// Protein and fiber per 100 g from USDA FoodData Central.
// 1st search: basic foods (Foundation, SR Legacy) and Survey (FNDDS, foods as eaten) together, basic preferred;
// only if nothing there matches: Branded (products from labels — where things like burrata live).
// A food only counts if its name has all the words of the ingredient. Usually one request per ingredient
// (the shared demo key allows ~30 an hour). Looked up once per ingredient name and kept on the phone.
const API = 'https://api.nal.usda.gov/fdc/v1/foods/search'
const busy = new Set<string>()
export class LimitError extends Error {}
const STEPS = ['Foundation,SR Legacy,Survey (FNDDS)', 'Branded']
const RANK: Record<string, number> = { Foundation: 3, 'SR Legacy': 3, 'Survey (FNDDS)': 1, Branded: 0 }

const lookup = async (name: string, key: string): Promise<Nutri | null> => {
  const words = name.toLowerCase().split(/\s+/).filter(Boolean)
  const hits = (d: string) => words.filter((w) => d.includes(w.replace(/(es|s)$/, ''))).length
  for (const types of STEPS) {
    const url = `${API}?query=${encodeURIComponent(name)}&dataType=${encodeURIComponent(types)}&pageSize=25&api_key=${encodeURIComponent(key)}`
    const r = await fetch(url)
    if (r.status === 429) throw new LimitError('limit')
    if (!r.ok) throw new Error(String(r.status))
    const j = await r.json()
    const foods: any[] = (j.foods ?? []).filter((f: any) => hits(String(f.description).toLowerCase()) === words.length)
    if (!foods.length) continue
    const score = (f: any) => { const d = String(f.description).toLowerCase(); return (RANK[f.dataType] ?? 0) * 10 + (/\braw\b/.test(d) ? 3 : 0) - d.length / 100 }
    const f = foods.sort((a, b) => score(b) - score(a))[0]
    const val = (num: string) => Number(f.foodNutrients?.find((n: any) => n.nutrientNumber === num)?.value ?? 0)
    const label = f.dataType === 'Branded' ? `${f.description}${f.brandOwner ? ` (${f.brandOwner})` : ''} · product label` : f.dataType === 'Survey (FNDDS)' ? `${f.description} · as eaten` : f.description
    return { food: label, protein: val('203'), fiber: val('291'), id: f.fdcId }
  }
  return null
}

// look up the names that aren't known yet: 'ok', 'limit' (demo key used up for now) or 'off' (couldn't reach it)
export const fetchNutrition = async (names: string[]): Promise<'ok' | 'limit' | 'off'> => {
  const key = useStore.getState().st.settings.usdaKey?.trim() || 'DEMO_KEY'
  const todo = [...new Set(names)].filter((n) => n && !busy.has(n))
  todo.forEach((n) => busy.add(n)) // claim them all now, so a second call doesn't look them up again
  let res: 'ok' | 'limit' | 'off' = 'ok'
  for (const n of todo) {
    if (res === 'limit') { busy.delete(n); continue } // no point asking again until the limit resets
    try {
      const v = await lookup(n, key)
      update((d) => { d.nutrition = { ...(d.nutrition ?? {}), [n]: v } })
    } catch (e) { res = e instanceof LimitError ? 'limit' : 'off' } finally { busy.delete(n) }
  }
  return res
}
