import { getEpisode, saveSummary, markSummarized } from '@/lib/redis'
import { Summary } from '@/lib/types'

export const maxDuration = 60

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

async function fetchYouTubeTranscript(videoId: string): Promise<string> {
  try {
    const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    if (!pageRes.ok) return ''
    const html = await pageRes.text()

    // Find the captionTracks array in the page data
    const idx = html.indexOf('"captionTracks":')
    if (idx === -1) return ''

    const arrayStart = html.indexOf('[', idx)
    if (arrayStart === -1) return ''

    // Walk forward counting [ ] to find the matching close bracket
    let depth = 0
    let arrayEnd = -1
    for (let i = arrayStart; i < Math.min(html.length, arrayStart + 50000); i++) {
      if (html[i] === '[') depth++
      else if (html[i] === ']') {
        depth--
        if (depth === 0) { arrayEnd = i; break }
      }
    }
    if (arrayEnd === -1) return ''

    const tracks = JSON.parse(html.slice(arrayStart, arrayEnd + 1))
    if (!Array.isArray(tracks) || !tracks.length) return ''

    // Prefer manual English captions, then auto-generated English, then first available
    const track =
      tracks.find((t: { languageCode?: string; kind?: string }) => t.languageCode === 'en' && !t.kind) ||
      tracks.find((t: { languageCode?: string }) => t.languageCode === 'en') ||
      tracks[0]

    if (!track?.baseUrl) return ''

    const transcriptRes = await fetch(track.baseUrl + '&fmt=json3')
    if (!transcriptRes.ok) return ''

    const data = await transcriptRes.json()
    const text: string = (data.events as Array<{ segs?: Array<{ utf8: string }> }>)
      ?.filter(e => e.segs)
      .map(e => e.segs!.map(s => s.utf8).join(''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim() ?? ''

    // Cap at ~40 000 chars (~10 000 tokens) so we stay within context limits
    return text.slice(0, 40000)
  } catch {
    return ''
  }
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

  // Fetch the actual transcript for YouTube episodes
  let transcript = ''
  if (episode.platform === 'youtube') {
    try {
      const videoId = new URL(episode.url).searchParams.get('v') ?? ''
      if (videoId) transcript = await fetchYouTubeTranscript(videoId)
    } catch {
      // fall through to description-only
    }
  }

  const userMessage = transcript
    ? `Episode details:
- Title: ${episode.title}
- Channel: ${episode.channelName}
- Duration: ${formatDuration(episode.durationSeconds)}
- Topics: ${episode.topics.join(', ')}

Full transcript:
${transcript}

Summarize the actual transcript above following the format in your instructions.`
    : `Episode details:
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
      model: 'claude-haiku-4-5-20251001',
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
