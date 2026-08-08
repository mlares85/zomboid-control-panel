import { useEffect, useRef, useState } from 'react'
import { serverFilesApi } from '@/lib/api'

// Auth-aware image preview (img tags can't send Bearer tokens)
export function AuthImage({ filePath, alt, className }: { filePath: string; alt?: string; className?: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const blobRef = useRef<string | null>(null)
  useEffect(() => {
    if (!filePath) return
    let cancelled = false
    serverFilesApi.fetchImagePreview(filePath).then(url => {
      if (cancelled) { URL.revokeObjectURL(url); return }
      if (blobRef.current) URL.revokeObjectURL(blobRef.current)
      blobRef.current = url
      setBlobUrl(url)
    }).catch(() => {})
    return () => {
      cancelled = true
      if (blobRef.current) { URL.revokeObjectURL(blobRef.current); blobRef.current = null }
    }
  }, [filePath])
  if (!blobUrl) return null
  return <img src={blobUrl} alt={alt || 'Preview'} className={className} />
}
