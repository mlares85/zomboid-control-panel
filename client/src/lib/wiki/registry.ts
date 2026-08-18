import type { ArticleCategory, WikiArticle } from './types'
import { articles as gettingStartedArticles } from './articles/gettingStarted'
import { articles as dockerArticles } from './articles/docker'
import { articles as modsArticles } from './articles/mods'
import { articles as templatesArticles } from './articles/templates'
import { articles as backupsArticles } from './articles/backups'
import { articles as schedulerArticles } from './articles/scheduler'
import { articles as discordArticles } from './articles/discord'
import { articles as advancedArticles } from './articles/advanced'

export const allArticles: WikiArticle[] = [
  ...gettingStartedArticles,
  ...dockerArticles,
  ...modsArticles,
  ...templatesArticles,
  ...backupsArticles,
  ...schedulerArticles,
  ...discordArticles,
  ...advancedArticles,
]

export const articlesById: Map<string, WikiArticle> = new Map(
  allArticles.map((article) => [article.id, article])
)

export function getArticle(id: string): WikiArticle | undefined {
  return articlesById.get(id)
}

export function getArticlesByCategory(category: ArticleCategory): WikiArticle[] {
  return allArticles.filter((article) => article.category === category)
}
