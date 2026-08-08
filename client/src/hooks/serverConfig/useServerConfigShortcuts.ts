import { useEffect, useRef } from 'react'

// Ctrl+S saves the active tab, Ctrl+F focuses search, and an unsaved-changes
// warning fires on tab close. Refs avoid stale closures on the save handlers.
export function useServerConfigShortcuts(params: {
  activeTab: string
  hasIniChanges: boolean
  hasSandboxChanges: boolean
  handleSaveIni: () => void
  handleSaveSandbox: () => void
}) {
  const { activeTab, hasIniChanges, hasSandboxChanges, handleSaveIni, handleSaveSandbox } = params

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
    if (hasIniChanges || hasSandboxChanges) window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasIniChanges, hasSandboxChanges])

  const handleSaveIniRef = useRef(handleSaveIni)
  const handleSaveSandboxRef = useRef(handleSaveSandbox)
  handleSaveIniRef.current = handleSaveIni
  handleSaveSandboxRef.current = handleSaveSandbox

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (activeTab === 'ini' && hasIniChanges) handleSaveIniRef.current()
        else if (activeTab === 'sandbox' && hasSandboxChanges) handleSaveSandboxRef.current()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        const searchInput = document.querySelector<HTMLInputElement>('input[placeholder*="Search settings"]')
        searchInput?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeTab, hasIniChanges, hasSandboxChanges])
}
