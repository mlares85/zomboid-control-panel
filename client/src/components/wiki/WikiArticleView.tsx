import { Link } from 'react-router-dom'
import { ChevronRight, ArrowLeft } from 'lucide-react'
import { getArticle } from '@/lib/wiki/registry'
import { getCategoryLabel } from '@/lib/wiki/categories'
import { ArticleRenderer } from './ArticleRenderer'
import { RelatedArticles } from './RelatedArticles'

interface WikiArticleViewProps {
  articleId: string
}

export function WikiArticleView({ articleId }: WikiArticleViewProps) {
  const article = getArticle(articleId)

  if (!article) {
    return <ArticleNotFound articleId={articleId} />
  }

  return (
    <div className="space-y-6">
      <Breadcrumb category={article.category} title={article.title} />

      <article className="rounded-xl border border-border/50 bg-card/40 p-5 sm:p-6">
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          {article.title}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{article.summary}</p>
        <div className="mt-5">
          <ArticleRenderer blocks={article.content} />
        </div>
      </article>

      {article.related && article.related.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Related Articles
          </h2>
          <RelatedArticles articleIds={article.related} />
        </section>
      )}

      <BackToWikiLink />
    </div>
  )
}

function Breadcrumb({ category, title }: { category: string; title: string }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Link to="/wiki" className="transition-colors hover:text-foreground">
        Wiki
      </Link>
      <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>{getCategoryLabel(category)}</span>
      <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="truncate text-foreground/80">{title}</span>
    </nav>
  )
}

function BackToWikiLink() {
  return (
    <Link
      to="/wiki"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
      Back to Wiki
    </Link>
  )
}

function ArticleNotFound({ articleId }: { articleId: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/40 p-6 text-center">
      <h1 className="text-lg font-semibold text-foreground">Article not found</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        We couldn&apos;t find a wiki article for &ldquo;{articleId}&rdquo;.
      </p>
      <div className="mt-4">
        <BackToWikiLink />
      </div>
    </div>
  )
}
