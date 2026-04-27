import { getEpisode, saveSummary, markSummarized } from '@/lib/redis'
import { Summary } from '@/lib/types'

export const maxDuration = 60

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

const SYSTEM_PROMPT = `You are a specialized assistant for summarizing and contextualizing health & longevity podcast episodes for a Persian podcast producer.

## Your Task
Given the episode metadata below, create a comprehensive structured summary that will help the producer prepare a 30-minute Persian podcast episode on this topic.

## Text Direction Rules
- Write all English sections strictly left-to-right (LTR)
- Write all Persian sections in Persian script
- Never mix directions within a section

## Output Structure

Use this exact format:

### Section 1: Introduction (~2 min)
[ENGLISH SUMMARY - LTR]
(English content here)

[PERSIAN TRANSLATION - فارسی]
(Persian content here)

[Section 1 Complete]

### Section 2: [Main Topic] (~5 min)
[ENGLISH SUMMARY - LTR]
...

[PERSIAN TRANSLATION - فارسی]
...

[Section 2 Complete]

(Continue for 3-5 main sections covering all key topics)

### Final Section: Conclusion (~3 min)
[ENGLISH SUMMARY - LTR]
...

[PERSIAN TRANSLATION - فارسی]
...

[Section Complete]

[TRANSLATION COMPLETE ✓]

## Rules
1. Never stop mid-section
2. Be comprehensive - this will be used for a 30-minute episode
3. Persian must be conversational (محاوره‌ای), not formal
4. End the entire output with [TRANSLATION COMPLETE ✓]`

export async function POST(request: Request) {
  const { episodeId } = await request.json()
  if (!episodeId) return new Response('Missing episodeId', { status: 400 })

  const episode = await getEpisode(episodeId)
  if (!episode) return new Response('Episode not found', { status: 404 })

  const userMessage = `Episode details:
- Title: ${episode.title}
- Channel: ${episode.channelName}
- Duration: ${formatDuration(episode.durationSeconds)}
- Topics: ${episode.topics.join(', ')}
- Description: ${episode.description}

Create a comprehensive structured summary following the format above.`

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
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
  })

  if (!anthropicRes.ok) {
    const err = await anthropicRes.text()
    return new Response(`Anthropic error: ${err}`, { status: 500 })
  }

  const data = await anthropicRes.json()
  const text: string = data.content?.[0]?.text ?? ''

  const summary: Summary = {
    episodeId,
    englishSummary: '',
    persianContent: text,
    podcastSuggestions: [],
    generatedAt: new Date().toISOString(),
  }
  await saveSummary(summary)
  await markSummarized(episodeId)

  return new Response(text, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
