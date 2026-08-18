// Small formatting helpers shared by the backup/* components. Mirrors the
// inline helpers in Backups.tsx (formatBytes/formatDate) so the new
// components read consistently with the existing page.

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

// First 12 hex/base64 chars of a checksum + ellipsis, for compact monospace display.
export function truncateChecksum(checksum: string): string {
  if (!checksum) return '—'
  return checksum.length > 12 ? `${checksum.slice(0, 12)}…` : checksum
}

export const DESTINATION_TYPE_LABELS: Record<string, string> = {
  local: 'Local',
  sftp: 'SFTP',
  'google-drive': 'Google Drive',
  smb: 'SMB',
  ftp: 'FTP',
  rsync: 'Rsync',
}

// Translate the small set of cron presets we expose into a human label.
// Falls back to the raw cron string for anything custom so the user
// still gets meaningful information without us shipping a full parser.
export function describeSchedule(cron: string | undefined): string {
  if (!cron) return 'No schedule'
  const map: Record<string, string> = {
    '*/15 * * * *': 'every 15 minutes',
    '*/30 * * * *': 'every 30 minutes',
    '0 * * * *': 'every hour',
    '0 */2 * * *': 'every 2 hours',
    '0 */4 * * *': 'every 4 hours',
    '0 */6 * * *': 'every 6 hours',
    '0 */8 * * *': 'every 8 hours',
    '0 */12 * * *': 'every 12 hours',
    '0 0 * * *': 'daily at midnight',
    '0 6 * * *': 'daily at 6 AM',
    '0 12 * * *': 'daily at noon',
    '0 18 * * *': 'daily at 6 PM',
  }
  return map[cron] || cron
}
