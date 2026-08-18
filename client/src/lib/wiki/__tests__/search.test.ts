import { describe, expect, it } from 'vitest'
import { searchArticles } from '../search'

describe('searchArticles', () => {
  it('returns an empty array for a blank query', () => {
    expect(searchArticles('')).toEqual([])
    expect(searchArticles('   ')).toEqual([])
  })

  it('finds an article by an exact title word', () => {
    const results = searchArticles('RCON')
    expect(results.some((a) => a.id === 'rcon-setup')).toBe(true)
  })

  it('ranks a title match above a body-only match', () => {
    const results = searchArticles('RCON')
    const rconSetupIndex = results.findIndex((a) => a.id === 'rcon-setup')
    expect(rconSetupIndex).toBeGreaterThanOrEqual(0)
    // rcon-setup has "RCON" in its title, so it should rank at or near the top
    expect(rconSetupIndex).toBeLessThan(3)
  })

  it('is case-insensitive', () => {
    const lower = searchArticles('docker').map((a) => a.id)
    const upper = searchArticles('DOCKER').map((a) => a.id)
    expect(lower).toEqual(upper)
  })

  it('matches by tag even when the term is not in the title', () => {
    const results = searchArticles('cron')
    expect(results.some((a) => a.id === 'common-schedules')).toBe(true)
  })

  it('returns no results for a nonsense query', () => {
    expect(searchArticles('xyznonexistentterm')).toEqual([])
  })
})
