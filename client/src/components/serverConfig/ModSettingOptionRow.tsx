import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Loader2, Undo2 } from 'lucide-react'
import { formatModSettingDescription, formatModSettingLabel } from '@/lib/modSettingsLabels'
import { ModSettingOption } from '@/hooks/serverConfig/useModSettings'

// A single mod sandbox option — boolean/enum/number/text editor plus the
// reset-to-default affordance. Name/value formatting mirrors PZ's own labels.
export function ModSettingOptionRow({
  opt,
  idx,
  groupName,
  isSaving,
  isModified,
  onOptionChange,
}: {
  opt: ModSettingOption
  idx: number
  groupName: string
  isSaving: boolean
  isModified: boolean
  onOptionChange: (optName: string, newValue: unknown, groupName: string) => void
}) {
  const rawDisplayName = opt.shortName || opt.name || `Option ${idx}`
  const displayName = formatModSettingLabel(
    opt.translatedName && opt.translatedName !== rawDisplayName ? opt.translatedName : rawDisplayName,
    groupName,
  ) || `Option ${idx + 1}`
  const rawTooltip = opt.tooltipText || opt.tooltip || ''
  const description = formatModSettingDescription(rawTooltip.replace(/\n?Default\s*=\s*.*/i, ''))
  const rawVal = opt.value
  let displayValue: string
  if (rawVal === undefined || rawVal === null) {
    displayValue = '—'
  } else if (typeof rawVal === 'number') {
    displayValue = Number.isInteger(rawVal) ? String(rawVal) : rawVal.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
  } else {
    displayValue = String(rawVal)
  }
  const typeLabel = opt.type || 'unknown'
  const boolValue = typeLabel === 'boolean' ? (rawVal === true || rawVal === 'true' || rawVal === 1) : false

  return (
    <div
      key={`${opt.name || 'opt'}-${idx}`}
      className={`flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50 gap-4 ${isSaving ? 'opacity-60 pointer-events-none' : ''}`}
    >
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate" title={opt.name || displayName}>
          {displayName}
        </div>
        {description && (
          <div className="text-xs text-muted-foreground/70 mt-0.5 line-clamp-2" title={rawTooltip}>
            {description}
          </div>
        )}
        {opt.name && opt.name !== displayName && (
          <div className="text-[10px] text-muted-foreground/40 font-mono truncate mt-0.5" title={opt.name}>{opt.name}</div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {typeLabel === 'boolean' ? (
          <div className="flex items-center gap-2">
            <Switch
              checked={boolValue}
              onCheckedChange={(checked) => opt.name && !isSaving && onOptionChange(opt.name, checked, groupName)}
              disabled={isSaving}
              aria-label={`${displayName}: ${boolValue ? 'ON' : 'OFF'}`}
            />
            <span className={`text-xs font-mono ${boolValue ? 'text-primary' : 'text-muted-foreground'}`}>
              {boolValue ? 'ON' : 'OFF'}
            </span>
          </div>
        ) : typeLabel === 'enum' && opt.enumValues && opt.enumValues.length > 0 ? (
          <Select
            value={opt.selectedIndex !== undefined ? String(opt.selectedIndex) : displayValue}
            onValueChange={(val) => {
              if (!opt.name || isSaving) return
              const idx2 = parseInt(val, 10)
              if (isNaN(idx2)) return
              onOptionChange(opt.name, idx2, groupName)
            }}
            disabled={isSaving}
          >
            <SelectTrigger className="h-7 w-full sm:w-[180px] text-xs font-mono" aria-label={displayName}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {opt.enumValues.map((ev, ei) => (
                <SelectItem key={ei} value={String(ei)} className="text-xs font-mono">
                  {ev}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : typeLabel === 'number' || typeLabel === 'double' || typeLabel === 'integer' ? (
          <Input
            key={`${opt.name}-${displayValue}`}
            type="number"
            className="h-7 w-full sm:w-[100px] text-xs font-mono text-right"
            defaultValue={displayValue}
            min={opt.min}
            max={opt.max}
            // The browser counts valid values up from `min` in `step`
            // increments, so a fractional min like 0.001 with step 1
            // rejects every whole number the user types.
            step={typeLabel === 'integer' && Number.isInteger(opt.min ?? 0) ? 1 : 'any'}
            disabled={isSaving}
            aria-label={displayName}
            onBlur={(e) => {
              let num = parseFloat(e.target.value)
              if (isNaN(num) || !opt.name) return
              if (opt.min !== undefined) num = Math.max(opt.min, num)
              if (opt.max !== undefined) num = Math.min(opt.max, num)
              if (num === rawVal) return
              e.target.value = String(num)
              onOptionChange(opt.name, num, groupName)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
          />
        ) : (
          <Input
            key={`${opt.name}-${displayValue}`}
            type="text"
            className="h-7 w-full sm:w-[160px] text-xs font-mono"
            defaultValue={displayValue}
            disabled={isSaving}
            aria-label={displayName}
            onBlur={(e) => {
              if (e.target.value !== String(rawVal) && opt.name) onOptionChange(opt.name, e.target.value, groupName)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
          />
        )}
        {opt.min !== undefined && opt.max !== undefined && (
          <span className="text-xs text-muted-foreground/60 whitespace-nowrap">
            {opt.min}–{opt.max}
          </span>
        )}
        {isModified && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="text-xs text-muted-foreground/50 hover:text-primary whitespace-nowrap flex items-center gap-1"
                onClick={() => opt.name && opt.default !== undefined && onOptionChange(opt.name, opt.default, groupName)}
                disabled={isSaving}
                title={`Reset to default: ${opt.default}`}
              >
                <Undo2 className="w-3 h-3" />
                <span>def: {String(opt.default)}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p>Reset to default: {String(opt.default)}</p>
            </TooltipContent>
          </Tooltip>
        )}
        {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />}
      </div>
    </div>
  )
}
