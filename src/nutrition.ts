import { update, useStore } from './store'
import type { Nutri } from './types'

// Protein and fiber per 100 g from USDA FoodData Central (Foundation + SR Legacy foods).
// Looked up once per ingredient name and kept on the phone; prefers the raw version of a food.
const API = 'https://api.nal.usda.gov/fdc/v1/foods/search'
const busy = new Set<string>()

const lookup = async (name: string, key: string): Promise<Nutri | null> => {
  const url = `${API}?query=${encodeURIComponent(name)}&dataType=Foundation,SR%20Legacy&pageSize=8&api_key=${encodeURIComponent(key)}`
  const r = await fetch(url)
  if (!r.ok) throw new Error(String(r.status))
  const j = await r.json()
  const foods: any[] = j.foods ?? []
  if (!foods.length) return null
  const words = name.toLowerCase().split(/\s+/)
  const score = (f: any) => {
    const d = String(f.description).toLowerCase()
    return words.filter((w) => d.includes(w.replace(/s$/, ''))).length * 10 + (/\braw\b/.test(d) ? 3 : 0) - d.length / 100
  }
  const f = foods.slice().sort((a, b) => score(b) - score(a))[0]
  const val = (num: string) => Number(f.foodNutrients?.find((n: any) => n.nutrientNumber === num)?.value ?? 0)
  return { food: f.description, protein: val('203'), fiber: val('291'), id: f.fdcId }
}

// look up the names that aren't known yet; returns false if the source couldn't be reached
export const fetchNutrition = async (names: string[]) => {
  const key = useStore.getState().st.settings.usdaKey?.trim() || 'DEMO_KEY'
  const todo = [...new Set(names)].filter((n) => n && !busy.has(n))
  let ok = true
  for (const n of todo) {
    busy.add(n)
    try {
      const v = await lookup(n, key)
      update((d) => { d.nutrition = { ...(d.nutrition ?? {}), [n]: v } })
    } catch { ok = false } finally { busy.delete(n) }
  }
  return ok
}
