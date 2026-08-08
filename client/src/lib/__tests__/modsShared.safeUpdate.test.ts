import { describe, it, expect } from 'vitest'
import {
  SAFE_UPDATE_STEP_ORDER,
  estimateSecondsRemaining,
  initialStepStates,
  type SafeUpdateStepStates,
} from '../modsShared'

describe('initialStepStates', () => {
  it('creates one pending entry per step in order', () => {
    const states = initialStepStates()

    expect(Object.keys(states)).toEqual(SAFE_UPDATE_STEP_ORDER)
    for (const key of SAFE_UPDATE_STEP_ORDER) {
      expect(states[key]).toEqual({ step: key, status: 'pending', detail: null })
    }
  })
})

describe('estimateSecondsRemaining', () => {
  it('sums every step estimate when nothing has started', () => {
    const remaining = estimateSecondsRemaining(initialStepStates(), 30)
    // backup(60) + update(10) + warning(30) + restart(180) + verify(10)
    expect(remaining).toBe(290)
  })

  it('uses the actual warningSeconds instead of a fixed estimate', () => {
    const remaining = estimateSecondsRemaining(initialStepStates(), 120)
    expect(remaining).toBe(60 + 10 + 120 + 180 + 10)
  })

  it('excludes completed (success or failed) steps from the total', () => {
    const states = initialStepStates()
    states.backup = { step: 'backup', status: 'success', detail: 'done' }
    states.update = { step: 'update', status: 'failed', detail: 'oops' }

    const remaining = estimateSecondsRemaining(states, 30)
    // warning(30) + restart(180) + verify(10) — backup and update excluded
    expect(remaining).toBe(220)
  })

  it('returns 0 once every step has finished', () => {
    const states: SafeUpdateStepStates = SAFE_UPDATE_STEP_ORDER.reduce((acc, step) => {
      acc[step] = { step, status: 'success', detail: null }
      return acc
    }, {} as SafeUpdateStepStates)

    expect(estimateSecondsRemaining(states, 30)).toBe(0)
  })
})
