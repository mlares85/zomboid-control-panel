import { Link } from 'react-router-dom'
import {
  Rocket,
  Box,
  Package,
  LayoutTemplate,
  Archive,
  Clock,
  MessageSquare,
  Wrench,
  ArrowRight,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { WikiSearch } from './WikiSearch'
import { CATEGORIES } from '@/lib/wiki/categories'
import { articlesById, getArticlesByCategory } from '@/lib/wiki/registry'
import type { ArticleCategory } from '@/lib/wiki/types'

const CATEGORY_ICONS: Record<ArticleCategory, typeof Rocket> = {
  'getting-started': Rocket,
  docker: Box,
  mods: Package,
  templates: LayoutTemplate,
  backups: Archive,
  scheduler: Clock,
  discord: MessageSquare,
  advanced: Wrench,
}

// Curated picks shown regardless of category — the articles a brand-new
// admin is most likely to need first.
const POPULAR_ARTICLE_IDS = ['welcome-tour', 'rcon-setup', 'adding-servers', 'backups-overview']

export function WikiHome() {
  const popularArticles = POPULAR_ARTICLE_IDS
    .map((id) => articlesById.get(id))
    .filter((article): article is NonNullable<typeof article> => !!article)

  return (
    <div className="space-y-8">
      <div className="mx-auto max-w-xl">
        <WikiSearch autoFocus placeholder="Search articles, e.g. &ldquo;RCON&rdquo; or &ldquo;backups&rdquo;…" />
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Browse by category
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[...CATEGORIES].sort((a, b) => a.order - b.order).map((category) => {
            const articles = getArticlesByCategory(category.id)
            const Icon = CATEGORY_ICONS[category.id]
            const firstArticleId = articles[0]?.id

            return (
              <Link
                key={category.id}
                to={firstArticleId ? `/wiki/${firstArticleId}` : '/wiki'}
                aria-disabled={!firstArticleId}
                className="group"
              >
                <Card className="flex h-full flex-col gap-2.5 p-4 transition-colors group-hover:border-primary/40 group-hover:bg-primary/5">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/60 text-foreground/80 group-hover:border-primary/40 group-hover:text-primary">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="text-sm font-semibold text-foreground">{category.label}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {articles.length} article{articles.length === 1 ? '' : 's'}
                  </span>
                </Card>
              </Link>
            )
          })}
        </div>
      </section>

      {popularArticles.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Popular
          </h2>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {popularArticles.map((article) => (
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
        </section>
      )}
    </div>
  )
}
