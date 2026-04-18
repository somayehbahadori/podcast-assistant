import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getEpisode, getSummary } from '@/lib/redis'
import SummaryView from '@/components/SummaryView'
import SummarizeButton from '@/components/SummarizeButton'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

interface Props {
  params: Promise<{ id: string }>
}

function formatDuration(s: number): string {
  if (!s) return '—'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default async function EpisodePage({ params }: Props) {
  const { id } = await params
  const episodeId = decodeURIComponent(id)

  const [episode, summary] = await Promise.all([
    getEpisode(episodeId),
    getSummary(episodeId),
  ])

  if (!episode) notFound()

  return (
    <main className="min-h-screen p-4 md:p-8" dir="rtl">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← بازگشت به فهرست
          </Link>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <Badge variant={episode.platform === 'youtube' ? 'default' : 'outline'}>
              {episode.platform === 'youtube' ? 'یوتیوب' : 'پادکست'}
            </Badge>
            <span className="text-sm text-muted-foreground">{episode.channelName}</span>
            <span className="text-sm text-muted-foreground">·</span>
            <span className="text-sm text-muted-foreground">
              {new Date(episode.publishedAt).toLocaleDateString('fa-IR', {
                year: 'numeric', month: 'long', day: 'numeric',
              })}
            </span>
            <span className="text-sm text-muted-foreground">·</span>
            <span className="text-sm text-muted-foreground">{formatDuration(episode.durationSeconds)}</span>
          </div>

          <h1 className="text-xl font-bold leading-tight">{episode.title}</h1>

          {episode.topics.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {episode.topics.map(t => (
                <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
              ))}
            </div>
          )}

          {episode.description && (
            <p className="text-sm text-muted-foreground leading-6 line-clamp-3">{episode.description}</p>
          )}

          <a
            href={episode.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex text-sm text-primary hover:underline"
          >
            مشاهده اپیزود اصلی ↗
          </a>
        </div>

        <Separator />

        {summary ? (
          <SummaryView summary={summary} />
        ) : (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">خلاصه‌سازی و ترجمه</h2>
              <p className="text-sm text-muted-foreground mt-1">
                این اپیزود هنوز خلاصه‌سازی نشده. با کلیک روی دکمه زیر خلاصه فارسی تولید کنید.
              </p>
            </div>
            <SummarizeButton episodeId={episodeId} />
          </div>
        )}
      </div>
    </main>
  )
}
