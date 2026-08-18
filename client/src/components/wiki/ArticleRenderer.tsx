import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, Info, AlertTriangle, Lightbulb } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ArticleBlock, InlineContent } from '@/lib/wiki/types'

interface ArticleRendererProps {
  blocks: ArticleBlock[]
}

// Renders the block-level content of a wiki article. Kept pure (no data
// fetching) so it can be reused anywhere an ArticleBlock[] is available —
// e.g. field-level help popovers in a later change.
export function ArticleRenderer({ blocks }: ArticleRendererProps) {
  return (
    <div className="space-y-4">
      {blocks.map((block, idx) => (
        <BlockRenderer key={idx} block={block} />
      ))}
    </div>
  )
}

function BlockRenderer({ block }: { block: ArticleBlock }) {
  switch (block.type) {
    case 'heading':
      return <HeadingBlock level={block.level} text={block.text} />
    case 'paragraph':
      return (
        <p className="text-sm leading-6 text-foreground/90">
          <InlineRenderer content={block.text} />
        </p>
      )
    case 'list':
      return <ListBlock ordered={block.ordered} items={block.items} />
    case 'code':
      return <CodeBlock lang={block.lang} code={block.code} />
    case 'callout':
      return <CalloutBlock tone={block.tone} text={block.text} />
    default:
      return null
  }
}

function HeadingBlock({ level, text }: { level: 2 | 3; text: string }) {
  if (level === 2) {
    return (
      <h2 className="mt-6 border-b border-border/40 pb-1.5 text-lg font-semibold tracking-tight text-foreground first:mt-0">
        {text}
      </h2>
    )
  }
  return <h3 className="mt-4 text-base font-semibold text-foreground">{text}</h3>
}

function ListBlock({ ordered, items }: { ordered?: boolean; items: InlineContent[][] }) {
  const Tag = ordered ? 'ol' : 'ul'
  return (
    <Tag className={cn('space-y-1.5 pl-5 text-sm leading-6 text-foreground/90', ordered ? 'list-decimal' : 'list-disc')}>
      {items.map((item, idx) => (
        <li key={idx}>
          <InlineRenderer content={item} />
        </li>
      ))}
    </Tag>
  )
}

function CodeBlock({ lang, code }: { lang?: string; code: string }) {
  return (
    <pre className="overflow-x-auto rounded-md border border-border/50 bg-muted/40 p-3">
      <code className={cn('font-mono text-xs leading-5 text-foreground/90', lang && `language-${lang}`)}>
        {code}
      </code>
    </pre>
  )
}

const calloutStyles = {
  info: {
    wrap: 'border-info/35 bg-info/10 text-foreground/90',
    icon: 'text-info',
    Icon: Info,
  },
  warning: {
    wrap: 'border-warning/40 bg-warning/10 text-foreground/90',
    icon: 'text-warning',
    Icon: AlertTriangle,
  },
  tip: {
    wrap: 'border-success/35 bg-success/10 text-foreground/90',
    icon: 'text-success',
    Icon: Lightbulb,
  },
} as const

function CalloutBlock({ tone, text }: { tone: 'info' | 'warning' | 'tip'; text: InlineContent[] }) {
  const style = calloutStyles[tone]
  const Icon = style.Icon
  return (
    <div className={cn('flex gap-2.5 rounded-lg border px-3.5 py-3 text-sm leading-6', style.wrap)}>
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', style.icon)} aria-hidden="true" />
      <div>
        <InlineRenderer content={text} />
      </div>
    </div>
  )
}

function InlineRenderer({ content }: { content: InlineContent[] }) {
  return (
    <>
      {content.map((item, idx) => (
        <InlineItem key={idx} item={item} />
      ))}
    </>
  )
}

function InlineItem({ item }: { item: InlineContent }): ReactNode {
  if (typeof item === 'string') {
    return <Fragment>{item}</Fragment>
  }

  switch (item.type) {
    case 'link':
      return <WikiLink articleId={item.articleId} label={item.label} />
    case 'extlink':
      return (
        <a
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 text-primary underline underline-offset-2 hover:text-primary/80"
        >
          {item.label}
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      )
    case 'code':
      return (
        <code className="rounded border border-border/50 bg-muted/50 px-1 py-0.5 font-mono text-[0.85em]">
          {item.text}
        </code>
      )
    case 'bold':
      return <strong className="font-semibold text-foreground">{item.text}</strong>
    default:
      return null
  }
}

function WikiLink({ articleId, label }: { articleId: string; label: string }) {
  return (
    <Link
      to={`/wiki/${articleId}`}
      className="text-primary underline underline-offset-2 hover:text-primary/80"
    >
      {label}
    </Link>
  )
}
