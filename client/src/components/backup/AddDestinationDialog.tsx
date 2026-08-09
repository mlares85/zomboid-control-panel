import { useState } from 'react'
import { Loader2, AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { backupApi, BackupDestinationType } from '@/lib/api'
import { DESTINATION_TYPE_LABELS } from './formatUtils'

const STUB_TYPES: BackupDestinationType[] = ['smb', 'ftp', 'rsync']

interface FieldDef {
  key: string
  label: string
  type?: 'password' | 'number'
  placeholder?: string
}

// Type-specific config fields per the destination type. `path` and `name`
// are handled separately since they're top-level fields on every type.
const TYPE_CONFIG_FIELDS: Record<BackupDestinationType, FieldDef[]> = {
  local: [],
  sftp: [
    { key: 'host', label: 'Host' },
    { key: 'port', label: 'Port', type: 'number', placeholder: '22' },
    { key: 'username', label: 'Username' },
    { key: 'password', label: 'Password', type: 'password' },
    { key: 'remotePath', label: 'Remote Path' },
  ],
  'google-drive': [
    { key: 'folderId', label: 'Folder ID (optional)', placeholder: 'Leave blank to upload to Drive root' },
  ],
  smb: [
    { key: 'host', label: 'Host' },
    { key: 'share', label: 'Share' },
    { key: 'username', label: 'Username' },
    { key: 'password', label: 'Password', type: 'password' },
  ],
  ftp: [
    { key: 'host', label: 'Host' },
    { key: 'port', label: 'Port', type: 'number', placeholder: '21' },
    { key: 'username', label: 'Username' },
    { key: 'password', label: 'Password', type: 'password' },
  ],
  rsync: [
    { key: 'host', label: 'Host' },
    { key: 'username', label: 'Username' },
    { key: 'remotePath', label: 'Remote Path' },
    { key: 'sshKeyPath', label: 'SSH Key Path' },
  ],
}

interface AddDestinationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdded: () => void
}

export function AddDestinationDialog({ open, onOpenChange, onAdded }: AddDestinationDialogProps) {
  const { toast } = useToast()
  const [type, setType] = useState<BackupDestinationType>('local')
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [config, setConfig] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const reset = () => {
    setType('local')
    setName('')
    setPath('')
    setConfig({})
    setErrors({})
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {}
    if (!name.trim()) nextErrors.name = 'Name is required'
    if (type !== 'google-drive' && !path.trim()) nextErrors.path = 'Path is required'
    if ((type === 'sftp' || type === 'ftp' || type === 'smb' || type === 'rsync') && !config.host?.trim()) {
      nextErrors.host = 'Host is required'
    }
    if (type === 'smb' && !config.share?.trim()) nextErrors.share = 'Share is required'
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    setSubmitting(true)
    try {
      const result = await backupApi.addDestination({
        type,
        name: name.trim(),
        path: path.trim() || '/',
        config: config as Record<string, unknown>,
      })
      if (result.success) {
        toast({ title: 'Destination Added', description: `${name.trim()} was added.`, variant: 'success' as const })
        onAdded()
        handleOpenChange(false)
      } else {
        toast({ title: 'Could Not Add Destination', description: result.message || 'The server rejected this destination.', variant: 'destructive' })
      }
    } catch (error) {
      toast({ title: 'Could Not Add Destination', description: error instanceof Error ? error.message : 'Failed to add destination', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  const configFields = TYPE_CONFIG_FIELDS[type]
  const isStub = STUB_TYPES.includes(type)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Backup Destination</DialogTitle>
          <DialogDescription>Configure where backups get copied after they&apos;re created.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dest-type">Type</Label>
            <Select value={type} onValueChange={(value) => setType(value as BackupDestinationType)}>
              <SelectTrigger id="dest-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(DESTINATION_TYPE_LABELS) as BackupDestinationType[]).map((value) => (
                  <SelectItem key={value} value={value}>{DESTINATION_TYPE_LABELS[value]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isStub && (
            <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                {DESTINATION_TYPE_LABELS[type]} support is coming soon. You can save this configuration now — it
                will activate once support ships, but Test/Save-to-destination won&apos;t work yet.
              </span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="dest-name">Name</Label>
            <Input id="dest-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. NAS backups" />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          {type === 'google-drive' ? (
            <p className="text-xs text-muted-foreground">
              Add the destination, then use the &quot;Connect&quot; flow on its card below to link a Google account via OAuth.
            </p>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="dest-path">Path</Label>
              <Input id="dest-path" value={path} onChange={(e) => setPath(e.target.value)} placeholder="/mnt/backups" />
              {errors.path && <p className="text-xs text-destructive">{errors.path}</p>}
            </div>
          )}

          {configFields.map((field) => (
            <div className="space-y-2" key={field.key}>
              <Label htmlFor={`dest-${field.key}`}>{field.label}</Label>
              <Input
                id={`dest-${field.key}`}
                type={field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text'}
                placeholder={field.placeholder}
                value={config[field.key] || ''}
                onChange={(e) => setConfig((prev) => ({ ...prev, [field.key]: e.target.value }))}
              />
              {errors[field.key] && <p className="text-xs text-destructive">{errors[field.key]}</p>}
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Add Destination
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
