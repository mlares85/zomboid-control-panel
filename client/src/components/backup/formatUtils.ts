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
