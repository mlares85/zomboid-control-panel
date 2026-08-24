// Prevents overlapping async fetches. enter() returns false when a prior
// call is still in flight; leave() must be called in a finally block.
// Used by WorldMap's bridge polling to prevent duplicate requests when
// large responses are still being processed.
export function createInFlightGate() {
  let inFlight = false

  return {
    enter() {
      if (inFlight) return false
      inFlight = true
      return true
    },
    leave() {
      inFlight = false
    },
  }
}
