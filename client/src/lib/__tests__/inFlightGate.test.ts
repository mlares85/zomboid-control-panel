import { describe, expect, it } from 'vitest'
import { createInFlightGate } from '../inFlightGate'

describe('createInFlightGate', () => {
  it('allows the first enter, blocks the second', () => {
    const gate = createInFlightGate()
    expect(gate.enter()).toBe(true)
    expect(gate.enter()).toBe(false)
  })

  it('allows re-entry after leave', () => {
    const gate = createInFlightGate()
    gate.enter()
    gate.leave()
    expect(gate.enter()).toBe(true)
  })
})
