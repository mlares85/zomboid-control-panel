import { describe, expect, it } from 'vitest'
import { allArticles, articlesById, getArticle, getArticlesByCategory } from '../registry'
import { CATEGORIES } from '../categories'
import type { InlineContent } from '../types'

describe('registry', () => {
  it('exposes every article by id', () => {
    expect(allArticles.length).toBeGreaterThan(0)
    for (const article of allArticles) {
      expect(articlesById.get(article.id)).toBe(article)
    }
  })

  it('getArticle returns undefined for an unknown id', () => {
    expect(getArticle('does-not-exist')).toBeUndefined()
  })

  it('getArticlesByCategory only returns articles in that category', () => {
    for (const category of CATEGORIES) {
      const articles = getArticlesByCategory(category.id)
      expect(articles.every((a) => a.category === category.id)).toBe(true)
    }
  })

  it('has no duplicate article ids', () => {
    const ids = allArticles.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every related article id resolves to a real article', () => {
    for (const article of allArticles) {
      for (const relatedId of article.related ?? []) {
        expect(articlesById.has(relatedId)).toBe(true)
      }
    }
  })

  it('every inline link articleId resolves to a real article', () => {
    for (const article of allArticles) {
      for (const block of article.content) {
        const inlineGroups = block.type === 'list' ? block.items : block.type === 'heading' || block.type === 'code' ? [] : [block.text]
        for (const group of inlineGroups) {
          for (const item of group as InlineContent[]) {
            if (typeof item !== 'string' && item.type === 'link') {
              expect(articlesById.has(item.articleId)).toBe(true)
            }
          }
        }
      }
    }
  })
})
