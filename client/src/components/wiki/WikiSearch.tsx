import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { searchArticles } from '@/lib/wiki/search'
import { getCategoryLabel } from '@/lib/wiki/categories'

interface WikiSearchProps {
  className?: string
  placeholder?: string
  autoFocus?: boolean
}

export function WikiSearch({ className, placeholder = 'Search the wiki…', autoFocus }: WikiSearchProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const debouncedQuery = useDebouncedValue(query, 300)
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)

  const results = useMemo(
    () => (debouncedQuery.trim() ? searchArticles(debouncedQuery.trim()).slice(0, 8) : []),
    [debouncedQuery]
  )

  useEffect(() => {
    setOpen(results.length > 0 && debouncedQuery.trim().length > 0)
  }, [results, debouncedQuery])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const onClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const handleSelect = (articleId: string) => {
    setOpen(false)
    setQuery('')
    navigate(`/wiki/${articleId}`)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false)
      event.currentTarget.blur()
    }
  }

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" aria-hidden="true" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          aria-label="Search wiki articles"
          className="pl-9"
        />
      </div>

      {open && (
        <div className="absolute z-50 mt-1.5 w-full overflow-hidden rounded-lg border border-border/60 bg-popover shadow-lg">
          <ul className="max-h-80 overflow-y-auto py-1">
            {results.map((article) => (
              <li key={article.id}>
                <button
                  type="button"
                  onClick={() => handleSelect(article.id)}
                  className="flex w-full flex-col items-start gap-0.5 px-3.5 py-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:bg-muted/60"
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{article.title}</span>
                    <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px]">
                      {getCategoryLabel(article.category)}
                    </Badge>
                  </div>
                  <span className="line-clamp-1 text-xs text-muted-foreground">{article.summary}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
