import { describe, it, expect } from 'vitest'
import { normalizeToPercent, toneForHealth, toneForNeed } from '../playerVitals'

describe('normalizeToPercent', () => {
  it('scales a 0.0-1.0 fraction to a percentage', () => {
    expect(normalizeToPercent(0.42)).toBeCloseTo(42)
  })

  it('passes through a value already given as a percentage', () => {
    expect(normalizeToPercent(78)).toBe(78)
  })

  it('clamps above 100', () => {
    expect(normalizeToPercent(150)).toBe(100)
  })

  it('clamps below 0', () => {
    expect(normalizeToPercent(-5)).toBe(0)
  })

  it.each([undefined, null, NaN])('returns null for %s', (value) => {
    expect(normalizeToPercent(value as number | undefined)).toBeNull()
  })
})

describe('toneForHealth', () => {
  it('is good above 50', () => {
    expect(toneForHealth(75)).toBe('good')
  })
  it('is warn between 25 and 50', () => {
    expect(toneForHealth(30)).toBe('warn')
  })
  it('is danger at or below 25', () => {
    expect(toneForHealth(10)).toBe('danger')
  })
})

describe('toneForNeed', () => {
  it('is good under 40', () => {
    expect(toneForNeed(20)).toBe('good')
  })
  it('is warn between 40 and 70', () => {
    expect(toneForNeed(55)).toBe('warn')
  })
  it('is danger at or above 70', () => {
    expect(toneForNeed(90)).toBe('danger')
  })
})
