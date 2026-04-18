import Parser from 'rss-parser'
import { Episode } from '@/lib/types'
import { HEALTH_KEYWORDS, PODCAST_SOURCES } from './config'

const parser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'PodcastResearchBot/1.0' },
})

function matchesHealthTopic(text: string): string[] {
  const lower = text.toLowerCase()
  return HEALTH_KEYWORDS.filter(kw => lower.includes(kw))
}

function parseDuration(duration?: string): number {
  if (!duration) return 0
  const parts = duration.split(':').map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return Number(duration) || 0
}

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)
}

export async function fetchRSSEpisodes(publishedAfter: Date): Promise<Episode[]> {
  const episodes: Episode[] = []

  for (const source of PODCAST_SOURCES) {
    if (!source.rssFeedUrl) continue
    try {
      const feed = await parser.parseURL(source.rssFeedUrl)

      for (const item of feed.items ?? []) {
        const pubDate = item.isoDate ? new Date(item.isoDate) : item.pubDate ? new Date(item.pubDate) : null
        if (!pubDate || pubDate < publishedAfter) continue

        const title = item.title ?? ''
        const description = (item.contentSnippet ?? item.content ?? '').slice(0, 500)
        const topics = matchesHealthTopic(title + ' ' + description)
        if (topics.length === 0) continue

        const id = `rss-${slugify(source.name)}-${slugify(title)}-${pubDate.getTime()}`

        episodes.push({
          id,
          platform: 'rss',
          channelName: source.name,
          title,
          description,
          publishedAt: pubDate.toISOString(),
          durationSeconds: parseDuration((item as any).itunes?.duration),
          url: item.link ?? item.guid ?? '',
          thumbnailUrl: (item as any).itunes?.image ?? feed.image?.url,
          topics,
          summarized: false,
        })
      }
    } catch (err) {
      console.error(`RSS fetch failed for ${source.name}:`, err)
    }
  }

  return episodes
}
