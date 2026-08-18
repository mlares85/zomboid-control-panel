import { useParams } from 'react-router-dom'
import { BookOpen } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { WikiHome } from '@/components/wiki/WikiHome'
import { WikiArticleView } from '@/components/wiki/WikiArticleView'
import { WikiSearch } from '@/components/wiki/WikiSearch'

export default function Wiki() {
  const { articleId } = useParams<{ articleId?: string }>()

  return (
    <div className="page-transition space-y-4 pb-12">
      <PageHeader
        title="Help & Wiki"
        description="Guides and reference docs for setting up and running your server."
        icon={<BookOpen className="h-5 w-5" />}
        eyebrow="// SYSTEM · HELP"
        actions={<WikiSearch className="w-64" />}
      />

      {articleId ? <WikiArticleView articleId={articleId} /> : <WikiHome />}
    </div>
  )
}
