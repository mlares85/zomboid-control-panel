import type { ArticleBlock, InlineContent, WikiArticle } from './types'
import { allArticles } from './registry'

const TITLE_WEIGHT = 10
const TAG_WEIGHT = 5
const BODY_WEIGHT = 1

function inlineToText(content: InlineContent): string {
  if (typeof content === 'string') return content
  if (content.type === 'link' || content.type === 'extlink') return content.label
  return content.text
}

function blockToText(block: ArticleBlock): string {
  if (block.type === 'heading') return block.text
  if (block.type === 'code') return block.code
  if (block.type === 'paragraph' || block.type === 'callout') {
    return block.text.map(inlineToText).join(' ')
  }
  return block.items.map((item) => item.map(inlineToText).join(' ')).join(' ')
}

// Cached lowercase search text per article — built once, reused per query.
const bodyTextCache = new Map<string, string>()
function getBodyText(article: WikiArticle): string {
  const cached = bodyTextCache.get(article.id)
  if (cached) return cached
  const text = article.content.map(blockToText).join(' ').toLowerCase()
  bodyTextCache.set(article.id, text)
  return text
}

function scoreArticle(article: WikiArticle, terms: string[]): number {
  const title = article.title.toLowerCase()
  const tags = (article.tags ?? []).map((t) => t.toLowerCase())
  const body = `${article.summary.toLowerCase()} ${getBodyText(article)}`
  let score = 0
  for (const term of terms) {
    if (title.includes(term)) score += TITLE_WEIGHT
    if (tags.some((tag) => tag.includes(term))) score += TAG_WEIGHT
    if (body.includes(term)) score += BODY_WEIGHT
  }
  return score
}

export function searchArticles(query: string): WikiArticle[] {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return []

  return allArticles
    .map((article) => ({ article, score: scoreArticle(article, terms) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ article }) => article)
}
