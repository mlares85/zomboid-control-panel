import { Settings, FolderOpen, Loader2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface BackupSettingsPanelProps {
  backupSchedule: string
  onScheduleChange: (schedule: string) => void
  backupMaxCount: number
  onMaxCountChange: (count: number) => void
  savesPath?: string
  savingSettings: boolean
  onSave: () => void
}

export function BackupSettingsPanel({
  backupSchedule,
  onScheduleChange,
  backupMaxCount,
  onMaxCountChange,
  savesPath,
  savingSettings,
  onSave,
}: BackupSettingsPanelProps) {
  return (
    <Card className="border-primary/15">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Backup Settings
        </CardTitle>
        <CardDescription>Configure scheduled backup settings.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="backup-schedule">Backup Frequency</Label>
            <Select value={backupSchedule} onValueChange={onScheduleChange}>
              <SelectTrigger id="backup-schedule" className="w-full">
                <SelectValue placeholder="Select frequency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="*/15 * * * *">Every 15 minutes</SelectItem>
                <SelectItem value="*/30 * * * *">Every 30 minutes</SelectItem>
                <SelectItem value="0 * * * *">Every hour</SelectItem>
                <SelectItem value="0 */2 * * *">Every 2 hours</SelectItem>
                <SelectItem value="0 */4 * * *">Every 4 hours</SelectItem>
                <SelectItem value="0 */6 * * *">Every 6 hours</SelectItem>
                <SelectItem value="0 */8 * * *">Every 8 hours</SelectItem>
                <SelectItem value="0 */12 * * *">Every 12 hours</SelectItem>
                <SelectItem value="0 0 * * *">Daily at midnight</SelectItem>
                <SelectItem value="0 6 * * *">Daily at 6 AM</SelectItem>
                <SelectItem value="0 12 * * *">Daily at noon</SelectItem>
                <SelectItem value="0 18 * * *">Daily at 6 PM</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              How often to automatically create backups
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="backup-max">Maximum Backups to Keep</Label>
            <Input
              id="backup-max"
              type="number"
              min={1}
              max={100}
              value={backupMaxCount}
              onChange={(e) => {
                const parsed = parseInt(e.target.value, 10)
                if (!isNaN(parsed) && parsed >= 1 && parsed <= 100) {
                  onMaxCountChange(parsed)
                } else if (e.target.value === '') {
                  onMaxCountChange(10)
                }
              }}
              className="max-w-24"
            />
            <p className="text-xs text-muted-foreground">
              Oldest backups will be auto-deleted when limit is reached
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-xs text-muted-foreground">
            {savesPath && (
              <span className="flex flex-wrap items-center gap-1 break-all">
                <FolderOpen className="w-3 h-3" />
                Saves: {savesPath}
              </span>
            )}
          </div>
          <Button onClick={onSave} disabled={savingSettings} size="sm" className="h-10 gap-2 self-start sm:self-auto">
            {savingSettings && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
