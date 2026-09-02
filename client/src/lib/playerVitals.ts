// Pure helpers for interpreting the raw stats the mod reports for a player
// (pz-mod/PanelBridge/media/lua/server/PanelBridge.lua, handlers.getPlayerDetails).
//
// PZ's Stats getters (getHunger/getThirst/getFatigue/...) return a 0.0-1.0
// fraction, not a 0-100 percentage — but overallBodyHealth is already 0-100.
// normalizeToPercent tolerates either shape defensively (some builds/mods
// have been seen sending an already-scaled value) so a value slightly above
// 1 still renders sensibly instead of clamping to a misleading 100%.
export function normalizeToPercent(value: number | undefined | null): number | null {
  if (value === undefined || value === null || Number.isNaN(value)) return null
  const pct = value <= 1.5 ? value * 100 : value
  return Math.max(0, Math.min(100, pct))
}

export type VitalTone = 'good' | 'warn' | 'danger'

/** For meters where higher is better (health): green above 50, amber above 25, red below. */
export function toneForHealth(percent: number): VitalTone {
  if (percent > 50) return 'good'
  if (percent > 25) return 'warn'
  return 'danger'
}

/** For meters where higher is worse (hunger, thirst, fatigue): green under 40, amber under 70, red above. */
export function toneForNeed(percent: number): VitalTone {
  if (percent < 40) return 'good'
  if (percent < 70) return 'warn'
  return 'danger'
}

export const VITAL_TONE_COLOR: Record<VitalTone, string> = {
  good: 'hsl(var(--success))',
  warn: 'hsl(var(--warning))',
  danger: 'hsl(var(--destructive))',
}
