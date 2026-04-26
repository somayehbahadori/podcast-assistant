import { getEpisode, saveSummary, markSummarized } from '@/lib/redis'
import { Summary } from '@/lib/types'

export const maxDuration = 60

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export async function POST(request: Request) {
  const { episodeId } = await request.json()
  if (!episodeId) return new Response('Missing episodeId', { status: 400 })

  const episode = await getEpisode(episodeId)
  if (!episode) return new Response('Episode not found', { status: 404 })

  const prompt = `You are a research assistant for a Persian health and longevity podcast producer.

Episode details:
- Title: ${episode.title}
- Channel: ${episode.channelName}
- Duration: ${formatDuration(episode.durationSeconds)}
- Topics: ${episode.topics.join(', ')}
- Description: ${episode.description}

Produce a JSON response with these exact keys:
1. "englishSummary": A structured English summary with key points, main recommendations, and any notable quotes or claims. Be precise with numbers and scientific claims.
2. "persianContent": A comprehensive, flowing Persian text (محاوره‌ای نه رسمی) that fully covers all major points from the episode. This must be written as continuous paragraphs — NOT bullet points or lists. Include: the main idea explained in full, all key points with context, practical recommendations with their reasoning, and any notable quotes (attributed to the speaker) woven into the text naturally.
3. "podcastSuggestions": An array of exactly 2-3 strings, each a distinct angle or question the Persian podcast host could explore based on this content.

Respond ONLY with valid JSON, no markdown code blocks.`

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!anthropicRes.ok) {
    const err = await anthropicRes.text()
    return new Response(`Anthropic error: ${err}`, { status: 500 })
  }

  const data = await anthropicRes.json()
  const text: string = data.content?.[0]?.text ?? ''

  try {
    const parsed = JSON.parse(text)
    const summary: Summary = {
      episodeId,
      englishSummary: parsed.englishSummary ?? '',
      persianContent: parsed.persianContent ?? '',
      podcastSuggestions: parsed.podcastSuggestions ?? [],
      generatedAt: new Date().toISOString(),
    }
    await saveSummary(summary)
  } catch {
    const summary: Summary = {
      episodeId,
      englishSummary: '',
      persianContent: text,
      podcastSuggestions: [],
      generatedAt: new Date().toISOString(),
    }
    await saveSummary(summary)
  }

  await markSummarized(episodeId)

  return new Response(text, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
