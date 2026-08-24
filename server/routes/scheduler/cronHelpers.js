// node-cron accepts an optional LEADING seconds field -- 6 space-separated
// fields instead of 5 -- which nothing in this app documents, exposes, or
// needs (the UI's format hint and every preset are 5-field only). The
// custom-expression input accepts anything cron.validate() accepts, though,
// including 6 fields. isCronTooFrequent() below is built to analyse a
// 5-field expression and always reads parts[0] as MINUTES -- for a 6-field
// expression parts[0] is actually SECONDS, so e.g. "*/5 * * * * *" (fires
// every 5 SECONDS) reads as minute="*/5", which looks like a harmless
// once-every-5-minutes value and sails through the DoS guard untouched.
// Reject outright rather than teaching the guard a second field grammar
// for a feature this app has never exposed or tested.
export function hasUnsupportedCronFieldCount(expr) {
  return expr.trim().split(/\s+/).length !== 5;
}

/**
 * Check if a cron expression runs more frequently than every 5 minutes.
 * Parses the minute and hour fields to detect sub-5-minute intervals.
 * Assumes a 5-field expression -- callers must reject anything else via
 * hasUnsupportedCronFieldCount() first. The arity check below is
 * defense-in-depth for any other caller, not the primary gate: treats
 * anything but exactly 5 fields as too-frequent-to-be-safe (fail closed)
 * rather than silently misreading a field it was never built to parse.
 */
export function isCronTooFrequent(expr) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return true;
  const [minute, hour] = parts;

  // Every minute: * or */1 through */4 (also catches range-step forms like 0-59/2)
  if (minute === '*') return true;
  if (/^\*\/([1-4])$/.test(minute)) return true;

  // Range with step: e.g. "1-59/2" or "0-30/1" — bypasses the */N check.
  // Reject any range step <5, regardless of the range bounds.
  const rangeStep = minute.match(/^\d+-\d+\/(\d+)$/);
  if (rangeStep) {
    const step = parseInt(rangeStep[1], 10);
    if (Number.isFinite(step) && step >= 1 && step < 5) return true;
  }

  // Comma-separated minutes — reject if any two consecutive runs are <5 min apart.
  // Within-hour gaps fire whenever the cron runs, regardless of the hour field
  // (e.g. `0,1,2 0 * * *` still produces 1-minute gaps at midnight). Previously
  // this branch was gated on `hour === '*'` which let hour-pinned bursts slip
  // through the throttle.
  if (minute.includes(',')) {
    const values = minute
      .split(',')
      .map(v => parseInt(v.trim(), 10))
      .filter(n => Number.isFinite(n) && n >= 0 && n <= 59)
      .sort((a, b) => a - b);
    for (let i = 1; i < values.length; i++) {
      if (values[i] - values[i - 1] < 5) return true;
    }
    // Wrap-around (last of hour N → first of hour N+1) only matters when
    // consecutive hours fire. Conservatively gate this on hour === '*'.
    if (hour === '*' && values.length >= 2) {
      const wrap = (60 - values[values.length - 1]) + values[0];
      if (wrap < 5) return true;
    }
  }

  return false;
}
