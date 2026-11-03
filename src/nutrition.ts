import { update, useStore } from './store'
import type { Nutri } from './types'

// Protein and fiber per 100 g from USDA FoodData Central. Tried in steps, best data first:
// 1) Foundation + SR Legacy (lab-analysed basic foods), 2) Survey (FNDDS, foods as eaten),
// 3) Branded (products from labels — where things like burrata live). A step only counts if the
// food's name has all the words of the ingredient; otherwise the next one is tried.
// Looked up once per ingredient name and kept on the phone; prefers the raw version of a food.
const API = 'https://api.nal.usda.gov/fdc/v1/foods/search'
const busy = new Set<string>()
const STEPS: [string, string][] = [['Foundation,SR%20Legacy', ''], ['Survey%20(FNDDS)', 'survey'], ['Branded', 'branded']]

const lookup = async (name: string, key: string): Promise<Nutri | null> => {
  const words = name.toLowerCase().split(/\s+/).filter(Boolean)
  const hits = (d: string) => words.filter((w) => d.includes(w.replace(/(es|s)$/, ''))).length
  for (const [types, kind] of STEPS) {
    const url = `${API}?query=${encodeURIComponent(name)}&dataType=${types}&pageSize=10&api_key=${encodeURIComponent(key)}`
    const r = await fetch(url)
    if (!r.ok) throw new Error(String(r.status))
    const j = await r.json()
    const foods: any[] = (j.foods ?? []).filter((f: any) => hits(String(f.description).toLowerCase()) === words.length)
    if (!foods.length) continue
    const score = (f: any) => { const d = String(f.description).toLowerCase(); return (/\braw\b/.test(d) ? 3 : 0) - d.length / 100 }
    const f = foods.sort((a, b) => score(b) - score(a))[0]
    const val = (num: string) => Number(f.foodNutrients?.find((n: any) => n.nutrientNumber === num)?.value ?? 0)
    const label = kind === 'branded' ? `${f.description}${f.brandOwner ? ` (${f.brandOwner})` : ''} · product label` : kind === 'survey' ? `${f.description} · as eaten` : f.description
    return { food: label, protein: val('203'), fiber: val('291'), id: f.fdcId }
  }
  return null
}

// look up the names that aren't known yet; returns false if the source couldn't be reached
export const fetchNutrition = async (names: string[]) => {
  const key = useStore.getState().st.settings.usdaKey?.trim() || 'DEMO_KEY'
  const todo = [...new Set(names)].filter((n) => n && !busy.has(n))
  todo.forEach((n) => busy.add(n)) // claim them all now, so a second call doesn't look them up again
  let ok = true
  for (const n of todo) {
    try {
      const v = await lookup(n, key)
      update((d) => { d.nutrition = { ...(d.nutrition ?? {}), [n]: v } })
    } catch { ok = false } finally { busy.delete(n) }
  }
  return ok
}
