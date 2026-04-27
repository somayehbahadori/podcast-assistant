import { getEpisode, saveSummary, markSummarized } from '@/lib/redis'
import { Summary } from '@/lib/types'

export const maxDuration = 60

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

const SYSTEM_PROMPT = `You are a specialized assistant for summarizing and contextualizing health & longevity podcast episodes for a Persian podcast producer.

## Summary Length Rules
- Summary length must be proportional to the video duration — the longer the video, the more comprehensive and complete the summary
- The minimum length must provide enough content to produce a podcast of AT LEAST 30 minutes — include every key point, argument, example, and important detail
- No usable information should be omitted; the producer relies entirely on this summary to record the episode

## Work Process
For each section or chapter of the episode:
1. First write a detailed summary in English (the original language of the content)
2. Then translate that same summary into fluent, natural Persian suitable for a Persian podcast

## Output Structure

Use this exact format for each section:

### Section 1: Introduction
[ENGLISH SUMMARY - LTR]
(Detailed narrative English summary — continuous prose, not bullet points)

[PERSIAN TRANSLATION - فارسی]
(Fluent conversational Persian translation of the above)

[Section 1 Complete]

### Section 2: [Topic Name]
[ENGLISH SUMMARY - LTR]
...

[PERSIAN TRANSLATION - فارسی]
...

[Section 2 Complete]

(Continue for all sections/topics in the episode)

### Final Section: Conclusion
[ENGLISH SUMMARY - LTR]
...

[PERSIAN TRANSLATION - فارسی]
...

[Section Complete]

[TRANSLATION COMPLETE ✓]

## Rules
1. Structure must be narrative continuous prose — NOT bullet lists — so it is ready to be converted to a podcast script
2. Persian translation must be conversational and natural (گفتاری و طبیعی), not literary or overly formal
3. If the episode has multiple chapters or topics, summarize each one as a separate section
4. Never stop mid-section
5. End the entire output with [TRANSLATION COMPLETE ✓]`

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
      stream: true,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
  })

  if (!anthropicRes.ok) {
    const err = await anthropicRes.text()
    return new Response(`Anthropic error: ${err}`, { status: 500 })
  }

  const reader = anthropicRes.body!.getReader()
  const decoder = new TextDecoder()
  let fullText = ''

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6).trim()
            if (!data || data === '[DONE]') continue
            try {
              const parsed = JSON.parse(data)
              if (
                parsed.type === 'content_block_delta' &&
                parsed.delta?.type === 'text_delta'
              ) {
                const text: string = parsed.delta.text
                fullText += text
                controller.enqueue(encoder.encode(text))
              }
            } catch {
              // ignore malformed SSE lines
            }
          }
        }
      } finally {
        // Save to Redis before closing — runs even if an error occurred
        const summary: Summary = {
          episodeId,
          englishSummary: '',
          persianContent: fullText,
          podcastSuggestions: [],
          generatedAt: new Date().toISOString(),
        }
        try {
          await saveSummary(summary)
          await markSummarized(episodeId)
        } catch {
          // Redis failure should not break the response
        }
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
