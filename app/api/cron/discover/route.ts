import { fetchYouTubeEpisodes } from '@/lib/sources/youtube'
import { fetchRSSEpisodes } from '@/lib/sources/rss'
import { saveEpisode, episodeExists } from '@/lib/redis'

export const maxDuration = 60

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const hours = parseInt(new URL(request.url).searchParams.get('hours') ?? '72')
  const publishedAfter = new Date(Date.now() - hours * 60 * 60 * 1000)

  const [youtubeEpisodes, rssEpisodes] = await Promise.allSettled([
    fetchYouTubeEpisodes(publishedAfter),
    fetchRSSEpisodes(publishedAfter),
  ])

  const allEpisodes = [
    ...(youtubeEpisodes.status === 'fulfilled' ? youtubeEpisodes.value : []),
    ...(rssEpisodes.status === 'fulfilled' ? rssEpisodes.value : []),
  ]

  let newCount = 0
  for (const episode of allEpisodes) {
    const exists = await episodeExists(episode.id)
    if (!exists) {
      await saveEpisode(episode)
      newCount++
    }
  }

  return Response.json({ ok: true, newEpisodes: newCount, total: allEpisodes.length })
}
