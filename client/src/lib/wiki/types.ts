export type ArticleCategory = 'getting-started' | 'docker' | 'mods' | 'templates' | 'backups' | 'scheduler' | 'discord' | 'advanced'

export interface WikiArticle {
  id: string
  title: string
  category: ArticleCategory
  summary: string
  tags?: string[]
  related?: string[]
  content: ArticleBlock[]
}

export type ArticleBlock =
  | { type: 'heading'; level: 2 | 3; text: string }
  | { type: 'paragraph'; text: InlineContent[] }
  | { type: 'list'; ordered?: boolean; items: InlineContent[][] }
  | { type: 'code'; lang?: string; code: string }
  | { type: 'callout'; tone: 'info' | 'warning' | 'tip'; text: InlineContent[] }

export type InlineContent =
  | string
  | { type: 'link'; articleId: string; label: string }
  | { type: 'extlink'; href: string; label: string }
  | { type: 'code'; text: string }
  | { type: 'bold'; text: string }

export interface CategoryMeta {
  id: ArticleCategory
  label: string
  order: number
}

// Field-level help for tooltips throughout the app
export type FieldRecommendation = 'safe-default' | 'must-configure' | 'advanced'

export interface FieldHelpData {
  description: string
  context: string
  recommendation: FieldRecommendation
  articleId?: string
}
