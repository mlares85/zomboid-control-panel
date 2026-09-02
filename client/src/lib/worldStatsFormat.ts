const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/** "14:05" from 24h hour/minute fields. */
export function formatGameClock(hour: number, minute: number): string {
  const h = String(Math.max(0, Math.min(23, hour))).padStart(2, '0')
  const m = String(Math.max(0, Math.min(59, minute))).padStart(2, '0')
  return `${h}:${m}`
}

/** "Sep 4, Year 1" from PZ's 1-indexed month/day/year fields. */
export function formatGameDate(month: number, day: number, year: number): string {
  const name = MONTH_NAMES[month - 1] ?? `Month ${month}`
  return `${name} ${day}, Year ${year}`
}

/** "6d 4h" world age from total hours survived. */
export function formatWorldAge(worldAgeHours: number): string {
  if (!Number.isFinite(worldAgeHours) || worldAgeHours < 0) return '—'
  const days = Math.floor(worldAgeHours / 24)
  const hours = Math.floor(worldAgeHours % 24)
  if (days === 0) return `${hours}h`
  return `${days}d ${hours}h`
}
