import { Redis } from '@upstash/redis'
import { Episode, Summary } from './types'

function getRedis() {
  return Redis.fromEnv()
}

const EPISODES_KEY = 'episodes:recent'
const MAX_EPISODES = 200

export async function saveEpisode(episode: Episode): Promise<void> {
  const redis = getRedis()
  const key = `episode:${episode.id}`
  const score = new Date(episode.publishedAt).getTime()

  await Promise.all([
    redis.set(key, episode),
    redis.zadd(EPISODES_KEY, { score, member: episode.id }),
  ])

  const count = await redis.zcard(EPISODES_KEY)
  if (count > MAX_EPISODES) {
    const toRemove = count - MAX_EPISODES
    await redis.zpopmin(EPISODES_KEY, toRemove)
  }
}

export async function episodeExists(id: string): Promise<boolean> {
  const redis = getRedis()
  return (await redis.exists(`episode:${id}`)) === 1
}

export async function getEpisodes(limit = 50, offset = 0): Promise<Episode[]> {
  const redis = getRedis()
  const ids = await redis.zrange(EPISODES_KEY, offset, offset + limit - 1, { rev: true }) as string[]
  if (!ids.length) return []

  const pipeline = redis.pipeline()
  for (const id of ids) pipeline.get(`episode:${id}`)
  const results = await pipeline.exec()

  return (results as (Episode | null)[]).filter((e): e is Episode => e !== null)
}

export async function getEpisode(id: string): Promise<Episode | null> {
  const redis = getRedis()
  return redis.get<Episode>(`episode:${id}`)
}

export async function markSummarized(id: string): Promise<void> {
  const redis = getRedis()
  const episode = await getEpisode(id)
  if (!episode) return
  await redis.set(`episode:${id}`, { ...episode, summarized: true })
}

export async function saveSummary(summary: Summary): Promise<void> {
  const redis = getRedis()
  await redis.set(`summary:${summary.episodeId}`, summary)
}

export async function getSummary(episodeId: string): Promise<Summary | null> {
  const redis = getRedis()
  return redis.get<Summary>(`summary:${episodeId}`)
}
