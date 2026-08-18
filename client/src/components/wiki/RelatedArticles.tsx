import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { articlesById } from '@/lib/wiki/registry'

interface RelatedArticlesProps {
  articleIds: string[]
}

// Small card grid linking to related wiki articles. Silently skips any id
// that doesn't resolve — content authors can reference an article before it
// exists without breaking the page.
export function RelatedArticles({ articleIds }: RelatedArticlesProps) {
  const articles = articleIds
    .map((id) => articlesById.get(id))
    .filter((article): article is NonNullable<typeof article> => !!article)

  if (articles.length === 0) return null

  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      {articles.map((article) => (
        <Link
          key={article.id}
          to={`/wiki/${article.id}`}
          className="group flex items-start justify-between gap-2 rounded-lg border border-border/50 bg-card/50 px-3.5 py-3 transition-colors hover:border-primary/40 hover:bg-primary/5"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground group-hover:text-primary">
              {article.title}
            </p>
            <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">
              {article.summary}
            </p>
          </div>
          <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
        </Link>
      ))}
    </div>
  )
}
