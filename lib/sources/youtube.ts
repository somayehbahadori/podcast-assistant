import { Episode } from '@/lib/types'
import { HEALTH_KEYWORDS, PODCAST_SOURCES } from './config'

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3'

function matchesHealthTopic(text: string): string[] {
  const lower = text.toLowerCase()
  return HEALTH_KEYWORDS.filter(kw => lower.includes(kw))
}

async function getUploadsPlaylistId(channelId: string, apiKey: string): Promise<string | null> {
  const res = await fetch(
    `${YOUTUBE_API_BASE}/channels?part=contentDetails&id=${channelId}&key=${apiKey}`
  )
  const data = await res.json()
  return data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads ?? null
}

async function fetchRecentUploads(
  playlistId: string,
  apiKey: string,
  publishedAfter: Date
): Promise<{ videoId: string; title: string; description: string; publishedAt: string; thumbnailUrl: string }[]> {
  const res = await fetch(
    `${YOUTUBE_API_BASE}/playlistItems?part=snippet&maxResults=10&playlistId=${playlistId}&key=${apiKey}`
  )
  const data = await res.json()
  if (!data.items) return []

  return data.items
    .filter((item: any) => new Date(item.snippet.publishedAt) >= publishedAfter)
    .map((item: any) => ({
      videoId: item.snippet.resourceId.videoId,
      title: item.snippet.title,
      description: item.snippet.description ?? '',
      publishedAt: item.snippet.publishedAt,
      thumbnailUrl: item.snippet.thumbnails?.medium?.url ?? '',
    }))
}

async function getVideoDuration(videoId: string, apiKey: string): Promise<number> {
  const res = await fetch(
    `${YOUTUBE_API_BASE}/videos?part=contentDetails&id=${videoId}&key=${apiKey}`
  )
  const data = await res.json()
  const iso = data.items?.[0]?.contentDetails?.duration ?? 'PT0S'
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!match) return 0
  return (parseInt(match[1] ?? '0') * 3600) + (parseInt(match[2] ?? '0') * 60) + parseInt(match[3] ?? '0')
}

export async function fetchYouTubeEpisodes(publishedAfter: Date): Promise<Episode[]> {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) throw new Error('YOUTUBE_API_KEY not set')

  const episodes: Episode[] = []

  for (const source of PODCAST_SOURCES) {
    if (!source.youtubeChannelId) continue
    try {
      const playlistId = await getUploadsPlaylistId(source.youtubeChannelId, apiKey)
      if (!playlistId) continue

      const uploads = await fetchRecentUploads(playlistId, apiKey, publishedAfter)

      for (const upload of uploads) {
        const topics = matchesHealthTopic(upload.title + ' ' + upload.description)
        if (topics.length === 0) continue

        const durationSeconds = await getVideoDuration(upload.videoId, apiKey)

        episodes.push({
          id: `youtube-${upload.videoId}`,
          platform: 'youtube',
          channelName: source.name,
          title: upload.title,
          description: upload.description.slice(0, 500),
          publishedAt: upload.publishedAt,
          durationSeconds,
          url: `https://www.youtube.com/watch?v=${upload.videoId}`,
          thumbnailUrl: upload.thumbnailUrl,
          topics,
          summarized: false,
        })
      }
    } catch (err) {
      console.error(`YouTube fetch failed for ${source.name}:`, err)
    }
  }

  return episodes
}
