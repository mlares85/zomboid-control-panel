import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface WikiLinkProps {
  articleId: string
  children?: React.ReactNode
  className?: string
}

// Inline link to a wiki article — use inside prose, callouts, or field help
// text wherever a term deserves a "learn more" pointer.
export function WikiLink({ articleId, children, className }: WikiLinkProps) {
  return (
    <Link
      to={`/wiki/${articleId}`}
      className={cn('text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary', className)}
    >
      {children}
    </Link>
  )
}
