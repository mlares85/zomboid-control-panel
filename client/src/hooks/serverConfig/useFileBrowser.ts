import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'
import { useToast } from '@/components/ui/use-toast'
import { serverFilesApi } from '@/lib/api'

// File browser dialog for INI 'filepath' settings (server images, etc).
export function useFileBrowser(params: {
  iniSettings: Record<string, string>
  setIniSettings: Dispatch<SetStateAction<Record<string, string>>>
}) {
  const { iniSettings, setIniSettings } = params
  const { toast } = useToast()

  const [fileBrowserOpen, setFileBrowserOpen] = useState(false)
  const [fileBrowserKey, setFileBrowserKey] = useState('')
  const [fileBrowserPath, setFileBrowserPath] = useState('')
  const [fileBrowserDirs, setFileBrowserDirs] = useState<string[]>([])
  const [fileBrowserFiles, setFileBrowserFiles] = useState<{ name: string; ext: string }[]>([])
  const [fileBrowserParent, setFileBrowserParent] = useState<string | null>(null)
  const [fileBrowserLoading, setFileBrowserLoading] = useState(false)
  const [fileBrowserExtensions, setFileBrowserExtensions] = useState<string[]>([])
  const [fileBrowserSelected, setFileBrowserSelected] = useState<string | null>(null)

  const openFileBrowser = useCallback(async (key: string, extensions?: string[]) => {
    setFileBrowserKey(key)
    setFileBrowserExtensions(extensions || ['.png', '.jpg', '.jpeg'])
    setFileBrowserSelected(null)
    setFileBrowserOpen(true)
    setFileBrowserLoading(true)
    try {
      const currentValue = iniSettings[key]
      let startPath: string | undefined
      if (currentValue) {
        const lastSlash = Math.max(currentValue.lastIndexOf('/'), currentValue.lastIndexOf('\\'))
        if (lastSlash > 0) startPath = currentValue.substring(0, lastSlash)
      }
      const data = await serverFilesApi.browseFiles(startPath, extensions)
      setFileBrowserPath(data.currentPath)
      setFileBrowserDirs(data.directories)
      setFileBrowserFiles(data.files)
      setFileBrowserParent(data.parent)
    } catch {
      toast({ title: 'Error', description: 'Failed to browse files', variant: 'destructive' })
    } finally {
      setFileBrowserLoading(false)
    }
  }, [iniSettings, toast])

  const browseTo = useCallback(async (dirPath: string) => {
    setFileBrowserLoading(true)
    setFileBrowserSelected(null)
    try {
      const data = await serverFilesApi.browseFiles(dirPath, fileBrowserExtensions)
      setFileBrowserPath(data.currentPath)
      setFileBrowserDirs(data.directories)
      setFileBrowserFiles(data.files)
      setFileBrowserParent(data.parent)
    } catch {
      toast({ title: 'Error', description: 'Failed to navigate', variant: 'destructive' })
    } finally {
      setFileBrowserLoading(false)
    }
  }, [fileBrowserExtensions, toast])

  const confirmFileBrowserSelection = useCallback(() => {
    if (fileBrowserSelected && fileBrowserKey) {
      setIniSettings(prev => ({ ...prev, [fileBrowserKey]: fileBrowserSelected }))
      setFileBrowserOpen(false)
    }
  }, [fileBrowserSelected, fileBrowserKey, setIniSettings])

  const selectFileAndClose = useCallback((fullPath: string) => {
    setFileBrowserSelected(fullPath)
    setIniSettings(prev => ({ ...prev, [fileBrowserKey]: fullPath }))
    setFileBrowserOpen(false)
  }, [fileBrowserKey, setIniSettings])

  return {
    fileBrowserOpen, setFileBrowserOpen, fileBrowserKey, fileBrowserPath,
    fileBrowserDirs, fileBrowserFiles, fileBrowserParent, fileBrowserLoading,
    fileBrowserSelected, setFileBrowserSelected,
    openFileBrowser, browseTo, confirmFileBrowserSelection, selectFileAndClose,
  }
}
