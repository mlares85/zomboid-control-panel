import { memo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Undo2 } from 'lucide-react'
import { SandboxSetting } from '@/lib/serverConfigSchema'
import { SandboxScalar } from '@/lib/serverConfigTypes'
import { FieldHelp } from '@/components/FieldHelp'
import { getServerConfigHelp } from '@/lib/wiki/serverConfigHelp'

export const SandboxSettingRow = memo(({
  setting,
  value,
  originalValue,
  onChange,
  onReset
}: {
  setting: SandboxSetting;
  value: SandboxScalar;
  originalValue?: SandboxScalar;
  onChange: (setting: SandboxSetting, value: SandboxScalar) => void;
  onReset?: (setting: SandboxSetting) => void;
}) => {
  const isModified = originalValue !== undefined && JSON.stringify(value) !== JSON.stringify(originalValue)
  const isDifferentFromDefault = setting.default !== undefined && JSON.stringify(value) !== JSON.stringify(setting.default)
  const help = getServerConfigHelp(setting.key, setting.section)

  return (
    <div className={`perf-content-auto grid gap-2 rounded-md border-b py-3 pl-3 pr-4 transition-colors last:border-0 ${
      isModified ? 'border-l-2 border-l-warning bg-warning/5' : 'border-l-2 border-l-transparent hover:bg-muted/20'
    }`}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Label className="text-sm font-medium">{setting.label}</Label>
            {help && <FieldHelp {...help} />}
            {isModified && (
              <Badge variant="warning" className="h-5 text-xs">modified</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">{setting.description}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
            <code className="bg-muted px-1 rounded">{setting.key}</code>
            {setting.default !== undefined && (
              <span className={isDifferentFromDefault ? 'text-warning' : ''}>Default: {String(setting.default)}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isModified && onReset && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-11 w-11 text-warning hover:text-warning sm:h-9 sm:w-9" onClick={() => onReset(setting)} aria-label={`Reset ${setting.label} to loaded value`}>
                    <Undo2 className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Reset to loaded value</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <div className="w-full sm:w-48">
            {setting.type === 'boolean' ? (
              <div className="flex items-center gap-2 justify-end">
                <span className="text-xs text-muted-foreground">{Boolean(value) ? 'On' : 'Off'}</span>
                <Switch
                  checked={Boolean(value)}
                  onCheckedChange={(checked) => onChange(setting, checked)}
                  aria-label={setting.label || setting.key}
                />
              </div>
            ) : setting.type === 'select' && setting.options ? (
              <Select value={String(value || '')} onValueChange={(v) => onChange(setting, Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {setting.options.map(opt => (
                    <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div>
                <Input
                  type="number"
                  value={value !== undefined ? String(value) : ''}
                  onChange={(e) => onChange(setting, e.target.value)}
                  min={setting.min}
                  max={setting.max}
                  step={setting.max && setting.max <= 1 ? 0.1 : 1}
                  className={`text-right ${isModified ? 'border-warning/40' : ''}`}
                />
                {(setting.min !== undefined || setting.max !== undefined) && (
                  <div className="text-xs text-muted-foreground/60 text-right mt-0.5">
                    {setting.min !== undefined && setting.max !== undefined
                      ? `${setting.min} – ${setting.max}`
                      : setting.min !== undefined
                      ? `min: ${setting.min}`
                      : `max: ${setting.max}`}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}, (prev, next) => {
  return prev.value === next.value && prev.setting === next.setting && prev.originalValue === next.originalValue
})
SandboxSettingRow.displayName = 'SandboxSettingRow'
