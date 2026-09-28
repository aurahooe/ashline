import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

export function hourKey(date = new Date()) {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  const h = String(date.getUTCHours()).padStart(2, '0')
  return `${y}-${m}-${d}-${h}`
}

export function msUntilNextHour(date = new Date()) {
  const next = new Date(date)
  next.setUTCMinutes(60, 0, 0)
  return next.getTime() - date.getTime()
}

export const KICKERS = [
  'Held to the light',
  'Written before the kettle boiled',
  'Left on the desk',
  'The hour that would not pass',
  'A margin note, enlarged',
  'Found between two errands',
  'Quiet, then suddenly not',
  'Something the window saw',
  'Filed under later',
  'The second draft of a first thought',
]

export function pickKicker() {
  return KICKERS[Math.floor(Math.random() * KICKERS.length)]
}
